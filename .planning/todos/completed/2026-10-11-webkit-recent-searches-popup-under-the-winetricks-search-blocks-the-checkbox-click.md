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

## Fix (2026-10-11, gsd-fast, commit `4f2883f06`)

Took the first option: the input is now `type="text"` with `role="searchbox"` and
`autoComplete="off"` (`EverythingElseGroup/index.tsx`). `type="text"` removes the native WebKit
search field outright, so there is no recent-searches control to opt out of attribute by
attribute; `role="searchbox"` keeps the accessible role `type="search"` implied, and
`autoComplete="off"` stops the text autofill popover from taking the chip's place.
`everythingElse.test.tsx` pins all three attributes (its locator finds the input by element type,
not by `type="search"`, so the pin and the locator cannot drift apart). The 14 Winetricks suites
(233 tests), `pnpm codecheck` and prettier over the two written paths are green.

**Not verified live.** The macOS type-blur-refocus check the todo asks for (no chip, first row's
checkbox takes the click) has not been run; it needs a `tauri dev` session and belongs in the
next Winetricks live gate. The "Everything else" label remark is tracked separately in
`2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md`, item 1.
