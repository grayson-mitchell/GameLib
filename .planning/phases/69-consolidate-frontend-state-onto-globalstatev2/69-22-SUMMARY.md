---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 22
subsystem: frontend-state
tags: [zustand, accountHooks, Header, NavShell, UninstallModal, D-09, D-11, D-12]
requires: [69-19]
provides: [components/UI and NavShell consumers off ContextProvider]
key-files:
  modified: [src/frontend/components/UI/DLCList/DLC/index.tsx, src/frontend/components/UI/ErrorComponent/index.tsx, src/frontend/components/UI/Header/index.tsx, src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx, src/frontend/components/UI/UninstallModal/index.tsx, src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx, src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx, src/frontend/components/UI/NavShell/components/NavTabs/index.tsx, src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx, src/frontend/components/UI/NavShell/__tests__/FilterCollectionList.test.tsx, src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx, src/frontend/components/UI/NavShell/components/FilterFocusRow/__tests__/filterFocusRow.test.tsx]
  deleted: [meta/frontendContextCeiling/components-ui.json, meta/frontendContextCeiling/components-ui-navshell.json]
decisions:
  - "RedeemSteamKeyDialog only read steam.library, so it selects steamLibrary directly instead of useSteamAccount"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 22: UI and NavShell consumers on stores Summary

Eight shared UI/NavShell components now read libraryState/uiState/settingsState and the accountHooks composites (UninstallModal via selectInstallingEpicGame); none imports ContextProvider, and both context-ceiling shards are deleted (frontend-context-ceiling: 13 imports, down from 21).

## Deviations
- [Rule 3] `NavShell/__tests__/NavTabsComponent.test.tsx` broke (NavTabs now pulls the stores); no sibling plan owned it, so it was added to this plan's `files_modified` and rebuilt on `withStoreHooks` with store seeding.
- No backendDi frontend-components-ui*.json entry changed: no jest.mock was removed (react mocks rebuilt inside their existing factories).
- A doc comment in FilterFocusRow naming ContextProvider was reworded so the file has no reference.

## Gates
Frontend jest 316 suites / 5436 tests pass; codecheck 0; lint 0 errors; find-deadcode PASS; frontend-context-ceiling PASS; backend-di-ceilings PASS. Prettier clean on all 12 touched paths (none ignored). Backend gates saw no other-session noise.

## Out-of-scope test breakage
None.

## Known Stubs
None.

## Self-Check: PASSED (commit 1769a371e present; shards removed)
