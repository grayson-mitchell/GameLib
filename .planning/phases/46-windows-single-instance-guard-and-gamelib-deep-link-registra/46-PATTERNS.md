# Phase 46: Windows single-instance guard and gamelib:// deep-link registration - Pattern Map

**Mapped:** 2026-09-22
**Files analyzed:** 5 (1 modified Rust source file carrying ~6 distinct additions, 1 modified Cargo.toml, 1 modified tauri.windows.conf.json, 2 modified/inverted Jest test files)
**Analogs found:** 6 / 6 (this phase modifies existing files in place; there are no wholly new files — every addition has a direct sibling to mirror inside the same files)

This phase adds no new files. Every planned change lands inside `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.windows.conf.json`, and two existing Jest test files. Because of that, "closest analog" below always means "the existing Unix/Linux/macOS sibling of the exact same construct inside the same file," not a different file entirely — this is a straight structural port, which the research (`46-RESEARCH.md`) states explicitly: "the Windows guard is not a parallel design, it is the same design with two OS-specific primitives substituted in."

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog (same file unless noted) | Match Quality |
|---|---|---|---|---|
| `src-tauri/src/main.rs` — Wave 0: `#[cfg(target_os = "macos")]` on 4 test fns | test | N/A (compile-fix) | Existing `#[cfg(target_os = "macos")]` gate pattern used throughout the file (e.g. line 2833, 2915-2934) | exact |
| `src-tauri/src/main.rs` — `windows_single_instance_user`/`windows_mutex_name`/`windows_pipe_name` (pure name derivation) | utility | transform | `single_instance_dir(home: Option<&str>)` (`main.rs:8108`) | exact |
| `src-tauri/src/main.rs` — `SingleInstanceRole` Windows arm / `acquire_single_instance_windows` (mutex+pipe acquisition) | service | event-driven | `SingleInstanceRole` enum + `acquire_single_instance` (`main.rs:8174-8223`, `#[cfg(unix)]`) | exact |
| `src-tauri/src/main.rs` — `main()` pre-`Builder` Windows guard block (mutex acquire, secondary fail-open exit) | controller (bootstrap) | request-response | `main()`'s existing `#[cfg(unix)]` guard block (`main.rs:8768-8838`) | exact |
| `src-tauri/src/main.rs` — `.setup()` named-pipe accept-loop thread | service | streaming | `.setup()`'s existing `#[cfg(unix)] if let Some(listener) = primary_listener { thread::spawn(...) }` accept loop (`main.rs:8926-8993`) | exact |
| `src-tauri/src/main.rs` — Windows arm of `configure_sidecar_process_group`/`shutdown_child` (informational only — unaffected but adjacent) | service | event-driven | `#[cfg(not(unix))]` arms already present (`main.rs:1229-1234`, `8264-8265`) | exact (no change needed, reference only) |
| `src-tauri/src/main.rs` — `#[cfg(test)] mod tests` additions (`windows_single_instance_user_*`, pipe-payload region tests) | test | transform | `single_instance_dir_returns_none_without_a_home` / `single_instance_socket_path_is_under_the_given_dir` (`main.rs:12785-12800`) and the `protocol_url_arg_*` group (`main.rs:12554-12629`) | exact |
| `src-tauri/Cargo.toml` — `[target.'cfg(windows)'.dependencies]` for `windows-sys` | config | N/A | `[target.'cfg(unix)'.dependencies]` (`Cargo.toml:234-235`) and `[target.'cfg(target_os = "macos")'.dependencies]` (`Cargo.toml:114-220`) | exact |
| `src-tauri/tauri.windows.conf.json` — remove `plugins.deep-link.desktop.schemes: []` override | config | N/A | The override itself (being removed), added by quick task `260922-nx4` | exact (inverse operation) |
| `src/backend/__tests__/windowsDeepLinkSuppression.test.ts` — invert Tests A and E | test | transform | Same file's own Tests A/E (`windowsDeepLinkSuppression.test.ts:126-172`) | exact |
| `src/backend/__tests__/tauriShellSource.test.ts` — new positive/region tokens for the Windows guard + `on_open_url`-inside-`.setup()` structural test | test | transform | The `describe('Phase 34.5 gap cycle 6 plan 44 ...')` block (`tauriShellSource.test.ts:2195-2266`) and `cfgGuardAboveRegisterAll` (`tauriShellSource.test.ts:2344-2382`) | exact |

