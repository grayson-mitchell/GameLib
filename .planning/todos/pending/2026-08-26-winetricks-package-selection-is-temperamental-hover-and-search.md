---
created: 2026-08-26T18:10:00.000Z
title: "UX FIX (NARROWED 2026-09-15): the Winetricks search box needs repeated typing before it filters usably, and suggestion rows do not highlight under the pointer — the Install-click half shipped in 366e719bb"
area: ui
status: OPEN
severity: major
platform: any
ready: live-gate
files:
  - src/frontend/components/UI/Winetricks/index.tsx
  - src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx
  - src/frontend/components/UI/SearchBar/index.tsx
  - src/frontend/components/UI/SearchBar/index.scss
  - src/frontend/components/UI/SearchBar/searchProbe.ts
---

**Filename deliberately retained despite the title change.** ~8 planning documents reference
this file by its 2026-08-26 name (the 34.6 live gate, `35-10-SUMMARY.md`, `34.18-CONTEXT.md`,
`43-CONTEXT.md`, the `260826-s2f` quick SUMMARY, and the `260905-upz` staleness audit).
Renaming it would silently strand every one of those cross-references. Do not "tidy" the
filename to match the title — the mismatch is intentional.

## Status — NARROWED 2026-09-15

The original four-item scope split, on evidence:

