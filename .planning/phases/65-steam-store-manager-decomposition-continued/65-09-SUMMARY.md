---
phase: 65-steam-store-manager-decomposition-continued
plan: 09
subsystem: backend/storeManagers/steam
tags: [decomposition, bottle-split, lifecycle]
requires: ["65-08"]
provides:
  - "steam/bridgeBottleLifecycle.ts (guardPerGameBridgeBottleName, removePerGameBridgeBottle, killForRegisteredEngine, endPerGameBridgeBottleSession(+With), killBridgeBottleWineServer, stopPerGameBridgeBottle, discardNewBridgeBottle, provisionBridgeBottle)"
affects: []
key-files:
  created:
    - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
    - src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - meta/__tests__/logSecretGate.test.ts
    - meta/steamLineCeilingBaseline.json
    - "importers and tests (see commit c2e5a9c3e)"
key-decisions:
  - "DRM runner registry stays only in bridgeBottle.ts (D-10); lifecycle reads it via getDrmBridgeRunner"
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 09: bottle.ts split, part 3 Summary

The per-game bridge bottle lifecycle moved to `bridgeBottleLifecycle.ts` (commit c2e5a9c3e). The bottle split is complete. Steam suite: 4385 tests (= baseline), 0 runtime-error suites, no failing name outside the baseline.

## Five-piece sizes (wc -l, D-04 target ~800)

| Piece | Lines |
| --- | --- |
| bottle.ts | 398 |
| bottledSteam.ts | 409 |
| provisionBottle.ts | 447 |
| bridgeBottle.ts | 515 |
| bridgeBottleLifecycle.ts | 614 |

All under target. bottle.ts went 984 -> 398; its allowlist entry was already deleted in 65-08 (984 < 1000), so nothing was left to delete here.

## D-10 state ownership

Module-level mutable state: `bottledRaiseLoopsCancelled` and `activeRaiseTimers` in bottledSteam.ts only; `drmBridgeRunners` in bridgeBottle.ts only (private). bridgeBottleLifecycle.ts, bottle.ts and provisionBottle.ts hold none.

## log-secret-gate exemptions

The `log-secret-gate-exempt` comment in provisionBridgeBottle moved verbatim. Bottle-related exemptions are in provisionBottle.ts and bridgeBottleLifecycle.ts, none in bottle.ts. logSecretGate pins bridgeBottleLifecycle.ts instead of bottle.ts; count stays 15.

## Import cycles

Both cycles flagged by 65-08 are closed. bottle.ts now imports neither bridgeBottle nor provisionBottle, so bottle <-> bridgeBottle and bottle <-> provisionBottle are gone. bridgeBottleLifecycle -> bottle/bridgeBottle/provisionBottle is one-directional. depcruise at zero.

## Notes

- Test carve: lifecycle describes, the R6 grep-guard tests (repointed to read bridgeBottleLifecycle.ts), the "Phase 59 engine registry" describe and the two provisionBridgeBottle tests of "quick 261024-cjq" moved to bridgeBottleLifecycle.test.ts under unchanged describe names. The cjq describe now exists in both files (provisionBottle test stays in bottle.test.ts).
- gameInstall.ts: `import * as bottle from './bottle'` and `import * as bbLifecycle` keep it under its ceiling (named imports gave 1959). games.ts uses `import * as bridgeBottle`.
- Mock factories: moved names dropped from `jest.mock('../bottle')` and added as `jest.mock('../bridgeBottleLifecycle')` in games, macArchKnownFixRouting, removeCopies, steamStartupKeyringDeferral, sharedRedistInstall, drmLaunchSetup tests. stageDrmBottle.test.ts needed a stub lifecycle mock (the module reaches config -> gog constants, same as 65-08's drmScanExe case).
- drmLaunchSetup.ts dynamic import repointed to `../../bridgeBottleLifecycle`.
- library/acfState.ts also imported removePerGameBridgeBottle (not listed in the plan's files_modified); repointed.

## Ratchets

meta/steamLineCeilingBaseline.json: gameInstall.ts 1957 -> 1953, games.ts 1350 -> 1349 (import rewrites shrank them; gate demanded lowering). Prettier-checked.

## Closeout checks

`pnpm build:sidecar-sea` and `pnpm smoke:sidecar` exit 0 (exits by drain at stdin EOF). `jest -t unref` passes (9). `pnpm codecheck`, `pnpm boundaries`, `pnpm steam-line-ceiling` pass.

## Deviations from Plan

**1. [Rule 3] stageDrmBottle.test.ts** needed a stub lifecycle mock (suite failed to load otherwise). **2. [Rule 3] library/acfState.ts** repointed though not in files_modified.

## Pre-existing, left alone

`pnpm find-deadcode` drift (knip baseline lines, none naming bottle files), indexedAccess ratchet drift outside steam (steam count unchanged at 423), logSecretGate baseline failures.

## Known Stubs

None.

## Self-Check: PASSED

bridgeBottleLifecycle.ts, its test and commit c2e5a9c3e exist.
