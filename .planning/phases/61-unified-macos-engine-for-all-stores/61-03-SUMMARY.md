---
phase: 61-unified-macos-engine-for-all-stores
plan: 03
subsystem: macos-engine
tags: [refactor, move, bottle]
requires: ["61-02"]
provides:
  - "src/backend/engine/bottlePrimitives.ts: getBottleDir, sanitizeBottleName, killBottleWineServerWith, buildFallbackGameSettings, createFallbackBottle, isBottleProvisioned (plus removeCreatedBottleDir)"
  - "isSteamBottleProvisioned() in steam/bottle.ts (Steam stored-name default)"
affects: [61-04, 61-08, 61-10]
key-files:
  created:
    - src/backend/engine/bottlePrimitives.ts
    - src/backend/engine/__tests__/bottlePrimitives.test.ts
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/engine/{engineDecision,engineSwitch}.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/storeManagers/steam/{library,gameInstall,gameLaunch,gameMaintenance,gameBridgeLaunch,bridgeKnownFixes}.ts
    - src/backend/storeManagers/steam/bridge/{bridgeConfig,shimGenerate,sharedRedistInstall}.ts
    - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
    - 17 test files (imports and jest.mock factories)
key-decisions:
  - "No re-export: bottle.ts exports none of the moved names; callers and mocks name backend/engine/bottlePrimitives"
  - "Result type for createFallbackBottle is a local structural FallbackBottleResult so engine does not import steam/bottle"
requirements-completed: [D-19, D-03]
duration: n/a
completed: 2026-11-07
---

# Phase 61 Plan 03: Extract bottle primitives Summary

The six D-19 bottle primitives (and `removeCreatedBottleDir`, which `provisionBridgeBottle` still needs) now live in `src/backend/engine/bottlePrimitives.ts`, moved with their private helpers; `createFallbackBridgeBottle` became the shared `createFallbackBottle` (D-03). Every importer and `jest.mock` factory was repointed, no facade.

## Commits

- 92ef7d965 - extraction and source importers
- c64b6f8fa - test imports, mock factory splits, new `bottlePrimitives.test.ts` (14 tests)

## Verification

- `pnpm codecheck`, `pnpm boundaries` exit 0; prettier clean on touched files.
- `jest src/backend/storeManagers/steam src/backend/engine src/backend/sidecar src/backend/__tests__/steamBridgeKnownFixes.test.ts`: 6318 passed, 3 failed (the three known pre-existing failures), 4 skipped. The 61-02 broad run (6223 passed, 3 failed) did not include the known-fixes suite and predates the 14 new tests; no per-file pre-edit counts were captured before editing.
- `grep createFallbackBridgeBottle src` empty; 6 exported primitives in bottlePrimitives.ts, 0 left in bottle.ts.

## Deviations from Plan

**1. [Rule 3 - Blocking] Structural result type for createFallbackBottle**
- `createFallbackBottle` returned `ProvisionBottleResult` and used `PROVISION_ABORTED`, both defined in steam/bottle.ts; importing them into engine would break the boundary rule (and cycle).
- Fix: local `FallbackBottleResult` type and a private `'provision-aborted'` literal in bottlePrimitives.ts; `ProvisionBottleResult` is a superset so the call in `provisionBridgeBottle` type-checks unchanged. `PROVISION_ABORTED` stays in bottle.ts.

**2. [Rule 3 - Blocking] `removeCreatedBottleDir` exported and `engineDecision.ts` dynamic import repointed**
- Needed by `provisionBridgeBottle`'s CrossOver arm (as the plan anticipated); `killCrossoverWineserver` now lazily imports `./bottlePrimitives`.

**3. Unused import** `userHome` removed from bottle.ts (lint error after the move).

## Deferred Issues

- Known pre-existing failures unchanged (bottle.test DRM_LAUNCH_FORM, games.test channel constants, macArchKnownFixRouting Intel).
- `pnpm lint` exits non-zero on the warning cap (1117 warnings vs max 661) with 0 errors; the cap overshoot is in untouched files and was not measured at base HEAD.

## Known Stubs

None.

## Self-Check: PASSED
