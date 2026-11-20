# Phase 71: Rust shell module decomposition - Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 16 new or modified file groups (see classification)
**Analogs found:** 15 / 16 (one partial, noted)

All line numbers are at tree `b74d85dee` (plus working-tree state at map time). Line numbers drift as waves land; re-grep before quoting. Facts about the cluster maps, the 45-arm table and the D-10 inventory live in `71-RESEARCH.md`; this file only maps each new file to a concrete in-repo analog.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/src/rust_dispatch.rs` (new router) | route | request-response | current `dispatch_rust_channel` head, `store_embed.rs:1750-1757` + delegating arms `store_embed.rs:2157-2165` | exact (same fn, thinned) |
| `src-tauri/src/dialogs.rs`, `app_lifecycle.rs`, `notification_show.rs`, `scan_dispatch.rs` (new flat domain modules) | service | request-response | `src-tauri/src/shell_open.rs` (header, `use super::*;`, `pub(crate)` fn, trailing test mod) | role-match |
| `keyring_dispatch.rs`, `clipboard.rs`, `tray.rs`, `wake_lock.rs`, `shell_open.rs` (gain `rpc_*` handlers) | service | request-response | `shell_open.rs` `shell_open_path(app, args)` handler shape | exact |
| `login_window.rs` + `login_window/*.rs` | model/service (parent + children) | event-driven + request-response | `wake_lock.rs` + `wake_lock/{linux,macos,windows}.rs` (parent + child dir, non-`mod.rs`) | exact layout match |
| `store_embed.rs` + `store_embed/*.rs` | same | request-response | `wake_lock.rs` + `wake_lock/` | exact layout match |
| `macos_epic_embed.rs` + `macos_epic_embed/*.rs` | same (macOS-only) | event-driven | `wake_lock.rs` (cfg-gated children) + own file's `epic_embed_*_tests` | role-match |
| co-located `#[cfg(test)] mod tests` in every module (Wave 5) | test | n/a | `macos_epic_embed.rs:110-133` and `shell_open.rs:98+` | exact |
| `main.rs` (mod decls, `SHELL_SOURCE_FILES`, `SHELL_SOURCE`, guard) | config | n/a | itself, `main.rs:84-142`, `1991-2068` | exact |
| `src/backend/testUtils/tauriShellSource.ts` (+ `readTauriShellProductionSource`, `readHandlerBody`) | utility | transform | same file, `listTauriShellSourceFiles` / `readTauriShellSource` (lines 63-97) | exact |
| `tauriShellSource.test.ts` guard describe (D-10 "no slicer on `mod tests {`") | test | transform | same file `describe('tauriShellSource helper scope')` ~4570-4642, "no direct main.rs reader" scan | exact |
| jest migrations: `loginChromeCssInjection.test.ts`, `tauriShellSource.test.ts`, `keyringDiagPersistence`, `dialogOptionForwarding`, `sidecarShutdownFlagSource`, `scanChannelParity`, `macosEpicEmbedSource`, `macosEpicEmbedDiagPersistence`, `openPolicy` | test | transform | their own existing `productionCode()` / `extract*ArmBody` helpers | exact (repoint) |
| `store_embed_handoff_policy.rs`, `epic_embed_js_dialog.rs`, `main.rs` `include_str!` sites | test (source-text) | file-I/O | `store_embed_handoff_policy.rs:224,338-340,367` | exact (repoint) |
| `src-tauri/src/ipc_contract.rs` | generated | n/a | NOT touched (generated, `pnpm check:ipc-contract`) | n/a |

## Pattern Assignments

### `src-tauri/src/rust_dispatch.rs` (route, request-response)

**Analog:** current router head and delegating arms in `src-tauri/src/store_embed.rs`.

**Head to copy verbatim** (`store_embed.rs:1750-1756`):
```rust
pub(crate) fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String> {
    // Exhaustive over the generated enum (67-11, D-13): a channel in `RUST_INVOKE_CHANNELS` with no
    // arm below is a compile error, and an unknown wire name never reaches the match.
    let Some(ch) = RustInvokeChannel::from_name(channel) else {
        return Err(format!("rustInvoke:unknown-channel:{channel}"));
    };
    match ch {
```

**One-line delegation arm (already exists, copy this shape for every `rpc_<wire>` arm)** (`store_embed.rs:2157-2165`):
```rust
        RustInvokeChannel::ShellShowItemInFolder => {
            shell_open::shell_show_item_in_folder(app, args)
        }
        RustInvokeChannel::ShellOpenPath => {
            shell_open::shell_open_path(app, args)
        }
```
In the router these collapse to `RustInvokeChannel::ShellOpenPath => shell_open::shell_open_path(app, args),` at 8-space indent (RESEARCH Pattern 1; `DISPATCH_ARM_LINE_RE` `^ {8}RustInvokeChannel::\w+\s*=>` keeps matching). Note the arg order of the existing delegates is `(app, args)`, so the new `rpc_*` handlers should pick one order deliberately and the router must match each; the existing two are the only fixed ones.

**Wiring in `main.rs`** (analog `main.rs:118-142`): add `mod rust_dispatch;` to the `mod` block and `use rust_dispatch::*;` after `use store_embed::*;` so `sidecar.rs:585`'s call is unchanged. Do not add a `_ =>` arm.

**cfg-split arm bodies (store_embed arms) to carry whole into `store_embed/*.rs` handlers** (`store_embed.rs:4423-4437`):
```rust
        RustInvokeChannel::StoreEmbedOpen => {
            #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
            {
                store_embed_open(app, args)
            }
            #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
            {
                Err("store_embed_open:unsupported-platform".to_string())
            }
        }
```
Move body unchanged into `fn rpc_store_embed_open(args: &[Value], app: &AppHandle) -> Result<Value, String>`; keep both cfg blocks.

---

### New flat domain modules `dialogs.rs`, `app_lifecycle.rs`, `notification_show.rs`, `scan_dispatch.rs` (service, request-response)

**Analog:** `src-tauri/src/shell_open.rs` (and `clipboard.rs`, `keyring_dispatch.rs` for the plain-sibling shape).

**Header/imports pattern** (`shell_open.rs:1-11`, `keyring_dispatch.rs:1`):
```rust
//! Open-path / reveal policy for the `ShellOpenPath` ... (Phase 72, ...).
//! ...
use super::*;
```
Every flat sibling is `use super::*;` (pulls `main.rs` imports and the glob re-exports). Items are `pub(crate)`:
```rust
pub(crate) fn is_launchable_bundle(p: &std::path::Path) -> bool { ... }
```
Handler gets `pub(crate) fn rpc_<wire>(...) -> Result<Value, String>` with the arm body dedented 8 spaces (RESEARCH Pattern 2). Leading comment block of the arm travels with the handler.

**Trailing test mod shape** (`shell_open.rs:98-112`):
```rust
#[cfg(test)]
mod shell_open_tests {
    use super::*;
    use std::fs;
    const FIXTURE: &str = include_str!("../../src/common/__fixtures__/openPolicyCases.json");
```

**Exclusion trap:** `notification_show.rs` must be a NEW flat file, not an addition to `notification_backend.rs` (pre-split sibling, excluded from the combined source, deliberately `AppHandle`-free). Do not add any of these new files to `PRE_SPLIT_SIBLING_MODULES`.

**Existing handler homes** `clipboard.rs`, `tray.rs`, `wake_lock.rs`, `keyring_dispatch.rs`: append `pub(crate) fn rpc_*` after existing items, before any test mod. For `wake_lock.rs` the child files are declared with `#[path]` (see next section).

---

### `login_window.rs` + `login_window/` (parent plus children, non-`mod.rs`)

**Analog:** `src-tauri/src/wake_lock.rs` with `src-tauri/src/wake_lock/{linux,macos,windows}.rs` (the only existing parent-file plus child-directory example; no `mod.rs` anywhere).

**Child declaration with explicit path** (`wake_lock.rs:132-133`, `149-150`, `166-167`):
```rust
#[path = "wake_lock/macos.rs"]
mod macos_wake_lock;
...
#[path = "wake_lock/windows.rs"]
mod windows_wake_lock;
```
Because `wake_lock.rs` is itself a top-level module, Rust (2018+) would resolve `mod macos;` to `wake_lock/macos.rs` without `#[path]`; `#[path]` was used here only to keep an inline module's old name (ab1). For Phase 71's new children use the plain form (RESEARCH Pattern 3):
```rust
// login_window.rs
use super::*;
mod humble_open;
pub(crate) use humble_open::*;
#[cfg(target_os = "macos")]
mod sheet;
#[cfg(target_os = "macos")]
pub(crate) use sheet::*;
```
```rust
// login_window/humble_open.rs
use super::*;
```
`[ASSUMED until the first compile]`: non-`mod.rs` child resolution and `use super::*;` chaining (child sees parent private items and, via the parent's own `use super::*;`, `main.rs` imports). Wave 1's first child file is the compile proof; wake_lock is the proof that a parent-file module with a `wake_lock/` dir builds today.

**Glob re-export in `main.rs`** (analog `main.rs:131-142`): `use login_window::*;` keeps `generate_handler!` and call sites untouched (D-15). Both `mod` and `pub(crate) use` need the same `#[cfg(...)]` for macOS-only children (RESEARCH Pitfall 8).

**Parent top-of-file state that stays** (`login_window.rs:1-25` area): `LOGIN_WINDOW_LABEL_COUNTER`, `LOGIN_WINDOW_EVENTS` (`pub(crate) static LOGIN_WINDOW_EVENTS: Mutex<Option<HashMap<String, Vec<Value>>>> = Mutex::new(None);`), etc.

Same pattern for `store_embed.rs` + `store_embed/{state,policy,open,layout,controls}.rs` (parent header at `store_embed.rs:1-12` keeps the section doc and mod decls). Inline `#[cfg(target_os = "linux")] pub(crate) mod linux_store_embed_layout` moves whole into `store_embed/layout.rs`; grep `::linux_store_embed_layout` and `::macos_invite_focus` before moving (path changes unless re-exported).

---

### `macos_epic_embed.rs` + `macos_epic_embed/{surface,nav_delegate}.rs` (macOS-only, event-driven)

**Analog:** same parent+dir layout as above, plus the file's own conventions (it does NOT use `use super::*;`; explicit imports, inner `#![cfg(target_os = "macos")]`). `main.rs:87`:
```rust
#[cfg(target_os = "macos")]
mod macos_epic_embed;
```
Children: either copy the needed explicit `use` lines or `use super::*;` to inherit the parent's imports; prune parent imports that become unused (clippy equality ceiling). `pub(crate)` is needed only for `surface()`, `apply_visibility`, `nav_state_json`, `epic_embed_kvo_context` (RESEARCH visibility map).

Keep this module on `PRE_SPLIT_SIBLING_MODULES` (D-11) with a prefix-aware filter (`p === sibling || p.startsWith('macos_epic_embed/')`).

---

### Co-located tests (D-08)

**Analog:** `src-tauri/src/macos_epic_embed.rs:110-133`:
```rust
#[cfg(test)]
mod epic_embed_load_timed_out_tests {
    use super::*;

    #[test]
    fn just_under_the_bound_is_not_timed_out() {
        let elapsed = EPIC_EMBED_LOAD_TIMEOUT - Duration::from_millis(1);
        assert!(!epic_embed_load_timed_out(elapsed, EPIC_EMBED_LOAD_TIMEOUT));
    }
```
and `shell_open.rs:98-112` (`mod shell_open_tests`, trailing, `use super::*;` plus extra `use`, `include_str!` fixture relative to the file). For Wave 5, files in new subdirectories need one extra `../` on `include_str!("../../meta/fixtures/...")` (RESEARCH Pitfall 12); flat siblings keep the path. Move `// ---- topic ----` banners with their blocks. Shared test helpers (`spawn_orphaned_group`, `valid_reveal_args`, `send_frame`, `TRAY_SET_ICON_WIRE_FIXTURE`, ...) move with their consumers. Cross-cutting tests stay in `main.rs` (D-09).

---

### `main.rs`: `SHELL_SOURCE_FILES` / `SHELL_SOURCE` / guard (config, file-I/O)

**Analog:** itself, `main.rs:1991-2068`.

**List + const** (`main.rs:1991-2029`):
```rust
const SHELL_SOURCE_FILES: &[&str] = &[
    "main.rs",
    "clipboard.rs",
    ...
    "wake_lock/windows.rs",
];

const SHELL_SOURCE: &str = concat!(
    include_str!("main.rs"), "\n",
    include_str!("clipboard.rs"), "\n",
    ...
    include_str!("wake_lock/windows.rs"),
);
```
Note: `main.rs` is FIRST here but LAST in the TS helper. Every new `.rs` file must be added to BOTH lists in the same commit. Paths in `include_str!` are relative to `main.rs`, so children are `include_str!("login_window/humble_open.rs")`.

**Guard** (`main.rs:2033-2069`): `walk()` the `src` dir, subtract `PRE_EXISTING_SIBLINGS` (exact names), fail on any `.rs` not in `SHELL_SOURCE_FILES`. Extend the filter to be directory-aware: `.filter(|f| !f.starts_with("macos_epic_embed/"))`.

**D-10 Rust half:** `SHELL_SOURCE` is a `const &str` and cannot be post-processed. Add a runtime `fn shell_production_source() -> String` over the same `include_str!` list that cuts each file at a column-0 `#[cfg(test)]` immediately followed by column-0 `mod <name> {`, brace-matched (RESEARCH Pitfall 11). Existing users that must adopt it: the four at `main.rs:4995`, `5241`, `5543`, `5681` (all `let source = SHELL_SOURCE;`). The keyring-available test self-avoids matching with `concat!("RustInvokeChannel::KeyringAvailable", " => {")` (`main.rs:4996-4998`); after D-04 that arm no longer exists, so this test must be repointed to `fn rpc_keyring_available`.

---

### `src/backend/testUtils/tauriShellSource.ts` (utility, transform)

**Analog:** itself. Add the new readers next to the existing ones, same style (explicit `repoRoot` default arg, newline joiner with no marker text).

**Existing list/read functions to extend** (`tauriShellSource.ts:63-97`):
```ts
export function listTauriShellSourceFiles(repoRoot: string = DEFAULT_REPO_ROOT): string[] {
  const all: string[] = []
  walk(join(repoRoot, SHELL_SRC_REL), '', all)
  const rest = all
    .filter((p) => p !== 'main.rs' && !PRE_SPLIT_SIBLING_MODULES.includes(p) && !GENERATED_MODULES.includes(p))
    .sort()
  return [...rest, 'main.rs']
}
export function readTauriShellSource(repoRoot: string = DEFAULT_REPO_ROOT): string {
  return listTauriShellSourceFiles(repoRoot)
    .map((p) => readTauriShellFile(p, repoRoot))
    .join('\n')
}
```
Changes:
- Make the `PRE_SPLIT_SIBLING_MODULES` filter prefix-aware: `!PRE_SPLIT_SIBLING_MODULES.some((s) => p === s || p.startsWith(s.replace(/\.rs$/, '/')))` (D-11). Keep `main.rs` last.
- `readTauriShellProductionSource(repoRoot)`: same list, each file mapped through a cutter that removes only whole `#[cfg(test)] mod <name> { ... }` blocks (brace matched), then `.join('\n')`. Unit-test the cutter on a trailing `mod tests` and a topic-named mid-file mod (shell_open_tests shape).
- `readHandlerBody(source, wireName)`: brace-matched body of `fn rpc_<wireName>(`, with a minimum-length anti-vacuity assertion (RESEARCH Pitfall 1). Replaces the five duplicated `extractHumbleLoginOpenArmBody` copies and the `extractArmBody`/`extractCensusArmBody` helpers. Keep `DISPATCH_ARM_LINE_RE` router-line scraping as is.

**The slicer idiom being migrated** (`loginChromeCssInjection.test.ts:41-45`; identical copies at `tauriShellSource.test.ts:2247-2251` and `2366-2370`):
```ts
function productionCode(code: string): string {
  const testModStart = code.indexOf('mod tests {')
  expect(testModStart).toBeGreaterThan(-1)
  return code.slice(0, testModStart)
}
```
Do NOT migrate readers whose needle is Rust test code (`longRunningChannels.test.ts` `locateCfgTestRegionRaw`, `EXPECTED_CLIPBOARD_TEST_FN_NAMES` at `tauriShellSource.test.ts:957-979`).

**Arm-body extractor being replaced** (`tauriShellSource.test.ts:1027-1040`, `extractArmBody(code, startMarker, endMarker)` on `'RustInvokeChannel::HumbleLoginCookies => {'` ... `'RustInvokeChannel::HumbleLoginTakeEvents => {'`).

---

### D-10 guard test (test, transform)

**Analog:** `describe('tauriShellSource helper scope')` in `src/backend/__tests__/tauriShellSource.test.ts:4570-4642`, in particular the "no test or meta script reads main.rs directly" scan:
```ts
const visit = (dir: string): void => {
  for (const e of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) { if (e.name !== 'node_modules') visit(rel) }
    else if (/\.(ts|tsx)$/.test(e.name) && !(rel in ALLOWED)) {
      const code = stripSourceComments(readFileSync(join(REPO_ROOT, rel), 'utf-8'))
      if (/(['"\x60])main\.rs\1/.test(code) || ...) offenders.push(rel)
    }
  }
}
visit('src'); visit('meta'); expect(offenders).toEqual([])
```
Copy that walker and offender-list shape for "no reader slices on `mod tests {`", with an ALLOWED map that names the fixtures in `loginChromeCssInjection.test.ts:166-193` (synthetic input strings containing `'mod tests {'`) and the guard file itself. Neighbouring assertions in the same describe (`main.rs` last; every `mod x;` in `main.rs` resolves to a listed file; sibling exclusions exist on disk) must be updated so a directory exclusion (`macos_epic_embed/`) passes the "exists on disk" check.

---

### `include_str!` source-text repoints (test, file-I/O)

**Analog:** `src-tauri/src/store_embed_handoff_policy.rs` lines 224, 338-340, 367 and `epic_embed_js_dialog.rs:192`.
```rust
let source = include_str!("macos_epic_embed.rs");            // epic_embed_js_dialog.rs:192, handoff_policy.rs:224
let main_rs = body_after(include_str!("store_embed.rs"), ".on_new_window({");   // :338
```
Repoint rules (RESEARCH section F):
- Wave 3: `.on_new_window({` and `.on_download({` windows -> `include_str!("store_embed/open.rs")`; `main.rs` tests ~7892-8050 -> `store_embed/layout.rs` / `open.rs`.
- Wave 4: absence checks in `epic_embed_js_dialog.rs:192` must run over ALL pieces: `concat!(include_str!("macos_epic_embed.rs"), "\n", include_str!("macos_epic_embed/surface.rs"), "\n", include_str!("macos_epic_embed/nav_delegate.rs"))`. Presence needles for the delegate can point only at `nav_delegate.rs`.
- Windowed slices (`body_after(.., 4000)` etc.) are safe only if the function moves whole.

---

## Shared Patterns

### Sibling module import and re-export
**Source:** `src-tauri/src/main.rs:118-142`
**Apply to:** every new top-level file (`rust_dispatch`, `dialogs`, `app_lifecycle`, `notification_show`, `scan_dispatch`)
```rust
mod clipboard;
mod keyring_dispatch;
...
use clipboard::*;
use keyring_dispatch::*;
```
Add `mod x;` plus `use x::*;` pairs in both blocks. Each module file starts `use super::*;`. Items become `pub(crate)` only where a cross-module reference requires it (ab1 rule, D-15); no `pub(super)`/`super::super`.

### cfg-gated module declaration
**Source:** `main.rs:84-88`, `main.rs:99-103`
```rust
#[cfg(target_os = "macos")]
mod macos_epic_embed;
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod notification_backend;
```
Carry the same attribute on the `mod` and on the `pub(crate) use` for macOS-only children. Keep each item's own `#[cfg]` (do not hoist) for `windows_cdp.rs`.

### Unused-variable handling for cfg-conditional handler params
**Source:** the existing `HumbleLoginOpen` arm body uses `#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]` (RESEARCH Pitfall 4). Apply to `rpc_app_hide` (`app` used only on macOS). The clippy ratchet (`meta/clippyRatchet.cjs`) is an equality ceiling on darwin and win32.

### Exhaustive match, no wildcard
**Source:** `store_embed.rs:1750-1756` comment. Apply to `rust_dispatch.rs`: never add `_ =>`.

### Test-mod preamble
**Source:** `macos_epic_embed.rs:110-113`, `shell_open.rs:98-100`: `#[cfg(test)]` + `mod <name> {` + `use super::*;`. Production-source cutters must handle both `mod tests` and topic-named mods.

### Move-proof
**Source:** ab1 summary `.planning/quick/261106-ab1-split-src-tauri-main-rs-into-modules/261106-ab1-SUMMARY.md` and RESEARCH "Move-proof and audit scripts" (`moveproof.py`, `vis.py` prototypes referenced under `research-tools/`; confirm they exist in the phase dir before the planner relies on them).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `readHandlerBody(source, wireName)` brace-matched extractor | utility | transform | Nothing in `tauriShellSource.ts` brace-matches; the closest code is the per-test `extractArmBody` (marker-to-marker slice) and `loginChromeCssInjection.test.ts` "scans forward from `openMarker`'s FIRST `{` and returns the full brace-matched block" (~line 48). Use that function as the algorithm source, lift it into the helper. |
| Rust `shell_production_source()` runtime cutter | utility | transform | No Rust test builds a runtime string from `include_str!` today; `SHELL_SOURCE` is `const`. Design from RESEARCH section G. |

## Metadata

**Analog search scope:** `src-tauri/src/*.rs`, `src-tauri/src/wake_lock/`, `src/backend/testUtils/tauriShellSource.ts`, `src/backend/__tests__/{tauriShellSource,loginChromeCssInjection}.test.ts`
**Files scanned:** about 14 read or excerpted (targeted ranges); `wake_lock/` is the only existing parent-file plus child-directory module, and `grep "mod.rs"` style does not occur.
**Pattern extraction date:** 2026-11-08
