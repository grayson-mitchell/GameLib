---
created: 2026-09-20T00:00:00.000Z
title: "French gamepage.json wikiLink carries a malformed &nbsp entity and untranslated link text -- shouldUnescape cannot fix it"
area: i18n
severity: medium
platform: any
ready: human
found_by: "quick-260921-k2d"
files:
  - public/locales/fr/gamepage.json
---

## Observed / Measured, with codepoints

`public/locales/fr/gamepage.json`'s `wikiLink` value, read with Python's `json.load` (not eyeballed
in an editor, which would not distinguish the codepoints below):

```
Information importante au sujet de ce jeu, lisez ceci<U+00A0>: &nbsp<U+202F>;<1>Open page</1>
```

Two distinct defects live in this one string:

1. **A malformed HTML entity.** Instead of a well-formed `&nbsp;`, the value carries a literal
   `&nbsp`, then a narrow no-break space (`U+202F`), then a bare `;`. `260921-k2d`'s fix adds
   `shouldUnescape` to `GamePage/index.tsx`'s `<Trans>`, and that flag decodes a *well-formed*
   `&nbsp;` entity for every other locale -- but it has nothing to decode here, because the entity
   itself is broken. So **French still renders a visible `&amp;nbsp ;`** (the escaped, malformed
   sequence) even after that fix ships.
2. **The link text is still untranslated English.** The `<1>...</1>` segment reads `Open page`,
   not a French translation.

**Not part of the defect:** the `U+00A0` immediately before the colon (`ceci<U+00A0>:`) is correct
French typography (a non-breaking space before a colon is standard French style) and must not be
"corrected" away by whatever eventually fixes this.

## Why this was not fixed in `260921-k2d`

`REQ-34.8-04`'s response to any churn under `public/locales/` is `git checkout -- public/locales/`,
never a hand-edit. `260921-k2d`'s scope was locked to the three `<Trans>` attributes on
`GamePage/index.tsx` plus its explanatory comment -- it could not and did not touch this file.
`git status --porcelain public/locales/` was confirmed empty at that task's completion.

## Candidate repair routes, with their known traps named

These are presented as constraints to check, not as a prescribed fix -- this repo has a recorded
lesson that a todo's prescribed fix going stale is itself a pattern to avoid.

- **Re-namespace `wikiLink` into the fork-owned `gamelib` namespace.** This is the shape the churn
  guard permits (it is the route `260919-u23` took for `SideloadDialog`'s import hint), but that
  task needed a 48-locale fill to do it safely. Known traps recorded elsewhere in this repo that
  would apply again here: a bulk namespace sweep can strand key pins invisibly in other files;
  removing a locale key has three separate traps (the resulting count lands on 47, not 49, and the
  `da`/`id`/`nl` locales specifically break); and `machine-fill-gamelib` is dead when run under a
  gateway-scoped key. Any repair route through `gamelib` must check all three before assuming the
  tooling will do the fill safely.
- **Hand-repair just the `fr` entry via the normal translation-update path**, whatever that is for
  this repo's catalogs (not `git checkout --`, and not a raw JSON hand-edit that bypasses whatever
  review/tooling exists for catalog changes) -- needs a decision on what that path actually is
  before anyone touches the file.
- Either route still needs an actual French translation of "Open page", which this task has no
  source for.

`ready: human` because this needs both a real French translation and a decision about which repair
route is acceptable for a churn-guarded catalog -- not something to resolve by editing code.

## Related

- `quick-260921-k2d` (this finding's origin) -- see its corrected todo at
  `.planning/todos/completed/2026-09-19-gamepage-wikilink-trans-uses-key-not-i18nkey.md`.
- **Separate, deliberately-untouched pre-existing condition -- CORRECTED at closing time
  (`quick-260921-rmj`).** This paragraph originally claimed 15 locales have "no `wikiLink` key at
  all in `gamepage.json`". That claim was wrong about its mechanism. Re-measured across all 49
  locale dirs at closing time: the key is PRESENT but carries an empty string `""` in 15 locales
  (`az`, `bs`, `eu`, `fa`, `he`, `hr`, `ka`, `ko`, `ml`, `ro`, `sk`, `sr`, `th`, `uz`, `zh_Hant`),
  and a third, previously-unnamed condition exists: `br` and `sl` have no `gamepage.json` file at
  all. The *effect* is the same as originally described -- these locales fall back to English,
  because i18next is initialised with `returnEmptyString: false` -- but "no key" and "empty-string
  key" are different mechanisms, and `br`/`sl` are a third condition, not a fourth entry in the
  15. The corrected finding, with the full re-measured census, is re-filed as its own pending todo
  at `.planning/todos/pending/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md` -- this
  paragraph is deliberately not the last word on that condition; read the new todo for the current
  state. It is not this todo's problem and must not be conflated with the `fr` malformed-entity
  defect above.

## Closing note (`quick-260921-rmj`)

The `fr` malformed entity and untranslated link text described above are both fixed: the value now
reads (Python escape notation)
`"Information importante au sujet de ce jeu, lisez ceci :&nbsp;<1>Ouvrir la page</1>"` -- a
well-formed `&nbsp;` entity and a real French translation of the link text. The U+00A0 before the
colon was left unchanged, as this todo specified. `wikiLinkTrans.realI18next.test.ts`'s A4
assertion was widened from an exact-string match against German only to a family match
(`not.toMatch(/&amp;nbsp/)`) run over `['de', 'fr']`, and proven by mutation: RED against the
restored pre-fix value, GREEN against the repair.

The `gamelib` re-namespace route named above as a candidate repair was considered and **REJECTED**
as disproportionate -- it would mean deleting a key from 49 locale files and back-filling 48 to fix
one malformed entity in one locale, and it carries three separately-recorded traps: a bulk
namespace sweep can strand key pins invisibly in other files; removing a locale key lands on 47,
not 49, and specifically breaks `da`/`id`/`nl`; and `machine-fill-gamelib` is dead when run under a
gateway-scoped key. The hand-edit route was used instead, following the settled precedent that
hand-editing a legacy (not upstream-owned, see CLAUDE.md) catalog file is an established, previously
shipped-green pattern (`474c26c02`, `a9436fa9d`).
