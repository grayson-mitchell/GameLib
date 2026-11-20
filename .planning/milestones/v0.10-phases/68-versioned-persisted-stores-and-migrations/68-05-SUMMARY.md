---
phase: 68-versioned-persisted-stores-and-migrations
plan: 05
subsystem: backend-persistence
tags: [settings, config-json, game-config, migrations, store-versioning]
requires: [68-02]
provides:
  - settingsFiles (ensureSettingsMigrated, writeSettingsFile, settingsVersionCodec, parseSettingsVersion)
  - settingsGlobalChain (v0->v1 tray variant + focusRow) and settingsGameChain (identity v0->v1)
  - GlobalConfig / GameConfig on the shared engine; reload()/upgrade() retired
affects: [68-06, 68-09]
tech-stack:
  added: []
  patterns: [lazy per-file migration, read-side normalisers kept as degradation path]
key-files:
  created:
    - src/backend/storeVersioning/settingsFiles.ts
    - src/backend/storeMigrations/settingsGlobal.ts
    - src/backend/storeMigrations/settingsGame.ts
    - src/backend/storeMigrations/__tests__/settingsGlobal.test.ts
    - src/backend/storeMigrations/__tests__/fixtures/ (3 JSON fixtures)
    - src/backend/storeVersioning/__tests__/settingsFiles.test.ts
    - src/backend/__tests__/settingsVersioning.test.ts
  modified:
    - src/backend/config.ts
    - src/backend/game_config.ts
    - src/backend/storeMigrations/index.ts
    - src/backend/constants/others.ts
    - src/common/types.ts
    - src/backend/engine/engineConfig.ts
    - src/backend/__tests__/gameConfigFirstWrite.test.ts
    - src/backend/sidecar/__tests__/focusRowFirstLaunchHydration.test.ts
    - src/frontend/state/GlobalState.tsx
    - src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts
key-decisions:
  - "D-11: read-side migrateTrayIconVariant/migrateFocusRowSelection calls stay in getSettings() and syncTrayIcon as normalisers for read-only files"
  - "libraryTopSection removed from AppSettings, its type and factory default; migrateFocusRowSelection's structural parameter still accepts it"
  - "GameConfigVersion drops 'v0.1' (no use outside game_config.ts); GameConfigV0_1 class removed"
requirements-completed: [R-B, R-C, R-D, R-E, D-04, D-06, D-08, D-09, D-10, D-11]
duration: ~45min
completed: 2026-11-08
---

# Phase 68 Plan 05: Settings files on the store engine Summary

`config.json` and `GamesConfig/<app>.json` now migrate, back up, rewrite atomically (0o600) and go read-only through the same engine as the conf stores. The two ad hoc fix-ups are one ordered `settings/global` v0->v1 migration, and a `version: 'v9'` config no longer crashes `GlobalConfig.get()`.

## Tasks

1. Settings codec/migrator, two chains, fixtures, 11 tests - `79832ef24`
2. config.ts / game_config.ts rewired, reload()/upgrade() retired, version constants to v1, libraryTopSection retired, 6 integration tests - `a7e9d1a66`

## Deviations from Plan

**1. [Rule 1 - Bug] WR-04 fault injector was single-shot** - `gameConfigFirstWrite.test.ts` threw once from its `writeFileSync` wrapper. `atomicWritePrivate` retries with a direct write after a failed temp write, so a one-shot fault was absorbed and `setSetting` no longer threw. Made the injector persistent until the existing `afterEach` clears it (a real ENOSPC fails both attempts). WR-04 assertions are unchanged.

## D-04 deliberate assertion change

`focusRowFirstLaunchHydration.test.ts` (~L285): `expect(config.defaultSettings.libraryTopSection).toBe(libraryTopSection)` became `.toBeUndefined()`, because the v0->v1 migration removes the legacy key from `config.json` (recoverable from `config.v0.<stamp>.bak.json`). The mirror assertion stays; the "left untouched" comment and header were rewritten. All launch-1/launch-2 `focusRow` assertions, the clearing-row and R1 cases passed unchanged. This is a D-04 change, not a weakening.

## Notes

- `GameConfig.get` for a missing file no longer creates `{}` as a side effect (old `upgrade()` did); added a test. No first-write case depended on it.
- Settings migrations rewrite with the engine's tab indent; later settings writes use 2-space as before (cosmetic).
- Prettier does not ignore the JSON fixtures; they are checked.
- A v0.1 file now parses as v0 (explicit) instead of the removed non-explicit class; no code ever wrote v0.1.
- Wave order: this was the fifth plan executed (01, 08, 02, 03, 05).

## Verification

Scoped suites, engineConfig, Frontend and Common focusRow suites, `pnpm codecheck`, scoped prettier all pass. Full Backend project: only `quitTeardownWiring`, `macArchKnownFixRouting`, `tauriShellSource` fail (pre-existing, in deferred-items.md). smoke:sidecar and tauri:dev not run (reserved for 68-09).

## Known Stubs

None.

## Self-Check: PASSED
