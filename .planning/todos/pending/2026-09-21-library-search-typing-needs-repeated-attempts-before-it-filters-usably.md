---
created: 2026-09-21T00:00:00.000Z
title: "Library search bar: typing needs repeated attempts before it filters usably (Half A, spun out of the mouse-dead debug session)"
area: ui-search
severity: minor
platform: any
ready: live-gate
files:
  - src/frontend/components/UI/SearchBar/index.tsx
  - src/frontend/components/UI/LibrarySearchBar/index.tsx
---

## Context

Spun out of `.planning/debug/library-searchbar-mouse-dead.md` (now `resolved/`) and the source
todo it investigated, `2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`
(now `completed/`), per that file's own closing discipline: Half A had to get its own home
**before** the source todo closed, because closing on a title going false is exactly how the
`loadingInstalled` candidate was lost for three weeks on this same surface before.

This is **not** mooted by that session's fix. The session removed `SearchBar`'s
`.autoComplete` suggestions dropdown entirely (operator decision — the search is modelled on
Playnite: typing narrows the main Library grid, and list view already gives the row-like
presentation the dropdown was offering). The **input itself survives** as filter chrome — it
still drives `LibraryContext.handleSearch` and narrows the grid on every keystroke. Half A is
about that surviving input, not about the removed dropdown, so it needed its own home rather
than closing alongside the dropdown-only defects.

## Repro — operator's verbatim account (originally reported 2026-08-26, against the old
Winetricks search surface; carried forward because the mechanism it points at,
`SearchBar`'s own input plumbing, is shared and still live in `LibrarySearchBar`)

> "very painful, took hovering, typing in search multiple times until line highlighted and then
> needed the panel to 'react' and allow mouse move to move the highlight"

Decomposed for the surviving surface: typing a query into the Library search bar needs several
attempts before the main grid narrows usably — i.e. this is a **debounce/responsiveness**
question about the filter itself, not a highlight/hover question (that half was the removed
dropdown's and is closed as never-diagnosed).

## Where to LOOK — not a diagnosis

Structural facts already recorded in the closed debug session, so nobody re-derives them by
reading the same files again:

- `SearchBar` (`src/frontend/components/UI/SearchBar/index.tsx`) drives its input
  **uncontrolled** — a native `'input'` listener is attached in a `useEffect` with dependency
  array `[input, value, onInputChanged]`, plus a second effect that writes `value` back into
  `input.current.value` whenever it changes externally.
- That pairing — uncontrolled input, plus a value-syncing effect, plus a parent
  (`LibrarySearchBar`) that re-renders per keystroke via `LibraryContext.handleSearch` — is
  where a "needs several attempts" symptom would live if it turns out to be a code defect
  rather than a rendering-latency one.

**This is stated as the place to look, not as a diagnosis.** Nothing about Half A has been
measured on any surface, ever. This project has a recorded history of forming hypotheses about
this exact `SearchBar` primitive purely from reading the source and being wrong all three times
(IPC transport, `:focus-within` blur-unmount, `loadingInstalled` gate — see the closed debug
session for the full record). Measure before theorizing further.

## Ownership

Unowned. No `resolves_phase:` set.

Needs the same live-measurement treatment the mouse-dead investigation eventually got: an
instrumented `pnpm tauri:dev` drive on the operator's real Mac, typing a query into the Library
search bar and observing how many keystrokes / how much latency elapses before the grid narrows
correctly, with rival hypotheses (debounce, re-render cost, `useMemo` dependency churn in
`LibrarySearchBar`, something in `LibraryContext`) ruled out with direct evidence rather than
reasoning from the source alone.
