---
phase: quick-261120-my5
plan: 01
subsystem: gamelib-steampoll adoption watch
tags: [fix, paused-time, phase-81-truth-15, phase-80-d10]
status: complete
requires: [261120-96e]
provides:
  - "Re-watching the adoption watch during a slow tick no longer runs a second evaluation at once"
key-files:
  modified:
    - src-tauri/crates/gamelib-steampoll/src/adoption.rs
    - src-tauri/crates/gamelib-steampoll/tests/adoption.rs
actuals:
  tokens: 6000
  tasks: 2
  commits: 1
plan_head_before: 7ff3dd68b
commits: 1
completed: 2026-11-20
---

# Quick 261120-my5: the adoption watch never overlaps a slow tick when re-watched

Closes the re-watch half of Phase 81 truth 15 that quick 261120-96e found and left open.

## Commits

- `01ea1d788` fix(steampoll): a re-watch during a slow adoption tick waits for it instead of running a second evaluation (`src/adoption.rs`, `tests/adoption.rs`). The docs commit (PLAN, SUMMARY, todo move, STATE row) follows it and is not counted in `commits:`.

## Guard design

`Inner` gained `tick_gate: tokio::sync::Mutex<()>`, in the shared watcher state, not per spawned task. In the spawned loop's tick arm, a task takes it for the whole `watch.tick().await` body. It is RAII: the guard drops on normal return, on cancel (the future is dropped) and on panic, and a tokio mutex does not poison.

Why a mutex and not the `running.rs` `AtomicBool` swap: `running.rs::poll_once` skips a tick that finds the flag set, which is right for a poll whose next interval tick retries. Here the new task's first tick must not be lost behind a long-lived old tick, and the old task is not going to retry for it. A mutex makes the new task wait.

When the new task finds the gate held: it waits on `lock()` (tokio's mutex is FIFO) and runs the instant the old tick releases it. Delayed, never skipped. The wait is a `biased` select against the task's own cancel token (cancel first), so a task that is itself cancelled while waiting drops out without evaluating, and a cancelled old task does not take the gate back.

Steady state: the gate is uncontended, `lock()` resolves on its first poll, and the interval and `MissedTickBehavior::Delay` are untouched. The three 261120-96e slow-tick tests pass with their exact tick starts (`[5000, 13000, 21000, 26000, ...]`), unmodified.

## Test

`rewatching_while_a_slow_tick_is_in_flight_never_runs_two_evaluations_at_once` in `tests/adoption.rs`. An 8 s `pgrep` is in flight from 5000 ms; at 6000 ms the entry is unwatched and re-watched with no await between, so the new task's first tick is due at 11000 ms.

Assertions, all inside or anchored to the old tick's window: in-flight is 1 at 6000 and again at 12000; the only `pgrep` start at 12000 is the old one; max in-flight is 1; `overlap_in` is `None`; every start after the first is at or after the old tick's finish (13000 ms); and the second start is exactly 13000 ms (delayed, not dropped). Nothing is asserted about the old task's `select!` after 13000, which is not biased.

- Before the fix (test run against the unfixed `adoption.rs`): FAILED at the 12000 ms check, starts `[5000, 11000]` where `[5000]` was expected. The new task's probe started at 11000 ms beside the old call. The `max_in_flight == 1` assertion lies after that one and was not reached; its failure on the unfixed code (`left: 2`) was recorded in 261120-96e's `## Defect found`.
- After the fix: passes.

## Verification

- `cargo test -p gamelib-steampoll --test adoption`: 48 passed (47 existing + 1 new).
- 10-run flakiness loop of the adoption target: 10/10 runs `48 passed; 0 failed`, no FLAKE line.
- `cargo test -p gamelib-steampoll` (whole crate): every target green.
- `cargo fmt -p gamelib-steampoll --check`: exit 0. `cargo clippy -p gamelib-steampoll --all-targets`: no warnings.
- Prettier does not apply to `.rs`; `npx prettier --check` and `pnpm planning-gates` ran over the docs.

## Deviations from Plan

None. The task asked for `cargo fmt --check`; run workspace-wide it reports unrelated pre-existing diffs in `src-tauri/src/ipc_contract.rs` (a file this task did not touch), so it was scoped to `-p gamelib-steampoll`, which is the crate under change.

## Known Stubs

None.

## Self-Check: PASSED

- `01ea1d788` found; `src-tauri/crates/gamelib-steampoll/src/adoption.rs` and `tests/adoption.rs` modified in it; `git rev-list --count 7ff3dd68b..01ea1d788` = 1.
