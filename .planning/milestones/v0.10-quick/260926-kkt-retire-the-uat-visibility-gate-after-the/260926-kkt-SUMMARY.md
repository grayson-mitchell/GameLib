---
phase: quick-260926-kkt
plan: 01
subsystem: planning-infra
tags: [gsd-core, uat, planning-gates, ci, documentation]

requires: []
provides:
  - "Retired `.planning/uat-visibility-gate.py`, whose census measured against a parser (`get-shit-done-cc` 1.42.3's `parseUatItems`) no longer in use"
  - "`meta/runPlanningGates.py` floor lowered 13 -> 12 with a justified history entry in the existing voice"
  - "`.planning/planning-envelope-tag-gate.py` docstrings updated to stop citing the deleted file as a live example"
  - "CLAUDE.md's UAT item shape section rewritten to describe `@opengsd/gsd-core` 1.14.0's actual parser behaviour, from live measurements taken 2026-09-26"
affects: [ci, planning-gates, uat-authoring]

actuals:
  tokens: 12140
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - meta/runPlanningGates.py
    - .planning/planning-envelope-tag-gate.py
    - CLAUDE.md
  deleted:
    - .planning/uat-visibility-gate.py

key-decisions:
  - "Retired the gate outright rather than porting it to gsd-core's parser (operator's locked decision, per the plan objective)"
  - "Lowered the planning-gates floor by exactly one (13 -> 12), matching the discovered gate count, rather than leaving a permanently-red floor over a deliberate deletion"
  - "CLAUDE.md's UAT section now states inline `expected:` as a house preference (diff-cleanliness), not a hard requirement, since gsd-core reads block scalars correctly"

requirements-completed: [QUICK-260926-kkt]

duration: ~15min
completed: 2026-09-26
status: complete
---

# Phase quick-260926-kkt: Retire the UAT Visibility Gate Summary

**Deleted `.planning/uat-visibility-gate.py`, dropped the planning-gates floor from 13 to 12 with a recorded justification, marked the one live cross-reference as retired, and rewrote CLAUDE.md's UAT item shape section against live-measured gsd-core 1.14.0 parser behaviour (418 items / 56 files, 2 parse-gap files).**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-26T15:02:38+12:00
- **Tasks:** 2/2 completed
- **Files modified:** 3 (plus 1 deleted)

## Accomplishments

- `.planning/uat-visibility-gate.py` deleted via `git rm`; no ledger, fixtures, script, or CI line shipped alongside it (confirmed empty blast radius before deletion).
- `meta/runPlanningGates.py`'s `MINIMUM_EXPECTED_GATES` lowered 13 -> 12, with a new history entry in the same voice as the existing 6 -> 7 through 12 -> 13 entries, naming this as the first LOWERING and why it is safe (deliberate retirement, not convenience).
- `.planning/planning-envelope-tag-gate.py`'s two docstring mentions of the retired file updated: the "no `--write` flag" example list now cites only `todo-frontmatter-gate.py`, and the `_mutate()` provenance note marks `uat-visibility-gate.py` as retired in `260926-kkt`.
- CLAUDE.md's "UAT item shape" section rewritten end to end: retitled to drop the blanket "never a block scalar" claim, states the inline-preference rationale honestly (diff-cleanliness, not correctness), documents gsd-core 1.14.0's `parseUatItemsWithStats` behaviour from measurements taken in this session, and names the two live parse gaps (`34.6-UAT.md`, `32-HUMAN-UAT.md`) plainly instead of implying they're fixed.
- `pnpm planning-gates` verified green at `12/12` after each task, plus a monkeypatched negative control proving an 11-gate run still exits 1 — the floor is tight, not just lowered.

## Task Commits

1. **Task 1: Retire the gate end-to-end** - `1fda931c3` (chore) — deletes `.planning/uat-visibility-gate.py`, lowers the runner floor to 12, marks the envelope-tag gate's provenance mention as retired. `git show --stat HEAD` confirmed exactly these three paths.
2. **Task 2: Rewrite CLAUDE.md's UAT item shape section** - `b6c2d70d2` (docs) — rewrites the section from live `audit-uat --raw` output and direct `parseUatItemsWithStats` probes. `git show --stat HEAD` confirmed `CLAUDE.md` only.

_Note: the orchestrator's own docs commit (SUMMARY.md, STATE.md, ROADMAP.md) is separate and not included above per this executor's instructions._