## Pattern Assignments

### Wave 0: fix the pre-existing `cargo test` compile break

**Analog:** existing `#[cfg(target_os = "macos")]` gate convention used throughout `main.rs` (e.g. `main.rs:2833`, `2915-2934`, `3089-3557`).

**Target functions to gate** (`main.rs:9757-9793`, inside `#[cfg(test)] mod tests`, which starts at `main.rs:9729`):
```rust
#[test]
fn store_embed_wire_contract_open_parses_the_shipped_payload() { ... }   // main.rs:9758

#[test]
fn store_embed_wire_contract_set_bounds_parses_the_shipped_payload() { ... } // main.rs:9766

#[test]
fn store_embed_wire_contract_navigate_parses_the_shipped_payload() { ... }   // main.rs:9773

#[test]
fn store_embed_wire_contract_rejects_the_positional_shape_that_shipped() { ... } // main.rs:9782
```

**Fix pattern** — add `#[cfg(target_os = "macos")]` directly above each `#[test]`, matching the exact two-line stacking convention already used elsewhere in the file, e.g.:
```rust
#[cfg(target_os = "macos")]
#[test]
fn store_embed_wire_contract_open_parses_the_shipped_payload() {
```
This is a Wave 0 prerequisite (REQ-46-09) — `cargo test --bin gamelib-shell --no-run` must compile before any of this phase's own tests can run, since the binary has no separate lib target and one compile error blocks every test in the file.

---

### `src-tauri/src/main.rs` — pure name-derivation helpers (`windows_single_instance_user`/`windows_mutex_name`/`windows_pipe_name`)

**Analog:** `single_instance_dir(home: Option<&str>)` (`main.rs:8102-8120`)

**Pattern to copy** — explicit-parameter discipline (never read `std::env::var` internally), `Option`-returning so callers can fall back to fail-open:
```rust
/// Resolves the directory the single-instance socket lives in, from an explicit `home`
/// parameter rather than reading `std::env::var` internally -- mirrors
/// `resolve_dev_app_root`'s own doc comment (below) on why: neither this file's
/// `#[cfg(test)] mod tests` nor a parallel `cargo test` run may mutate process-global env
/// vars. Returns `None` when `home` is `None` or empty, so callers can fall back to running
/// without a guard (fail open, T-34.5-G6-24) rather than crash.
fn single_instance_dir(home: Option<&str>) -> Option<std::path::PathBuf> {
    let home = home.filter(|h| !h.is_empty())?;
    let base = std::path::Path::new(home);
    if cfg!(target_os = "macos") {
        Some(base.join("Library").join("Application Support").join("gamelib"))
    } else {
        Some(base.join(".config").join("gamelib"))
    }
}
```
(`main.rs:8102-8120`)

**Companion pure path-join** to mirror for `windows_pipe_name`/`windows_mutex_name`:
```rust
/// Pure path join, no I/O -- the single-instance guard's Unix socket file, always named
/// identically inside whatever directory `single_instance_dir` resolves.
fn single_instance_socket_path(app_support_dir: &std::path::Path) -> std::path::PathBuf {
    app_support_dir.join("gamelib-single-instance.sock")
}
```
(`main.rs:8096-8100`)

**RESEARCH.md's own recommended shape** (Code Examples section, `46-RESEARCH.md:371-385`) to implement against this exact analog discipline:
```rust
fn windows_single_instance_user(username: Option<&str>) -> Option<String> {
    let username = username.filter(|u| !u.is_empty())?;
    Some(username.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect())
}
fn windows_mutex_name(username: Option<&str>) -> Option<String> {
    windows_single_instance_user(username).map(|u| format!(r"Local\gamelib-single-instance-{u}"))
}
fn windows_pipe_name(username: Option<&str>) -> Option<String> {
    windows_single_instance_user(username).map(|u| format!(r"\\.\pipe\gamelib-single-instance-{u}"))
}
```
These three should NOT be `#[cfg(windows)]`-gated — mirror `single_instance_dir`'s cross-platform testability so `cargo test` on macOS/Linux CI runners still proves the name derivation.

