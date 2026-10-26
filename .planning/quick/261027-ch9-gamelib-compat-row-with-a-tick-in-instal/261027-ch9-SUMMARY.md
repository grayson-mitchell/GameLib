# Quick 261027-ch9: GameLib compat row with a tick Summary

**A "GameLib" row with a CheckCircle tick on the game page Info tab when a bundled or local known-fix (tier 1 or tier 2) exists; remote-only fixes never show it; no rating anywhere.**

## Commits
- a2385f6bf: `readGamelibFixStatus` + `getGamelibFixStatus` sidecar channel (types, ipc, preload, census 14->15, inventory 226->227 / 71->72)
- 8d5834465: `resolveGamelibFixDisplay` helper + GameLib row in `AppleWikiInfo.tsx`
- b78a7ee37: `info.gamelibFix.label/title` in 49 catalogs (mt.json in 48), todo closed (moved to completed with the rating-to-tick note)

## Verification (faithful)
- Task 1: jest on knownFixesGamelibStatus (new), knownFixesLayered, knownFixes, flowRegistrationCensus, enrichmentFlows all pass; `pnpm codecheck` green; scoped prettier green; `fixesPath` absent from `readGamelibFixStatus`; no `'rating'` in knownFixes.ts.
- Task 2: gamelibFixDisplay (new), bridgeRouteDisplay, labelSuiteI18nCensus pass (37 tests); codecheck, eslint, scoped prettier green.
- Task 3: `gamelibCatalogParity` passes; `i18n-churn-guard` clean; `planning-gates` 12/12; 48 translations validated with the real `validateTranslation()` plus a sabotage control (reported problems). Locale JSON and `.planning` are prettier-ignored, so no prettier check.

## Known failures not caused by this task
- `meta/__tests__/machineFillGamelib.test.ts`: 3 `pluralCategoriesFor` failures (ru, ar, underscore code) from category ordering. Unrelated to these changes.
- `pnpm lint-translations:gamelib` exits 1 (1776 findings, 624 hard failures). The one finding line I saw was `steam.bridge.waiting.title` not localised, from the other task's uncommitted en keys in the worktree. No finding mentions `gamelibFix`.
- Did not run `pnpm lint-translations:gamelib` against a clean tree, so I did not establish that the remaining 624 hard failures are all pre-existing.

## Deviations
- No `ANTHROPIC_API_KEY`, so `pnpm machine-fill-gamelib` was not run. The 48 translations were hand-authored. `label` is `GameLib` verbatim; `title` keeps `GameLib` literal.
- `en/gamelib.json` was committed via an index blob built from HEAD, so the commit holds only the `info.gamelibFix` hunk (confirmed: the commit contains no `steamNotRunning`). The foreign steam-bridge hunk is still uncommitted in the worktree.
- While scripting I truncated `ar/gamelib.json` and the worktree `en/gamelib.json` by opening them for write before reading. I restored `ar` from HEAD and rebuilt `en` as HEAD plus the saved foreign diff. `git diff` on `en` now matches the saved foreign diff exactly.
- `AppleWikiInfo` source test strips comments with a local regex instead of `stripSourceComments`.
- Task 3's final verify chain (`git diff HEAD~1 -- en`) compares the worktree, so it contains the foreign hunk by design. I checked `git show HEAD -- en` instead (0 matches for `steamNotRunning`).
- `.planning/IPC-PORT-INVENTORY.md` is committed in Task 1 as the plan specified.

## Threat flags
None beyond the plan's threat model.

## Self-Check: PASSED
Files and commits exist (a2385f6bf, 8d5834465, b78a7ee37); foreign dirty files remain unstaged and unchanged.
