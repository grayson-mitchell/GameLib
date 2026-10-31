---
created: 2026-10-31
title: "Pad Left/Right in the library grid scrolls the page down a few pixels on every press"
area: gamepad
severity: medium
platform: macos
ready: live-gate
source: "operator, quick 261031-nwz live gate (PowerA Switch 2 pad via the native gamepad source)"
files:
  - src/preload/api/tauriGamepadInput.ts
  - src/frontend/screens/Library/index.tsx
---

## Problem

In the Games library, moving focus Left or Right between tiles with the pad scrolls the page down by
a few pixels each time. A horizontal move should not scroll at all. Seen on macOS (WKWebView) with
the PowerA pad, both with 261031-lrx reverted (`974e69697`) and as re-landed (`71e973269`), so lrx
did not introduce it. Not yet checked: whether the D-pad and the stick both do it, whether it adds up
over several presses, and whether Windows does it.

## Suspects (none checked)

- `moveFocusDirectionally` calls `.focus()` with no `preventScroll`, so WebKit scrolls the newly
  focused card into view whenever its rect pokes past the bottom of the scroll container
  (`main.content`). If a focused card's rect is taller than a resting one (focus ring, focus-row
  title from `cad735311`), every horizontal move would nudge the scroll.
- Right-stick scroll (`doScroll`, raw-HID axes 2/5) firing from a drifting or mis-mapped axis. The
  renderer diagnostic in 261031-nwz showed `rx`/`ry` at 0 throughout, so this is unlikely.

## Gate

Live on this Mac with the pad: in the library, press Left/Right along a row ten times, with both the
D-pad and the stick. `main.content.scrollTop` does not change, and focus still lands on the next
tile.

## Fix landed (quick 261031-rwk, `97d9a3c34`)

Cause: the first suspect, with the growth coming from `transform: scale(1.05)` on
`.gameCard:focus-within` (`GameCard/index.css`), not the ring or the focus-row title. A bare
`.focus()` made WebKit reveal the focused element using its scaled box, so a tile whose resting
box sat fully on screen near the bottom of `main.content` poked a few pixels past the edge and
every Left/Right press nudged the scroll down.

`moveFocusDirectionally` now focuses through `focusTarget()`: the target's resting rect is
measured before focusing, and when it is fully inside the viewport and every scrollable ancestor
the focus uses `{ preventScroll: true }`. Off-screen targets keep the plain `.focus()` reveal.
Pinned by three tests in `src/preload/__tests__/gamepadAction.test.ts`.

## Closed 2026-10-31: live gate passed

Operator, PowerA pad on this Mac, dev window reloaded on `97d9a3c34`: ten Left/Right presses
along the lowest fully visible row with the D-pad and with the stick. The page stayed still and
focus moved tile to tile. Windows was not checked.
