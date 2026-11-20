---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 09
subsystem: frontend
tags: [gameinfo, narrowing, library]
requires: [70-01, 70-03]
provides:
  - Library screen readers narrowed via asStoreGame
affects: [70-10, 70-11]
key-files:
  modified:
    - src/frontend/screens/Library/filterEngine.ts
    - src/frontend/screens/Library/librarySort.ts
    - src/frontend/screens/Library/components/GameCard/index.tsx
    - src/frontend/screens/Library/components/InstallModal/index.tsx
    - src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx
key-decisions:
  - "InstallModal passes asStoreGame(gameInfo, 'steam') to hasSteamDepotSignalCaptured so index.tsx never names steamPlatformsCaptured (source-ban tests stay green)"
  - "GameCard installable uses `?? true`, equivalent to the old undefined-means-installable check"
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 09: Library screen narrowing Summary

All five Library files read Steam and legendary fields only through `asStoreGame`. Flip probe: zero non-test errors under src/frontend/screens/Library (only the 70-11-owned filterEngine.test.ts test error remains).

- filterEngine: `canBeDelisted` capability gate kept, `is_delisted` read via the Steam member.
- librarySort: `steamLastPlayed` via the Steam member; Metacritic path untouched.
- GameCard: `installable` and `is_delisted` via the Steam member.
- InstallModal: Steam member passed to the depot-signal helper; ThirdPartyDialog `isEAManaged` via the legendary member (`thirdPartyManagedApp` stays core). The plan also named `isUbisoftManaged`, but ThirdPartyDialog has no such read.

Acceptance counts: `canBeDelisted` in filterEngine was 1 before and 1 after; `metacriticScoreOf` in librarySort was 2 before and 2 after. `asStoreGame(` in filterEngine is 1. Zero member casts in the touched files (the cast grep was absent before and after, so it cannot detect a regression; the probe and tsc are the real checks).

## Verification

`tsc --noEmit`: 1 error, the known 70-11-owned legendaryRuntime.test.ts:28. Frontend jest: 327 suites / 5581 tests pass, Library tests unmodified. `pnpm lint` exits 0. Prettier applied to the five files.

## Deviations from Plan

None. Both tasks were committed together as one commit because the files are interdependent for the probe gate.

## Known Stubs

None.

## Self-Check: PASSED
