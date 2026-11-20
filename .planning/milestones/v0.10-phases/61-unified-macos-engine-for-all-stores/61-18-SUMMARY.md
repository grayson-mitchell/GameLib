---
phase: 61-unified-macos-engine-for-all-stores
plan: 18
subsystem: frontend
tags: [engine-override, settings, wine-tab, i18n]
requires: [61-17]
provides:
  - EngineOverride (store-agnostic Engine control, per-game and global variants)
  - engineOverrideLogic (effectiveSelectValue, isUnsupportedEngineId, visibleOptions, needsFreshBottleConfirm)
  - macOS Wine tab and defaults page gating
affects: [GamesSettings, Settings components, gamelib catalogue]
key-files:
  created:
    - src/frontend/screens/Settings/components/engineOverrideLogic.ts
    - src/frontend/screens/Settings/components/__tests__/engineOverrideLogic.test.ts
  modified:
    - src/frontend/screens/Settings/components/EngineOverride.tsx (git mv from SteamEngineOverride.tsx)
    - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
    - src/frontend/screens/Settings/sections/GamesSettings/index.scss
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
decisions:
  - "D-04 warning is a confirmation dialog before the write (Move / Cancel), not an inline note"
  - "Non-Steam macOS games derive CrossOver-like from the effective engine; Steam keeps its wineVersion rule; an unknown engine counts as CrossOver-like so toggles do not flash"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 18: Engine control and Wine-tab gating Summary

One Engine control now serves every macOS Windows game and the macOS defaults page, with derived value, read-only Legacy entry, Unsupported text and the D-04 fresh-bottle confirmation.

## Tasks

Both tasks landed in one commit, `824a4731a`. `GamesSettings` imports the renamed component, so Task 1 alone would not type-check (same situation as 61-17).

1. `SteamEngineOverride` renamed to `EngineOverride`; writes `engineOverride`; shows `effectiveEngineId` when nothing is stored; Legacy is a disabled `Legacy: <name>` item shown only while selected; Unsupported text for pinned, Wine Manager and Legacy for every store; choosing Automatic/CrossOver on a plain prefix opens the confirmation, and Move writes the engine plus `state.perGameBottleName`. Global variant uses `getDefaultEngine()` and `listEngineOptions({ appName: 'default' })`, never writes on render.
2. Wine tab: `isMacEngineGame` renders hint + Engine control (+ `WinePrefix` for non-Steam plain/legacy prefixes); `isDefault && isMac` renders global Engine + `WinePrefix`; Linux/Windows branch untouched. `AutoDXVK` hidden for bottle-backed games.

## Verification

- `pnpm exec jest src/frontend`: all pass. `pnpm codecheck`, `pnpm lint-translations:gamelib` (0 hard failures), prettier on touched files clean.
- Lint baselines: src 1117 (unchanged), tests 662 (was 664).
- i18n baseline diff adds only the five new `engine.*` keys across locales.
- `grep useSetting('steamEngineOverride'` in src/frontend: 0.

## Deviations from Plan

**1. [Rule 3 - Blocking] Path renames in meta lists**: updated `meta/i18nForkTouchedFiles.json`, `meta/knip-baseline.txt` and `meta/__tests__/genI18nGateScope.test.ts` for the renamed file; regenerated the presence baseline.

**2. Single commit for two tasks** (see Tasks).

**3. Steam Crossover-like flag unchanged**: the plan said to derive it from the effective engine for macOS engine games, but also that Steam is unchanged; I applied the engine-derived flag to non-Steam games only.

## Deferred Issues (pre-existing, from 61-17, not fixed)

`meta/i18nForkTouchedFiles.json` still lists `SteamEngineNotices.tsx` and `SteamEngineState.ts`, which 61-17 renamed. This fails `genI18nGateScope` (2 tests) and `hardcodedStringGate`. `logSecretGate` and `x86CallbackWineHarness` also fail independently of this plan.

## Known Stubs

None.

## Threat Flags

None. T-61-55 (only listed ids selectable, Legacy disabled and never sent), T-61-56 (bottle name is the backend-computed value) and T-61-57 (confirmation before write) are mitigated.

## Self-Check: PASSED

Commit `824a4731a` and `engineOverrideLogic.ts` verified. REQUIREMENTS.md does not exist, so requirements mark-complete was skipped.
