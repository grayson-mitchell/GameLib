# Phase 46: Windows single-instance guard and gamelib:// deep-link registration - Research

**Researched:** 2026-09-22
**Domain:** Windows IPC primitives (named mutex, named pipe), Tauri v2 desktop bootstrap ordering, `tauri-plugin-deep-link` internals, NSIS install-time registry writes
**Confidence:** HIGH — every load-bearing claim below is either (a) reproduced directly on this machine (`cargo check`/`cargo test`), (b) read from the exact vendored crate source in `~/.cargo/registry/src` at the version pinned in this repo's `Cargo.lock`, or (c) confirmed against current Microsoft Learn documentation. Nothing here rests on training-data recall alone without one of those three backstops.

## Summary

Windows needs a hand-rolled guard that runs before `tauri::Builder::default()`, mirroring the shape (not the mechanism) of the existing `#[cfg(unix)]` guard at `src-tauri/src/main.rs`. The correct Windows primitive pair is a **named mutex** (`CreateMutexW`) for the primary/secondary decision and a **named pipe** (`CreateNamedPipeW`/`ConnectNamedPipe`) for payload transport — not `tauri-plugin-single-instance`'s own `WM_COPYDATA` + hidden-window approach (verified from that plugin's real source as prior art; rejected below with a mechanism, not merely by fiat) and not a single pipe-only primitive (considered and rejected below with a mechanism).

The single biggest simplification versus the Unix implementation: **Windows named-object lifetime is reference-counted and self-cleaning.** A named mutex's kernel object is destroyed automatically when its last open handle closes, and Windows closes a process's handles automatically on termination (Microsoft Learn, `CreateMutexW`, confirmed verbatim below). There is no stale-file-on-disk problem to solve, no connect-then-unlink-then-rebind dance, and no `0700`-directory-plus-`0600`-file trust boundary to construct — the mutex and pipe are pure OS-namespace objects with no filesystem footprint at all. The Unix guard's entire "connect-first, bind-second, remove stale socket" branch (`acquire_single_instance`, `main.rs:8195`) has no Windows analogue to port; the Windows guard is structurally simpler on this specific point, which is worth stating plainly so a future reader does not go looking for a Windows "unlink the stale X" step that should not exist.

Two hard blockers were found and must be sequenced ahead of or alongside the guard itself:

1. **`cargo test` does not currently compile on Windows on this machine, on today's `main`, for reasons unrelated to this phase.** Reproduced directly (Quality/Environment section below): four `#[cfg(test)]` test functions call three `#[cfg(target_os = "macos")]`-gated `store_embed_*` helper functions without a matching platform guard on the test functions themselves. `cargo check` (the binary, non-test build) is clean; only the test harness fails. This is a **Wave 0 gap**, not something this phase caused, but it blocks running ANY Rust unit test on Windows — including every new test this phase adds — until fixed.
2. **The `tauri-plugin-deep-link` plugin's own argv handler (`handle_cli_arguments`) already runs on Windows today**, at plugin-setup time (`Builder::build()`, before the app's own `.setup()` closure). Read directly from `tauri-plugin-deep-link-2.4.9/src/lib.rs`: when `plugins.deep-link.desktop.schemes` is non-empty on Windows (i.e., once the `tauri.windows.conf.json` override is removed), a cold-start `gamelib://` argv will make this handler emit a `deep-link://new-url` Tauri event — but GameLib's own `on_open_url` listener is registered later, inside the app's `.setup()` closure, so the plugin's own emission has no listener yet and is silently dropped. Confirmed by reading `tauri-2.11.5/src/app.rs`: `initialize_plugins` (which runs every plugin's `.setup()`, including the deep-link plugin's `init_deep_link` → `handle_cli_arguments` call) executes at `app.rs:2440`, strictly before the app-level `setup` closure at `app.rs:2530`. **There is no double-dispatch risk** from removing the Windows override — argv delivery on Windows will continue to be carried exclusively by this file's own `sidecar_forward_args` → `protocol_url_arg` path, exactly as the `260922-nx4` quick task's own finding already stated.

**Primary recommendation:** implement the guard as: (1) a pre-`Builder` `CreateMutexW` call using a `Local\`-namespaced, per-user-disambiguated name, structured as a pure `fn windows_single_instance_role(...)`-shaped decision so it is unit-testable on any host without touching the registry or the OS mutex table in a parallel `cargo test` run; (2) on `ERROR_ALREADY_EXISTS`, connect to a named pipe (`\\.\pipe\gamelib-single-instance-<user>`) with a bounded retry/timeout, deliver the same `__GAMELIB_FOCUS__` sentinel or validated URL the Unix path uses, and `std::process::exit(0)` regardless of whether delivery succeeded — mirroring the Unix implementation's own fail-open-on-delivery-failure behavior exactly; (3) on success (mutex acquired), start a `CreateNamedPipeW` server with a DACL restricted to the creating user (Owner SID) and `PIPE_REJECT_REMOTE_CLIENTS`, with the accept loop thread spawned inside `.setup()` after `spawn_sidecar`, exactly mirroring the Unix accept-loop's own placement and lifetime discipline (never joined; the process exit tears it down).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Single-instance decision (mutex acquire) | Rust shell (`src-tauri/src/main.rs`, pre-`Builder`) | — | Must run before any window or sidecar exists; no other tier is alive yet at this point in the process lifecycle |
| Payload transport (named pipe) | Rust shell (`src-tauri/src/main.rs`, accept loop in `.setup()`) | — | Same trust boundary and choke point (`protocol_url_arg`) as the existing Unix socket and OS deep-link event; must not become a fourth unvalidated source |
| OS protocol registration (`Software\Classes\gamelib`) | NSIS installer (build-time, `tauri.windows.conf.json` → CLI bundler) | Rust shell runtime (`register_all()`, currently Linux-only — see Q7 below) | Matches the existing macOS(build)/Linux(runtime)/Windows(TBD) three-way split already documented in `main.rs`'s own comment block |
| Deep-link URL parsing / dispatch to sidecar | Node sidecar (`src/backend/protocol.ts`) | Rust shell (`protocol_url_arg` gate before handoff) | Unchanged by this phase — Rust only validates and forwards, `protocol.ts` remains sole interpretation authority (existing `protocol_url_arg` doc comment) |
| Sidecar process lifetime / reap on exit | Rust shell (`SidecarState::shutdown_child`) | — | Windows already has a narrower `#[cfg(not(unix))]` arm (`child.kill()` only, no process-group signal) — unaffected by this phase, see Q8 below |

## Package Legitimacy Audit

This phase adds exactly one new Cargo dependency surface: `windows-sys` (crates.io), scoped to `[target.'cfg(windows)'.dependencies]`. No new npm/JS packages are introduced.

