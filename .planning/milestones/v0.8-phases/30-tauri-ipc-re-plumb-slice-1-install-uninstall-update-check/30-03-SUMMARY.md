---
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
plan: 03
subsystem: infra
tags: [tauri, rust, rustInvoke, dialog, tauri-plugin-dialog, sidecar, electron-shim, logging]

# Dependency graph
requires:
  - phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate
    provides: the `dispatch_rust_channel`/`rustInvoke` request-response channel pattern (worker-thread dispatch, allowlist gate) this plan extends with a second channel
provides:
  - A native folder-picker path (`dialog.showOpenDialog`) end-to-end from the sidecar through the existing generic `rustInvoke` mechanism to the Tauri dialog plugin
  - A logged (not silent) `notify()` no-op branch, closing the live REQ-30-07 gap
affects: [31-tauri-ipc-re-plumb-slice-2, any future dialog.* surface work (save dialog, message box)]

# Tech tracking
tech-stack:
  added: ["tauri-plugin-dialog = \"2\" (resolved 2.7.2)"]
  patterns:
    - "rustInvoke channel extension: add a TS constant to RUST_INVOKE_CHANNELS + a Rust match arm in dispatch_rust_channel, reusing the existing worker-thread dispatch/allowlist machinery rather than inventing a new frame kind"
    - "electronStub.ts must never import 'backend/logger' (or anything else from the backend module graph) -- doing so reintroduces the app.getPath() import-time wall bootstrap.ts's docstring warns about, one file earlier in the require-hook install chain. Use console.warn/console.error instead for this one file."

key-files:
  created:
    - src/backend/sidecar/__tests__/dialogStub.test.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/capabilities/default.json
    - src-tauri/src/main.rs
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/electronStub.ts
    - src/backend/dialog/dialog.ts

key-decisions:
  - "tauri-plugin-dialog pinned as \"2\" (caret-major), not \"2.7.2\" (literal plan text) -- user-approved deviation to match the sibling tauri-plugin-opener = \"2\" convention already in Cargo.toml; Cargo.lock still records the exact 2.7.2 resolution"
  - "Capability permission scoped to dialog:allow-open (narrowest available), not the blanket dialog:default, per T-30-12"
  - "electronStub.ts's dialog.showOpenDialog uses console.warn on failure, not backend/logger's logWarning -- importing backend/logger from electronStub.ts breaks sidecar boot (see Deviations)"

requirements-completed: [REQ-30-07, REQ-30-09]

# Metrics
duration: 9min
completed: 2026-07-22
---

# Phase 30 Plan 03: Native dialog_open rustInvoke channel + logged notify() no-op Summary

**One new sidecar->Rust `rustInvoke` channel (`dialog_open`) puts a real native folder picker behind `dialog.showOpenDialog`, backed by the human-verified `tauri-plugin-dialog` crate, and `notify()`'s previously-silent no-op now logs a reason.**

## Performance

- **Duration:** 9 min (excluding the blocking human-verify checkpoint wait)
- **Started:** 2026-07-22T10:38:40Z
- **Completed:** 2026-07-22T10:47:07Z
- **Tasks:** 3 (1 checkpoint + 2 auto)
- **Files modified:** 6 modified, 1 created

## Accomplishments
- `tauri-plugin-dialog` crate legitimacy verified by a human via the crates.io API before any `cargo add` ran (blocking checkpoint, T-30-10/T-30-SC)
- New `dialog_open` `rustInvoke` channel, end-to-end: `RUST_DIALOG_OPEN` TS constant -> `requestRustInvoke` -> Rust's widened `dispatch_rust_channel` -> `app.dialog().file().blocking_pick_folder()`, dispatched on the spawned worker thread (never the reader thread, T-30-13)
- `dialog.showOpenDialog` in the sidecar's Electron stub now returns Electron's exact `{canceled, filePaths}` shape, backed by the real Rust dialog, and never throws on failure
- `notify()`'s Notification-unsupported/Steam-Deck-game-mode branch now logs a reason instead of vanishing silently (REQ-30-07/D-09)
- 6 new tests in `dialogStub.test.ts` covering the allowlist membership, resolve/cancel/reject paths, the untouched stub members, and a by-construction proof that `notify()`'s else branch calls `logInfo`

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify the tauri-plugin-dialog crate before adding it** - checkpoint resolved by the coordinator/user (see Checkpoint Resolution below); no commit (no code changed by this task)
2. **Task 2: Add the dialog_open channel end-to-end in Rust** - `ecb1c732` (feat)
3. **Task 3: Wire the TS side — RUST_DIALOG_OPEN, real showOpenDialog, logged notify() no-op** - `496acfad` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Checkpoint Resolution (Task 1)

