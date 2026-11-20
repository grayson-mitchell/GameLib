---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 07
subsystem: frontend-state
tags: [zustand, uiState, settings, ratchet]
requires: [69-06]
provides: [35 Settings components on uiState selectors, testUtils/tauriWindow]
key-files:
  created: [src/frontend/testUtils/tauriWindow.ts]
  modified: [35 Settings components, 6 Settings component tests, meta/frontendContextCeiling/screens-settings-components.json, meta/backendDiCeilings/frontend-screens-settings-components.json]
decisions:
  - "Node-env tests that now transitively import uiState load a shared side-effect stub (frontend/testUtils/tauriWindow) first, instead of hand-copying the window stub"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 07: Settings components off ContextProvider Summary

35 UI-only Settings components now read platform/showDialogModal/showResetDialog from uiState (`useUiState((s) => s.x)` or `.keys(...)`); shard keeps only ClearCache, CometSupport, EgsSettings, HideChangelogOnStartup.

## Commit
- b226bc193: both tasks done in one commit (conversion was scripted, so the 20/15 split added no isolation).

## Tests
- EngineOverride, EngineOverride.save, eacRuntimeInstallFailure: react mock rebuilt through `withStoreHooks`, dialog/platform data moved to `useUiState.setState`, `resetAllStores` in afterEach.
- EnableSteamNativeDelete, ShareDetectedFixes, SteamExperimentalInstallApp: only needed the window stub import.
- jest.mock counts: EngineOverride.save 8 -> 6, EngineOverride 8 -> 7 (ContextProvider and uiState mocks removed; ceiling lowered); others unchanged. No new jest.mock.
- framelessWindowCopy (absence assertion) still passes.

## Deviations
- [Rule 3] Added `src/frontend/testUtils/tauriWindow.ts`: importing uiState pulls in tauriAttach, which needs `window` at module scope in the node test env.

## Gates
Frontend jest, codecheck, lint, find-deadcode, frontend-context-ceiling, backend-di-ceilings all exit 0; prettier clean; knip baseline untouched.

## Out-of-scope test breakage
None.

## Self-Check: PASSED
