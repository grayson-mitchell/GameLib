---
phase: 87-engine-wine-and-tools
plan: 71
subsystem: gap-closure-live-gate-contract
tags: [gap-closure, svc-02, d-06, d-11, d-12, d-13, d-21, d-e, live-gate, macos, contract-authoring, todos]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-RERUN-1-HUMAN-UAT.md scored by 87-69 (findings RF1 to RF6, observations O1 to O3); 87-72 to 87-79 planned"
provides:
  - "87-RERUN-2-HUMAN-UAT.md: the seven-item re-run 2 contract (preflight P1 to P8, run order, kept results, evidence capture, required literals, Structural Reachability Review, withdrawn items), run by 87-79 only"
  - "two triaged pending todos for O1 and O2, and a dated 'Seen again in 87-69 (RF1)' section on the RF1 todo"
affects: [87-72, 87-73, 87-74, 87-75, 87-76, 87-77, 87-78, 87-79, 87-verification]

actuals:
  tokens: 14000
  tasks: 3
  commits: 3

plan_head_before: df0a29cd9c8c9c3f501e191634367e640fc5037c
commits: 3

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/87-engine-wine-and-tools/87-RERUN-2-HUMAN-UAT.md
    - .planning/todos/pending/2026-11-25-launch-command-log-line-carries-the-raw-home-path-and-env.md
    - .planning/todos/pending/2026-11-25-helper-integration-test-can-orphan-the-signin-helper.md
    - .planning/phases/87-engine-wine-and-tools/87-71-SUMMARY.md
  modified:
    - .planning/todos/pending/2026-11-24-bottled-games-exit-about-one-second-after-the-wine-command.md

key-decisions:
  - "87-71: the contract greps `cancelled (launcher-exited)`, not the plan's `launch deadline cancelled (launcher-exited)`: the emitter writes `Engine: launch deadline for key <k> cancelled (<reason>)` (deadline.rs:195)"
  - "87-71: item 5's launcher title is a preflight input derived from the matcher: a launch whose launcher stays up (so launcher-exited never cancels the deadline) and whose game process the four path forms cannot match; with a read-only candidate procedure and `blocked` as the named fallback"
  - "87-71: item 7's disabled-state game is found read-only from GamesConfig (stored wineCrossoverBottle differs from per_game_bottle_name, winePrefix equals the default); fallback is another disabled ToggleSwitch, else `blocked`"

requirements-completed: []

duration: about 25 min
completed: 2026-11-25
---

# Phase 87 Plan 71: Re-run 2 Live Gate Contract and Observation Todos Summary

**The seven-item re-run 2 contract for Phase 87 gap cycle 2 is written and parses as seven pending items; it carries a reachability review (77 pairs, 11 flagged), the required-literal table with six CONDITIONAL rows for 87-79 to re-check, and two new triaged todos plus the RF1 todo link.**

## What was built

- **`87-RERUN-2-HUMAN-UAT.md`** (`authored_by: 87-71`, `run_by: 87-79`, `status: pending`). Seven items: (1) offline refusal with no generic warning first and the launch ending, (2) the generic warning still showing when the engine would launch, (3) CrossOver launches staying up, (4) Stop on a non-Steam CrossOver game, (5) the 180 s no-raise hold, (6) Cancel changing nothing and the bottle removal with the sibling byte-identical, (7) the disabled toggle legible in Midnight Mirage, Gruvbox Dark and Dracula. `parseUatItemsWithStats` reads 7 items, `headingsSeen` 0, each `result: pending`.
- **P5 (d)** derives the item 5 launcher title from `launch/watch.rs` and `launch/deadline.rs`: the 180 s notice fires only for a launch whose launcher process stays up and whose game process none of the four path forms matches. It names a read-only candidate procedure (names, install directories and configured executables only) and the `blocked` fallback.
- **P5 (e)** names the read-only disabled-state procedure and its fallback surface.
- **Structural Reachability Review:** all seven tests. Test 5 considered 77 pairs (11 state-mutating by 7 evidence-bearing) and flagged 11, each with a resolution.
- **Required literals:** 11 rows; six carry `re-check: 87-79 Task 1` (87-73, 87-76, 87-77, 87-75 twice, 87-74). Each ABSENT row names its presence case from re-run 1 and confirms its emitter still exists at HEAD.
- **Two todos:** O1 (the `Launching <title>:` line logs the raw home path and env; `severity: medium`, `platform: any`, `ready: code`) and O2 (helperIntegration can orphan `steam-bridge-helper-signin`; `severity: medium`, `platform: macos`, `ready: code`). The RF1 todo gained one `## Seen again in 87-69 (RF1)` section naming 87-72, 87-77 and re-run 2 item 3. No existing todo covered O1 or O2, so nothing was merged.

