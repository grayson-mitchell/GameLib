---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 22
subsystem: steam-bridge
tags: [prescreen, gap-closure, CR-04, shimGenerate]
requires: []
provides:
  - separator-normalised screenDepotPlanForSteamApi
  - runtimeLoadedSteamApiMarker (importParse.ts)
  - bounded install-tree walk on the no-steam-api branch of placeShimForGame
  - reconcileBridgePrescreen (no downgrade of x86/x64/both to none; none upgraded to scanned arch)
key-files:
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts
    - src/backend/storeManagers/steam/bridge/importParse.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
key-decisions:
  - "Runtime-loaded steam_api is recorded as a scan miss with `<dll>@runtime-loaded` markers (never covered by isScanVerdictNowCovered), routing through the existing D-05 fallback rather than inventing a new steamApi value"
  - "Prescreen 'none' is only written over undefined/none/unknown; a persisted 'none' is upgraded on a placed verdict"
requirements-completed: [D-51-06, D-51-07, D-51-05]
completed: 2026-10-22
---

# Phase 51 Plan 22: Prescreen separator fix and CR-04 Summary

Depot prescreen now sees `system\steam_api64.dll`-style paths, and a title that loads steam_api at runtime takes the D-05 bottled-Steam fallback instead of a helper-less bridge route; the persisted prescreen can no longer be downgraded to `none`.

## Commits
- 2ba070588: Task 1, backslash-normalised basename in the prescreen, five new fixtures.
- 1df09a29d: Task 2, CR-04 (runtime-loaded miss, gameInstallRoot at both call sites, prescreen reconcile).

51-REVIEW.md CR-04 is resolved by these commits. The todo `2026-10-22-bridge-prescreen-always-returns-none.md` stays PENDING until 51-30 observes a non-`none` prescreen live.

## Sweep of basename/join calls (Task 1)
- depot.ts:951 `basename(file.filename)`: FIXED (separator-normalised).
- depot.ts:141, 828, 930, 2571, 2583, 3071 `.join`: array string joins, not path ops, not affected.
- depot.ts:3168 `join(root, entry.name)`: local filesystem path, not affected.
- bridge/bridgeConfig.ts:145 `join(dirname(exe))`: local path, not affected. bridgeConfig.ts:152, interfaceVersions.ts:302, shimCoverage.ts:347-354: array joins.
- bridge/helperProcess.ts:216-217 `join(stateDir, appId)`: local path, not affected.
- bridge/launchTarget.ts:177-182: `join(..., ...executable.split('\\'))` already splits backslashes; not affected.
- bridge/shimGenerate.ts:315, 392: local path / array join, not affected.
- bridge/allowlist.ts:47: comment only.

## Deviations from Plan
- No existing `normalizePath` helper was found in steam/*.ts, so the inline `replace(/\\/g, '/')` form was used.
- Existing games.test.ts assertions on exact `placeShimForGame` opts were relaxed to `expect.objectContaining` because opts now carry `gameInstallRoot`.
- The prescreen upgrade also applies to `already-placed` results that carry a verdict (harmless; the type permits it).

## Verification
shimGenerate, games, shimCoverage suites: 388 passed. prescreen suite: 16 passed. `pnpm codecheck` clean. Prettier clean on all written paths.

## Self-Check: PASSED
