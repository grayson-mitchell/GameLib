---
quick_id: 260922-9j0
slug: close-br-sl-uz-namespace-todo-unreachable
created: 2026-09-21
description: "Close the br/sl/uz missing-namespace todo: its premise is false, the locales are unreachable by construction, and its open call was already decided"
resolves_todo: .planning/todos/pending/2026-09-21-br-and-sl-ship-with-two-whole-namespaces-missing.md
---

# Quick Task 260922-9j0 — the todo's three options were moot before it was filed

## The todo's premise is false in its first clause

The todo (filed by `260922-8xv`) frames a decision between three outcomes, and grounds all three on
this sentence:

> Both are already selectable, both already have `gamelib.json` (the fork-owned namespace) filled,
> and the English fallback renders correctly.

**"Both are already selectable" is false.** `br` and `sl` — and `uz`, and three locales the todo
never mentions — are absent from every language list in the repo. Measured by brace-matched parse,
not by grep:

```
src/frontend/index.tsx          supportedLngs          43 codes
src/common/languages.ts         supportedLanguages     43 codes
LanguageSelector/index.tsx      languageLabels         43 codes
LanguageSelector/index.tsx      languageFlags          43 codes
public/locales/                 directories            49

all four lists agree exactly (0 symmetric difference)
dirs in NO list: br, da, ka, sl, th, uz
```

So the offered set is 43 and the shipped set is 49. The six extra directories are not "partially
supported locales" — they are **not offered at all**.

## There is no other path to them either

Two ways a user could otherwise land on `br`: auto-detection, or a hand-edited stored config.
Neither exists.

**No detector is registered.** `src/frontend/index.tsx:148-152` `.use()`s only `Backend` and
`initReactI18next`. `i18next-browser-languageDetector` appears in a *comment* on line 151 and is
never used — a live grep for `.use(` returns exactly those two. `lng` comes from
`configStore`/`localStorage`, defaulting to `'en'` (`index.tsx:130-131`).

**`supportedLngs` refuses the code even if it is stored.** Proven by running the repo's own
installed i18next rather than by citing docs:

```
lng:'br', supportedLngs excluding 'br'
  resolvedLanguage             -> undefined
  languages hierarchy          -> ["en"]
  isSupportedCode('br')        -> false
  isSupportedCode('de')        -> true
```

The hierarchy is `["en"]`, so the `br` catalogs are **never requested**. The missing
`gamepage.json` and `translation.json` cannot produce a user-visible effect, because the present
`gamelib.json` and `login.json` are never loaded either.

This also corrects the todo's other clause: there is no "fall back to English for every key in two
whole namespaces". Nothing falls back. The locale is never resolved.

## Why the directories exist: Weblate seeds them, the app never adopts them

`br`, `sl` and `uz` have **never** appeared in a language list — `git log -S"'sl',"` and
`-S"'uz',"` over `index.tsx` and `common/languages.ts` return zero commits in all of history. The
directories arrive from upstream Heroic's Weblate sync (`[i18n] Updated Translations` #5098,
#5583), which creates a directory the moment a translator starts a language, independent of
whether the app offers it. `3b3d813f2` then machine-filled `gamelib.json` across "48 locales" by
directory listing, which is how `br`/`sl` came to hold a fork-owned namespace while holding no
upstream ones.

## Resolving the open call

The todo asks to choose one of three. The evidence decides it without a judgement call:

1. **Fill via the MT path — rejected.** It would author two catalogs that `supportedLngs`
   guarantees are never fetched, and would add 2,382 unreviewed machine-translated strings (1,191 keys × 2 locales) to the
   very population `2026-09-03-all-10032-non-english-fork-strings-are-unreviewed-machine-translation.md`
   is open about. Cost with a measured-zero benefit.
2. **Leave them falling back — closest, but misdescribed.** The outcome is right; the mechanism in
   the todo's wording is wrong, so adopting it verbatim would leave a false explanation on record.
3. **Drop `br`/`sl` from the offered language list — already shipped, and always was.** They were
   never in it. There is no change to make.

So the answer is 3, already true. The todo is closed as resolved-on-measurement, with the record
corrected. **No source file changes.**

## Tasks

- **T1** — Rewrite the todo with the measurement that moots it and move it to `completed/`.
- **T2** — File the two residual findings this uncovered, neither in the todo's scope:
  - six locale directories (~532K) ship into the Tauri bundle unreachable, four of them largely
    empty (`ka` 657/812 keys empty, `th` 749/810, `uz` 395/841, `da` 100/892);
  - the same 43 codes are hand-maintained in four places across three files with no gate, and
    `index.tsx` re-declares the list instead of importing the `common/languages.ts` constant that
    already exists — so a locale added to `public/locales/` is silently never offered, which is
    exactly how these six arose.
- **T3** — Update STATE.md's Quick Tasks table.
