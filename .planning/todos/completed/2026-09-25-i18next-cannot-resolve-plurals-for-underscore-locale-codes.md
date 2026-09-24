---
created: 2026-09-25T00:00:00.000Z
title: "i18next's PluralResolver cannot resolve plural forms for nb_NO/pt_BR/zh_Hans/zh_Hant -- the underscore-named locale directories this app actually ships"
area: i18n
status: resolved
severity: major
platform: any
ready: code
found_by: "Quick task 260925-88h (2026-09-25), while writing a cross-check test for meta/machineFillGamelib.ts's new per-locale CLDR plural expansion (meta/__tests__/machineFillGamelib.test.ts, describe block 'pluralCategoriesFor cross-checked against the real i18next pluralResolver')"
files:
  - src/frontend/index.tsx
  - node_modules/i18next/dist/cjs/i18next.js
  - public/locales/nb_NO/
  - public/locales/pt_BR/
  - public/locales/zh_Hans/
  - public/locales/zh_Hant/
---

# RESOLVED 2026-09-24 by quick-260925-bq4

Fixed and pushed: `a27bed9a8` (fix), `44d6401e8` (tests), `c5a666b31` (record), `7d814bc05`
(spin-off todo closed). Record:
`.planning/quick/260925-bq4-fix-i18next-plural-resolution-for-underscore/260925-bq4-SUMMARY.md`.

**What was done.** Direction 1 (rename the directories) was rejected for exactly the reason this
todo gave -- a stored `language: "pt_BR"` would stop matching a real directory. Direction 2 was
taken in its "convert before delegating" form, but at the APP boundary rather than by overriding
i18next internals: `toI18nextCode` going in, `toShippedLanguage` coming back out
(`src/common/languages.ts`), with `i18nextLanguageOptions()` returning `lng` and `supportedLngs`
together so the two init sites cannot drift.

**Scope was wider than this todo anticipated.** It named `src/frontend/index.tsx` only. The fix
also had to cover the sidecar init, BOTH `changeLanguage` paths (a runtime language switch would
otherwise re-break resolution), and two places where `i18n.language` flows back OUT into
surfaces keyed by the shipped code. One of those, `getLocaleSettings`, would have silently
flipped Brazil from BR/BRL to PT/EUR.

**Also corrected here: this todo's severity reasoning was right but its symptom was understated.**
It predicted plural lookups would "silently fail ... render wrong (or fall back to
English/blank)". Measured, the outcome is specifically the third: i18next recomputes the suffix
for `en` further down the fallback chain and returns real ENGLISH TEXT. Not blank, not a key --
the English string, which is why nothing ever noticed.

**Close condition met.** Per this todo's own Verification section, the `toBe('')` pin in
`meta/__tests__/machineFillGamelib.test.ts` has been updated: the
`I18NEXT_CANNOT_RESOLVE_UNDERSCORE_CODE` exception set is gone and all 48 non-en locales now run
the same strict cross-check, fed through `toI18nextCode(dir)`. The empty-suffix assertion survives
as a deliberate NEGATIVE CONTROL -- upstream i18next is still unfixed, and pinning that is what
stops the conversion being dismissed as redundant later.

## Original report follows

# i18next cannot resolve plural forms for four of this app's locale codes

## The defect, measured directly against this repo's own dependency

`i18next`'s `PluralResolver.getRule(code)` calls `new Intl.PluralRules(code, ...)` with the RAW
`lng` code it was given (`node_modules/i18next/dist/cjs/i18next.js:1218`). It never converts an
underscore-separated code to the dash-separated BCP-47 form `Intl.PluralRules` requires, and
`formatLanguageCode` (`i18next.js:909-931`) only ever splits on `-` -- an underscore-containing
code falls through unchanged.

Four of this app's locale **directories** are named with an underscore: `nb_NO`, `pt_BR`,
`zh_Hans`, `zh_Hant`. `loadPath: 'locales/{{lng}}/{{ns}}.json'` (`src/frontend/index.tsx:129`)
feeds the directory name straight through as the i18next `lng`. So today, for a user on any of
these four languages:

