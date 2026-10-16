---
phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate
plan: 02
subsystem: infra
tags: [tauri, rust, keyring, keychain, sidecar, ipc]

# Dependency graph
requires:
  - phase: 28-01
    provides: "rustInvoke SidecarRpcKind, RUST_KEYRING_GET/SET/DELETE/AVAILABLE channel constants, requestRustInvoke() correlated request/response function in sidecarRpc.ts — the fixed frame contract this plan's Rust dispatcher must satisfy"
provides:
  - "keyring v3 (apple-native) Cargo dependency, resolving to 3.6.3 with security-framework 3.7.0"
  - "dispatch_rust_channel(channel, args) in src-tauri/src/main.rs — answers keyring_get/keyring_set/keyring_delete/keyring_available against a real macOS Keychain entry (KEYRING_SERVICE=com.gamelib.launcher, KEYRING_ACCOUNT=steam-refresh-token)"
  - "SidecarState::write_raw() — generalized outbound-frame writer usable for both request frames and rustInvoke response frames"
  - "start_reader() rustInvoke branch — dispatches off a spawned worker thread (not the reader thread) so a blocking Keychain prompt cannot stall unrelated pending invokes"
  - "start_reader() openExternal branch — fixes the verified pre-existing silent drop of sidecar-initiated openExternal frames"
  - "start_reader() unrecognized-frame diagnostic — logs kind/id for any future unhandled frame kind instead of silently dropping it"
affects: [28-03/28-04 (TokenStore seam consuming this channel), 28-05 (manual Deny-click verification of keyring::Error classification), 28-06 (PROOF.md round-trip + Electron-untouched verification)]

# Tech tracking
tech-stack:
  added: ["keyring 3.6.3 (Cargo, apple-native feature)"]
  patterns:
    - "Rust-side keyring dispatch: Entry::new(service, account) -> get_password/set_password/delete_credential -> flat String error mapping via .map_err/format!, matching this file's existing open_external convention (no custom error enum)"
    - "NoEntry classified as available-but-empty (Ok), never as an error — the D-06 honest-unavailable split lives entirely in how each keyring::Error variant is matched, not in a separate availability probe"
    - "Sidecar-initiated request dispatch runs on a freshly spawned OS thread per rustInvoke frame, cloning the Arc<SidecarState> into the worker — keeps a blocking Keychain prompt from head-of-line-blocking the reader thread's other frame handling"

key-files:
  created: []
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/src/main.rs

key-decisions:
  - "openExternal received the minimal fix (dedicated fire-and-forget reader branch), not a conversion to rustInvoke request/response — per the plan objective's Open Question 2 resolution, converting it would ripple into electronStub.shell.openExternal's contract and the Phase 27 launch flow, out of this phase's boundary."
  - "KEYRING_SERVICE/KEYRING_ACCOUNT are new production-stable constants (com.gamelib.launcher / steam-refresh-token), distinct from spike 011's throwaway com.gamelib.spike011 probe values, per RESEARCH.md Pitfall 3."

patterns-established:
  - "Every non-NoEntry keyring::Error is both eprintln!'d ({:?} debug format, channel name only, never the secret) and mapped to a flat keyring:unavailable:{e} String — this is the log line plan 28-05's manual Deny-click verification is designed to capture."

requirements-completed: [REQ-28-01, REQ-28-05]

# Metrics
duration: ~30min
completed: 2026-07-22
---

# Phase 28 Plan 02: Rust Keyring Dispatch + Reader-Thread Frame Fixes Summary

**`dispatch_rust_channel()` in `src-tauri/src/main.rs` answers the four keyring channels against a real macOS Keychain entry via the `keyring` v3 crate, wired into `start_reader()`'s `rustInvoke` branch off a spawned worker thread, alongside a minimal fix for the pre-existing silently-dropped `openExternal` frame and a catch-all diagnostic for any other unrecognized frame kind.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2 completed
- **Files modified:** 3 (`Cargo.toml`, `Cargo.lock`, `main.rs`)

