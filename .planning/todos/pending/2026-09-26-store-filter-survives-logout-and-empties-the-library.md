---
created: 2026-09-26
title: 'A store filter survives logging out of that store, leaving a correctly-filtered but empty library with no explanation'
found_during: Phase 38 sitting 5 (quick 260926-a1l), incidental to the 38-W06 Epic logout
severity: medium
platform: any
ready: code
area: library-filters
files:
  - src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.tsx
  - src/frontend/state/GlobalStateV2.ts
---

## Mechanism

Operator-reported during the sitting, and diagnosed by the operator themselves:

> when you log out of a store, but have that store selected as a filter that then shows a empty
> library. should probably clear the store selection if you log out.

Selecting a store as a library filter and then logging out of that store leaves the filter in
place. The library then renders empty — **correctly**, given the filter — but the user has no
signal that a filter is the reason, and the obvious reading is "my library disappeared".

## Why this was nearly mis-filed, recorded so it is not re-opened as the wrong bug

This first surfaced in the sitting as "gamelib had no games in library even though we have tested
the update where installed games show even when logged out", i.e. as a suspected regression of
`7c52cb35d` (`fix(debug-steam-library-shows-logged-out): hide the online collection on an expired
Steam session`) and `resolveSteamVisibility` (quick `260924-g7r`). **It is not that.** The operator
identified the real cause afterwards. Those commits govern whether the *online collection* is
hidden on an expired session; this is an independent filter-state problem that would produce an
empty library even with that logic working perfectly. Do not chase `resolveSteamVisibility` from
this todo.

## Suggested shape, not a locked decision

The operator's own suggestion is to clear the store selection on logout of that store. Two
alternatives worth weighing before implementing, because silently mutating a user's filter is its
own surprise:

1. **Clear the selection** on logout of that store (operator's suggestion — simplest, and the
   empty state disappears).
2. **Keep the filter but surface it** — an empty-library state that names the active store filter
   and offers to clear it. Preserves intent and teaches the mechanism, at the cost of a new empty
   state.

Prefer whichever is consistent with how the library already handles a filter that matches nothing
for other reasons; check that before adding a new pattern.

`severity: medium` — a real defect with a bounded blast radius and an available workaround (clear
the filter by hand), but it presents as data loss to the user, which is why it is not `minor`.

## Verification (once fixed)

Select a single store as a library filter, log out of that store, and observe the library. The
user must end in a state that either shows their remaining games or explains why it is empty —
never a bare empty library with an invisible active filter.
