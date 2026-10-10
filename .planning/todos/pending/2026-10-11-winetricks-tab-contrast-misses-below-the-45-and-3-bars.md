---
created: 2026-10-10T22:48:00.000Z
title: Winetricks tab contrast misses in nord-light and midnightMirage (failed-state reds, checkbox borders, queued box, placeholder)
area: ui
severity: medium
platform: any
ready: code
found_by: "Phase 45 live gate 45-12 G7 (launches 2-4), 2026-10-10"
files:
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
  - src/frontend/themes.scss
---

Every value below was sampled from a window capture (`screencapture -l <id>`, colour histogram,
WCAG relative luminance) during the 45-12 live gate; the Apply-enabled miss has its own todo.

| theme | element | fg | bg | ratio | bar |
|---|---|---|---|---|---|
| nord-light | Install failed tag text | BF616A | EDEFF4 | 3.56:1 | 4.5 |
| nord-light | bar `1 failed` (red) | BF616A | D8DEE9 | 3.03:1 | 4.5 |
| nord-light | unchecked checkbox border | A8AEAF | EDEFF4 | 1.95:1 | 3 |
| nord-light | queued (locked) checkbox | 858F96 | EDEFF4 | 2.87:1 | 3 |
| nord-light | search placeholder | A9A9A9 | EDEFF4 | 2.04:1 | 4.5 |
| nord-light | Cancel / Apply button borders | A8AEAF | D8DEE9 | 1.66:1 | 3 |
| nord-light | Cancel remaining DISABLED text | 787C84 | D8DEE9 | 3.10:1 | record-only |
| midnightMirage | Install failed tag text | A62B2C | 080A0B | 2.84:1 | 4.5 |
| midnightMirage | danger icon | A62B2C | 080A0B | 2.84:1 | 3 |
| midnightMirage | bar `1 failed` (red) | A62B2C | 272F31 | 1.95:1 | 4.5 |
| midnightMirage | disabled Apply border | 3D4345 | 272F31 | 1.36:1 | 3 |

Passing for reference: headers 11.5/11.6, hover text 7.58 (light), focus ring 8.90/11.62,
checked box 8.90/13.86, Installed/Done 7.36/11.75, Installing word 9.74/15.26, banner 8.30/10.51,
Retry 8.90/16.87, row title 13.5/16.8. Hover fill is unchanged in both themes (1.00:1; record-only
per the contract). The `--danger` family is the recurring offender (memory:
`status-tokens-are-raw-success-danger-are-theme-adaptive`, "--danger is 3.55:1, still under AA").

Evidence: `/tmp/gamelib-gate-45-20261010T194049Z/terminal.log`, captures `G7-light-F-after.png`,
`burst2-light-016.png`, `burst2-light-071.png`, `burst3-085.png`, `burst3-125.png`, `burst6-007.png`.
