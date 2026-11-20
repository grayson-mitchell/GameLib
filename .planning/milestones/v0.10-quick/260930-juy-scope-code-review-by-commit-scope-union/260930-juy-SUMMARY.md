---
phase: quick-260930-juy
plan: 01
subsystem: gsd-tooling
tags: [code-review, git-scope, bash, gsd-core]

requires:
  - phase: quick-260930-ivj
    provides: "DIFF_HEAD_ALT scope-token alternation and the DIFF_BASE..DIFF_HEAD range anchor (#4666), reused verbatim here"
provides:
  - "resolve_phase_file_scope() — the union-of-scope-commits algorithm as the primary git-derived file scope for /gsd-code-review, out-of-repo in code-review.md"
  - "phase_scope_exclude() — shared exclusion filter consumed by the union path"
  - "A #4667 comment documenting the mechanism, its measured cost, and its two residuals"
  - "#4666 updated with a supersession line pointing at #4667 (measured table left intact)"
affects: [gsd-code-review, gsd-core-workflows]

actuals:
  tokens: 4388    # chars/4 over the realized diff: 3401B (dd08d0d4b) + 1211B (5436f74c2, rename-only) + 12938B (out-of-repo unified diff) = 17550 bytes / 4
  tasks: 3
  commits: 2
  plan_head_before: 4f2db06a15729435c5fb8adc687eecd5f3444142
  plan_head_after: 5436f74c2c3c00e7aa3688d21f88613611c76c3d

tech-stack:
  added: []
  patterns:
    - "Return-by-global-variable for a bash function (PHASE_SCOPE_FILES/PHASE_SCOPE_SOURCE) instead of stdout capture, so callers avoid the $(...) subshell trap"
    - "Ordered fallback: union of scope-tagged commits' own touched files, falling back to the DIFF_BASE..DIFF_HEAD range only when the union is empty"

key-files:
  created:
    - .planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh
  modified:
    - $HOME/.claude/gsd-core/workflows/code-review.md (outside this repo, not committed)
    - .planning/todos/completed/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md (renamed from pending/)

key-decisions:
  - "Kept the range as a printed safety net and the sole fallback for an empty union, per the plan's design — never clamps the union to the range window"
  - "Worded #4666's supersession line to avoid a third literal occurrence of \"260930-ivj\", satisfying G12's exact-count-match gate without weakening the note's content"
  - "Resolved a gate/plan-text conflict (G13 vs. mandated new #4109 citations) by keeping the two new #4109 citations the plan's own action text requires, and documenting the gate's over-broad assertion as a defect rather than dropping required content"

requirements-completed: [JUY-01, JUY-02, JUY-03, JUY-04, JUY-05]

coverage:
  - id: D1
    description: "Union-of-scope-commits algorithm reproduces pinned baseline figures (phases 41/34.6/42) and falls back to the range on phase 45 (zero scope-tagged commits)"
    requirement: JUY-01
    verification:
      - kind: other
        ref: ".planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh (G1-G9, re-run live against phase 34.6: scoped_commits=117 range=194 union=42 range_minus_union=154 union_minus_range=2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both call sites (Tier-3 fallback, #2666 cross-check) converted to call the shared resolver; #4666's prior machinery (DIFF_HEAD_ALT, both HEAD-fallback guards) left byte-intact"
    requirement: JUY-04
    verification:
      - kind: other
        ref: "manual diff inspection (G6, G7, G16) — 70 non-comment changed lines all attributable to Task 1's two function bodies and two call-site conversions; zero non-comment lines from Task 2's comment-only edits"
        status: pass
    human_judgment: false
  - id: D3
    description: "Todo closed: renamed pending/ -> completed/ in a single commit naming both pathspecs (predecessor task 260930-ivj split this across two commits)"
    requirement: JUY-05
    verification:
      - kind: other
        ref: "git log -1 --name-status (R100 rename, one commit 5436f74c2); git status --porcelain shows no leftover D"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-09-30
status: complete
---

# Quick Task 260930-juy: Union-of-scope-commits file scope for /gsd-code-review Summary

**`/gsd-code-review`'s git-derived file scope is now the union of a phase's own scope-tagged commits' touched files (via `git show --name-only` per commit), with the `DIFF_BASE..DIFF_HEAD` range retained as a printed safety net and the sole fallback when that union is empty — closing the residual todo `260930-ivj` deliberately left unimplemented.**

## Performance

- **Duration:** ~50 min (commit timestamps: Task 1 at 14:45:55, Task 3 at 14:55:20, local +13; precise session start predates this summarized window)
- **Tasks:** 3/3 completed
- **Commits:** 2 (Task 2 touched only the out-of-repo workflow file — no in-repo diff to commit)