---

### `src-tauri/src/main.rs` — `SingleInstanceRole` Windows variant + `acquire_single_instance_windows`

**Analog:** `SingleInstanceRole` enum + `acquire_single_instance` (`main.rs:8159-8223`)

**Full existing enum + doc comment to mirror the shape (not the body) of:**
```rust
// ---- Single-instance guard (Phase 34.5 gap cycle 6 plan 44, D-44-A) -----------------------
//
// Hand-rolled, std-only, Unix-only. No crate is added (`tauri-plugin-single-instance` is
// rejected -- see the plan's own decision record D-44-A): a plugin-based guard cannot run
// before `tauri::Builder::default()`, so a secondary process would still reach `.setup()` and
// spawn its own sidecar before the plugin could ever tell it "you are secondary". This guard
// runs at the very top of `main()`, before the builder is even constructed, so a secondary
// process's `std::process::exit(0)` fires before `spawn_sidecar` can ever be called.

/// Outcome of a single-instance acquisition attempt. `Primary` holds the bound listener the
/// accept loop in `main()`'s `.setup()` closure will service; `PrimaryWithoutListener` behaves
/// identically to a primary process (spawns the sidecar, opens the window) but has no socket
/// to accept connections on -- the FAIL-OPEN path (T-34.5-G6-24) for every recoverable
/// failure: no resolvable home directory, a directory-creation failure, or a bind failure.
/// `Secondary` means another instance is already alive and listening.
#[cfg(unix)]
enum SingleInstanceRole {
    Primary(std::os::unix::net::UnixListener),
    PrimaryWithoutListener,
    Secondary,
}
```
(`main.rs:8159-8179`)

```rust
#[cfg(unix)]
fn acquire_single_instance(socket_path: &std::path::Path) -> SingleInstanceRole {
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::net::{UnixListener, UnixStream};

    if UnixStream::connect(socket_path).is_ok() {
        return SingleInstanceRole::Secondary;
    }
    let _ = std::fs::remove_file(socket_path);
    match UnixListener::bind(socket_path) {
        Ok(listener) => {
            if let Err(e) = std::fs::set_permissions(socket_path, std::fs::Permissions::from_mode(0o600)) {
                eprintln!("[shell] WARN: failed to set single-instance socket permissions to 0600: {e}");
            }
            SingleInstanceRole::Primary(listener)
        }
        Err(e) => {
            eprintln!("[shell] WARN: single-instance socket bind failed ({e}) -- continuing as primary without a listener (fail-open, T-34.5-G6-24)");
            SingleInstanceRole::PrimaryWithoutListener
        }
    }
}
```
(`main.rs:8195-8223`)

**What changes structurally for Windows** (per `46-RESEARCH.md` Q1/Q4/Architecture Patterns): add a `#[cfg(windows)]` sibling `enum`/`fn` pair — `SingleInstanceRole` gains a Windows-only variant shape (`Primary(HANDLE /* named pipe server */)`, `PrimaryWithoutListener`, `Secondary`), and `acquire_single_instance_windows(mutex_name, pipe_name) -> SingleInstanceRole` replaces "connect-first, bind-second, remove stale socket" with "`CreateMutexW`, check `GetLastError() == ERROR_ALREADY_EXISTS`" — no stale-file removal branch exists on Windows (see research Q1: kernel-object lifetime is self-cleaning). Fail-open discipline (`PrimaryWithoutListener` on any recoverable failure, never a hard error) must be preserved identically.

