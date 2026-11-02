---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 34
subsystem: steam-engine
tags: [drm, ceg, i18n, notices]
requirements-completed: [WR-01, WR-05, G21]
key-files:
  modified:
    - src/backend/storeManagers/steam/engine/engineState.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts
    - public/locales/en/gamelib.json
    - src/frontend/screens/Game/GamePage/components/SteamEngineNotices.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/SteamEngineNotices.test.tsx
metrics:
  completed: 2026-11-03
---

# Phase 59 Plan 34: CEG-first override eligibility, truthful broken notice Summary

`isDrmModeFromVerdict` now checks `drm === 'ceg'` before the persisted mode, so CEG titles are never offered the engine override; the forced-CrossOver broken notice now says the game won't start, and `steam.engine.status.creatingBottle` exists in the catalogue.

## Commits
- 28ab53627 fix(59-34): CEG verdict is DRM mode whatever its persisted mode (WR-01)
- dc0cfb726 fix(59-34): truthful forced-CrossOver broken notice; add creatingBottle label (WR-05, G21)

## Verification
- engineState and SteamEngineNotices jest suites: 47 passed. Prettier clean; eslint 0 errors.
- translation.json not touched or staged.

## Deviations from Plan
None in code. Note: `pnpm lint-translations:gamelib` exits 1, but it was already failing: about 3120 pre-existing "Missing translation" lines for all steam.engine keys across the other locales (never localised in earlier 59 plans). `creatingBottle` and the reworded `cxBroken` add to that existing set; not fixed here (out of scope).

## Self-Check: PASSED
