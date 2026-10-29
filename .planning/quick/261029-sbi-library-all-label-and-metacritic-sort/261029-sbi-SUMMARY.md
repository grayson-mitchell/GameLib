---
phase: quick-261029-sbi
plan: 01
status: complete-pending-live-check
subsystem: library
tags: [library, sort, metacritic, steam-pics, i18n]
requirements: [QUICK-261029-SBI]
commits:
  - 2cb1cdc48 feat: Steam Metacritic capture (PICS + appdetails)
  - 2550b2a15 (commit of quick 261029-sex that swept in useWikiMetacriticScores.ts and its test, which I had staged)
  - b781b515a feat: Metacritic sort field, Library wiring, gate promotion of the hook
  - 18b34b8ab fix: promote steamInstallSignIn.ts into i18n gate scope (A-17 ratchet)
  - 9457c9a59 feat: All chip label, Metacritic dropdown row, tour copy, en keys
---

# Quick 261029-sbi: Library "All" label and Metacritic sort

The filter panel's All chip now reads "All". Sort by gains Metacritic as the fourth option, highest first. Unknown scores sort last in both directions.

## What was built

- `src/common/metacriticScore.ts`: `parseMetacriticScore`, the one validator (integers 1..100, digit-only strings; 0 is "no score").
- `src/backend/storeManagers/steam/metacriticCapture.ts`: `captureOwnedAppMetacritic`. It is scoped to `metacriticCaptured !== true`, makes one bulk PICS call serialised through `withPlatformCaptureLock`, and never throws. It logs `Steam bulk metacritic capture: scoped=N captured=N skipped=N`.
- `library.ts` `syncOwnedLibrary` awaits it after the platform capture. It uses the anonymous client, falling back to the held client. It does not open a new sign-in. `GameInfo.metacritic_score` is seeded from `cachedMeta`.
- `games.ts` appdetails: `metacritic.score` is validated and written, with a sixth carry-forward on the enumerated `steamMetadataStore.set`.
- `useWikiMetacriticScores.ts` is a read-only reader of the `wikigameinfo` snapshot. It makes no network call and never evicts. If hydration gives up it returns `{}`.
- `librarySort.ts`: `'metacritic'` field, `metacriticScoreOf`, `buildWikiMetacriticByTitle`. Library `index.tsx` shows Name A-Z while the wiki store hydrates.
- Header sort Dropdown has a fourth row. The tour sort step uses new key `tour.library.sortWithMetacritic`. Chip uses new key `library.filterPanel.nativeAll`. en catalog edited by hand (`gamelib.json` only).

Decisions D-sbi-1..5 from the plan were followed as written.

## Deviations from Plan

1. **[Rule 3 - Blocking] A-17 / A-03 ratchet in `genI18nGateScope`.** The A-17 anti-rot test compares the committed fork-touched artifact to the live git derivation from HEAD. Quick 261029-s5l had committed `src/frontend/helpers/steamInstallSignIn.ts` without updating either artifact, so a one-path edit could not pass. I added it to `i18nForkTouchedFiles.json` (a full `pnpm gen-i18n-gate-scope` would have done the same). The A-03 ratchet then required it to be scanned. An audit-mode `scanScope({ extraFiles })` showed 0 violations, so I promoted it into `i18nGateScope.json`. Final counts are scope 245 (not 244) and fork-touched 291 (not 290). Commit 18b34b8ab. `generatedAt` is unchanged.
2. **Commit attribution.** A concurrent executor (quick 261029-sex) committed in the same working tree and its commit 2550b2a15 swept in my staged `useWikiMetacriticScores.ts` and `useWikiMetacriticScores.test.ts`. The content is in HEAD and correct, but those two files are not in a `sbi` commit.
3. **Prettier churn.** `prettier --write` on `library.ts` reformatted unrelated pre-existing lines, so commit 2cb1cdc48 touches about 100 lines there (the pre-commit hook required it).

## Verification

- `pnpm codecheck`: clean.
- Jest over steam backend, `src/common`, `src/frontend/screens/Library`, `src/frontend/components/UI`, `genI18nGateScope`, `hardcodedStringGate`: 6409 passed, 2 skipped, 0 failed.
- `genI18nGateScope.test.ts` and `hardcodedStringGate.test.ts` pass.
- Prettier clean on all source paths. `public/locales/**` is ignored, so the catalog edit was matched by hand.
- I did not separately re-run `steamInstallOptionsEntry.test.ts` (C3, known pre-existing failure). It is outside the directories I ran.
- No change under `src/backend/sidecar` (no new IPC).

## Failures that are not caused by this task (reported faithfully)

- `pnpm lint-translations` exits 1 (336 hard failures, "new key is not localised and was not recorded"). The baseline already lacked riq's keys (`filterPanel.native`, `quickFiltersCollections`) and s5l's (`signInRequiredAction/Notice`), in every non-en locale. My three new keys (`nativeAll`, `sort.field.metacritic`, `tour.library.sortWithMetacritic`) add to the same list. Clearing it needs `pnpm i18n` or a baseline regeneration, which was forbidden here.
- `pnpm i18n-churn-guard` exits 1 because `public/locales/en/gamepage.json` has the user's uncommitted edit. I did not touch that file and it is byte-identical to the session start.
- `pnpm find-deadcode`: no output mentions any new metacritic symbol. `graphify update .` ran.

## Needs a live check

0. **Restart `tauri dev`.** It does not rebuild the sidecar, so the PICS capture and appdetails changes will not run until the sidecar is rebuilt and dev restarted. Check the sidecar.js mtime.
1. "(Installed) | (All) (Native)" fits on one line in the ~230px column in midnightMirage, gruvbox_dark and dracula.
2. "Sort by Metacritic" fits the dropdown trigger.
3. After a Steam Refresh (with a session held or an anonymous client), the sidecar log shows `Steam bulk metacritic capture: scoped=<library size> ...` once, then `scoped=0` on the next Refresh.
4. The Metacritic sort puts scored Steam games first, highest at the top, unknown at the bottom.
5. Open a GOG game's page, then go back: it should rank by its PCGamingWiki score without a remount.
6. Choosing the sort issues no PCGamingWiki, appdetails or PICS request.

## Known stubs

None.
