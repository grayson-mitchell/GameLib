---
task: 260925-ghg
title: Sweep the stale VALIDATION.md drafts — advance only what is evidenced on disk
date: 2026-09-25
status: complete
---

## Scope

Ten `*-VALIDATION.md` files carried `status: draft`. Systemic cause, identified in quick
`260925-e4d`: plan `NN-01` writes `wave_0_complete: false` with "that work belongs to plans NN-04
through NN-10" — true when written — and nobody returns after those plans land.

**Nothing was flipped on the strength of a plan summary.** Every advanced phase was checked
against artifacts on disk, and the tests were run.

## Advanced to `approved` — 7 phases

| phase | boxes ticked | evidence run                                                               |
| ----- | ------------ | -------------------------------------------------------------------------- |
| 12    | 6            | 6 artifacts on disk; humble suites **331 passed**                          |
| 15    | 4            | 4 modules + tests on disk; same **331 passed** run                         |
| 18    | 4            | `games`/`library` tests + `appinfo-32bit.json`; **485 passed**             |
| 20    | 0            | 8 named Wave 0 files all exist; checklist was already ticked               |
| 23    | 5            | coverage located for all 5 items; 4 steam suites **312 passed**            |
| 34.18 | 5            | README literal present, `isIntelMac` **zero** matches in `src/`; 6 passed  |
| 36    | 0            | 3 named files exist; checklist already ticked, `wave_0_complete` already true |

Phases 20 and 36 were pure frontmatter rot — their checklists were complete and their
`wave_0_complete` already `true`. Only `status:` was stale.

## Left `draft` — 3 phases, each annotated in-file with why

- **22** — `parked`, **0 of 8 plans** summarised. None of the work has happened, so an unticked
  checklist is an accurate record. Advancing it would invent a validation contract.
- **44** — **⛔ superseded by Phase 45** at 7/8 plans, `44-08` abandoned rather than finished,
  with named unfixed residue (contrast defect 9 ships at 3.50:1 in nord light; three D-24 row
  states never reached). Its surviving seams are validated in Phase 45, not here.
- **19** — **a different defect, and the reason it is called out separately.** Its three Wave 0
  items are unsubstituted template placeholders — `{tests/test_file.py}`, `{tests/conftest.py}`,
  braces intact, **Python paths in a TypeScript/Rust repo with no Python suite.** This is not
  staleness; nothing was ever authored here. Ticking them would assert three files exist that
  were never meant to. Closing it needs a content decision about a completed phase (most likely
  the template's own escape hatch, "Existing infrastructure covers all phase requirements"), not
  a bookkeeping flip.

## Effect on the explorer, measured after the edits

Three folders turned green: **15, 34.18, 36**.

The other four advanced phases are still held off green by a **different class of artifact**, and
this is deliberately not absorbed into this task:

| phase | remaining          |
| ----- | ------------------ |
| 12    | `12-REVIEW.md` `issues_found`                          |
| 18    | `18-REVIEW.md` + `18-05-REVIEW.md` `issues_found` (red)|
| 20    | `20-REVIEW.md` `issues_found`, `20-UI-SPEC.md` `draft` |
| 23    | `23-REVIEW.md` `issues_found` (red), `23-SECURITY.md` `draft` |

**`REVIEW.md` rot is a known, larger, and structurally different problem.** `parse.js`'s own
comment records it: *"Its `status: issues_found` records what the review FOUND and is never
rewritten when the fixes land — 32 of 37 files in this tree still say it, and only 5 have a
REVIEW-FIX.md sibling."* Clearing those means proving, per review, that the findings were actually
fixed — 32 files of real verification, not a status flip. It is out of scope here and named rather
than started.

## Verification

- `pnpm planning-gates` → 13/13
- `npx prettier --check` over all 10 changed files → clean
- Parser replayed before and after; per-phase rollups recorded above
- Test runs: 331 (humble), 485 (steam games/library), 312 (steam manifest/finalize/attrs/games),
  6 (34.18 gates)
