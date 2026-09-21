---
created: 2026-09-19T00:00:00.000Z
completed: 2026-09-20T00:00:00.000Z
title: "GamePage's wikiLink <Trans> passes key= instead of i18nKey=, so its 31 translated copies are dead"
area: i18n
severity: minor
platform: any
ready: code
found_by: "quick-260919-u23"
resolved_by: "quick-260921-k2d"
files:
  - src/frontend/screens/Game/GamePage/index.tsx
---

## Observed

`GamePage/index.tsx:452` writes:

```tsx
<Trans key="wikiLink" i18n={i18n}>
  Important information about this game, read this:&nbsp;
  <Link to={knownFixes.wikiLink}>Open page</Link>
</Trans>
```

`key` is React's reserved reconciliation prop — `Trans` never sees it in its own props, so there
is no `i18nKey` to look up, and the component falls through to rendering its inline English
`children` in every locale.

Found while fixing the identical defect in `SideloadDialog` (`quick-260919-u23`). Filed separately
rather than bundled, matching `260919-9gu`'s refusal to widen scope mid-task.

## Measured

- The key **does** resolve: `wikiLink` exists in `public/locales/en/gamepage.json` as
  `"Important information about this game, read this:&nbsp;<1>Open page</1>"`.
- **31 non-English locales carry a non-empty translation** of it (counted by parsing every
  `public/locales/*/gamepage.json`, not by grep). All 31 were dead before this fix.

## Correction — "probably a genuine one-line fix" was HALF wrong

This section originally claimed the fix would be a one-line prop rename with "no catalog change
at all." **`quick-260921-k2d` measured, by actually rendering through a real i18next instance
against the real catalogs, that this was only half right.**

- **The "no catalog change" half was correct, and was honoured.** Fixing this needed **zero**
  edits under `public/locales/` — `git status --porcelain public/locales/` was confirmed empty
  when `260921-k2d` closed.
- **The "one-line fix" half was wrong.** The fix needed **three** attributes, not one:
  `i18nKey="wikiLink"`, `ns="gamepage"`, **and** `shouldUnescape`. The catalog's `wikiLink` value
  stores a literal `&nbsp;` HTML entity. Adding only `i18nKey` and `ns` renders that entity
  *escaped* — the user visibly sees the seven characters `&nbsp;` in the sentence, in every one of
  the 31 locales. That is a regression traded for the original defect, not a fix. `shouldUnescape`
  is the react-i18next flag that decodes it.

  **A diff review could not have caught this.** The two-attribute version and the three-attribute
  version produce diffs that both look plausible and complete; the missing third attribute has no
  type error, no lint warning, and no runtime error — only a visibly wrong rendered string under a
  non-English locale. This is the same failure shape the "Why this one is probably a genuine
  one-line fix" framing itself warned about for `ns`, just one layer deeper than it anticipated.

- **The accepted trade, stated explicitly.** `shouldUnescape` decodes `&nbsp;` to an ordinary space
  (`U+0020`), not a true non-breaking space (`U+00A0`). The original JSX `&nbsp;` in the English
  fallback children compiled to a real `U+00A0`. So this fix restores 31 translations at the cost
  of downgrading one non-breaking space to a breaking one — in English too, since the same
  `<Trans>` element renders the English fallback through the identical `shouldUnescape` path once
  `ns`/`i18nKey` resolve correctly for `en`. This is accepted, not an oversight, and is recorded in
  the `{/* ... */}` comment above the fixed `<Trans>` in `GamePage/index.tsx`.

## Solution — as implemented

1. Renamed `key=` to `i18nKey="wikiLink"` at `GamePage/index.tsx:452`.
2. Added `ns="gamepage"` — confirmed necessary because `GamePage`'s `useTranslation('gamepage')`
   binds `t`, not the `i18n` instance handed to `<Trans>`, and i18next's `defaultNS` is
   `translation`.
3. Added `shouldUnescape` — required per the correction above; without it the fix is a visible
   mojibake regression, not a fix.
4. **Child-index parity — measured correct, not a hedge.** The catalog value's `<1>` marker maps
   onto the `<Link>` element at child index 1 (children are: text node at index 0, `<Link>` at
   index 1). Verified by a real-i18next rendering test
   (`GamePage/__tests__/wikiLinkTrans.realI18next.test.ts`, assertion A2b) that extracts the
   German catalog's `<1>...</1>` text and confirms it appears in markup rendered with the
   production attributes.
5. `public/locales/` was not touched — confirmed by `git status --porcelain public/locales/`
   being empty at close.
6. Verified by rendering under `lng: 'de'` through a real i18next engine and the real catalog, not
   by reading the diff — four assertions (A1–A4), plus three negative controls (wrong prop name,
   wrong `ns`, and dropped `shouldUnescape`), each observed to fail for the right named reason and
   then restored.

## What this fix does NOT cover

- **`fr` (French) remains broken after this fix**, for a *different* reason `shouldUnescape`
  cannot address: `public/locales/fr/gamepage.json`'s `wikiLink` entity is itself malformed
  (`&nbsp` + a narrow no-break space `U+202F` + `;`, not a well-formed `&nbsp;`), so French still
  renders a visible `&amp;nbsp ;`, and its link text is still untranslated English (`Open page`).
  Filed separately as
  `.planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md`, since
  repairing it needs a catalog edit this task's scope forbade (`REQ-34.8-04`).
- **15 locales have no `wikiLink` key at all** (`az`, `bs`, `eu`, `fa`, `he`, `hr`, `ka`, `ko`,
  `ml`, `ro`, `sk`, `sr`, `th`, `uz`, `zh_Hant`) and fall back to English. This is a pre-existing,
  deliberately-untouched condition — not a regression from this fix, and not the same defect class
  as the `fr` malformed entity above.

Related: `.planning/todos/completed/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md`,
`.planning/todos/completed/2026-09-19-downloaddialog-anticheat-trans-uses-key-not-i18nkey.md` (the
third instance of this defect class, fixed by `quick-260921-jfk`), and
`.planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md` (the
finding this fix could not repair).
