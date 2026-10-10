---
created: 2026-10-10T23:24:47.000Z
title: Retry and Clear paint `--background` on `--accent` at 4.35:1 in gruvbox_dark, under 4.5
area: ui
severity: minor
platform: any
ready: code
found_by: "quick 261011-gpn's token-level census, 2026-10-11"
files:
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
---

## Measured (token-resolved, not pixel-sampled)

`#1d2021` (`--background`) on `#b57614` (`--accent`) in `body.gruvbox_dark` measures **4.35:1**,
under the WCAG 4.5:1 floor, resolved through `themeTokens.test.ts`'s own `themeTokens` +
`globalTokens` + `resolveValue` + `contrastRatio` chain (the same resolver quick task 261011-gpn
used to fix the Winetricks sticky bar's Apply button, which had the same pair and the same
collision). No live capture backs this number; a pixel-sampled gruvbox_dark look is still owed.

Both controls currently declare the pair with no override:

- Retry, `.WinetricksRow__retry` (`Row/index.scss:232`): `background: var(--accent, #0080ff);`
  at line 240, `color: var(--background, #070a0b);` at line 245.
- Clear, `.WinetricksEverythingElse__clear` (`EverythingElseGroup/index.scss:82`):
  `background: var(--accent, #0080ff);` at line 86, `color: var(--background, #070a0b);` at
  line 88.

`src/frontend/styles/_buttons.scss` `.button.is-text` (lines 151-153) uses the identical pair
with NO fallbacks (`background: var(--accent); color: var(--background);`), so it carries the
same 4.35:1 collision wherever it is rendered in gruvbox_dark. `grep -rn 'is-text' src/frontend`
returns 28 matches across `_buttons.scss`, `Settings/index.css`, `DownloadManager/index.tsx`,
`Game/GameSubMenu/index.tsx`, `Game/GamePage/components/MainButton.tsx`, and three test files
that assert the class name string.

## Fix options (not chosen)

(a) Copy Apply's `body.gruvbox_dark &:not(:disabled)` override into
`.WinetricksRow__retry` and `.WinetricksEverythingElse__clear`, and extend the
`themeTokens.test.ts` Apply census (or a sibling one) to cover both. Narrow blast radius, but
does not touch `.button.is-text`'s other consumers.

(b) A theme-level token change to gruvbox_dark (e.g. a darker `--accent` or a different
`--background` fallback for this pair). Would also cover `.button.is-text` everywhere and let
Apply's own override be deleted — quick 261011-gpn's Test B ("the gruvbox_dark override is
load-bearing") would go red to say so — but `--accent` drives many other gruvbox surfaces, so
this is a design decision, not a desk-only fix.

Either way, a live capture of Retry, Clear, and `.button.is-text` in gruvbox_dark is still owed.
