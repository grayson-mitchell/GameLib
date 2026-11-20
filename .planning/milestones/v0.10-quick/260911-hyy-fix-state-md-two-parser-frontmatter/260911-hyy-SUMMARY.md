---
quick_id: 260911-hyy
date: 2026-09-11
status: complete
title: 'Fix STATE.md frontmatter unreadable by gsd-sdk, and re-scope the repo-wide frontmatter todo'
tasks_completed: 2
tasks_planned: 2
---

# Quick 260911-hyy — SUMMARY

## Outcome

Both tasks complete. The 53-file sweep the original todo asked for was **deliberately not done** —
investigation proved the remedy would have multiplied a live defect by 53.

## What was found

`.planning/` frontmatter is read by two parsers that disagree, and the gate was written against the
one no consumer uses:

- `.planning/planning-frontmatter-gate.py` uses real `js-yaml` 4.1.1.
- Every consumer (`gsd-sdk query frontmatter.get`, `audit-uat`, `progress`, `state`,
  `phase-lifecycle`, `workstream`) uses `sdk/dist/query/frontmatter.js`, a hand-rolled indentation
  stack parser with **no block-scalar support** that never throws.

Quick task 260911-ayu had fixed STATE.md by converting `stopped_at` and `last_activity` to `|-`
block scalars. That made js-yaml happy and made both fields read as the literal string `|-` for
every GSD tool — with the gate green over it the entire time, legitimately, because by its own
parser the document was perfect.

`phase-lifecycle.js:1122` compounded it: `frontmatter.replace(/stopped_at:\s*.+/, …)` does not
cross newlines, so the next phase-completion write would have rewritten the `stopped_at: |-` line
and orphaned the narrative beneath it. Simulated against the real file, that produced
`bad indentation of a mapping entry (6:103)` and stranded the old value under the new one.

Tested across both parsers, **no frontmatter shape is faithful to both** for general English:
single-quoting agrees until the text contains an apostrophe, double-quoting leaks `\"`, block
scalars return `|-`, and raw quotes break js-yaml.

## Task 1 — STATE.md repaired

`stopped_at` (1 line, 367 chars) and `last_activity` (7 lines, 7191 chars) converted to single-line
single-quoted scalars, matching the file's own house style for narrative (`**Current focus:**` on
line 32 is a single ~20k-character line).

Applied by verified script, 17/17 checks green before any write:

- js-yaml parses as a mapping; both values equal the originals (`last_activity` 7191 -> 7188 chars,
  exactly the three blank-line separators becoming single spaces — every word asserted present).
- `gsd-sdk` returns real narrative: 368 and 7200 chars, the +1/+12 being the `''` escapes for the
  1 and 12 apostrophes. No longer `|-`.
- Time bomb defused: the simulated `phase-lifecycle` rewrite now parses cleanly.
- All other frontmatter keys unchanged; body byte-identical; diff is frontmatter-only (+2/-10).

## Task 2 — todo re-scoped

`.planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md`
rewritten: `severity: minor` -> `medium`, its false "none of these files are read by tooling as
YAML" claim corrected, and its remedy replaced with the real ordering — settle the parser question
first, fix the 53 second, and only then gate, with a gate that asserts the **two parsers agree**
rather than that js-yaml alone parses.

## Gates

- `pnpm planning-gates`: 10/10 PASS (unchanged from the pre-work baseline).
- Corpus re-measured: still 53 of 2444 failures — no new offender introduced by this task.

## Left open deliberately

- The 53 files are untouched and remain the re-scoped todo's subject.
- `34.1-VERIFICATION.md`'s duplicate key hides a genuinely misfiled record (fields at frontmatter
  lines 93-97 describe the Window-buttons item but sit in the tray item's mapping). Needs human
  judgement; recorded in the todo.
- `planning-frontmatter-gate.py`'s docstring still prescribes the `|-` form that caused this. Left
  as the re-scoped todo's item 3 rather than patched here, since the right fix is an
  agreement-asserting gate, not a comment edit.
