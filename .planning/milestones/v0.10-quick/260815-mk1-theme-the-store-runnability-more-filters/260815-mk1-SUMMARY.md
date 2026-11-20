---
id: 260815-mk1
type: quick
status: complete
completed: 2026-08-15
commit: 3af006bd5
---

# Quick Task 260815-mk1 — Summary

## What changed

One file: `src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss`.

`.FilterFacetGroup .dropdownButton` gained the chrome reset it never had
(`appearance: none`, `background: none`, `border: 0`) plus `color`, hover,
focus-visible and the sketch-004 section-header treatment.

## Root cause

Not a theming/token failure — a **missing declaration**.

`Dropdown` renders its disclosure as `<button class="dropdownButton">`.
`components/UI/Dropdown/index.scss` styles `.dropdownContainer`, `.dropdown`
and `.dropdown > button` (the panel's *contents*) but contains **no
`.dropdownButton` rule at all**. The single `.dropdownButton` rule in the
codebase — this one — set only `display`, `align-items`, `justify-content`,
`width`, `font-size`, `font-weight`, `line-height` and `padding`.

With `background`, `border` and `color` unset, the user-agent button chrome
survived (grey `buttonface` fill, beveled border) and `styles/_buttons.scss:7`
(`button { @include buttonDefaultStyle }` → `color: #161616`) painted near-black
text on it.

The diagnostic that separates this from the file's history of token-survival
defects (CR-01/CR-03): the headers looked **identical in every theme**. A
dropped `var()` varies by theme; a missing declaration does not.

## Consistency decisions

- Hover (`--navbar-active-background` + `--filter-active-color`) and
  focus-visible (2px `--accent`, `-2px` offset) are the **exact** pairs
  `.FilterFacetRow` already uses — the header now responds like the rows it
  governs, from one declaration site rather than a fork.
- `text-transform: uppercase` / `--text-xs` / `letter-spacing: 0.1em` is
  sketch 004's validated `.grp-label`
  (`sketch-findings-gamelib → references/library-filtering.md`), which is what
  makes these read as section labels instead of a fourth kind of clickable row.
  This is a deliberate visual change beyond the bug: the headers were
  `--text-sm` sentence-case before.
- `--filter-active-color` is **reused** from the file-local declaration, not
  redeclared, and no new bare `--navbar-active` consumer was added — so
  `themeTokens.test.ts`'s WR-13/CR-03 census keeps the same scope.

## Token-survival check (all verified declared)

| Token | Coverage |
|---|---|
| `--navbar-accent` | all theme blocks (already consumed bare by `.FilterFacetRow`) |
| `--navbar-active-background` | 11 declarations in `themes.scss` = 11/11 theme blocks |
| `--accent` | all theme blocks |
| `--filter-active-color` | file-local chain, `index.scss:43` |
| `--text-xs`, `--space-3xs`, `--space-2xs` | global, unthemed |

## Incidental change

Prettier reformatted the pre-existing `--filter-active-color` declaration onto
multiple lines. That line was **already** violating the repo prettier config
before this task (confirmed by piping the pristine `HEAD` blob through
`prettier --check --stdin-filepath`); it is not a consequence of the new rules.
The census matches the chain as a regex, explicitly "so whitespace/formatting is
irrelevant", so the rewrap is inert to the gate.

## Verification

| Check | Result |
|---|---|
| `sass` compile of the file | exit 0 |
| `jest NavShell themeTokens` | 22 suites, **295/295 pass** |
| `prettier --check` on the file | clean |
| No new bare `--navbar-active` consumer | confirmed — only line 43's chain |
| All selectors under `.NavShell__tier2Portal` | confirmed — one top-level selector in the file |

## Not verified

**Live appearance.** Every check above is a source-level or unit-level gate;
there is no CSS engine in jest. The three headers have not been observed
rendering in a running build, in any theme. This project's own history says a
green suite is not the adjudicator of appearance — a live three-theme sweep
(midnightMirage, gruvbox_dark, dracula) via `pnpm tauri:dev` is.

## Commit

`3af006bd5` — fix(quick-260815-mk1): theme the filter-panel group headers
