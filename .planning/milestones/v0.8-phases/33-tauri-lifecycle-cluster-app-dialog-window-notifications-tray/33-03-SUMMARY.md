---
phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray
plan: 03
subsystem: infra
tags: [tauri, dialog, sidecar, ipc, electron-shim, jest]

# Dependency graph
requires:
  - phase: 31-tauri-ipc-replumb-slice-2-settings-and-config
    provides: "RUST_DIALOG_MESSAGE channel + dialog_message Rust arm (single-button), the Phase 31 Plan 04 CR-01 {response:-1} safe-sentinel stopgap this plan retires"
provides:
  - "Real multi-button dialog.showMessageBox forwarding to Rust's dialog_message arm via MessageDialogButtons::OkCancelCustom"
  - "Per-caller cancelId fail-safe: any transport error/timeout resolves the CALLER's own declared safe button index, never a positional heuristic"
  - "Both real destructive confirm callers (askForceUninstall, promptI386Recovery) retrofitted with explicit cancelId"
affects: [33-04, dialog-cluster, sidecar-electron-shim]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cancelId fail-safe: destructive confirms declare their own safe button index explicitly rather than relying on a shared 'last index' assumption"

key-files:
  created: []
  modified:
    - src-tauri/src/main.rs
    - src/backend/sidecar/electronStub.ts
    - src/backend/utils.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/sidecar/__tests__/dialogStub.test.ts

key-decisions:
  - "Extended the existing dialog_message Rust arm in place (data-shape change) rather than adding a new match arm/channel, per 33-RESEARCH confirmation"
  - "Used an explicit per-caller cancelId instead of a positional 'last index' fail-safe heuristic -- askForceUninstall (destructive=index 1) and promptI386Recovery (destructive=index 0) have opposite button orders, so a shared heuristic would be wrong for one of them"

patterns-established:
  - "Total-method / never-throw convention extended to showMessageBox: ANY requestRustInvoke rejection resolves a safe value, never rejects (an unguarded reject crashes the whole sidecar process)"

requirements-completed: [REQ-33-05, REQ-33-11]

# Metrics
duration: ~15min
completed: 2026-07-23
---

# Phase 33 Plan 03: Real Multi-Button showMessageBox with Per-Caller Fail-Safe Summary

**Retired the Phase 31 CR-01 `{response:-1}` safe-sentinel stopgap: `dialog.showMessageBox` now returns the real clicked button via `MessageDialogButtons::OkCancelCustom`, with an explicit per-caller `cancelId` fail-safe so a degraded dialog transport can never auto-confirm a destructive confirm.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-23T22:22:46Z
- **Tasks:** 3/3 completed
- **Files modified:** 5

## Accomplishments
- `dialog_message`'s Rust arm now reads an optional 2-element `buttons` array and wires it to `MessageDialogButtons::OkCancelCustom`, returning the real button the user clicked (single-button OK-only behavior unchanged for all other callers)
- `electronStub.ts`'s `showMessageBox` forwards to the same `RUST_DIALOG_MESSAGE` channel already used by `showErrorBox`, mapping `true`/`false` to `response: 0`/`1`
- Both real destructive-confirm callers (`askForceUninstall`, `promptI386Recovery`) now declare an explicit `cancelId` so a transport error/timeout resolves to THEIR OWN safe button, not a shared guess — proven necessary since the two callers have opposite button orders
- Five new unit tests unit-prove real button mapping and both fail-safe directions independently

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the Rust dialog_message arm for 2-button OkCancelCustom (D-06)** - `a0f1bc47` (feat)
2. **Task 2: Real showMessageBox in electronStub with cancelId fail-safe; retrofit both destructive callers (D-06/D-07)** - `f78bb576` (feat)
3. **Task 3: Extend dialogStub.test.ts for real multi-button + per-caller fail-safe-on-error (D-07)** - `186c5ad9` (test)

_No TDD tasks in this plan; each task is a single commit._

## Files Created/Modified
- `src-tauri/src/main.rs` - `dialog_message` arm extended to read an optional 2-element `buttons` array and wire it to `MessageDialogButtons::OkCancelCustom`; imports `MessageDialogButtons`
- `src/backend/sidecar/electronStub.ts` - `showMessageBox` replaced the CR-01 safe-sentinel with a real forward-to-transport shape (mirrors `showOpenDialog`), computing `safeIndex` from the caller's `cancelId` and never rejecting
- `src/backend/utils.ts` - `askForceUninstall` now passes `cancelId: 0` (buttons[1] "yes" is the destructive branch)
- `src/backend/storeManagers/steam/library.ts` - `promptI386Recovery` now passes `cancelId: 1` (buttons[0] "Reinstall via CrossOver" is the destructive branch)
- `src/backend/sidecar/__tests__/dialogStub.test.ts` - `showMessageBox` describe block replaced with real-mapping + per-caller fail-safe tests (5 new cases, one showMessageBoxSync no-op check)

## Decisions Made
- Extended the existing `dialog_message` arm in place (data-shape change) instead of adding a new match arm or channel — 33-RESEARCH had already confirmed this was the correct approach and the arm was "90% generalized" already.
- Chose the explicit `cancelId` fail-safe over a positional "last index" heuristic. The two real callers have OPPOSITE button orders (`askForceUninstall`: `[no, yes]`, destructive=index 1; `promptI386Recovery`: `[confirm, cancel]`, destructive=index 0) — a shared heuristic based on button count or position would have been silently wrong for one of them. This is the D-07 mitigation for T-33-07 (Elevation of Privilege).

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria matched the plan's specified shapes (grep patterns, function signatures, cancelId values) with no adjustments needed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. No new Cargo/npm dependencies (reuses the already-installed `tauri-plugin-dialog = "2"` and the existing `RUST_DIALOG_MESSAGE` channel).

## Next Phase Readiness

- `showMessageBox` is now a real, fail-safe multi-button confirm primitive — Plan 33-04 (which shares `electronStub.ts`/`main.rs` per the plan's wave note) can build on this without re-touching the dialog cluster.
- Verification suite green: `cargo build` compiles, `npx tsc --noEmit` passes, `npx jest src/backend/sidecar/__tests__/dialogStub.test.ts` (22/22 passing) and `npx jest electronUntouched` (11/11 passing) both green, and `grep -rn "from 'electron'" src/backend/sidecar/electronStub.ts` returns nothing (no real electron import leaked in).
- No blockers or concerns carried forward.

---
*Phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 5 modified files and all 3 task commit hashes verified present on disk / in git log.
