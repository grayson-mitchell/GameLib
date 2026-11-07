---
phase: 65-steam-store-manager-decomposition-continued
plan: 16
subsystem: steam-store-manager
tags: [refactor, decomposition, bridge-shim]
requires: [65-15]
provides: [bridge/shimOriginals.ts, bridge/shimDrmWrapper.ts, bridge/shimPlacement.ts]
affects: [drm/drmScanExe.ts, drm/stageDrmBottle.ts, originalRestore.ts, games.test.ts]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/shimOriginals.ts
    - src/backend/storeManagers/steam/bridge/shimDrmWrapper.ts
    - src/backend/storeManagers/steam/bridge/shimPlacement.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimOriginals.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
    - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
    - src/backend/storeManagers/steam/bridge/originalRestore.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - meta/steamLineCeilingBaseline.json
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 16: shimGenerate split Summary

`bridge/shimGenerate.ts` (1,479) split into sibling files, no subdirectory or index: `shimOriginals.ts` (371: shim filenames/markers, `isGameLibShimBytes`, `PlaceShimResult*` types, `ORIGINAL_BACKUP_SUFFIX`, fingerprint/backup, restore/probe as one module), `shimDrmWrapper.ts` (132: `detectDrmWrapper`, `withDrmWrapper`, `detectExeSteamDrm`), `shimPlacement.ts` (835: withhold helpers, `scanDeps`, `placeShimForGameInner`) and `shimGenerate.ts` (192: `placeShimForGame` only, so its other importers are unchanged). shimGenerate left the ceiling allowlist; the baseline now holds 2 keys (runnerClone, stageDrmBottle).

## Commits
- 9c19b4b88 refactor(65-16): move shim constants, fingerprint, backup and restore to shimOriginals
- db26ecec1 refactor(65-16): move SteamStub and CEG detection to shimDrmWrapper
- 5f5679cb7 refactor(65-16): move shim placement and withhold guard to shimPlacement

## Line counts
shimGenerate 192, shimOriginals 371, shimDrmWrapper 132, shimPlacement 835. shimPlacement is under the ~850 threshold, so the optional `shimWithhold.ts` was not created (measured 835).

## Verification
- Steam suite: numTotalTests 4389 (>= 4389), numRuntimeErrorTestSuites 0, failing names not in 65-baseline-steam.txt: 0 (1 failed test, the baseline one).
- codecheck, boundaries (no violations), steam-line-ceiling (PASS, 2 allowlisted) clean. find-deadcode shows only the pre-existing drift outside shim files (no shim* finding). indexedAccess steam buckets equal baseline (the failing buckets are outside steam).
- `pnpm lint`: 0 errors except the known games.test.ts `require()` error.
- Source scan (shimGenerate.test.ts "BLOCKER 2") now reads shimGenerate, shimOriginals, shimDrmWrapper and shimPlacement. Non-vacuity: `for (const src of sources) expect(src.length).toBeGreaterThan(0)` and `expect(dllStringLiterals.length).toBeGreaterThan(0)`, plus the existing positive match on the `builtBridgeShimPath` import (now found in shimPlacement).
- drmScanExe now imports `detectDrmWrapper` from shimDrmWrapper, which imports nothing from drmScanExe or shimGenerate, so the former shimGenerate <-> drmScanExe edge is gone.

## Cycle rule
Census raw count 477 (65-15: 474). New module in cycles vs 65-baseline-steam-cycle-modules.txt from this plan: `bridge/shimPlacement.ts`, a split product of `bridge/shimGenerate.ts` (on the list). shimOriginals.ts and shimDrmWrapper.ts are not in any cycle. The other module-set differences (library/*, bottledSteam, bridgeBottle*, helperRegistry/helperSpawn, game*, etc.) were not touched by this plan; they are earlier split products or leaf modules already recorded in 65-13/14/15, not new in this wave. The +3 raw count is cycle-path violations through shimPlacement (cycles are counted per path, not per module).

## Deviations
- The plan's `shimPlacement.test.ts` and drmScanExe/stageDrmBottle/originalRestore test moves were not needed: the existing describes all drive `placeShimForGame` (the stable entry point, which stays in shimGenerate), so only the `isGameLibShimBytes` describe moved (to `shimOriginals.test.ts`). The `detectDrmWrapper` tests stay in shimGenerate.test.ts with a repointed import; no test fullName changed.
- games.test.ts: the shimGenerate mock factory dropped `detectDrmWrapper`; a new `jest.mock('../bridge/shimDrmWrapper')` carries it, and the lazy `require` inside the drmScanExe mock was repointed. No new `require()` was added.
- `originalFingerprintFor` is not exported (knip would flag it); other cross-module helpers were exported as needed.

## Known Stubs
None.

## Self-Check: PASSED
