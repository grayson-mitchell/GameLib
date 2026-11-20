---
phase: quick-260930-ivj
plan: 01
subsystem: gsd-tooling
tags: [code-review, gsd-core, workflow, bash, git-scoping]

requires: []
provides:
  - "compute_file_scope in gsd-core/workflows/code-review.md now bounds both diff sites at the phase's own end (DIFF_HEAD), not always HEAD"
  - "the deleted-file filter in compute_file_scope names every path it drops, instead of a bare count"
  - "diff_head surfaced in the reviewer's <config> block beside diff_base"
  - "a residual todo recording the union-of-scoped-commits algorithm as future work, not implemented here"
affects: [gsd-code-review-workflow, future-code-review-quick-tasks]

actuals:
  tokens: 2100      # chars/4 estimate: ~5100 chars net diff in code-review.md + 3348-byte new todo file; no pristine copy of the workflow file was retained to diff exactly, so this is an estimate, not a measured exact diff
  tasks: 3
  commits: 2
  plan_head_before: 4cfafe7d3793aefde764a253e12e6cd687875771
  plan_head_after: 7e3394a24b4d90a4480d2e6cc1b45a083560ae2c

tech-stack:
  added: []
  patterns:
    - "Anchor a review's diff range at the newest commit carrying the phase's own conventional-commit scope token, falling back to HEAD when no such commit exists or the anchor is not a descendant of the diff base"

key-files:
  created:
    - .planning/todos/pending/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md
  modified:
    - $HOME/.claude/gsd-core/workflows/code-review.md
    - .planning/todos/completed/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md (moved from pending/)

key-decisions:
  - "D-01 stands as specified (orchestrator ruling): bound both diff sites at the phase's newest scope-tagged commit; corrected the originating todo's 590 -> 66 claim, which conflated a union-of-commits algorithm with a bounded range."
  - "D-02: name every dropped path in the deleted-file filter, not just a count."
  - "D-03: surface diff_head in the reviewer's config block, conditional-emit idiom matching diff_base."
  - "The union-of-scoped-commits algorithm is explicitly out of scope; filed as a new pending todo per orchestrator ruling #3, not partially implemented."
  - "Kept the git merge-base --is-ancestor guard the planner added (orchestrator ruling #4): the #3661 LAST_REVIEW_COMMIT path can set DIFF_BASE newer than the anchor, and the guard's HEAD fallback is correct."

patterns-established:
  - "New numbered workflow comments (#4666 here) that revise a prior mechanism must explicitly distinguish themselves from previously-banned approaches (#3503/#3995's prose grep) so a later reader does not 'fix' the new code back into the old bug."

requirements-completed: [IVJ-01, IVJ-02, IVJ-03, IVJ-04]

duration: ~35min
completed: 2026-09-30
status: complete
---

# Phase quick-260930-ivj Plan 01: Bound code-review scope to phase end Summary

**`/gsd-code-review`'s file scope now stops at the reviewed phase's own end instead of always `HEAD`, measured 625->23 files on phase 41 and 1040->194 on phase 34.6, with the deleted-file filter now naming what it drops and `diff_head` visible in the review's own metadata.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 completed
- **Files modified:** 1 out-of-repo workflow file (`$HOME/.claude/gsd-core/workflows/code-review.md`), 1 todo moved, 1 todo created

## Accomplishments

