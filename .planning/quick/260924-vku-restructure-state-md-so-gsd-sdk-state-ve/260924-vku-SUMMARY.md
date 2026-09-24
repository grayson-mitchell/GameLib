---
phase: quick-260924-vku
plan: 01
status: complete
subsystem: planning-docs
tags: [state-md, gsd-sdk, corruption-fix, planning-gate, restructure, worktree-proof]
dependency-graph:
  requires: []
  provides: [state-md-sdk-field-anchor, state-sdk-field-anchor-gate, state-history-archive]
  affects: [.planning/STATE.md, .planning/STATE-HISTORY.md, .planning/state-sdk-field-anchor-gate.py, meta/runPlanningGates.py, .planning/todos]
tech-stack:
  added: []
  patterns: [sdk-regex-transliteration-gate, verbatim-history-archive-with-pointer]
key-files:
  created:
    - .planning/STATE-HISTORY.md
    - .planning/state-sdk-field-anchor-gate.py
    - .planning/todos/pending/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md
  modified:
    - .planning/STATE.md
    - meta/runPlanningGates.py
    - .planning/todos/completed/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md
decisions:
  - "Restructure + anchor gate (operator-chosen route, locked at planning time) -- not a patch to the global gsd-sdk, not a wrapper."
  - "Progress: kept as exactly ONE canonical line in Current Position; update-progress returns updated:false with no Progress field otherwise, so a single anchored line is the only shape that lets the real verb work at all."
  - "Frontmatter last_activity deliberately collapses to the body's single short Last activity clause -- the SDK always overwrites it with that body hit on every mutation, so preserving a long narrative there was never sustainable; full history moved to STATE-HISTORY.md."
  - "The two Quick-Tasks-Completed table rows whose PROSE happened to contain bold **Status:**/**Plan:** substrings were moved to STATE-HISTORY.md with a pointer row left in the live table (not silently reworded in place), preserving the plan's 'never reword a moved line' rule while keeping the table well-formed."
metrics:
  duration: "~2.5 hours"
  completed: 2026-09-24
---

# Quick 260924-vku: Restructure STATE.md so gsd-sdk state.* verbs stop corrupting archived history Summary

Restructured `.planning/STATE.md` so every SDK-matchable field literal (`Phase`, `Plan`, `Status`,
`Last activity`, `Progress`, `Last session`, `Stopped at`, `Resume file`) appears exactly once,
anchored inside the section `gsd-sdk`'s own regex computes. Moved every archived line that could
collide with those literals verbatim into a new `.planning/STATE-HISTORY.md`. Added a 13th planning
gate, `.planning/state-sdk-field-anchor-gate.py`, holding that invariant with an 11-case self-test
and belt-and-braces drift detection against the installed SDK source. Proved the fix with real
`gsd-sdk` 1.42.3 runs in two disposable, detached worktrees (RED at the pre-restructure commit,
GREEN at the fix) — a single `state.advance-plan` call corrupted five separate archived locations
on the RED tree in one shot; the identical five-verb sequence produced only classified,
intentional canonical/frontmatter changes on the GREEN tree. Resolved the originating todo and
filed one upstream-report todo. `pnpm planning-gates`: 13/13.

`PRE_SHA = 29f9db85b9ab91ebabe77d98eb5d6ad767f43af1`

## Commits

| Commit | Task | Summary |
|---|---|---|
| `db7613cf5` | 1 | Move archived STATE.md history verbatim into STATE-HISTORY.md, leave one anchored SDK field each |
| `60f76c954` | 2 | Add `state-sdk-field-anchor-gate.py`, raise `planning-gates` floor 12 -> 13 |
| `e98c08fd9` | 3 | Resolve the originating todo (Resolution section, frontmatter `status: RESOLVED`) |
| `e568eaa5a` | 3 | `git mv` the resolved todo to `completed/` (clean R100 rename, 0 insertions/0 deletions) |
| `8121dec56` | 3 | File the upstream-report todo |

## Census: before (PRE_SHA) vs after (restructured)

Field-literal list re-derived by grepping the installed SDK source (`stateExtractField(`,
`stateReplaceField(`, `stateReplaceFieldWithFallback(` call sites in `state.ts`/`state-mutation.ts`)
-- confirmed to match the planning-time interfaces list exactly, plus `Total Phases` and the
over-anchored `Phase` literal (see gate docstring).

