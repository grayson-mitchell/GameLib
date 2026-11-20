---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 08
subsystem: frontend-state
tags: [zustand, uiState, ratchet, withStoreHooks]
requires: [69-06]
provides: [17 screen files on uiState selectors, withStoreHooks proven end to end]
key-files:
  modified: [17 screen components, Runner index + logoutFailureSurface tests, cloudSavesSyncFailure test, WinetricksSettings treeHarness.ts + tabFixtures.ts, 7 frontendContextCeiling shards, 2 backendDiCeilings shards]
decisions:
  - "Winetricks tree harness gets useSyncExternalStore/useDebugValue; tabFixtures seeds uiState platform via lazy import so zustand loads after the test's react mock"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 08: Screen consumers off ContextProvider Summary

17 UI-only screen files (Settings sections, WineManager, InstallModal shell, FocusRowStrip, Game page parts, ConsoleMode overlays, Login Runner) now read platform/showDialogModal/connectivity/activeController from uiState.

## Commit
One commit for both tasks (conversion was scripted).

## Ratchet
frontend-context-ceiling total: 89 -> 72 (exactly 17 lowered). backendDi: cloudSavesSyncFailure 10 -> 9, logoutFailureSurface 5 -> 4. No new jest.mock.

## withStoreHooks proof (69-01 hand-off)
Runner index.test.tsx runs the real zustand+useShallow uiState hook under withStoreHooks; a new test asserts a rejected logout reaches the SEEDED showDialogModal spy. Findings: uiState pulls tauriAttach, which can overwrite window.api at import, so logoutFailureSurface sets window.api in beforeEach after imports; mock factories need an `as unknown as Partial<typeof import('react')>` cast for the custom useState/__resetMount keys.

## Deviations
- [Rule 3] WinetricksSettings tests (9 whole-tab suites) broke indirectly (WinetricksSettings/index.tsx now reads uiState). No sibling plan lists them, so fixed via the shared fixtures only: `__tests__/treeHarness.ts` (useSyncExternalStore, useDebugValue) and `__tests__/tabFixtures.ts` (tauriWindow import, seeds uiState platform with a lazy `await import`). Neither is a test file with jest.mock; no test file edited.

## Gates
Frontend jest (311 suites, 5300 tests), codecheck, lint (0 errors), find-deadcode, frontend-context-ceiling, backend-di-ceilings all exit 0; prettier clean; knip baseline untouched.

## Out-of-scope test breakage
None.

## Self-Check: PASSED
