---
created: 2026-09-24T00:00:00.000Z
title: 'zh_Hans/zh_Hant catalogs carry `_one` plural keys that CLDR says can never be selected'
area: i18n
severity: minor
platform: any
ready: code
found_by: 'Quick task 260925-bq4 while fixing plural resolution for the underscore-named locales'
source: '.planning/quick/260925-bq4-fix-i18next-plural-resolution-for-underscore/260925-bq4-SUMMARY.md'
files:
  - public/locales/zh_Hans/gamelib.json
  - public/locales/zh_Hant/gamelib.json
  - meta/machineFillGamelib.ts
---

## What

Both Chinese catalogs carry `_one` **and** `_other` variants for all 8 plural key families
(`humbleKeys.cooldown_one`, `box.error.install.stalled_one`, ...). Chinese has exactly one CLDR
plural category:

```js
new Intl.PluralRules('zh-Hans').resolvedOptions().pluralCategories // ['other']
```

So `getSuffix` can only ever return `_other`. Every `_one` entry in those two files is
**permanently unreachable** — no count, no locale setting, no code path selects it.

This was invisible until now: before quick-260925-bq4, `zh_Hans` resolved no plural rule at all
and every counted string fell through to English, so neither variant was reached. Now that
resolution works, `_other` wins and `_one` is simply dead weight.

## Why it is `minor`, not `medium`

Nothing renders wrong. The `_one` and `_other` values are currently identical strings in both
files, so even if something did select `_one` the user would see the same text. The cost is
maintenance noise: 8 dead keys x 2 locales that translators and `machine-fill` will keep
re-filling, and that a future reader will reasonably assume are live.

## The fix has two halves — do not do only the first

1. Delete the `_one` entries from `public/locales/zh_Hans/gamelib.json` and
   `public/locales/zh_Hant/gamelib.json`.
2. Stop `meta/machineFillGamelib.ts` re-emitting them. It emits "each locale's CLDR plural forms"
   (`ddd2b8ed0`), so it either is not consulting `Intl.PluralRules` for these two locales or is
   consulting it with the underscore code — which **throws**, exactly the defect
   quick-260925-bq4 fixed elsewhere. Check that call site specifically; it may be the same root
   cause in a second place.

Deleting without half 2 means the next `machine-fill` run puts them straight back.

## Watch out

`removing-a-locale-key-has-three-traps` applies: the catalog-parity test counts locales, and
`meta/__tests__/gamelibCatalogParity.test.ts` will need to accept that `zh_Hans`/`zh_Hant`
legitimately carry fewer plural variants than `en` — it must not treat "fewer keys than English"
as drift. Check how it already handles `pt_BR`'s **extra** `_many`, which is the same asymmetry
in the other direction.
