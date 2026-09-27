---
phase: quick-260926-mja
plan: 01
subsystem: tooling
tags: [gsd-core, todo-triage, documentation]

requires: []
provides:
  - The gsd-core migration todo closed at .planning/todos/completed/, rewritten to record the migration as already done.
affects: []

actuals:
  tokens: 2283
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md

key-decisions:
  - "Rewrote the todo's title/status/body to record the gsd-core 1.14.0 migration as an already-completed outcome, not as pending work timed to a future Linux repo setup."
  - "Recorded steps 1 and 3 as satisfied by outcome (pnpm planning-gates 12/12, one gate retired by 260926-kkt) rather than by the procedure originally specified (no --dry-run, no scratch --config-dir trial, no per-gate record)."
  - "Recorded step 2's fallback snapshot as never taken and accepted as residual risk, with no new todo spun out, since the legacy install is gone locally and there is nothing left to snapshot."
  - "Left CLAUDE.md and STATE.md's historical 260925-o9b records untouched, per the plan's explicit scope boundary."

patterns-established: []

requirements-completed: [QUICK-260926-MJA]

coverage:
  - id: D1
    description: "Todo moved from pending/ to completed/, same filename, body rewritten to record a completed migration"
    requirement: "QUICK-260926-MJA"
    verification:
      - kind: other
        ref: "test ! -e pending path && test -f completed path && pending count == 18"
        status: pass
    human_judgment: false
  - id: D2
    description: "pnpm planning-gates reports 12/12 after the rename is staged"
    requirement: "QUICK-260926-MJA"
    verification:
      - kind: other
        ref: "pnpm planning-gates literal line '12/12 planning gates passed.'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Commit confined to the todo's two paths plus this quick task's own directory, carrying the required attribution line"
    requirement: "QUICK-260926-MJA"
    verification:
      - kind: other
        ref: "git diff --cached --name-only --no-renames prefix-allowlist assertion, and post-commit git show --name-only twin"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-26
status: complete
---

# Quick Task 260926-mja: Close the Stale gsd-core Migration Todo Summary

**Rewrote and closed a `ready: human` todo that described the `@opengsd/gsd-core` migration as future work, when the migration had already happened on this Mac on 2026-09-26 ahead of the ordering the todo laid out.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 1 (moved and rewritten)

## Accomplishments

- Rewrote `.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md` in place: new `title:`, a new `status:` closure key naming `260926-mja` and 2026-09-26, and rewritten `## What GameLib pinned`, `## The decision, and its outcome`, and `## Steps: real disposition` sections that record the migration as completed by outcome rather than by the originally specified procedure. Preserved the research sections (`## Why that pin is now a dead end`, `## What the successor is`, `## Research, 2026-09-26`) byte-for-byte, and preserved the `created`, `area`, `severity: medium`, `platform: any`, `ready: human`, `found_by`, and `files: []` frontmatter keys unchanged.
- Moved the file with `git mv` from `pending/` to `completed/`, staging the rename and its content changes as one index entry.
- Ran `pnpm planning-gates` with the rename staged: `12/12 planning gates passed.`
- Asserted the staged file list (pre-commit, `git diff --cached --name-only --no-renames`) and the landed commit (post-commit, `git show --name-only`) both against a prefix allowlist covering only the todo's two paths and this quick task's own directory, with a non-vacuity floor (≥2 lines) and a by-name exclusion for the concurrent `260926-m91` session's directory.
- Committed with the required attribution line.

## Task Commits

Both tasks land in a single commit, by the plan's explicit design (the rename must be staged in the same invocation as the gate run):

1. **Task 1: Rewrite the todo body** - staged as part of the Task 2 commit below (no separate commit).
2. **Task 2: Move to completed/, prove 12/12 gates, commit** - `0b34a40b0` (docs)

**Plan metadata commit:** none separate - one commit covers both tasks, per the plan's design.

## Files Created/Modified

- `.planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md` - the closed, rewritten todo (moved from `pending/`)
- `.planning/quick/260926-mja-close-the-stale-gsd-core-migration-todo/260926-mja-SUMMARY.md` - this file

## Decisions Made

