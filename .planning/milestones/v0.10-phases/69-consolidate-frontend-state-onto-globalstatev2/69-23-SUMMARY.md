---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 23
subsystem: frontend-state
tags: [zustand, accountHooks, Settings, Login, WebView, Humble, StoreSearch, D-09, D-11, D-12]
requires: [69-19]
provides: [last consumer batch off ContextProvider]
key-files:
  modified: [src/frontend/screens/Settings/components/ClearCache.tsx, src/frontend/screens/Settings/components/EgsSettings.tsx, src/frontend/screens/Settings/sections/CategorySettings/index.tsx, src/frontend/screens/Settings/sections/LogSettings/index.tsx, src/frontend/screens/Settings/sections/ReportProblem/index.tsx, src/frontend/screens/Settings/sections/StoreSettings/EosOverlay.tsx, src/frontend/screens/Login/index.tsx, src/frontend/screens/WebView/index.tsx, src/frontend/screens/Discounts/index.tsx, src/frontend/screens/Humble/Keys/index.tsx, src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx, src/frontend/screens/StoreSearch/index.tsx, src/frontend/state/accountHooks.ts, src/frontend/testUtils/storeHookReact.ts]
  deleted: [meta/frontendContextCeiling/screens-login.json, screens-webview.json, screens-other.json, screens-settings-components.json, screens-settings-sections.json]
decisions:
  - "useHumbleAccount lost its @public tag (now consumed by ReportProblem, Humble Keys, Login, WebView, Discounts, StoreSearch)"
  - "withStoreHooks overrides typed Record<string, unknown> so slot-based fakes type-check"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 23: Last consumer batch on stores Summary

Twelve screens (Settings remainder, Login, WebView, Discounts, Humble Keys and claim wizard, StoreSearch) now read libraryState/authState/uiState and the accountHooks composites; none imports ContextProvider. Five context-ceiling shards deleted; frontend-context-ceiling reports imports=1 (GlobalState.tsx only).

## Remaining ContextProvider importers
Only `src/frontend/state/GlobalState.tsx` (ceiling state.json). Name-only references remain in `src/frontend/types.ts` (ContextType), Library `engineWiring`/`filterEngine`/`steamSectionGating`/`steamEligibilityProbe`/`crossoverInstallRisk` and a few tests (type/comment mentions, not the context import); 69-24 deletes the class/context/bridge.

## Deviations
- [Rule 3] Five tests rebuilt on `withStoreHooks` + store seeding (ReportProblem, removeEosOverlayConfirmation, StoreSearchScreen, Humble Keys, HumbleClaimWizard); window.api now set in beforeEach/mount after imports; the StoreSearch source pin retargeted to comment-stripped source with an anti-vacuity `useSteamAccount()` check.
- backendDi ceilings lowered: ReportProblem.test 5->4, removeEosOverlayConfirmation.test 3->2 (react mocks rebuilt inside factories, ContextProvider mocks removed).
- `src/frontend/testUtils/storeHookReact.ts` widened (not in files_modified; no sibling owns it).
- Doc comments in WebView/StoreSearch reworded so they no longer name ContextProvider.

## Gates
Frontend jest 316 suites / 5436 tests pass; frontend-context-ceiling PASS (1); backend-di-ceilings PASS; find-deadcode PASS; prettier clean. codecheck and lint: zero errors/TS errors in frontend files; remaining failures are other-session noise in src/backend/storeManagers/steam/** (games.test.ts TS2554, refresh.ts unused `steamMetadataStore`).

## Out-of-scope test breakage
None.

## Known Stubs
None.

## Self-Check: PASSED
