---
created: 2026-10-10T22:50:00.000Z
title: WebKit's native recent-searches chip appears under the Winetricks search input and intercepted a checkbox click
area: ui
severity: medium
platform: macos
ready: code
found_by: "Phase 45 live gate 45-12 (operator report, launch 1; captured in launches 2-3), 2026-10-10"
files:
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx
---

## Observation

Operator (launch 1): after typing in the search box "a tooltip shows what I typed and seems to
have focus, so the mouse is in the wrong mode to click the checkbox". Captures
`burst2-light-016.png` and `burst3-125.png` show a dark chip reading `Bad x` (fill 141416)
directly under the input after a search - that is WKWebView's recent-searches popover for
`<input type="search">`, not anything the tab renders (the input has no `title`, no datalist).
The chip sat over the first result row's checkbox column.

## Fix direction

Opt out of the native control: `type="text"` with `role="searchbox"` (keeps the a11y semantics)
or keep `type="search"` and add `autoComplete="off"` plus `results={0}` / `incremental`
attributes WebKit honours; verify on macOS by typing, blurring and re-focusing - no chip, and the
first row's checkbox takes the click. Also covered by the operator's related remark that the label
"Everything else" is wrong (see the UX observations todo).
