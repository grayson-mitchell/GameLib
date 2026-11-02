---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 27
subsystem: steam-engine
tags: [abort, bottle, gap-closure]
requires: []
provides: [PROVISION_ABORTED, discardNewBridgeBottle, ProvisionBottleResult.createdHere]
affects: [games.ts install flow (59-29)]
key-files:
  modified:
    - src/backend/storeManagers/steam/engine/fallbackEngine.ts
    - src/backend/storeManagers/steam/engine/__tests__/fallbackEngine.test.ts
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
decisions:
  - Abort in CrossOver path returns PROVISION_ABORTED (no fallback attempt)
metrics:
  completed: 2026-11-02
---

# Phase 59 Plan 27: Abortable engine install and bottle creation Summary

Engine install now aborts after sha256/extract and before rename; provisionBridgeBottle takes an AbortSignal, cleans up what it created, and both CROSSOVER_CREATE_FAILED branches stop the wineserver first.

## Commits
- 88619b4b3: engine install abort checks (WR-03)
- Task 2 commit: bottle abort, WR-04, createdHere, discardNewBridgeBottle (see git log, "fix(59-27): abortable bridge-bottle creation")

## Deviations from Plan
- Existing tests updated for the new third spawnAsync argument (`expect.anything()`) and `createdHere` on bridge done results. No other deviations.
- Added a third abort check immediately before renameSync (plan allowed "again right before rename").

## Verification
fallbackEngine (19), bottle (198) and fakeHomeIsolation tests pass; eslint (one pre-existing warning) and `pnpm codecheck` clean.

## Self-Check: PASSED