| Package | Registry | Age / Maintainer | Already in tree? | Source Repo | slopcheck | Disposition |
|---------|----------|-------------------|-------------------|--------------|-----------|-------------|
| `windows-sys` | crates.io | Official Microsoft crate (`microsoft/windows-rs`), part of the same project that publishes `windows`, `windows-core`, `windows-registry` (all already resolved in this repo's `Cargo.lock`) | **Yes** — versions 0.45.0, 0.52.0, 0.59.0, 0.60.2, 0.61.2 are ALL already present transitively (pulled by `arboard`, `keyring`, `tauri-plugin-updater`, `rfd`, `tokio`, `mio`, `socket2`, `tempfile`, `tray-icon`, `muda`, and others — `src-tauri/Cargo.lock` lines 5440-5478) | `github.com/microsoft/windows-rs` | `[OK]` (crates.io ecosystem, run 2026-09-22 on this machine) | **Approved** |
| `windows` (0.61.3) | crates.io | Same project, higher-level typed wrapper crate | Already present (pulled transitively, `Cargo.lock` line 5290) — **not recommended as a new explicit dependency**; `windows-sys` is the lower-level, narrower-surface choice and is what this guard's small, targeted FFI surface needs | `github.com/microsoft/windows-rs` | not separately checked (not being added) | N/A — considered, not added |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

Note on methodology: `slopcheck install windows-sys` defaults to the **npm** ecosystem and returns a false `[SLOP]` ("does not exist on npm") for this Rust-only package name — a textbook instance of the cross-ecosystem confusion trap this protocol exists to catch. Re-run with `--ecosystem crates.io` returned `[OK]`. **Any future check of a Rust package name must pass `--ecosystem crates.io` explicitly**, or the result is meaningless.

`windows-sys` is tagged `[VERIFIED: crates.io / official Microsoft repo]`, not `[ASSUMED]`: it was discovered by direct inspection of this project's own `Cargo.lock` (an authoritative, already-resolved source), not by web search or training-data recall of a package name, and it passed the correctly-scoped slopcheck run.

## Standard Stack

### Core

| Dependency | Version to request | Purpose | Why Standard |
|---|---|---|---|
| `windows-sys` | `"0.60"` (matches the 0.60.2 already resolved via `keyring`/`arboard`/`rfd` — request this range so Cargo is more likely to reuse the already-fetched version rather than add a sixth `windows-sys` bucket to the tree; verify with `cargo tree -i windows-sys` after adding) | `CreateMutexW`/`ReleaseMutex`/`CloseHandle` (mutex), `CreateNamedPipeW`/`ConnectNamedPipe`/`DisconnectNamedPipe` (pipe server), `ConvertStringSecurityDescriptorToSecurityDescriptorW` (DACL from SDDL) | `[VERIFIED: Cargo.lock]` Official Microsoft crate, already the dependency of choice for low-level Win32 FFI throughout this exact dependency tree (`keyring`, `tauri-plugin-updater`, `tray-icon`, `muda` all use it, not the higher-level `windows` crate, for the same narrow-surface reason) |

**Confirmed feature-flag names** (read directly from the vendored `windows-sys-0.60.2/Cargo.toml` on this machine, not guessed):

```toml
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.60", features = [
    "Win32_Foundation",              # HANDLE, BOOL, WIN32_ERROR, CloseHandle, GetLastError
    "Win32_System_Threading",        # CreateMutexW, ReleaseMutex
    "Win32_System_Pipes",            # CreateNamedPipeW, ConnectNamedPipe, DisconnectNamedPipe
    "Win32_Storage_FileSystem",      # FILE_FLAG_FIRST_PIPE_INSTANCE and related open-mode flags
    "Win32_Security",                # SECURITY_ATTRIBUTES
    "Win32_Security_Authorization",  # ConvertStringSecurityDescriptorToSecurityDescriptorW
    "Win32_System_Memory",           # LocalFree, to release the SDDL-allocated security descriptor
] }
```

Every one of these seven feature strings was grepped directly out of `windows-sys-0.60.2/Cargo.toml`'s own feature table on this machine (`Win32_System_Threading = ["Win32_System"]`, `Win32_System_Pipes = ["Win32_System"]`, `Win32_Security_Authorization = ["Win32_Security"]`, etc.) — `[VERIFIED: vendored crate source]`, not asserted from memory. The exact function-to-header mapping (`CreateMutexW` → `synchapi.h` → `Win32_System_Threading`; named-pipe APIs → `namedpipeapi.h`/`fileapi.h` → `Win32_System_Pipes`/`Win32_Storage_FileSystem`) matches Microsoft Learn's own header attribution for each function, read directly during this research session.

### Supporting (no new install — already resolved)

| Library | Role in this guard |
|---|---|
| `std::fs::OpenOptions` (client side only) | The **secondary** process can open a client connection to `\\.\pipe\...` with plain `std::fs::OpenOptions::new().read(true).write(true).open(path)` — Windows named pipes are reachable through the ordinary `CreateFileW`-backed filesystem API, so the client side needs **no FFI crate at all**. Only the SERVER side (creating the pipe, accepting connections) needs `windows-sys`, because `std` has no `CreateNamedPipeW` equivalent. |
| `std::thread` | Accept-loop thread, identical shape to the existing Unix `listener.incoming()` loop |

### Alternatives Considered

| Instead of | Could Use | Tradeoff / Why Rejected |
|---|---|---|
| Hand-rolled mutex + named pipe | `tauri-plugin-single-instance`'s own mechanism (`CreateMutexW` + `WM_COPYDATA` to a hidden **message-only window**, found via `FindWindowW`) | Read directly from that plugin's real Windows source as prior art (per this phase's own instruction). Rejected for the same structural reason D-44-A already rejected the plugin wholesale: `WM_COPYDATA`/`SendMessageW` requires a live window and a running message pump to receive it — exactly the thing that does not exist yet when this guard must run (before `tauri::Builder::default()`). A named pipe with a blocking accept-loop thread needs no message pump and no window, so it can be serviced from inside `.setup()` the same way the Unix `UnixListener` accept loop already is. The mutex-for-decision half of that plugin's design IS the right idiom (see below) — only its delivery transport is unsuitable here. |
| Two primitives (mutex decides, pipe transports) | One primitive: `CreateNamedPipeW` with `FILE_FLAG_FIRST_PIPE_INSTANCE` as the single-instance lock itself | Considered directly per this phase's own Q1. Rejected: `FILE_FLAG_FIRST_PIPE_INSTANCE`'s failure mode on "already exists" is `ERROR_ACCESS_DENIED` — a generic, **ambiguous** error also returned by unrelated DACL misconfiguration. A bug in this guard's own `SECURITY_ATTRIBUTES` construction would then make every launch (not just a genuine second instance) misclassify itself as Secondary, which is a silent **fail-closed** regression forbidden by T-34.5-G6-24. `CreateMutexW`'s `ERROR_ALREADY_EXISTS` is comparatively unambiguous and is literally Microsoft's own documented use case for the function (see the "Remarks" quote under Q1 below) — keep it as the sole decision primitive, use the pipe purely for transport. |
| SDDL-string DACL restricted to Owner | Logon-SID-restricted DACL (Microsoft's own stated recommendation for named pipes, see Q2) | Microsoft's own guidance ("To prevent remote users or users on a different terminal services session from accessing a named pipe, use the logon SID on the DACL") scopes access **per logon session**, not per user account. GameLib's existing Unix trust boundary (`single_instance_dir`, scoped by `$HOME`) is per **user account**, not per session — the same user in two concurrent sessions (e.g. two RDP sessions) is already the same trust domain on Unix. Owner-SID scoping preserves that exact boundary on Windows; logon-SID scoping would be a narrower, behaviorally different boundary than what this codebase has established elsewhere. Recommended: Owner-SID SDDL (`"D:(A;;GA;;;OW)"`), not logon-SID — flagged here as a considered tradeoff, not a certainty, since it is a judgment call about which boundary is "correct" rather than a verified fact. |

**Installation:**
```bash
# From src-tauri/
cargo add windows-sys --target 'cfg(windows)' --no-default-features --features Win32_Foundation,Win32_System_Threading,Win32_System_Pipes,Win32_Storage_FileSystem,Win32_Security,Win32_Security_Authorization,Win32_System_Memory
```

**Version verification (run 2026-09-22 on this machine):** `windows-sys` 0.60.2 and 0.61.2 are both already present in `src-tauri/Cargo.lock` (transitively resolved from crates.io); no network fetch of a genuinely new crate is required to add a `"0.60"` request. Confirm the actual resolved version after adding with `cargo tree -i windows-sys` — this research does not claim in advance which of the already-present buckets Cargo will unify the new request into, only that no *new major version bucket* should be needed.

## Architecture Patterns

### System Architecture Diagram

```
Windows process start (main(), BEFORE tauri::Builder::default())
        │
        ▼
  install_panic_hook()  [existing, unix+windows]
        │
        ▼
  argv: Vec<String> = std::env::args().skip(1)      [existing]
        │
        ▼
  ┌─────────────────────────────────────────────────────────┐
  │  NEW: acquire_single_instance_windows()                  │
  │  CreateMutexW(Local\gamelib-single-instance-<user>)       │
  └─────────────────────────────────────────────────────────┘
        │
        ├─ ERROR_ALREADY_EXISTS ──► SECONDARY PATH
        │                             │
        │                             ▼
        │                     protocol_url_arg(&argv)
        │                     Some(url) -> payload=url
        │                     None      -> payload="__GAMELIB_FOCUS__"
        │                             │
        │                             ▼
        │                     connect \\.\pipe\gamelib-single-instance-<user>
        │                     (bounded retry, e.g. 5x100ms; std::fs::OpenOptions, no FFI)
        │                             │
        │                             ▼
        │                     write payload (best-effort; failure is logged, not fatal)
        │                             │
        │                             ▼
        │                     std::process::exit(0)   [ALWAYS — fail-open, never becomes a 2nd instance]
        │
        └─ mutex acquired ──► PRIMARY PATH (falls through to Builder::default() unchanged)
                                  │
                                  ▼
                          tauri::Builder::default() -> .setup(move |app| { ... })
                                  │
                                  ▼
                          spawn_sidecar(app.handle())        [existing, unchanged]
                                  │
                                  ▼
                  ┌───────────────────────────────────────────┐
                  │  NEW: named-pipe accept-loop thread         │
                  │  CreateNamedPipeW (DACL: Owner-only,         │
                  │    PIPE_REJECT_REMOTE_CLIENTS)               │
                  │  loop { ConnectNamedPipe; bounded read(4096);│
                  │         protocol_url_arg() re-validate;      │
                  │         dispatch to sidecar or focus window }│
                  └───────────────────────────────────────────┘
                                  │
                                  ▼
                  app.deep_link().on_open_url(...)   [existing — macOS-only in
                                  │                     practice; no Windows double-fire,
                                  │                     see "Timing proof" below]
                                  ▼
                  #[cfg(target_os = "linux")] register_all()   [existing — Windows
                                                                  stays out per Q7 below]
```

### Recommended Project Structure

No new files. All additions land in `src-tauri/src/main.rs`, in the existing "Single-instance guard" section (`main.rs:8159` onward), directly beside the `#[cfg(unix)]` implementation — mirroring how `shutdown_child`'s unix/non-unix split already lives side-by-side in one function rather than in separate modules.

### Pattern 1: Pure decision functions, OS calls only at the edges

**What:** Every existing Unix helper that does NOT touch the OS (`single_instance_socket_path`, `single_instance_dir`, `protocol_url_arg`, `deep_link_decision`, `sidecar_forward_args`, `cli_no_gui`) is a pure function taking explicit parameters, unit-tested with `#[cfg(test)] mod tests` on any host. Only `acquire_single_instance` itself (the one function that calls `UnixListener::bind`/`UnixStream::connect`) is `#[cfg(unix)]`-gated and untested at the unit level.

**When to use:** Apply the identical split to Windows. A pure `fn windows_single_instance_name(username: Option<&str>) -> Option<String>` (mirrors `single_instance_dir`'s `home: Option<&str>` parameter shape and its own doc-comment rationale: neither this file's `#[cfg(test)] mod tests` nor a parallel `cargo test` run may mutate process-global env vars) can be unit-tested on macOS/Linux CI runners too, even though the mutex/pipe calls themselves are `#[cfg(windows)]`-only.

**Example (recommended shape, not literal code to copy verbatim):**
```rust
// Pure, cross-platform-testable — mirrors single_instance_dir(home: Option<&str>)'s own
// "explicit parameter, not std::env::var internally" discipline, for the identical reason.
fn windows_single_instance_name(username: Option<&str>) -> Option<String> {
    let username = username.filter(|u| !u.is_empty())?;
    // Sanitize: pipe/mutex names forbid '\\'; keep it simple and printable.
    let safe: String = username.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    Some(safe)
}

fn windows_mutex_name(username: Option<&str>) -> Option<String> {
    windows_single_instance_name(username).map(|u| format!(r"Local\gamelib-single-instance-{u}"))
}

fn windows_pipe_name(username: Option<&str>) -> Option<String> {
    windows_single_instance_name(username).map(|u| format!(r"\\.\pipe\gamelib-single-instance-{u}"))
}
```

### Anti-Patterns to Avoid

- **Using `Global\` for the mutex name.** `Global\` is machine-wide across Terminal Services sessions and is the namespace a malicious co-resident user could pre-squat (Microsoft's own `CreateMutexW` remarks warn about exactly this: "a malicious user can create this mutex before you do and prevent your application from starting"). `Local\` is session-scoped by construction, which already satisfies "different Windows users must not collide," per Microsoft Learn's own `CreateMutexW` documentation (quoted under Q1 below).
- **Reusing `tauri-plugin-single-instance`'s `WM_COPYDATA` pattern.** Requires a live window + message pump; unavailable at the point this guard must run. See "Alternatives Considered" above.
- **Widening `sidecar_forward_args`'s allow-list "opportunistically."** Its own doc comment already forbids this outside an explicit future decision (D-44-A/T-34.5-G6-22) — this phase must not add a new forwarded flag as a side effect.
- **Logging the deep-link payload anywhere in the Windows guard.** T-34.5-G6-25 (rejected payloads never logged) applies identically to the new pipe transport; mirror the existing accept loop's `bytes={}`-only logging on rejection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| DACL from a permission string | Manual `SECURITY_DESCRIPTOR` byte construction | `ConvertStringSecurityDescriptorToSecurityDescriptorW` with an SDDL string (`"D:(A;;GA;;;OW)"`) | SDDL is the standard, documented, far-less-error-prone way to express "owner only" — building a `SECURITY_DESCRIPTOR` by hand via `InitializeSecurityDescriptor`/`SetSecurityDescriptorDacl`/`BuildExplicitAccessWithNameW` is 5-10x more code and a much larger surface for an ACL mistake (a security-critical mistake, since this is the ONLY thing preventing another Windows user's process from reading a `gamelib://` payload) |
| Argv URL validation on the new pipe transport | A second, "pipe-specific" validator | The existing `protocol_url_arg()` choke point, exactly as the Unix socket accept loop and `deep_link_decision` already do | This file's own standing rule, stated at `protocol_url_arg`'s own doc comment: "A FOURTH source belongs here too; the validation does not live at any call site, it lives in that one function." The named pipe is that fourth source. |

**Key insight:** every piece of this guard that is NOT genuinely platform-specific (name derivation, payload decision, the fail-open exit behavior) should be a pure function reusing or mirroring an existing pure function's shape — the Windows guard is not a parallel design, it is the same design with two OS-specific primitives substituted in.

## Q&A: the ten questions this research was asked to answer with evidence

### Q1 — Mutex vs. pipe-as-lock; stale-holder semantics; Local\ vs Global\; per-user scoping

**Primitive choice: named mutex for the decision, named pipe for transport.** Reasoning and the single-vs-two-primitive tradeoff are in "Alternatives Considered" above.

**Stale-holder semantics (redone for Windows, not copied from Unix) — `[VERIFIED: Microsoft Learn, CreateMutexW]`:**
> "Use the `CloseHandle` function to close the handle. The system closes the handle automatically when the process terminates. **The mutex object is destroyed when its last handle has been closed.**"

Consequence: if the primary process crashes (any termination, not just clean exit) while holding the only open handle to the named mutex, Windows closes that handle as part of process teardown, the object's reference count drops to zero, and the kernel object is destroyed. **The next `CreateMutexW` call with the same name creates a fresh object and succeeds cleanly (no `ERROR_ALREADY_EXISTS`).** This is the Windows-native equivalent of the Unix guard's "stale socket left by a crashed instance" handling — except it requires **zero code**: there is no file to detect-as-stale and `remove_file` before rebinding. This is the single biggest correctness/complexity difference from the Unix implementation and should be stated explicitly in the guard's own doc comment so a future reader does not go looking for a "handle the crashed-primary case" branch that does not need to exist.

**`Local\` vs `Global\`, and per-user isolation — `[VERIFIED: Microsoft Learn, CreateMutexW]`:**
> "The name can have a 'Global' or 'Local' prefix to explicitly create the object in the global or session namespace... Fast user switching is implemented using Terminal Services sessions. Kernel object names must follow the guidelines outlined for Terminal Services so that applications can support multiple users."

`Local\` is scoped to the calling process's Terminal Services session. Under normal interactive use (including Fast User Switching, which gives each simultaneously-logged-on user a distinct session), two different Windows users' `Local\gamelib-single-instance` objects are already namespace-isolated from each other by the OS — no cross-talk is possible even with an identical literal name. **Recommendation: still embed a sanitized username in the name** (`Local\gamelib-single-instance-<user>`), not for correctness (session isolation already provides that) but for operator debuggability (a `Get-Process`/log line naming the mutex is otherwise indistinguishable across users) and defense-in-depth, matching the existing Unix path's own belt-and-braces discipline (0700 dir AND 0600 file, when 0700 alone would suffice).

**Security caveat, also from the same Microsoft Learn page — worth carrying into the guard's own comment, `[VERIFIED]`:**
> "If you are using a named mutex to limit your application to a single instance, a malicious user can create this mutex before you do and prevent your application from starting."

This is a denial-of-service risk shared by every named-mutex single-instance implementation (including `tauri-plugin-single-instance`'s own), not something this design introduces. It is a DoS against availability, not a data-confidentiality or integrity issue — a Windows guard fail-open policy (start a primary-without-listener equivalent if the mutex path is somehow unusable) does not help here, because the attacker is *successfully* holding the mutex, not causing an error. Recorded as an accepted, shared-with-the-ecosystem residual risk, not a defect this phase needs to close.

### Q2 — Pipe security: default DACL, `PIPE_REJECT_REMOTE_CLIENTS`, minimal correct `SECURITY_ATTRIBUTES`

**Default DACL on `CreateNamedPipeW(..., NULL)` — `[VERIFIED: Microsoft Learn, "Named Pipe Security and Access Rights"]`:**
> "The ACLs in the default security descriptor for a named pipe grant full control to the LocalSystem account, administrators, and the creator owner. **They also grant read access to members of the Everyone group and the anonymous account.**"

This is too broad for a per-user trust boundary: `Everyone`/`ANONYMOUS LOGON` getting read access means any other logged-in user (or, in unusual configurations, a null-session network client) could read a payload written to this pipe. **`lpSecurityAttributes` must not be `NULL`.**

**Recommended DACL:** SDDL `"D:(A;;GA;;;OW)"` — deny-by-default DACL present (`D:`), one ACE granting Generic-All (`GA`) to the Owner (`OW`, i.e., the SID of the process's own token — the creating user). This restricts both server-open and client-connect access to processes running as the same Windows user account, matching the Unix guard's own per-`$HOME` (i.e. per-user, not per-session) trust boundary. Built via `ConvertStringSecurityDescriptorToSecurityDescriptorW`, wrapped in a `SECURITY_ATTRIBUTES { nLength, lpSecurityDescriptor, bInheritHandle: FALSE }`, and the resulting descriptor buffer freed with `LocalFree` once the pipe handle exists (the descriptor must outlive the `CreateNamedPipeW` call but does not need to outlive the process).

**`PIPE_REJECT_REMOTE_CLIENTS` — `[VERIFIED: WebSearch, cross-checked against the MS `CreateNamedPipeW` doc's own flag description]`:** must be set in `dwOpenMode`. Even though `\\.\pipe\name` is conventionally described as "local," the same pipe namespace is also reachable remotely as `\\<hostname>\pipe\name` over SMB unless this flag is explicitly set — defense-in-depth against an unexpected remote-reachability surface, independent of the DACL.

**Logon-SID alternative (Microsoft's own stated general guidance, considered and not adopted here):** see "Alternatives Considered" above for the reasoning — Owner-SID matches this codebase's existing per-user (not per-session) boundary more closely than logon-SID would.

### Q3 — Crate choice and what's already in the dependency tree

Answered fully in "Standard Stack" above: `windows-sys`, not `windows`, matching the narrow-surface convention every other Win32-FFI dependency in this tree already follows (`keyring`, `tray-icon`, `muda`, `tauri-plugin-updater` — see the `windows-sys` dependents list in the Package Legitimacy Audit table). Multiple versions (0.45.0 through 0.61.2) are already resolved in `Cargo.lock`; request `"0.60"` to maximize the chance of reuse, but verify the actual resolution with `cargo tree -i windows-sys` at implementation time rather than assuming.

### Q4 — Blocking vs. threaded pipe server; `ERROR_PIPE_CONNECTED`; shutdown

**Mirror the Unix accept loop's placement exactly:** create the named pipe (server) as part of mutex acquisition, pre-`Builder`, but do **not** start the blocking accept loop until inside `.setup()`, after `spawn_sidecar` — matching `main.rs:8926-8993`'s existing `#[cfg(unix)] if let Some(listener) = primary_listener { ... thread::spawn(...) }` shape precisely. A `std::thread::spawn`'d closure looping `ConnectNamedPipe` blocks that one thread only; the main thread and the tao/wry event loop are unaffected.

**`ERROR_PIPE_CONNECTED` pitfall — `[ASSUMED: well-documented, extremely common Win32 named-pipe idiom, not independently re-verified against MS Learn in this session; flag for a quick confirmation at implementation time]`:** if a client connects in the (short) window between `CreateNamedPipeW` returning and the server calling `ConnectNamedPipe`, `ConnectNamedPipe` returns `FALSE` with `GetLastError() == ERROR_PIPE_CONNECTED`. This is **not a failure** — it means a client is already connected and the server should proceed directly to reading, exactly as if `ConnectNamedPipe` had returned success. The accept loop must special-case this return value or a benign race will be misreported as a connection error and silently drop the first fast-arriving deep link.

**Shutdown:** no special handling needed. The accept-loop thread is never `.join()`'d (matching the existing Unix thread and the existing `deep_link_rx` worker thread, whose own comment states "Ends only when the sender is dropped, i.e. at process exit"). Normal process termination (including the existing `std::process::exit(1)` panic-avoidance paths and the `RunEvent::Exit` → `shutdown_child()` → process end path) tears down all threads unconditionally; a blocked `ConnectNamedPipe` call does not need to be interrupted first.

### Q5 — Secondary-side delivery: connect, `ERROR_PIPE_BUSY`, and the fail-open policy when the mutex says Primary but the pipe is unreachable

**Client connect:** plain `std::fs::OpenOptions::new().read(true).write(true).open(pipe_path)` — no FFI needed (Windows named pipes are reachable through the ordinary file API). On `ERROR_PIPE_BUSY` (raw OS error 231, readable via `io::Error::raw_os_error()`), retry with a short bounded backoff (e.g. 5 attempts × 100ms) rather than pulling in `WaitNamedPipeW` — this keeps the entire client/secondary side FFI-free, at the cost of a slightly less precise wait than the Win32-native `WaitNamedPipeW` API would give.

**Fail-open policy when the mutex says Primary-exists but the pipe cannot be reached (primary still starting, or hung):** **exit anyway, accepting a lost deep link — do not fall back to becoming a second instance.** This is not a new policy choice invented for Windows; it is the Unix guard's own existing, already-shipped behavior, read directly from `main.rs:8825-8834`:
```rust
match UnixStream::connect(path) {
    Ok(mut stream) => { ... }
    Err(e) => eprintln!("[shell] WARN: secondary instance failed to deliver {kind} ... : {e}"),
}
std::process::exit(0);   // <-- unconditional; runs whether or not the write succeeded
```
The Windows implementation should match this exactly: attempt best-effort delivery, log a warning on failure (byte count/reason only, never re-log the payload), and `exit(0)` unconditionally. A second sidecar over one set of store files and one download queue (D-44-A's whole reason for existing) is a strictly worse outcome than an occasionally-lost deep link.

### Q6 — Windows argv shape, quoting, and the double-dispatch question

**Argv shape — `[VERIFIED: this repo's own generated `installer.nsi`, captured in the `260922-nx4` addendum]`:** the NSIS-generated `shell\open\command` registry value is
```
"C:\...\GameLib.exe" "%1"
```
i.e. the executable path and the full URL are each their own quoted argument. `protocol_url_arg` (`main.rs:8009`) already handles this correctly today — it searches `args` for any element that `starts_with("gamelib://")`, with no assumption about argument position, so the existing implementation needs no change for Windows argv shape. `&` characters inside the URL survive intact inside the quoted `%1` substitution (this is exactly the historical macOS `.app` bug `protocol_url_arg`'s own doc comment references — an *unquoted* shell template split on `&`; the NSIS-generated command here is quoted from the start, so that failure mode does not apply).

**Double-dispatch — `[VERIFIED: `tauri-plugin-deep-link-2.4.9/src/lib.rs` + `tauri-2.11.5/src/app.rs`, both read directly from the vendored source on this machine]`:** **there is no double-dispatch risk.** Full reasoning:

1. `tauri_plugin_deep_link::init()`'s `Builder::setup` closure calls `init_deep_link`, which on desktop calls `deep_link.handle_cli_arguments(std::env::args())` **synchronously, during plugin initialization**.
2. `handle_cli_arguments` (`lib.rs:196`), on Windows, checks `config.desktop.contains_scheme(...)` — today this is always false (the `tauri.windows.conf.json` override sets `schemes: []`), so nothing happens. **Once the override is removed and `schemes: ["gamelib"]` applies to Windows**, this check will pass for a `gamelib://` cold-start argv, and the function will call `self.app.emit("deep-link://new-url", vec![url])`.
3. GameLib's own `app.deep_link().on_open_url(...)` listener (`main.rs:9074`) is registered inside the **app-level** `.setup()` closure — the one passed to `tauri::Builder::default().setup(move |app| { ... })`.
4. Tauri's own bootstrap order (`tauri-2.11.5/src/app.rs`): `Builder::build()` calls `app.manager.initialize_plugins(handle)` at line 2440 (this is where every plugin's own `.setup()`, including step 1-2 above, runs) and returns. The **app-level** `setup` closure (step 3) does not run until the separate `setup()` function at line 2521-2532, called later from `App::run`, specifically at line 2530: `if let Some(setup) = app.setup.take() { (setup)(app)... }`.
5. Therefore: the plugin's own `emit` (step 2) happens strictly **before** GameLib's `on_open_url` listener (step 3) is registered. Tauri's event system (`Listener::listen`) does not replay past events to a listener registered after the fact. **The plugin's own cold-start emission is a no-op — nobody is listening yet.**

Net effect: removing the Windows override does not create a second delivery path for cold-start argv. Windows argv delivery continues to run exclusively through `sidecar_forward_args` → `protocol_url_arg`, exactly as it does today (confirmed unconditional/ungated at both call sites by the `260922-nx4` quick task and independently re-confirmed by this research). The plugin's own `handle_cli_arguments` becomes exactly as harmless once schemes are non-empty as it already is today when they're empty — just for a different, timing-based reason instead of a scheme-mismatch reason.

**Caveat on this proof:** it rests on Tauri's *current* bootstrap ordering (2.11.5) and the deep-link plugin's *current* event-emission implementation (2.4.9), both pinned exactly in this repo's `Cargo.lock`. This is a structural fact about specific, currently-pinned versions, not a documented contract Tauri promises to preserve across upgrades — a **regression test is warranted** (see Validation Architecture below) so a future `tauri`/`tauri-plugin-deep-link` version bump that changes this ordering is caught rather than silently reintroducing double-dispatch.

### Q7 — Should Windows also call runtime `register_all()`, and does it self-heal the stale Electron-era HKCU key?

**`register()`'s Windows implementation always targets `CURRENT_USER` (HKCU) — `[VERIFIED: tauri-plugin-deep-link-2.4.9/src/lib.rs:259-281]`:**
```rust
let key_reg = CURRENT_USER.create(&key_base)?;
...
let cmd_reg = CURRENT_USER.create(format!("{key_base}\\shell\\open\\command"))?;
cmd_reg.set_string("", format!("\"{exe}\" \"%1\""))?;
```
Regardless of the NSIS installer's own `installMode` setting, a runtime `register_all()` call would write to HKCU, always.

**GameLib's NSIS `installMode` — `[VERIFIED: tauri-utils-2.9.3/src/config.rs:822-841]`:** GameLib declares no `bundle.windows.nsis.installMode` override anywhere in `tauri.conf.json`/`tauri.windows.conf.json`, so the Tauri-documented default applies: `NSISInstallerMode::CurrentUser` (`#[default]`), whose own doc comment states "Installer metadata will be saved under the `HKCU` registry path." **The installer and any runtime `register_all()` call would write to the same registry hive (HKCU).** There is no HKLM/HKCU split to reconcile for this project's current install-mode configuration.

**Does re-running the (fixed) installer self-heal the stale 2026-07-20 Electron-era HKCU key at `C:\Program Files\GameLib\GameLib.exe`?** Yes, mechanically — `WriteRegStr` unconditionally overwrites the target value regardless of its prior contents; it is not a conditional/"write if absent" operation. The `installer.nsi` evidence already captured in this phase's own todo (`260922-nx4` addendum) shows the exact line that would run: `WriteRegStr SHCTX "Software\Classes\gamelib\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""`. Once the Windows override is removed and the installer next runs on the operator's machine, this line executes and overwrites the stale path unconditionally. **No extra code is needed to "clean up" the stale key specifically — the existing installer mechanism already does it, once un-suppressed.**

**Recommendation on widening the runtime `#[cfg(target_os = "linux")]` gate to include Windows: do not widen it.** Reasoning:
- The self-heal above already covers the update-from-stale-Electron-install scenario via the installer alone.
- The documented reason `register_all()` exists at runtime for Linux is explicitly to cover installs that bypass a proper installer (the plugin's own doc comment: "useful to ensure the schemes are registered even if the user did not install the app properly (e.g. an AppImage that was not properly registered)"). GameLib's Windows distribution is the NSIS installer exclusively (`tauri.conf.json`'s `bundle.targets` includes `"nsis"`, no portable/zip Windows target declared) — the AppImage-specific problem this exists to solve for Linux does not have a Windows analogue in this project today.
- A runtime call also means every launch attempts an HKCU write, which needs the same `CI=e2e` guard Linux already has (or every automated/CI Windows launch would rewrite the host's protocol association) — extra surface for no currently-identified benefit.

This is a **recommendation, not a locked decision** — no CONTEXT.md exists for this phase (verified: the phase directory contains only `.gitkeep`), so this is exactly the kind of call the planner should either lock directly or route through `/gsd:discuss-phase` if the operator wants it treated as a genuine decision point rather than accepted research guidance.

### Q8 — Sidecar/shutdown interaction

`SidecarState::shutdown_child`'s Windows arm (`main.rs:1229-1234`, `#[cfg(not(unix))] { child.kill() ... }`) is unaffected by this phase — it operates on the sidecar `Child` handle held in `SidecarState`, which is entirely independent of the single-instance mutex/pipe. The one interaction worth naming explicitly: **the mutex is released (object destroyed, since the primary is the sole handle-holder) essentially instantaneously on process exit, while `shutdown_child()`'s `child.kill()` + `child.wait()` may still be completing.** This creates a narrow window where a *new* launch could acquire the mutex and start spawning its own sidecar while the *previous* instance's sidecar is still being torn down. This is a pre-existing category of risk already accepted on Unix too (the Unix mutex-equivalent, the socket file, is similarly removed/reusable essentially as soon as the listener is dropped, independent of sidecar teardown timing) — **not a new risk this phase introduces**, and out of this phase's scope to fix (it would require blocking the mutex's own lifetime on the sidecar's confirmed exit, which is a bigger architectural change than a Windows port of the existing guard). Worth a one-line comment in the implementation noting it is a known, shared-with-Unix residual, not something silently missed.

### Q9 — Testability: pure vs. `#[cfg(windows)]`-only, plus the source-gate TS convention

**Pure, testable on any host (mirror `single_instance_dir`'s own discipline):**
- Name derivation (`windows_single_instance_name`/`windows_mutex_name`/`windows_pipe_name` as sketched above)
- The payload decision (already exists and needs no Windows-specific version: `protocol_url_arg`/`deep_link_decision` are unconditional, cross-platform pure functions today)

**Windows-only, `#[cfg(windows)]`-gated, requires running `cargo test` ON a Windows host:**
- The actual `CreateMutexW`/`CreateNamedPipeW` acquisition/accept-loop functions (mirrors `acquire_single_instance`'s own `#[cfg(unix)]` gate and its own lack of unit-test coverage — that function is exercised only by the live gate, not by `cargo test`, and the Windows equivalent should follow the identical precedent rather than attempt to mock Win32 syscalls)

**TS source-gate convention (`src/backend/__tests__/tauriShellSource.test.ts`) — what it should pin, following the file's own established pattern exactly:**
- Positive tokens: `fn windows_mutex_name(` / `fn windows_pipe_name(` (or whatever the actual chosen function names end up being) exist in the real source, each asserted with the `(` boundary discipline this file's own comment already explains is load-bearing (a bare, unparenthesized token is a substring of its own `#[cfg(test)]` test-function name and would pass vacuously past a deletion — this file has already been burned by exactly this mistake once, per its own comment at `tauriShellSource.test.ts:2196-2203`).
- Negative/structural token: the region-based pattern already used for `deep_link_decision`/`protocol_url_arg` (asserting the validation call appears within N characters of the function start, not merely "exists somewhere in the file") should be replicated for the new pipe accept loop's own `protocol_url_arg(&[trimmed.to_string()])` call, exactly mirroring the existing Unix accept loop's own assertion shape.
- Once the `tauri.windows.conf.json` override is removed, invert `windowsDeepLinkSuppression.test.ts` Tests A and E in the **same commit** (already explicitly required by the todo and by that test file's own header comment) — do not leave this as a follow-up.
- A **new** structural test asserting the double-dispatch-safety property from Q6: that `on_open_url`'s listener registration occurs inside the `.setup()` closure body (not before `tauri::Builder::default()`), so a future edit cannot accidentally move it earlier and reopen the double-dispatch question this research just closed by version-specific reasoning.

**Live verification protocol (the todo's own minimum bar, concrete commands for this machine):**
1. With a packaged GameLib build running, open `gamelib://launch?appName=<known-appid>` from **outside** the app (e.g. `Start-Process 'gamelib://launch?appName=...'` in a separate PowerShell window, or via a browser address bar) and confirm the **already-running** instance reacts (existing window focuses / sidecar receives the URL) rather than a second window appearing.
2. Count sidecar processes immediately after: the packaged sidecar binary name is `gamelib-sidecar.exe` (confirmed: `app.shell().sidecar("gamelib-sidecar")` at `main.rs:8318`, and the shipped binary is `src-tauri/binaries/gamelib-sidecar-x86_64-pc-windows-msvc.exe`, renamed by Tauri's sidecar convention at bundle time). Command: `Get-Process -Name gamelib-sidecar -ErrorAction SilentlyContinue` (PowerShell) or `tasklist /FI "IMAGENAME eq gamelib-sidecar.exe"` (cmd) — expect exactly **one** row before and after the external open.
3. Before either check: grep the freshly generated `src-tauri/target/*/nsis/x64/installer.nsi` for `Classes\gamelib` and confirm 6 lines are present (the same lines the `260922-nx4` addendum already captured for the control run) — a 0-line result means the override removal did not take effect and the rest of the live check will silently prove nothing.
4. **Packaged-build constraint carried over from the darwin-symlink todo:** `pnpm tauri:dev` (using `devUrl`) cannot exercise `frontendDist`/the real bundled sidecar path — per the existing `R-34.5-G1-PKG` lesson already recorded elsewhere in this project's history — so this live check must run against a `tauri build --debug --bundles nsis`-produced, installed build, not `tauri:dev`. The `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` todo's three layered fixes (or its documented local workaround — deleting `build/bin/arm64/darwin` and re-running once) are a precondition for getting that packaged build to exist on this machine at all.

### Q10 — Does `cargo check`/`cargo test` work on this machine today?

**`cargo check`: YES, clean.** Run directly on this machine (2026-09-22):
```
Finished `dev` profile [unoptimized + debuginfo] target(s) in 54.10s
```
10 pre-existing warnings (unused imports/variables, several dead-code functions), zero errors. Two of the ten warnings are directly relevant to this phase's own starting point: `single_instance_socket_path_var`/`single_instance_dir`/`single_instance_socket_path` are flagged unused/dead-code on Windows today — expected and correct, since their only call site is inside the `#[cfg(unix)]` block, and this phase's job is to give the Windows target its own call site for the equivalent logic.

**`cargo test`: NO — does not compile, for reasons unrelated to this phase.** Run directly on this machine (2026-09-22), `cargo test --bin gamelib-shell`:
```
error[E0425]: cannot find function `store_embed_open_args` in this scope
error[E0425]: cannot find function `store_embed_navigate_args` in this scope
error[E0425]: cannot find function `store_embed_set_bounds_args` in this scope
error: could not compile `gamelib-shell` (bin "gamelib-shell" test) due to 6 previous errors
```
**Root cause, fully diagnosed:** `store_embed_open_args`, `store_embed_set_bounds_args`, and `store_embed_navigate_args` (`main.rs:5098`, `5297`, `5406`) are all `#[cfg(target_os = "macos")]`-gated (the in-app embedded store browser, macOS-only per Cargo.toml's own D-03 comment). Four `#[test]` functions in the same file's `#[cfg(test)] mod tests` call these helpers **without a matching `#[cfg(target_os = "macos")]` guard on the test functions themselves**: `store_embed_wire_contract_open_parses_the_shipped_payload` (`main.rs:9758`), `store_embed_wire_contract_set_bounds_parses_the_shipped_payload` (`main.rs:9766`), `store_embed_wire_contract_navigate_parses_the_shipped_payload` (`main.rs:9773`), and `store_embed_wire_contract_rejects_the_positional_shape_that_shipped` (`main.rs:9782`) — six call sites total across these four functions, matching the compiler's own "6 previous errors" count exactly.

**This is a Wave 0 blocker for this phase, not a defect this phase's own work causes or needs to silently work around.** Every new Rust unit test this phase adds lives in the same compilation unit (`gamelib-shell`'s single binary target has no separate lib crate — confirmed by `cargo test --lib` itself failing with "no library targets found in package `gamelib-shell`", and by the Cargo.toml's own comment: "Binary crate: the desktop shell entrypoint lives in src/main.rs"). **A single compile error anywhere in `main.rs`'s test module blocks 100% of `cargo test`, including every test this phase would add.** The minimal, mechanical fix is to add `#[cfg(target_os = "macos")]` above each of the four affected test functions (or, more narrowly, above just the `store_embed_*`-referencing assertions inside them) — a one-line-per-function change, unrelated in every other respect to this phase's own scope, but a hard precondition for this phase's own `cargo test` gate to mean anything at all.

## Common Pitfalls

### Pitfall 1: Treating `ERROR_ALREADY_EXISTS` from `CreateMutexW` as fatal instead of the expected Secondary signal
**What goes wrong:** Code that only checks the return `HANDLE` for null (as an "error") misses the case — `CreateMutexW` still returns a **valid, usable handle** to the existing mutex object even when `GetLastError() == ERROR_ALREADY_EXISTS`; the handle is not null.
**Why it happens:** The success/failure signal here is `GetLastError()`, not the return value's nullness, which is an easy habit-mismatch coming from POSIX-style APIs (where a non-null/non-negative return usually means unambiguous success).
**How to avoid:** Always check `GetLastError()` immediately after a non-null `CreateMutexW` return, before doing anything else with the handle.
**Warning signs:** A guard that "never" detects a second launch, or one that always treats every launch (including the very first) as Secondary.

### Pitfall 2: Forgetting `bInheritHandle: FALSE` on the mutex's `SECURITY_ATTRIBUTES`
**What goes wrong:** If the mutex handle is inheritable and the sidecar (or any future child process spawned by this shell) inherits it, the mutex's reference count includes that child, and the mutex object survives even after the primary Tauri process itself has fully exited — delaying or preventing the self-cleaning behavior Q1 relies on.
**Why it happens:** `SECURITY_ATTRIBUTES::bInheritHandle` defaults to whatever the struct is zero/default-initialized to, which can silently be `TRUE` depending on how the struct is built.
**How to avoid:** Explicitly set `bInheritHandle: 0` (FALSE) when constructing the `SECURITY_ATTRIBUTES` for the mutex (a `NULL` `lpMutexAttributes` also defaults to non-inheritable, per the `CreateMutexW` doc quoted under Q1 — this only matters once a custom `SECURITY_ATTRIBUTES` is introduced for the pipe or, if ever added, the mutex).

### Pitfall 3: Deep-link URLs containing `&` breaking argv splitting
**What goes wrong:** An unquoted shell command template splits a `gamelib://launch?appName=X&foo=Y`-shaped URL at the `&`, truncating it.
**Why it happens:** Exactly the historical macOS `.app`-bundle bug `protocol_url_arg`'s own doc comment already documents (`main.rs:8000-8007`).
**How to avoid:** Not a new risk for this phase — the NSIS-generated `shell\open\command` value is already fully quoted (`"$INSTDIR\...\GameLib.exe" "%1"`, confirmed directly from this project's own generated `installer.nsi`, see Q6). No action needed, but worth confirming again at live-verification time with a URL that actually contains `&`.

## Code Examples

### Sanitized per-user name derivation, testable without touching the registry
```rust
// Mirrors single_instance_dir(home: Option<&str>)'s own explicit-parameter discipline
// (main.rs:8108's own doc comment: neither #[cfg(test)] mod tests nor a parallel `cargo test`
// run may mutate process-global env vars).
fn windows_single_instance_user(username: Option<&str>) -> Option<String> {
    let username = username.filter(|u| !u.is_empty())?;
    Some(
        username
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect(),
    )
}
```

### SDDL construction sketch (illustrative — exact windows-sys call signatures to be confirmed against the crate's generated bindings at implementation time)
```rust
// Source: MS Learn "Named Pipe Security and Access Rights" + CreateMutexW page (read this session)
const PIPE_SDDL: &str = "D:(A;;GA;;;OW)"; // Deny-by-default DACL; Owner only, Generic-All.
// ConvertStringSecurityDescriptorToSecurityDescriptorW(PIPE_SDDL, SDDL_REVISION_1, &mut psd, None)
// -> build SECURITY_ATTRIBUTES { nLength, lpSecurityDescriptor: psd, bInheritHandle: FALSE }
// -> CreateNamedPipeW(name, PIPE_ACCESS_DUPLEX, PIPE_TYPE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
//                     PIPE_UNLIMITED_INSTANCES, out_buf, in_buf, 0, Some(&security_attributes))
// -> LocalFree(psd) once the pipe handle is created (the descriptor does not need to outlive it)
```

### Fail-open exit on the secondary path (mirrors `main.rs:8810-8838` exactly)
```rust
// SECONDARY: best-effort delivery, unconditional exit — never falls back to "become primary".
match connect_and_write_windows_pipe(&pipe_path, &payload) {
    Ok(()) => {}
    Err(e) => eprintln!(
        "[shell] WARN: secondary instance failed to deliver {kind} to the running instance: {e}"
    ),
}
std::process::exit(0);
```

## State of the Art

| Old Approach (this repo's Unix guard) | Windows equivalent | When it diverges | Impact |
|---|---|---|---|
| `UnixListener::bind` doubles as both the lock and the transport | `CreateMutexW` (lock) + `CreateNamedPipeW` (transport) — two primitives | Windows named pipes' `FILE_FLAG_FIRST_PIPE_INSTANCE` COULD in principle collapse this to one primitive, but was rejected here (ambiguous `ERROR_ACCESS_DENIED`, see "Alternatives Considered") | Two Windows-specific OS calls at guard-acquisition time instead of one; no material runtime cost |
| Stale socket file detected via failed `connect()`, then explicitly `remove_file`d before rebinding | Nothing — kernel object destroyed automatically when the crashed primary's last handle closes | Always, by Windows kernel-object-lifetime design (see Q1) | Simpler Windows implementation; no equivalent branch needs porting |
| `0700` directory + `0600` socket file as the trust boundary | DACL on the named pipe (SDDL, Owner-only) + session-scoped `Local\` mutex namespace | Always — Windows has no filesystem artifact to chmod at all | No filesystem footprint; the entire guard is OS-namespace objects only |

**Deprecated/outdated:** none — this is greenfield Windows work, not a port of a previously-shipped Windows mechanism.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `ERROR_PIPE_CONNECTED` must be special-cased after `ConnectNamedPipe` returns `FALSE` (i.e. treated as a successful connection, not an error) | Q4 | Low — this is an extremely well-known, decades-old Win32 named-pipe idiom; if wrong, the failure mode is a dropped first-fast-arriving deep link on a narrow timing race, not a security or correctness defect. Recommend a 30-second confirmation against the `ConnectNamedPipe` MS Learn page at implementation time before treating it as settled. |
| A2 | Owner-SID SDDL (`"D:(A;;GA;;;OW)"`) is the right DACL choice over Microsoft's own suggested logon-SID approach, to match this codebase's existing per-user (not per-session) trust boundary | Q2, "Alternatives Considered" | Medium — this is a judgment call about which boundary the operator actually wants (same user, two concurrent RDP sessions: should they share one instance, or not?). If the operator's actual intent is per-session isolation, this recommendation is wrong and should be flipped to logon-SID. Recommend surfacing this explicitly as a discuss-phase question rather than treating it as settled by this research alone. |
| A3 | GameLib's Windows distribution has no portable/zip target today (only NSIS), which is the basis for recommending against widening runtime `register_all()` to Windows | Q7 | Low-Medium — verified against `tauri.conf.json`'s `bundle.targets: ["nsis", "appimage", "dmg"]` directly (no Windows portable entry), but if a future phase adds a portable Windows distribution, this recommendation should be revisited. |

## Open Questions

1. **Exact Owner-SID vs. logon-SID DACL choice (A2 above).**
   - What we know: Microsoft's own general guidance recommends logon-SID for named-pipe session isolation; this codebase's existing Unix precedent is per-user, not per-session.
   - What's unclear: whether the operator has an actual multi-session-same-user Windows usage pattern (e.g. RDP) where the distinction would matter in practice.
   - Recommendation: proceed with Owner-SID (matches existing precedent) unless the operator flags a specific multi-session need during planning/discuss-phase.

2. **Whether to add a CI step that runs `cargo check`/`cargo test` on Windows at all**, given this research found `cargo test` currently does not compile there and CI runs neither command today (`release-tauri.yml` invokes `tauri-action@v1`, which internally does a release `cargo build`, but there is no explicit `cargo check`/`cargo test` step in any workflow).
   - What we know: this phase's own new Rust tests will only ever be exercised by a human running `cargo test` locally on Windows (this machine), never by CI, unless a new CI step is added — which is a larger, separate concern than this phase's own scope.
   - What's unclear: whether adding Windows Rust CI is in scope for this phase or a separate future todo.
   - Recommendation: out of scope for this phase; file as a follow-up todo if not already covered by existing Windows CI gaps (`2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` and the darwin-symlink todo already track adjacent Windows CI health issues).

<phase_requirements>
## Phase Requirements

No requirement IDs were assigned to this phase before research (`phase_req_ids: null`). The following REQ-46-xx IDs are **proposed** for the planner to mint (or amend) at `/gsd:plan-phase 46`, each mapped to the research that supports it:

| Proposed ID | Description | Research Support |
|---|---|---|
| REQ-46-01 | A Windows single-instance guard runs before `tauri::Builder::default()` and is FAIL-OPEN (never fail-closed) on every recoverable failure, mirroring `T-34.5-G6-24`'s existing Unix discipline | Q1 (mutex self-cleaning semantics), Q5 (unconditional exit-on-secondary-path precedent), "Standard Stack"/"Architecture Patterns" |
| REQ-46-02 | The guard's primary/secondary decision uses a `Local\`-namespaced, per-user-disambiguated named mutex; two different Windows users on one machine never collide or cross-talk | Q1 |
| REQ-46-03 | A named-pipe transport, DACL-restricted to the creating user (Owner SID) with `PIPE_REJECT_REMOTE_CLIENTS`, carries the URL or `__GAMELIB_FOCUS__` sentinel from a secondary process to the running primary | Q2, Q4 |
| REQ-46-04 | Every payload arriving over the new pipe transport is re-validated through `protocol_url_arg()` before dispatch; a rejected payload is never logged (byte count/reason only) | Q2, Q5, existing `T-34.5-G6-20`/`T-34.5-G6-25` (Don't Hand-Roll table) |
| REQ-46-05 | The `plugins.deep-link.desktop.schemes: []` override is removed from `tauri.windows.conf.json`, and `windowsDeepLinkSuppression.test.ts` Tests A/E are inverted in the same commit | Q6, Q9 |
| REQ-46-06 | A recorded decision on whether Windows also calls runtime `register_all()` (widening the `#[cfg(target_os = "linux")]` gate) or relies on the NSIS installer alone | Q7 (recommendation: do not widen; treat as a decision point, not a default) |
| REQ-46-07 | Pure Windows-guard helper functions (name derivation, payload decision) are unit-tested cross-platform; `#[cfg(windows)]`-only acquisition/accept-loop code is exercised by the live gate, not by mocked unit tests, mirroring the existing `#[cfg(unix)]` precedent | Q9 |
| REQ-46-08 | A structural TS source-gate test (in `tauriShellSource.test.ts`) pins that `on_open_url`'s listener registration remains inside the app-level `.setup()` closure, preventing a future edit from reopening the double-dispatch question this research closed by version-specific reasoning | Q6, Q9 |
| REQ-46-09 (Wave 0 prerequisite) | The pre-existing `cargo test` compile break on Windows (four `store_embed_wire_contract_*` test functions calling `#[cfg(target_os = "macos")]`-gated helpers without a matching guard) is fixed before or alongside this phase's own Rust test additions | Q10 |
| REQ-46-10 | Live verification on the operator's Windows machine: an external `gamelib://` open reaches the running instance, exactly one `gamelib-sidecar.exe` process exists afterward, and the generated `installer.nsi` contains the six `Classes\gamelib` lines before the check is trusted | Q9 (live verification protocol), Q6 |

</phase_requirements>

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Rust toolchain (`cargo`/`rustc`) | Entire phase | Yes | rustc 1.98.1, cargo 1.98.1 (both confirmed on this machine, 2026-09-22) | — |
| `cargo check` (src-tauri) | Compile-health gate | Yes — clean, 54.10s, 10 pre-existing warnings, 0 errors | — | — |
| `cargo test` (src-tauri) | Rust unit tests for this phase | **No** — 6 compile errors, pre-existing and unrelated (see Q10) | — | Fix the 4 affected `#[cfg(test)]` functions (add `#[cfg(target_os = "macos")]`) as a Wave 0 task before this phase's own tests can run |
| Windows Developer Mode | Packaged build (`vite build` → `tauri build --bundles nsis`) | Yes — enabled by the operator 2026-09-22, per the todo's own addendum | — | — |
| `TAURI_SIGNING_PRIVATE_KEY` | Updater-artifact signing (NOT required for this phase's own live gate — an unsigned debug build is sufficient) | No (not on this machine, per the todo's own addendum) | — | Build with `--debug`, skip signing; irrelevant to the single-instance/deep-link live check itself |
| `slopcheck` (Python) | Package Legitimacy Audit | Installed this session (`pip install slopcheck`) | 0.6.1 | — |

**Missing dependencies with no fallback:** none blocking this phase's own live-verification scope.
**Missing dependencies with fallback:** `cargo test` (fallback: fix the unrelated Wave 0 compile break first — a small, mechanical, well-diagnosed change, not a workaround that papers over the gap).

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework (Rust) | `cargo test` against the `gamelib-shell` binary target's own `#[cfg(test)] mod tests` (no separate lib crate — confirmed: `cargo test --lib` fails with "no library targets found") |
| Framework (TS source-gate) | Jest (`ts-jest` preset), `src/backend/__tests__/tauriShellSource.test.ts` and `windowsDeepLinkSuppression.test.ts` |
| Config file (Rust) | none — inline `#[cfg(test)] mod tests` at the bottom of `src-tauri/src/main.rs` |
| Config file (TS) | `jest.config.js` (repo root) |
| Quick run command (Rust) | `cd src-tauri && cargo test --bin gamelib-shell <filter>` — **currently blocked**, see Q10/Wave 0 Gaps |
| Quick run command (TS) | `pnpm exec jest src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/windowsDeepLinkSuppression.test.ts` |
| Full suite command (Rust) | `cd src-tauri && cargo test --bin gamelib-shell` |
| Full suite command (TS) | `pnpm test` (repo-wide Jest) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| REQ-46-01/02 | Mutex name derivation is pure and per-user | unit (Rust) | `cargo test windows_single_instance_user -- --nocapture` | ❌ Wave 0/this phase |
| REQ-46-03/04 | Pipe payload re-validated through `protocol_url_arg`; rejected payload not logged | unit (Rust, region-based, mirroring `protocol_url_arg_rejects_*` tests already in the file) | `cargo test protocol_url_arg` (existing, extend) | ✅ existing tests extend; ❌ new pipe-specific region assertions |
| REQ-46-05 | `tauri.windows.conf.json` override removed; suppression test inverted | jest | `pnpm exec jest windowsDeepLinkSuppression.test.ts` | ✅ exists, needs inversion in same commit |
| REQ-46-06 | Recorded decision on runtime `register_all()` widening | structural (TS source-gate), mirroring the existing `cfgGuardAboveRegisterAll` test in `tauriShellSource.test.ts` | `pnpm exec jest tauriShellSource.test.ts -t "register_all"` | ✅ existing pattern to extend |
| REQ-46-08 | `on_open_url` listener stays inside `.setup()`, not before `Builder::default()` | structural (TS source-gate, new) | `pnpm exec jest tauriShellSource.test.ts -t "on_open_url"` | ❌ new test needed |
| REQ-46-09 | `cargo test` compiles cleanly on Windows | compile smoke | `cargo test --bin gamelib-shell --no-run` | ❌ Wave 0 fix required first |
| REQ-46-10 | Live: external open reaches running instance; exactly one sidecar process | manual-only (live gate) | `Get-Process -Name gamelib-sidecar -ErrorAction SilentlyContinue` + manual `gamelib://` open | N/A — manual, hardware-only |

### Sampling Rate
- **Per task commit:** the Rust quick-run filter for whatever function was just touched, plus the relevant Jest file.
- **Per wave merge:** full Rust suite (`cargo test --bin gamelib-shell`) once REQ-46-09's Wave 0 fix lands, plus full `pnpm test`.
- **Phase gate:** both full suites green, THEN the live gate (REQ-46-10) — a green test suite alone does not close this phase, per this project's own standing "packaged-not-dev" and "live gate required" discipline already established for Phase 35.

### Wave 0 Gaps
- [ ] **Fix the pre-existing `cargo test` compile break** (REQ-46-09): add `#[cfg(target_os = "macos")]` to `store_embed_wire_contract_open_parses_the_shipped_payload`, `store_embed_wire_contract_set_bounds_parses_the_shipped_payload`, `store_embed_wire_contract_navigate_parses_the_shipped_payload`, and `store_embed_wire_contract_rejects_the_positional_shape_that_shipped` (`main.rs:9758`, `9766`, `9773`, `9782`). Without this, `cargo test` cannot run on Windows at all, blocking every other Rust-level test this phase adds.
- [ ] A packaged Windows build (`tauri build --debug --bundles nsis`) must exist and be installed on the live-gate machine before REQ-46-10 can run — precondition tracked by the separate `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` todo, not owned by this phase but blocking its own live gate.

## Project Constraints (from CLAUDE.md)

- **Tech stack:** React + TypeScript on a Rust/Tauri shell; GameLib is independent (not tracking upstream Heroic) — no constraint violated by this research (Windows-only Rust addition).
- **Compatibility:** Linux, macOS, Windows — this phase is Windows-only by design; the `#[cfg(unix)]`/`#[cfg(windows)]` split already established in `main.rs` (e.g. `shutdown_child`, `configure_sidecar_process_group`) is the correct precedent to follow, and this research's recommendations follow it.
- **GSD workflow enforcement:** all direct file edits for this phase must go through `/gsd-execute-phase` per CLAUDE.md — this research session made no source-file edits (only ran `cargo check`/`cargo test`/`slopcheck`, all read-only with respect to the repository, and confirmed no `Cargo.toml`/registry writes occurred).
- **Steam auth section of CLAUDE.md** (steam-session/steam-user/electron-store) is unrelated to this phase's scope; no conflict.

## Sources

### Primary (HIGH confidence)
- `src-tauri/src/main.rs` (this repo, read directly: lines 1140-1240, 7980-8260, 8752-9160, 12540-12800) — the existing Unix guard, `protocol_url_arg`, `deep_link_decision`, `sidecar_forward_args`, `shutdown_child`, and their doc comments
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `src-tauri/tauri.windows.conf.json` (this repo, read directly)
- `tauri-plugin-deep-link-2.4.9/src/lib.rs` (vendored source, `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-plugin-deep-link-2.4.9/src/lib.rs`) — full read
- `tauri-2.11.5/src/app.rs` (vendored source) — `Builder::build`/`initialize_plugins`/`setup` ordering, lines 2420-2534
- `tauri-utils-2.9.3/src/config.rs` (vendored source) — `NSISInstallerMode` default, lines 815-903
- `windows-sys-0.60.2/Cargo.toml` (vendored source) — confirmed feature-flag names
- Microsoft Learn, [`CreateMutexW` function](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-createmutexw) — fetched and quoted directly this session (stale-handle destruction, `Local\`/`Global\` semantics, the malicious-mutex-squatting warning)
- Microsoft Learn, [Named Pipe Security and Access Rights](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights) — fetched and quoted directly this session (default DACL grants Everyone/anonymous read access; logon-SID guidance)
- `.planning/todos/pending/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` (this repo) — full read, including the 2026-09-22 finding and its later addendum with the real generated `installer.nsi` evidence
- `.planning/quick/260922-nx4-suppress-gamelib-nsis-install-time-regis/260922-nx4-SUMMARY.md` (this repo) — full read
- `.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` (this repo) — full read
- `src/backend/__tests__/windowsDeepLinkSuppression.test.ts`, `src/backend/__tests__/tauriShellSource.test.ts` (this repo) — full/targeted read of the relevant `describe` blocks
- Direct command execution on this Windows machine, 2026-09-22: `cargo check` (clean, 54.10s), `cargo test --bin gamelib-shell` (6 pre-existing, unrelated compile errors, fully diagnosed), `slopcheck install windows-sys --ecosystem crates.io` (`[OK]`)

### Secondary (MEDIUM confidence)
- `ERROR_PIPE_CONNECTED` handling convention (Q4/A1) — WebSearch-sourced description of a well-known Win32 idiom, not independently re-fetched from the `ConnectNamedPipe` MS Learn page in this session; flagged in the Assumptions Log for a quick confirmation pass

### Tertiary (LOW confidence)
- None retained as unverified in the final document — every WebSearch finding used above was either cross-checked against a `[VERIFIED]` primary source (vendored crate code or a directly-fetched MS Learn page) or explicitly flagged in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack (windows-sys, feature flags): HIGH — read directly from the vendored crate's own `Cargo.toml` and cross-checked against `Cargo.lock`'s existing resolution
- Architecture / double-dispatch proof (Q6): HIGH — read directly from the exact pinned versions of both `tauri` and `tauri-plugin-deep-link` source, not inferred or assumed
- Mutex/pipe security semantics (Q1/Q2): HIGH — quoted directly from current Microsoft Learn pages fetched this session
- Pitfalls (`ERROR_PIPE_CONNECTED`): MEDIUM — well-established idiom, not independently re-verified against an MS Learn page in this session (see Assumptions Log A-equivalent note under Q4)
- Wave 0 `cargo test` compile break (Q10): HIGH — directly reproduced and fully root-caused on this machine

**Research date:** 2026-09-22
**Valid until:** 30 days for the Windows API/security guidance (stable, unlikely to change); re-verify the Q6 double-dispatch proof specifically if `tauri` or `tauri-plugin-deep-link` are upgraded before this phase is planned or executed, since that proof is pinned to the exact versions read this session (`tauri` 2.11.5, `tauri-plugin-deep-link` 2.4.9).
