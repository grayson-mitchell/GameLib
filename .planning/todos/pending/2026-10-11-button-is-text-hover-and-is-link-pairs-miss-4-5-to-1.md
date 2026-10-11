---
created: 2026-10-11T00:00:00.000Z
title: "`.button.is-text`'s 22 `.is-link` render sites and its own `:hover` state are unexamined for contrast"
area: ui
severity: medium
platform: any
ready: code
found_by: "quick 261011-pjv, closing the gruvbox_dark Retry/Clear/.button.is-text todo, 2026-10-11"
files:
  - src/frontend/styles/_buttons.scss
  - src/frontend/screens/Game/GameSubMenu/index.tsx
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
---

Quick 261011-pjv fixed `.button.is-text`'s base-state gruvbox_dark collision (`--background` on
`--accent`, 4.35:1) with a `body.gruvbox_dark &:not(.is-link):not(:disabled)` override, deliberately
excluding `.is-link` consumers because they take their text colour from a different rule chain.
That exclusion was correct for the fix it made, but it leaves three things unexamined:

1. **The 22 `.is-link` render sites' own pair is unmeasured across all 10 themes.** 21 live in
   `Game/GameSubMenu/index.tsx` (the per-game menu's install/uninstall/etc. options), 1 in
   `Game/GamePage/components/MainButton.tsx` (the install-options split button). These take their
   text colour from `.button.is-link` (`_buttons.scss`) or, in the game menu specifically, from
   `.gameConfigContainer .game-actions .gameTools .link` at `(0,4,0)` — against
   `--navbar-background`, not `--accent`/`--background`. Neither pair has been run through
   `themeTokens.test.ts`'s all-10-theme census; nord-light in particular has not been modelled for
   this pair at all. 261011-pjv's census covered only the pure `.is-text` base state, not this one.

2. **`.button.is-text:hover` (`_buttons.scss`) is unexamined outside gruvbox_dark.** 261011-pjv's
   Test E confirmed the new override does not regress gruvbox_dark's hover state (7.38:1 against
   a 6.09:1 base, both passing), but no test has run `.button.is-text:hover`'s
   `var(--primary-hover)` fill against the DownloadManager "Clear List" button's text colour, or
   against the game menu's `.is-link` hover colour (`var(--accent)`, per `.button.is-link:hover`),
   across the other 9 themes. nord-light and nord-dark are flagged by prior census work
   (`2026-10-11-library-sign-in-row-glyphs-and-button-hover-miss-in-nord-light.md`) as themes
   where hover-state text contrast has already missed floors on unrelated controls, so they are
   the first themes to check here, not an exhaustive claim that only those two miss.

3. **`.settingsWrapper > .button.is-text` (`Settings/index.css:148`, `color:
   var(--text-quartenary)`) looks unreachable.** `settingsWrapper` is only ever rendered by
   `Settings/index.tsx:131` and `Accessibility/index.tsx:110`; neither file nor its grep for
   `is-text` turns up a match, and all 23 confirmed `.button.is-text` render sites live in
   `DownloadManager/index.tsx`, `Game/GameSubMenu/index.tsx` and `MainButton.tsx` instead — none
   of which mention `settingsWrapper`. Treat as dead CSS pending a reachability check (a
   descendant component rendered inside one of those two wrappers could still introduce a direct
   `.button.is-text` child later), not as a measured, live rule. Worth noting if it is ever
   reconnected: its selector specificity, `(0,3,0)`, is lower than 261011-pjv's gruvbox_dark
   override, `body.gruvbox_dark .button.is-text:not(.is-link):not(:disabled)` at `(0,5,0)` — so a
   future `.settingsWrapper > .button.is-text` render would lose its `--text-quartenary` colour to
   `--neutral-01` under gruvbox_dark, not blend with it.

No live capture backs any of this — same resolver chain as 261011-pjv and 261011-gpn
(`themeTokens.test.ts`), not pixel-sampled.
