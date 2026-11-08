---
phase: 68-versioned-persisted-stores-and-migrations
plan: 09
subsystem: persistence
tags: [gates, real-profile, smoke, uat, D-03]
requires: [68-01, 68-02, 68-03, 68-04, 68-05, 68-06, 68-07, 68-08]
provides:
  - "phase gate failures cleared (lint, knip ratchet, appShellImportGate, i18n baseline)"
  - "real-profile evidence that the store engine migrates, backs up, tightens modes and leaves newer files alone"
affects: [68-10]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - src/backend/sidecar/readOnlyStoresNotice.ts
key-decisions:
  - "The read-only notice push lives in src/backend/sidecar/readOnlyStoresNotice.ts to satisfy appShellImportGate"
requirements-completed: [R-A, R-B, R-C, R-D, R-E, D-02, D-03, D-05, D-08, D-13, D-15]
duration: n/a
completed: 2026-11-09
---

# Phase 68 Plan 09: Phase gate and real-profile verification Summary

Gate failures from the phase were cleared, and the engine was booted against a snapshot-protected real profile: config.json went v0 to v1 with a byte-identical backup, store dirs and files tightened, caches untouched, and a planted newer-version file survived real use unchanged.

## Tasks and commits

1. Task 1, clear gate failures: `6dcdcf1ad` (lint, knip ratchet, appShellImportGate; the push moved to `src/backend/sidecar/readOnlyStoresNotice.ts`) and `8835f1dfb` (readOnlyStores keys recorded in the i18n presence baseline).
2. Task 2, real-profile snapshot and smoke boot: no repo commit (evidence on disk). Snapshot at `~/Library/Application Support/gamelib-pre68-snapshot` (mode 700), metadata in `gamelib-pre68-snapshot.meta/` (pre.txt, post.txt, planted.txt, planted.orig).
   - config.json v0 (mode 644) became v1 (mode 600); backup `config.v0.20261108T091637899Z.bak.json` is byte-identical to the snapshot copy.
   - `steam_store/` and `humble_store/` dirs are 700, files 600.
   - 28 `store_cache` files unchanged.
   - `store/download-manager.json` planted at schemaVersion 99.
3. Task 3, human-verify checkpoint: user verdict "approved".

## D-03 proof (final check, 2026-11-09)

After real use, `store/download-manager.json` has sha256 `c230e9b65b3b9b8a95e5717710fd86e5d817c9ef95c287e4346a14217029976c`, identical to the planted hash in planted.txt. A newer-version file is never rewritten. No `*tmp-*` files exist anywhere under the gamelib profile dir.

## Deviations from Plan

- **Task 1 fixes (Rule 3):** lint errors, a knip ratchet increase, an appShellImportGate violation and missing i18n presence-baseline keys all surfaced at the phase gate and were fixed.
- **Network-toggle step dropped:** Task 3 asked the operator to toggle the network mid-session. The user pointed out this tests nothing; the orchestrator told them to skip it and not press Refresh. Cache survival is proven on disk by the 28 unchanged store_cache files. The user still approved.

## Known limits and caveats

- **Full suite not re-run after the Task 1 fixes;** only the affected suites were run.
- **Pre-existing failures, not caused by phase 68:** quitTeardownWiring and tauriShellSource (both fail on the phase base commit); gamelibCatalogParity, genI18nGateScope, x86CallbackWineHarness; two unused-import lint errors in `shellFilesFlowRegistration.ts` and `shellFiles.ts` (untouched files). Recorded in `deferred-items.md`.
- **Rollback limit:** a v1 file cannot be read by an older build. Going back needs the v0 backup restored first.
- **Snapshot intentionally KEPT** for plan 68-10. It was not deleted, modified or restored here; restoring the profile is 68-10's job.

## Self-Check: PASSED