## Accomplishments
- Added `keyring = { version = "3", features = ["apple-native"] }` to `src-tauri/Cargo.toml`, resolving to the same `keyring 3.6.3` / `security-framework 3.7.0` tree spike 011 already proved (`cargo tree -p keyring` confirmed).
- Added production-stable `KEYRING_SERVICE`/`KEYRING_ACCOUNT` constants, explicitly distinct from spike 011's throwaway `com.gamelib.spike011` probe values.
- Implemented `dispatch_rust_channel(channel, args)` with four match arms (`keyring_get`/`keyring_set`/`keyring_delete`/`keyring_available`) plus a catch-all `rustInvoke:unknown-channel` error. `NoEntry` is classified as "available but empty" (`Ok`) in `get`/`delete`/`available`, never as an error — the D-06 honest-unavailable split. `keyring_set` rejects missing/non-string args with `keyring:bad-args` before touching the Keychain. Every non-`NoEntry` error is logged via `eprintln!` with the `{:?}` debug format (channel name + error only, never the secret), per T-28-04.
- Generalized `SidecarState::write_frame` into a new `write_raw(&Value)` primitive so the same locked-stdin-write logic serves both outbound request frames and inbound-request response frames.
- Added a `rustInvoke` branch to `start_reader()`: parses `id`/`channel`/`args`, spawns a dedicated worker thread (cloning the `Arc<SidecarState>`) to call `dispatch_rust_channel` and write back `{id, ok, result|error}` — off the reader thread, so a blocking Keychain access prompt cannot stall other pending sidecar responses (T-28-05 head-of-line blocking).
- Added an `openExternal` branch: opens the URL via the same `app.opener().open_url(...)` facility `open_external` already uses, fire-and-forget (no response frame) — the minimal fix for the verified pre-existing drop documented in 27-02-SUMMARY.md.
- Added a final `else` diagnostic (`eprintln!("[shell] unrecognized sidecar frame kind: {kind:?} id={id:?}")`) so any future unhandled frame kind is logged, not silently dropped, closing the class of bug this phase discovered.
- Updated `start_reader()`'s doc comment to describe all four recognized frame shapes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the keyring dependency and implement dispatch_rust_channel() with the four keyring arms** - `2098e06d` (feat)
2. **Task 2: Wire the reader thread — rustInvoke dispatch, openExternal fix, unknown-frame diagnostic** - `ae963d68` (feat)

## Files Created/Modified
- `src-tauri/Cargo.toml` - Added `keyring = { version = "3", features = ["apple-native"] }` to `[dependencies]`
- `src-tauri/Cargo.lock` - Updated by `cargo build` to resolve the new dependency tree (keyring 3.6.3, security-framework 3.7.0, and transitive deps)
- `src-tauri/src/main.rs` - Added `KEYRING_SERVICE`/`KEYRING_ACCOUNT` constants, `dispatch_rust_channel()`, `SidecarState::write_raw()`, `start_reader()`'s `rustInvoke`/`openExternal`/unrecognized-frame branches, updated doc comments

## Decisions Made
- `openExternal` gets the minimal fix (dedicated fire-and-forget branch), not a conversion to `rustInvoke` request/response — matches the plan's `<objective>` Open Question 2 resolution recorded at planning time.
- `KEYRING_SERVICE = "com.gamelib.launcher"` / `KEYRING_ACCOUNT = "steam-refresh-token"` chosen as the production-stable identifiers, distinct from spike 011's probe values.

## Deviations from Plan

None — plan executed exactly as written. All acceptance-criteria greps and `cargo build` checks passed on the first implementation pass for both tasks.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. This plan touches no TypeScript and no Electron code path; `npm start` is unaffected (no `src/` files modified). A future rebuild of `src-tauri` may re-prompt for Keychain access on macOS per D-08's accepted dev-loop friction — this is expected behavior, not a regression.

## Next Phase Readiness
- `src-tauri` compiles cleanly (`cargo build` exits 0, zero warnings) with `keyring` wired into all four `rustInvoke` channels.
- The reader thread now answers `rustInvoke` frames (off-thread), actually performs `openExternal`, and logs any unrecognized frame kind — closing Pitfall 2's verified dropped-frame gap.
- Open Question 1 (exact macOS `keyring::Error` variant for a denied Keychain prompt) remains deferred to plan `28-05`/`28-06`'s manual click-through, as designed — this plan's `eprintln!("[shell] keyring {channel} failed: {e:?}")` lines are what that verification step will read.
- No blockers. Plan `28-03`/`28-04` (the sidecar-side `TokenStore` seam) can now call `requestRustInvoke('keyring_get'|'keyring_set'|'keyring_delete'|'keyring_available', ...)` and receive real Rust-side responses.

## Self-Check: PASSED

All modified files exist: `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/main.rs`.
Both commits verified present in `git log`: `2098e06d`, `ae963d68`.
`cargo build` exits 0 with zero warnings; `cargo tree -p keyring` confirms `keyring v3.6.3` with `security-framework v3.7.0`.

---
*Phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate*
*Completed: 2026-07-22*