**Existing accepted-gap comment to retire/replace** (currently sits right after `acquire_single_instance`, `main.rs:8225-8228`):
```rust
// D-44-A accepted cost, ledger row `U-34.5-18`: `std::os::unix::net` has no non-unix
// equivalent, so `acquire_single_instance` is never called on a non-unix target at all (see
// `main()`'s `#[cfg(not(unix))]` arm below) -- Windows keeps TODAY's behaviour (a second
// launch starts a second instance), a named, accepted gap, not a silent regression.
```
This comment documents the exact gap this phase closes — the planner should point at it as the thing being retired, and the new Windows implementation's own doc comment should explain the self-cleaning-mutex divergence from the Unix stale-socket branch in its place (research Q1, State of the Art table).

---

### `src-tauri/src/main.rs` — `main()`'s pre-`Builder` guard block (Windows secondary-path fail-open exit)

**Analog:** the existing `#[cfg(unix)]` block inside `main()` (`main.rs:8752-8840`)

**Full block to mirror (structure), especially the fail-open `exit(0)` regardless of delivery outcome:**
```rust
fn main() {
    install_panic_hook();

    let argv: Vec<String> = std::env::args().skip(1).collect();
    let no_gui = cli_no_gui(&argv);

    #[cfg(unix)]
    let single_instance_socket_path_var: Option<std::path::PathBuf> = { /* dir creation, 0700 perms, fail-open on error -- main.rs:8768-8801 */ };
    #[cfg(not(unix))]
    let single_instance_socket_path_var: Option<std::path::PathBuf> = None;

    #[cfg(unix)]
    let primary_listener: Option<std::os::unix::net::UnixListener> = single_instance_socket_path_var
        .as_deref()
        .and_then(|path| match acquire_single_instance(path) {
            SingleInstanceRole::Secondary => {
                use std::io::Write as _;
                use std::os::unix::net::UnixStream;
                let (payload, kind) = match protocol_url_arg(&argv) {
                    Some(url) => (url, "deep-link"),
                    None => ("__GAMELIB_FOCUS__".to_string(), "focus sentinel"),
                };
                eprintln!("[shell] another GameLib instance is already running -- sending {kind} to it and exiting");
                match UnixStream::connect(path) {
                    Ok(mut stream) => { let _ = writeln!(stream, "{payload}"); let _ = stream.flush(); }
                    Err(e) => eprintln!("[shell] WARN: secondary instance failed to deliver {kind} to the running instance: {e}"),
                }
                std::process::exit(0);
            }
            SingleInstanceRole::Primary(listener) => Some(listener),
            SingleInstanceRole::PrimaryWithoutListener => None,
        });
    #[cfg(not(unix))]
    let primary_listener: Option<()> = None;

    tauri::Builder::default()
        // ... .plugin(...) chain, unchanged ...
        .setup(move |app| { /* spawn_sidecar, then accept-loop thread, then on_open_url, then register_all() */ })
```
(`main.rs:8752-8842`, with the `#[cfg(unix)]` arms at `8768-8838`)

**What changes for Windows:** add a `#[cfg(windows)]` sibling to `single_instance_socket_path_var`/`primary_listener` (a `windows_mutex_name`/`windows_pipe_name`-derived pair instead of a filesystem dir), and a `#[cfg(windows)]` `Secondary` arm that mirrors the `#[cfg(unix)]` one line-for-line: same `protocol_url_arg(&argv)` → `__GAMELIB_FOCUS__` fallback decision, same "warn on delivery failure, never treat it as fatal" pattern, same unconditional `std::process::exit(0)`. The `#[cfg(not(unix))]` fallback arms (currently `None`/`Option<()>`) become `#[cfg(not(any(unix, windows)))]` once Windows gets its own arm, so no third platform silently loses the `let` binding's type.

