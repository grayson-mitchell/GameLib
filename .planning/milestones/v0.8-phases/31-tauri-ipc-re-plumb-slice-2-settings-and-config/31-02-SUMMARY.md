---
phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config
plan: 02
subsystem: infra
tags: [tauri, rust, dialog, sidecar, electron-shim, ipc]

# Dependency graph
requires:
  - phase: 30-tauri-ipc-re-plumb-slice-1-store-search-crossover
    provides: "the generic sidecar→Rust rustInvoke transport (requestRustInvoke/dispatch_rust_channel) and the dialog_open precedent electronStub.ts's showOpenDialog forwards through"
  - phase: 28-tauri-shell-real-keyring
    provides: "RUST_INVOKE_CHANNELS allowlist convention (T-28-03) and the total-method never-throw catch pattern electronStub.ts's dialog members follow"
provides:
  - "RUST_DIALOG_MESSAGE ('dialog_message') and RUST_DIALOG_SAVE ('dialog_save') allowlisted rustInvoke channels"
  - "dispatch_rust_channel match arms for dialog_message (blocking_show -> bool) and dialog_save (blocking_save_file -> Option<FilePath>)"
  - "electronStub.ts dialog.showMessageBox/showErrorBox/showSaveDialog with real Tauri-backed behavior instead of static stubs"
  - "logged (not silent) no-ops for dialog.showMessageBoxSync/showOpenDialogSync, shell.showItemInFolder, clipboard.writeText"
affects: [phase-33-electron-cutover, future-settings-or-sideload-flows-that-adopt-dialog-showSaveDialog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rust dialog dispatch: build the tauri-plugin-dialog builder via app.dialog(), reassign through optional builder methods (.title()/.set_file_name()/.add_filter()), then call the terminal blocking_*() method — mirrors the existing dialog_open arm's shape"
    - "electronStub total-method dialog members: try { await requestRustInvoke(CHANNEL, [args]) ; map result } catch { console.warn(...); return safe default } — never throws to the caller, same shape as showOpenDialog/keyringTokenStore.ts"

key-files:
  created: []
  modified:
    - src/common/types/sidecarTransport.ts
    - src-tauri/src/main.rs
    - src/backend/sidecar/electronStub.ts
    - src/backend/sidecar/__tests__/dialogStub.test.ts

key-decisions:
  - "showMessageBox/showErrorBox share one Rust channel (RUST_DIALOG_MESSAGE) distinguished by a kind:'error'|'warning'|'info' field in args[0], rather than two separate channels — matches the plan's single dialog_message arm and keeps the allowlist minimal"
  - "showMessageBoxSync/showOpenDialogSync/shell.showItemInFolder/clipboard.writeText stay no-ops but now emit console.warn naming the no-op + D-04 + the Phase 33 deferral, instead of doing nothing silently"

patterns-established:
  - "New rustInvoke channels are added in a fixed 3-step sequence: (1) constant + RUST_INVOKE_CHANNELS entry in sidecarTransport.ts, (2) matching dispatch_rust_channel arm in main.rs before the catch-all, (3) electronStub.ts member forwarding via the total-method try/catch shape — verified independently at each step (cargo check after step 2, jest after step 3)"

requirements-completed: [REQ-31-03, REQ-31-04, REQ-31-05, REQ-31-07]

# Metrics
duration: 20min
completed: 2026-07-23
---

# Phase 31 Plan 02: Dialog Cluster (Real Message/Save Dialogs + Logged No-ops) Summary

**Closed SEAM.md's `dialog` priority-2 cluster: showMessageBox/showErrorBox/showSaveDialog now forward to the Tauri dialog plugin via two new allowlisted rustInvoke channels, and the D-04 shell/clipboard no-ops emit console.warn instead of doing nothing.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-23T16:31:00+12:00 (approx, first Read call)
- **Completed:** 2026-07-23T16:53:00+12:00
- **Tasks:** 2 (Task 2 is TDD: RED + GREEN commits)
- **Files modified:** 4

## Accomplishments
- Two new Rust-side channel constants (`RUST_DIALOG_MESSAGE`, `RUST_DIALOG_SAVE`) added to the `RUST_INVOKE_CHANNELS` allowlist, with two matching `dispatch_rust_channel` arms in `main.rs` that call `tauri-plugin-dialog`'s `blocking_show()`/`blocking_save_file()` — no new Cargo dependency, plugin registration, or capability permission (the plugin and `AppHandle` param were already wired for `dialog_open`).
- `electronStub.ts`'s `dialog.showMessageBox`, `dialog.showErrorBox`, and `dialog.showSaveDialog` are now real: they forward to Rust and map the result (bool→`{response, checkboxChecked:false}`; string/null→`{canceled, filePath}`), with a safe-default catch that never throws to the caller.
- `dialog.showMessageBoxSync`/`dialog.showOpenDialogSync` and `shell.showItemInFolder`/`clipboard.writeText` (D-04) now emit `console.warn` on every call instead of silently no-oping.
- `dialogStub.test.ts` extended from 5 to 19 tests covering resolve/cancel/reject for all three new async members, the two Sync no-ops, and the two D-04 no-ops.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the two RUST_DIALOG_* constants and Rust match arms** - `8260df5c` (feat)
2. **Task 2 (TDD RED): Add failing tests for real dialog forwarding + D-04 logged no-ops** - `7fd3c758` (test)
3. **Task 2 (TDD GREEN): Make dialog.showMessageBox/showErrorBox/showSaveDialog real; log D-04 no-ops** - `30d02371` (feat)

_TDD task produced two commits (test → feat); no refactor commit was needed._

## Files Created/Modified
- `src/common/types/sidecarTransport.ts` - added `RUST_DIALOG_MESSAGE`/`RUST_DIALOG_SAVE` constants + allowlist entries
- `src-tauri/src/main.rs` - added `dialog_message`/`dialog_save` match arms to `dispatch_rust_channel`, imported `MessageDialogKind`
- `src/backend/sidecar/electronStub.ts` - real `showMessageBox`/`showErrorBox`/`showSaveDialog`; logged `showMessageBoxSync`/`showOpenDialogSync`/`shell.showItemInFolder`/`clipboard.writeText`
- `src/backend/sidecar/__tests__/dialogStub.test.ts` - extended with showMessageBox/showErrorBox/showSaveDialog/Sync/D-04 test coverage

## Decisions Made
- `showMessageBox` and `showErrorBox` share the single `RUST_DIALOG_MESSAGE` channel, distinguished by a `kind` field (`'error'|'warning'|'info'`) in the forwarded args object, rather than minting a third channel — keeps the allowlist to exactly the two constants the plan specified.
- `showSaveDialog`'s Rust arm reads optional `defaultPath`/`filters` from `args[0]` (Electron's real `SaveDialogOptions` shape) even though RESEARCH Q2 confirmed zero in-scope callers exist today — this keeps the arm forward-compatible with a future real caller without requiring a second pass.

