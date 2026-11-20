---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 05
subsystem: backend/storeSearch
tags: [itad, cache, rate-limit, stores]
requires: []
provides:
  - itad_prices and itad_steam_gids keep-last-good CacheStores
  - itadCache.ts pure helpers (keys, fresh/stale reads, bounded writes, Retry-After, gate)
  - miscRuntime.itadGate per-boot gate
affects: [47-06, 47-07]
tech-stack:
  added: []
  patterns: [keep-last-good CacheStore, timestamp-only rate-limit gate]
key-files:
  created:
    - src/backend/storeSearch/stores.ts
    - src/backend/storeSearch/itadCache.ts
    - src/backend/storeSearch/__tests__/itadCache.test.ts
  modified:
    - src/backend/miscRuntime.ts
    - src/backend/stores/createStores.ts
    - src/backend/services/types.ts
    - src/backend/testUtils/testServices.ts
    - src/backend/stores/__tests__/fixtures/registeredStores.json
    - src/backend/__tests__/storeKinds.test.ts
    - src/backend/stores/__tests__/createStores.test.ts
    - src/backend/__tests__/diPhaseGates.test.ts
    - src/backend/testUtils/__tests__/testServices.test.ts
key-decisions:
  - "Search keys are sha256-hashed (32 hex chars) so dots never reach the store key"
  - "Fresh window 1 h (D-08); gid 30 d, miss 1 d (D-10); Retry-After clamped to [1 s, 15 min]"
requirements-completed: []
duration: 15min
completed: 2026-11-14
---

# Phase 47 Plan 05: ITAD cache and gate substrate Summary

Two keep-last-good ITAD CacheStores plus a timer-free, closure-state gate and pure cache helpers, registered in every store list.

## Commits
- 26b3bfa41: itadCache.ts + tests
- 528ea7e69: stores factory, registration, pins, miscRuntime.itadGate
- 4ac0faa39: pin fixes (below)

## Deviations
**[Rule 1 - Bug] Count pins.** Adding the `storeSearch` family broke `diPhaseGates.test.ts` (16 -> 17 stores modules) and `testServices.test.ts` (18 -> 19 families). Updated both pins. Commit 4ac0faa39.

## Verification
itadCache, moduleStateCensus, createStores, storeKinds, diPhaseGates, testServices tests pass; `pnpm codecheck` exits 0; scoped prettier check clean. Full Backend run has pre-existing unrelated failures (tauriShellSource, shim*, libraryReplay, epicOfflineMode, R8 gate), none touching these files. REQUIREMENTS.md untouched per instruction.

## Known Stubs
None.

## Self-Check: PASSED
