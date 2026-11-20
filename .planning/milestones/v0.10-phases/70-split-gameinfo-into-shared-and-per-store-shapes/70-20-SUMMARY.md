---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 20
subsystem: steam-refresh, legendary-library
tags: [gap-closure, g2, wr-04, zod, strip]
requires: ["70-18"]
key-files:
  modified:
    - src/backend/storeManagers/steam/library/refresh.ts
    - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
    - src/backend/storeManagers/legendary/library.ts
    - src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts
requirements-completed: [ARCH-03, ARCH-03.4]
completed: 2026-11-14
---

# Phase 70 Plan 20: Regeneration half of G2 Summary

Steam refresh now runs each built SteamGameInfo through `stripToSchema(gameInfo, steamGameInfoSchema, { dropInvalidOptional: true })` before `library.set` and `pushGameToLibrary`, so null or undeclared keys from `store_cache/steam_metadata.json` (art_logo, extra.releaseDate, stray reqs[] keys) no longer re-enter `steam_library`. Legendary's `loadFile` defaults `description = ''`, so an Epic title without one carries a schema-valid `extra.about`.

## Commits

- fix(70-20): sanitise each refreshed SteamGameInfo (refresh.ts + test with near-miss)
- fix(70-20): default legendary about.description to '' (library.ts + test)

## Verification

- library.refresh.test.ts 82 pass (new G2 case plus near-miss that fails the schema unstripped); getGameInfoForceReloadStaleness 2 pass.
- `jest.mock(` count in library.refresh.test.ts: 19 before, 19 after.
- steam-line-ceiling, gameinfo-narrowing-ceiling, boundaries PASS; backend-di-ceilings output names none of the touched paths; prettier clean on all written paths.
- `tsc --noEmit` shows errors only in pre-existing dirty GamePage files (PlatformSupport), none in touched paths.

## Deviations from Plan

None.

## Self-Check: PASSED