**Type:** human-verify, `gate="blocking-human"` (package-legitimacy — not auto-approvable even in auto-mode)

The executor stopped before any `cargo add`/`Cargo.toml` edit and surfaced the checkpoint to the coordinator. The coordinator gathered evidence directly from the crates.io API (`https://crates.io/api/v1/crates/tauri-plugin-dialog`, User-Agent'd) and the user approved:

- **repository:** `https://github.com/tauri-apps/plugins-workspace` — byte-identical to `tauri-plugin-opener`'s repository field (the already-adopted sibling plugin)
- **max_stable_version:** `2.7.2`; recent releases `2.7.2, 2.7.1, 2.7.0, 2.6.0, 2.5.0`
- **downloads:** 11,215,547; **updated_at:** 2026-07-18 (actively maintained)
- **description:** "Native system dialogs for opening and saving files along with message dialogs on your Tauri application."
- Confirmed official `tauri-apps` crate, Tauri v2 line, no lookalike naming

**Resume signal:** `"approved: 2.7.2 (pin as \"2\")"` — with the explicit pin-style decision to match `tauri-plugin-opener = "2"`'s existing caret-major convention rather than pinning the literal patch version. `cargo check` resolved the real dependency to `tauri-plugin-dialog v2.7.2`, confirming both the version and the plugin's public API (`app.dialog().file().blocking_pick_folder()`) matched what the plan's interfaces section specified — the `[ASSUMED]` marker in 30-RESEARCH.md is now verified.

## Files Created/Modified
- `src-tauri/Cargo.toml` - pinned `tauri-plugin-dialog = "2"` alongside `tauri-plugin-opener`
- `src-tauri/capabilities/default.json` - added `dialog:allow-open` (narrowest available permission, T-30-12)
- `src-tauri/src/main.rs` - registered `tauri_plugin_dialog::init()`; widened `dispatch_rust_channel` to take `&AppHandle`; added the `"dialog_open"` match arm (`blocking_pick_folder()` -> `Value::String`/`Value::Null`); threaded `worker_app = app.clone()` into `start_reader`'s `rustInvoke` branch
- `src/common/types/sidecarTransport.ts` - added `RUST_DIALOG_OPEN = 'dialog_open'`, appended to `RUST_INVOKE_CHANNELS`
- `src/backend/sidecar/electronStub.ts` - `dialog.showOpenDialog` now forwards to `requestRustInvoke(RUST_DIALOG_OPEN, [options])`, translating the result into Electron's exact `OpenDialogReturnValue` shape; never throws
- `src/backend/dialog/dialog.ts` - `notify()` gained an `else` branch logging the skipped title + reason via `logInfo`
- `src/backend/sidecar/__tests__/dialogStub.test.ts` - new: 6 tests (allowlist membership, resolve/cancel/reject, untouched stub members, notify() by-construction gate)

## Decisions Made
- Pinned `tauri-plugin-dialog` as `"2"` rather than the plan's literal `"2.7.2"` — user-directed deviation to keep the caret-major convention consistent with the already-adopted `tauri-plugin-opener = "2"`; `Cargo.lock` still records the exact resolved `2.7.2`.
- Chose `dialog:allow-open` over the broader `dialog:default` capability permission, per the plan's T-30-12 guidance to grant the narrowest permission the plugin exposes.
- Used `console.warn` instead of `backend/logger`'s `logWarning` inside `electronStub.ts` — see Deviations below; this was forced by a real regression, not a stylistic choice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed the `backend/logger` import from `electronStub.ts` — it broke sidecar boot**
- **Found during:** Task 3, while running the plan's own verification command (`npx jest src/backend/sidecar src/preload/__tests__`)
- **Issue:** The plan's read_first pointed at `keyringTokenStore.ts`'s `logWarning`/`LogPrefix` call shape as the pattern to mirror. Importing `backend/logger` directly into `electronStub.ts`, however, pulls in `backend/logger/index.ts` -> `game_config.ts` -> `config.ts` -> `compatibility_layers.ts` -> `backend/constants/paths.ts`, which calls `app.getPath('appData')` at MODULE SCOPE. `electronStub.ts` is the module `installElectronHook.ts` requires to *install* the `Module._load` hook that redirects `require('electron')` — importing `backend/logger` from inside it reintroduces the exact "second wall" `bootstrap.ts`'s own docstring warns about (previously only tripped by `handlers.ts`, now tripped one file earlier). This surfaced as two test-suite failures: `skeletonFlows.test.ts` and `steamAuthFlows.test.ts` both failed with `TypeError: Cannot read properties of undefined (reading 'getPath')`.
- **Fix:** Removed the `backend/logger` import from `electronStub.ts`; the one failure-path log call in `dialog.showOpenDialog` uses `console.warn` directly instead (mirrors `main.rs`'s `[shell]`-prefixed stderr convention for the same class of failure). Added a module-scope comment documenting why `backend/logger` must never be imported here. Updated `dialogStub.test.ts` to spy on `console.warn` instead of mocking `backend/logger`.
- **Files modified:** `src/backend/sidecar/electronStub.ts`, `src/backend/sidecar/__tests__/dialogStub.test.ts`
- **Verification:** `npx jest src/backend/sidecar src/preload/__tests__` — 11/11 suites, 137/137 tests passing (was 9/11 suites before the fix, with the 2 failures above)
- **Committed in:** `496acfad` (Task 3 commit — the fix landed before the task's own commit, so no separate commit exists for it)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for correctness — the plan's suggested call-shape mirror (`keyringTokenStore.ts`'s direct `backend/logger` import) does not transfer safely to `electronStub.ts`, which has a stricter no-backend-graph-imports invariant that `keyringTokenStore.ts` (a normal sidecar module, not the require-hook target) does not share. No scope creep — the fix is a one-line import swap plus a documentation comment, not new machinery.

## Issues Encountered
- Confirmed (empirically, via the full `src/backend/sidecar src/preload/__tests__` run) that the direct `import { requestRustInvoke } from './sidecarRpc'` in `electronStub.ts` — despite `electronStub.ts`'s own docstring calling out "no knowledge of the RPC transport... to avoid a circular import" for the `openExternal`/`pushFrontendMessage` pair — does NOT reintroduce that cycle problem. The existing cycle-avoidance (`bindTransport()`) exists specifically because those two calls are bidirectional (sidecarRpc calls back into electronStub's registries); `requestRustInvoke` is a one-directional call with no callback the other way, so the module graph resolves cleanly under CommonJS (the only observed regression was the unrelated `backend/logger` import, addressed above). All 11 sidecar/preload test suites pass with the direct import in place.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The `rustInvoke` channel-extension pattern (TS constant + Rust match arm, no new frame kind) is now proven twice (keyring in Phase 28, dialog here) — future plans (message box, save dialog, notifications via `tauri-plugin-notification`) can follow the same shape.
- `dialog.showOpenDialog` is real end-to-end; the other five `dialog.*` members (`showErrorBox`, `showMessageBox`, `showMessageBoxSync`, `showOpenDialogSync`, `showSaveDialog`) remain stubbed and are explicitly out of scope (Phase 31).
- The `backend/logger`-must-not-be-imported-into-`electronStub.ts` constraint is now documented in-file (module-scope comment above the imports) so a future editor does not reintroduce the same regression.

---
*Phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 8 files (7 code/test files + this SUMMARY) confirmed present on disk; all 3 commit hashes (`ecb1c732`, `496acfad`, `f1277061`) confirmed present in `git log --oneline --all`.