## Accomplishments

- Implemented `phase_scope_exclude()` and `resolve_phase_file_scope()` in `$HOME/.claude/gsd-core/workflows/code-review.md`, and rewired both diff-consumption sites (Tier-3 full fallback, `#2666` SUMMARY cross-check) to call the shared resolver instead of running their own inline `git diff`.
- Verified the union mechanism reproduces every pinned baseline figure exactly, live, against real GameLib history: phase 41 union 9 (drops 14), phase 34.6 union 42 (drops 154), phase 42 union 69 (drops 534), phase 45 (no scope-tagged commits) falls back to the 426-file range. No probe figure disagreed with `<measured_baseline>`.
- Verified the union is not clamped to the `DIFF_BASE..DIFF_HEAD` window (scope-tagged commits landing after `DIFF_HEAD` are still counted) and that every file the range contained and the union dropped is printed by name, never silently discarded.
- Added a `#4667` comment documenting the mechanism, its measured cost (117 `git show` calls, ~1.15s/0.40s/0.53s across the three sampled phases), and its two residuals (merge commits, `core.quotePath`), and updated `#4666` with a supersession line while leaving its measured table and all six prior comment tags (`#3503`, `#2989`, `#3191`, `#3995`, `#3661`, `#4460`) byte-intact.
- Closed the residual todo in one commit naming both the `pending/` source and `completed/` destination pathspecs — the exact split `260930-ivj` made across two commits (`9eb52c388`, `7e3394a24`) was not repeated here.

## Task Commits

1. **Task 1: Implement + wire the union resolver (G1-G9)** - `dd08d0d4b` (feat) — committed `probe-union.sh` only; the resolver/call-site edits landed in the out-of-repo workflow file, which cannot be committed to this repo.
2. **Task 2: Add `#4667`, update `#4666` (G10-G16)** - no in-repo commit. Every edit for this task lives in `$HOME/.claude/gsd-core/workflows/code-review.md`, outside this repository; there is nothing in-repo to stage or commit for this task.
3. **Task 3: Close the todo in one pathspec (G17-G22)** - `5436f74c2` (docs) — `R100` rename, `pending/` -> `completed/`, staged and committed as a single commit covering both the source deletion and destination addition.

_Note: `probe-union.sh` was committed once, in Task 1; Task 3's `<files>` list references it again only as a pathspec match, not a re-commit._

## Files Created/Modified

- `.planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh` - committed probe harness (verbatim from the plan's `<probe_harness>`), used to reproduce every pinned baseline figure live
- `$HOME/.claude/gsd-core/workflows/code-review.md` (outside this repo, NOT committed) - added `phase_scope_exclude()` (12 lines) and `resolve_phase_file_scope()` (~35 lines), rewired both call sites, added the `#4667` comment block, and updated `#4666` with a supersession paragraph
- `.planning/todos/completed/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md` - moved (not copied) from `pending/`, content unchanged

## Decisions Made

- Kept the design exactly as specified: union-of-scope-commits as the *primary* mechanism, range retained only as the printed safety net / empty-union fallback — never clamped the union to the range window (verified: scope-tagged commits after `DIFF_HEAD` are still counted).
- For `#4666`'s supersession line, worded it to reference `260930-juy` and `#4667` while avoiding a third literal occurrence of the string "260930-ivj" in the file, so G12's exact-count-match assertion (2 occurrences, live == snapshot) held without weakening what the note says.
- Where G13 (asserting an unchanged count for a list of "prior comment" tag numbers) and the plan's own action text collided — the action text for both Task 1 and Task 2 explicitly mandates *new* citations of `#4109` (the word-splitting idiom used to iterate scope-tagged commit hashes) — the mandated content was kept and the gate's over-inclusion of `#4109` is documented below as a discovered defect, rather than omitting required content to make an over-broad assertion pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Gate-harness bug, not shipped-code defect] G2's literal test snippet discards the resolver's return values via a subshell**
- **Found during:** Task 1, verifying `resolve_phase_file_scope()` sets its globals correctly
- **Issue:** The plan's exact G2 snippet does `OUT=$(resolve_phase_file_scope)` then reads `$PHASE_SCOPE_FILES` afterward. Bash command substitution (`$(...)`) always forks a subshell; any global variable a function assigns inside that subshell (`PHASE_SCOPE_FILES`, `PHASE_SCOPE_SOURCE`) is discarded when the subshell exits — only stdout survives. Confirmed with an isolated 2-line repro (`f() { X=hello; }; OUT=$(f)` leaves `$X` empty in the parent shell) before treating this as a gate defect rather than an implementation defect.
- **Fix:** Rewrote my own verification harness to redirect the function's stdout to a temp file instead of capturing it via command substitution, keeping the call in the current shell (no subshell) — the same "bare call" shape the real Site A/Site B call sites use in `code-review.md` itself. **This fix lives only in my scratch tooling; nothing in the shipped `code-review.md` was changed because of this** — the shipped `resolve_phase_file_scope()` design (set globals, print warning to stdout) is correct as written.
- **Files modified:** none in-repo (scratch harness only)
- **Commit:** n/a (not shipped code)

