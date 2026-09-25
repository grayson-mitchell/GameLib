---
created: 2026-09-25
title: 'Controller focus has no perceptible affordance — operator cannot see where focus is across Console Mode chips, the tier-2 filter panel, and the game-page split button'
found_during: Phase 38 controller sitting 3 (quick 260925-r8j close-out)
severity: major
platform: any
ready: code
area: gamepad-focus
files:
  - src/frontend/screens/ConsoleMode/index.scss
  - src/frontend/components/UI/NavShell/index.scss
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/helpers/gamepad.ts
---

## Mechanism

Filed after the 2026-09-25 Phase 38 controller sitting (quick `260925-r8j`), where the operator
completed all eight surviving controller items despite being unable to see where focus was. Their
own words, describing the general strategy used to recover when focus was lost: "just mash down
until focused regained". That is not a caveat on one item — it is how the whole sitting was
driven.

`major` is the right rung, not `minor`, because the ledger itself got measurably contaminated by
this: `38-C06`'s clause (3) (the expanded-group/checkbox clause of the tier-2 filter panel item)
could not be scored on operator observation for exactly this reason — the operator's own words
there were "very hard as you cant really see what is highlighted beyond collapsible areas
expanding" — and had to be discharged on log evidence (`FilterFacetRow` entries in the
`[GAMEPAD-ACT]` probe) instead. That is the "a feature is broken or a measurement is silently
contaminated" definition CLAUDE.md's severity table reserves for `major`. `38-C06` is the
strongest available evidence of impact, but it is very unlikely to be the only clause this defect
touches — it is just the one clause that happened to have machine evidence standing in for the
operator's eyes.

Four surfaces observed to be affected during the sitting:

- **Console Mode `.consoleChip` pills.** Machine-confirmed focus at 19:04:30 and 19:08:39 (per the
  sitting's `[GAMEPAD-ACT]` instrument), operator confirmed NO visible change either time. Source:
  `src/frontend/screens/ConsoleMode/index.scss:94-120` (verified at plan time) — the only focus
  styling on `.consoleChip` is a 1px accent `border-color` behind `&:hover, &:focus-visible` with
  `outline: none`, i.e. focus and hover share one rule and neither is loud.
- **Tier-2 filter panel rows** — `FilterFacetRow` and `FilterCollectionList__row`. This is the
  surface behind `38-C06`'s clause-(3) discharge-on-log-evidence above.
- **The game-page split button** (`MainButton.tsx`), where the caret's focus state was similarly
  hard to distinguish by eye during `38-C08`'s run.
- Implied more broadly by the operator's "just mash down until focused regained" strategy, which
  was not scoped to any one of the three surfaces above.

## Adjacency to quick `260925-pga`

Quick `260925-pga` (landed mid-sitting, see `38-VERIFICATION.md`'s `38-C01a` discharge for the
commit boundary) unified hover and focus onto one shared accent ring, extending it from a
hover-only ring to also cover `:focus-visible`. This is recorded here as an **observation to
check**, not as a defect claim against `260925-pga`: making the hover state and the focus state
LOOK identical while they BEHAVE differently (hover follows the pointer; focus follows keyboard/
gamepad navigation and can silently detach from the pointer) may COMPOUND this defect rather than
fix it, because an operator who sees "the same ring" may now assume they are looking at focus when
they are actually looking at hover, or vice versa. This needs its own investigation — it is not
established here as either a fix or a regression.

## Cross-reference

See the sibling todo filed the same day,
`.planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md` (Todo B) — related
but distinct: this todo (A) is "focus is invisible even when it IS DOM focus"; Todo B is "what
LOOKS focused under the mouse often is not DOM focus at all".

## Verification (once fixed)

A live controller (or keyboard, where the same CSS applies) sweep across all four surfaces above,
confirming each carries a visually distinct, clearly perceptible focus indicator that does not
require the operator to already know where focus should be.
