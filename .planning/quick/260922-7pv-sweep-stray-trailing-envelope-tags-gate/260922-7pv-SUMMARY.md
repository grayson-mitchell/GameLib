---
phase: quick
plan: 260922-7pv
subsystem: planning-gates
tags: [gates, ci, authoring-artifact, planning-hygiene, python]
requires:
  - phase: none (standalone quick task; builds on the observation filed in the
      2026-09-21 "agents emit a stray trailing closing tag" todo)
provides:
  - a twelfth planning gate (.planning/planning-envelope-tag-gate.py) that
    detects an unpaired trailing envelope-tag line in any git-tracked
    .planning/**/*.md file
  - a corrected, closed census of the artifact (43 files, not the 6
    originally observed) and a swept, gate-green tree
affects:
  - meta/runPlanningGates.py
  - any future .planning/**/*.md authoring session (the gate now runs in
    pnpm planning-gates / CI)
tech-stack:
  added: []
  patterns:
    - "gate predicate shared unmodified between live scan, self-test, and the
      one-time sweep script (imported via importlib, never reimplemented)"
    - "split-literal spelling for tag-shaped strings in gate source/self-test
      (`\"<\" + \"/\" + name + \">\"`), so the gate's own corpus-widening
      cannot self-convict and prose describing the artifact cannot either"
    - "anti-vacuity pin on a domain engagement signal (>0 files ending in a
      genuinely paired closing tag), not pinned to the measured figure"
key-files:
  created:
    - .planning/planning-envelope-tag-gate.py
  modified:
    - meta/runPlanningGates.py
    - 43 .planning/**/*.md files (19 phases/, 23 quick/, 1 debug/) — trailing
      orphan tag line(s) deleted, nothing else
    - .planning/todos/completed/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md
      (moved from pending/, rewritten with the corrected census)
key-decisions:
  - "800-vs-831 is a resolved conflation, not a disagreement: 800 counts files
    ending in a genuinely paired bare output tag specifically; 831 (867
    post-sweep) counts files ending in ANY genuinely paired tag name. Both
    are correct measurements of different populations from the same scan."
  - "No exemption ledger: the predicate (bare closing tag, alone on its line,
    in the trailing run, name in {content, invoke}, no earlier opening tag)
    is narrow enough that no exemption is ever needed. Response to a future
    gate failure is always: delete the stray tag, never widen the set."
  - "MINIMUM_EXPECTED_GATES raised 11 -> 12 with a matching inventory comment,
    so the new gate's own deletion cannot go unnoticed the way the underlying
    43-file defect did for 78 days."
requirements-completed: [QUICK-260922-7PV]
metrics:
  duration: "~9 min measured between first and last task commit (05:49:43 ->
    05:58:08, commit timestamps); total session time including gate authoring
    and self-test iteration was longer and was not separately instrumented"
  completed: "2026-09-21"
---

# Quick Task 260922-7pv: Sweep Stray Trailing Envelope-Tags, Add a Gate Summary

**Authored a 12th planning gate that detects an agent's own tool-call envelope leaking a raw closing tag as a planning file's trailing line, used the gate's own predicate to sweep the 43 files it named, and closed the cause-todo with the corrected census.**

## Performance

- **Started:** commit `e5e684847` at 2026-09-22T05:49:43+12:00 (task 1)
- **Completed:** commit `57af0dcfc` at 2026-09-22T05:58:08+12:00 (task 3)
- **Tasks:** 3/3 completed, in strict order (task 1 before task 2 — the gate is the census instrument)
- **Files modified:** 46 (1 new gate + 1 runner edit + 43 swept markdown files) in tasks 1–2, plus 1 moved/rewritten todo in task 3

## Accomplishments

