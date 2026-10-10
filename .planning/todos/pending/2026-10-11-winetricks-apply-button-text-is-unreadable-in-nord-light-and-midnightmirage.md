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
