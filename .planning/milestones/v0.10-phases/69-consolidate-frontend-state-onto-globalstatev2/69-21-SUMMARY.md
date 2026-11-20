---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 21
subsystem: frontend-state
tags: [zustand, accountHooks, InstallModal, GamePage, DownloadManager, ConsoleMode, hasStatus, D-09, D-11, D-12]
requires: [69-19]
provides: [install/game/downloads/console consumers and hasStatus off ContextProvider]
key-files:
  modified: [src/frontend/hooks/hasStatus.ts, src/frontend/screens/ConsoleMode/index.tsx, src/frontend/screens/DownloadManager/index.tsx, src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx, src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx, src/frontend/screens/DownloadManager/components/SteamManagedItem/index.tsx, src/frontend/screens/Game/GamePage/index.tsx, src/frontend/screens/Game/GameSubMenu/index.tsx, src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx, src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx, src/frontend/screens/Library/components/InstallModal/ImportDialog/index.tsx, src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx, src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx, src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts]
  deleted: [meta/frontendContextCeiling/screens-console.json, meta/frontendContextCeiling/screens-downloads.json, meta/frontendContextCeiling/screens-game.json, meta/frontendContextCeiling/screens-library-installmodal.json, meta/frontendContextCeiling/hooks.json]
decisions:
  - "hasStatus selects raw epicLibrary/gogLibrary (it only read .library) instead of composite account hooks"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 21: Install/Game/Downloads/Console consumers on stores Summary

All 13 consumers plus hasStatus read libraryState/uiState/authState and the accountHooks composites; none imports ContextProvider. The five context-ceiling shards are deleted; frontend-context-ceiling passes (21 imports, down from 34).

## Deviations
- [Rule 3] `hooks/__tests__/hasStatus.reconcile.test.ts` (not listed, no sibling owns it) broke because hasStatus now imports libraryState; added `import 'frontend/testUtils/tauriWindow'` first and added the path to `files_modified`.
- No steamSectionGating or other test needed changes; no backendDi frontend-*.json entry changed (no jest.mock removed).

## Gates
Frontend jest 316 suites / 5436 tests pass; codecheck pass; lint 0 errors; find-deadcode PASS; frontend-context-ceiling PASS; backend-di-ceilings PASS. Prettier: all touched paths either clean or ignored.

## Out-of-scope test breakage
None.

## Known Stubs
None.

## Self-Check: PASSED
