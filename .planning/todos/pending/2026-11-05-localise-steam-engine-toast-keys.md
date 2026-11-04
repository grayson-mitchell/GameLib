---
created: 2026-11-05T09:00:00.000Z
title: "Localise the four steam.engine.toast.* keys in all 48 non-en catalogs"
area: i18n
files:
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
severity: medium
platform: any
ready: code
---

## Problem

Quick 261104-vvz (`30ccb0b5f`) added `steam.engine.toast.body`, `steam.engine.toast.title.cxBroken`,
`steam.engine.toast.title.cxExpired` and `steam.engine.toast.title.cxMissing` to the `en` gamelib
catalog only, and recorded their 192 pairs (4 keys x 48 locales) in
`meta/i18nCatalogPresenceBaseline.json`. That masks the gap: the lint is green while non-English
users see English toast text.

## Solution

Same flow as quick 261105-9sr: write per-language translations through a fill record, pass each
through `validateTranslation`, apply to the 48 `gamelib.json` and `gamelib.mt.json` files, then
re-sync the baseline with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`
and confirm only those 192 pairs left it.
