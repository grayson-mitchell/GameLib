---
created: 2026-09-12T00:00:00.000Z
title: '`--installing-effect` grayscale amount is unrecoverable from history — the last undefined CSS token, allowlisted pending a design decision'
area: ui
severity: minor
platform: any
ready: human
needs: design-decision
found_by: 'Quick task 260912-it4 (undefined CSS custom property drain), Task 3'
source: '.planning/quick/260912-it4-drain-the-undefined-css-custom-property-/260912-it4-SUMMARY.md'
files:
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts
---

# `--installing-effect` is the one undefined CSS token that cannot be resolved by measurement

## What

`src/frontend/screens/Library/components/GameCard/index.css:406`:

```css
.gameImg:not(.installed),
.gameLogo:not(.installed) {
  filter: grayscale(var(--installing-effect));
}
```

`--installing-effect` is declared nowhere. `git log -S "--installing-effect:" --all`
returns **zero** commits — it was never declared in any revision of this repo, so unlike
the retired typography vocabulary there is no historic value to migrate to.

Quick task `260912-it4` drained the other 23 undefined custom-property names (39 references
down to 1). This is the only survivor, and it is on the explicit `ALLOWLIST` in
`src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts` with this reasoning
recorded inline.

## Why it was not auto-fixed

Every other name in that sweep was either a typo with an obvious target, a token behind a
declared fallback arm, or a retired token whose live replacement was determined by
measurement (git history, sibling call sites, or an already-reviewed in-repo decision).

This one is a **number**, not a colour. `grayscale()` takes `0`–`1` (or `0%`–`100%`).
Today the whole `filter` declaration is invalid at computed-value time, so it degrades to
`none` and **every non-installed tile in the library grid renders in full colour**. Picking
a value is therefore not a restoration — it visibly changes the library grid:

| value            | result                                                       |
| ---------------- | ------------------------------------------------------------ |
| `0`              | no change from today (full colour) — makes the rule pointless |
| `0.5`            | non-installed tiles half-desaturated                          |
| `1`              | non-installed tiles fully greyscale                           |

The rule's own siblings suggest intent: `.gameCard:hover .gameImg:not(.installed)` and
`.allTilesInColor .gameImg` (`GameCard/index.css:409-412`) both exist to *undo* the effect,
and there is an `allTilesInColor` user setting. So the author clearly wanted non-installed
tiles desaturated by default, with hover and a setting to restore colour. But the *amount*
is a design call, and guessing it changes the appearance of the app's most-viewed screen.

## What to do

Pick a value (most likely `1`, consistent with "hover restores colour" and with the
`allTilesInColor` opt-out), then:

1. Declare it in the base `body {}` block of `src/frontend/themes.scss` (lines 1-25), so
   themes can override it — the same treatment `--border-color` received in `260912-it4`.
2. Remove `'--installing-effect'` and its comment from `ALLOWLIST` in
   `src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts`.
3. The gate's rot check (`allowlists no name that has stopped being an undefined
   reference`) will then pass on its own; the sweep drops to **0 undefined references**.

## Traps

- **Do not set `0`.** That satisfies the gate while leaving the rule inert — a green check
  proving nothing. If the decision is "no desaturation", delete the rule and its two
  undo-siblings instead.
- **Do not hardcode the value at the call site.** The `allTilesInColor` setting and the
  hover rule both override this; a themeable custom property is the right shape, which is
  why the token existed in the first place.
- The gate is a **source-text** gate (`testEnvironment: 'node'`, no CSS engine). It can
  prove the token is declared; it cannot prove the grid looks right. That needs a live look
  at the library grid with at least one non-installed game.
