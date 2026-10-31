---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 07
subsystem: steam-engine
tags: [steam, crossover, engine-decision, wine, macos]
requires: [59-02, 59-03, 59-05]
provides:
  - preflightCrossover / decideLaunchEngine / decideCreationEngine / listEngineOverrideOptions / resolveWineManagerStaging
  - getSteamEngineState / recordLaunchDecision / dismissSteamEngineNotice / setEngineStatePublisher
  - SteamEngineState and SteamEngineOption shared types
key-files:
  created:
    - src/backend/storeManagers/steam/engine/engineDecision.ts
    - src/backend/storeManagers/steam/engine/engineState.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts
  modified:
    - src/common/types/steam.ts
    - src/backend/storeManagers/steam/bottle.ts
decisions:
  - "decideCreationEngine with CrossOver present and zero ready bridge bottles does not probe; creation relies on CX_CREATE_CAP_MS (120 s)"
  - "Page state does not probe when CrossOver is installed but the title's bottle is not ready (engine/reason null)"
  - "A crossover override with a broken CrossOver returns unavailable, same as missing; expired is honoured"
metrics:
  tasks: 2
  completed: 2026-11-01
---

# Phase 59 Plan 07: Engine decision layer and per-title engine state Summary

Stateless per-launch/per-creation CrossOver pre-flight (D-07, D-09) with a closed-grammar engine override (D-14), plus a per-title display state carrying the built-in/unsupported badge, 7-day trial notice, no-CrossOver note and untested-build notice.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. engineDecision.ts + tests, shared types | 88be266ee, 0998f848c | 39 tests, including the real `probeDemoStatus` against the 59-02 stub wine under `createFakeHomeProfile` |
| 2. engineState.ts + tests | b7ae465bf | 19 tests |

## Implementation notes

- `engineDecision.ts` has no module-level state. Heavy collaborators (`bottle`, `crossoverLocation`, `game_config`, Wine Manager store) are reached via lazily built `EngineDecisionDeps`, so tests inject stubs and importing the module is side-effect free.
- Pre-flight mapping: no bin dir or no `bin/wine` -> `missing`; not executable, probe failure, unrecognised output -> `broken` (a timeout also stops that bottle's wineserver); `expired` -> `expired`; licensed/trial -> `healthy`.
- Wine Manager builds resolve only from the installed list, never `-DXMT`, with `path.relative` containment under `<toolsPath>/wine`.
- `engineState.ts` keeps a per-session preflight cache with a shared in-flight promise; no timers.

## Deviations from Plan

**1. [Rule 3 - Blocking] Exported `persistedWineBins` from bottle.ts** so the default deps can resolve CrossOver with the persisted hint. It is consumed by engineDecision.ts and engineState.ts, so no ts-prune marker was needed.

**2. [Rule 1 - Bug] Type error in first Task 1 commit.** The test helper `ok()` used an invalid indexed type; committed in 88be266ee, fixed in 0998f848c (tsc clean afterwards).

Other: `pnpm codecheck` passes; `fakeHomeIsolation.test.ts` passes. `engineState` accepts an optional `deps` argument on `recordLaunchDecision` (trailing) for test injection.

## Known Stubs

None.

## Self-Check: PASSED

Files exist, commits 88be266ee, 0998f848c, b7ae465bf present, tests and codecheck green.