**Username source for `windows_mutex_name`/`windows_pipe_name`:** use `std::env::var("USERNAME").ok()` (Windows' env-var equivalent of `HOME` on Unix) as the parameter passed in, matching `single_instance_socket_path_var`'s own `std::env::var("HOME").ok().as_deref()` call shape at `main.rs:8771`.

---

### `src-tauri/src/main.rs` — `.setup()` named-pipe accept-loop thread

**Analog:** the existing Unix accept loop (`main.rs:8922-8993`)

**Full block to mirror structurally:**
```rust
#[cfg(unix)]
if let Some(listener) = primary_listener {
    let accept_state = state.clone();
    let accept_app_handle = app.handle().clone();
    thread::spawn(move || {
        for incoming in listener.incoming() {
            let stream = match incoming {
                Ok(s) => s,
                Err(e) => { eprintln!("[shell] WARN: single-instance accept() failed: {e}"); continue; }
            };
            let mut reader = BufReader::new(stream.take(4096));
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => continue,
                Ok(_) => {}
            }
            let trimmed = line.trim();

            if trimmed == "__GAMELIB_FOCUS__" {
                let focus_handle = accept_app_handle.clone();
                let _ = accept_app_handle.run_on_main_thread(move || {
                    if let Some(window) = focus_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
                continue;
            }

            match protocol_url_arg(&[trimmed.to_string()]) {
                Some(url) => {
                    match accept_state.invoke("handleProtocolUrl".to_string(), vec![Value::String(url)]) {
                        Ok(_) => eprintln!("[shell] delivered single-instance deep link to sidecar: ok"),
                        Err(e) => eprintln!("[shell] delivered single-instance deep link to sidecar: err={e}"),
                    }
                }
                None => {
                    eprintln!("[shell] rejected single-instance payload (failed protocol_url_arg validation), bytes={}", trimmed.len());
                }
            }
        }
    });
}
#[cfg(not(unix))]
let _ = &primary_listener;
```
(`main.rs:8926-8995`)

**What changes for Windows:** the accept loop swaps `listener.incoming()` (a Rust std iterator) for a hand-rolled `loop { ConnectNamedPipe(...); ... }` using `windows-sys` (per research Q4, including the `ERROR_PIPE_CONNECTED` special-case), but everything AFTER the connection is accepted must be byte-for-byte identical in intent: bounded 4096-byte read, `__GAMELIB_FOCUS__` sentinel check with the same `run_on_main_thread` focus dance, and the SAME `protocol_url_arg(&[trimmed.to_string()])` re-validation call before any dispatch to the sidecar. The rejection log line (`bytes={}`, never the payload) must be copied verbatim per T-34.5-G6-25 — this is the exact line the TS source-gate region test should assert exists near the new Windows accept-loop function (see the TS pattern section below).

**Load-bearing constraint from research Q4:** create the named pipe object during mutex acquisition (pre-`Builder`), but do not start the blocking accept-loop thread until inside `.setup()`, after `spawn_sidecar` — this exactly matches where the Unix `thread::spawn` call sits today (after `start_stderr_forwarder`, before `app.deep_link().on_open_url`).

---

### `src-tauri/Cargo.toml` — `[target.'cfg(windows)'.dependencies]`

**Analog:** `[target.'cfg(unix)'.dependencies]` (`Cargo.toml:222-235`)

**Full existing table + its comment discipline to mirror:**
```toml
# Quick task 260907-juv (Layer B): the sidecar's process-group reap on quit
# (`SidecarState::shutdown_child()` in `src/main.rs`) needs `libc::kill(-pgid, sig)` to signal
# the sidecar's whole process group rather than the lone sidecar pid -- `std::process::Child`
# exposes no group-signal API of its own. ALREADY resolved in this workspace's tree at this
# exact version ...
# `target.'cfg(unix)'` (not macOS-only): the process-group reap applies to every unix target
# this shell builds for (macOS AND Linux) -- only Windows gets the `#[cfg(not(unix))]`
# degraded arm in `shutdown_child()` that keeps the pre-existing `child.kill()`.
[target.'cfg(unix)'.dependencies]
libc = "0.2.186"
```
(`Cargo.toml:222-235`)

**New table to add**, following the exact same "declare only what this file's own code directly needs, even if already present transitively" discipline already established for `dispatch2`/`objc2-core-foundation` (`Cargo.toml:171-207`) and confirmed by research (Package Legitimacy Audit — `windows-sys` 0.45.0-0.61.2 are ALL already transitively present via `arboard`/`keyring`/`tauri-plugin-updater`/`rfd`/`tokio`/`mio`/`socket2`/`tempfile`/`tray-icon`/`muda`):
```toml
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.60", features = [
    "Win32_Foundation",
    "Win32_System_Threading",
    "Win32_System_Pipes",
    "Win32_Storage_FileSystem",
    "Win32_Security",
    "Win32_Security_Authorization",
    "Win32_System_Memory",
] }
```
Also note the existing `keyring` dependency at `Cargo.toml:43` already requests a `"windows-native"` feature — cite this as precedent that this codebase already has an established, working Windows-specific-feature request pattern inside the unconditional `[dependencies]` block, distinct from the target-gated table above.

---

### `src-tauri/tauri.windows.conf.json` — remove the `schemes: []` override

**Analog:** the override itself, which is being inverted, plus the base `tauri.conf.json`'s `plugins.deep-link.desktop.schemes: ["gamelib"]` (asserted by `windowsDeepLinkSuppression.test.ts` Test C, `windowsDeepLinkSuppression.test.ts:140-145`) as the target end-state.

Read the current file directly before editing — the planner/executor should confirm the exact JSON path (`plugins.deep-link.desktop.schemes`) and remove ONLY that key, leaving `bundle.resources` (`EXPECTED_WINDOWS_RESOURCES`, asserted by Test B) completely untouched. This must land in the SAME commit as the Jest test inversion below (research Q6/Q9, REQ-46-05).

---

### `src/backend/__tests__/windowsDeepLinkSuppression.test.ts` — invert Tests A and E

**File itself is the analog** (full file read above, `windowsDeepLinkSuppression.test.ts:1-173`).

**Test A today** (asserts the override IS present, explicitly empty):
```typescript
test('Test A: tauri.windows.conf.json declares an OWN "schemes" property, explicitly empty (not deleted)', () => {
  const windowsConf = loadJson<PlatformConfig>(WINDOWS_CONF_PATH)
  const desktop = windowsConf.plugins?.['deep-link']?.desktop
  expect(desktop).toBeDefined()
  expect(Object.prototype.hasOwnProperty.call(desktop, 'schemes')).toBe(true)
  expect(desktop?.schemes).toEqual([])
})
```
(`windowsDeepLinkSuppression.test.ts:127-133`)

**Inversion target:** either assert `windowsConf.plugins?.['deep-link']` is now `undefined` (mirroring Test D's existing assertion shape for macOS/Linux, `windowsDeepLinkSuppression.test.ts:147-152`, which asserts `toBeUndefined()`) if the key is deleted entirely, OR assert `schemes` now equals `['gamelib']` if the override is changed rather than removed — whichever the executor's actual edit produces. The header comment (`windowsDeepLinkSuppression.test.ts:37-39`) already names this as the intended follow-up: "Lifting this override is the unblock step ... remove the override from `tauri.windows.conf.json` AND update this test in the same change."

**Test E today** (merge-patch simulation asserting Windows yields `[]` while macOS/Linux yield `['gamelib']`, `windowsDeepLinkSuppression.test.ts:154-171`) — invert the Windows-specific assertion (`expect(mergedWindows.plugins?.['deep-link']?.desktop?.schemes).toEqual([])`) to `.toEqual(['gamelib'])`, matching what macOS/Linux already assert two lines below it, since after this phase all three platforms merge to the same schemes list.

**Tests B, C, D are controls and stay unchanged** — Test B pins `bundle.resources` is untouched by the override (still relevant, still true), Test C pins the base config's own schemes list (unaffected by this phase), Test D pins macOS/Linux still declare no `plugins['deep-link']` key (unaffected).

---

### `src/backend/__tests__/tauriShellSource.test.ts` — new source-gate tests for the Windows guard

**Analog 1 — positive-token pattern with the `(` boundary discipline:**
```typescript
const POSITIVE_TOKENS = [
  'fn protocol_url_arg(',
  'fn cli_no_gui(',
  'fn sidecar_forward_args(',
  'fn single_instance_socket_path(',
  'fn single_instance_dir('
]

test.each(POSITIVE_TOKENS)('the real source contains %s', (token) => {
  expect(loadMainRsCode()).toContain(token)
})

test.each(POSITIVE_TOKENS)(
  'self-test (RED proof): a synthetic source lacking %s does NOT satisfy the gate',
  (token) => {
    const syntheticSource = 'fn some_other_helper() {}\n'
    expect(loadMainRsCode(syntheticSource)).not.toContain(token)
  }
)
```
(`tauriShellSource.test.ts:2204-2222`)

The comment directly above this array is itself load-bearing documentation the new test additions must repeat or reference (`tauriShellSource.test.ts:2196-2203`): every token MUST carry a trailing `(` boundary, because this file's `#[cfg(test)] mod tests` names test functions like `windows_single_instance_user_returns_none_without_a_username` — a bare unparenthesized `windows_single_instance_user` token would pass vacuously as a substring of that test function's own name even if the real helper were deleted. Add `fn windows_single_instance_user(`, `fn windows_mutex_name(`, `fn windows_pipe_name(` (or the executor's actual chosen names) to a token list following this exact shape, each paired with its own RED self-test per the file's established convention.

**Analog 2 — region-based validation-choke-point assertion** (for pinning the new Windows accept loop's own `protocol_url_arg(&[trimmed.to_string()])` re-validation call, mirroring the Unix one):
```typescript
test('T-35-25: deep_link_decision itself calls protocol_url_arg -- the second half of the link', () => {
  const code = loadMainRsCode()
  const start = code.indexOf('fn deep_link_decision(')
  expect(start).toBeGreaterThan(-1)
  const body = code.slice(start, start + 400)
  expect(body).toContain('protocol_url_arg(')
})
```
(`tauriShellSource.test.ts:2316-2325`, with its own RED self-test at `2327-2337`)

Apply the identical shape to the new Windows accept-loop function/closure: locate its start via `code.indexOf('fn <windows_accept_loop_fn_name>(')` (or the nearest enclosing marker if it's an inline closure), slice a bounded window, and assert `protocol_url_arg(` appears inside it — never a bare "does the file contain protocol_url_arg anywhere" substring check.

**Analog 3 — `cfgGuardAboveRegisterAll`-style structural walk-upward gate** (directly reusable pattern for REQ-46-06's "recorded decision on Windows register_all() widening" and REQ-46-08's "`on_open_url` stays inside `.setup()`"):
```typescript
function cfgGuardAboveRegisterAll(source?: string): string | null {
  const lines = loadMainRsCode(source).split('\n')
  const callIdx = lines.findIndex((line) => line.includes('register_all()'))
  if (callIdx === -1) return null
  for (let i = callIdx; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('#[cfg(')) return trimmed
  }
  return null
}

test('T-35-28 / D-05: the only register_all() call site sits under #[cfg(target_os = "linux")]', () => {
  expect(cfgGuardAboveRegisterAll()).toBe('#[cfg(target_os = "linux")]')
})
```
(`tauriShellSource.test.ts:2349-2367`, with RED self-tests at `2369-2382` proving an ungated or wrongly-gated call fails the gate)

If REQ-46-06's decision is "do not widen `register_all()` to Windows" (the research's own recommendation), this existing test needs NO change at all — it already proves the gate stays Linux-only. If the decision instead widens it, this test's expected string must change to reflect the new cfg attribute, and a new RED self-test should prove the OLD (Linux-only) gate now fails.

**New structural test needed for REQ-46-08** (`on_open_url` registration stays inside `.setup()`, never before `Builder::default()`) — build this as a new region-based test following Analog 2's shape: locate the byte offset of `tauri::Builder::default()`, locate the byte offset of `.setup(move |app| {`, locate the byte offset of `on_open_url(`, and assert `Builder::default() < .setup( < on_open_url(` in that strict order — mirroring the ordering-assertion style already used elsewhere in this file (e.g. the `armIdx`/`catchAllIdx` ordering checks around `tauriShellSource.test.ts:291-292`, and the explicit "ORDERING, load-bearing" test named at `tauriShellSource.test.ts:1882`).

## Shared Patterns

### Fail-open discipline (T-34.5-G6-24)
**Source:** `acquire_single_instance`'s `Err(e) => { eprintln!(...); SingleInstanceRole::PrimaryWithoutListener }` arm (`main.rs:8216-8222`) and the secondary-path's unconditional `std::process::exit(0)` regardless of delivery success (`main.rs:8825-8834`).
**Apply to:** every new Windows function that can fail (mutex creation, pipe creation, DACL construction, pipe connect-on-secondary-side). Every failure must degrade to "behave as primary without a listener" or "log a warning and exit(0) anyway" — never abort startup, never retry indefinitely, never fall back to becoming a second full instance.

### Single validation choke point (`protocol_url_arg`)
**Source:** `protocol_url_arg(args: &[String]) -> Option<String>` (`main.rs:8009-8031`), whose own doc comment states: "A FOURTH source belongs here too; the validation does not live at any call site, it lives in that one function."
**Apply to:** the new Windows named-pipe transport is the fourth source (after argv, the Unix socket, and the OS `on_open_url` callback). Every payload read off the pipe must be re-validated through this exact function before dispatch — never a parallel/duplicate validator.

### Never log the rejected payload (T-34.5-G6-25)
**Source:** `eprintln!("[shell] rejected single-instance payload (failed protocol_url_arg validation), bytes={}", trimmed.len())` (`main.rs:8985-8988`) and `DeepLinkDecision::Reject { bytes: usize }`'s structural inability to hold the payload (`main.rs:8042-8045`).
**Apply to:** any new logging in the Windows pipe accept loop or the secondary-side delivery-failure warning — byte count and reason only, exactly matching this line's shape.

### Explicit-parameter purity for name/path derivation
**Source:** `single_instance_dir(home: Option<&str>)`'s own doc comment (`main.rs:8102-8107`): "neither this file's `#[cfg(test)] mod tests` nor a parallel `cargo test` run may mutate process-global env vars."
**Apply to:** `windows_single_instance_user`/`windows_mutex_name`/`windows_pipe_name` — take the username as an explicit `Option<&str>` parameter, never call `std::env::var` internally, so the pure logic stays unit-testable cross-platform without touching the OS mutex/pipe table.

### `#[cfg(unix)]` / `#[cfg(not(unix))]` split convention
**Source:** `configure_sidecar_process_group` (`main.rs:8258-8265`) and `shutdown_child` (`main.rs:1191-1234`) — both keep the platform split INSIDE one function/one file location rather than separate modules.
**Apply to:** the new Windows guard code should follow this same "side-by-side in the same function, not a separate module" discipline — `SingleInstanceRole` gains platform-specific variants via `#[cfg(unix)]`/`#[cfg(windows)]` blocks living directly beside each other, matching how `shutdown_child`'s unix/non-unix split already lives side-by-side in one function (research's own "Recommended Project Structure" section states this explicitly).

## No Analog Found

None — every planned addition has a direct structural sibling inside the same files (see table above). The one genuinely novel element is the FFI surface itself (`CreateMutexW`/`CreateNamedPipeW`/`ConvertStringSecurityDescriptorToSecurityDescriptorW` via `windows-sys`), which has no codebase analog because this is the first `windows-sys` FFI code in `src-tauri/src/main.rs` — for that surface, RESEARCH.md's own "Code Examples" section (SDDL construction sketch, `46-RESEARCH.md:387-396`) and the Microsoft Learn citations in Q1/Q2/Q4 are the primary reference, not a codebase analog.

## Metadata

**Analog search scope:** `src-tauri/src/main.rs` (single-instance guard section `8159-8265`, `main()` guard block `8752-8996`, OS deep-link section `8997-9160`, `#[cfg(test)] mod tests` `9729-12800+`), `src-tauri/Cargo.toml` (target-gated dependency tables), `src-tauri/tauri.windows.conf.json`, `src/backend/__tests__/tauriShellSource.test.ts` (comment-stripping helper `1-112`, D-44-A describe block `2183-2266`, OS deep-link describe block `2268-2398`), `src/backend/__tests__/windowsDeepLinkSuppression.test.ts` (full file, 173 lines)
**Files scanned:** 5 (all read directly, no grep-only inference on load-bearing excerpts)
**Pattern extraction date:** 2026-09-22
