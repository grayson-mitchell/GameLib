---
created: 2026-09-21T00:00:00.000Z
title: "7 locales carry a degraded but non-empty gamepage wikiLink -- and the widened render gate only catches 3 of them"
area: i18n
severity: minor
platform: any
ready: code
found_by: "quick-260922-8xv"
files:
  - public/locales/ar/gamepage.json
  - public/locales/ga/gamepage.json
  - public/locales/gl/gamepage.json
  - public/locales/pt_BR/gamepage.json
  - public/locales/sv/gamepage.json
  - public/locales/ta/gamepage.json
  - public/locales/vi/gamepage.json
  - src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
---

## Observed / Measured

Found while censusing the other 32 non-empty `wikiLink` values during `quick-260922-8xv` (which
filled the 15 empty ones). Run the same validator the 15 new values pass -- one well-formed
`&nbsp;`, no whitespace before it, exactly one `<1>...</1>` pair, unpadded and non-English inner
text -- across every non-`en` locale that has a non-empty value, and 7 of the 32 fail:

| locale  | defect                                     | value (Python repr, abridged)                     |
| ------- | ------------------------------------------ | ------------------------------------------------- |
| `ar`    | space before the entity                    | `... اقرأ هذا: &nbsp;<1>افتح الصفحة</1>`          |
| `gl`    | space before the entity                    | `... lee esto: &nbsp;<1>Abrir páxina</1>`         |
| `pt_BR` | link text still English                    | `... leia isto:&nbsp;<1>Open page</1>`            |
| `ga`    | entity absent entirely                     | `... léigh seo:<1>Oscail an leathanach</1>`       |
| `sv`    | entity absent entirely                     | `... läs detta:<1>Öppna sida</1>`                 |
| `vi`    | entity absent, plain space instead         | `... hãy đọc phần này: <1>Mở trang</1>`           |
| `ta`    | `& nbsp;` (spaces inside) + padded `<1>`   | `... படியுங்கள்: & nbsp; <1> திறந்த பக்கம் </1>` |

`ar`/`gl` are the exact defect `1fbbbcf2c` fixed in `fr`. `ta` is the same *class* as the `fr`
malformed entity closed by `quick-260921-rmj`, one layer worse -- the entity is split by literal
spaces, so it renders as visible `&amp; nbsp;` text.

## The part worth reading: the gate sees only 3 of the 7

`quick-260922-8xv` widened `wikiLinkTrans.realI18next.test.ts`'s A4/A5 to 17 named locales and
added A6. **Measured, not predicted** -- the 7 above were temporarily added to `FILLED_LOCALES`
and the suite run:

```
✕ A5 (locale: ar)      doubled whitespace
✕ A5 (locale: gl)      doubled whitespace
✕ A6 (locale: pt_BR)   link text is English
Tests: 3 failed, 71 passed, 74 total
```

`ga`, `sv`, `vi` and `ta` **all pass**, against values that are visibly wrong:

- A missing entity produces no mojibake and no doubled whitespace -- the sentence simply runs into
  the link with no separating space at all (`ga`, `sv`), or with one ordinary space that is
  indistinguishable from the decoded entity (`vi`). Nothing above looks for a *required* space.
- `ta`'s `& nbsp;` does not match A4's `/&amp;nbsp/` because of the space after the ampersand, and
  its padded `<1> ... </1>` passes A6 because A6 renders the padding through and then looks for it.

So do not read the widened gate as covering this todo. Whoever fixes these values should decide
whether A4/A5/A6 grow a positive assertion (exactly one decoded space between the colon and the
link) rather than only the three negative ones, since it is the negative shape that lets four of
these seven through.

## Deliberately not fixed by `260922-8xv`

The todo that task closed
(`.planning/todos/completed/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md`) states
that the empty-value class "must not be conflated" with the malformed-entity class. These 7 are the
malformed class. Filing rather than folding them in keeps that separation, and keeps the census
above as its own measurement instead of a footnote in a commit that was about something else.

## Related

- `.planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md` -- the
  same defect class in `fr`, with the repair precedent and the `U+00A0`-before-colon caveat that
  applies to `fr` only and must not be generalised to these seven.
- `quick-260922-8xv` -- the census's origin.
