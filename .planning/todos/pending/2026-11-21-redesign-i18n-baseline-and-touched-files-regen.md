---
created: 2026-11-21T02:10:00.000Z
title: Game settings redesign (quick-261121-dzl) left the i18n baseline and fork-touched-files list stale, so main goes red on push
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

- `lintTranslations` REQ-41-02 and `comparePresenceBaseline` REQ-41-01 R13: 1728 hard failures,
  all new gamelib keys (`engine.wineTabNote`, `settings.cards.*`, `settings.fields.afterExit.*`, ...)
  not localised and not recorded in the presence baseline.
- `genI18nGateScope` A-17 ANTI-ROT: committed `meta/i18nForkTouchedFiles.json` still lists
  `BeforeLaunchScriptPath.tsx` and `AfterLaunchScriptPath.tsx` (and 4 more), which 0ccc6db7b removed.

Pushing main as-is turns the Test workflow red, which also blocks the Phase 82 UAT item 2 re-test
(G-82-2-r2 needs a green Test run on a main sha containing 82-20).

## Solution

Regenerate the presence baseline and `meta/i18nForkTouchedFiles.json` with the repo's own
generators (do not hand-edit, do not widen the gate), confirm the three suites green, then push.
