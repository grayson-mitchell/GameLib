---
created: 2026-10-03T00:00:00.000Z
title: "Runner tile busy spinner (261003-u48) has no AT-reachable state -- tiles are bare unfocusable divs"
area: a11y
severity: minor
platform: any
ready: code
found_by: "Quick task 261003-u48 D-5, noted during plan execution rather than discovered live"
source: ".planning/quick/261003-u48-drop-the-finalizing-modal-from-the-oauth/261003-u48-PLAN.md"
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