| Item | Status | Evidence |
|------|--------|----------|
| Half B — "Install fires on first click" | **SHIPPED** | `366e719bb` (plan 35-25). A parent (`Winetricks/index.tsx`) `installing`/`loadingInstalled` state flip was remounting the whole `WinetricksSearchBar` mid-mousedown-to-mouseup; fixed by capturing install intent on `mousedown` instead of waiting for `click`. Live-proven: two real installs, `vcrun2005` and `vcrun2008`, in `gamelib.log`. |
| Item 4 — "correct the stale 'proven by measurement' comment in `SearchBar/index.tsx`" | **SHIPPED** | That comment now carries a `ROOT CAUSE FOUND (Phase 35 Plan 25 ...)` retraction at `SearchBar/index.tsx:129-145`. |
| Half B — "the highlight must track the mouse without the panel needing to react first" | **REMAINS** | Not touched by `366e719bb` (that commit's only change to `SearchBar/index.tsx` was the comment). |
| Half A — "typing should filter to a usable result set on the first attempt" | **REMAINS, and never investigated** | Nothing in the record shows Half A was ever tried and failed — it was never opened. Every measurement taken since 2026-08-25 was aimed at the Install-click / highlight symptom, never at search filtering itself. |

The 2026-08-24 todo this file cross-references
(`.planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md`)
is now closed — see that file's own `## RESOLVED 2026-09-15` section for the full mechanism.
Most of the (A)/(B) IPC-transport narrowing that todo did on 2026-08-24 was itself overturned by
its own later sections (the defect was never IPC at all); this file does not carry that refuted
analysis forward. A pointer to the closed file replaces it.

## What remains — Half A: the search box

Carried forward verbatim from the operator, 2026-08-26:

> "very painful, took hovering, typing in search multiple times until line highlighted and then
> needed the panel to 'react' and allow mouse move to move the highlight"

Two structural facts a future investigator gets for free, and should not re-derive by reading
the same two files again:

- `WinetricksSearchBar` (`Winetricks/WinetricksSearch/index.tsx`) has **no debounce at all** —
  its `useEffect` filters synchronously on every keystroke, with `search.length < 2` as the
  only gate.
- `SearchBar` (`SearchBar/index.tsx`) drives its input **uncontrolled**: a native `'input'`
  listener is attached in a `useEffect` whose dependency array is
  `[input, value, onInputChanged]`, and a second effect writes `value` back into
  `input.current.value` whenever it changes externally.

That pairing — uncontrolled input, plus a value-syncing effect, plus a parent that re-renders
per keystroke — is where a "needs several attempts" symptom would live **if** it turns out to
be a code defect rather than a rendering-latency one. **This is stated as the place to LOOK,
not as a diagnosis.** Nothing about Half A has been measured yet; treat it exactly as
unexplored.

## What remains — Half B: rows do not highlight under the pointer

`.planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`
reports the identical non-highlighting symptom on the **Library** consumer of the same
`SearchBar` primitive — a different consumer, and per that file's own analysis, not
necessarily the same underlying cause as anything measured for winetricks. One instrument
should be able to settle both at once, and that instrument now exists: see `## The instrument`
below.

## An explicitly UNPROVEN lead: this may be a CONTRAST defect, not a pointer defect

The 2026-08-24 todo's PARKED section (item 6, dated 2026-08-25) recorded, verbatim: *"The row
not visibly highlighting on hover is unexplained but may simply be `var(--accent)` being
low-contrast in this theme — it was NOT treated as evidence."* It was set aside then and never
taken up.

Measured at planning time for this rewrite: the only hover styling anywhere on this surface is
`SearchBar/index.scss:52-55`:

```scss
&:hover {
  background-color: var(--accent);
  color: var(--background);
}
```

`--accent` has **10** per-theme definitions in `src/frontend/themes.scss`, ranging from vivid
(`#e0ab40`, `#00ddff`, `#ff9af7`) down to `#30444a` — a dark slate that would be near-invisible
as a highlight rendered over a dark `--input-background`.

**The consequence, stated sharply:** if this is a contrast defect, the row IS highlighting and
the pointer IS reaching it, and every hypothesis in this codebase's history about
pointer-events, overlays, and hit-testing on this surface is chasing a bug that does not exist.
If it is NOT contrast, that whole family of hypotheses is back in play. These are different
bugs with different fixes, and this is the cheapest observation that partitions the space —
exactly what the 2026-08-24 todo said about it on 2026-08-25, before it was set aside.

**Mark this `UNPROVEN`.** Do not write it up as the likely answer in any future work on this
file — two confident answers about this surface (IPC transport, then `:focus-within` focus
loss) have already been formed by code reading and both were wrong.

## The instrument

`src/frontend/components/UI/SearchBar/searchProbe.ts` (built by this same batch of work, quick
task `260915-lhm`) is a default-OFF, opt-in live-measurement harness attached to the shared
`SearchBar` suggestions list. Retrieval and drive instructions:
`.planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md`.

For THIS todo specifically, one drive answers the question in `## An explicitly UNPROVEN
lead` above: it records, per hovered row, whether `li:hover` matches under the pointer at all,
the computed background of the hovered row versus the surrounding `<ul>`, and the contrast
ratio between them. It does not diagnose Half A (the search-filtering symptom) — it was built
for the pointer/highlight question, not the debounce question.

## Why this file is not closed

Half A has never been investigated, and closing this file would bury that fact — a future
reader searching `completed/` for "winetricks search" would find nothing, and Half A would be
lost rather than merely unresolved. This file stays `status: OPEN` in `pending/` until both
Half A and the highlight half of Half B have an actual measurement behind them, not before.

`ready:` is changed from `code` to `live-gate` here, honestly rather than as bookkeeping: both
remaining halves are characterised only by operator prose from a live drive, and this project
has already had **three** hypotheses about this surface formed purely by code reading, all
three wrong. Marking this `ready: code` would advertise it as desk-pickup-able when the first
honest step on either remaining half is a live measurement on this Mac, not a code read.

## Notes

No `resolves_phase:` — 34.6 is verified `passed` and must not auto-close this file.

Related: [[a-test-can-pin-the-defect-it-should-catch]] · the Step 4 SUPERSEDES section in
`34.6-LIVE-GATE.md` ·
`.planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md`
(closed 2026-09-15) ·
`.planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`
(the Library consumer's symptom, and the instrument's other intended use).
