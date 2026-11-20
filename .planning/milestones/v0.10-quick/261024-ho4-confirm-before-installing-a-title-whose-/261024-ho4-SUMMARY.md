---
phase: quick-261024-ho4
plan: 01
status: complete
completed: 2026-10-24
commits: [58fb31bc7, 83349560f, 0385653ec]
---

# Quick 261024-ho4: Confirm before installing a CrossOver title rated below 4 of 5

Shared `crossoverInstallRisk.ts` helper (thresholds 1-2 known-not-to-work, 3 may-have-problems, 4-5 none, null unrated notice, absent none) wired as a confirm dialog into SteamDialog, DownloadDialog and ThirdPartyDialog; WineSelector shows a passive unrated notice and its D-18 comment records the reversal.

## Commits
- 58fb31bc7: helper + 12 unit tests (red then green)
- 83349560f: dialog wiring, WineSelector notice and comment, wiring source-gate test
- 0385653ec: 7 `installFlows.crossoverRating.*` keys in all 49 gamelib locales (9 additions, 0 deletions each), todo moved to completed/

## Results
- crossoverInstallRisk tests: 12/12 pass. InstallModal jest suites and hardcodedStringGate: pass. tsc clean. eslint 0 errors (pre-existing warnings only). prettier clean on all written code files.
- `pnpm i18n`, `pnpm i18n-churn-guard`, `pnpm lint-translations:gamelib` (0 hard failures), `pnpm planning-gates` (12/12): pass.

## Deviations / Deferred
- `meta/__tests__/genI18nGateScope.test.ts` A-03 ratchet FAILS, and it was already failing before this task: the committed `meta/i18nForkTouchedFiles.json` was missing 8 other fork-touched files (resolveBootLanguage.ts, SteamBridgeRouteNotice.tsx, bridgeRouteDisplay.ts, steamBridgeRouteLine.ts, WrappersTable.tsx, BottleLaunchWaiting.ts, SteamBridgeRouteNotice.ts, savedZoomBoot.ts); the new crossoverInstallRisk.ts is a 9th. Running `pnpm gen-i18n-gate-scope` made 4 more tests in that file fail (they pin 258 files / 212-scope), and the scope file is hand-curated, so I reverted the regeneration and left meta/ untouched. Needs a separate decision on the hand-curated scope.
- Live Mac verification (ELEX 411300 / Hoard 63000 confirm, Cancel leaves modal open) is still owed.

## Self-Check: PASSED