**Before** (`census-before.txt`, run against the live tree pre-restructure):

| Field | Hits | Locations (file line) |
|---|---|---|
| Status | 4 | bold@192 (live CP banner), plain@1119, plain@3625, bold@5636 (QTC row) |
| Last Activity / Last activity | 1 | plain@3944 |
| Plan | 8 | bold@127, plain@976, plain@1104, plain@1131, plain@1321, plain@1343, plain@1725, bold@5637 (QTC row) |
| Progress | 6 | bold@3529, 3590, 4288, 4289, 4407, 4424 (all quoted examples inside prose) |
| Last session | 5 | plain@6171, 6175, 6192, 6207, 6959 |
| Stopped At / Stopped at | 23 | plain@6172 (first, correct) ... through plain@6986 |
| Resume File / Resume file | 0 | (no such line existed pre-restructure) |
| `^Phase:` (case-sensitive, in CP) | 3 | 965, 974, 1102 |
| `^Plan:` (case-sensitive, in CP) | 6 | 976, 1104, 1131, 1321, 1343, 1725 |
| `^Status:` (case-sensitive, in CP) | 2 | 1119, 3625 |
| `## Current Position` SDK span | -- | file lines 73-4533 |
| `## Session Continuity` SDK span | -- | file lines 6006-7748 |

Deviation from the plan's own planning-time census (small, expected drift from sessions between
planning and execution): the plan's interfaces block estimated e.g. `**Phase:**` first@111,
`**Status:**` first@192, Current Position span "71-4535". Direct re-measurement (as the plan itself
instructed: "re-grep them and do not trust this list") found `**Status:**` bold still exactly@192
(no drift there) but a handful of others off by ~15 lines (frontmatter grew by a few lines between
planning and execution) and the SDK-computed CP span narrower (73-4533, not 71-4535) because the
plan's own range used "heading+1 through next-heading-1" rather than the SDK's actual greedy-`\s*`
consumption of the heading's trailing blank line. This did not change the move: the restructure
script moved the WIDER heading-to-heading range (file lines 72-4534), a strict superset of the
SDK-computed span, so nothing meaningful was left behind either way.

**After** (`census-after.txt`, run against the restructured file):

| Field | Hits | Location |
|---|---|---|
| Status | 1 | plain, file line 75, inside Current Position (span 73-79) |
| Last Activity / Last activity | 1 | plain, file line 76, inside Current Position |
| Plan | 1 | plain, file line 74, inside Current Position |
| Progress | 1 | plain, file line 77, inside Current Position |
| Last session | 1 | plain, file line 1552, inside Session Continuity (span 1552-1556) |
| Stopped At / Stopped at | 1 | plain, file line 1553, inside Session Continuity |
| Resume File / Resume file | 1 | plain, file line 1554, inside Session Continuity |
| `^Phase:`/`^Plan:`/`^Status:` (case-sensitive) | 1 each | same lines as above |
| every non-canonical literal | 0 | (Last Activity Description, Current Phase, Current Phase Name, Current Plan, Total Plans in Phase, Last Date, Paused At, Total Phases) |

