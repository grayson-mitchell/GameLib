---
phase: 61-unified-macos-engine-for-all-stores
plan: 26
subsystem: engine
tags: [engine, crossover, preflight, wr-01, gap-closure]
requires: []
provides:
  - "cx-inconclusive engine reason; inconclusive pre-flight keeps the bottle's marker engine"
affects: [engineDecision, launchEngine, engineState, steam gameLaunch]
key-files:
  modified:
    - src/backend/engine/engineTypes.ts
    - src/backend/engine/engineSwitch.ts
    - src/backend/engine/engineDecision.ts
    - src/backend/engine/launchEngine.ts
    - src/backend/engine/engineState.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - .planning/phases/61-unified-macos-engine-for-all-stores/61-HUMAN-UAT.md
decisions:
  - "A wine-manager marker under Automatic with an inconclusive pre-flight gets pins.current (discretion choice)"
metrics:
  completed: 2026-11-07
  tasks: 2
---

# Phase 61 Plan 26: WR-01 inconclusive pre-flight Summary

An inconclusive CrossOver pre-flight now keeps the bottle on the engine its marker records, is logged as `reason=cx-inconclusive`, and never triggers a fallback toast, in-app notice or cx-broken badge.

## What changed

- `engineTypes.ts`: `cx-inconclusive` added to `EngineReason` and the crossover and pinned selection arms. `FallbackReason` is unchanged.
- `engineSwitch.ts`: new read-only `readBottleEngineMarkerSummary` returns the marker kind and pin id.
- `engineDecision.ts`: a new `markerSummary` dep with a lazy-require default. The inconclusive branch keeps a non-crossover-marker bottle on its own pin (current or previous, matched by id). That avoids a wineserver kill and the D-16 busy refusal. Otherwise it launches on CrossOver, labelled `cx-inconclusive`, or `override` when forced.
- `launchEngine.ts`, `engineState.ts` and steam `gameLaunch.ts`: guards exclude `cx-inconclusive`. `recordLaunchDecision` also ignores an inconclusive preflight for the badge.
- 61-HUMAN-UAT.md item 1 is recorded as pass (passed 1, pending 2).

## Tests

The engineDecision tests cover Steam and non-Steam busy-bottle cases, the previous-pin case, the wine-manager marker case, the download case and the forced-override case. There are also regression tests in launchEngine, engineState and Steam games. The engine suites and the Steam games engine/WR-01 run pass. `pnpm codecheck` and `pnpm boundaries` pass. `pnpm lint` reports 0 errors; the exit code is 1 because of 1115 existing warnings.

## Deviations from Plan

None. No other reason consumer was flagged by codecheck.

## Commits

- 5e14acb5c: decision, types and marker summary
- 6328a8a35: consumer guards and tests
- The UAT edit and this SUMMARY are in the docs commit.

## Self-Check: PASSED