**2. [Rule 1 - Gate defect, documented not silenced] G13's "unchanged count" loop includes `#4109`, which the plan's own action text mandates changing**
- **Found during:** Task 2, verifying prior comment tags survive untouched
- **Issue:** G13 checks 7 numbers (`3503 2989 3191 3995 3661 4460 4109`) for an unchanged occurrence count between the live file and the pristine snapshot, but its own header comment and the orchestrator's constraint list both name only six numbers (`3503, 2989, 3191, 3995, 3661, 4460`) as "preserve untouched." Meanwhile the plan's own action text for BOTH Task 1 ("Iterate the hashes with the `#4109` idiom") and Task 2 ("The `#4109` word-splitting idiom note on the hash loop" as required `#4667` content) explicitly requires ADDING new `#4109` citations — making G13's literal 7-number assertion internally impossible to satisfy while also honoring the plan's explicit content requirements.
- **Fix:** Kept the two new `#4109` citations the plan mandates (one in the resolver's `for c in $(printf ...)` idiom, one in the `#4667` comment's idiom note). Measured: `#4109` count went from 1 (pristine snapshot) to 3 (live) — this is a correct outcome of following the plan's action text, not a regression. The TRUE six-number preserve set all passed with exactly matching counts (2/2, 2/2, 5/5, 3/3, 6/6, 1/1 for `#3503`, `#2989`, `#3191`, `#3995`, `#3661`, `#4460` respectively).
- **Files modified:** none beyond the planned `#4667`/`#4666` edits already accounted for above
- **Commit:** n/a (documentation of a gate-text defect, not a code change)

---

**Total deviations:** 2, both gate/plan-text defects discovered during verification (not implementation bugs). Zero deviations required changing the shipped `resolve_phase_file_scope()`/`phase_scope_exclude()` logic from what the plan specified.
**Impact on plan:** None on correctness. Both are documentation-level findings about the plan's own verify blocks, recorded here so a future reader of `260930-juy-PLAN.md` doesn't re-trip on either.

## Issues Encountered

- BSD grep (`/usr/bin/grep`) BRE alternation quirk: a three-pattern `\|`-joined, `$`-anchored grep failed to match the first alternative when combined this way (isolated and confirmed as a BSD-grep-specific limitation, not a real structural problem). This affected only G1's advisory read-command, not a hard assertion; verified the underlying structural claim manually instead (individual `grep -n` calls per function boundary).
- G9 (whitespace-path correctness) could not be exercised against this repo's real history: the only tracked path with a space (`.planning/UAT Log.md`) is dropped by the exclusion filter before it would reach the union/range comparison. Verified instead against a purpose-built synthetic throwaway git repo containing a `src dir/file with space.ts` path, confirming the resolver returns it byte-correct (verified with `od -c`, since the raw terminal rendering of the captured output displayed what looked like a missing word — confirmed to be a display artifact only, not a data-corruption bug).
- G11 initially failed (`range fallback -> 0`, required >=1) because the first draft of the `#4667` comment's "Ordered fallback" paragraph never used the literal phrase naming when the range fallback fires. Fixed by adding an explicit sentence; re-verified passing.

## Vacuous Gates (reported honestly, not as assurance)

- The two `npx prettier --file-info` probes at the end of Task 3 are **vacuous by design**: both paths (`.planning/todos/completed/...md`, `probe-union.sh`) report `{ "ignored": true, "inferredParser": null }`. Per CLAUDE.md's own documented finding, a `--check` over an ignored path exits 0 having matched zero files — identical output to a real pass — so no `--check` was run; the `--file-info` probe is the proof of the premise, not a formatting assurance.
- No other gate in G1-G22 passed vacuously against the shipped (post-Task-1/2/3) state. Every negative-control run against the pristine snapshot (`$SNAP`) failed as expected (the resolver functions and `#4667` comment do not exist in the snapshot), confirming the gates exercise real logic rather than trivially passing either way.

## Findings Recorded Per Task 3's Explicit Requirements

