---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 06
subsystem: store-managers
tags: [gameinfo, legendary, nile, narrowing]
requires: [70-01, 70-03]
provides:
  - legendary and nile managers typed by LegendaryGameInfo / NileGameInfo
  - storeManagerCommon browserUrl via asStoreGame(..., 'sideload')
  - renderer mirror CacheStores typed per store
key-files:
  modified:
    - src/backend/storeManagers/legendary/stores.ts
    - src/backend/storeManagers/legendary/games.ts
    - src/backend/storeManagers/legendary/library.ts
    - src/backend/storeManagers/legendary/legendaryRuntime.ts
    - src/backend/storeManagers/nile/stores.ts
    - src/backend/storeManagers/nile/library.ts
    - src/backend/storeManagers/storeManagerCommon/games.ts
    - src/frontend/helpers/stores.ts
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 06: Legendary/Nile/Common/renderer mirror typing Summary

Legendary and Amazon managers now build and return their member shapes, storeManagerCommon narrows the sideload-only `browserUrl`, and all four renderer mirror stores are member-typed with type-only imports.

## Commits

- 49143f1f1 feat(70-06): legendary and nile managers return their members
- 32f85d43b feat(70-06): narrow sideload browserUrl read and type renderer mirror stores

## Verification

- Flip probe: zero non-test errors in legendary, nile, storeManagerCommon, frontend/helpers/stores.ts.
- rendererZodGuard passes; nile and storeManagerCommon jest suites pass; eslint 0 errors; prettier applied.
- All four renderer mirror stores typed (no consumer failed tsc), so nothing deferred to 70-11.

## Deviations from Plan

**1. [Rule 3 - Blocking] legendaryRuntime.ts added** (not in plan file list): `libraryState.library` was `Map<string, GameInfo>`; had to become `Map<string, LegendaryGameInfo>` for the manager to return the member.

No asStoreGame(..., 'legendary') call sites were needed: once getGameInfo returns LegendaryGameInfo, setup.ts and games.ts read the legendary keys on the member directly (probe clean). No casts added.

## Handoffs

New tsc error caused by my narrowing, in a test file (70-11 owns):
- src/backend/storeManagers/legendary/__tests__/legendaryRuntime.test.ts:28 passes a `GameInfo` to a `LegendaryGameInfo` Map. The test still passes at runtime.

Remaining tsc errors, all 70-07-owned and pre-existing from 70-04/70-05, unchanged: downloadmanager/downloadqueue.ts:325 (isEAManaged, isUbisoftManaged), macArch/recovery.ts:200 (installedDLCs).

## Pre-existing failure (not a regression)

legendary/__tests__/epicOfflineMode.test.ts "Test 6c" fails: legendary/games.ts already contains `signInProbe` at HEAD; untouched by this plan.

## Known Stubs

None.

## Self-Check: PASSED