## Task Commits

1. **Tasks 1 and 2: the contract** - `ff5724210` (docs)
2. **Task 3: the todos** - content landed in `ade29b55f`, a concurrent Phase 88.1 session's commit (see Deviations)
3. **Plan metadata:** the commit that carries this SUMMARY and STATE.md

`commits: 3` is measured from the ledger base `df0a29cd9`. Main is shared with the live Phase 88.1 session, so `ade29b55f` is counted though it is that session's commit.

## Deviations from Plan

**1. [Rule 1 - Bug] The plan's deadline-cancel literal does not match the emitter.**
- **Found during:** Task 2 (grepping each literal's emitter)
- **Issue:** the plan names the absent line `launch deadline cancelled (launcher-exited)`. `launch/deadline.rs:195` writes `Engine: launch deadline for key {key} cancelled ({reason})`, so a grep for the plan's text would never match, and the absence would pass vacuously.
- **Fix:** the contract's required-literals row and items 3 and its Test 4 use `cancelled (launcher-exited)` and quote the emitter's real text.
- **Files modified:** `87-RERUN-2-HUMAN-UAT.md`. **Commit:** `ff5724210`.

**2. [Process] Tasks 1 and 2 share one commit.** Both tasks write the same file, and the file was written complete in one pass, so the two commits the protocol asks for became one. Task 1's verify and Task 2's verify both ran against the final file.

**3. [Process] The Task 3 todos were committed by a concurrent session.** The three todo files were staged when the Phase 88.1 session ran `git commit`, which took them into `ade29b55f` (`test(88.1-05): ...`). The content is as written here and no history was rewritten. The same thing happened to 87-69's SUMMARY.

**4. [Scope] STATE.md.** As the plan directs, only `state.record-metric` and `state.add-decision` ran. `state.advance-plan`, `state.record-session` and `state.update-progress` did not, because the Current Position belongs to the live Phase 88.1 session. `roadmap.update-plan-progress` reported "no changes were needed" (82 plans, 73 summaries). `requirements.mark-complete` was not run: SVC-02's live half is not proven until 87-79 scores re-run 2 (as 87-69 recorded). The STATE.md commit also carries the Phase 88.1 session's uncommitted metric row.

**Total deviations:** 1 auto-fixed (Rule 1), 3 process notes. **Impact:** none on scope; the contract is stronger for the literal fix.

## Known Stubs

None. The plan wrote only documentation.

## Threat Flags

None.

## Issues Encountered

None.

## Next Phase Readiness

87-72 to 87-77 can proceed; 87-78 produces gap build 2 and records `Gate (gap build 2)` under `### Phase 87 gap build 2 (87-78)`, and 87-79 runs the contract after re-checking its CONDITIONAL rows. Open for the operator at P5: a launcher title for item 5 (none may exist), and a game in the disabled-toggle state for item 7 (none existed in re-run 1).

## Self-Check: PASSED

- FOUND: `.planning/phases/87-engine-wine-and-tools/87-RERUN-2-HUMAN-UAT.md` (7 items, headingsSeen 0, 9 required sections, 6 CONDITIONAL literal rows, 7 `### Test N`)
- FOUND: both new todos, `severity platform ready` in that order; one `## Seen again in 87-69 (RF1)` section
- FOUND: `ff5724210`, `ade29b55f` (ancestors of HEAD)
- `pnpm planning-gates`: 12/12 passed
