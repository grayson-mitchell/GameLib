---
phase: 61-unified-macos-engine-for-all-stores
plan: 17
subsystem: frontend
tags: [engine-state, zustand, game-page, i18n]
requires: [61-13]
provides:
  - useEngineState (byGame), engineStateKey, handleEngineStateChangedSignal
  - EngineNotices / EngineBadge on every macOS non-Browser game page
affects: [GamePage, Settings engine/overlay overrides, SteamEngineLaunchNotice]
key-files:
  created:
    - src/frontend/state/EngineState.ts
    - src/frontend/screens/Game/GamePage/components/EngineNotices.tsx
  modified:
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/EngineBadge.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
decisions:
  - "Engine store keyed runner:appName; payload guard replaces the digits-only check (T-61-52)"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 17: Store-agnostic engine surfaces Summary

Engine store re-keyed by `runner:appName`, with notices, badge and fallback toast shared across every store's macOS Windows game page, and a "Legacy: <name>" badge label.

## Tasks

Both tasks landed in one commit, `70eeaf345`. They could not be split cleanly: the renamed store is imported by GamePage and EngineNotices, so a Task 1-only commit would not have type-checked.

1. Store renamed (`SteamEngineState.ts` to `EngineState.ts`), `byGame` map, `engineStateKey`, shape guard on `runner` and `appName`. GlobalState, launch notice and both Settings components repointed.
2. `SteamEngineNotices` renamed to `EngineNotices`. GamePage fetch gate changed from `usesBottleRuntime && isMac` to `isMac && install.platform !== 'Browser'`. EngineBadge uses `legacyLabel`. Added `engine.legacyLabel`.

## Verification

- `pnpm exec jest src/frontend`: 297 suites, 5173 tests pass.
- `pnpm codecheck` passes. Prettier check is clean on touched files.
- Lint baselines unchanged: tests 664, src 1117.
- No remaining `useSteamEngineState`, `byAppId` or `handleSteamEngineStateChangedSignal` in `src/frontend`.

## Deviations from Plan

**1. [Rule 3 - Blocking] i18n presence baseline**
- `lint-translations:gamelib` failed with 48 hard failures, one per locale, for the new `engine.legacyLabel` key. Regenerated `meta/i18nCatalogPresenceBaseline.json` (only the new key's entries added), as 61-12 did.

**2. [Rule 3 - Blocking] themeTokens census**
- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` hard-codes the path `SteamEngineNotices.tsx`. Updated to the renamed file.

**3. Single commit for two tasks** (see Tasks).

## Known Stubs

None.

## Threat Flags

None. T-61-52 (payload shape guard) and T-61-53 (`CROSSOVER_URL` constant kept) are mitigated.

## Self-Check: PASSED

Files and commit `70eeaf345` verified. REQUIREMENTS.md does not exist, so requirements mark-complete was skipped.