- Added a `DIFF_HEAD` computation to `compute_file_scope` (per D-01): the newest commit whose subject carries the reviewed phase's own conventional-commit scope token, with two fallbacks to `HEAD` — no scope-tagged commit found, or the anchor is not a descendant of `DIFF_BASE` (guarded via `git merge-base --is-ancestor`, kept per orchestrator ruling #4). Both diff sites (the Tier-3 full fallback and the `#2666` SUMMARY/diff cross-check) now read `"${DIFF_BASE}..${DIFF_HEAD}"` instead of a hardcoded `..HEAD`.
- Replaced the bare `DELETED_COUNT` integer with a `DELETED_FILES` array in the deleted-file filter (per D-02); the filter now prints every dropped path using the file's own established `printf '  - %s\n'` idiom, with the count kept in the header line.
- Added a `diff_head` line to the `Agent(subagent_type="gsd-code-reviewer", …)` `<config>` block, directly beneath `diff_base`, using the same conditional-emit idiom (per D-03).
- Added a new `#4666` comment (the next unused number after the file's own highest, `#4665`, and unused anywhere else in the install) that records: this is a subject-line conventional-commit **scope token** match, the class `#3503` moved *to* — not the free-prose `[Pp]hase N` match `#2989`/`#3191` used and `#3995` removed — so a later reader does not "fix" this back to a bare `HEAD` bound believing it is the banned grep; the measured before/after table; the residual (a range still spans every interleaved commit between base and anchor); and the fallback/escaping/anchoring rules.
- Closed the originating todo (`git mv` pending -> completed) and filed a new pending todo recording the union-of-scoped-commits algorithm as the known residual — explicitly out of scope for this task per the orchestrator's ruling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] Todo rename was split across two commits by an incomplete pathspec**

- **Found during:** Task 3 (closing the todo)
- **Issue:** The first Task 3 commit's pathspec listed only the `completed/` destination path and the new residual todo, omitting the `pending/` source path of the `git mv` rename. `git commit -- <pathspec>` committed only the add side of the rename, leaving the pending-side deletion staged and uncommitted (`git status` showed a lingering `D` on the old pending path after the commit).
- **Fix:** A second commit (`fix(quick-260930-ivj): complete todo rename split by a scoped commit`) picked up the leftover staged deletion. Final state verified: the old pending path is gone from disk and from git status, the completed path holds the file, and the new residual todo is committed.
- **Files modified:** `.planning/todos/completed/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md`, `.planning/todos/pending/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md` (now deleted)
- **Commits:** `9eb52c388` (partial), `7e3394a24` (completion)

No other deviations. Tasks 1 and 2 executed exactly as planned, with every gate (G1-G5, Task 2's static + behavioural gates) passing on the first attempt.

## Measured Numbers (re-verified live, 2026-09-30)

| probe | anchor | before (HEAD-bound) | after (DIFF_HEAD-bound) |
| ----- | ------ | -------------------- | ------------------------ |
| phase 41 | `de4aa7250` (2026-09-06) | 625 | **23** |
| phase 34.6 | `d1829d3fb` (2026-08-26) | 1040 | **194** |
| phase 42 | `ee46df158` (2026-09-30) | 604 | **602** (poisoned probe — see below) |
| phase 45 | none -> `HEAD` | 426 | **426** (inert by design, no scope-tagged commit) |

**Phase 42 is the honest counter-case, not a failure.** It received fresh `(42)`-scoped commits on 2026-09-30 (`fbdd294bd`, `f7a013b06`, `ee46df158`) from the very code-review investigation that found this defect, so its newest scoped commit sits almost at `HEAD` and the anchor has almost nothing to bite on. Phase 41 and phase 34.6 are the probes that demonstrate the fix.

**The originating todo's `590 -> 66` figure is NOT this mechanism's number.** That 66 (69 before the `.planning/` filter) is the **union of each `(42)`-scoped commit's own file set** — a different algorithm from bounding a `..` range. A range still contains every interleaved commit between base and anchor; re-measured at plan time, the union method yields 95 paths (69 after dropping `.planning/`) against this mechanism's 602 on the same phase. This distinction, and the correct 604 -> 602 number, is written into the `#4666` comment itself so a future reader does not conflate the two.

**Residual, filed as a new todo (not implemented here):** a range still contains every interleaved commit between base and anchor. Per-phase-exact scoping would need the union-of-scoped-commits algorithm, which is a different and larger change — recorded at `.planning/todos/pending/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md`.

## Upgrade Trap (stated honestly)

- `gsd-core/workflows/code-review.md` **is** hash-tracked in `$HOME/.claude/gsd-file-manifest.json` (917 entries) with pristine hash `8c4f74ce02a47cb918f9651204a5179e243ccc4b25b190161ee6ba980d6cc2f9` — confirmed live before this task's edit, i.e. the file was genuinely pristine, not previously patched.
- It is **NOT** in `$HOME/.claude/gsd-local-patches/backup-meta.json`, which tracks only `gsd-core/bin/lib/template.cjs` and `gsd-core/templates/phase-prompt.md` (`from_version: 1.14.0`) — confirmed live.
- This edit makes the live file's hash diverge from the manifest (`45c60459...` vs pristine `8c4f74ce...`), confirmed live after the edit. **This is the expectation, not a demonstrated outcome** — nothing in this task exercised the installer's local-modification detector. The expectation is that the next `/gsd-update` run detects the divergence and newly parks this file in `gsd-local-patches/`.
- `/gsd-update --reapply` is a **MANUAL** step the operator must run after every upgrade. It is NOT automatic. Until it runs, an upgrade silently reverts this fix and the mis-scoping regresses.
- **Remaining step, not work done:** the durable fix is an upstream report against `@opengsd/gsd-core` (currently 1.14.0). No such report has been filed — that is the operator's call, per the task constraints. `/gsd-update` was not run.

## No Prettier Check (deliberately omitted)

Both in-repo targets of this task (`260930-ivj-PLAN.md` under `.planning/`, and the out-of-repo workflow file) are prettier-ignored — re-probed live at task-end: `npx prettier --file-info` reports `{"ignored":true,"inferredParser":null}` for both. Per CLAUDE.md, `--check` over an ignored path prints `All matched files use Prettier code style!` and exits 0 having matched zero files — identical to a real pass. Carrying that check here would be a green that proves nothing, so it is omitted, not forgotten.

## Task Commits

Task 1 and Task 2 modified only `$HOME/.claude/gsd-core/workflows/code-review.md`, which is outside this git repository and cannot be committed — per this task's constraints, no `git add` was attempted against it.

1. **Task 1: Anchor both diff sites at the phase's end, end-to-end** — no in-repo commit (out-of-repo file only); G1-G5 verification gates all passed against the live file.
2. **Task 2: Name the dropped files; surface the anchor in report metadata** — no in-repo commit (out-of-repo file only); static and behavioural verification gates all passed.
3. **Task 3: Record the upgrade-trap finding, close the todo, run the gates** — `9eb52c388` (docs: close todo + file residual todo, partial due to a pathspec mistake), `7e3394a24` (fix: complete the rename the prior commit split).

**Plan metadata:** No metadata commit made by this executor — SUMMARY.md, STATE.md, and ROADMAP.md are explicitly out of scope per this task's constraints; the orchestrator handles the docs commit.

## Verification

- Task 1 gates G1-G5: all PASS (anchored range at exactly 2 sites, no live `..HEAD` bound remaining, both `HEAD` fallbacks present, ancestor guard present, `#4666` comment present with provenance/numbers, all six prior comments — `#3503`/`#2989`/`#3191`/`#3995`/`#3661`/`#4460` — byte-intact; measured probes reproduced phase 41/34.6/42/45 exactly; near-miss isolation held on bash 3.2.57).
- Task 2 gates: `DELETED_FILES` array wired, bare `DELETED_COUNT` gone from live code, dropped paths printed with the house idiom, `diff_head` adjacent to `diff_base`, the three phase-42 deliverable files confirmed absent from disk, behavioural probe named both fixture-absent paths correctly.
- Task 3 gates: todo confirmed moved (not copied) after the two-commit fixup, SUMMARY records the manifest/local-patches finding with reapply stated as MANUAL and the upstream report as a REMAINING step, live hash confirmed diverged from the manifest pristine hash, `pnpm planning-gates` passed 12/12, both prettier-ignored premises re-probed live and confirmed.
- `git status --porcelain src/` — not applicable here (no `src/` files touched by this task; confirmed no `src/` paths appear in `git status --short`).

## Known Stubs

None.

## Threat Flags

None. This task's threat model (STRIDE register, ASVS level 1) is exhaustive in the plan itself; no new surface was introduced beyond what it already documents — the new `DIFF_HEAD` grep reaches `grep -E` as a single quoted argv element (never `eval`), and `PADDED_PHASE` is grammar-validated upstream in the same workflow.

## Self-Check: PASSED

- `test -f "$HOME/.claude/gsd-core/workflows/code-review.md"` — FOUND
- `test -f .planning/todos/completed/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md` — FOUND
- `test ! -f .planning/todos/pending/2026-09-30-code-review-scopes-to-head-so-a-closed-phase-mis-scopes.md` — CONFIRMED gone
- `test -f .planning/todos/pending/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md` — FOUND
- `git log --oneline --all | grep -q 9eb52c388` — FOUND
- `git log --oneline --all | grep -q 7e3394a24` — FOUND
- `pnpm planning-gates` — 12/12 PASS (re-run after the fixup commit)