Two additional stray matches were found OUTSIDE both SDK section spans, in the live
`### Quick Tasks Completed` table (not archived narrative, but a growing ledger table whose PROSE
happened to quote bold field-literal text): the `fast-parse22` row quoted `**Status:**` twice
(describing another tool's parser bug), and the `260814-n2o` row used `**Plan:**` as an internal
sub-bullet label. Both rows were moved verbatim to `STATE-HISTORY.md § Other archived blocks`, with
a pointer row left in the live table in their place (not silently reworded — the FULL original row
text is preserved, just relocated, matching the "never reword a moved line" rule applied to the
thing that actually moved).

**Self-caught near-miss, recorded honestly:** the FIRST draft of those two pointer rows literally
re-quoted the colliding substrings (`` `**Status:**` `` / `` `**Plan:**` ``) inside their own
explanatory text — which itself is a fresh bold-field-literal match, reintroducing exactly the
defect being fixed. Caught by the very next census run (`Status: expected 1, got 2`,
`Plan: expected 1, got 2`) before any commit; reworded to describe the collision without
reproducing it (e.g. "a double-asterisk-wrapped Status label").

## Move proof (exact multiset identity, not a blind subtraction)

Scratchpad `state_move_proof.py` (not committed; excerpt below, full output was reviewed then
deleted per the plan's own "do not leave bulk captures behind" instruction).

**Methodology note, since an earlier draft got this wrong and it is worth recording why:** a first
attempt computed "lines removed from STATE.md" as a blind `Counter(old) - Counter(new_state)`
multiset subtraction. This silently undercounts whenever a moved-away archived line is
byte-identical to a freshly-typed new canonical line — which happens here ON PURPOSE: the new
canonical `Phase: 46 (windows-single-instance-guard-and-gamelib-deep-link-registra) — EXECUTING`
line was deliberately worded to match text that already existed verbatim in the old archived
banner (continuity of wording), so `Counter(old)` and `Counter(new_state)` each contain exactly one
copy of that exact string and the blind subtraction cancels it to zero, hiding it from both the
"removed" and "added" reports. The fix used ground truth instead: `R` (removed) is sliced directly
from the OLD file at the exact line numbers the restructure script used; `A` (added) is the
restructure script's own explicit literal constants. The proof is the exact identity
`O - R + A == N`, checked per-key without Python's negative-clamping `Counter` subtraction (which
could hide a real mismatch), plus `HISTORY == HISTORY_STRUCTURAL + R`, plus a positional
(contiguous, in-order) containment check for both large moved ranges.

```
old (PRE_SHA 29f9db85b) STATE.md: 7748 lines
new STATE.md: 1556 lines
new STATE-HISTORY.md: 6235 lines

Ground-truth removed (R): 6210 lines
Ground-truth added (A): 18 lines

=== Assertion 1: O - R + A == N (exact multiset identity, no clamping) ===
OK

=== Assertion 2: STATE-HISTORY.md == structural-additions + R (exact multiset identity) ===
OK

=== Assertion 3: moved ranges/lines appear (contiguous+in-order for ranges) in STATE-HISTORY.md ===
  OK: Current Position archive body found as a contiguous run at history line 9..4471
  OK: Session Continuity archive body found as a contiguous run at history line 4475..6218
  OK: frontmatter last_activity present verbatim in STATE-HISTORY.md
  OK: QTC fast-parse22 row present verbatim in STATE-HISTORY.md
  OK: QTC 260814-n2o row present verbatim in STATE-HISTORY.md

=== Re-running census against the new STATE.md ===
  OK: Status: expected 1, got 1
  OK: Plan: expected 1, got 1
  OK: Progress: expected 1, got 1
  OK: Last session: expected 1, got 1
  OK: Stopped At/at: expected 1, got 1
  OK: Resume File/file: expected 1, got 1
  (every non-canonical field literal: expected 0, got 0)

New Current Position span (body-relative): (58, 64)
New Session Continuity span (body-relative): (1537, 1541)
  OK: 'Phase:' at body line 58 is inside span (58, 64)
  OK: 'Plan:' at body line 59 is inside span (58, 64)
  OK: 'Status:' at body line 60 is inside span (58, 64)
  OK: 'Last activity:' at body line 61 is inside span (58, 64)
  OK: 'Progress:' at body line 62 is inside span (58, 64)
  OK: 'Last session:' at body line 1537 is inside span (1537, 1541)
  OK: 'Stopped at:' at body line 1538 is inside span (1537, 1541)
  OK: 'Resume file:' at body line 1539 is inside span (1537, 1541)

ALL ASSERTIONS PASSED.
```

## Gate self-test + RED-on-pre-restructure output

`python .planning/state-sdk-field-anchor-gate.py --self-test`: 11 cases, all correct (8 REJECT
incl. the `### ` subheading-ends-the-section-early trap and a missing-target-file case, 3 ACCEPT
incl. table-row/mid-line decoys). Real run PASS on the restructured file:

```
OK: .planning/STATE.md -- every canonical field matches exactly once, inside its required section.
```

RED run (`python state-sdk-field-anchor-gate.py <path-to-git-show-29f9db85b-STATE.md>`), exit 1:

```
PROBLEM: field 'Phase': expected 1 match(es), found 5: [('bold', 96), ('bold', 111), ('plain', 950), ('plain', 959), ('plain', 1087)]
PROBLEM: field 'Plan': expected 1 match(es), found 8: [('bold', 112), ('bold', 5622), ('plain', 961), ('plain', 1089), ('plain', 1116), ('plain', 1306), ('plain', 1328), ('plain', 1710)]
PROBLEM: field 'Status': expected 1 match(es), found 4: [('bold', 177), ('bold', 5621), ('plain', 1104), ('plain', 3610)]
PROBLEM: field 'Progress': expected 1 match(es), found 6: [('bold', 3514), ('bold', 3575), ('bold', 4273), ('bold', 4274), ('bold', 4392), ('bold', 4409)]
PROBLEM: field 'Last session': expected 1 match(es), found 5: [('plain', 6156), ('plain', 6160), ('plain', 6177), ('plain', 6192), ('plain', 6944)]
PROBLEM: field 'Stopped At': expected 1 match(es), found 23: [...23 hits...]
PROBLEM: field 'Resume File': expected 1 match(es), found 0: []
PROBLEM: canonical field 'Last Activity' (body line 3929) is followed by a non-blank, non-canonical continuation line: "defects**. (1) Console Mode's `getActionButtonLabel`/`getBackButtonLabel`"
GATE FAILED: ...state-pre.md failed the SDK field-anchor check (8 problem(s) above)
```

Also confirmed: a genuinely missing target file fails via `check_target_file` (exercised in the
self-test); the drift check found and re-derived the installed SDK's real literal set
(`SDK source found at ...get-shit-done-cc\sdk\src\query (version 1.42.3)`), matching the pinned
`SDK_FIELDS` exactly — no drift.

**Self-caught bug in the drift-detection regex, recorded honestly:** the first version of
`CALL_SITE_RE` treated ANY second quoted string immediately after a field-name literal as a
"fallback field name" (the `stateReplaceFieldWithFallback` shape), which produced two false
positives against real code: `stateReplaceField(content, 'Current Plan', '1')` and
`stateReplaceField(content, 'Status', 'Ready to execute')` — both plain `stateReplaceField` calls
where the third argument is the REPLACEMENT VALUE, not a fallback field name, but which happen to
also be quoted string literals. Fixed by capturing whether the call site is actually the
`WithFallback` variant and only treating the second literal as a field name when it is.

## RED vs GREEN worktree SDK diff, classified

Both worktrees created via `git -c core.longpaths=true worktree add --detach <scratch>/wt-{red,green} <sha>`
(see Deviations below for why `core.longpaths=true` was needed), removed via
`git worktree remove --force` + manual `rm -rf` + `git worktree prune` afterward.
`git worktree list` at the end: single entry, the main tree. `git diff --quiet HEAD -- .planning/STATE.md`: clean.

Sequence run identically in both: `state.advance-plan`, `state.update-progress`,
`state.record-metric --phase 260924-vku --plan 03 --duration 5m --tasks 3 --files 5`,
`state.add-decision --phase 260924-vku --summary "RED-control proof decision, worktree only" --rationale "demonstrate corruption for the SUMMARY"`,
`state.record-session --stopped-at "260924-vku proof run"`.

### RED (`wt-red`, `git checkout 29f9db85b`) — every hunk classified

| Hunk | Classification |
|---|---|
| frontmatter `stopped_at`/`last_activity`/`completed_plans` | Intended (record-session + disk rescan) |
| `> **Plan:** 12 of 19 (...)` -> `13 of 19 (...)` at old line 112 | **CORRUPTION** — archived "PHASE 35 EXECUTING" banner, not live |
| `> **Status:** Executing Phase 46` -> `Ready to execute` at old line 177 | **CORRUPTION** — same archived banner (this Status text was itself a residue of an EARLIER, unnoticed corruption that happened to read correctly by coincidence) |
| `Plan: 1 of 7` -> `Plan: 13 of 19 (...)  [~600 chars of unrelated banner text]` at old line 961 | **CORRUPTION** — a short, correct archived line overwritten wholesale by `updateCurrentPositionFields`'s section-scoped `^Plan:` replace, because pre-restructure the "Current Position" section span covers almost the entire historical record (old body lines 58-4518) |
| `Status: Executing Phase 46` -> `Status: Ready to execute` at old line 1119 | **CORRUPTION** — a second, separate archived Status occurrence |
| Performance Metrics row appended | Intended (record-metric) |
| Decisions bullet appended | Intended (add-decision) |
| `Last session:`/`Stopped at:` at old lines 6171/6172 updated | Intended, by LUCK — this happened to be the FIRST (and correct) pair in the old file's Session Continuity span; confirms the defect is positional-luck-dependent, not guaranteed on every call |
| `**Progress:**[...] 98%` at old line 3514 | **CORRUPTION, invisible in the diff** — `update-progress` computed 98% (matching real disk state, 497/506) and overwrote a quoted "trusted blindly. The recurring `**Progress:**[...] 98%`" EXAMPLE inside prose about this very bug, producing NO visible text change because the quoted example already happened to say "98%" — the write still landed on the wrong location, it just wasn't observable this run |

**One `state.advance-plan` call alone corrupted FIVE separate locations** (two `Plan:`-shaped
lines, two `Status:`-shaped lines, plus the frontmatter `last_activity` collapse). `advance-plan`
took the compound-format path: `stateExtractField(content,'Plan')` found the bold
`**Plan:** 12 of 19 (...)` first (bold always wins over plain, first-hit, no anchor), parsed
`currentPlan=12`, `totalPlans=19`, and produced `{"advanced":true,"previous_plan":12,"current_plan":13,"total_plans":19}`
— numbers with NO relationship to Phase 46's real "7 of 7".

### GREEN (`wt-green`, `git checkout 60f76c954`) — every hunk classified

| Hunk | Classification |
|---|---|
| frontmatter `status: executing` -> `verifying` | Intended — re-derived via `normalizeStateStatus` from the body's new `Status: Phase complete — ready for verification` text, which matches the `verif` substring check BEFORE the `complete` check in the SDK's if/else-if chain (a real SDK subtlety, not a gate defect) |
| frontmatter `stopped_at`/`last_activity`/`completed_plans` | Intended |
| `Status: Executing Phase 46` -> `Status: Phase complete — ready for verification` | Intended — the ONE canonical line, correctly targeted |
| `Last activity: <clause>` -> `Last activity: 2026-09-24` | Intended — the ONE canonical line; `advance-plan`'s `last_plan` branch writes only a bare date via `stateReplaceFieldWithFallback(...,'Last Activity','Last activity',today)`, no clause preserved (an SDK terseness, not corruption) |
| `Progress: [████████░░] 83%` -> `[██████████] 98%` | Intended — the ONE canonical Progress line |
| Performance Metrics row appended | Intended |
| Decisions bullet appended | Intended |
| `Last session:`/`Stopped at:` -> new values; `Resume file: None` unchanged (same value written back) | Intended — all three are the ONE canonical Session Continuity lines |

**Zero archived text touched.** Every hunk in the GREEN diff maps directly onto a canonical field,
a frontmatter field independently derived from it, or an explicitly-appended table row/bullet.
`state.advance-plan` correctly took the `reason:"last_plan"` branch (`currentPlan=7 >= totalPlans=7`
from the canonical `Plan: 7 of 7` line), matching the plan's own prediction to check for exactly
this. The anchor gate was re-run against the post-mutation file and stayed GREEN
(`OK: ...wt-green\.planning\STATE.md -- every canonical field matches exactly once...`).

### `normalizeMd` (whole-file markdown normalization on every write)

`readModifyWriteStateMd` runs `normalizeMd()` on every write (blank-line-around-headings/lists/
fences, collapse 3+ blank lines to 2, ensure exactly one trailing newline) — a WHOLE-FILE pass, not
scoped to the touched lines. Reported honestly: in both worktrees the observed diffs contained NO
stray reformatting hunks beyond the targeted field/table/bullet changes, meaning the restructured
file (and, separately, the pre-restructure file) already conformed to `normalizeMd`'s rules well
enough that this run triggered no additional normalization. This is NOT a guarantee that
`normalizeMd` can never introduce an unrelated blank-line diff on some other write — only that it
did not on these five calls, against these two trees.

## `state.json` before/after comparison

| Field | wt-red before | wt-red after | wt-green before | wt-green after |
|---|---|---|---|---|
| `status` | `executing` | `executing` (`Ready to execute` matches `normalizeStateStatus`'s explicit `ready to execute` branch) | `executing` | `verifying` (`verif` substring match, see above) |
| `stopped_at` | `46-05 live gate FAIL...` | `260924-vku proof run` | `46-05 live gate FAIL...` | `260924-vku proof run` |
| `last_activity` | `2026-09-24 -- Quick task 260923-qe5: ...` (~9 KB) | `2026-09-24` | `2026-09-24 -- Quick task 260924-swb: fixed library card art... STATE-HISTORY.md.` (~230 chars) | `2026-09-24` |
| `progress.completed_plans` | 495 (stale frontmatter) -> 497 | 497 | 495 (stale frontmatter) -> 497 | 497 |
| `progress.percent` | 83 | 83 | 83 | 83 |

`progress.percent` is UNCHANGED in both trees despite `update-progress` writing "98%" into the
BODY's canonical/archived `Progress:` line: `buildStateFrontmatter`'s `progress.percent` is
independently computed by `computeProgressPercent(completedPlans, totalPlans, completedPhases,
totalPhases)` purely from DISK counts (497/506 plans, 35/42 phases -> `min(98.2%, 83.3%) = 83%`,
rounded), and only falls back to parsing the body's `Progress:` text when the disk computation
returns `null`. The body write happened in both trees; it just never reaches this particular
frontmatter field either way — a pre-existing SDK behavior, not something this task introduced or
changed.

`completed_plans` 495 (stale, whatever the last frontmatter commit recorded) -> 497 (fresh disk
scan) is IDENTICAL between wt-red and wt-green, confirming it is unrelated to the restructure —
both worktrees' `.planning/phases/` disk contents are identical at their respective commits (2
more `*-SUMMARY.md` files exist on disk than the frontmatter's stale count records, from
quick-task-adjacent work between commits).

## Formatter coverage (stated, not faked)

`.planning` is listed in `.prettierignore` (`.prettierignore:28-29`), so
`npx prettier --check .planning/STATE.md .planning/STATE-HISTORY.md` matches ZERO files and prints
"All matched files use Prettier code style!" having checked nothing — confirmed live, not assumed.
Separately, `npx prettier --check .planning/state-sdk-field-anchor-gate.py meta/runPlanningGates.py`
errors with "No parser could be inferred for file ...runPlanningGates.py" — prettier has no Python
parser at all, so it cannot cover `.py` files under any invocation. No formatter covers any file
touched by this task.

## Deviations from the plan

**Rule 1/3 auto-fixes (bugs caught and fixed before commit, all self-caught during verification,
none shipped):**

1. **[Rule 1 - Bug] Pointer-row text re-introduced the collision it described.** The first draft of
   the two Quick-Tasks-Completed pointer rows literally quoted `` `**Status:**` ``/`` `**Plan:**` ``
   inside their own explanatory prose — a fresh bold-field match. Caught by the census re-run
   before commit; reworded to describe the collision without reproducing it. Files:
   `state_restructure_constants.py` (scratchpad, not committed). No commit — fixed pre-commit.
2. **[Rule 1 - Bug] Move-proof methodology (blind Counter subtraction) silently hid a real
   collision.** See "Move proof" section above. Fixed pre-commit; not shipped in any commit (the
   proof script itself is a scratchpad artifact, deleted after use per the plan's own instruction).
3. **[Rule 1 - Bug] Drift-detection regex false-positived on plain `stateReplaceField` calls whose
   third argument happens to be quoted.** See "Gate self-test" section above. Fixed in
   `state-sdk-field-anchor-gate.py` before it was ever committed (commit `60f76c954` already
   carries the fix).
4. **[Rule 1 - Bug] `check_document`'s canonical-continuation-line check (must_haves check #2) used
   a case-SENSITIVE prefix match**, so `"Last activity:".startswith("Last Activity:")` was `False`
   and the gate rejected its OWN valid minimal document at first self-test run. Fixed to a
   case-insensitive comparison (matching the SDK's own `i`/`im` regex flags) before commit.

**Non-plan technical deviations (environment-forced, not scope changes):**

5. **Windows "Filename too long" on plain `git worktree add`.** Both `wt-red` and `wt-green`
   creation failed outright under the default git config, because the scratchpad path (~140 chars)
   plus this repo's own long tracked paths (several evidence/log files under
   `.planning/phases/34.9-.../evidence/` exceed 100 chars alone) exceed Windows's 260-char
   `MAX_PATH`. Resolved with a per-invocation `git -c core.longpaths=true worktree add ...` —
   a transient flag scoped to that one command, never written to any persisted git config file (no
   `git config` mutation occurred, satisfying the "NEVER update the git config" rule).
6. **The same limit hit `git worktree remove --force`** on cleanup: git's own internal directory
   deletion failed with the identical "Filename too long" error, though it DID successfully remove
   the worktree's git-level registration (`git worktree list` showed only the main tree
   immediately after). The leftover directories on disk were removed with a plain `rm -rf` (Git
   Bash's `rm`, unlike git's own deletion routine, handled the long paths without issue).
   `git worktree prune` afterward found nothing stale to prune, confirming the registrations were
   already clean.
7. **Unanticipated side effect: worktree creation triggered a `pnpm install`/`download-helper-binaries`
   run** (visible husky/pnpm output during both `git -c core.longpaths=true worktree add` calls, and
   also once during an earlier `git checkout -- .planning/STATE.md` used to restore the working tree
   between two restructure-script attempts). This was not anticipated by the plan and is not
   something this task's scripts triggered directly — some hook fires on checkout events in this
   repo. Observed to be side-effect-free for this task's purposes (each worktree is disposable and
   was fully removed afterward; the download activity was scoped to that worktree's own
   `node_modules`/cache, never the real repo), but recorded honestly since it was unexpected.
