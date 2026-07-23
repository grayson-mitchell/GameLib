---
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
plan: 05
subsystem: ipc
tags: [tauri, sidecar, steam, install, gap-closure, tdd]

# Dependency graph
requires:
  - phase: 30-02
    provides: installFlowRegistration.ts's sidecar install/uninstall/update/checkGameUpdates bypass
provides:
  - Terminal 'done' badge-clear for a returned (non-thrown) install error under the Tauri sidecar
  - showDialogBoxModalAuto surfacing of genuine depot-install failures via the frontendMessage relay
  - Suppression of a duplicate dialog when ensureSteamClientReady already owns the steamClientSetupRequired prompt
affects: [30-06, phase-30-verification, phase-30-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "hadError flag alongside deferredToSetup/wasAborted to extend a finally-block terminal-status guard"
    - "showDialogBoxModalAuto (no event arg) rides the same frontendMessage relay as sendGameStatusUpdate — zero Rust changes for new dialog surfaces under Tauri"

key-files:
  created: []
  modified:
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/sidecar/__tests__/installFlows.test.ts

key-decisions:
  - "A returned {status:'error'} now always pushes a terminal gameStatusUpdate('done'), mirroring Electron's own removeFromQueue(appName, forceStatusUpdate=true) — an errored install starts no ACF poller, so nothing else would ever clear the badge"
  - "The client-not-ready sentinel ('Steam client not ready' prefix) is excluded from the new showDialogBoxModalAuto call to avoid a duplicate prompt colliding with ensureSteamClientReady's existing steamClientSetupRequired push"
  - "UAT premise correction (record only, no code change): the Game-Page Steam Install button is a direct window.api.install({path:''}) bypass with NO folder picker by design — 'the native folder picker never opens' was a wrong test expectation, not a defect"

requirements-completed: [REQ-30-04, REQ-30-05]

# Metrics
duration: ~10min
completed: 2026-07-23
---

# Phase 30 Plan 05: Clear the Tauri install spinner on a returned depot error Summary

**Sidecar install bypass now pushes a terminal `done` and a `showDialog` ERROR frame for a returned (non-thrown) `SteamGame.install()` failure, closing Gap 1 (Phase 30 UAT Test 4 — install spinner hangs forever under Tauri).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-23T00:29:00Z (approx, based on commit timestamps)
- **Completed:** 2026-07-23T00:35:00Z (approx)
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- Root-caused-and-fixed the stuck "installing" badge: `runNativeDepotDownload` → `ensureSteamClientReady` RETURNS `{status:'error'}` rather than throwing when Steam can't proceed headless, and the sidecar's `install` handler's `finally` guard only cleared the badge for `deferredToSetup`/`wasAborted` — never for a plain returned error. Added a third `hadError` flag to that guard.
- Genuine depot failures (e.g. "depot download failed") now surface a `showDialogBoxModalAuto({type:'ERROR', ...})` frame carrying the real error text, riding the same `frontendMessage` relay `gameStatusUpdate` already uses under Tauri (zero Rust changes).
- The client-not-ready case (`ensureSteamClientReady`'s fallback string `"Steam client not ready for appId ${appId}"`) is explicitly excluded from the new dialog call — that path already fires `steamClientSetupRequired`, and a second modal would collide with the existing setup prompt.
- TDD RED→GREEN: the existing CR-02 test asserting the buggy `['queued','installing']` sequence for a returned error was rewritten to assert `['queued','installing','done']` first (RED, confirmed failing), then the implementation change made it (and two new tests) pass (GREEN).
- Full sidecar regression sweep (127 tests across 10 suites) and `tsc --noEmit` both pass — confirms the change is additive and non-fatal (SEAM Invariant B preserved), and that `showDialogBoxModalAuto`'s import (already reachable via `uninstaller.ts`'s `notify` import) did not introduce a new fatal import into the sidecar bootstrap path.

## Task Commits

1. **Task 1: Clear the badge and surface a returned install error in the sidecar bypass** — RED: `34214fda` (test), GREEN: `4ee96b3f` (feat)
2. **Task 2: Full regression sweep — both builds and the sidecar suite stay green** — verification-only, no code change; see Verification below.

**Plan metadata:** (pending — see final commit below)

## Files Created/Modified

- `src/backend/sidecar/installFlowRegistration.ts` — added `hadError` flag; on `result.status === 'error'` sets `hadError = true` and calls `showDialogBoxModalAuto` (suppressed for the client-not-ready sentinel); extended the `finally` guard from `deferredToSetup || wasAborted` to `deferredToSetup || wasAborted || hadError`.
- `src/backend/sidecar/__tests__/installFlows.test.ts` — rewrote the CR-02 returned-error test to assert the new `['queued','installing','done']` sequence (removed the stale "out of this slice's scope" comment); added a test asserting a genuine depot failure emits a `showDialog` ERROR frame containing the error text; added a test asserting the client-not-ready case clears the badge without a duplicate `showDialog` frame.

## Decisions Made

- Mirrored Electron's `removeFromQueue(appName, forceStatusUpdate=true)` behavior exactly rather than inventing a new terminal-status contract — keeps both builds' outcome handling in parity per SEAM.md's additive/reversible invariant.
- Used a simple `startsWith('Steam client not ready')` string-prefix guard to distinguish the client-setup case from a genuine depot failure, matching the exact fallback string `runNativeDepotDownload` returns (`storeManagers/steam/games.ts:1186`) rather than adding a new structured error code (would have required touching `clientSetup.ts`/`games.ts`, out of this plan's scope).
- Recorded the UAT premise correction from the plan objective (Game-Page Install button has no folder picker by design) — no code change, just documentation per the plan's instruction.

## Deviations from Plan

None - plan executed exactly as written. The TDD RED/GREEN sequence, the `hadError` flag, the dialog suppression guard, and the regression sweep all match the plan's `<action>`/`<behavior>` specification precisely.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Gap 1 (install spinner hangs forever) is closed. The Tauri library button now always leaves the "installing" state on any install outcome (success/abort/deferred/error).
- The `steamClientSetupRequired` push is confirmed already wired end-to-end under Tauri (via the generic `frontendMessage` relay + the existing `GlobalState.tsx` listener) — no additional Phase 30 work needed for that surface.
- Ready for 30-06 (the second Phase 30 UAT gap — settings unreachable) and the eventual re-run of Phase 30 UAT/verification.

---
*Phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check*
*Completed: 2026-07-23*
