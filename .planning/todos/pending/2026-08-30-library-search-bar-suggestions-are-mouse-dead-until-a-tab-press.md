---
created: 2026-08-30T09:20:00.000Z
title: "Library SearchBar suggestions are MOUSE-DEAD until a Tab press — rows do not hover-highlight, and Tab on a highlighted row is what re-enables clicking"
area: ui-search
status: OPEN
severity: major
files:
  - src/frontend/components/UI/SearchBar/index.tsx
  - src/frontend/components/UI/SearchBar/index.scss
---

## Context

Reported by the operator on 2026-08-30 while running **step 6** of plan `35-25`'s blocking
human gate — the regression check on the shared `SearchBar` component, driven from the main
**Library** search bar.

Step 6 was phrased as "confirm clicking a suggestion **still** works normally". It cannot pass
as written: the operator's response was *"this has always been flaky"*. The check was measuring
against a baseline that was never normal — it disqualified its own fixture. Steps 3 and 5 of the
same gate PASSED (winetricks Install now works by mouse, twice, with real installs of `vcrun2005`
and `vcrun2008` proven in `gamelib.log`), so this is **not** a regression from `35-25`.

**Verified not caused by `35-25`:** commit `366e719bb`'s only change to `SearchBar/index.tsx` is a
comment. Every behavioural edit in that commit is inside
`Winetricks/WinetricksSearch/index.tsx`.

## Repro — operator's verbatim account

> after a search i have to move the mouse down into the search list and then move back up to the
> first item, the rows do not highlight automatically, I have to do the mouse move just roght and
> a row will be highlighted. I can't click then though, once i have a highlighted row i can press
> tab, and that then enables the mouse so it can now click on a selection. (if there is not row
> highlighted tab just tabs away from the search and i have to repeat from scratch).

Decomposed:

1. Type a query in the Library search bar; the suggestions list appears.
2. Hovering a row does **not** highlight it. Highlight is only obtainable by moving the pointer
   *down into* the list and then *back up* to the first item, and the gesture has to be "just
   right".
3. Even with a row highlighted, **clicking does nothing**.
4. Pressing **Tab** while a row is highlighted "enables the mouse" — clicking then works.
5. If **no** row is highlighted, Tab instead moves focus away from the search entirely and the
   sequence must restart from scratch.

## Why this is NOT the winetricks mechanism

Two consumers of one component failing for two different reasons — do not assume one fix covers
both.

- **Winetricks** (fixed in `35-25`, commit `366e719bb`): a parent (`Winetricks/index.tsx`) state
  flip on `installing` / `loadingInstalled` unmounted-and-remounted the whole
  `WinetricksSearchBar` ~4ms after `mousedown` and ~60ms before `mouseup`, so `mouseup` landed on
  an unrelated element and no `click` was ever synthesized. Live-measured. **Focus was never
  lost** — `document.activeElement` stayed on the `<input>` throughout, which is what ruled out
  the `:focus-within` theory for that surface.
- **This defect**: step 4 above (Tab is what re-enables the mouse) is a **focus-state**
  signature. That points back at the `:focus-within` family that was correctly ruled out for
  winetricks. Hypothesis only — it has **not** been live-measured and must not be treated as
  diagnosed. Note this project's recorded history on this exact symptom: two hypotheses were
  formed for the mouse-dead/keyboard-works button and **both were wrong**. Measure before fixing.

## Record correction owed

`366e719bb` added a comment in `SearchBar/index.tsx` asserting the existing `onMouseDown`
`preventDefault()` guard (from 34.6-16/17) "is UNCHANGED and still correct... `LibrarySearchBar`'s
shared consumption of this same `<ul>` still depends on it."

That framing is at least incomplete: the guard may well be load-bearing, but it is demonstrably
**not sufficient** for the Library consumer, which is broken in the field. The next person reading
that comment would reasonably conclude the Library path is healthy. Amend it when this is fixed.

## Ownership

Unowned. No `resolves_phase:` is set deliberately — Phase 35's gap-closure scope fence covers the
5 verification gaps and the 4 review criticals only, and this is neither. It must **not**
auto-close when Phase 35 completes.

Needs the same live-measurement treatment `35-25` Task 1 gave winetricks: an instrumented
`pnpm tauri:dev` build, DOM mutation + focus instrumentation across the `mousedown`/`mouseup`
window, and rival hypotheses ruled out with direct evidence rather than reasoning.