- Authored `.planning/planning-envelope-tag-gate.py`, a pure-predicate gate (`trailing_closing_tags` / `orphan_tag_lines` / `ends_in_paired_closing_tag`) shared unmodified between its own 11-case self-test, the live scan, and the sweep script that used it via `importlib` — never reimplemented.
- Task 1's commit is deliberately RED at HEAD by design: the gate names 43 offending files and `pnpm planning-gates` reports `11/12`, because the gate is also the census instrument and had to name the population before task 2 could empty it.
- Swept exactly the 43 named files via the gate's own predicate, deleting only the trailing orphan tag run from each. `git diff --numstat` confirmed `0 added, 68 deleted` across 43 files — an exact match to the plan's measured baseline.
- Closed the cause-todo (`git mv` first, then rewrite, then `git add`, then `git show :<path> | tail -20` to verify staged content — this repo's known trap-avoidance order for `git mv`), correcting its scope from "todo bodies" (the 6 files that first surfaced it) to "any planning file" (the real 43-file, 0-todos population).
- `pnpm planning-gates` now reports `12/12`.

## Task Commits

1. **Task 1: author the gate, wire it in, deliberately red** — `e5e684847` (feat)
2. **Task 2: sweep the 43 named files via the gate's own predicate** — `6b2b7d6a9` (fix)
3. **Task 3: rewrite and close the cause-todo with the corrected census** — `57af0dcfc` (docs)

**Not committed by this task (reserved for the orchestrator):** `260922-7pv-PLAN.md`, this `260922-7pv-SUMMARY.md`, and `.planning/STATE.md`. No push was performed at any point.

## Files Created/Modified

- `.planning/planning-envelope-tag-gate.py` — new; the 12th planning gate
- `meta/runPlanningGates.py` — `MINIMUM_EXPECTED_GATES` 11 → 12, matching inventory comment added
- 43 `.planning/**/*.md` files — trailing orphan envelope-tag line(s) deleted (18 files: 1 line; 25 files: 2 lines; 68 lines total), nothing else touched
- `.planning/todos/completed/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md` — moved from `pending/`, frontmatter and body rewritten to state the corrected 43-file, any-planning-file census and record the resolution

## Measured Figures vs Plan's Expected Baseline

| figure | plan expected | measured | match |
| --- | --- | --- | --- |
| offending file count | 43 | 43 | yes |
| total orphan lines deleted | 68 | 68 | yes |
| directory split | 19 phases/, 23 quick/, 1 debug/, 0 todos/, 0 outside .planning/ | 19 / 23 / 1 / 0 / 0 | yes |
| shape split | 18 one-line, 25 two-line | 18 one-line, 25 two-line | yes |
| distinct introducing commits | 33 | 33 | yes |
| date span | 2026-07-05 → 2026-09-21 (78 days) | same | yes |
| `pnpm planning-gates` after task 1 | `11/12 planning gates passed.` (deliberately red) | `11/12 planning gates passed.` | yes |
| `pnpm planning-gates` after task 3 | `12/12 planning gates passed.` | `12/12 planning gates passed.` | yes |

Every figure the plan committed to in advance was reproduced exactly. No plan-vs-measurement disagreement was found anywhere in this task.

## The 831-vs-800 Question: Resolved Conflation, Not a Disagreement

The plan flagged two candidate figures for "how many files legitimately end in a paired closing tag" and asked this execution to resolve which was correct. Measured directly against the git-tracked `.planning/**/*.md` corpus, pre-sweep:

- **800** — files ending, after stripping trailing blank lines, in a genuinely paired bare closing `**output**` tag specifically. This is the correct figure for "how many files legitimately end the GSD-template way."
- **831** (867 post-sweep, since the sweep removed orphan lines that were sitting in front of some paired blocks and shortened others' trailing runs) — files ending in a genuinely paired closing tag of **any** name, not just `output`.

These are not two measurements disagreeing about the same population — they are two different, both-correct populations from the same scan (a subset relationship: every `output`-paired file is counted in the all-names figure, plus a small number of files legitimately paired on a different tag name). **800 is the correct figure to use** for the gate's anti-vacuity floor and for any future prose citing "the paired-output population." This is stated here as a resolved conflation.

## Authoring Hygiene Self-Check (this task's own writing)

Every file authored by this execution was checked for the exact artifact being gated, via `tail -3 | cat -e` (and `od -c` for the gate source itself):

- `.planning/planning-envelope-tag-gate.py` — clean tail, no trailing artifact.
- `meta/runPlanningGates.py` — clean tail, no trailing artifact.
- `.planning/todos/completed/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md` — clean tail (`cat -e` and `od -c` both checked before staging), no trailing artifact.
- This SUMMARY.md — checked below, in the Self-Check section.

All four came back honestly clean; none needed a silent strip.

## Deviations from Plan

**One, found after this SUMMARY first read "None" — corrected in `b7ffcb682`.**

Every measured figure did match the plan's pre-stated baseline exactly, and the task order was
followed. But one of the plan's `must_haves` did **not** hold as written:

> "Neither the gate's source nor its self-test fixtures contain the joined literal tag strings;
> every such literal is built by concatenation from parts, with a one-line comment saying WHY."

Line 68 of the gate — the docstring paragraph *stating the SPLIT LITERALS rule* — spelled all four
envelope tag shapes joined up, inside the sentence claiming every such literal is built by
concatenation "in this module". Both halves of the trap that paragraph describes were live: a
census grep for the artifact hit the gate itself, and the moment the gate's corpus widens to `.py`
that line convicts this file. The machinery around it was always correct (`_close_tag()` at line
122, the prose convention at line 8); only the one line was wrong.

**Three things worth keeping from how it was found:**

1. **The gate is structurally blind to it.** Its corpus is git-tracked `.md` under `.planning/`,
   so a joined literal in a `.py` gate source cannot be seen by the gate — the same
   blind-by-design property that keeps `todo-frontmatter-gate.py` out of todo bodies. Nothing in
   CI would have reported this. It took a hand-run grep during orchestrator verification.
2. **The Authoring Hygiene self-check above was sound and still missed it.** That check reads
   *tails* for the trailing artifact, and the tails were genuinely clean. Joined literals
   mid-file are an adjacent requirement the tail check cannot see. A passing self-check is
   evidence about what it measured, not about the neighbouring must_have.
3. **"Deviations: None" was written in good faith and was false.** It is corrected here rather
   than the fix being folded in silently, because the ledger is the point.

**Residual, pre-existing, deliberately not swept.** A repo-wide grep for the joined literals still
returns six files: `.idea/HeroicGamesLauncher.iml` (real XML, where the tag is correct and must
stay), `.planning/STATE.md`, `.planning/debug/knowledge-base.md`, `260921-pec-SUMMARY.md`, and
quick task `260921-pvt`'s own PLAN (5) and SUMMARY (3). None is the artifact — all are mid-file
prose or legitimate XML, and the gate correctly leaves every one alone. But they are the recorded
grep-poisoning cost arriving on schedule: the prior task that established the split-spelling
convention did not apply it to its own PLAN and SUMMARY. Rewriting a completed task's records to
clean a grep would be worse than the noise.

## Known Stubs

None. No placeholder values, hardcoded empty renders, or unwired data sources were introduced by this task.

## Threat Flags

None. This task's file set (a planning-hygiene gate, a runner constant, 43 markdown trims, and one todo rewrite) introduces no new network endpoint, auth path, file-access pattern, or schema change at a trust boundary.

## TDD Gate Compliance

Not applicable — this plan's frontmatter is not `type: tdd`, and no task carried `tdd="true"`. The gate itself was built self-test-first (self-test written and iterated to 11/11 passing before the live scan was trusted), but that is an internal authoring discipline, not the plan-level TDD gate sequence.

## Self-Check: PASSED

- `e5e684847` — FOUND in `git log --oneline --all`
- `6b2b7d6a9` — FOUND in `git log --oneline --all`
- `57af0dcfc` — FOUND in `git log --oneline --all`
- `.planning/planning-envelope-tag-gate.py` — FOUND on disk
- `.planning/todos/completed/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md` — FOUND on disk
- `.planning/todos/pending/2026-09-21-agents-emit-a-stray-trailing-closing-tag-into-todo-bodies.md` — CONFIRMED absent (moved, not duplicated)
- `pnpm planning-gates` — re-run after all edits, still reports `12/12 planning gates passed.`
