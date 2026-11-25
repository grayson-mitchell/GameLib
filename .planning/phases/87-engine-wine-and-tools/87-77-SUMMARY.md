---
phase: 87-engine-wine-and-tools
plan: 77
subsystem: engine
tags: [crossover, wineserver, launch, rf1, rust]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: 87-72 root cause for RF1 (the isolating run, commit 8f56d4a9b), the CrossOver launch-shape invariants
provides:
  - the plain cx-healthy launch starts the game's bottle cold, like the launch after a restore
  - red-then-green regression tests at the engine step for the kill and for its three guards
affects: [87-79 re-run 2 item 3 and 4 (live proof), 88.1 launch port]

actuals:
  tokens: 3350
  tasks: 2
  commits: 3

plan_head_before: 8f56d4a9bc751aa294bddcd5b9d4f6b20d42ab65
plan_head_after: 787e1156ef47317b7a5e59479a57a618e28e393e
commits: 3

tech-stack:
  added: []
  patterns:
    - "the engine step stops a server its own pre-flight probe started, unless a game runs in the bottle"

key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-engine/src/launch/step.rs
    - src-tauri/crates/gamelib-engine/tests/crossover_launch_shape.rs
    - .planning/debug/rf1-crossover-launches-exit-within-two-seconds.md

key-decisions:
  - "Guard the kill with games_running_in (any game, the launching key included) rather than other_games_running, so a second Play on a game still marked running never stops the server under it"
  - "Fix at launch/step.rs (the layer inside files_modified); the alternatives in decision/preflight.rs and crossover/demo_status.rs were not touched"

requirements-completed: [SVC-02]

duration: 25min
completed: 2026-11-25
---

# Phase 87 Plan 77: RF1 fix at the engine step Summary

The plain CrossOver launch now stops the wineserver its own `--demo-status` probe started before the launch spawns, so legendary's and nile's wine child meets a cold server as it does after a restore. The live proof is still open.

## Performance

- Tasks: 2 of 2. Commits: 3 (RED, GREEN, record). The SUMMARY commit follows.

## Accomplishments

- Precondition held: the debug record read `status: root-cause-named`, and its `## Fix scope` recommended `launch/step.rs`, inside this plan's files. The isolating run the record listed as 87-77's first step was already done (commit `8f56d4a9b`); it was not repeated.
- Task 1 (tracer): `select_engine_for_launch`, after `deps.prepare`, calls the existing `kill_bottle_wineserver` (CrossOver's `wineserver -k`, `WINEPREFIX` the game's bottle, `CX_ROOT` the bin dir's parent, `KILL_TIMEOUT_MS`) when `prepare_left_server_warm` holds (healthy probe, CrossOver selection, `Prepared`, not switched) and no game is running in the bottle. The helper `prepare_left_server_warm` is new, in the same file.
- Task 2: the debug record now carries `## Fix` and `status: fixed-pending-live`. No gamelib-launch golden records the engine step's spawns, so no 88.1 todo was created and the record says so.

## Tracer red run

At `7aeac966b` (tests only):

```
the_plain_branch_stops_the_wineserver_its_own_probe_started_before_the_launch ... FAILED
assertion `left == right` failed: one wineserver kill for the game's bottle on the plain branch: [plutil build read, wine --demo-status]
  left: 0
 right: 1
test result: FAILED. 9 passed; 1 failed
```

At `3dc67f794` (fix): `crossover_launch_shape` 10 passed. The three guards (another game running, the same game running, the restore branch after its switch) were green before and after, so they pin the fix's limits and do not carry the red.

## Verification run

- `cargo test -p gamelib-engine --features testing`: every suite passes, including `golden_launch` (8), `offline_refusal` (17), `offline_state_verdict` (6), `crossover_launch_shape` (10) and `launch::` (24).
- `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-engine --check`: clean.
- `jest launcher.crossoverEnv, launcher.engineStep, launcher_launchSingleFlight`: 35 passed. `pnpm codecheck`: clean. No `it.failing` and no `should_panic` in either invariant file.
- `pnpm planning-gates`: 12 of 12 pass. `.planning` is prettier-ignored, so no formatter check applies to the record. No TS file was changed, so the TS prettier check had nothing to cover.

## Deviations from Plan

None under Rules 1 to 4 (no unplanned bug, blocker or architectural change). Three notes:

- The plan's `files_modified` lists `launch/settings.rs`, `launcher.ts` and `launcher.crossoverEnv.test.ts`. The named cause is bottle state, not the spawn shape, so none needed a change. The record's `## Fix scope` said the TS test is touched only if the spawn changes.
- 87-72 committed no expected-to-fail invariant (all six Rust and twelve TS cases were green at HEAD), so there was nothing to flip. The red-first test is new, as the plan allows.
- The kill guard uses `games_running_in` rather than the record's `other_games_running`; see key-decisions.

## Known Stubs

None.

## Threat Flags

None. The new spawn runs CrossOver's own `wineserver` through the existing `kill_bottle_wineserver`, which refuses an unsafe bottle name and aims `WINEPREFIX` at the bottle's own directory (T-87-150 holds: the game's bottle only, never another game's or the shared one). The offline gate, the decision and the refusal dialogs are unchanged and their suites pass (T-87-151).

## Open items

- Live proof: re-run 2 item 3, two plain CrossOver launches in a row of Trash Goblin and Caravan SandWitch both staying up, scored by 87-79. The sync-mode mismatch as the exact mechanism inside the warm server stays unobserved; it does not change the fix.
- The nile `--wine-prefix <shared prefix>` observation was never replayed and this fix does not touch it. If Caravan SandWitch still exits after the fix, that is the second contribution the record kept open.
- Not modified, per the dispatch: `.planning/STATE.md`, `.planning/state.json`, `.planning/ROADMAP.md`.

## Self-Check: PASSED

- `src-tauri/crates/gamelib-engine/src/launch/step.rs`, `src-tauri/crates/gamelib-engine/tests/crossover_launch_shape.rs` and the debug record exist and are committed.
- Commits `7aeac966b`, `3dc67f794` and `787e1156e` are ancestors of HEAD.
