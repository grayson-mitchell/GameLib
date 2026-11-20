---
phase: 65-steam-store-manager-decomposition-continued
plan: 18
subsystem: steam-store-manager
tags: [refactor, decomposition, drm-stage]
requires: [65-17]
provides: [bridge/drm/stageDrmTypes.ts, bridge/drm/drmRegistry.ts, bridge/drm/drmRestore.ts, bridge/drm/bottleProcesses.ts]
affects: [drm/stageDrmBottle.ts, drm/drmLaunchSetup.ts]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/drm/stageDrmTypes.ts
    - src/backend/storeManagers/steam/bridge/drm/drmRegistry.ts
    - src/backend/storeManagers/steam/bridge/drm/drmRestore.ts
    - src/backend/storeManagers/steam/bridge/drm/bottleProcesses.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmRegistry.test.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmRestore.test.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/bottleProcesses.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
    - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts
    - meta/knip-baseline.txt
    - meta/steamLineCeilingBaseline.json
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 18: stageDrmBottle split Summary

`bridge/drm/stageDrmBottle.ts` (1,005) split on real seams into sibling files (no subdirectory, no index): `stageDrmTypes.ts` (leaf: `StageDrmBottle{Input,Deps,Ok}`), `drmRegistry.ts` (DRM path constants, `buildDrmRegistryCommands`, `drmRegistryMismatches`, `drmRegistryStagedInUserReg`, `isPhase52ForwarderBytes`, `forcedFirstTimeoutMs`, `runRegArgv`, `MAX_USER_REG_BYTES`), `drmRestore.ts` (`bottleHostToWinPath`, `readHeadCapped`, `WalkCtx`, `walkRuntimeDlls`, `restoreDrmOriginals`, `removeTcpBridgeArtifacts`) and `bottleProcesses.ts` (`defaultListBottleProcesses`, `pidsOfBottleSession`, `pidsWithCwdInBottle`, `defaultEndStageSession`). No new file imports `./stageDrmBottle`. The steam-line-ceiling allowlist is now `{}`; the gate handles an empty baseline unchanged (PASS, 0 allowlisted over 1000, 169 files scanned).

## Commits
- f66f23270 refactor(65-18): move StageDrmBottle types to stageDrmTypes leaf (also empties the ceiling baseline: the file dropped to 953 lines here)
- 1dcee8131 refactor(65-18): move DRM registry commands and runRegArgv to drmRegistry
- 5c8608f3f refactor(65-18): move DRM restore and TCP artifact cleanup to drmRestore
- f9d061e94 refactor(65-18): move bottle process listing to bottleProcesses

## Line counts
stageDrmBottle 398, stageDrmTypes 69, drmRegistry 183, drmRestore 258, bottleProcesses 175.

## Verification
- Steam suite: numTotalTests 4389 (>= 4389), numRuntimeErrorTestSuites 0, failed 2. Failing names not in 65-baseline-steam.txt: 1, `steam/games.ts module surface (D-05) lifted modules import siblings forward only (no cycle)`. It is not caused by this plan: it reads games-side `game*.ts` files that a concurrent session (quick-261108-ca6, gameBridgeLaunchGate.ts, not in the test's FORWARD map) was editing and committing during the run; no DRM file is involved. Left alone.
- unref: `npx jest -t unref src/backend/storeManagers/steam`: 7 suites passed, 9 tests passed (4380 skipped by filter). `grep -c unref drmRegistry.ts` >= 1; the `runRegArgv` timer moved verbatim. bottleProcesses owns no timer, watcher or child handle itself (spawns go through `runBoundedListing`, which unrefs).
- codecheck clean, boundaries clean (1095 modules), steam-line-ceiling PASS (0 allowlisted). `pnpm lint`: 0 errors except the known games.test.ts `require()` error. indexedAccess steam buckets equal baseline (failing buckets are outside steam). find-deadcode: only pre-existing drift; no finding names a DRM file except the stale `runnerClone.ts RunnerTool` line.
- `ls bridge/drm/index.ts` fails (D-08).

## Knip
The six identities (`DRM_COMPONENT_FILES, DRM_REG_ADD_RETRIES, DRM_REG_ADD_TIMEOUT_MS, DRM_STEAM_DIR_SEGMENTS, DRM_STEAM_DIR_WIN, DRM_VALVE_FILES`) were deleted: each is now imported across modules by stageDrmBottle.ts.

## Cycle rule
Census raw count 482 (65-17: 485; the concurrent session's quick-task changes also moved this number). New modules in cycles from this plan: `bridge/drm/stageDrmTypes.ts`, `drmRegistry.ts`, `drmRestore.ts`, `bottleProcesses.ts`, all split products of `bridge/drm/stageDrmBottle.ts` (on the list). The other set differences (library/*, runner{Crossover,Entitlements,Verify}, bridge helper/shim modules, game* etc.) are earlier split products or leaves from 65-13 to 65-17 and the concurrent quick task (gameBridgeLaunchGate), untouched by this plan.

## Deviations
- The ceiling baseline became `{}` in the first commit rather than the last: the types move alone brought stageDrmBottle.ts to 953 lines, and the gate requires removal in the commit that crosses under the ceiling.
- Test describes were moved to `drmRegistry.test.ts`, `drmRestore.test.ts`, `bottleProcesses.test.ts` with their fixtures and the jest.mock factories their import chains need; test count unchanged (333 passed in the drm dir before and after).

## Known Stubs
None.

## Self-Check: PASSED
