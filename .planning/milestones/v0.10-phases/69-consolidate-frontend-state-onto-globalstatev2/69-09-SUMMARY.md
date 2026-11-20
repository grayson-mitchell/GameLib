---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 09
subsystem: frontend-state
tags: [zustand, uiState, ratchet, withStoreHooks]
requires: [69-06]
provides: [9 UI components/hooks on uiState, DialogHandler buttonActions test on the real store]
key-files:
  modified: [Anticheat, ControllerHints, DialogHandler, ExternalLinkDialog, OfflineMessage, QuitButton, SettingsPanel, useOpenDialog, useSettingsContext, buttonActions test, NavShell QuitButton/SettingsPanel/destinationCoverage tests, 2 useSettingsContext tests, 3 frontendContextCeiling shards, 2 backendDiCeilings shards]
decisions:
  - "NavShell tests keep their useContext mock for unconverted children and mirror the converted fields into uiState through a setContext helper"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 09: UI components and hooks off ContextProvider Summary

DialogHandler, ExternalLinkDialog, OfflineMessage, ControllerHints, Anticheat, QuitButton, SettingsPanel, useOpenDialog and useSettingsContext now read from uiState. Dialog queue reducer untouched.

## Commit
One commit for both tasks (conversion was scripted).

## Ratchet
frontend-context-ceiling: components-ui -5, components-ui-navshell -2, hooks -2 (hooks.json holds only hasStatus.ts). backendDi: buttonActions 6 -> 5 (ContextProvider mock removed), both useSettingsContext tests 2 -> 1. No new jest.mock.

## Deviations
- [Rule 3] QuitButton.test, SettingsPanel.test, destinationCoverage.test broke indirectly (components now import uiState, pulling tauriAttach). No sibling plan lists them; added to this plan's files_modified. Fixed with withStoreHooks react mocks, tauriWindow stub import, a `setContext` helper mirroring fields into the real uiState, afterEach resetAllStores, and re-installing the window.api stub in beforeEach (tauriWindow/uiState replace it).
- buttonActions: stores mock extended with gameOverridesStore/wineDownloaderInfoStore (uiState reads them at create time); window.api stub reinstalled in beforeEach.

## Gates
Frontend jest (311 suites, 5300 tests), codecheck, lint, find-deadcode, frontend-context-ceiling, backend-di-ceilings all exit 0; prettier clean.

## Out-of-scope test breakage
None.

## Self-Check: PASSED
