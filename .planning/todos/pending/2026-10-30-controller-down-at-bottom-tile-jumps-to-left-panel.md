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
