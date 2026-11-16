---
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
plan: 04
subsystem: steam
tags: [engine-marker, drm-mode, crossover, wine-staging, bridge-bottle]
requires: [76-03]
provides:
  - creation-time engine marker (pinned and crossover) in provisionBridgeBottle
  - reconcile-before-probe in the DRM launch branch
affects: []
key-files:
  modified:
    - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
    - src/backend/storeManagers/steam/gameInstallBridge.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
key-decisions:
  - "D-07a: install records the engine it used after a successful creation; decideCreationEngine unchanged"
  - "DRM launch reconciles the marker before drmOfflinePrecheck/preflightCrossover; TCP path untouched"
requirements-completed: [DEBT-01]
duration: 20min
completed: 2026-11-17
---

# Phase 76 Plan 04: Wire creation-time and launch-time engine markers Summary

Bridge bottles now carry a pinned or crossover marker from creation, and the DRM launch branch reconciles the marker before CrossOver's probe can mislabel a Staging bottle; WR-04 folded.

## Commits
- 30bb27f50 fix(76-04): record the engine marker at bridge bottle creation (D-07a)
- 357d839af fix(76-04): reconcile the bottle engine marker before the DRM pre-flight; done on unresolved install root

## Base and counts
- Base SHA: 4ce352cab13ab61ac04bec1fd27b32dd8d089a02
- `jest.mock(` count: games.test.ts 46 before / 46 after; bridgeBottleLifecycle.test.ts 6 before / 6 after (only an existing factory object gained `reconcileBottleEngineMarker`).

## What changed
- provisionBridgeBottle: new `fallbackPinId` option; `recordPinnedBottleEngine` after a `done` fallback creation (default ENGINE_PINS.current.id); `recordCrossoverBottleEngine` in the CrossOver success tail after the kill.
- gameInstallBridge: `fallbackPinId` at both pinned creations (creation.pin.id and ENGINE_PINS.current.id); no other line changed.
- gameBridgeLaunch: `reconcileBottleEngineMarker` first thing in `if (wantsDrm)`; `sendLaunchDone` on an unresolved DRM install root (WR-04).
- Tests: 9 creation-marker tests, 2 fallbackPinId assertions, 2 ordering tests, TCP negative, WR-04 assertions.

## Deviations from Plan
None in behavior. Task 1 code was written before the test run, so its RED state was not observed separately; Task 2 RED was confirmed (3 failures) before the code.

## Verification
games, bridgeBottleLifecycle, engineSwitch, backendDiCeilings, boundaryGates jest green; `pnpm codecheck` green; eslint 0 errors; prettier clean; `graphify update .` run.

## Known Stubs
None.

## Self-Check: PASSED
