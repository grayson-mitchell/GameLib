---
quick_id: 260819-p2d
slug: uat-3413-bottle-prefill-note
date: 2026-08-19
status: complete
files_changed: 1
code_changed: false
---

# Quick Task 260819-p2d — Summary

## What changed

`.planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md` only.
Both `G-D05-BOTTLENAME` rows (lines 137/138) gained a code-read finding appended to their
Observation cell. **No Disposition was touched** — both still read `pending`.

- electron row: full evidence chain + the instruction to score the row's three halves separately.
- tauri row: back-reference to the electron note, plus an explicit restatement that ground rule 2
  still requires an independent observation (the seam is runtime-independent React state, which
  is exactly the shape that invites an inferred PASS).

## Why no Disposition change

The finding came from reading source, not from running the app. 34.13's ledger reserves all
dispositions for the human developer at the blocking gate. Writing `FAIL` here would have been
the [[verification-can-check-callsite-not-behaviour]] failure mode in reverse — a ledger cell
asserting an observation nobody made.

## Why no code fix

The underlying defect is a one-line seed on the Steam branch of `InstallModal/index.tsx`.
Deliberately not applied: 34.13's gate is mid-run with rows already scored this session, and
changing the surface under the developer would invalidate them. The fix belongs in the phase's
gap cycle once the gate has scored the row for real.

## Verification

- Both rows re-parsed: 5 pipe-delimited cells each, Disposition `pending` in both.
- Roll-up untouched (72 pending), Recording-integrity counts untouched (36 items × 2 runtimes).
- No file under `src/` modified. The working tree's pre-existing uncommitted changes
  (`src/frontend/screens/Library/index.tsx`, `src/frontend/state/GlobalState.tsx`,
  `.planning/debug/uninstall-game-vanishes.md` — the parked uninstall-vanish debug session) were
  left strictly alone; no stash, no partial staging of anyone else's work.

## Follow-up owed

`G-D05-BOTTLENAME` is now expected to FAIL its prefill half on both runtimes. When the developer
scores it, the phase gains a real gap needing a fix plan.
