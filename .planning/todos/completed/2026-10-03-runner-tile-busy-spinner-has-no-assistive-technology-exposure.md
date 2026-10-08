---
created: 2026-10-03T00:00:00.000Z
title: "Runner tile busy spinner (261003-u48) has no AT-reachable state -- tiles are bare unfocusable divs"
area: a11y
severity: minor
platform: any
ready: code
found_by: "Quick task 261003-u48 D-5, noted during plan execution rather than discovered live"
source: ".planning/quick/261003-u48-drop-the-finalizing-modal-from-the-oauth/261003-u48-PLAN.md"
status: "RESOLVED 2026-10-08, quick task 261008-fjj, with one stated limit. Every clickable Runner tile (primary, alternative, logout) now carries role=button, tabIndex 0 (-1 while disabled), aria-disabled while disabled, Enter/Space activation through the same handler and guard as click, and a :focus-visible ring; the primary tile carries aria-busy while busy. The two source gates that pinned 'tiles are untabbable divs' (load-bearing for F-36-02) were re-derived, not deleted, and F-36-02 is re-stated in 34.4.2-PLATFORM-SCOPE.md's Fifteenth update. LIMIT: busy is only ever true while loginInFlight is true, which is exactly when .loginContentWrapper is inert -- on WebKit >= Safari 15.5 that removes the tile from the AX tree, so aria-busy on the tile is correct but masked for the whole time it is set. The AT-perceivable 'mid-login' state on a current macOS is the overlay outside the inert wrapper; the post-window dead-UI gap is the two other quick tasks' job. No live VoiceOver probe ran -- its expected result here is 'tile absent from the AX tree while busy', i.e. it would confirm the mask, not refute the fix."
files:
  - src/frontend/screens/Login/components/Runner/index.tsx
  - src/frontend/screens/Login/index.tsx
---

## Problem

Quick task 261003-u48 moved the OAuth login overlay's "finalizing" wait off a
`Dialog` and onto a decorative busy spinner on the clicked Accounts-screen
tile (`Runner`'s new `busy?: boolean` prop, driven per tile from
`Login/index.tsx` as `busy={openOverlay === '<id>'}`).

That spinner is purely visual. `Runner`'s tiles are plain `<div>` elements
with no `tabIndex`, no `role="button"`, and no `aria-disabled` /
`aria-busy` semantics at all -- this predates this quick task and was out of
scope for it to fix. As a result there is currently no AT-reachable state
that would let assistive technology (or a keyboard-only user) perceive
"this tile is mid-login" the way a sighted mouse user perceives the spinner.
The modal this task removed was at least in the accessibility tree while
it existed (a `Dialog` with a header); the replacement spinner has no
equivalent.

## Why minor / not blocking

- The tiles were already unfocusable, non-semantic divs before this task --
  this task's spinner addition did not create the underlying gap, it just
  made the gap relevant to a new piece of state.
- No shipped claim or test asserts AT-reachability for this spinner; nothing
  is currently silently wrong, there is simply an absent affordance.
- Fixing it properly likely means giving `Runner` tiles real interactive
  semantics (`role`, `tabIndex`, `aria-busy`/`aria-disabled`) as a dedicated
  piece of work, not a one-line addition tacked onto this quick task.

## Direction (not prescriptive)

- Consider `aria-busy="true"` and/or `aria-disabled="true"` on the tile
  root while `busy` is true, once the tile has real focusable/interactive
  semantics to hang it from.
- Any fix should be verified with a real AT probe (VoiceOver rotor / accessibility
  inspector), not just a DOM attribute presence test -- source-gate tests
  alone would not catch a semantics gap like this one.
