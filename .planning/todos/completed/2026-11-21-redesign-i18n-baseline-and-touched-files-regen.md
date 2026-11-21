---
created: 2026-11-21T02:10:00.000Z
title: Game settings redesign (quick-261121-dzl) left the i18n baseline, fork-touched-files list and gameinfo-narrowing ceiling stale, so main goes red on push
area: i18n
severity: major
platform: any
ready: code
files:
  - meta/i18nForkTouchedFiles.json
  - public/locales/en/gamelib.json
  - meta/__tests__/lintTranslations.test.ts
  - meta/__tests__/genI18nGateScope.test.ts
---

## Problem

The local post-wave test gate for Phase 82 plan 82-20 (2026-11-21, HEAD 6ec89ee18) failed three
tests that come from the committed-but-unpushed quick-261121-dzl commits (56e3874de..ab691d565),
not from Phase 82:

- Lint: `pnpm gameinfo-narrowing-ceiling` FAILS (`SettingsModalHeader.tsx` has 1, baseline 0), from dzl commit 75b492f1d; runs in lint.yml (found by the 82 verifier, 2026-11-21).

- `lintTranslations` REQ-41-02 and `comparePresenceBaseline` REQ-41-01 R13: 1728 hard failures,
  all new gamelib keys (`engine.wineTabNote`, `settings.cards.*`, `settings.fields.afterExit.*`, ...)
  not localised and not recorded in the presence baseline.
- `genI18nGateScope` A-17 ANTI-ROT: committed `meta/i18nForkTouchedFiles.json` still lists
  `BeforeLaunchScriptPath.tsx` and `AfterLaunchScriptPath.tsx` (and 4 more), which 0ccc6db7b removed.

Pushing main as-is turns the Test workflow red, which also blocks the Phase 82 UAT item 2 re-test
(G-82-2-r2 needs a green Test run on a main sha containing 82-20).

## Solution

Remove the new GameInfo narrowing in `SettingsModalHeader.tsx` (do not raise the ceiling). Regenerate the presence baseline and `meta/i18nForkTouchedFiles.json` with the repo's own
generators (do not hand-edit, do not widen the gate), confirm the three suites green, then push.

## Resolution

Closed by quick 261121-lco (2026-11-21). Nothing pushed.

- `370e1ce7a`: `SettingsModalHeader.tsx` now picks the App-ID label with `isStore(runner, 'steam')`, so the GameInfo narrowing count is back to 0 and the ceiling was not raised.
- `98f952f4b`: `meta/i18nCatalogPresenceBaseline.json` written by `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` (+1728 / -0, 16368 pairs, 341 keys).
- `60e1c07ed`: `meta/i18nForkTouchedFiles.json` regenerated with `pnpm gen-i18n-gate-scope` (445 files). Five zero-violation files were promoted into the blocking scope (317 -> 322) and `GamesSettings/tabs.ts` was declared in `DECLARED_UNSCANNED_DEBT` (+1), with the ledger entry and count pins updated.

Correction to the A-17 framing above: the committed artifact was not listing removed files. It was missing six files that quick 261121-dzl made fork-touched (three edited upstream files, three created).