8. **Census measurement caveat:** the `fast-parse22` Quick-Tasks-Completed row genuinely contains
   TWO raw `**Status:**` substrings (confirmed via `grep -o`), but the census script's
   `finditer`-based bold-match counting registers only ONE hit for that row, because the greedy,
   non-`DOTALL` `.*` capture of the first match consumes the rest of that single (very long,
   single-line table row) line, and `finditer`'s next search starts past that consumed span. This
   under-counts same-line duplicate collisions but does not affect the FIX, since the whole row was
   moved/defused as one unit regardless of exactly how many raw substrings it carried.
9. **`Phase` is not actually read via `stateExtractField`/`stateReplaceField`'s generic
   bold-anywhere/plain-line-start search anywhere in the installed SDK** — no call site uses the
   bare literal `'Phase'` (only `'Current Phase'`). It is read/written ONLY via
   `updateCurrentPositionFields`'s/`stateAdvancePlan`'s own inline case-sensitive `^Phase:` regex,
   scoped to the Current Position section. `Phase` was anchored in `SDK_FIELDS` under the SAME full
   bold+plain rule as every other field anyway, as a deliberate over-anchor with no downside.

**No deviation required stopping and reporting** — nothing in this plan's execution would have lost
history text; every deviation above was caught and corrected before any commit, or was an
environment-level technical accommodation with no effect on the plan's actual requirements.

