---
created: 2026-08-26T18:10:00.000Z
title: "UX FIX: the Winetricks search + package-selection interaction is temperamental — searching repeatedly and hovering is required before the panel commits a selection, and an Install click before that silently does nothing"
area: ui
status: OPEN
severity: major
files:
  - src/frontend/components/UI/Winetricks/index.tsx
  - src/frontend/components/UI/Winetricks/WinetricksSearch.tsx
  - src/frontend/components/UI/SearchBar/index.tsx
---

## Observed

Operator, 2026-08-26, driving the `34.6-LIVE-GATE.md` Step 4 re-drive (quick task `260826-s2f`),
verbatim:

> "very painful, took hovering, typing in search multiple times until line highlighted and then
> needed the panel to 'react' and allow mouse move to move the highlight"

The install DID eventually succeed — `[GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall` fired and
`winetricks -q comctl32ocx` ran. But reaching a committed selection took repeated searching and
hovering, and the panel had to "react" before mouse movement would move the highlight.

## Why this matters far more than a rough edge

This is the operator's attribution for **live-gate Step 4's original FAIL** — one of the two items
that put `34.6-LIVE-GATE.md` at `verdict: FAIL 7/9`. In run 1 (2026-08-24) the operator clicked
Install on a rendered `corefonts` row and **nothing was sent at all**: no D-11 observable, no
`winetricks -q` invocation, not one byte written to `gamelib.log` for 14 minutes afterwards.

That cost a full gap cycle to investigate and it is still formally unexplained. If a rendered row
can be clicked while the panel holds no committed selection, a user gets a dead button with no
feedback — the exact failure shape this project has hit before (the Phase 30 Steam logout button).

## Consistency with what was already measured — read this before re-investigating

`.planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md`
narrowed the defect to **(B)**: the frame never reaches `dispatchSend`, strictly between the
renderer's `window.api.winetricksInstall(...)` call and the sidecar's `handleFrame`. It
individually EXCLUDED, by measurement: unported; missing from the bundle; stale build; undeclared in
`SyncIPCFunctions`; Rust-side allowlist drop; the renderer's `declined` guard; the preload binding
(`winetricksInstall:di` present in the running `build/preload/index.js`); and SyntheticEvent arg
serialisation.

A row that RENDERS but is not SELECTED is consistent with every one of those exclusions
simultaneously — which is what makes this hypothesis the strongest one yet.

**It is NOT proven.** No instrumented run has captured the failing and succeeding interactions side
by side. This project has already had TWO explanations for this defect fail, the `:focus-within`
theory having been withdrawn as DISPROVEN by live re-drive. Do not treat this todo as a diagnosis.

## Scope: this is a FIX request, not only an investigation

Operator instruction, 2026-08-26: fix the search UX on the Winetricks panel. The two halves are one
job and should be done together, because the search box is what produces the rows the selection
state machine then fails to commit:

**Half A — search.** Typing in the search box should filter to a usable result set on the first
attempt. Today it takes several attempts before rows appear/behave, and the operator had to type
repeatedly. Look at `WinetricksSearch.tsx` and the shared `SearchBar/index.tsx` for debounce,
re-render and controlled/uncontrolled-value handling; note the search box is shared, so any change
must not regress other consumers.

**Half B — selection.** A row that renders must be selectable on first hover/click, the highlight
must track the mouse without the panel needing to "react" first, and **Install must never be
clickable with no committed selection** — either disable it or fail loudly. A silent dead button is
the failure shape this whole gap cycle was spent chasing.

Acceptance: open the panel cold, type one query, click one row, click Install — and have it work,
once, without repetition.

## Suggested approach

1. Read the selection state machine in `Winetricks/index.tsx` and `WinetricksSearch.tsx` — find
   what actually commits a highlighted row, and whether Install can fire with none committed.
2. If it can, that is the bug regardless of whether it explains Step 4: make Install either
   disabled without a selection, or fail loudly.
3. Only then attempt to reproduce run 1's silent no-op deliberately, which would finally settle the
   cause.
4. Note `SearchBar/index.tsx` still carries 34.6-16's `preventDefault` guard with a stale
   "Proven by measurement / DO NOT REMOVE" comment (`34.6-REVIEW.md` WR-03) whose stated rationale
   was disproven. Correct or remove that comment while in here — a false "proven" note is worse
   than none.

## Notes

No `resolves_phase:` — 34.6 is verified `passed` and must not auto-close this. Filed because the
operator believed a todo for it already existed; a search of `pending/` and `completed/` found none,
so without this file the cause identified during the Step 4 re-drive would have gone unowned.

Related: [[a-test-can-pin-the-defect-it-should-catch]] · the Step 4 SUPERSEDES section in
`34.6-LIVE-GATE.md`.
