---
phase: 74-steam-game-updates
plan: 08
subsystem: steam
tags: [steam, update, installapp, polling]
requires: [74-04]
provides:
  - updateRegisteredSteamGame (InstallApp or steam://nav/games/details hand-off)
  - buildSteamProtocolUrl 'details' verb
  - pollUpdateOnce and PollOptions.awaitingUpdate
affects: [74-09]
key-files:
  created:
    - src/backend/storeManagers/steam/updateNative.ts
    - src/backend/storeManagers/steam/library/updatePollOnce.ts
    - src/backend/storeManagers/steam/__tests__/updateNative.test.ts
    - src/backend/storeManagers/steam/__tests__/library.updatePollOnce.test.ts
  modified:
    - src/backend/storeManagers/steam/gameProtocolUrl.ts
    - src/backend/storeManagers/steam/library/installRoot.ts
    - src/backend/storeManagers/steam/library/pollState.ts
    - src/backend/storeManagers/steam/library/installPolling.ts
    - src/backend/storeManagers/steam/library/installPollOnce.ts
key-decisions:
  - "Update completion needs !isAcfUpdatePending AND bit 4 AND (a pending/active update was seen OR buildid changed from fromBuild), so an ACF that has not yet registered the update never reads as instantly done."
requirements-completed: []
completed: 2026-11-12
---

# Phase 74 Plan 08: Registered-game update via Steam Summary

Update on a Steam-registered game now asks Steam (InstallApp when opted in on macOS, else opens `steam://nav/games/details/<appId>` through the numeric-guarded builder) and shows "Updating" progress from an update-aware branch of the install poller, finishing only when the ACF shows no pending update.

## Tasks
1. updateRegisteredSteamGame + details verb - a0b7b86e4
2. Update-aware polling branch - 68658c64d

## Verification
- jest: updateNative (6), library.updatePollOnce (6), installPollOnce, installPolling, and the whole steam folder (4328 passed).
- `pnpm codecheck`, `pnpm steam-line-ceiling` pass; prettier clean; eslint 0 errors.
- `pnpm find-deadcode` fails only on other plans' exports (RustDeltaEstimate, RustDeltaMode in depotRust/types.ts, plus the known plan-04 ones); nothing from this plan.

## Deviations from Plan
- Poll entry's `awaitingUpdate` carries two extra bookkeeping flags (`sawPending`, `sawActivity`) beyond `{fromBuild}`; PollOptions keeps the planned shape.
- `SteamGame.update()` in games.ts is not wired to `updateRegisteredSteamGame` (not in this plan's files; left for the wiring plan).
- The 'gamelib:steam.update.refusedRunning' key is added by plan 09; a default string is supplied here.

## Known Stubs
None in this plan (games.ts `update()` remains the pre-existing stub until wired).

## Self-Check: PASSED
