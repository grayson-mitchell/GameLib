---
created: 2026-09-25
title: 'Controller focus has no perceptible affordance — operator cannot see where focus is across Console Mode chips, the tier-2 filter panel, and the game-page split button'
found_during: Phase 38 controller sitting 3 (quick 260925-r8j close-out)
severity: major
platform: any
ready: live-gate
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
LOOKS focused under the mouse often is not DOM focus at all". With `controllerLayout` active, a
clicked element now shows the shared focus ring (quick 260926-acw), which makes "what looks
focused" more truthful than before this fix — but Todo B's underlying defect (real DOM focus not
moving to the visually-highlighted card at all) is still separate and unaddressed by this fix.

## Verification (once fixed)

A live controller (or keyboard, where the same CSS applies) sweep across all four surfaces above,
confirming each carries a visually distinct, clearly perceptible focus indicator that does not
require the operator to already know where focus should be.

## Desk fix landed (quick 260926-acw)

Desk-level (compile/gate) work is done; **this todo stays in `pending/` with `ready: live-gate`**
until the operator's live controller sweep below confirms the indicator is actually perceptible.
Nothing here should be read as "fixed" — only as "implemented and awaiting the live gate".

**Correction to the adjacency note above.** The "Adjacency to quick `260925-pga`" section above
speculated that pga's hover/focus unification "may compound this defect". Investigation at plan
time (260926-acw) found the actual mechanism more specific than that speculation: pga did NOT
touch `:focus-visible` and did NOT touch any of the three surfaces this todo names (Console Mode,
the tier-2 filter panel, or the game-page caret) — it only unified `.gameCard`/`.gameListItem`
hover and focus. The real compounding effect was pga's "hover wins while mousing" stale-focus
suppression (`.gameList:hover .gameCard:focus-within:not(:hover)`): because it fired whenever the
mouse cursor was merely RESTING over the grid (not just while actively mousing), it erased
gamepad focus on library cards outright, in a way unrelated to the three named surfaces above.

**The F1/F2 mechanism** (why the fix is CSS-only, not a `.focus()` call-site fix). Tauri's gamepad
input (`src/preload/api/tauriGamepadInput.ts`) dispatches UNTRUSTED synthetic `KeyboardEvent`s and
then moves focus with a bare `.focus()` (`doTab`, `moveFocusDirectionally`), never passing
`{ focusVisible: true }`; Console Mode's own `.focus()` calls do the same. Chromium/WebKit decide
whether a script `.focus()` matches `:focus-visible` from the last TRUSTED interaction, so a
gamepad press frequently does not match it. The fix layers a second selector arm onto every
targeted rule, `X:focus:is(body.controllerLayout *)`, keying off the `body.controllerLayout` class
`GlobalState.tsx` already toggles on the `controller-changed` event (see `UI/InfoIcon/index.css:15`
for the prior art). The suffix form is required, not a `body.controllerLayout X:focus` prefix —
most tier-2 rules are nested inside `.NavShell__tier2Portal`, where a prefix form compiles to
`.NavShell__tier2Portal body.controllerLayout ...` and can never match.

**Restyled surfaces:**
- Console Mode `.consoleChip` (including `.active`) and the cancel/danger pill
  (`.consoleQuitButton`, `.consoleQuitButton.danger`) — `src/frontend/screens/ConsoleMode/index.scss`
- The game-page Steam install caret (`.SteamInstallCaret .dropdownButton`) —
  `src/frontend/screens/Game/GamePage/index.css`
- Tier-2 filter panel: the collapsible group header (`.FilterFacetGroup .dropdownButton`), a facet
  row (`.FilterFacetRow`), and a `FilterMoreGroup` "only" button (`.FilterMoreGroup__only`) —
  `FilterFacetGroup/index.scss`, `FilterMoreGroup/index.scss`
- `NavItem` (covers `FilterCollectionList__row`), including a theme-survival fix: the old rule
  consumed the undefined `--text-hover` token, which dropped the entire focus outline in
  gruvbox_dark and dracula — `NavItem/index.scss`
- `.gameCard` / `.gameListItem` in the Library grid and list: hover and focus were unified by
  260925-pga and are now split back apart (subtle hover, loud token-driven focus), and the three
  stale-focus suppression rules are now scoped to `body:not(.controllerLayout)` so a cursor resting
  over the grid no longer erases gamepad focus — `GameCard/index.css`

**Remaining surfaces NOT swept** (same F1 exposure, not touched by this quick task): NavTabs
tier-1's own `&:focus-visible` (which also consumes `--text-hover` and is left as a known
remaining gap), `FormControl`, `_buttons.scss` variants generally, Settings footer buttons, and any
other `:focus-visible`-only rule across `src/frontend` not listed above.

**Live-sweep checklist for the operator** (run on the Mac, with a controller connected):

1. Console Mode chips, including an active chip.
2. Console Mode cancel and danger pills.
3. Tier-2 Games filter panel: collapsible group headers, a facet row, a checked facet row, a
   collection row, and a "More" group's "only" button.
4. Game page Steam install caret.
5. Library grid and list with the mouse cursor RESTING over the grid while navigating with the
   gamepad — confirm the ring is no longer erased just because the cursor is parked there.
6. Hover versus focus visibly different: hover one card while a different card is focused, and
   confirm they read as distinct states.
7. Repeat steps 1, 3 and 5 on midnightMirage, gruvbox_dark, dracula-classic and nord-light (light
   theme).
