---
created: 2026-09-21T00:00:00.000Z
title: "br and sl ship with gamepage.json AND translation.json entirely absent; uz is missing login.json"
area: i18n
severity: minor
platform: any
ready: human
found_by: "quick-260922-8xv"
resolved_by: "quick-260922-9j0"
resolution: "not-a-defect -- the locales are unreachable, and the option this asked for was already shipped"
files:
  - public/locales/br
  - public/locales/sl
  - public/locales/uz
---

## Resolution (`quick-260922-9j0`, 2026-09-21)

**Closed without a source change. The premise below is false, and the open call was already
decided before this was filed.**

`br` and `sl` are not selectable, and never have been. Every language list in the repo carries the
same 43 codes, and none of them contains `br`, `sl` or `uz`:

```
src/frontend/index.tsx          supportedLngs        43
src/common/languages.ts         supportedLanguages   43
LanguageSelector/index.tsx      languageLabels       43
LanguageSelector/index.tsx      languageFlags        43
public/locales/ directories     49

all four lists agree exactly; dirs in NO list: br, da, ka, sl, th, uz
```

No other path reaches them. `index.tsx:148-152` registers only `Backend` and `initReactI18next` --
`i18next-browser-languageDetector` is named in a comment on line 151 and is never `.use()`d, so
there is no auto-detection; `lng` comes from `configStore`/`localStorage` defaulting to `'en'`.
And `supportedLngs` refuses the code even when stored, verified against the repo's own installed
i18next:

```
lng:'br' with supportedLngs excluding 'br'
  resolvedLanguage      -> undefined
  languages hierarchy   -> ["en"]
  isSupportedCode('br') -> false
```

The hierarchy is `["en"]`, so **the `br`/`sl` catalogs are never requested at all**. The two
missing namespaces have no user-visible effect -- and neither do the two namespaces that *are*
present, since the locale is never resolved. The claim below that they "fall back to English for
every key in two whole namespaces" describes a mechanism that is not running: nothing falls back,
because nothing is loaded.

**Why the directories exist.** `br`, `sl` and `uz` have never appeared in a language list --
`git log -S"'sl',"` and `-S"'uz',"` over `index.tsx` and `common/languages.ts` return zero commits
across all history. The directories come from upstream Heroic's Weblate sync (`[i18n] Updated
Translations` #5098, #5583), which creates a directory as soon as a translator starts a language
whether or not the app offers it. `3b3d813f2` later machine-filled `gamelib.json` across "48
locales" by directory listing, which is how these two ended up holding a fork-owned namespace
while holding no upstream ones.

**On the three options below:**

1. *Fill via the MT path* -- rejected. It authors 2,382 strings (1,191 keys x 2 locales) that
   `supportedLngs` guarantees are never fetched, and adds them to the unreviewed-MT population
   that `2026-09-03-all-10032-non-english-fork-strings-are-unreviewed-machine-translation.md`
   is already open about. Measured-zero benefit.
2. *Leave them falling back* -- right outcome, wrong mechanism. Adopting its wording would leave a
   false explanation on record, which is what this resolution rewrites.
3. *Drop `br`/`sl` from the offered language list* -- **already shipped, and always was.** They
   were never in it. There was no change to make.

`ready: human` was defended in the original text as "meant literally". It was not: the choice it
described was already made, and the evidence that makes it was three parsed files and one
`i18next.init()` away. See `[[ready-human-is-often-a-rotten-blocker]]`.

Two residual findings were filed rather than fixed here -- see **Related** below.

---

## Original report (premise corrected above -- retained as filed)

## Observed / Measured

Measured during `quick-260922-8xv` by listing every locale directory's namespace files and diffing
against a complete one (`de`):

```
br   ['gamelib.json', 'gamelib.mt.json', 'login.json']
sl   ['gamelib.json', 'gamelib.mt.json', 'login.json']
de   ['gamelib.json', 'gamelib.mt.json', 'gamepage.json', 'login.json', 'translation.json']

missing vs de:
  br: gamepage.json, translation.json
  sl: gamepage.json, translation.json
  uz: login.json
  en: gamelib.mt.json   <- correct by design, en is the MT source, not a target
```

So `br` and `sl` fall back to English for **every key in two whole namespaces**, not for one key.
`uz` does the same for the `login` namespace. `en` missing `gamelib.mt.json` is expected and is not
part of this finding.

## Why this is filed rather than fixed

`quick-260922-8xv` filled one key in 15 locales. This is a different size and a different shape: a
whole-namespace fill for two locales, where `translation.json` is the largest catalog in the repo.
The precedent that task leaned on (hand-editing a legacy catalog value, `474c26c02`, `a9436fa9d`,
`d466a141d`) is a precedent for editing an existing value, not for authoring two entire catalogs.

## The decision this needs before any code

Not "write the translations" -- **whether `br` and `sl` should carry these namespaces at all.**
Both are already selectable, both already have `gamelib.json` (the fork-owned namespace) filled,
and the English fallback renders correctly. The open call is between:

1. Fill via the existing machine-translation path, if one can be pointed at a legacy namespace at
   all -- note `machine-fill-gamelib` is scoped to `gamelib` by name and is separately recorded as
   dead when run under a gateway-scoped key.
2. Leave them falling back, and accept it as the documented state of two partially-supported
   locales.
3. Drop `br`/`sl` from the offered language list until they are complete.

`ready: human` is meant literally here and is not the rotted-rationale shape that
`.planning/todos/completed/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md` turned out
to be: that one was blocked on producing translation text, which is exactly what `260922-8xv` then
did. This one is blocked on choosing between three outcomes with different costs, one of which is
"do nothing, deliberately".

## Related

- `.planning/todos/completed/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md` -- named
  `br`/`sl` as its third, out-of-scope condition. This is that condition, measured properly.
- `.planning/todos/pending/2026-09-03-all-10032-non-english-fork-strings-are-unreviewed-machine-translation.md`
  -- the standing question about translation provenance that option 1 above would add to.
- `.planning/todos/pending/2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md`
  -- residual 1, filed by `260922-9j0`.
- `.planning/todos/pending/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md`
  -- residual 2, filed by `260922-9j0`; the mechanism that produced this finding.
