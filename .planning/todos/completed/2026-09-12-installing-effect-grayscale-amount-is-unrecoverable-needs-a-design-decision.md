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
status: resolved
resolved: 2026-09-13
resolved_by: 'Quick task 260913-9qk'
resolution: 'Premise refuted — the token is declared at runtime in GameCard/index.tsx; no design decision was needed. Its prescribed themes.scss fix was a trap.'
files:
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts
---

> **RESOLVED 2026-09-13 by quick task `260913-9qk` (`1e4223953`) — the premise below is
> FALSE and the body is retained only as the record of how it went wrong.** The token is
> declared, at runtime, and its value was recoverable all along. No design decision was
> needed. See `## Resolution` at the bottom before trusting anything above it.

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

## Resolution (2026-09-13, quick task `260913-9qk`, `1e4223953`)

**Everything above this line is wrong, and no design decision was needed.**

`--installing-effect` **is** declared — at runtime, in TSX, on the `<a>` that wraps both
images:

```tsx
// GameCard/index.tsx:190
const installingGrayscale = isInstalling ? `${125 - getProgress(progress)}%` : '100%'
// GameCard/index.tsx:558
style={{ '--installing-effect': installingGrayscale } as CSSProperties}
```

So non-installed tiles are **fully greyscale today** (`100%`) and colour in as a download
advances. The claim above that "every non-installed tile in the library grid renders in full
colour" is the exact opposite of what ships, and the "value" table above was choosing between
options where the answer was already in the tree.

**Why the search came back empty.** `git log -S "--installing-effect:"` looks for the name
followed by a colon. The source says `'--installing-effect':` — the quote sits between them.
`git log -S "--installing-effect':" --all` finds `b6ce8bdf9` at once. The gate's
`DECLARATION` regex misses it for the identical reason, which is why the sweep reported it as
undefined in the first place. One zero-result search, believed twice.

The repo already knew: `34.10-F02-DIAGNOSIS.md:161` cites this token as a **working**
inline-custom-property precedent, alongside `--dl-progress` and `--progress`.

**The prescribed fix in "What to do" was a trap.** Step 1 said to declare it in the base
`body {}` block of `themes.scss`. `GamePicture/index.tsx:39,48` also renders
`gameImg`/`gameLogo` and **never** applies `installed`, so it matches `.gameImg:not(.installed)`
too, and it sits outside any `.gameCard` — a `body`-level declaration would have turned the
game-detail hero art fully greyscale. Declaring it on `.gameImg` itself would have been worse:
a declaration on the element beats the **inherited** inline value, freezing the install ramp.

**What was actually done.** Declared `--installing-effect: 100%` on `.gameCard, .gameListItem`
only — following `DownloadsRing/index.scss:25` and `WineItem/index.css:15`, the two other
components that set a custom property inline and declare a CSS-side default. The `<a>` is a
descendant of those roots, so its inline value still wins: **zero visual change anywhere**.
`ALLOWLIST` is now empty and the sweep reports 0 undefined references.

Both negative controls were run: deleting the declaration turns the sweep RED naming
`index.css:418`, and restoring it with the allowlist entry re-added turns the rot check RED.

**Still open (not filed):** the gate cannot see a custom property declared *only* via a React
inline style object. Latent today — all three such tokens also have CSS declarations. Widening
`DECLARATION` to any quoted key would be wrong: 22 of the 25 quoted `'--name':` keys in `src/`
are legendary/gogdl CLI flags. See `260913-9qk-SUMMARY.md`.