- **Exact diff size** (live `code-review.md` vs. pristine snapshot): **207 total diff lines** (`diff | wc -l`), **182 added** (`^>`), **12 removed** (`^<`). Live file: 1189 lines; pristine: 1019 lines.
- **Cost delta** (G15, re-measured live on phase 34.6, not copied): union wall time **1.645s total** (0.61s user + 0.48s system, 117 `git show` calls) vs. range-only wall time **0.010s total**. Did not exceed 5s — the batched-`git show` remedy named in the `#4667` comment is confirmed **not implemented**, consistent with the comment's own statement.
- **Upgrade trap**, re-probed live (not copied from the `ivj` SUMMARY):
  - Live file sha256: `a1e0df469a7bddbdf6b79558d6e90facb2856f3616750a54f472596adef3a91b`
  - `gsd-file-manifest.json` pristine hash for this path: `8c4f74ce02a47cb918f9651204a5179e243ccc4b25b190161ee6ba980d6cc2f9` — confirms the live file already diverges, and this task's edits diverge it further.
  - `backup-meta.json` occurrences of `code-review`: **0**. The parking/local-modification detector has **not** captured this file at all — stated plainly: nothing in this task exercises that detector.
  - `/gsd-update --reapply` is a MANUAL step; nobody runs it automatically. Until it runs, an upgrade of `@opengsd/gsd-core` would silently revert this fix and the mis-scoping this task closes would regress.
- **Remaining step, stated as remaining:** the durable fix is an upstream report against `@opengsd/gsd-core` (currently 1.14.0 per the manifest). None was filed, and `/gsd-update` was not run — both out of scope by explicit constraint, both still open.
- **Probe figure agreement:** every pinned figure in `<measured_baseline>` was reproduced exactly on re-measurement (phase 41: union 9/drops 14; phase 34.6: union 42/drops 154, scoped_commits=117, union_minus_range=2; phase 42: union 69/drops 534; phase 45: range 426, union empty). No disagreements to report.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The union-of-scope-commits mechanism is live in the local `code-review.md` patch and verified against real repo history; no further in-repo work is required for this quick task's scope.
- Two open items remain, both explicitly out of scope by constraint and named above as remaining steps: filing an upstream report against `@opengsd/gsd-core`, and running `/gsd-update --reapply` (which would also newly exercise the parking/local-modification detector against this file for the first time).

## Self-Check: PASSED

- `probe-union.sh` exists at `.planning/quick/260930-juy-scope-code-review-by-commit-scope-union/probe-union.sh` — confirmed.
- Commit `dd08d0d4b` exists in `git log --oneline --all` — confirmed.
- Commit `5436f74c2` exists in `git log --oneline --all` — confirmed.
- `.planning/todos/completed/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md` exists on disk; `.planning/todos/pending/2026-09-30-code-review-anchor-is-a-range-not-a-per-phase-exact-union.md` does not — confirmed.

---
*Phase: quick-260930-juy*
*Completed: 2026-09-30*

## Correction 2026-09-30 — comment markers renumbered to #3926

The two local patches were written citing `#4666` (260930-ivj) and `#4667` (260930-juy). Those
numbers were verified unused across the local `gsd-core` / `gsd-pristine` / `gsd-local-patches`
trees and that was wrongly treated as "free". The file's `#NNNN` convention denotes real
`open-gsd/gsd-core` issue numbers — `#3503`, `#2989`, `#4460` all resolve to genuine past issues
about this same file — and upstream both chosen numbers are real unrelated artifacts: `#4666` is a
merged PR confining argv boundary joins, `#4667` a closed issue about install leaving 237
`@~/.claude/` includes. A reader following either marker landed on unrelated work.

Both patches are renumbered to **`#3926`**, the upstream issue that is this exact defect
("code-review Tier-3 diffs to `HEAD` instead of the phase's own commits ... 248 files instead of 20
— and silently downgraded `--depth=deep` to `standard`"). `#3926` is closed as a duplicate of
`#4631`, which is superseded by the open epic `#5056`; the finding was filed there at
https://github.com/open-gsd/gsd-core/issues/5056#issuecomment-5903122765 — so the
"no upstream gsd-core issue filed" wording in both headers was removed as no longer true.

Two sites needed judgement rather than a blind swap: the supersession line now names "the
260930-juy union resolver below" instead of a self-referential `#3926`, and a directional error was
fixed at the same time ("extends `#4666` below" — that block is *above*). The renumber is
comments-only: stripping all comment lines from the before/after file yields a byte-identical
result, and re-extracting and re-executing the two resolver functions reproduces union 9 / 42 / 69,
drops 14 / 154 / 534, and phase 45's non-empty 426-file fallback.

The committed PLAN artifacts still cite the old numbers; they are point-in-time records and were
deliberately left alone. `.planning/STATE.md`, being the live index, was corrected.
