---
phase: 84-logger
plan: 09
subsystem: infra
tags: [logger, rust, shutdown, exit-budget, docs, finish-context]
status: complete

requires:
  - phase: 84-logger
    provides: "shell_log and the native writer (84-08), the writer's flush barrier (84-02), the exit budget and Shutdown registry (Phase 83)"
provides:
  - "gamelib_core::shutdown::FinishContext { still_running, elapsed, remaining } and run_exit's finish as FnOnce(&FinishContext)"
  - "handle_exit's finish: reaper disarm, wake-lock release, socket cleanup, the two exit lines through shell_log, then gamelib_log::flush(ctx.remaining) last"
  - "gamelib-log tests: a started Logger holds no Shutdown registrant; lines submitted just before the exit flush are on disk when it returns true; a zero-budget flush returns at once"
  - "tauriShellSource's handle_exit shape test pins the finish order, the single flush, and that nothing is logged after run_exit"
  - "living documents describe the post-84 sinks: crates README section 2c and the new section 13, the live-gate reference's sink partition and rotation citation, the gamelib-conventions Rust shutdown text, two comments, the 82 ownership table's uploadedLogs and app-logs rows"
affects: [84-10, 84-11]

actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: ad621c9cf552e482b254b2c6e934a0c888fc756c
plan_head_after: 0cfcebb7f7c3a63b12f416275e2615b8e0816b68

tech-stack:
  added: []
  patterns:
    - "the exit path hands its final stage the budget that is left, and the writer flushes inside it rather than registering with Shutdown"
    - "a source-text gate that pins a closure's tail by regex over the comment-stripped function body"

key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-core/src/shutdown.rs
    - src-tauri/src/main.rs
    - src-tauri/crates/gamelib-log/src/writer.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - src-tauri/crates/README.md
    - meta/captureShellScrollback.ts
    - src/frontend/screens/Login/components/Runner/index.tsx
    - src/frontend/screens/Login/components/Runner/__tests__/logoutFailureSurface.test.tsx
    - .claude/skills/gamelib-conventions/SKILL.md
    - .claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md

key-decisions:
  - "The logger gets no Shutdown registrant; the explicit gamelib_log::flush(ctx.remaining) is finish's last statement (D-13 as amended, D-21)"
  - "The two exit lines keep their pre-existing order (exit finished first, then the overrun line) now that they are written inside finish, so the live-gate scoring of the 83 lines reads the same"
  - "The exit-timing figure is ctx.elapsed, measured when finish starts; it excludes the flush, which is bounded by ctx.remaining and not a stage of its own"

requirements-completed: [FND-05]

