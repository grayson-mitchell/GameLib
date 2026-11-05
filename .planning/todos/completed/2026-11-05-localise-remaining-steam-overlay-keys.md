---
created: 2026-11-05T13:00:00.000Z
title: "Localise the remaining 8 steam.overlay exit and override keys in all 48 non-en catalogs"
area: i18n
files:
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
severity: medium
platform: any
ready: code
---

## Problem

After quick 261105-gy5 localised `steam.overlay.toast.*` and `steam.overlay.step.*`, eight
`steam.overlay` keys still exist in the `en` gamelib catalog only and are recorded in
`meta/i18nCatalogPresenceBaseline.json`: `exit.body`, `exit.title` and `override.automatic|help|label|off|on|summary`
(8 keys x 48 locales = 384 pairs). That masks the gap: the lint is green while non-English users
see the overlay setting row (Run > Steam overlay) and the early-exit notice in English.

## Solution

Same flow as quick 261105-gy5 / 261105-a72: write per-language translations through a fill record,
pass each through `validateTranslation`, apply to the 48 `gamelib.json` and `gamelib.mt.json` files,
then re-sync the baseline with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`
and confirm only those 384 pairs left it. Reuse each locale's gy5 word for "overlay" (see
`261105-gy5-i18n-fill.json`). The `exit.body` and `override.help` strings keep `Mac Steam` literal.

## Closed 2026-11-05 (quick 261105-s7f)

The 8 remaining `steam.overlay` keys (`exit.body|title`, `override.automatic|help|label|off|on|summary`)
are translated into all 48 non-en `gamelib.json` catalogs, 384 pairs, via
`261105-s7f-i18n-fill.json` (hand-authored; no API key). Each value was also added to the locale's
`gamelib.mt.json` `keys` (sorted insert, existing order untouched).

- `validateTranslation`: 384/384 pass. Sabotage controls rejected: de help with `Mac Steam` ->
  `Mak Steam` (glossary-term message) and de exit.body plus `{{appName}}` (introduced-placeholder
  message). The planned `Mac-Steam` sabotage was NOT rejected (the validator's relaxed trailing
  boundary accepts `Mac` followed by a hyphen), so it was replaced.
- Overlay word reused from each locale's gy5 toast title; the exit.body settings path is built as
  `<settings.navbar.run> > <override.label>` from each locale's own strings.
- Baseline: totalPairs 6384 -> 6000; `missing` equals the pre-fill snapshot minus exactly those 8
  keys; no `steam.overlay.*` key remains in it.
- Gates: see the quick SUMMARY (lint-translations:gamelib, four jest suites, i18n-churn-guard,
  planning-gates).
