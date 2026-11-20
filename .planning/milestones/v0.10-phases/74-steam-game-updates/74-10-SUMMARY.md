---
phase: 74-steam-game-updates
plan: 10
subsystem: steam
tags: [steam, update, bridge, delta, depot]
requires: [74-02, 74-03, 74-04, 74-06, 74-07, 74-08]
provides:
  - estimateBridgeUpdate (exact peak disk and download bound from a manifest pair)
  - updateBridgeGame (queue 'update' element: delta job with pause/resume/cancel)
  - SteamGame.update() kind dispatch (bridge / registered / neither)
affects: [74-11]
key-files:
  created:
    - src/backend/storeManagers/steam/updateBridge.ts
    - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts
    - src/backend/storeManagers/steam/__tests__/updateBridge.test.ts
    - src/backend/storeManagers/steam/__tests__/updateDispatch.test.ts
  modified:
    - src/backend/storeManagers/steam/games.ts
key-decisions:
  - "Dispatch lives in games.ts update() (noteSteamAuthTrigger stays the first statement); bridge = findBridgeInstallBottle, registered = readAcfUpdateState(native), else notBridgeOrNative."
  - "A fresh cached estimate (current target build, within the PICS TTL) is reused by updateBridgeGame; otherwise it estimates itself under its own lease."
  - "resolveBridgeUpdateContext (bottle, steamapps, installdir, BetaKey branch, string GIDs from the raw ACF) is shared by the estimate and the update."
requirements-completed: []
completed: 2026-11-12
---

# Phase 74 Plan 10: Bridge update via delta + update() dispatch Summary

`SteamGame.update()` is no longer a stub: bridge games run the chunk-level delta (refuse-running, branch, abort controller and in-flight registration, exact peak-disk check, `downloadSteamDepotsRust` with `delta.oldGidByDepot`, GID-keyed follow-ups, state invalidation, notify); Steam-registered games go to `updateRegisteredSteamGame`.

## Tasks
1. estimateBridgeUpdate (peak = sum of changedBytes when every old manifest is available, else the max; download = sum of maxDownloadBytes) - f6f6b7b86
2. updateBridgeGame and the update() dispatch - 63404813d

## Verification
- jest: updateEstimate (5), updateBridge (8), updateDispatch (3), games.test and depotRust dir (783 total) pass.
- `pnpm codecheck`, `pnpm steam-line-ceiling` pass; prettier clean; eslint 0 errors.
- `pnpm find-deadcode`: only `RustDeltaMode` (plan 06 export, not consumed here) remains; `RustDeltaEstimate` is now consumed.

## Deviations from Plan
- Added `updateDispatch.test.ts` (dispatch tests) rather than putting them in games.test.ts.
- `updateBridgeGame(steamGame)` takes no `UpdateArgs` (SteamGame.update() has none).
- First commit carried a stray eslint-disable header on the estimate test (unused); removed in the second commit.
- `grep -c "not implemented until Phase 2" games.ts` is 3, from `importGame`/`onInstallOrUpdateOutput` (not the update stub, which is gone).

## Known Stubs
None.

## Self-Check: PASSED
