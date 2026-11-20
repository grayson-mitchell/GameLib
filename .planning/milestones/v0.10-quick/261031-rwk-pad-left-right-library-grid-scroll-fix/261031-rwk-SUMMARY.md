---
phase: quick-261031-rwk
plan: 01
status: complete
subsystem: gamepad
tags: [gamepad, focus, library, webkit]
key-files:
  modified:
    - src/preload/api/tauriGamepadInput.ts
    - src/preload/__tests__/gamepadAction.test.ts
decisions:
  - "Measure the target's resting rect before focusing; preventScroll only when it is already fully visible, so off-screen targets keep the browser reveal"
metrics:
  completed: 2026-10-31
---

# Quick 261031-rwk: Pad Left/Right no longer scrolls the library

Root cause: `.gameCard:focus-within { transform: scale(1.05) }` plus a bare `.focus()` in
`moveFocusDirectionally`. WebKit revealed the scaled box, so a tile near the bottom of
`main.content` nudged the scroll down a few pixels on every focus move.

Fix (`97d9a3c34`): `focusTarget()` in `tauriGamepadInput.ts` focuses with
`{ preventScroll: true }` when the target's pre-focus rect is fully inside the viewport and every
scrollable ancestor, and falls back to a plain `.focus()` otherwise. All five focus calls in
`moveFocusDirectionally` route through it. Tab (`doTab`) is unchanged.

## Verification

- `npx jest src/preload/__tests__/gamepadAction.test.ts src/preload/__tests__/gamepadActionRouting.test.ts`: 38/38 pass (3 new)
- `npx prettier --check` on both files: clean; `tsc --noEmit`: no errors in touched files
- Live gate (operator, PowerA pad, macOS): ten Left/Right presses with D-pad and stick on the lowest
  visible row; no scroll, focus moves tile to tile. **Passed.**

## Notes

The trade-off: a focused tile on the bottom edge may have its scaled ring clipped by a few
pixels instead of the page scrolling. The operator ruled the scroll the defect.
