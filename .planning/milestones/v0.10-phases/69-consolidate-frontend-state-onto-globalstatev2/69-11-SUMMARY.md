---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 11
subsystem: frontend-state
tags: [zustand, settingsState, uiState, ContextProvider-removal]
requires: [69-07, 69-08, 69-09, 69-10]
provides: [14 consumers + App on stores; app.json shard deleted]
key-files:
  modified: [src/frontend/App.tsx, Dialog.tsx, 5 isRTL form fields, LanguageSelector, ThemeSelector, HeroicVersion, NavShellTour, Accessibility, CometSupport, HideChangelogOnStartup, tests, ceiling shards]
decisions:
  - "isRTL consumers use useSettingsState(selectIsRTL); no stored field"
  - "Both tasks landed in one commit because the Task 1 verify (whole components/UI jest) already needed Task 2's test conversions"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 11: Settings-wave consumer conversion Summary

App.tsx and the 13 settings-slice components no longer import ContextProvider. Settings fields come from `useSettingsState`, platform/isFullscreen/isFrameless from `useUiState`, RTL from `selectIsRTL`.

## Commit
- 1ddd60d99: all conversions, tests, shards

## Test changes
- dialogStoreEmbedSuppression regex retargeted to the new Dialog.tsx read line (shape and anti-vacuity kept).
- GlobalStateFramelessRefresh part B: the gate reader now parses `useUiState.keys(...)`; B1 asserts isFrameless comes from it; B2-B4 and S5-S7 unchanged.
- NavShellTour.test: react mock rebuilt with `withStoreHooks`, stores seeded, `resetAllStores` afterEach, ContextProvider jest.mock removed (ceiling 5 to 4).
- HeroicVersion.test: hand-rolled react mock gained store-hook primitives; stores seeded inside `isolateModules`; window extends the tauriWindow stub.

## Deviations
- [Rule 3] Tests owned by no sibling newly reached stores in the node env (PathSelectionBox, UploadedLogFilesList deleteButtonReachability, steamCreateAccountLink): added the `tauriWindow` stub import first; steamCreateAccountLink sets `window.api` in beforeEach.

## Shards
`meta/frontendContextCeiling/app.json` deleted; entries removed from components-ui, components-ui-navshell, screens-other, screens-settings-components (now only ClearCache, EgsSettings). backendDi frontend-components-ui-navshell lowered.

## Gates
Frontend jest (312 suites, 5330 tests), codecheck, lint (0 errors), find-deadcode, frontend-context-ceiling, backend-di-ceilings all exit 0; prettier clean. No new jest.mock.

## Self-Check: PASSED
