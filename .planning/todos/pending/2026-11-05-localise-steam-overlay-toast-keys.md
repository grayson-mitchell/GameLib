---
created: 2026-11-05T12:00:00.000Z
title: "Localise steam.overlay.toast.title and .body in all 48 non-en catalogs"
area: i18n
files:
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
severity: medium
platform: any
ready: code
---

## Problem

`steam.overlay.toast.title` and `steam.overlay.toast.body` (phase 59) exist in the `en` gamelib
catalog only and are recorded in `meta/i18nCatalogPresenceBaseline.json` (2 keys x 48 locales = 96
pairs). That masks the gap: the lint is green while non-English users see English overlay toast text.

## Solution

Same flow as quick 261105-a72: write per-language translations through a fill record, pass each
through `validateTranslation`, apply to the 48 `gamelib.json` and `gamelib.mt.json` files, then
re-sync the baseline with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`
and confirm only those 96 pairs left it.
