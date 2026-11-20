---
phase: quick-261011-sxg
plan: 01
subsystem: frontend/library
tags: [css, contrast, themes, wcag, nord-light, F-49-R1-6]
requires: []
provides:
  - "Hovered dismiss glyph >= 3:1 on the banner in all 10 themes"
  - "Expired triangle >= 3:1 on the banner in all 10 themes, via a nord-light-only override"
  - "In-row footer button hover and focus-visible owned by the notice above the Settings rule, label at the row pair in every theme"
  - "Per-theme jest gates for all three in themeTokens.test.ts, with pre-fix verdict reproduction and grown mutation proofs"
affects:
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
key-files:
  modified:
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  moved:
    - .planning/todos/completed/2026-10-11-library-sign-in-row-glyphs-and-button-hover-miss-in-nord-light.md
decisions:
  - "Dismiss hover takes var(--navbar-active, var(--navbar-accent)), the navbar surface's own active-row hue; no per-theme override needed (lowest dracula 3.79 against 3)"
  - "Expired triangle keeps the global --status-danger and gains a body.nord-light override to #ffb3b8 (4.35 on #4c566a), following the NavTabs / FilterFocusRow theme-scoped precedent; a token change was rejected because --status-danger paints many unmeasured surfaces"
  - "In-row button hover and focus-visible keep the row pair (inherit, transparent) and signal with an underline plus a currentColor focus outline; a hue shift was rejected because --navbar-active is 3.79 in dracula against the 4.5 text floor and a --navbar-active-background fill drops the pair under 4.5 in four themes"
  - "Planned and executed inline by the orchestrator (no subagents), the 261011-rj0 shape"
metrics:
  tasks: 3
  files: 3
status: complete
actuals:
  tasks: 3
  commits: 3
plan_head_before: 6df7e14a89043b39945f2dc44c1eb8d55485b535
---

# Quick 261011-sxg: Library sign-in row dismiss hover, expired triangle and in-row button hover in nord_light

The three nord-light residuals quick 261011-j8z filed on the Library sign-in row now clear their
WCAG floors in all ten themes, token-resolved against the banner's `--navbar-background`
(`#4c566a` in nord-light), and each is gated per theme in `themeTokens.test.ts`.

## What changed

| State | Floor | Before (nord-light) | After (nord-light) | Lowest of ten after |
| --- | --- | --- | --- | --- |
| Dismiss glyph on hover | 3:1 | 1.52 (`--text-secondary`) | 5.43 (`--navbar-active`) | dracula 3.79 |
| Expired triangle | 3:1 | 2.82 (`--status-danger`) | 4.35 (`#ffb3b8`, nord-light only) | dracula 3.50 (unchanged) |
| In-row button label on hover / focus-visible | 4.5:1 | 3.50 when Settings won the tie | 7.38 (row pair, owned at 0,4,0) | marine 4.87 |

- **Dismiss hover** paints `var(--navbar-active, var(--navbar-accent))`, the same chain the row
  text already comes from, instead of the body surface's `--text-secondary`.
- **Expired triangle** keeps `var(--status-danger, orange)` and gains a nested `body.nord-light &`
  override at `#ffb3b8`. The other nine themes are unchanged in effect.
- **In-row footer button** gains nested `&:hover, &:focus-visible` (inherit, transparent,
  `box-shadow: none`, underline) and `&:focus-visible` (`outline: 2px solid currentColor`) arms
  inside `.button.is-footer`, compiling to (0,4,0) and beating Settings' (0,3,0) rule whichever
  chunk loads first. `box-shadow: none` is load-bearing: Settings' 3px `--danger` ring is not
  otherwise overridden.

`themes.scss`, `styles/_buttons.scss`, `Settings/index.css` and the notice's `index.tsx` are
byte-unchanged.

## Gate

- RED observed on the pre-fix stylesheet (`e8f47555d`): nord-light dismiss hover and triangle
  censuses fail, the hover arm is absent (6 of 37 sign-in tests red, the rest pass).
- GREEN after the fix (`9cb2945b1`): `themeTokens.test.ts` 202/202; the three other sign-in suites
  55/55; `pnpm codecheck` exit 0; `pnpm planning-gates` 12/12; scoped `prettier --check` green on
  both written paths; `sass` compile confirms the emitted selectors.
- The pre-fix literal values reproduce the todo's nord-light fails and dracula passes through the
  same resolver, and the in-memory sabotage proofs grew to cover the hover arm.

## Not live-verified

Contrast arithmetic only. The next nord-light look owes the appearance of all three states, in
particular whether the underline-only hover on the in-row button reads as hover.

## Commits

- `e8f47555d` test(library): RED gate
- `9cb2945b1` fix(library): the three states
- `2aa9f28f1` docs(todos): todo closed
- the docs commit carrying this summary and the STATE row
