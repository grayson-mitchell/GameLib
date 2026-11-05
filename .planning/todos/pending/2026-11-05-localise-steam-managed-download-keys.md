---
created: 2026-11-05T12:00:00.000Z
title: "Localise the Steam-managed download keys in all 48 non-en catalogs"
area: i18n
files:
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
severity: minor
platform: any
ready: code
---

## Problem

Debug `steam-dl-missing-in-downloads` (`a530e7279`) added 5 en-only keys:
`downloadManager.steamManaged.{title,pause,cancel,unavailable}` and
`gamepage.steamInstallingPercent` ("Installing… {{percent}}%"). They are recorded in
`meta/i18nCatalogPresenceBaseline.json` (5 keys x 48 locales = 240 pairs, totalPairs 6144 -> 6384),
which keeps the lint green while non-en users see English.

## Solution

Same flow as quicks 261105-a72 and 261105-gy5: a hand-authored fill record, each value through
`validateTranslation` (keep `{{percent}}` and the Steam glossary term), apply to the 48
`gamelib.json` and `gamelib.mt.json`, then re-sync the baseline with
`LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` and confirm only those 240
pairs left it.
