---
created: 2026-09-21T00:00:00.000Z
title: "15 gamepage.json locales carry wikiLink present but empty, not absent -- falls back to English; br/sl have no gamepage.json at all"
area: i18n
severity: minor
platform: any
ready: human
found_by: "quick-260921-rmj"
files:
  - public/locales/az/gamepage.json
  - public/locales/bs/gamepage.json
  - public/locales/eu/gamepage.json
  - public/locales/fa/gamepage.json
  - public/locales/he/gamepage.json
  - public/locales/hr/gamepage.json
  - public/locales/ka/gamepage.json
  - public/locales/ko/gamepage.json
  - public/locales/ml/gamepage.json
  - public/locales/ro/gamepage.json
  - public/locales/sk/gamepage.json
  - public/locales/sr/gamepage.json
  - public/locales/th/gamepage.json
  - public/locales/uz/gamepage.json
  - public/locales/zh_Hant/gamepage.json
---

## Observed / Measured

This is a re-filed, corrected sibling of the finding in
`.planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md`
("Separate, deliberately-untouched pre-existing condition" paragraph). That paragraph originally
said 15 locales have "no `wikiLink` key at all in `gamepage.json`". **That claim is wrong about its
mechanism.** Re-measured here with a Python sweep over every directory in `public/locales/`,
bucketing each `gamepage.json` by its `wikiLink` field:

```
total locale dirs: 49

wikiLink KEY ABSENT:            0 locales
wikiLink PRESENT but == "":    15 locales
no gamepage.json FILE at all:   2 locales
wikiLink PRESENT and non-empty:32 locales
                                --
                                49
```

**Corrected mechanism:** the `wikiLink` key is PRESENT in all 47 `gamepage.json` files that exist,
but for 15 of them its value is an empty string `""`, not absent. The *effect* the original todo
described is still real -- these 15 locales fall back to rendering English -- but the reason is
i18next's own empty-string handling: both the app and this repo's test harness initialise i18next
with `returnEmptyString: false`, so a present-but-empty catalog value is treated the same as a
missing one and the `fallbackLng: 'en'` chain takes over.

**The 15 locales, present but empty:**
`az`, `bs`, `eu`, `fa`, `he`, `hr`, `ka`, `ko`, `ml`, `ro`, `sk`, `sr`, `th`, `uz`, `zh_Hant`.

**A third condition the original todo missed entirely:** `br` and `sl` have no
`public/locales/*/gamepage.json` file at all -- not an empty key, not a present key, no file. These
two locales necessarily fall back to English for every key in the `gamepage` namespace, not just
`wikiLink`.

**Zero locales are byte-identical-to-`en`** for this key across the full 49-locale sweep -- every
non-empty value is either English's real key text or an actual translation.

## Why nothing in CI is watching this

`pnpm lint-translations` checks all four namespaces (`gamelib`, `gamepage`, `login`, `translation`),
but only `gamelib` is listed in `FORK_OWNED_NAMESPACES` and only `gamelib` has a presence baseline
(`meta/lintTranslations.ts:413-424` states this in source). It does not fail on an empty `gamepage`
value the way it would on a missing `gamelib` one. So this condition currently has no gate.

## Not the same defect as the fr malformed-entity finding

This is NOT the `fr` malformed-`&nbsp;`-entity defect fixed by `quick-260921-rmj` (see the sibling
completed todo). That was one locale with a structurally broken entity and stale English link text
in an otherwise-present, otherwise-correct value. This finding is a different condition -- an empty
value, in 15 different locales, that was never translated at all -- and must not be conflated with
it.

## Why this stays `ready: human`

Closing it needs 15 real human translations of the `wikiLink` string (see
`public/locales/en/gamepage.json`'s `wikiLink` value for the English source text), not a code
change. `severity: minor` because the fallback renders correct, readable English -- nothing is
broken, corrupted, or lost; it is a completeness gap, not a defect with live consequences.

## Related

- `.planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md` -- the
  sibling finding this re-files, corrected at its own "Separate, deliberately-untouched pre-existing
  condition" paragraph.
- `quick-260921-rmj` -- the plan that repaired the `fr` malformed entity and re-measured this census.
