---
created: 2026-09-21T00:00:00.000Z
title: "Library search bar: typing needs repeated attempts before it filters usably (Half A, spun out of the mouse-dead debug session)"
area: ui-search
severity: medium
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

**Severity was `minor` at filing, raised to `medium` by the operator on 2026-09-21**, recorded
here because the original carried no rationale anywhere in the file. `minor` is defined in
CLAUDE.md as "polish, rough edge, or a latent trap with **no live consequence**", and that does
not fit: the symptom was reported by the operator as "very painful" against a live surface, and
the surface it now points at — the Library search input — is the primary way the library gets
filtered, used on essentially every session. `medium` ("real defect, bounded blast radius,
workaround exists") is the honest cell; the workaround is simply typing again. Note the
severity trap that argues the other way and was considered: the symptom has **never been
measured on this consumer at all**, only on the deleted Winetricks one. Unmeasured is not
evidence of `minor` either, which is why this is `medium` and `ready: live-gate` rather than
scored down on absent data.

Needs the same live-measurement treatment the mouse-dead investigation eventually got: an
instrumented `pnpm tauri:dev` drive on the operator's real Mac, typing a query into the Library
search bar and observing how many keystrokes / how much latency elapses before the grid narrows
correctly, with rival hypotheses (debounce, re-render cost, `useMemo` dependency churn in
`LibrarySearchBar`, something in `LibraryContext`) ruled out with direct evidence rather than
reasoning from the source alone.

## RESOLVED — 2026-09-21

Debug session: `.planning/debug/resolved/library-search-typing-lag.md` (full evidence log there).

**Root cause.** `SearchBar` drove its uncontrolled input via two `useEffect`s — *passive* effects,
which React defers to a task after the commit. Because `LibrarySearchBar` hands down a
fresh-identity `onInputChanged` and a changed `value` on every keystroke (the structural facts
already recorded above), both effects re-armed every render. A native `'input'` event landing in
the gap between a render's commit and that render's deferred flush was still routed to the prior,
not-yet-replaced listener, so it advanced the DOM ahead of the committed `value`; when the
deferred effect finally flushed, it wrote the stale closed-over `value` back into the DOM and
erased the character just typed.

Note the file's own comment was wrong about this and is now corrected: it asserted "the effect
above only runs on mount", which was false — `value` and `onInputChanged` are both in its
dependency array.

**Fix.** Both DOM-sync effects changed `useEffect` → `useLayoutEffect`
(`src/frontend/components/UI/SearchBar/index.tsx`). Layout effects run synchronously inside the
same commit, so there is no task boundary for a native event to land in.

**How the "measure, don't theorize" instruction was honoured.** jsdom is absent from this repo by
a standing decision documented at `src/frontend/jest.config.js:4-14`, so the RTL reproduction this
todo asked for was not buildable without a new dependency. A hook-host harness was built instead
(`src/frontend/components/UI/SearchBar/__tests__/searchBarTypingRace.test.ts`) that drives the
real, unmodified `SearchBar`. It reproduced the rollback deterministically, a negative control
isolated the deferred-flush gap as the necessary condition, and revert-and-confirm-red was run
twice by two different parties with the negative control staying green both ways.

**Honest limits of the evidence.** The harness is a model of React, not React: it treats the
rollback as permanent where real React — which flushes pending passive effects at the start of the
next render — would self-correct it into a flicker, with permanent loss only when a further
keystroke lands in the rolled-back window during sustained typing. This is why `ready: live-gate`
mattered. The live gate was run: operator drove `pnpm tauri:dev` on their Mac 2026-09-21, typed a
multi-character query into the Library search bar, and reported no vanishing characters, no
flicker, no retyping. That run was conducted only in the fixed state, so it confirms the fixed
state is good rather than constituting a before/after measurement; the before/after is the
harness's red/green.

**Not addressed here, and deliberately not smuggled into this closure.** `handleSearch` is still a
bare `setFilterText` with no debounce, and `filterText` still drives the expensive per-keystroke
fuzzy filter at `src/frontend/screens/Library/index.tsx:706-722`. That is a separate potential
contributor to perceived sluggishness. The operator raised no grid-lag complaint on the live run,
so no follow-up todo is being filed on speculation — but this paragraph is the breadcrumb if the
symptom ever returns in that form.