```
new Intl.PluralRules('nb_NO')   // throws RangeError -- invalid tag
```

i18next catches the throw, logs `no plural rule found for: nb_NO`, and `getSuffix` returns `''`
(the empty string) for every count. Measured directly with a bare Node repro and confirmed inside
`meta/__tests__/machineFillGamelib.test.ts`'s cross-check, which documents this exact set as a
`toBe('')` regression pin rather than silently special-casing it away.

## Why this is `major`, not `minor`

An empty suffix means i18next looks up the key with NO plural suffix -- for any i18next-v4
plural-suffixed key (`_one`/`_other`/...), that bare key never exists in the catalog, so plural
resolution silently fails for these four locales specifically. This is **already live** today:
`public/locales/en/translation.json` ships 4 English `_one`/`_other` pairs (upstream Heroic
catalog), so any UI string using one of those keys already renders wrong (or falls back to
English/blank) for `nb_NO`/`pt_BR`/`zh_Hans`/`zh_Hant` right now, independent of this task.

It is about to become MORE consequential: quick task 260925-88h (this todo's own `found_by`)
introduces the FIRST plural keys in the fork-owned `gamelib` namespace
(`box.error.install.stalled`, `humbleKeys.cooldown`, `humbleKeys.urgencyDaysLeft`, etc.) --
`meta/machineFillGamelib.ts`'s own plural-category logic (`pluralCategoriesFor`) correctly
computes CLDR categories for these four locales by mapping the underscore to a dash internally,
so the FILL will still write correct `_one`/`_other` catalog entries for them -- but the RUNNING
APP will never be able to select them, because i18next's OWN plural resolution is broken for
these four codes independent of what the catalog contains.

## Why this was not fixed as part of 260925-88h

Out of scope per CLAUDE.md's scope boundary: "Only auto-fix issues DIRECTLY caused by the current
task's changes... pre-existing warnings/failures in unrelated files are out of scope." This defect
predates 260925-88h (proven by the `translation.json` evidence above) and fixing it is not a
mechanical patch -- see Direction below.

## Direction -- not a one-line fix

1. **Do NOT just rename the four directories to dash form** (`nb-NO`, `pt-BR`, `zh-Hans`,
   `zh-Hant`) without auditing every place a locale code is used as a literal string: the
   `loadPath` template, `supportedLngs`, `LanguageSelector`'s language-code-to-label map, any
   `configStore.get('language')` stored value already on a user's disk, and any test fixture that
   pins the underscore form. A bare rename risks breaking existing users' saved language
   preference (stored value would no longer match a real directory).
2. **A `load: 'currentOnly'` + custom `languageUtils.formatLanguageCode` override**, or a custom
   `services.pluralResolver` wrapper that dash-converts before delegating, are both plausible
   fixes that stay backward-compatible with the underscore-named directories and any
   already-stored user preference. Neither has been attempted or measured yet.
3. **Verify the fix, don't just assert it**: re-run this todo's own reproduction --
   `new Intl.PluralRules('nb_NO')` still throws today; the fix should make an equivalent in-app
   check (e.g. `i18next.services.pluralResolver.getSuffix('nb_NO', 3)`) return a real `_`-prefixed
   suffix, not `''`.

## Verification

- From Node, with the `i18next` package this repo ships: `new Intl.PluralRules('nb_NO')` throws
  `RangeError: Incorrect locale information provided`.
- `i18next.services.pluralResolver.getSuffix('nb_NO', 1)` (after `i18next.init({ lng: 'en',
  resources: {} })`) returns `''`, not `'_one'`. Same for `pt_BR`, `zh_Hans`, `zh_Hant`.
- `meta/__tests__/machineFillGamelib.test.ts`'s `pluralCategoriesFor cross-checked against the
  real i18next pluralResolver` suite documents exactly this set with a `toBe('')` assertion --
  when this todo is resolved, that assertion (and its accompanying comment) needs updating to
  assert the CORRECT suffix instead, at which point this todo closes.
