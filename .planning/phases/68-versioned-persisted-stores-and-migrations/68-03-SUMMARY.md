---
phase: 68-versioned-persisted-stores-and-migrations
plan: 03
subsystem: backend-persistence
tags: [store-versioning, store-kinds, ratchet, token-bearing]
requires: [68-02]
provides:
  - required declaration parameter on TypeCheckedStoreBackend and CacheStore
  - kind (cache | user-state) on all 51 production store constructions
  - storeKinds.test.ts ratchet with EXPECTED_KINDS table and renderer-mirror parity
affects: [68-04, 68-05, 68-06]
tech-stack:
  added: []
  patterns: [required-parameter + source-scan equality ratchet]
key-files:
  created:
    - src/backend/__tests__/storeKinds.test.ts
  modified:
    - src/backend/typed_store.ts
    - src/backend/cache.ts
    - "20 production store declaration modules"
    - src/backend/__tests__/cache.test.ts
    - src/backend/__tests__/storeChangeNotifier.test.ts
    - src/backend/sidecar/__tests__/storeLayer.test.ts
    - src/backend/sidecar/__tests__/bootstrap.test.ts
key-decisions:
  - "CacheStore.entries() and use_in_memory() exclude the __internal__ version envelope (it is not a cache entry)"
  - "Test constructions use user-state for *_library mirrors and cache for plain cache probes; no assertions changed"
requirements-completed: [R-A, D-01, D-02, D-09, D-13, D-14]
duration: ~20min
completed: 2026-11-08
---

# Phase 68 Plan 03: Store kind declarations Summary

Every persisted store now declares `kind: 'cache' | 'user-state'` at its construction; omission is a compile error, and a source-scan ratchet pins the full name-to-kind table (51 entries) plus the three `tokenBearing` stores.

## Tasks

1. Required `declaration` on both classes, kind on all 51 constructions, test constructions updated - `bfaf23089`
2. `storeKinds.test.ts` (23 tests) - `aa00c184c`, type fix `e08033d45`

Classification follows the plan table: Steam/GOG/Epic/Amazon/sideload libraries, the D-14 four, and the Humble user-record stores are user-state; `humble_sync` and recomputable metadata/install-info/pci/wiki/umu/crossover stores are cache; `steamConfigStore`, `steamBottleConfigStore`, `humbleConfigStore` are `tokenBearing`. No `failedView` set anywhere.

## Mutation check

- Removing `kind: 'cache'` from `crossover_index/stores.ts`: `pnpm codecheck` fails (my crude deletion left a dangling comma, TS1136; the missing-argument case is also a compile error since the parameter is required).
- Changing it to `kind: 'user-state'`: storeKinds.test.ts fails on the table-equality test.
- Both reverted; `git status` clean for that file.

## Verification

`pnpm codecheck`, scoped prettier, and the plan's listed suites pass. Full Backend project: only `quitTeardownWiring`, `macArchKnownFixRouting`, `tauriShellSource` (pre-existing, in deferred-items.md) and `dxvkInstallRemove` (passes 25/25 in isolation; failed only in the full parallel run, unrelated to store code). smoke:sidecar and tauri:dev not run.

## Deviations from Plan

**1. [Rule 1 - Bug] `__internal__` leaked through CacheStore** - once stores carry a declaration, conf's `store` includes the engine's `__internal__` envelope, so `CacheStore.entries()` returned it (cache.test.ts failure) and `use_in_memory()` copied it into the working map. Fixed in `cache.ts` by filtering `__internal__` in both (commit re-stamps it via the engine). Commit `bfaf23089`.

## Deferred / Notes

Other whole-store readers of `TypeCheckedStoreBackend` (e.g. sidecar store-fetch returning the full object) may now see `__internal__`; not exercised by any failing test, flagged for the plan that owns the renderer snapshot path.

## Known Stubs

None.

## Self-Check: PASSED