## Files Created/Modified

- `.planning/uat-visibility-gate.py` — deleted (`git rm`). Historical records under `.planning/quick/260912-csq-.../` left untouched.
- `meta/runPlanningGates.py` — floor constant 13 -> 12; new `13 -> 12 (quick task 260926-kkt)` history entry appended after the `12 -> 13` entry. Diff against baseline `1ec323874` deletes exactly one line (the old constant), verified by `git diff --numstat`.
- `.planning/planning-envelope-tag-gate.py` — two docstring edits only (no code/constant/regex/self-test change); both remaining mentions of `uat-visibility-gate.py` now carry `260926-kkt` on the same physical line.
- `CLAUDE.md` — the UAT item shape section (from `### UAT item shape` up to, not including, `### A formatter check`) rewritten; verified byte-identical outside that range against baseline `1ec323874`.

## Decisions Made

- Retired the gate outright per the operator's locked decision stated in the plan objective — not relitigated, not replaced with an equivalent gate.
- Lowered the floor by exactly one rather than removing the floor concept — a negative control (monkeypatched `discover_gates` returning 11 gates) confirms the runner still exits 1 below the new floor.
- CLAUDE.md's inline-`expected:` preference is now stated as a style/diff-cleanliness preference, not a hard requirement, since the correctness reason (gsd-core 1.14.0 reads block scalars fine) no longer holds.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' live-measured figures matched the planner's `<context>` figures exactly (418 items / 56 files / 2 parse_gap_files; per-file counts for `34.3-UAT.md` (5), `34.5-UAT.md` (17), `34.6-UAT.md` (0 items, 5 unparsed_blocks), `32-HUMAN-UAT.md` (3 items, 1 unparsed_blocks); `archived.files: 0`) — no drift to report.

## Measurements Recorded (per plan's `<output>` spec)

**`pnpm planning-gates` before/after:**
- Before (baseline, `1ec323874`): `13/13 planning gates passed.`
- After Task 1: `12/12 planning gates passed.`
- After Task 2 (final): `12/12 planning gates passed.`

**Negative control (Task 1 verify):** monkeypatched `runPlanningGates.discover_gates` to return only 11 gates (dropping the last one) and called `main()` directly — it raised `SystemExit(1)`, i.e. `negative control OK: 11 gates -> exit 1`. Confirms the floor is live, not merely a lowered number.

**`git grep -n 'uat-visibility-gate' -- ':!.planning/quick' ':!.planning/STATE.md' ':!.planning/todos'` residue:**
```
.planning/planning-envelope-tag-gate.py:295:    `uat-visibility-gate.py` (retired in quick task 260926-kkt; recoverable from git history)."""
CLAUDE.md:323:**What is enforced, honestly.** `.planning/uat-visibility-gate.py` (added in quick task 260912-csq)
meta/runPlanningGates.py:75:# `.planning/uat-visibility-gate.py`, a ratcheting VISIBILITY census over the
meta/runPlanningGates.py:119:# retirement, not convenience. The retired gate was `.planning/uat-visibility-gate.py`, the
```
Exactly the expected set: the runner's `10 -> 11` and `13 -> 12` floor-history entries, the envelope-tag gate's retired-marked provenance line, and CLAUDE.md's retirement statement. No live file cites the deleted gate as though it still exists.

**Step-1 live figures (Task 2), all measured in this session, no drift from plan-time `<context>` values:**
- `audit-uat --raw` summary: `total_items: 418`, `total_files: 56`, `parse_gap_files: 2`.
- Per-file: `34.3-UAT.md` 5 items (0 under 1.42.3); `34.5-UAT.md` 17 items (0 under 1.42.3); `34.6-UAT.md` 0 items, `parse_gap: true`, `unparsed_blocks: 5`; `32-HUMAN-UAT.md` 3 items, `parse_gap: true`, `unparsed_blocks: 1`.
- `archived.files: 0` (checked as part of the item-D follow-up investigation below).
- Parser probe A (block-scalar `expected:` + separate `## Current Test` block elsewhere): item returned, body dedented across lines (`"Games appear as cards.\nSecond line of body."`), `headingsSeen: 0`.
- Parser probe B (bolded `result:` value, e.g. `result: **PASS** (...)`): item dropped from `items`, `headingsSeen: 1`.
- Live gap causes reproduced by file read: `34.6-UAT.md`'s five `result:` lines all open with bold markup (`result: **PASS** ...`, `result: **PASS ON THE CHANNEL...**`, etc.) instead of a bare/bracketed status word; `32-HUMAN-UAT.md` has a non-numbered `### CORRECTION 2026-08-22 ...` heading (line 20) sitting between item 1's heading (line 16) and its own `expected:`/`result:` pair (lines 74-81), ending item 1's block early.
- Attributed 1.42.3 comparison figure (42 items across 13 files) is stated in CLAUDE.md as attributed to the 260926-kkt orchestrator's pre-migration measurement, not re-measured here (the old install no longer exists).

