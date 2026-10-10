---
created: 2026-10-10T22:47:00.000Z
title: Winetricks Apply (enabled) button text measures 1.52:1 in nord-light and 1.01:1 in midnightMirage
area: ui
severity: major
platform: any
ready: code
found_by: "Phase 45 live gate 45-12 G7 (launches 2-3), 2026-10-10"
files:
  - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
  - src/frontend/themes.scss
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
---

## Measured (window captures, colour histogram + WCAG, see 45-LIVE-GATE.md)

| theme | element | fg | bg | ratio |
|---|---|---|---|---|
| nord-light | Apply enabled text | 20242C | 30444A | 1.52:1 |
| midnightMirage | Apply enabled text | CAF3FE | 8CFFFF | 1.01:1 |

The operator described both before the numbers were taken: "way too dark, text black" (light,
`crop-apply-light-4x.png`) and "white text on light cyan" (dark, `burst3-085.png`). Retry, which
uses a different rule, passes in both (8.90:1 / 16.87:1). The disabled Apply passes in both for
text (8.30:1 / 10.51:1) but its border is 1.66:1 / 1.36:1 against the bar.

Fix the enabled-button token pair (fill vs text) for every theme; the memory note
`a-css-token-can-be-correct-for-the-wrong-surface` applies - the token is right for the navbar and
wrong on the bar. Verify by sampling a capture in both themes, not by reading the token.

Evidence: `/tmp/gamelib-gate-45-20261010T194049Z/terminal.log` sections "G7 nord-light
measurements" and "G7 midnightMirage measurements".

## Fix (2026-10-11, quick 261011-gpn, commit `704407ca5`)

(a) The enabled Apply `color` moved off the page text token (`--text-default`) onto
`--background`, the house pair Retry (`Row/index.scss` `.WinetricksRow__retry`) and Clear
(`EverythingElseGroup/index.scss` `.WinetricksEverythingElse__clear`) already paint. A
`body.gruvbox_dark &:not(:disabled)` override was also added, setting `color` to `--neutral-01`:
gruvbox_dark's `--accent` (`#b57614`) is a mid-tone whose own `--background` (`#1d2021`) measures
only 4.35:1 against it, under the 4.5 floor, so the house pair alone does not clear every theme.
`:not(:disabled)` is load-bearing on that override — without it, the override's higher
specificity beats `&:disabled` and paints near-black text on the transparent disabled button,
trading a 4.35 miss for a roughly 1.3 one.

(b) Token-resolved contrast, pre-fix vs. post-fix, all 10 themes:

| theme           | pre-fix (`--text-default` on `--accent`) | post-fix (`--background` on `--accent`) |
| --------------- | ----------------------------------------- | ---------------------------------------- |
| midnightMirage  | 1.01                                       | 14.64                                     |
| cyberSpaceOasis | 1.71                                       | 7.77                                      |
| gruvbox_dark    | 3.09                                       | 5.26 (via the `--neutral-01` override)    |
| high-contrast   | 1.34                                       | 11.41                                     |
| dracula         | 2.41                                       | 8.09                                      |
| nord-light      | 1.52                                       | 8.88                                      |
| nord-dark       | 1.26                                       | 11.41                                     |
| marine          | 1.95                                       | 7.42                                      |
| zombie          | 1.80                                       | 7.52                                      |
| sweet           | 1.55                                       | 10.82                                     |

The pre-fix pair failed 4.5:1 in all 10 themes, not only the two the live gate sampled.

(c) Pinned by a new describe, "Winetricks enabled Apply text contrast in every theme (45-12 G7)",
appended to `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`: a non-vacuity
check, an `it.each` over all 10 themes, and four mutation proofs added in commit `25b2b64a9` —
the pre-fix pair measured against the two live-gate-sampled themes, the gruvbox_dark base pair
alone (proving the override is load-bearing), every `body.*` override ending in
`&:not(:disabled)` (plus the `&:disabled` block itself unaffected), and an in-memory sabotage of
that guard proving the checker can fail. 131 tests pass across the three verify suites.

(d) `src/frontend/themes.scss` stays listed in `files:` above but was deliberately NOT edited:
this is a consumer-side token choice, the same decision Retry and Clear already made.

(e) The disabled Apply border miss (1.66:1 / 1.36:1) is out of scope here and stays with
`2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md`.

(f) NOT live-verified. This todo asked to verify by sampling a capture, not by reading the token,
and that still holds: a pixel-sampled capture of the enabled Apply button in nord-light,
midnightMirage, and now gruvbox_dark too, is still owed to the next 45-12 live-gate re-run. The
jest pin above is the desk-level proof, not a substitute for it.

(g) Residual: Retry and Clear share the same 4.35:1 gruvbox_dark collision measured in (b) above.
Recorded as a new pending todo,
`2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md`.
