---
created: 2026-09-24T00:00:00.000Z
title: 'zh_Hans/zh_Hant catalogs carry `_one` plural keys that CLDR says can never be selected'
area: i18n
status: resolved
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

# RESOLVED 2026-09-24 — closed as BY DESIGN, not fixed. This todo was wrong on three counts.

**Do not re-file this.** The `_one` keys are deliberate, load-bearing for a gate, and inert for
i18next. Every claim below the line was checked and three of them failed.

## 1. Not a zh issue — seven locales, all identical

`_one`/`_other` at 8 keys each, in every locale whose only CLDR category is `other`:

| locale                                     | `Intl.PluralRules(...).pluralCategories` | `_one` | `_other` |
| ------------------------------------------ | ---------------------------------------- | ------ | -------- |
| ja, ko, vi, th, id, zh_Hans, zh_Hant       | `["other"]`                              | 8      | 8        |

Singling out the two Chinese catalogs described a general shape as a local defect.

## 2. `machine-fill` does NOT share the root cause this todo guessed at

The todo speculated its plural call site might be throwing on an underscore code — "the same
root cause in a second place". It is not. `pluralCategoriesFor`
(`meta/machineFillGamelib.ts:133-141`) normalises first:

```ts
const tag = locale.replace(/_/g, '-')
return new Intl.PluralRules(tag).resolvedOptions().pluralCategories
```

with a header that already names `zh_Hans` and `pt_BR` as the reason. `countIsOptionalFor:163`
and `:262` do the same. That code never had the bug quick-260925-bq4 fixed in the app.

## 3. The proposed fix turns CI red

`requiredPluralKeys` (`:207-218`) returns the **UNION** of en's suffixes and the locale's own
CLDR categories. The en half is not an oversight — it exists so `lint-translations`' "every en
key present" check stays satisfied. Measured by deleting one key and running the gate:

```
Missing translation for zh_Hans.gamelib.humbleKeys.cooldown_one (en is non-empty)
zh_Hans.gamelib.humbleKeys.cooldown_one: a new key is not localised and was not recorded
lint-translations: 7436 findings, 1 hard failures     <- baseline 7435 findings, 0 hard failures
```

So the trade this todo proposed was: remove a key that costs nothing at runtime, in exchange for
a hard gate failure. The catalog was restored immediately (`git checkout`, 0 changes left).

`requiredPluralKeys`' own header already states the conclusion — *"a `ja`-shaped locale only gets
`_one`/`_other` — the ja `_one` is a harmless dead key i18next never asks for"* — so no code
comment needed adding; the documentation was there before this todo was written and simply was
not read.

## What was actually true

Only the premise: `Intl.PluralRules('zh-Hans')` really does have just `other`, so `_one` really
is unreachable at runtime. That is the intended, documented state, not a defect.

## The transferable lesson

The filing ran a CLDR check and stopped there. It never asked **why the key was present**, and
the answer was one function and one comment away in a file the todo itself listed under `files:`.
A "dead key" is only dead once you have checked what else reads it — here, a lint gate did.
