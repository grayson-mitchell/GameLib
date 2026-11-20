---
phase: 65-steam-store-manager-decomposition-continued
plan: 08
subsystem: backend/storeManagers/steam
tags: [decomposition, bottle-split, drm-runner-registry]
requires: ["65-07"]
provides:
  - "steam/bridgeBottle.ts (bridge bottle names/readiness, findBridgeInstallBottle, stockBridgeBottleSettings, DRM/overlay runner registry, getBridgeBottleSettings, listReadyBridgeBottleNames)"
  - "resolveCrossoverWine and drmRunnerBinDir exported"
affects: []
key-files:
  created:
    - src/backend/storeManagers/steam/bridgeBottle.ts
    - src/backend/storeManagers/steam/__tests__/bridgeBottle.test.ts
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - meta/steamLineCeilingBaseline.json
    - "~45 importers and test files (see commit e79efa367)"
key-decisions:
  - "drmBridgeRunners lives only in bridgeBottle.ts (D-10); bottle.ts lifecycle reads it via getDrmBridgeRunner(appId)"
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 08: bottle.ts split, part 2 Summary

`resolveCrossoverWine` relocated in-file, then the bridge-bottle cluster moved to `bridgeBottle.ts`. Steam suite: 4385 tests (= baseline), 0 runtime-error suites, no failing name outside the baseline. bottle.ts 1469 -> 984 lines and leaves the line-ceiling allowlist (8 entries remain).

## Commits

- 20973e7eb relocate resolveCrossoverWine into the base bottle cluster (35 ins / 35 del, bottle.ts only, pure in-file move)
- e79efa367 move bridge bottle cluster to bridgeBottle

## Sizes (wc -l)

bottle.ts 984, bridgeBottle.ts 515, gameInstall.ts 1957 (baseline 1959 -> 1957), games.ts 1350 (1351 -> 1350).

## Decisions and notes

- `resolveCrossoverWine` (now exported) and `drmRunnerBinDir` (exported) cross the module line. `DEFAULT_BRIDGE_BOTTLE_NAME` and `getBottleSteamappsDir` stay in bottle.ts and are imported by bridgeBottle.ts.
- The bottle.ts lifecycle code used `drmBridgeRunners.has(appId)`; it now calls `getDrmBridgeRunner(appId)` so the Map stays private to its owner (T-65-23 acceptance greps pass: zero in bottle.ts, only a doc comment in engineRegistry.ts elsewhere).
- Import cycle: bottle.ts (lifecycle) -> bridgeBottle.ts -> bottle.ts, call-time only. It closes when 65-09 moves the lifecycle. provisionBottle.ts <-> bottle.ts from 65-07 is unchanged. Depcruise boundaries pass at zero.
- Mock factories: every `jest.mock('../bottle')` factory that carried a moved name gained a `jest.mock('../bridgeBottle')` factory carrying it (scripted for 22 simple factories; games.test.ts hand-split). requireMock sites in removeCopies and games.test.ts split likewise; shimGenerate's spyOn repointed. drmScanExe.test.ts needed a stub `bridgeBottle` mock because shimGenerate now reaches bridgeBottle -> config -> gog constants.
- bridgeBottle.test.ts carries the bridgeBottleNameFor, resolveBridgeBottleName, isBridgeBottleReady, findBridgeInstallBottle, getBridgeBottleSettings, DRM runner and listReadyBridgeBottleNames describes under the unchanged outer names (`bottle.ts > bridge bottle (24-04) > ...`), so fullNames match the baseline. Lifecycle describes stay in bottle.test.ts for 65-09.
- gameInstall.ts uses `import * as bridgeBottle` to stay under its ceiling.
- Unused imports pruned in touched tests with an eslint-driven script; this also dropped some pre-existing unused imports in the library.*.test.ts files (no behaviour change; tests green).

## Deviations from Plan

**1. [Rule 1 - Bug] Per-game bottle regex evaluated at module load**
- **Found during:** Task 2 test run (2 listReadyBridgeBottleNames failures)
- **Issue:** `PER_GAME_BRIDGE_BOTTLE_PATTERN` was a top-level `new RegExp` over `DEFAULT_BRIDGE_BOTTLE_NAME`. With bottle.ts and bridgeBottle.ts importing each other, the constant is undefined when bridgeBottle evaluates first-in-cycle, giving `^undefined-(\d+)$` (a real defect in load order, not only a test one).
- **Fix:** built on use via `perGameBridgeBottlePattern()`. Not byte-identical; the only non-move edit in the cluster.
- **Files:** bridgeBottle.ts. **Commit:** e79efa367

**2. [Rule 3] gameInstall.ts ceiling**: split imports grew it by 2; switched to a namespace import (as the plan's notes direct).

## Ratchets

`meta/steamLineCeilingBaseline.json`: bottle.ts entry removed (984 < 1000, gate demanded it), gameInstall.ts 1959 -> 1957, games.ts 1351 -> 1350 (import-line shrink, gate demanded the lowering). Cause: this plan's import rewrites.

## Pre-existing failures observed, left alone

logSecretGate (2, uninstaller.ts:131), tauriShellSource WR-07, testContainment Block C (ipcSchemaCoverage/ipcValidation unclassified), the two 56-01-SUMMARY.md ENOENT tests (bottle/bridgeBottle/games tests, in the steam baseline), `pnpm find-deadcode` drift (nothing naming bridgeBottle).

## Known Stubs

None.

## Self-Check: PASSED

bridgeBottle.ts and bridgeBottle.test.ts exist; commits 20973e7eb and e79efa367 present.
