---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 26
subsystem: steam-engine
tags: [gap-closure, dxvk, engine-switch]
requires: [59-24]
provides: [blocking restore failure, failed-restore marker, recopying source-pinned backup]
key-files:
  modified:
    - src/backend/tools/index.ts
    - src/backend/tools/__tests__/dxvkInstallRemove.test.ts
    - src/backend/storeManagers/steam/engine/engineSwitch.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineSwitch.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
requirements-completed: [D-03, D-07, D-09]
completed: 2026-11-02
---

# Phase 59 Plan 26: Restore failure blocks launch Summary

A failed return to CrossOver now blocks the launch with the restoreFailed dialog, a partial restore is recorded as `dxvk: 'failed'`, and the restore resolves its source before stopping any wineserver.

## Commits
- 82c2beccf: source-pinned DXVK backup always recopies (short-circuit only when `!source`)
- e5a02e97f: engineSwitch ordered restore, failed marker, half-pin fall-through, missing-wineserver skip
- 9d6f878b1: games.ts blocks launch on dxvk-failed for CrossOver, progress-reporting ensurePinEngine, install redists skipped

## Deviations from Plan
- Existing engineSwitch tests adjusted: the pinned-to-CrossOver kill test now creates a real wineserver file (the missing-binary skip would otherwise not call kill), and the "no wineBin" test stubs ensurePinEngine to null (half pin now fetches Wine).
- Source resolution happens before `onSwitching`, so a no-source failure shows no "setting up" status.
- No dedicated test for `resolveInstallEngineSettings` (private, heavy setup); the guard is a two-line change covered by typecheck only.
- The test dropped the `markBridgeFailedThisSession` assertion because it is a real function in that suite; `steamBridgeSetupRequired` not-sent is asserted.

## Verification
dxvkInstallRemove (14), engine suite (189), games.test.ts (559) pass; `pnpm codecheck` clean; eslint 0 errors; prettier clean.

## Self-Check: PASSED
