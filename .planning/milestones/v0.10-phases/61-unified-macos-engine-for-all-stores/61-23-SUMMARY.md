---
phase: 61-unified-macos-engine-for-all-stores
plan: 23
subsystem: engine
tags: [game-config, engine-override, cr-05, g-1]
requires: []
provides:
  - "GameConfig never injects engineOverride into defaults"
  - "needsFreshBottleConfirm true for prefixKind 'legacy'"
affects: []
key-files:
  modified:
    - src/backend/game_config.ts
    - src/backend/__tests__/gameConfigFirstWrite.test.ts
    - src/backend/engine/engineConfig.ts
    - src/backend/engine/__tests__/engineConfig.test.ts
    - src/frontend/screens/Settings/components/engineOverrideLogic.ts
    - src/frontend/screens/Settings/components/__tests__/engineOverrideLogic.test.ts
decisions:
  - "readEngineForGame stays the single source of truth; existing config-less games do not inherit the global engine pick (new installs get it explicitly from the install dialogs)"
metrics:
  tasks: 2
  completed: 2026-11-07
requirements-completed: [D-08, D-09, D-04]
---

# Phase 61 Plan 23: CR-05 engine default + G-1 Legacy confirm Summary

The settings page and the launch now read one engine for a config-less game (the injected global default is gone), and switching a Legacy game to Automatic or CrossOver shows the D-04 fresh-bottle confirm.

## Tasks

1. `b41a0fd74` - removed the `engineOverride` default injection and the `globalEngineOverride` destructure/unused import in `game_config.ts`; `readEngineForGame` doc now states CR-05 single-source contract. Tests: config-less game has no engineOverride (config and getSettings), an unrelated `setSetting('showFps')` writes no engineOverride key, an Engine edit still writes it, plus two engineConfig contract tests (global 'crossover' pick + toolkit wineVersion gives legacy; crossover wineVersion gives automatic/derived).
2. `59ad368e5` - `needsFreshBottleConfirm` returns true for 'plain' or 'legacy' with next automatic/crossover; doc updated. Tests for legacy true/false cases added.

## RED evidence

- Before the fix, 3 new tests failed: "a config-less game has no engineOverride even with a global pick", "an unrelated setSetting ... never writes engineOverride" (against the pre-plan game_config.ts), and "G-1: asks for a legacy game to automatic or crossover". The Engine-edit test and the two engineConfig contract tests pass before and after (they pin unchanged behaviour). All pass after.

## Verification

Suites gameConfigFirstWrite, engineConfig, gameEngineState, legacyBottleUntouched, engineOverrideLogic, EngineOverride: 85 passed. `pnpm codecheck` exits 0. `pnpm lint`: 0 errors (1115 pre-existing warnings, over the cap, not from this plan). Prettier clean on all six files.

## Audit: new-game config creation outside Install/Import/ThirdParty/Sideload dialogs

Grep of `GameConfig.get(`, `setSetting('engineOverride'`, `getDefaultEngine`, `engineOverride:` callers:

- Install, Import, ThirdParty, Sideload dialogs (`engineInstallChoice.ts`, `EngineSelector`, `importEngineSettings.ts`, `installFlowRegistration.ts`): write an explicit engineOverride from `getDefaultEngine`. Gets the global pick.
- `src/backend/storeManagers/steam/games.ts:144`: Steam install writes explicit `engineOverride` / `steamEngineOverride`. Gets the pick.
- `src/backend/utils.ts:1197-1231` (wineVersion default repair on launch) and `launcher.ts`/`steam/bottle.ts` wineVersion writes: do not write an engine, so those games fall back to the global/own wineVersion derivation. Not fixed here (checker warning, D-09/D-20).
- No auto-add or library-sync path creating a non-Steam game config with an engine was found; such games have no config until first edit and derive from the global wineVersion (fall back).

## Deviations from Plan

None - plan executed as written. (One test-typing fix: `getSettings()` is async, so the assertion awaits it.)

## Self-Check: PASSED

Commits b41a0fd74 and 59ad368e5 exist; all six files modified.
