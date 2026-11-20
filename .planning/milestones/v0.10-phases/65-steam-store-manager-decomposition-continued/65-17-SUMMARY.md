---
phase: 65-steam-store-manager-decomposition-continued
plan: 17
subsystem: steam-store-manager
tags: [refactor, decomposition, drm-runner]
requires: [65-16]
provides: [bridge/drm/runnerCrossover.ts, bridge/drm/runnerEntitlements.ts, bridge/drm/runnerVerify.ts]
affects: [drm/drmLaunchSetup.ts, overlay/overlayRunnerClone.ts]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/drm/runnerCrossover.ts
    - src/backend/storeManagers/steam/bridge/drm/runnerEntitlements.ts
    - src/backend/storeManagers/steam/bridge/drm/runnerVerify.ts
  modified:
    - src/backend/storeManagers/steam/bridge/drm/runnerClone.ts
    - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
    - src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.test.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.realCrossover.test.ts
    - meta/knip-baseline.txt
    - meta/steamLineCeilingBaseline.json
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 17: runnerClone split Summary

`bridge/drm/runnerClone.ts` (1,228) split into sibling files, no subdirectory or index: `runnerCrossover.ts` (CrossOver detection, hashing/containment prims, `safeRemove`/`removeInside`, `psListing`/`isPathInUse`), `runnerEntitlements.ts` (entitlement constants, `parseEntitlementKeys`, `dumpLoaderEntitlements`, `resignLoader` with `resignCounter`, `scrubCloneXattrs`), `runnerVerify.ts` (`MTIME_PINNED_PATHS`, `RUNNER_MARKER_FILE`, `Marker`, `RunnerReady`, `RunnerComponentInput`, `RunnerVerifyExpect`, `readyFor`, `sec`, `verifyRunnerClone`) and `runnerClone.ts` (`inFlight`, `ensureRunnerClone`, `runFront`, `pruneStale`, `cloneCrossoverTree`, `buildRunner`, `CLONE_ARGV_*`, `RunnerCloneDeps`, `StepError`/`stepFail`). Layering crossover <- entitlements <- verify <- clone is acyclic; no new file imports `./runnerClone`. runnerClone left the ceiling allowlist; the baseline holds 1 key (stageDrmBottle).

## Commits
- 57c1d4f96 refactor(65-17): move CrossOver detection and shared prims to runnerCrossover
- 6e102a4dd refactor(65-17): move entitlements and re-signing to runnerEntitlements
- 7606a79b3 refactor(65-17): move runner verify and MTIME_PINNED_PATHS to runnerVerify

## Line counts
runnerClone 597, runnerCrossover 287, runnerEntitlements 189, runnerVerify 258.

## Verification
- Steam suite: numTotalTests 4389 (>= 4389), numRuntimeErrorTestSuites 0, failing names not in 65-baseline-steam.txt: 0 (1 failed test, the baseline one).
- codecheck, boundaries (no violations), steam-line-ceiling (PASS, 1 allowlisted) clean. `pnpm lint`: 0 errors except the known games.test.ts `require()` error. indexedAccess steam buckets equal baseline (failing buckets are outside steam). find-deadcode: only pre-existing drift; no finding names a runner file except the stale `types ... runnerClone.ts RunnerTool` baseline line, which is the pre-existing drift (RunnerTool moved to engine/runTool.ts in an earlier phase) and was left alone.
- Source scan ("module source keeps its import discipline") now reads runnerClone, runnerCrossover, runnerEntitlements and runnerVerify. Non-vacuity: each file's length is asserted > 0 and the joined source must still contain `detectAllowedCrossover` and `ensureRunnerClone` declarations.
- `overlayRunnerClone.realCrossover.test.ts`: only its import was repointed; the host gating is unchanged.

## Knip
`parseEntitlementKeys` identity retargeted to runnerEntitlements.ts; `removeInside` and `MTIME_PINNED_PATHS` identities deleted (both now imported across modules).

## Cycle rule
Census raw count 485 (65-16: 477, +8). New modules in cycles vs 65-baseline-steam-cycle-modules.txt from this plan: `bridge/drm/runnerCrossover.ts`, `bridge/drm/runnerEntitlements.ts`, `bridge/drm/runnerVerify.ts`, all split products of `bridge/drm/runnerClone.ts` (on the list). The cycle path runs through the pre-existing dynamic `import('backend/engine/crossoverLocation')` in `defaultResolveBinDir`, which moved with `detectAllowedCrossover` into runnerCrossover, so the new modules inherit runnerClone's cycle membership; the +8 is extra cycle paths through them. The other set differences (library/*, bottledSteam, bridgeBottle*, helperRegistry/helperSpawn, shim{DrmWrapper,Originals,Placement}, game*, etc.) are earlier split products or leaf modules from 65-13 to 65-16, untouched by this plan.

## Deviations
- The plan's per-owner test files (`runnerCrossover.test.ts`, `runnerEntitlements.test.ts`, `runnerVerify.test.ts`, `drmLaunchSetup.test.ts` mocks) were not created or changed: the runnerClone.test.ts describes share about 280 lines of fake-run/setup helpers and every describe drives the public entry points, so moving them would need a new shared helper module for no coverage gain. No test fullName changed (count stays 4389). drmLaunchSetup.test.ts needed no edit (it does not mock runnerClone).
- `StepError`/`stepFail` stay in runnerClone.ts (not runnerCrossover as the plan listed): their only users are `ensureRunnerClone` and `buildRunner`, so moving them would force two new exports for no consumer in the other modules.
- gameDrmLaunch.ts needed no change (only a string mention of `runnerClone`).

## Known Stubs
None.

## Self-Check: PASSED