## Follow-ups (not actioned here)

1. **Pending todo `2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md`.** Its title claims the whole-file suppression defect is "ledgered by a gate and CI-asserted" — that is now false, since the gate is retired and CI no longer asserts anything about UAT visibility. The todo needs its title/frontmatter rewritten (or the gate-based claim struck) to reflect that. **Not performed here** — the plan explicitly excludes editing this todo.

   On item D specifically (the milestone-hidden 17 fields across `17-UAT.md`, `18-UAT.md`, `23.2-HUMAN-UAT.md`): **it does not look resolved under gsd-core 1.14.0.** Checked directly:
   - `audit-uat --raw`'s top-level `archived.files: 0` — nothing is archived, so item D's mechanism is not an archive-exclusion issue.
   - `17-UAT.md` now appears in `audit-uat --raw` output (12 items) — a change from its milestone-hidden state under 1.42.3 — but this looks like it's because phase 17's directory now falls inside the current milestone's active-phase window, not because gsd-core dropped the filtering mechanism.
   - `18-UAT.md` and `23.2-HUMAN-UAT.md` are **entirely absent** from `audit-uat --raw` output, despite both files having clearly-formed `### N.` test headings on disk (`18-UAT.md` has 5+ numbered items; `23.2-HUMAN-UAT.md` has 3). Reading `~/.claude/gsd-core/bin/lib/uat.cjs`'s `cmdAuditUat`, active (non-archived) phase directories are still filtered through `listMilestonePhaseDirs` before any file is opened — gsd-core's successor to 1.42.3's `getMilestonePhaseFilter`, same mechanism under a new name.
   - **Conclusion: item D's underlying mechanism (milestone-window phase-directory filtering before `audit-uat` ever opens the file) is still present in gsd-core 1.14.0.** The todo's item D should stay open, not be closed as resolved by the migration. Recommend the todo be updated to (a) correct the now-false "ledgered by a gate and CI-asserted" claim in its title/frontmatter given this task's retirement, and (b) re-confirm item D's live status against `listMilestonePhaseDirs` specifically, since this was a read-only check, not an exhaustive re-run of the todo's own injection methodology.

2. **Live parse gaps, now visible and un-fixed:** `34.6-UAT.md` (5 `unparsed_blocks` — every `result:` opens with bold markup) and `32-HUMAN-UAT.md` (1 `unparsed_block` — a non-numbered `### CORRECTION` heading intervenes between item 1's heading and its result). Measured causes recorded above. No UAT file was edited in this task.

3. **CLAUDE.md's formatter section** ("A formatter check belongs in every task's `<verify>`") still cites a template path under the removed `get-shit-done` install directory. Explicitly out of scope for this task — a separate follow-up.

4. **CI no longer has any UAT-visibility signal.** `audit-uat` runs from the global gsd-core install, which CI does not have access to, so `parse_gap_files` is now visible only to whoever runs it manually. This is stated plainly in the rewritten CLAUDE.md section rather than left implicit.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `pnpm planning-gates` is green at `12/12` with a tight floor; no further action needed for CI.
- The two live parse gaps and the pending todo are named follow-ups, not blockers — nothing in this task's scope depends on them.

---
*Phase: quick-260926-kkt*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: `meta/runPlanningGates.py`
- FOUND: `.planning/planning-envelope-tag-gate.py`
- FOUND: `CLAUDE.md`
- FOUND: `.planning/quick/260926-kkt-retire-the-uat-visibility-gate-after-the/260926-kkt-SUMMARY.md`
- CONFIRMED DELETED: `.planning/uat-visibility-gate.py`
- FOUND commit: `1fda931c3`
- FOUND commit: `b6c2d70d2`