## Deviations from Plan

None - plan executed exactly as written. `shell.showItemInFolder`/`clipboard.writeText` needed a typed parameter (`_fullPath: string`/`_text: string`) added to satisfy `tsc --noEmit` once the tests started calling them with an argument — a trivial, in-scope typing fix during Task 2's GREEN step, not a deviation from the plan's intent.

## Issues Encountered
- Running the full `src/backend/sidecar` jest suite (not just `dialogStub.test.ts`) intermittently fails one unrelated test, `bootstrap.test.ts`'s "round-trips a health/ping invoke frame over stdio", with `ENOENT` on a real `~/Library/Logs/GameLib/gamelib.log` rename. Confirmed pre-existing and unrelated to this plan's files via `git stash` isolation (passes in isolation both before and after this plan's changes; only flakes when run alongside the rest of the directory, sharing real log-file state). Logged to `deferred-items.md`, not fixed (out of scope).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The `dialog` priority-2 cluster in SEAM.md is closed: all five async/sync `dialog.*` members plus the two D-04 shell/clipboard no-ops now have their final Phase-31 behavior.
- `RUST_DIALOG_SAVE`'s Rust arm already honors `defaultPath`/`filters`, so a future settings/sideload flow that adopts `dialog.showSaveDialog` needs no further Rust-side work.
- No blockers for 31-03.

---
*Phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 6 files confirmed present (`sidecarTransport.ts`, `main.rs`, `electronStub.ts`,
`dialogStub.test.ts`, this SUMMARY, `deferred-items.md`); all 4 commit hashes
(`8260df5c`, `7fd3c758`, `30d02371`, `1e65b932`) confirmed present in `git log --oneline --all`.
