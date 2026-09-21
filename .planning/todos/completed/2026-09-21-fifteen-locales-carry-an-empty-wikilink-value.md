---
created: 2026-09-21T00:00:00.000Z
completed: 2026-09-21T00:00:00.000Z
title: "15 gamepage.json locales carry wikiLink present but empty, not absent -- falls back to English; br/sl have no gamepage.json at all"
resolved_by: "quick-260922-8xv"
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

## Closing note (`quick-260922-8xv`) -- and a correction to "Why this stays `ready: human`"

**All 15 values are filled** (`ecbfa3a1b`). The census above reproduced exactly at task start
(49 dirs / 0 absent / 15 empty / 2 file-less / 32 non-empty) and re-runs clean: `0` locales still
carry an empty `wikiLink`, and `pnpm lint-translations` reported 15 findings naming
`gamepage.wikiLink` before the change and 0 after.

**The `ready: human` section above was wrong, and its own sibling is the proof.** It argued that
closing this "needs 15 real human translations ... not a code change". The `fr` sibling
(`.planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md`) was
filed `ready: human` on the identical grounds -- "still needs an actual French translation of
'Open page', which this task has no source for" -- and was then closed by `quick-260921-rmj`
writing a real French translation into the catalog by hand, recording the route as settled
precedent (`474c26c02`, `a9436fa9d`). Filing a translation gap as `ready: human` when the
established route through it is a hand-edit parks work that is desk-ready.

Each value follows the catalog's established shape, `<sentence>:&nbsp;<1><link text></1>`, with no
space between colon and entity, and terminology matched per locale against that file's own
`submenu.store` / `info.clickToOpen` values (`sr` Cyrillic, `uz` Latin, per each file's existing
script).

**Verified by rendering, not by reading the diff** (`1915c19a5`): A4/A5 in
`wikiLinkTrans.realI18next.test.ts` now run over 17 named locales instead of 2, and a new A6 pins
each locale's own `<1>` link text. A6 exists because **A3 cannot see this defect** -- an empty
value does not fall through to the element's English children, it resolves up the `fallbackLng`
chain to the real English catalog text, so A3/A4/A5 stay green while the user reads English.
Proven by mutation in both directions: re-emptying `sk` failed A6 alone with A4/A5 green;
re-breaking `ko`'s entity failed A4 alone with A6 green.

Both out-of-scope conditions named in the plan were filed, not dropped:

- `.planning/todos/pending/2026-09-21-br-and-sl-ship-with-two-whole-namespaces-missing.md` -- the
  `br`/`sl` condition, re-measured: they are missing `translation.json` as well as `gamepage.json`,
  and `uz` is additionally missing `login.json`.
- `.planning/todos/pending/2026-09-21-seven-locales-carry-a-degraded-non-empty-wikilink-value.md`
  -- 7 of the 32 non-empty values are degraded (`ar`/`gl` space before entity, `pt_BR` English link
  text, `ga`/`sv`/`vi` no entity, `ta` `& nbsp;`), and measurement shows the widened gate catches
  only 3 of the 7.

## Related

- `.planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md` -- the
  sibling finding this re-files, corrected at its own "Separate, deliberately-untouched pre-existing
  condition" paragraph.
- `quick-260921-rmj` -- the plan that repaired the `fr` malformed entity and re-measured this census.
