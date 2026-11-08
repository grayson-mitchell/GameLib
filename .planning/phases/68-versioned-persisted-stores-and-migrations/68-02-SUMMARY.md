---
phase: 68-versioned-persisted-stores-and-migrations
plan: 02
subsystem: backend-persistence
tags: [conf, store-versioning, migrations, read-only, file-modes]
requires: [68-01]
provides:
  - STORE_MIGRATIONS registry, currentVersionOf, pendingChain, storeVersionCodec
  - storeVersioning engine (prepareStoreFile, runFileMigration, viewOf, stampForWrite, isReadOnlyPath, noteRefusedWrite)
  - readOnlyStores aggregate (recordReadOnly, listReadOnly)
  - GameLibStore.readOnly, versioned get/set store, configFileMode 0o600
affects: [68-03, 68-04, 68-05, 68-06]
tech-stack:
  added: []
  patterns: [path-keyed engine state registered before super(), constructor-time migration]
key-files:
  created:
    - src/backend/storeMigrations/index.ts
    - src/backend/storeVersioning/engine.ts
    - src/backend/storeVersioning/readOnlyStores.ts
    - src/backend/storeVersioning/__tests__/engine.test.ts
    - src/backend/__tests__/storeBackendVersioning.test.ts
  modified:
    - src/backend/store_backend.ts
key-decisions:
  - "store_backend.ts imports 'fs', not 'graceful-fs': several suites mock graceful-fs with only existsSync"
  - "Invalid schemaVersion logging lives in storeVersionCodec.read (one stderr line, value read as 0)"
  - "Unreadable/malformed/non-object files leave state ok and untouched; conf keeps its clearInvalidConfig behaviour"
requirements-completed: [R-A, R-B, R-D, D-01, D-03, D-04, D-06, D-08, D-13]
duration: ~25min
completed: 2026-11-08
---

# Phase 68 Plan 02: Versioning engine and GameLibStore wiring Summary

Every conf-backed store now carries `__internal__.gamelib.schemaVersion`, migrates synchronously inside `GameLibStore`'s constructor before conf's first read, refuses all writes when the file is newer or failed to migrate (including conf's constructor defaults merge), and writes private files (0o600, dirs 0o700, token stores tightened on load).

## Tasks

1. Registry, engine state machine, read-only aggregate (13 engine tests) - `f447d1e09`
2. GameLibStore wiring and D-13 modes (8 store tests) - `26d7c20eb`, follow-up `f48a3c4e5`

## Verification

- engine, backup, storeBackendVersioning, accessors, cache, notifier, launch hooks, first-write, storeLayer suites pass; `pnpm codecheck`, `pnpm build:sidecar`, scoped prettier clean.
- Full Backend project: only pre-existing failures remain (below).
- `sidecar/fileStore.ts` and `src/backend/migration/` untouched; no timers, promises or logger imports in the new modules. smoke:sidecar and tauri:dev not run (reserved for 68-09).

## Deviations from Plan

**1. [Rule 1 - Bug] graceful-fs vs fs in store_backend.ts** - the first cut imported `mkdirSync` from `graceful-fs`; ten steam suites mock `graceful-fs` with only `existsSync` and crashed at module scope. Switched `store_backend.ts` to `fs` (`f48a3c4e5`). The engine/backup modules still use graceful-fs but only reach those calls after `existsSync` finds a file.

## Deferred Issues

Pre-existing, unrelated, logged in `deferred-items.md`: `logSecretGate` (uninstaller.ts), `macArchKnownFixRouting` Intel test (fails on base 2d39f429c), `quitTeardownWiring`, `tauriShellSource` (Rust source-text assertions).

## Known Stubs

None. `STORE_MIGRATIONS` is intentionally empty: Phase 68 ships no conf-store shape change; plan 05 adds the settings chains.

## Self-Check: PASSED
