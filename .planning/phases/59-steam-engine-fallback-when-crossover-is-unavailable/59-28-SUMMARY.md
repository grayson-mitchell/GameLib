---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 28
subsystem: steam-engine
tags: [gap-closure, engine-state, ui]
requires: [59-24]
provides: [overrideWarning state field, isDrmModeFromVerdict, forced-CrossOver warning notice]
key-files:
  modified:
    - src/backend/storeManagers/steam/engine/engineState.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts
    - src/common/types/steam.ts
    - src/frontend/screens/Game/GamePage/components/SteamEngineNotices.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/SteamEngineNotices.test.tsx
requirements-completed: [D-06, D-14]
completed: 2026-11-02
---

# Phase 59 Plan 28: Truthful engine state Summary

An inconclusive preflight now shows no badge and is never cached, a forced CrossOver override on an expired or broken bottle carries `overrideWarning` and a game-page notice, and pre-59-15 DRM titles are resolved from their persisted verdict so the override is not offered.

## Commits
- f38e202cf: engineState (WR-02 guard, WR-06 overrideWarning, WR-07 `isDrmModeFromVerdict`), type field, tests
- 89540b7d9: SteamEngineNotices overrideWarning notice and tests

## Deviations from Plan
- Two existing engineState tests were updated: the default-preflight test now expects `engine: null` for an inconclusive probe (the new intended behavior), and the exact-shape `toEqual` gained `overrideWarning: null`.

## Verification
engineState (37), SteamEngineNotices and EngineBadge (15) pass; `pnpm codecheck` clean; eslint 0 errors (pre-existing warnings only); prettier clean. The engineState read path never writes the verdict store.

## Self-Check: PASSED
