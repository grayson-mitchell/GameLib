---
created: 2026-10-10T22:45:00.000Z
title: Winetricks tab makes the Settings dialog wider than the window (content-driven width; long rows and log lines overflow both edges)
area: ui
severity: major
platform: any
ready: code
found_by: "Phase 45 live gate 45-12 (launch 1 G1 attempt 1; launches 3-4 at first open), 2026-10-10"
files:
  - src/frontend/screens/Settings/index.css
  - src/frontend/screens/Settings/sections/GamesSettings/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
  - src/frontend/components/UI/Dialog/index.css
---

## Observation (operator, launch 1, 2026-10-11 09:07 local)

Opening Show details during the G1 run made the Settings dialog "wider than the screen"; the
operator had to click outside and back in. The window did NOT resize: the renderer logged
`viewport 1470x923` on every focus before and after. The dialog did. Capture
`/tmp/gamelib-gate-45-20261010T194049Z/G1-launch1-shot3.png` shows row text clipped at the left edge, the bar reading
`...of 3 · MS XACT Engine` with `Cancel rem` clipped at the right, and Show details lines
running off the right edge unwrapped.

It is not only the log panel: at the first tab open of launches 3 and 4 (Everything else expanded,
Show details closed) the dialog again overflowed both edges (`burst3-020.png`, `burst5-020.png`,
`burst6-134.png`). The German captions (`Zwischengespeichert (Offline-Installation)`) widened it
too (`burst6-119.png`). With the search filtered to short rows the dialog sits at its normal width.

## Pre-registered bars it fails

45-UAT.md items 24 (E8-overflow), 26 (E9-overflow), 27 (E9-long-text) at the natural width; it
also made items 11 and 12 (Show details carry-forwards) unobservable and contaminated G1 attempt 1.

## What was read (not a fix)

`LogPanel/index.scss` has `white-space: pre-wrap; overflow-wrap: anywhere` and `min-width: 0` on
the panel, but the Settings container is `.Settings { display: flex; ... }` with a
`.settingsWrapper { max-width: 513px; width: 100% }` and `section { min-width: 500px }`; the
dialog grows to the content's max-content width somewhere above the panel. Find the ancestor whose
width is unconstrained and pin it to the viewport (`max-width: 100vw` / `min-width: 0` on the flex
chain). Verify with a window capture at a long log line and with Everything else expanded.

Evidence dir: `/tmp/gamelib-gate-45-20261010T194049Z` (captures named above, `terminal.log` lines tagged "G1 capture review",
"Overflow observation").
