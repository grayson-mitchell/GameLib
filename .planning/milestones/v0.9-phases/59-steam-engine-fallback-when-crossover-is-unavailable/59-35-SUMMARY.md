---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 35
subsystem: settings
tags: [WR-04, game-config, ipc, rollback]
requires: []
provides:
  - GameConfigV0.setSetting rollback on failed flush
  - gameSettingWriteFailed push channel and renderer re-fetch
affects: [per-game settings screen]
key-files:
  modified:
    - src/backend/game_config.ts
    - src/backend/sidecar/gameSettingWrite.ts
    - src/common/types/ipc.ts
    - src/preload/api/settings.ts
    - src/frontend/hooks/useSettingsContext.ts
    - src/backend/__tests__/gameConfigFirstWrite.test.ts
    - src/backend/sidecar/__tests__/gameSettingWrite.test.ts
    - src/frontend/hooks/__tests__/useSettingsContext.setSetting.test.ts
decisions:
  - "No new user-facing string: the control snapping back is the signal."
metrics:
  completed: 2026-11-03
requirements: [WR-04]
---

# Phase 59 Plan 35: WR-04 failed per-game write rollback Summary

When a per-game setting write fails, memory is rolled back to match the file and the renderer re-reads the stored value.

## What was built
- `GameConfigV0.setSetting` restores the prior value (or deletes the key) when `flush()` throws, then rethrows.
- `applyGameSetting` pushes `gameSettingWriteFailed { appName, key }` after the final failure (send wrapped in its own try/catch).
- Preload slot `handleGameSettingWriteFailed`; `useSettingsContext` bumps a `reloadToken` on a matching-appName push, re-running the load effect. Pure helper `shouldRefetchOnWriteFailure`.

## Commits
- 4b2748f9e: backend rollback + push + tests
- b61dba482: tsc fix for the rollback assignment
- 78482c251: preload slot + renderer re-fetch + tests

## Tests
gameConfigFirstWrite, gameSettingWrite, both useSettingsContext suites pass; eslint 0 errors; `pnpm codecheck` green.

## Deviations from Plan
**1. [Rule 3 - Blocking] fs spy impossible.** `jest.spyOn(fs,'writeFileSync')` throws "Cannot redefine property", and the jest config resets mocks so a `jest.fn` wrapper lost its implementation. Used a `jest.mock('fs')` plain-function wrapper with a `failNextWrite` flag instead.
**2. [Rule 1 - Bug] tsc error** on `this.config[key] = prev` fixed with `as never` (commit b61dba482).

## Known Stubs
None.

## Self-Check: PASSED
