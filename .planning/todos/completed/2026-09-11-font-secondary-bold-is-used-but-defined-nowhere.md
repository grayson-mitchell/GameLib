---
created: 2026-09-11
title: "--font-secondary-bold is used in 3 shared components but defined nowhere"
area: shared-ui-tokens
status: RESOLVED
severity: minor
platform: any
ready: code
source: "260911-umj, found adjacent to the SearchBar height edit (component/UI/SearchBar/index.scss) done for that task; not fixed there per that plan's explicit scope boundary"
files:
  - src/frontend/components/UI/SearchBar/index.scss
  - src/frontend/components/UI/InfoBox/index.css
  - src/frontend/components/UI/FormControl/index.css
resolves_phase: null
---

# `--font-secondary-bold` is used but defined nowhere

## The defect

Three shared component stylesheets set `font: var(--font-secondary-bold);`:

- `src/frontend/components/UI/SearchBar/index.scss:89` (`.searchBarInput`)
- `src/frontend/components/UI/InfoBox/index.css:39`
- `src/frontend/components/UI/FormControl/index.css:12`

`grep -rn "font-secondary-bold" src/frontend` finds only these three usages — no
`--font-secondary-bold:` custom-property declaration exists anywhere in the codebase.

`font` is a CSS shorthand. When a shorthand's value is invalid at computed-value time (here,
`var()` resolving to nothing because the custom property was never declared), the **entire
shorthand fails and every longhand it covers resets to its inherited value** — not just the
missing piece. That silently resets `font-family`, `font-size`, `font-weight`, `font-style`,
`line-height`, etc. on all three elements to whatever their parent happens to be, rather than
whatever bold/secondary styling was intended.

## Why it hasn't been caught

The reset is silent — no console warning, no build error, no visual crash. Each element still
renders *some* font (inherited from its ancestor), so nothing looks obviously broken unless you
know what the intended weight/family was and compare against it.

## Suggested fix

Either:
1. Declare `--font-secondary-bold` in the shared token file (alongside the other `--font-*`
   custom properties, if such a file exists) with the intended shorthand value, or
2. Replace all three call sites with explicit longhand declarations (`font-family`, `font-weight`,
   `font-size`, etc.) if there was never a single coherent "secondary bold" font definition and
   each site actually wants something slightly different.

Whichever direction is chosen, re-verify all three affected elements' rendered font against
their intended design afterward — this project's "measure, do not eyeball" rule applies, since
the current silent-inherit fallback may already look plausible in some themes.

## Resolution

RESOLVED 2026-09-12 by quick `260912-7o4`, commit `3a170ab9a`. Direction 2 of the two the todo
offered (longhands), for a reason the todo could not have known.

### Why direction 1 was wrong

`git log -S "--font-secondary-bold:"` locates the declaration *and its deletion*. The token was
never merely absent — it was removed, with its whole family, by upstream Heroic `b6f3da757`
("[Tech/Refactor] Frontend/design system", #1851, Oct 2022):

```css
--font-primary-regular: var(--actions-font-family) normal 400;
--font-primary-bold: var(--actions-font-family) normal 500;
--font-primary-bolder: var(--actions-font-family) normal 700;
--font-secondary-regular: var(--content-font-family) normal 400;
--font-secondary-bold: var(--content-font-family) normal 500;
--font-secondary-regular-italic: var(--content-font-family) italic 400;
--font-secondary-bold-italic: var(--content-font-family) italic 500;
```

That refactor introduced the replacement vocabulary in `src/frontend/styles/_typography.scss`
and migrated most call sites. These three are stragglers it missed. Re-declaring the token would
have resurrected a retired vocabulary.

### What the values were resolved to

`font: var(--font-secondary-bold);` → `font-family: var(--secondary-font-family);` +
`font-weight: var(--medium);` at all three sites. Two traps in that mapping:

- **500, not 700.** The old token meant weight 500. In the live scale that is `--medium`;
  `--bold` is 700. "Bold" in the retired names was a slot label, not a weight — reading it as a
  weight would have overshot.
- **`--content-font-family` is dead too.** `GlobalState.tsx:528-542` sets `--primary-font-family`
  / `--secondary-font-family` at runtime from the Accessibility font pickers. The old
  `--content-`/`--actions-` names are declared nowhere. `--secondary-font-family` is the live
  equivalent.

### Correction to this todo's analysis

The todo's shorthand-failure mechanism is right, but it implies the intended styling was once
applied and later lost. It never applied. `var(--content-font-family) normal 500` is not a legal
`font` shorthand either — no `font-size`, and the family must come last — so the declaration was
invalid at computed-value time both before and after `b6f3da757`. Nobody has seen the intended
rendering, in this repo or upstream, since at least 2022.

### Rendering delta, and what was NOT measured

Weight 400 → 500 on `.searchBarInput`, `.FormControl__{button,select,input}` and
`.infoBox > strong`. Family is a no-op for the InfoBox rule (already inherited from `body`) but
newly reaches the two form controls, which UA stylesheets give the system font — so the
Accessibility "Content Font Family" picker now reaches them, which it did not before. No
`font-size` or `line-height` was added: the dead shorthand never validly set either, and
`260911-umj` ratified these controls at 34px the previous day.

**The todo's "re-verify the rendered font" instruction was NOT discharged.** No live run was
taken. The change is font-weight and font-family only, neither of which can shift the ratified
34px control height, and this todo carried `ready: code`. Recorded as unmeasured rather than
claimed.

### Verification

`grep -rn "font-secondary-bold" src` → no matches. Prettier clean on all three files. Frontend
jest project 159/159 suites, 2504/2504 tests.

### Residue filed, not fixed — the population is far larger than this todo

A used-vs-declared sweep of every `var(--x)` in `src/**` and `public/**` against every `--x:`
declaration (including the two names `GlobalState.tsx` sets via `setProperty`) found, *after*
this fix, **39 references to 23 custom properties that are declared nowhere**. Five more are the
same retired-vocabulary stragglers (`--font-secondary-regular` x2, `--font-secondary-regular-italic`
x2, `--font-primary-bold`, `--content-font-family`, `--actions-font-family` x4, `--font-size-sm`
x3 — 13 references). The rest are a different shape and sharper: outright typos, including
`--input-backgroundd` at `SearchBar/index.scss:25` (one file above the line this todo is about)
and `--status-sucess` at `GameCard/index.css:385`.

All of it is out of this todo's scope and none of it was touched here. Filed as
`.planning/todos/pending/2026-09-12-39-references-to-23-css-custom-properties-declared-nowhere.md`.
