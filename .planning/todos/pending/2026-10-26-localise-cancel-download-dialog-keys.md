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
