---
created: 2026-10-26
title: "Localise the 7 downloadManager.cancelDialog.* keys in the 48 non-English gamelib catalogs"
source: /gsd-validate-phase 51 audit, 2026-10-26
severity: medium
platform: any
ready: code
area: i18n
files:
  - public/locales/*/gamelib.json
---

## Problem

Quick task 261026-t7b (`565421d16`, verb-button cancel download dialog) added seven keys to
`public/locales/en/gamelib.json` only:

`downloadManager.cancelDialog.{title,message,stopDownload,stopKeepFiles,deleteFiles,keepDownloading}`

Its verify ran `gamelibCatalogParity` but not `lintTranslations`, so it missed the gap. Since then
`pnpm lint-translations:gamelib` exits 1 with 336 hard failures (7 keys × 48 locales), and two
live-tree tests in `meta/__tests__/lintTranslations.test.ts` fail: REQ-41-02 (zero hard failures)
and REQ-41-01 R13 (zero presence-baseline drift). These are the only reds among the 48 suites the
Phase 51 validation ran. That run shows row 51-04-02 of `51-VALIDATION.md` red because of this todo.

## Fix

Fill all seven keys in all 48 non-English `gamelib.json` catalogs in one commit, following the
Phase 51-04 / 52-33 fill-record pattern (`*-i18n-fill.json`). Keep the placeholders intact. Do not
regenerate the presence baseline to hide the gap: the lint message offers that option, but it would
record the keys as permanently unlocalised.

## Done when

- `pnpm lint-translations:gamelib` exits 0
- `pnpm jest meta/__tests__/lintTranslations.test.ts meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts --silent` is green
- Row 51-04-02 in `51-VALIDATION.md` flipped to `✅ green`, with a dated note in its audit trail

## Closed 2026-10-27 (quick 261027-thn)

The key count was 6, not 7: `messageSteam` was removed by quick 261027-cux (9271b7e67). All 6 `downloadManager.cancelDialog.*` keys are filled in the 48 non-en `gamelib.json` catalogs (and listed in each `gamelib.mt.json`) from `.planning/quick/261027-thn-localise-the-7-downloadmanager-canceldia/261027-thn-i18n-fill.json`; 288/288 pairs pass the real `validateTranslation()` and a sabotage control (de `message` without `{{title}}`) was rejected.

Commit 6de4cce9b had recorded the 288 pairs as known-missing in `meta/i18nCatalogPresenceBaseline.json`, masking the gap. That is reversed: the baseline was re-synced after the fill via the writer and now differs from HEAD only by those pairs (1920 -> 1632).

Gates green: lintTranslations / gamelibCatalogParity / i18nCatalogChurnGuard / i18nGlossary jest suites, `pnpm lint-translations:gamelib` (0 hard failures, no cancelDialog finding), `pnpm i18n-churn-guard`, `pnpm planning-gates`. Row 51-04-02 of 51-VALIDATION.md flipped to green.
