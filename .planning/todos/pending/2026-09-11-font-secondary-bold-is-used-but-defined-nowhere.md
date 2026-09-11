---
created: 2026-09-11
title: "--font-secondary-bold is used in 3 shared components but defined nowhere"
area: shared-ui-tokens
status: OPEN
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