coverage:
  - id: E1
    description: "run_exit hands finish a FinishContext (overruns, elapsed, remaining = total - elapsed, saturating); finish runs exactly once after children; every pre-existing shutdown case still passes"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-core shutdown (13 passed: 11 existing with the closure signature updated, plus finish_is_told_nothing_overran_and_how_much_of_the_budget_is_left_when_drains_are_quick and finish_is_told_the_overrunning_drain_and_almost_no_time_left)"
        status: pass
    human_judgment: false
  - id: E2
    description: "handle_exit writes the overrun line (only on an overrun) and the exit-timing line inside finish and flushes the writer last, inside the one 5 s budget; nothing is logged after run_exit"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src/backend/__tests__/tauriShellSource.test.ts (handle_exit finishes with reaper disarm, wake-lock release, socket removal, the two exit lines and the writer flush last); quitTeardownWiring and sidecarShutdownFlagSource unchanged and green"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell (588 passed)"
        status: pass
    human_judgment: true
    rationale: "That the two lines actually reach a real gamelib.log on a real quit, including an overrun, is observed by the live gate (84-10); the unit proof is the source shape and the writer-level flush test"
  - id: E3
    description: "The logger holds no Shutdown registrant (a permanent one would report `still running at exit deadline: logger` on every exit); an exit flush is bounded and lands lines submitted just before it"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-log writer:: (23 passed, incl. a_started_logger_holds_no_shutdown_registrant, lines_submitted_just_before_the_exit_flush_are_on_disk_when_it_returns_true, a_flush_with_a_zero_budget_returns_at_once); grep -v '^\\s*//' gamelib-log/src/*.rs | grep -c 'register(' == 0"
        status: pass
    human_judgment: false
  - id: E4
    description: "Every living document describes the post-84 sinks: no shipped file names gamelib-shell.log or shell_diag; the live-gate reference's partition and rotation rule are rewritten; the 82 table's uploadedLogs and app-logs rows are dated"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "grep -c gamelib-shell.log over README, captureShellScrollback.ts, Runner/index.tsx, logoutFailureSurface.test.tsx == 0; grep -c shell_diag over the conventions skill and README == 0; loggerPortComplete.test.ts and logoutFailureSurface.test.tsx green"
        status: pass
    human_judgment: true
    rationale: "Whether the rewritten sink partition and the README worked example read correctly to a later gate author is a judgment, not an assertion"
---

# Phase 84 Plan 09: The exit flush inside the one budget, and the sink documents Summary

**Exit now writes `exit finished in <ms> ms` and (on an overrun) `still running at exit deadline: <names> (<count>)` inside `run_exit`'s finish stage and flushes the native writer last for at most the budget that is left, with no Shutdown registrant for the logger; the README, the live-gate reference, the conventions skill and the 82 ownership table now describe the post-84 sinks.**

## Performance

- **Duration:** about 25 min (not timed by the harness; estimated from the session)
- **Completed:** 2026-11-21
- **Tasks:** 2 (a tracer and an auto task)
- **Files:** 11 changed across the two task commits (none created)

## Accomplishments

- Task 1 (tracer): `FinishContext` and the new `run_exit` signature in gamelib-core. `handle_exit`'s finish closure now takes `ctx`, keeps the reaper disarm, wake-lock release and socket cleanup first, logs the exit-timing line and (only when `ctx.still_running` is non-empty) the overrun line through `shell_log`, then ends with `let _ = gamelib_log::flush(ctx.remaining);`. The two `shell_log` calls after `run_exit` are deleted, and the doc comment says the lines are written inside finish and the writer flushes last. Two gamelib-core tests cover the context, three gamelib-log tests cover the no-registrant proof, the exit flush and the zero-budget flush, and `tauriShellSource.test.ts` pins the finish order over the comment-stripped body: the cleanup calls, then both lines, then the single `gamelib_log::flush(ctx.remaining)` as the closure's last statement, directly followed by `run_exit(...)` with nothing logged after it.
- Task 2: crates README section 2c rewritten for the finish-stage exit lines and a new section 13, "Fifth worked example: the logger (Phase 84)"; the live-gate reference's Test 3 partition rewritten (shell lines in the transcript and in gamelib.log as `[Shell]`; crate diagnostics and sidecar frames in gamelib.log only; reaper stderr in the transcript only; `gamelib-shell.log` no longer written; a note that the 34.4.2 worked examples cite the pre-84 partition) and Section 3's rotation citation changed to the Rust writer's rule; the conventions skill's Rust shutdown mechanics; the comments in `meta/captureShellScrollback.ts`, `Runner/index.tsx` and `logoutFailureSurface.test.tsx`; the `uploadedLogs` row (TS-mirror deletion 85 -> 84, dated, 84-06, D-09) and the `app-logs` row (0600, D-18) of 82-STATE-OWNERSHIP.md.

## Task Commits

1. **Task 1: the exit lines and the final flush inside the 5 s budget** - `5d49036f0` (feat)
2. **Task 2: living documents describe the post-84 log sinks** - `0cfcebb7f` (docs)

`commits: 2` in the frontmatter is the measured `git rev-list --count plan_head_before..HEAD` at the last code commit; no concurrent commit landed in this window.

## Verification (plan-end gates, run at the plan's last code commit)

| Gate | Result |
| --- | --- |
| `cargo test -p gamelib-core shutdown` | 13 passed |
| `cargo test -p gamelib-log writer::` | 23 passed |
| `cargo test --bin gamelib-shell` | 588 passed, 2 ignored (`handle_exit` filter matches 0 Rust tests; the shape gate is the jest test) |
| `cargo clippy -p gamelib-core -p gamelib-log --all-targets -- -D warnings`; `cargo fmt -p gamelib-core -p gamelib-log --check`; rustfmt on main.rs | clean |
| jest: tauriShellSource, quitTeardownWiring, sidecarShutdownFlagSource | 310 passed, 3 suites |
| jest: logoutFailureSurface, loggerPortComplete | 53 passed, 2 suites |
| `pnpm codecheck` | exit 0 (the TS2322 the dispatch note named is no longer reported) |
| `pnpm lint` | exit 0 (production: PASS, tests: PASS) |
| `pnpm find-deadcode` | PASS (312 baselined) |
| `pnpm planning-gates` | 12/12 passed |
| darwin clippy ratchet (`cargo +1.99.1 clippy --workspace --all-targets`) | PASS, no ceiling moved (win32 ceiling untouched, 84-10's CI-measured count) |
| prettier (`--file-info` not ignored, then `--check`) over the touched test, meta, README and frontend files | clean |
| `pnpm backend-di-ceilings` | FAILS, pre-existing and not this plan's (below) |

Acceptance counts: `pub struct FinishContext` 1; `gamelib_log::flush(ctx.remaining)` in main.rs 1 (the doc comment was reworded so the literal appears once); non-comment `register(` in gamelib-log 0; `[Shell]` in the live-gate reference 1; `shell_diag` in the conventions skill and README 0; `gamelib-shell.log` in the four shipped files 0.

## Deviations from Plan

### Recorded deviation from D-13's wording (planned, CONTEXT "D-13 amendment (plan check W1)")

D-13's superseded sentence: "The logger registers with `Shutdown` as the final stage". This plan ships no such registrant. The mechanism shipped instead: the logger holds no `Shutdown` registrant, and `gamelib_log::flush(ctx.remaining)` is the last statement of `run_exit`'s finish closure (D-21 `FinishContext`). D-13's intent is met unchanged: the logger flushes last, inside the one 5 s budget, so the `still running at exit deadline` line is written, with no budget of its own. A permanent registrant would report `still running at exit deadline: logger` on every exit (84-RESEARCH Pitfall 2). Two tests prove it: `a_started_logger_holds_no_shutdown_registrant` in gamelib-log's writer tests, and the `handle_exit` shape test in `src/backend/__tests__/tauriShellSource.test.ts` (flush last, one flush, nothing logged after `run_exit`).

### Auto-fixed Issues

None needed. Two choices inside the plan's latitude, recorded for the reader:

- **Line order kept.** The plan's action names the overrun line before the timing line in one place and the reverse in another. The two lines keep the pre-existing order (`exit finished in <ms> ms`, then the overrun line) so the 83 gate's scoring reads the same.
- **`remaining` after an overrun is about the child grace, not 0.** The plan's behavior note says "close to 0" for a drain that overruns. `remaining` is `total - elapsed` measured after the children stage, and the drain deadline is `total - child_grace`, so after an overrun it is about the child grace minus whatever the children stage spent. The test asserts `remaining <= child_grace` and `remaining == total - elapsed`, which is the contract D-21 states.

**Total deviations:** 0 auto-fixed, 1 recorded planned deviation. **Impact:** none on scope.

## Pre-existing failures (recorded, not fixed)

- `pnpm backend-di-ceilings` fails only on `src/backend/storeManagers/steam/__tests__/games.test.ts` (jestMock 47 > baseline 45) and the untracked `bridge/__tests__/otherSessionPlaying.test.ts` (2) and `steamOfflineMode.test.ts` (1), all from another session's uncommitted steam bridge work. This plan touches none of them.
- `pnpm codecheck` passed in this run; the TS2322 at `otherSessionPlaying.test.ts:192` that the dispatch note named was not reported (that session's work moved on).

## Prohibition status

Nothing in this plan deletes or rewrites a user's log file. Historical `.planning` documents other than the 82 ownership table are not edited.

## Known Stubs

None.

## Threat Flags

None. No new network surface, auth path or trust-boundary file access; the exit flush is bounded by `ctx.remaining` (T-84-27) and the finish-stage lines plus the shape test cover T-84-37.

## Next Phase Readiness

84-10 (live gate and CI-measured win32 clippy ceiling) can observe the exit lines in a real `gamelib.log` on a real quit; the sink partition it cites is now the post-84 one.

## Self-Check: PASSED

- Commits `5d49036f0` and `0cfcebb7f` are ancestors of HEAD.
- All 11 modified files exist; no file was created.
