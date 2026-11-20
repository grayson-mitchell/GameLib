---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 20
subsystem: frontend-state
tags: [zustand, accountHooks, Library, GameCard, D-09, D-11, D-12, D-14]
requires: [69-19]
provides: [Library screen consumers off ContextProvider]
key-files:
  modified: [src/frontend/screens/Library/index.tsx, src/frontend/screens/Library/components/GameCard/index.tsx, src/frontend/screens/Library/components/GamesList/index.tsx, src/frontend/screens/Library/components/CategoriesManager/index.tsx, src/frontend/screens/Library/components/EmptyLibrary/index.tsx, src/frontend/screens/Library/components/LibraryTour.tsx, src/frontend/screens/Library/components/SteamSyncNotice/index.tsx, src/frontend/state/accountHooks.ts]
  deleted: [meta/frontendContextCeiling/screens-library.json]
decisions:
  - "EmptyLibrary and LibraryTour only read `.library` lengths, so they select the raw `*Library` arrays instead of composite account hooks"
  - "accountHooks `@public` tags dropped for the seven hooks that now have consumers (knip passes); useHumbleAccount keeps its tag"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 20: Library screen on stores Summary

All seven Library screen consumers (Library, GameCard, GamesList, CategoriesManager, EmptyLibrary, LibraryTour, SteamSyncNotice) read domain stores; none imports ContextProvider. `screens-library.json` (context ceiling shard) is deleted. GameCard selects only what it renders (`useHiddenGames`, `useFavouriteGames`, one `useUiState.keys`), Library uses the account composites plus `useLibraryState.keys`.

## Commits
- see `git log` for `feat(69-20): Library screen consumers on domain stores` (single commit covering both tasks; the tasks shared one shard and one gate run) and the accountHooks tag-drop follow-up.

## D-14 harness (`PERF_ERA=check pnpm perf:rerender`)
Mounts and passes; check.json deleted, baseline untouched. Counts (Library / GameCard): toggleAppearance 2/200, gameStatusPush 4/300, dialogOpenClose 2/200, libraryRefreshPush 4/366. Per 69-19 the baseline was 100/200/200/266 for GameCard; gameStatusPush and libraryRefreshPush GameCard counts are not lower than that reference (the harness still mounts through the GlobalState bridge, so the full saving lands with 69-24). Recorded, not gated.

## Deviations
- [Rule 3] Two tests not in the plan's `files_modified` broke and no sibling plan (69-21..23) lists them, so they were added to `files_modified` and fixed: `Library/__tests__/librarySyncNoticeSource.test.ts` (G3 pinned `refreshingInTheBackground` at 3 occurrences; the `useLibraryState.keys` key string makes it 4, pin and doc updated) and `CategoriesManager/__tests__/newCollectionFocus.test.tsx` (now `withStoreHooks`, tauriWindow import, seeded `getCustomCategories`).
- Tests: EmptyLibrary and libraryTourAnchors rebuilt on `withStoreHooks` plus store seeding, static imports (no `require`); jestMock ceilings lowered 7->6 and 5->4. cleanTiles/hideTitles regexes retarget `useSettingsState.keys(`. cardVisibility needed no change (only a comment mentions ContextProvider).
- Commit mechanics: the deleted shard needed `git reset` of its own staged deletion before a pathspec commit; only this plan's paths were committed.

## Gates
Frontend jest 316 suites / 5436 tests pass; codecheck 0 errors; find-deadcode PASS; frontend-context-ceiling PASS (34, down from 41); backend-di-ceilings: no frontend failures. `pnpm lint`: errors only in other-session files (src/backend/services/legacyFacades.ts import-x/namespace, gog/redist.ts unused GameInfo); 0 errors in src/frontend. `backend-di-ceilings` still reports "shrank" entries for gog test files (other-session noise). Prettier clean on touched files.

## Out-of-scope test breakage
None.

## Known Stubs
None.

## Self-Check: PASSED
