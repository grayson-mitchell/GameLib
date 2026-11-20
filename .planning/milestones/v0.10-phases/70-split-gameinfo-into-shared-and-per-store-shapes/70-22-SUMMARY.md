---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 22
subsystem: store-migrations
tags: [gap-closure, g3, wr-05, zod, migration, global-settings]
requires: ["70-18", "70-21"]
provides:
  - "settings/global chain v1 -> v2 strip derived from appSettingsSchema.partial() (dropInvalidOptional: true)"
  - "currentGlobalConfigVersion = 'v2'"
key-files:
  modified:
    - src/backend/storeMigrations/settingsGlobal.ts
    - src/backend/constants/others.ts
    - src/common/types.ts
    - src/backend/storeMigrations/__tests__/settingsGlobal.test.ts
    - src/backend/storeVersioning/__tests__/settingsFiles.test.ts
    - src/backend/__tests__/settingsVersioning.test.ts
  created:
    - src/backend/storeMigrations/__tests__/fixtures/settings-global-v1-retired-keys.json
    - src/backend/storeMigrations/__tests__/fixtures/settings-global-v1-invalid-values.json
requirements-completed: [ARCH-03, ARCH-03.4, ARCH-03.5]
completed: 2026-11-14
---

# Phase 70 Plan 22: settings/global v2 schema-derived strip Summary

config.json `defaultSettings` is migrated on first access to v2 via `stripToSchema(..., appSettingsSchema.partial(), { dropInvalidOptional: true })`. Retired keys (`useSteamRuntime`), rejected nulls, wrong-typed values and nested objects missing required keys are dropped so the factory default applies; valid values (including `focusRow: null`) are untouched. The v0 -> v1 tray/focusRow fold stays first. Tests prove writeConfig('default') fails on the raw fixtures and passes after the step, with a per-key setSetting loop.

Trade-off: invalid values are dropped from the live file; the engine's 0600 pre-migration backup keeps the original (asserted byte-identical).

Forward-compat: a build from before this plan opens a v2 config.json read-only (Phase 68 D-03).

## Commits

- 9d29fbce2 feat(70-22): chain step, global version v2
- test commit: see git log (test(70-22))

## Verification

tsc clean outside PlatformSupport (pre-existing); six settings/versioning/engine suites pass (58 tests); prettier clean; full Backend FAIL list is a subset of baseline noise (tauriShellSource, epicOfflineMode, shimCoverage, shimGenerate); `pnpm find-deadcode` PASS and does not mention schemaStrip.

## Deviations from Plan

**1. [Rule 1 - pinned behaviour]** Per-game tests in settingsVersioning.test.ts that seeded config.json at v1 now seed v2 so they are not about the global migration; global v1 expectations updated to v2.

## Known Stubs

None.

## Self-Check: PASSED
