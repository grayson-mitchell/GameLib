---
created: 2026-08-23T10:05:00.000Z
title: "`--navbar-active` is still undefined in 7 of 11 themes and `NavTabs` still has no fallback — 34.11's D-31 closed only the one SCORED theme"
area: ui
severity: medium
found_by: "Quick task 260823-v3k, correcting ROADMAP.md's stale 34.10 carry-forward record, 2026-08-23"
source: ".planning/phases/34.10-navigation-shell-horizontal-card-tabs-replace-the-sidebar/34.10-REVIEW.md CR-01 (residual half)"
files:
  - src/frontend/themes.scss
  - src/frontend/components/UI/NavShell/components/NavTabs/index.scss:246
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts:127
---

## Problem

`34.10-REVIEW.md`'s CR-01 was scoped, in its own heading, to **8 of 11 themes**: `NavTabs`'s
`.Mui-selected { color: var(--navbar-active) }` has no fallback, and `--navbar-active` was declared
in only 3 theme blocks while `--navbar-active-background` exists in all 11.

Phase 34.11 took CR-01 as decision **D-31** and fixed **exactly one theme** — `gruvbox_dark`, the
one the 34.10 live gate scored. That was D-31's stated undertaking and it was delivered well: the
fix is live-adjudicated (`34.11-09`'s three-theme sweep, APPROVED 6/6, with the operator answering
the contrast question deliberately rather than as a side effect) and RED-proven by mutation.

**The other 7 themes were never in D-31's scope and have no owner.** A census of `themes.scss` at
HEAD (11 blocks declaring navbar tokens) finds `--navbar-active` still undeclared in:

- `classic` / `cyberSpaceOasis` / `cyberSpaceOasisAlt`
- `high-contrast`
- `nord-dark`
- `marine` / `marine-classic`
- `zombie` / `zombie-classic`
- `old-school`
- `sweet` / `sweet-dark`

And `NavTabs/index.scss:246` still reads `color: var(--navbar-active);` with no fallback chain —
the line moved from 229 since the review, the declaration did not change.

## Why the two halves fail differently

This distinction was recorded by the 34.11 fix and is easy to lose:

- **`NavItem/index.scss:20-23`** uses `var(--navbar-active, var(--accent-overlay, var(--accent)))`.
  The chain never breaks, so an undefined token yields a **wrong colour** — `--accent-overlay`, a
  mustard `#d79921` — not a dropped declaration. Ugly, legible.
- **`NavTabs/index.scss:246`** has no chain. Per the custom-properties spec, `var()` on an
  undefined property with no fallback is invalid at computed-value time; for an inherited property
  like `color` the browser does **not** fall back to the lower-specificity `.MuiTab-root` rule in
  the same cascade — it takes the **inherited** value. Nothing in `.NavShell__navbar`, `.App` or
  `body` sets an explicit `color`, and the same rule paints `background: var(--body-background)` on
  the tab two lines above. Result in those 7 themes: a low/zero-contrast, effectively illegible
  active-tab label.

So the user-visible severity is concentrated in the half that is still open.

## Fix

Two independent changes; either alone is an improvement, both is correct.

1. **Add the fallback chain at `NavTabs/index.scss:246`**, matching `NavItem`'s existing
   `var(--navbar-active, var(--accent-overlay, var(--accent)))`. This is the structural fix — it
   converts every future missing declaration from illegible to merely off-palette, in themes nobody
   has swept. The comment block directly below that line already documents this exact defect class
   for `--divider`; it was fixed there for `border-color` and missed on `color`.
2. **Declare `--navbar-active` in the 7 remaining blocks**, sourced from each theme's own
   `--navbar-accent` (or nearest palette token) rather than a literal hex, matching how
   `34.11-03` did `gruvbox_dark` so a future palette change propagates.

**Verification bar, inherited from how the scored theme was closed:** do not settle this with hex
arithmetic. `34.11-03` explicitly recorded its own contrast reasoning as "a recommendation, not a
measured result", and it took `34.11-09`'s live sweep to convert that into a real judgment. Each
theme touched here owes a live look at the active-tab label, or an explicit note that it did not
get one. Note also that `34.11-09` needed a pixel-level Playwright/Chromium reproduction four times
in one investigation because source-text gates and contrast math both said "correct" while the live
WKWebView sweep disagreed — that discriminator is available if a theme is contentious.

**Extend the guard:** `themeTokens.test.ts:127`'s `describe('gruvbox_dark theme tokens (CR-01, D-31)')`
pins one theme by name. It should become a census assertion over all 11 blocks, or it will keep
passing while 7 themes stay broken — which is precisely what happened for the last 14 days.
