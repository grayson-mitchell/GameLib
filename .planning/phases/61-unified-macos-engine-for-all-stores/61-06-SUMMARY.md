---
phase: 61-unified-macos-engine-for-all-stores
plan: 06
subsystem: macos-engine
tags: [engine-config, migration, write-guard]
requires: ["61-02"]
provides:
  - "src/backend/engine/engineConfig.ts: readStoredGameConfig, deriveEngineFromWine, resolveEffectiveEngine, readEngineForGame, resolveGlobalEngine, isWritableEngineOverride, engineIdOf"
  - "GameSettings.engineOverride?: string (all stores)"
  - "Backend write guard for engineOverride in setSetting and writeConfig"
  - "New-game inheritance of the global engineOverride (macOS)"
affects: [61-07, 61-08, 61-10]
key-files:
  created:
    - src/backend/engine/engineConfig.ts
    - src/backend/engine/__tests__/engineConfig.test.ts
    - src/backend/sidecar/__tests__/engineOverrideWriteGuard.test.ts
  modified:
    - src/common/types.ts
    - src/backend/sidecar/settingsFlowRegistration.ts
    - src/backend/game_config.ts
    - src/backend/__tests__/gameConfigFirstWrite.test.ts
    - src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
key-decisions:
  - "Legacy is a derived EffectiveEngine variant only; a stored legacy:* or path parses to automatic and is rejected at write time"
  - "Steam keeps reading steamEngineOverride as a fallback and never derives from wineVersion"
  - "engineConfig lazy-requires engineDecision, fallbackEngine and backend/config so game_config.ts stays a leaf (static import dragged in backend/utils and broke the game_config test harness)"
requirements-completed: [D-02, D-04, D-05, D-06, D-07, D-08, D-09, D-11, D-15]
duration: n/a
completed: 2026-11-07
---

# Phase 61 Plan 06: Engine key and read-time migration Summary

`engineConfig.ts` derives any game's (or the global default's) effective engine from its stored `wineVersion` without writing, and `setSetting`/`writeConfig` now persist only closed-grammar `engineOverride` ids.

## Commits

- 684ec24fb - `engineOverride` type, `engineConfig.ts`, 16 tests (including the no-write fs snapshot)
- 9b75e1089 - write guard in `settingsFlowRegistration.ts`, new-game default in `game_config.ts`, tests

## Verification

engine, sidecar and `src/backend/__tests__` jest suites pass (3410 of 3411); `pnpm codecheck` and `pnpm boundaries` clean; all new or edited files add 0 eslint warnings (game_config.ts and settingsFlowRegistration.ts stay at their base 10); prettier clean.

## Deviations from Plan

**1. [Rule 3 - Blocking] Lazy requires in engineConfig.** Static imports of `fallbackEngine`/`engineDecision` pulled `backend/utils` into `game_config.ts`, which crashed its test harness on unmocked paths. Default deps now `require()` them on first use.

**2. [Rule 3 - Blocking] Gate files touched.** `gameDetailsImportGate.test.ts` pins a sha256 of `settingsFlowRegistration.ts`; re-pinned deliberately (guard added, `steamLibrary.has` gate untouched). `testContainment.test.ts` tripwire required classifying the new suite as structurally contained.

**3. Test adaptation.** The new-game default test reads `GameConfig.get(...).config` (the load-time read) because `getSettings()` re-reads after the file exists.

## Known pre-existing failures (not touched)

`tauriShellSource.test.ts` (Rust `.title(format!` pattern) fails independently of this plan.

## Known Stubs

None.

## Self-Check: PASSED
