---
phase: 68-versioned-persisted-stores-and-migrations
plan: 01
subsystem: backend-persistence
tags: [conf, store-versioning, backup, accessor-override]
requires: []
provides:
  - storeVersioning type contracts (StoreKind, StoreDeclaration, Migration, VersionCodec, StoreReadOnlyReason)
  - GameLibStore get/set store pass-through override (A6 proven)
  - atomicWritePrivate, writePreMigrationBackup, listBackups
affects: [68-02]
tech-stack:
  added: []
  patterns: [subclass accessor override as the single conf write choke point]
key-files:
  created:
    - src/backend/storeVersioning/types.ts
    - src/backend/storeVersioning/backup.ts
    - src/backend/storeVersioning/__tests__/backup.test.ts
    - src/backend/__tests__/storeBackendAccessors.test.ts
  modified:
    - src/backend/store_backend.ts
key-decisions:
  - "Backup name includes ms-precision UTC stamp (deviates from CONTEXT example) so retried migrations do not collide"
  - "All backups are 0o600, not only steam_store/humble_store"
  - "No backend/logger import under storeVersioning/ (module-init cycle); diagnostics via process.stderr"
requirements-completed: [R-A, R-D, D-01, D-08]
duration: ~20min
completed: 2026-11-08
---

# Phase 68 Plan 01: Contracts, accessor override, backups Summary

A6 is proven: `GameLibStore` overrides conf's `store` getter and setter with `super.store` pass-throughs, and every write path (set, delete, clear, `store =`, constructor defaults merge) still reaches disk. A subclass setter sees conf's constructor-time write. The backup helper is done with tests.

## Tasks

1. Type contracts and A6 proof - `e12aa5752`
2. Atomic private write and pre-migration backups - `f628566b9`

## Verification

- storeBackendAccessors, cache, gameConfigFirstWrite, backup tests pass (4 + 23 + 8 total tests green); `pnpm codecheck` and `pnpm build:sidecar` exit 0; prettier clean.
- A6 did not fail: no stop needed.

## Deviations from Plan

**Test 7 adjustment:** a bare `join(base, '..')` normalizes away the `..`, so the test uses `base + '/..'`; `storeName` rejects empty/`.`/`..` basenames, in addition to the resolve+relative containment assert.

## Deferred Issues

`meta/__tests__/logSecretGate.test.ts` fails with 2 pre-existing violations in `src/backend/utils/uninstaller.ts:131,142` (from c3ddef301), unrelated to this plan; logged in `deferred-items.md`. The plan's acceptance criterion "logSecretGate passes" is therefore not met for a reason outside this plan; storeVersioning adds no violations.

## Known Stubs

None.

## Self-Check: PASSED
