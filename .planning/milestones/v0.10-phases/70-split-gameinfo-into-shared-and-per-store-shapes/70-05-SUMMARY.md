---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 05
subsystem: backend-types
tags: [gameinfo, gog, sideload, typed-store]
requires: [70-01, 70-03]
provides:
  - GOG manager typed by GogGameInfo / GogInstalledInfo
  - Sideload manager typed by SideloadGameInfo
key-files:
  modified:
    - src/backend/storeManagers/gog/{stores,games,library,setup,gogRuntime}.ts
    - src/backend/storeManagers/gog/__tests__/gogRuntime.test.ts
    - src/backend/storeManagers/sideload/library.ts
    - src/common/types/typed_store.ts
key-decisions:
  - "sideload addNewApp keeps storing unconditionally (frontend always sends runner 'sideload'); the three sideload-only keys are read via asStoreGame(gameInfo, 'sideload') ?? {}, so a non-sideload payload no longer smuggles them in. The stored object is still the field-by-field SideloadGameInfo literal, no cast."
  - "gogRuntime.ts (Map<string, GogGameInfo>/GogInstalledInfo) was retyped too: it is GOG-internal state not named in the plan, and the maps feed the manager's retyped getters."
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 05: GOG and sideload manager retype Summary

GOG library store, runtime maps, getGameInfo/getListOfGames, install builders and gogInstalledGamesStore now use GogGameInfo / GogInstalledInfo; sideload getGameInfo/getListOfGames/sideloadedStore.games use SideloadGameInfo. `thirdPartyManagedApp: undefined` write untouched; sideloadedStore.installed stays InstalledInfo[].

## Verification

- Flip probe: exit 0 for storeManagers/gog, storeManagers/sideload and typed_store.ts (non-test).
- `npx jest src/backend/storeManagers/gog src/backend/storeManagers/sideload`: 101 pass. Prettier clean on changed files.
- `npx tsc --noEmit`: 3 remaining errors, all in 70-07-owned files and caused by the now-covariant `getGameInfo` return: downloadqueue.ts:325 (isEAManaged/isUbisoftManaged), macArch/recovery.ts:200 (installedDLCs). Both are in 70-03's 70-07 ownership table; 70-07 must narrow them.

## Deviations from Plan

- [Rule 3] Retyped `gog/gogRuntime.ts` (not in files_modified) and fixed `gog/__tests__/gogRuntime.test.ts` casts so the retyped maps compile.
- tsc is not fully green until 70-07 lands (see above), by construction of the wave order.

## Commits

- 3c603364b feat(70-05): type the GOG store manager by GogGameInfo
- 19b5b850e feat(70-05): type the sideload manager by SideloadGameInfo

## Known Stubs

None.

## Self-Check: PASSED