- See `key-decisions` in frontmatter above. In short: the migration decision itself was correct and stands; only its timing didn't hold, so the rewrite records the outcome plainly rather than pretending the original procedure was followed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `git mv` staged the rename with stale (unmodified) content; caught before continuing and fixed by staging the corrected content and amending the same local commit**
- **Found during:** Task 2, step 5 (immediately after the first commit, while confirming committed content as a self-check beyond what the plan's `<verify>` blocks required)
- **Issue:** Task 1's edits (via the Edit tool) were unstaged modifications on the `pending/` file when Task 2 step 1 ran `git mv pending/... completed/...`. `git mv` staged the rename using the **index** blob (the original, unmodified 6966-byte content) rather than the dirty working-tree content (9130 bytes, the rewrite), producing a porcelain `RM` status - renamed in the index, further modified in the working tree relative to that index entry. Because I had not run `git add` on the file after editing it and before running `git mv`, the commit landed with the todo's **original, unclosed body** at the new `completed/` path - the move happened, but the content rewrite did not.
- **Fix:** Verified with `git cat-file -p HEAD:<path> | wc -c` against the working-tree byte count (6966 vs 9130) to confirm the exact defect rather than guess. Staged the corrected working-tree content explicitly (`git add` on the single todo path only - re-checked `git status --porcelain` immediately before, which showed only that one path modified) and ran `git commit --amend --no-edit` to fold the correction into the same, still-local, still-unpushed commit created moments earlier in this same execution - satisfying the plan's "one commit" requirement rather than adding a second corrective commit.
- **Files modified:** `.planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md` (no other file touched by the fix)
- **Verification:** Re-ran all of Task 1's content/YAML/prettier checks and Task 2's `MOVE_OK`, `12/12 planning gates passed.`, and post-commit `COMMIT_CLEAN` checks against the amended `HEAD` - all passed. `git cat-file -p HEAD:<path> | wc -c` now reads 9130, matching the working tree.
- **Committed in:** `0b34a40b0` (the amended commit; no separate hash exists for the pre-fix state, since amend replaces it)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in my own execution, not in the plan's instructions)
**Impact on plan:** The plan's steps were followed in order exactly as written; the defect was in how I staged Task 1's edits before running Task 2 step 1's `git mv`, not in the plan itself. No scope creep - the fix touched only the one todo file already in scope.

### Formatter check: recorded as a no-op, not a passed gate

Both tasks' `<verify>` blocks include an `npx prettier --check` line over the exact path written, per CLAUDE.md's standing formatter requirement. Both are **vacuous by design**: `.prettierignore` lists `.planning`, so prettier matches zero files under that path and prints "All matched files use Prettier code style!" regardless of content. This was measured at planning time (a deliberately misformatted probe came back clean) and re-confirmed during execution. The check ran as required, but its green must not be read as formatting assurance - formatting here rests on hand-matching the surrounding corpus, which was done by eye against the file's existing style.

### Steps 1 and 3: discharged by outcome, not by procedure

The rewritten todo body states plainly that no `npx @opengsd/gsd-core@latest --dry-run` was run, no scratch `--config-dir` install was trialled, and no per-gate pass/break/redundant record was produced. What exists instead: `pnpm planning-gates` reports 12/12 under gsd-core, with exactly one gate (the UAT visibility gate) retired by quick task 260926-kkt rather than ported, lowering the anti-vacuity floor in `meta/runPlanningGates.py` from 13 to 12. Step 3's CLAUDE.md wording target was already gone before this task ran.

### Step 2: closed as accepted risk, no todo spun out

The fallback 1.42.3 snapshot was never taken. The rewritten body records this as accepted residual risk rather than spinning out a new todo, because there is no local action left to take: the legacy `~/.claude/get-shit-done/` tree is an empty skeleton and the global npm package is gone from this machine, so nothing remains here to snapshot. Recovery, if ever needed, depends entirely on `get-shit-done-cc@1.42.3` remaining available on npm - which the todo's own research section already flags as not guaranteed, since npm's staff-set deprecation message sometimes precedes removal.

## Issues Encountered

The `git mv` staging defect documented under Deviations above was caught and fixed before this SUMMARY was written, so it did not leave the tree in a bad state - see that entry for the full account.

Separately, worth naming: this task ran in a shared working tree (`workflow.use_worktrees: false`) with a concurrent session (`260926-m91`) that had committed its own directory (`06d751032`) during this task's planning phase, before execution started. By the time execution ran, `git status --porcelain` showed only this task's own untracked directory, so the prefix-allowlist assertions (staged and post-commit) passed on a clean read with nothing foreign to reject.

## Self-Check

- `test -f .planning/todos/completed/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md` -> FOUND
- `test ! -e .planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md` -> confirmed absent
- `git log --oneline --all | grep -q 0b34a40b0` -> FOUND
- `git cat-file -p HEAD:.planning/todos/completed/....md | wc -c` -> 9130, matches working tree byte count
- `pnpm planning-gates` on the final tree -> `12/12 planning gates passed.`

## Self-Check: PASSED

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The todo is closed; no further action is needed on the gsd-core migration itself.
- CLAUDE.md and STATE.md's historical 260925-o9b records were left untouched, per the plan's explicit scope boundary.

---
*Phase: quick-260926-mja*
*Completed: 2026-09-26*
