---
quick_id: 261031-rwk
type: quick
autonomous: false
files_modified:
  - src/preload/api/tauriGamepadInput.ts
  - src/preload/__tests__/gamepadAction.test.ts
---

# Quick 261031-rwk: pad Left/Right in the library grid must not scroll

Todo: `.planning/todos/pending/2026-10-31-pad-left-right-in-library-grid-scrolls-down-a-few-pixels.md`

## Cause

`.gameCard:focus-within { transform: scale(1.05) }` (`GameCard/index.css`). `moveFocusDirectionally`
calls a bare `.focus()`, so WebKit reveals the focused element using its post-focus (scaled) box.
For a tile whose resting box is fully on screen but sits near the bottom of `main.content`, the
2.5% growth pokes a few pixels past the edge and every focus move nudges the scroll down.

## Task 1: focus without a reveal when the target is already visible

<files>src/preload/api/tauriGamepadInput.ts</files>
<action>
Add `focusTarget(el)`: measure `el`'s resting rect BEFORE focusing; if it lies fully inside the
viewport and every non-document scrollable ancestor's rect, call `el.focus({ preventScroll: true })`,
otherwise plain `el.focus()` (unchanged reveal for off-screen targets). Route every `.focus()` in
`moveFocusDirectionally` through it.
</action>
<verify>
`pnpm jest --selectProjects preload src/preload/__tests__/gamepadAction.test.ts`;
`npx prettier --check src/preload/api/tauriGamepadInput.ts src/preload/__tests__/gamepadAction.test.ts`
</verify>
<done>Visible targets focus with preventScroll, off-screen ones without; existing tests unchanged.</done>

## Task 2: unit tests

<files>src/preload/__tests__/gamepadAction.test.ts</files>
<action>
Pin: Right to a fully visible in-container tile uses `{ preventScroll: true }`; a tile clipped by
the container's bottom edge gets a plain `focus()`.
</action>

## Live gate (operator, pad)

Library, ten Left/Right presses along a row (D-pad and stick), including the bottom visible row:
`main.content.scrollTop` unchanged, focus lands on the next tile.
