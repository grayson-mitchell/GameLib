---
created: 2026-09-25
title: 'Mouse highlight does not confer DOM focus on library cards — a controller press after mousing over a card moves the SEARCH FIELD, not the highlighted card'
found_during: Phase 38 controller sitting 3 (quick 260925-r8j close-out)
severity: medium
platform: any
ready: code
area: gamepad-focus
files:
  - src/frontend/screens/Library/components/GamesList/index.tsx
  - src/frontend/helpers/gamepad.ts
---

## Mechanism

Filed after the 2026-09-25 Phase 38 controller sitting (quick `260925-r8j`). Operator repro:
highlight a library card with the mouse, then switch to the gamepad — the element that actually
moves next is the SEARCH FIELD, not the card that visually looked highlighted, because the
visible highlight the operator was looking at is not `document.querySelector(':focus')`. The mouse
produces a CSS hover/visual state on the card without ever moving real DOM focus there; real DOM
focus stayed wherever it structurally was (the search field), and the controller's `!el` recovery
/ traversal logic operates on `document.activeElement`, not on whatever the pointer happens to be
resting over.

`severity: medium` — real defect with a bounded blast radius (library route card highlighting) and
a workaround exists (press a directional input once to re-establish real focus before relying on
the highlight).

**Corroborating machine evidence**, from the same sitting's `[GAMEPAD-ACT]` instrument: two
`padLeft` presses two seconds apart, on the library route, both logged `tag=none` while a card
appeared highlighted on screen:

    (18:12:16) [GAMEPAD-ACT] action=padLeft ctrl=0 tag=none
    (18:12:18) [GAMEPAD-ACT] action=padLeft ctrl=0 tag=none

`tag=none` means `currentElement()` resolved to nothing focused at the time of dispatch — directly
confirming the operator's report that the visibly-highlighted card was not the DOM-focused
element.

## Cross-references

- **Todo A** (`.planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md`)
  is related but distinct: A is "focus is invisible [even when it correctly IS DOM focus]"; this
  todo (B) is "what LOOKS focused under the mouse often ISN'T DOM focus at all". A card can fail
  both, either, or neither independently.
- **`38-C01a`'s cold-start disposition** (`38-VERIFICATION.md`, sitting 3 discharge) records this
  exact behaviour from the other side: attempt (b) of that item's cold-start clause was blocked by
  precisely this mechanism — two `padLeft` presses on the library route both logged `tag=none`
  while a card appeared highlighted — and the operator's own words there, "library-route highlights
  do not stick", is the same observation this todo is filed against, seen from the d-pad
  cold-start angle rather than the mouse-then-controller-handoff angle.

## Verification (once fixed)

On the library route: hover/click a card with the mouse so it visually highlights, then switch
immediately to the controller and press a directional input. The NEXT element the controller acts
on should be the visually-highlighted card (or an adjacent card, per normal spatial navigation from
it) — never the search field or any other element the operator was not looking at.
