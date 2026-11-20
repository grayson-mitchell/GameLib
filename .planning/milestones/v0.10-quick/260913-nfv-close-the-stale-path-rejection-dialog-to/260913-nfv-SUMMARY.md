---
phase: quick-260913-nfv
plan: 01
status: complete
subsystem: planning records / todo hygiene
tags: [todo-closure, stale-record, staleness-audit-miss, records-correction, docs-only]
requires:
  - .planning/phases/35-electron-cutover-remove-the-electron-build/35-11-SUMMARY.md
provides:
  - .planning/todos/completed/2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window.md
affects:
  - .planning/phases/35-electron-cutover-remove-the-electron-build/35-AB-RETEST.md
  - .planning/phases/34.6-tauri-ipc-re-plumb-slice-9-eos-overlay-steamgriddb-artwork-w/34.6-LIVE-GATE.md
  - .planning/STATE.md
tech-stack:
  added: []
  patterns:
    - "Verify a closure against HEAD before writing it, rather than trusting the task's own framing"
    - "Record the residue a closure does NOT cover, in the closed record itself"
key-files:
  created:
    - .planning/quick/260913-nfv-close-the-stale-path-rejection-dialog-to/260913-nfv-PLAN.md
    - .planning/quick/260913-nfv-close-the-stale-path-rejection-dialog-to/260913-nfv-SUMMARY.md
  moved:
    - ".planning/todos/pending/2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window.md -> completed/"
---

# Quick 260913-nfv — closed a todo that had been fixed for two weeks

## Outcome

`2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window.md` is now in
`completed/`, carrying its closure evidence and — explicitly — the half of the original
complaint that did **not** ship.

**No source file was touched.** `git diff -- src/` was empty throughout. Planning gates 11/11
before and after.

## What was verified before anything was written

The plan's Task 1 existed because the task description asserted the fix; asserting is not
measuring. All three checks passed at HEAD:

| Check | Result |
|---|---|
| `cf28d48f4` exists and is scoped to the dialog stylesheet | 2026-08-29, 1 file, +9/-1 |
| `.errorDialog.error-box` declares `max-height`, not a bare `height` | confirmed; only `max-height: 25em` at `index.css:27` |
| No other rule reintroduces a fixed height | only `themes.scss:458`, which sets `background-color` alone |
| The live PASS survives in the record | `35-11-SUMMARY.md:307` |

The first grep attempt at check 2 returned "no matches" for a spurious reason — zsh glob-expanded
the unquoted `--include=*.css` before grep saw it. That is a zero result caused by the
instrument, and it was re-run quoted **with a positive control** (proving the two stylesheets were
actually reachable) before the count was believed.

## The mechanism, restated

`.errorDialog.error-box` carried an unconditional `height: 25em` — a fixed, content-independent
height — so every `type: 'ERROR'` dialog rendered as a ~400px scrollable console box no matter how
short its message. Phase 35 plan 11 changed it to `max-height: 25em`: long content is unchanged
(still capped, still scrolling on the existing `overflow: auto`), short content sizes down. Fixed
at the rule, so it covers all 31 ERROR call sites, not just the two path-rejection ones.

## Why it stayed open — the finding worth keeping

The 2026-09-05 staleness audit (`260905-upz-AUDIT.md:591`) examined this exact file and filed it
**NOT-CLOSEABLE**: *"Solution explicitly TBD; three options, none chosen."*

The fix had landed six days earlier. And the screen could not have worked even in principle: the
shipped fix took **none of the three options** the todo listed, because it found a better one at
the root. **A staleness screen keyed on whether a todo's own proposed remedy was adopted is blind
to every fix that improved on the remedy** — and "none of the options was chosen" is precisely the
signature such a fix leaves behind. The screen reads as evidence of staleness when it is evidence
of the opposite.

This is the [[a-todos-prescribed-fix-can-already-be-shipped]] family, fourth-plus occurrence.

## Residue — deliberately NOT closed

The operator's original complaint had two halves: the dialog was **oversized**, and the message
should be "sexier" (i.e. visually plain). Only the sizing half shipped. A short one-line
correction still renders in the generic red-titled error modal.

That is recorded in the closed todo rather than folded into the closure. It is a presentation
choice, not a defect, and if still wanted it should be filed on its own terms against a live look
at the current dialog. **It is not claimed fixed.**

## Incidental corrections

- Line-number rot: the todo cited `installFlowRegistration.ts:317`/`:444`; they had drifted to
  `:325`/`:467`. `files:` corrected, and the stylesheet that actually changed was added.
- Two planning docs hardcoded the `pending/` path and were repointed: `35-AB-RETEST.md:668` and
  `34.6-LIVE-GATE.md:2107`.
- The `gamelib.json` de/fr updates the todo anticipated were never owed — the CSS fix made the
  string change unnecessary.

## A defect in this plan's own verification criterion

Task 3's verify line reads:

> `grep -rn "todos/pending/2026-08-26-path-rejection" .planning/` returns zero hits.

**That criterion is unsatisfiable by construction**, because the criterion's own text contains the
string it searches for, and the plan lives under `.planning/`. The grep returns 3 — all three
inside `260913-nfv-PLAN.md` (its `files_modified` entry, its prose, and the verify line itself).

Scored honestly: zero hits **outside the plan directory**, with the unfiltered count of 3 kept as
the positive control so the exclusion cannot silently hide a real dangling reference. Same family
as [[raw-source-gate-is-satisfied-by-the-prose-that-names-it]].

## Records hygiene

- STATE.md: one appended quick-task row; `last_activity` **prepended inside its existing single
  quotes** with apostrophes doubled, asserting the prior value is still a suffix and the length
  grew (42,956 -> 43,918 chars). `git diff --numstat` = `3 2`, and the diff against a
  session-start `cp` snapshot is exactly lines 7–8 plus the inserted row — no mass deletion.
- No `gsd-sdk state.*` verb was run, and no `gsd-executor` subagent was spawned. In sequential
  mode an executor would have run in this tree, and an executor writing STATE.md via those verbs
  is this repo's most-recurring corruption vector. For a four-file docs move that is pure
  downside — a disclosed deviation from the quick workflow's Step 6.
- A 6-character discrepancy in `last_activity`'s length (42,962 vs 42,956) was chased rather than
  waved off, since "a concurrent session edited STATE.md" was the alternative explanation. It was
  awk counting **bytes** against Python counting **characters**, across 5 non-ASCII characters.
- The todo was moved with plain `mv`, never `git mv` — `git mv` stages the rename immediately, and
  a staged rename on this repo gets swept into whatever a concurrent session commits next.
