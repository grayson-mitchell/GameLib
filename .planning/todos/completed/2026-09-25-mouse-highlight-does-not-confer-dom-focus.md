---
created: 2026-09-25
title: 'Mouse highlight does not confer DOM focus on library cards — a controller press after mousing over a card moves the SEARCH FIELD, not the highlighted card'
found_during: Phase 38 controller sitting 3 (quick 260925-r8j close-out)
severity: medium
platform: any
ready: live-gate
area: gamepad-focus
files:
  - src/frontend/screens/Library/components/GamesList/index.tsx
  - src/frontend/helpers/gamepad.ts
  - src/frontend/helpers/gamepadHoverSeed.ts
  - src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts
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

- **Todo A** (`.planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md`)
  is related but distinct: A is "focus is invisible [even when it correctly IS DOM focus]"; this
  todo (B) is "what LOOKS focused under the mouse often ISN'T DOM focus at all". A card can fail
  both, either, or neither independently. Todo A was moved to `completed/` by quick `260930-hav`
  (desk fix landed earlier by `260926-acw`): with `controllerLayout` active a clicked element now
  also shows the focus ring (it matches `:focus`), which makes "what looks focused" more truthful,
  but this todo's defect — mouse hover does not move DOM focus at all — is separate and remains
  unaddressed.
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

## Resolution (quick 260930-iws)

**Mechanism, both outcomes.** `tag=none` was `document.activeElement` resolving to `document.body`
(mouse focus falls off the DOM tree in WebKit; the recovery branch then seeds navigation from the
viewport-edge origin, never from the hovered card). The search-field outcome was real DOM focus
simply staying on the SearchBar `<input>` from earlier typing/clicking, so the synthetic directional
keydown navigated from the input's rect instead. In neither case did mouse hover ever move DOM
focus — `:hover` is a pure CSS state, and the controller dispatch path reads `document.activeElement`
exclusively. Honest limit: the second consecutive `tag=none` observed two seconds apart in the
sitting is not explained from source by this fix (candidates considered and left open: the card
placeholder swap, an intervening pointer click) — the fix does not depend on that explanation.

**The fix.** On the mouse-to-controller handoff press — the first controller input since the mouse
last moved (`currentController !== controllerIndex` before the emit, confirmed current after) — a
directional press with a game card under the pointer now lands DOM focus on that card's link and
moves nothing else (land-first); the next press navigates spatially from it. Resolved via
`document.querySelectorAll(':hover')` at dispatch time in the new `gamepadHoverSeed.ts`, queried
fresh on every handoff press — no listener is registered, so there is no pointer-tracking state to
go stale or clean up.

**Scope limits.** Directional actions only (`padUp/Down/Left/Right`, `leftStick*`) — `mainAction`/
`altAction` never seed, so a controller press can never play or install a card it never actually
focused. No seed while the virtual keyboard is active, while focus sits inside a dialog/dropdown/MUI
popover overlay, or when focus is already inside the hovered card. With no card under the pointer,
behaviour is byte-for-byte unchanged (the pre-existing `!el` recovery path and the search-field
navigation path both still fire exactly as before).

**Reconciliation with 260925-pga / 260926-acw.** No CSS change was needed. pga's stale-focus
suppression rule and acw's hover/focus split are both scoped to the DOM-focus state; this fix
changes which element holds that state on the handoff press, so acw's `.gameCard:focus-within` ring
now lands on the card the operator was actually looking at instead of a stale prior focus target or
nothing at all.

**Commits:** `8217ded23` (resolver + wiring + RED/GREEN core matrix), `841c36414` (P-5 guards +
extended matrix). **Test file:** `src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts` (18 cases:
R1-R6 unit, I1-I10 integration).

**The live mouse-to-controller handoff check on the library route (the Verification section above)
has NOT been performed.** Moving this todo to `completed/` does not change that — the Verification
section above remains the authoritative checklist for a real sitting. Note that the `[GAMEPAD-ACT]`
instrument this todo's corroborating evidence relied on was removed in `5a4dffc0e`, so a live
sitting must either observe the focus ring by eye or re-add a temporary probe.
