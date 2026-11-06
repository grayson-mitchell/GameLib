---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 21
subsystem: steam-bridge-drm
tags: [drm, steamstub, unreal-engine, routing, gap-closure]
requires: [56-19, 56-20]
provides:
  - launch routing and persisted drmWrapper stamp from detectLaunchDrmWrapper
  - bottle staging cleanup of TCP artifacts next to the UE Shipping exe
affects: [56-26]
tech-stack:
  added: []
  patterns: [resolver returns drmExe so CEG markers come from the .bind exe]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
    - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmLaunchSetup.test.ts
decisions:
  - "Launch exe stays the bootstrap; only detection, CEG read and staging cleanup follow drmExe"
metrics:
  tasks: 2
  completed: 2026-10-29
---

# Phase 56 Plan 21: UE-aware DRM routing wiring Summary

Ranch Simulator-style Unreal titles (.bind only on the Shipping exe) now route to steamclient-layer DRM mode via `detectLaunchDrmWrapper`, with CEG markers read from the .bind exe and staging cleanup covering the Shipping exe directory.

## Commits
- 25873ec78: stage cleanup covers extraExeDirs (Task 2, committed first as independent)
- c592ba1eb: routing and stamp wired to the resolver (Task 1)

## What changed
- `launchBridgeGame` calls `detectLaunchDrmWrapper(bottleDir, exePath)`, reads CEG markers from `drmExe`, logs when .bind is on a UE runtime exe, and passes `drmExe` to `drmLaunchSetup` (exePath stays the bootstrap).
- `placeShimForGame` stamps `drmWrapper` (and verdict) from the same resolver; `withDrmWrapper` takes the resolver result.
- `StageDrmBottleInput.extraExeDirs` (containment-checked against drive_c, failing with `extra exe dir outside bottle drive_c`) feeds both cfg and forwarder cleanup; `drmLaunchSetup` supplies `[dirname(drmExe)]` only when drmExe differs from exePath.
- Tests: games.test (Shipping routing, CEG refusal kept, resolver none), shimGenerate stamp, stage extraExeDirs (clean, reject outside, empty), drmLaunchSetup passthrough.

## Deviations from Plan
- Task order: Task 2 was committed before Task 1 (independent changes; Task 1 tests needed the games.test mock reworked).
- 98837f09b (launch from install root) did not touch the routing lines; no adjustment needed.
- [Rule 3] games.test mocks `../bridge/drm/drmScanExe` with a default that delegates to the mocked `detectDrmWrapper`, keeping existing tests on their prior path. `drmExe` was added to the existing exact `toHaveBeenCalledWith` expectation.
- shimGenerate imports drmScanExe, which imports shimGenerate (circular); safe because both use each other only at call time.

## Verification
`npx jest src/backend/storeManagers/steam` 89 suites pass; `pnpm codecheck` passes; prettier clean via pre-commit. Live Ranch result is for 56-26.

## Known Stubs
None.

## Self-Check: PASSED
Commits 25873ec78 and c592ba1eb exist.
