---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 04
subsystem: steam-store-manager
tags: [gameinfo, steam, typescript]
requires: [70-01, 70-03]
provides:
  - Steam SM typed by SteamGameInfo (store, in-memory library Map, SteamGame.getGameInfo, builders)
affects: [70-07, 70-11]
key-files:
  modified:
    - src/backend/storeManagers/steam/{stores,games,gameMetadata,state,bridgeInstallState,macArchKnownFix}.ts
    - src/backend/storeManagers/steam/library/{index,refresh,resume,resumeBreadcrumbs,installPollOnce,macArch,uninstallPolling}.ts
    - 7 steam/sidecar test fixtures (type-only)
key-decisions:
  - "SteamLibraryManager.getGameInfo/getListOfGames keep returning GameInfo: narrowing them leaks 'SteamGameInfo | GameInfo' into downloadqueue.ts and macArch/recovery.ts (70-07 files). Narrow them when 70-07 lands."
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 04: Steam SM typed by SteamGameInfo Summary

`steamLibraryStore` is `CacheStore<SteamGameInfo[], 'games'>`, `SteamLibraryState.library` is `Map<string, SteamGameInfo>`, `SteamGame.getGameInfo()` returns `SteamGameInfo`, and every Steam library object builder is typed `SteamGameInfo`. Type-only change; runtime values and key order are untouched.

## Verification

- `npx tsc --noEmit`: 0 errors. Flip probe `--non-test`: zero errors in storeManagers/steam.
- eslint (changed files): 0 errors. prettier: clean.
- jest steam library + `__tests__` suites: 2904 pass. Two bridge suites (`shimCoverage`, `shimGenerate`, steam_api.def symbol pin) fail; they touch no file in this plan and look pre-existing.
- Read casts: the only `as SteamGameInfo` is the Pitfall-4 sentinel in games.ts. No `asStoreGame` was needed (nothing in the Steam SM read Steam-only fields from externally-supplied `GameInfo`).

## Deviations from Plan

1. [Rule 3] Files beyond the 10 listed: `state.ts` (the library Map type; the root cause of most downstream errors), `bridgeInstallState.ts`, `macArchKnownFix.ts`, `library/installPollOnce.ts`, `library/macArch.ts`, `library/uninstallPolling.ts` (they build from the Map and tsc required SteamGameInfo).
2. [Rule 3] Test fixtures retyped (type-only) so tsc stays green: steam `__tests__` (games, bridgeRouteVerdict, cancelDelete, library.localLibrary, queueHeadRevalidation, staleQueueHeadCancel.regression) and `sidecar/__tests__/steamFlows.test.ts`. 70-11 still owns the remaining probe-flagged test errors that only appear post-flip.
3. `resumeBreadcrumbs.ts` `breadcrumbAppIsFullyInstalledOnDisk` param is `Partial<SteamInstalledInfo>`.
4. The two plan tasks were committed together because the Map retype made them inseparable for tsc (single commit 4e9e73c59).

## Commits

- 4e9e73c59 feat(70-04): type the Steam store manager by SteamGameInfo

## Known Stubs

None.

## Self-Check: PASSED
