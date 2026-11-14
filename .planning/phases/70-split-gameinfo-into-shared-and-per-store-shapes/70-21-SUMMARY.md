---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 21
subsystem: store-migrations
tags: [gap-closure, g3, wr-05, zod, migration, per-game-settings]
requires: ["70-18"]
provides:
  - "settings/game chain v1 -> v2 strip derived from gameSettingsSchema.partial() (dropInvalidOptional: true)"
  - "currentGameConfigVersion = 'v2'"
key-files:
  modified:
    - src/backend/storeMigrations/settingsGame.ts
    - src/backend/constants/others.ts
    - src/common/types.ts
    - src/backend/storeVersioning/__tests__/settingsFiles.test.ts
    - src/backend/__tests__/settingsVersioning.test.ts
    - src/backend/engine/__tests__/engineConfig.test.ts
  created:
    - src/backend/storeMigrations/__tests__/settingsGame.test.ts
    - src/backend/storeMigrations/__tests__/fixtures/settings-game-v1-retired-keys.json
    - src/backend/storeMigrations/__tests__/fixtures/settings-game-v1-invalid-values.json
requirements-completed: [ARCH-03, ARCH-03.4, ARCH-03.5]
completed: 2026-11-14
---

# Phase 70 Plan 21: settings/game v2 schema-derived strip Summary

Per-game settings files are migrated on first access to v2, with every top-level per-app object run through `stripToSchema(..., gameSettingsSchema.partial(), { dropInvalidOptional: true })`. Retired keys (`useSteamRuntime`), rejected nulls, older-build `gamescope` objects missing `additionalOptions`, stale launch options and wrong-typed values are removed so the install dialogs' whole-object round-trip passes the strict `writeConfig` and `runWineCommand` schemas. Schema-valid values (including the loose `wineVersion` arm with legacy keys) are untouched; `version` and `explicit` pass through.

Trade-off (orchestrator decision): an invalid user value is dropped from the live file and its default applies; the engine's 0600 pre-migration backup keeps the original (test asserts byte-identical backup).

Forward-compat: a build from before this plan opens v2 per-game files read-only (Phase 68 D-03). Every per-game file is rewritten once, with a backup, the first time it is accessed after the upgrade.

## Commits

- 75e620c60 feat(70-21): chain step, per-game version v2
- c93477506 test(70-21): fixtures, control/pass tests, engine pins

## Verification

tsc clean outside PlatformSupport (pre-existing); four settings/versioning suites plus engineConfig pass; prettier clean on written paths; `pnpm boundaries` PASS. Full Backend FAIL list is the same as the pre-plan baseline (tauriShellSource, epicOfflineMode, shimCoverage, shimGenerate, dxvkInstallRemove).

## Deviations from Plan

**1. [Rule 1 - pinned behaviour]** Suites seeding unversioned/v1 per-game files and asserting no rewrite were updated:
- `settingsVersioning.test.ts` "readStoredGameConfig ... migrates without a write" now asserts one migration with one backup and version v2 (renamed).
- `engine/__tests__/engineConfig.test.ts` `put()` helper now seeds `version: 'v2'` so "never writes" still tests readEngineForGame rather than the first-access migration.

## Known Stubs

None.

## Self-Check: PASSED
