---
phase: 61-unified-macos-engine-for-all-stores
plan: 11
subsystem: engine
tags: [engine-state, non-steam, legacy, bottle-name]
requires: [61-07, 61-10]
provides:
  - "backend/engine/gameEngineState.ts: getGameEngineState, listGameEngineOptions, getDefaultEngine, getPerGameBottleNameFor"
affects: [61-13, 61-18, 61-19]
key-files:
  created:
    - src/backend/engine/gameEngineState.ts
    - src/backend/engine/__tests__/gameEngineState.test.ts
key-decisions:
  - "Settings view is global settings overlaid by readStoredGameConfig; GameConfig.get is never called so no file is created"
  - "All injection goes through a `config` deps bag (EngineConfigDeps) plus pass-through EngineStateDeps"
  - "Legacy option id is display only; the 61-06 write guard rejects it"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 11: Non-Steam engine state Summary

One backend module gives the IPC layer everything a non-Steam macOS game needs: engine state via `getEngineState` with prefix-derived deps, the Steam option list plus a read-only Legacy entry, the global default engine, and the per-game bottle name.

## Commits
- 1af5431c8: all of `gameEngineState.ts` and tests (both tasks touch the same file and test, committed together).

## Notes
- Returns null off macOS, for an invalid identity, and for the bottle-runtime store (Steam).
- Unprovisioned per-game bottles skip the preflight (getEngineState's `isBottleReady`); plain and Legacy prefixes use `stateWithoutBottle`.
- `overrideEligible` is true unless the prefix is invalid; platform/native/browser eligibility stays with the IPC layer.

## Deviations from Plan
None. The plan's sideload "plain wine" behavior case has no derived-plain outcome: a plain wine outside the option list is Legacy (prefixKind 'legacy'), which the test asserts.

## Verification
19 new tests pass; engine suite 383 passed; codecheck and `pnpm boundaries` clean; prettier clean; lint totals unchanged (tests 664, src 1117). `grep GameConfig.get` prints nothing; 4 exports present.

## Self-Check: PASSED
