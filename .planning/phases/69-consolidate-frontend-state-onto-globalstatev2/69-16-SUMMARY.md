---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 16
subsystem: frontend-state
tags: [zustand, libraryState, D-01, D-10]
requires: [69-14]
provides: [libraryState collections (hidden, favourites, customCategories, currentCustomCategories) and per-game display data (gameOverrides, crossoverRatings, runsForMe)]
key-files:
  modified: [src/frontend/state/libraryState.ts, src/frontend/state/uiState.ts, src/frontend/state/bridgeContextValue.ts, src/frontend/state/initStateSubscriptions.ts, src/frontend/state/GlobalState.tsx, src/frontend/screens/Library/index.tsx, src/frontend/screens/Library/components/GameCard/index.tsx, src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx, src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx, src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx, src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx, src/frontend/screens/Game/GamePage/components/RunsForMeToggle.tsx]
  created: [.planning/todos/pending/2026-11-10-custom-categories-mutated-in-place.md]
decisions:
  - "Category actions ported verbatim including the in-place mutation of customCategories; filed as a todo, not fixed (R1)"
  - "LibraryState interface exported so the boot test can type the store"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 16: library collections Summary

libraryState now owns hiddenGames, favouriteGames, customCategories, currentCustomCategories (with the legacy `current_custom_category` read fallback and the same configStore/localStorage writes in the same order) plus gameOverrides, crossoverRatings and runsForMe, moved out of GlobalState and uiState. Unconverted consumers still get the `hiddenGames`/`favouriteGames`/`customCategories` composites with identical keys and `setCurrentCustomCategories` through `bridgedContextSlice`; the bridge subscribes to libraryState. `readInitialLibrary()` runs in boot section (1); the CrossOver-index and runs-for-me listeners and pulls register once in section (2) with the same log strings. Seven consumers read crossoverRatings/runsForMe from libraryState.

## Commits
- 479f4538a: libraryState collections + display data, uiState shrink, tests, todo
- c010b22af: bridge composites, boot listeners, GlobalState shrink, consumer swaps, fake-api test fixes

## Tests
libraryState: hide/unhide, favourites dedupe, every category action including the `preset_uncategorized` fallback and rename remap, legacy key read, display data setters. Bridge composite keys and subscription; boot listeners, pull success and failure log messages. No jest.mock added, no ceiling shard touched.

## Deviations
- [Rule 3] Three GlobalState* wiring tests owned by no sibling plan (`GlobalStateFocusRowHydration`, `GlobalStateSavedZoomWiring`, `GlobalStateSignInMount`) had fake `window.api` objects that lacked `getCrossoverIndex`/`getRunsForMeMap`, now called by the real boot; added pending-promise stubs.
- Category tests seed `customCategories: {}` per test: the preserved in-place mutation leaks the creation-snapshot object across `resetAllStores` (noted in the todo).
- `meta/knip-baseline.txt` needed no change.

## Out-of-scope test breakage
None.

## Gates
Frontend jest 315 suites / 5391 tests pass; lint 0 errors; frontend-context-ceiling, backend-di-ceilings, planning-gates pass; prettier clean on touched files; `PERF_ERA=check pnpm perf:rerender` passes (check.json deleted, baseline untouched). `pnpm codecheck` fails only on other-session 66.1 `src/backend/__tests__/commandRunner.test.ts`; `pnpm find-deadcode` fails only on `DRAIN_GRACE_MS` in src/backend/process/runner.ts. No finding in a file touched here.

## Self-Check: PASSED
