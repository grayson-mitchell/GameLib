# Quick 261101-tjv: Clean tile mode Summary

**Clean tiles toggle (Accessibility, default off, persisted via configStore) that collapses the grid tile's bottom bar and its height with CSS only.**

## Commits
- de6d16365: preference wired end to end (electron_store type, storePolicy allowlist, frontend types, ContextProvider, GlobalState, Accessibility toggle, en string, storePolicy test assertion)
- 41299c88b: GamesList passes `cleanTiles` to the wrapper class; CSS `.cleanTiles .gameCard { --game-card-bar-height: 0px }` and `.cleanTiles .gameCard > .icons { display: none }`; new `cleanTiles.test.ts` gate (seen failing first, 4 of 5)

## Deviations
- [Rule 1 - expected test update] `gameCardControllerGeometry.test.ts` G3 asserted exactly one `--game-card-bar-height` declaration. Changed to expect two and assert the second is the `.cleanTiles .gameCard` override set to `0px`. No geometry assertion was weakened; base-rule derivation check is unchanged.
- `cleanTiles.test.ts` strips CSS comments before the list-layout check (the explanatory comment mentions `.gameListItem`).

## Verification
- `npx tsc --noEmit` clean; storePolicy test (52) and all GameCard tests (73) pass; scoped prettier passes. translation.json is prettier-ignored, so not checked. `pnpm lint-translations` was not run.
- `graphify update .` run.

## Pending human verification
Live `tauri dev` check not done (restart dev first). In Settings > Accessibility enable "Clean tiles": grid tiles lose the bar with no gap; tile click opens the game page and launch works; right-click menu works; list view keeps the Action column; toggling off restores the bar; check default and one light theme; controller A-button play/install still works.

## Known Stubs
None.

## Self-Check: PASSED
