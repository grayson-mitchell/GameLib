---
created: 2026-09-21T00:00:00.000Z
title: "br and sl ship with gamepage.json AND translation.json entirely absent; uz is missing login.json"
area: i18n
severity: minor
platform: any
ready: human
found_by: "quick-260922-8xv"
files:
  - public/locales/br
  - public/locales/sl
  - public/locales/uz
---

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
Both are already selectable, both already have `gamelib.json` (the fork-owned namespace) filled, and
the English fallback renders correctly. The open call is between:

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
