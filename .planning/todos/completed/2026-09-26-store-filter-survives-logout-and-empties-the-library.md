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

## Resolution (2026-09-25, quick 260926-gs1)

**What shipped:** a transition-only prune. A pure `pruneDisconnectedStores` helper in
`filterEngine.ts` (six unit tests in `__tests__/filterEngine.test.ts`, including a `toBe` identity
assertion), driven by a `useRef` baseline plus a guarded `useEffect` in `Library/index.tsx` that
persists through `setStoreFacetPersisted`. This is Option 1 above — the operator's own suggestion
— built on the repo's existing D-08a precedent at `Library/index.tsx:431-436` (when the control
that governs a filter is hidden, the filter is cleared).

**Why it is transition-only, not a mount-time intersection:** `epic`/`gog`/`amazon` accounts
arrive from `ContextProvider` asynchronously, so intersecting the persisted selection against
`connectedStores` at mount would silently wipe a legitimately persisted selection during that
account-load window. The helper takes an explicit `previousConnected` baseline and only prunes a
store that was connected in that baseline and has since dropped out of `currentConnected` — no
baseline (first render) means no prune, ever.

**The headline was MEASURED FALSE at HEAD — do not re-open this as the wrong bug.** There was
never "a bare empty library with no explanation." `describeActiveFilters` already emitted
`{kind:'store', value:'legendary'}` for a disconnected-but-selected store; `renderableActiveFilters`
kept it because `RunnerToStore.legendary === 'Epic Games'` makes `chipLabelSpec` non-null; so
`activeFilterCount > 0` and `Library/index.tsx:1214` already rendered `FilterZeroResult` ("No games
match Epic Games." plus a "Clear all filters" button), alongside a removable "Epic Games" chip in
`FilterChipRow`. The real defect was narrower than the headline claimed: a live filter whose PANEL
CONTROL had vanished (`FilterStoreFacet` renders one row per `connectedStores`, D-04), persisted
across restarts with no way to remove it from the panel.

**Option 2 was therefore not implemented, because it already exists.** No new empty state was
added; `FilterZeroResult` and `FilterChipRow` are byte-for-byte unchanged.