## Self-Check

- `[ -f .planning/STATE-HISTORY.md ]` -> FOUND
- `[ -f .planning/state-sdk-field-anchor-gate.py ]` -> FOUND
- `[ -f .planning/todos/completed/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md ]` -> FOUND
- `[ -f .planning/todos/pending/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md ]` -> FOUND
- `[ ! -f .planning/todos/pending/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md ]` -> CONFIRMED (moved)
- `git log --oneline --all | grep -q db7613cf5` -> FOUND
- `git log --oneline --all | grep -q 60f76c954` -> FOUND
- `git log --oneline --all | grep -q e98c08fd9` -> FOUND
- `git log --oneline --all | grep -q e568eaa5a` -> FOUND
- `git log --oneline --all | grep -q 8121dec56` -> FOUND
- `git worktree list` -> single entry (main tree only)
- `git diff --quiet HEAD -- .planning/STATE.md` -> clean

## Self-Check: PASSED

## What the orchestrator still owes

Per the executor's constraints for this task: this SUMMARY does not add the Quick Tasks Completed
row to STATE.md, does not update ROADMAP.md, and does not commit PLAN.md/SUMMARY.md — the
orchestrator's own docs commit handles those, applied ON TOP of the restructured STATE.md (not as
if it were still the pre-restructure shape). The plan's frontmatter also names
`requirements: [TODO-2026-09-23-gsd-sdk-state-corruption]`; this executor did not run
`requirements.mark-complete` against the real repo (out of scope for this quick task's explicit
constraints, which named only the STATE.md/todo/gate work) — left for the orchestrator to action if
desired.
