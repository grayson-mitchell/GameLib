---
created: 2026-10-30
title: "Controller Down on the lowest visible library tile moves focus to the left panel instead of scrolling the grid"
area: gamepad
severity: medium
platform: any
ready: live-gate
source: "spike 051 live test 2026-10-30 (PowerA Switch 2 pad via the native-gamepad prototype on macOS)"
files:
  - src/preload/api/tauriGamepadInput.ts
---

## Problem

In the Games library, pressing Down on the lowest visible tile does not scroll the grid to the next
row. Focus jumps to the left panel instead. The operator saw this on macOS while testing the spike 051
native-gamepad prototype with the PowerA Switch 2 pad.

## Likely location

Focus moves are not the pad's doing. `src/preload/api/tauriGamepadInput.ts` computes every directional
focus move itself, because WKWebView and WebView2 have no spatial navigation. When no candidate lies
below the focused tile, it seems to take the nearest focusable element in another direction rather
than scrolling. Two suspects, neither checked:

- The next row is not in the DOM, or has zero area, so `getFocusableElements()` drops it (a
  virtualised or lazily-rendered grid).
- The candidate below is outside the viewport and the move does not scroll the grid container first.

## First step

Check whether the keyboard Down arrow on the same tile does the same. If it does, the bug is in the
shared focus-move path and any pad hits it. If not, compare the `padDown` path with the keyboard path.

## Gate

Live: in a library with more rows than fit on screen, press Down repeatedly from the top row with a
pad. The grid scrolls row by row to the last tile, and focus never jumps to the left panel.

## Fix landed (quick 261031-lrx)

Root cause: GameCard renders a non-focusable placeholder until cardVisibility's IntersectionObserver
fires, and that observer clips targets by the grid's scroll container before applying rootMargin.
Rows below the container stayed placeholders, so the whole-document search in
`moveFocusDirectionally` found nothing below the bottom tile and picked a left-panel element.

Change (`src/preload/api/tauriGamepadInput.ts`): the search is now container-first, then scrolls the
container one tile and polls up to 250ms for the newly rendered tile, then falls back to the
whole-document search once the container cannot scroll further. The keyboard comparison in "First
step" is moot: WKWebView has no spatial navigation, so arrow keys never move focus there.

Live gate passed 2026-10-31 (operator, PowerA Switch 2 pad on macOS, main at 8d0b59963).

## Reopened 2026-10-31: the fix made held-stick navigation jumpy

Quick 261031-lrx (`5fd6a3c60`) and its follow-ups `a3a9db170` / `adc2ad54d` were reverted in
`974e69697`. During quick 261031-nwz's live gate, holding the left stick to the bottom of
the grid and then moving up made focus jump (up two, snap back down) across the whole interface,
on stick and D-pad alike. The native pad input was measured clean at the same time (gilrs probe +
a renderer diagnostic: every hold and flick returns to neutral within ~20 ms). With all four
commits reverted the operator measured smooth navigation, and this todo's original escape came back.

Likely mechanism (read from the code, not measured): the container-first move scrolls one tile
and then polls up to 250 ms for a revealed card, and `gamepad.ts` does not await it, so a held
stick at the default 50 ms repeat stacks several scroll-and-poll cycles; each scrolls again and
late ones focus their card after the operator has moved on. The previous gate only tried single
presses.

A re-fix must serialise or cancel in-flight reveal moves, and its live gate must include a ~3 s
held stick to the bottom of the grid followed by Up presses, not only single presses.
