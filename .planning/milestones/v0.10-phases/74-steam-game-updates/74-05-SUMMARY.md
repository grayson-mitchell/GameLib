---
phase: 74-steam-game-updates
plan: 05
subsystem: steam
tags: [steam, update-detection, auto-update, checkGameUpdates]
requires: [74-04]
provides:
  - Steam listUpdateableGames / listAutoUpdateableGames (delegate to detectSteamUpdates)
  - optional LibraryManager.listAutoUpdateableGames contract field
  - buildUpdateQueueElement shared module (downloadmanager/updateElement.ts)
affects: [74-09]
key-files:
  created:
    - src/backend/downloadmanager/updateElement.ts
    - src/backend/utils/__tests__/checkGameUpdates.test.ts
    - src/backend/storeManagers/steam/__tests__/library.updates.test.ts
  modified:
    - src/backend/storeManagers/steam/library/index.ts
    - src/common/types/game_manager.ts
    - src/backend/utils/checkGameUpdates.ts
    - src/backend/storeManagers/index.ts
key-decisions:
  - "D-02 is structural: checkGameUpdates feeds autoUpdate only the intersection of listAutoUpdateableGames (bridge-only for Steam) and the badge list; the badge list is always returned whole."
requirements-completed: []
completed: 2026-11-12
---

# Phase 74 Plan 05: Update plumbing Summary

Stale Steam games (bridge and registered) now reach the existing `gameUpdates` badge path, while only stale bridge games are fed to `autoUpdate`; `getDMElement` moved to a shared `buildUpdateQueueElement`.

## Tasks
1. Steam list methods + contract field - 96e09fe1e
2. checkGameUpdates split + shared queue element - 4a22b8444

## Verification
- jest: library.updates (3), checkGameUpdates (6), installFlows pass.
- `pnpm codecheck`, `pnpm lint` (0 errors), `pnpm steam-line-ceiling`, prettier clean.
- `pnpm find-deadcode`: only the six known plan-04 exports still unconsumed (STEAM_UPDATE_*_MS, SteamUpdateEstimate/Kind/StateValue); `buildUpdateQueueElement` is not flagged.

## Deviations from Plan
- [Rule 3] Removed the now-unused `GameInfo` import from storeManagers/index.ts (lint error after moving getDMElement); typed `library[runner]` as `LibraryManager` in checkGameUpdates so the optional method type-checks.

## Self-Check: PASSED
