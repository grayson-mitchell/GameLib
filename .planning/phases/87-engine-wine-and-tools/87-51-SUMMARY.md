---
phase: 87-engine-wine-and-tools
plan: 51
subsystem: engine
tags: [rust, launch-deadline, process-watch, shutdown-contract, golden, paused-clock, fnd-06]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the 77 launch goldens (87-15), launch::process_listing (87-44), the launch step, LaunchState, the registry, overlay contexts and engine state (87-47 to 87-50)
provides:
  - gamelib_engine::launch::{deadline, watch} and step::{arm_engine_launch_deadline, end_engine_launch}
  - ops engine_launch_arm_deadline, engine_launch_end, engine_deadline_arm, engine_deadline_cancel, engine_launch_settings_get
  - send channel engineDeadlineFired {key, reason}
  - EngineCtx::share and EngineCtx::weak (the weak handle a long-lived task of the launch reaches the context through)
affects: [87-52, 87-55, 87-56]

actuals:
  tokens: 22000
  tasks: 2
  commits: 2

plan_head_before: d19f5a660d8c745b440e5e85c67a6f38f3b7f606
plan_head_after: 1fd9fed740e245767f2c366573dba7ab7fd1c939

tech-stack:
  added: []
  patterns:
    - "a launch's long-lived task (deadline, process watch) is one tokio task holding a named shutdown registrant, ending with the shutdown token and reaching the context through a weak handle at the moment it fires, so it never keeps the context alive while it sleeps"
    - "an armed entry is claimed by whoever removes it (the firing task, the cancelling caller) by generation, so a cancelled or superseded task can never act for the arming that replaced it"
    - "time-driven goldens run on a paused tokio clock moved 100 ms at a time with the wall-clock fake moved the same; the oracle's own timer trace is not compared, what the launch sees is"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/launch/deadline.rs
    - src-tauri/crates/gamelib-engine/src/launch/watch.rs
    - src-tauri/crates/gamelib-engine/tests/process_match.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/launch/step.rs
    - src-tauri/crates/gamelib-engine/src/launch/mod.rs
    - src-tauri/crates/gamelib-engine/src/launch/process_listing.rs
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/tests/golden_launch.rs
    - src-tauri/crates/gamelib-engine/Cargo.toml
    - src-tauri/src/engine_dispatch.rs

key-decisions:
  - "A task that fires after the op that armed it returned reaches the context through a weak handle: EngineCtx::share() puts the context behind its Arc and records the handle, the shell calls it where it builds the Arc, and the ops that start a task answer <op>:not-shared for a context nobody shared. The alternative (ops taking &Arc<EngineCtx>) would have changed dispatch and its ~40 test call sites for two ops."
  - "The bridge deadline's frame is engineDeadlineFired {key, reason} with reason \"no-game-process\"; the plan named the shape, not the reason. A bridge deadline has no process watch (the bridge's own monitor cancels it through engine_deadline_cancel)."
  - "end_engine_launch clears the registry quietly, as engine_selection_clear does: the reply of a sidecar-started op is the sidecar view's own update, so no engineSelectionChanged frame."
  - "A quit ends a deadline's task and its entry (the TS left the entry and three timers pending); no notice and no frame fires while the app quits, and the registrants are released before the exit budget is spent."
  - "The oracle's timer trace (timer-set, timer-fire, timer-clear, timer-unref, the listing poll count) is its fake clock's and is not compared; the notification, the watch request, the log, the engineStateChanged pushes, the registry, overlay, ledger and the armed-deadline count are."

patterns-established:
  - "the deadline and the watch are separate tasks joined by an on_end callback, so the watch's incident tests need no deadline"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "D-01, D-17: a launch deadline that passes with no game process seen shows the no-kill notice (one notification, zero window raises, no dialog), pushes the in-app notice, stops the watch and leaves the registry, overlay and ledger entries; it is cancelled by the first match, by the end of the launch, by a lost watch and by a newer arm; 24 of the 77 87-15 launch goldens (the deadline cases) replay with the same notifications, log, engineStateChanged pushes, registry, overlay, ledger and armed-deadline count"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-engine/tests/golden_launch.rs#every_deadline_golden_replays (24 cases, floor 24)"
        status: pass
      - kind: integration
        ref: "golden_launch.rs#a_deadline_that_fires_notifies_once_and_never_raises_the_window"
        status: pass
      - kind: unit
        ref: "launch/deadline.rs tests (a_deadline_that_reaches_its_time_notifies_once_and_never_raises_the_window, a_cancel_ends_the_task_and_names_its_reason_and_a_second_arm_supersedes_the_first)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-17: a deadline and a watch hold an engine-deadline / engine-watch registrant while armed, end with the shutdown token with no notice and no frame, and release the registrant; a bridge deadline emits engineDeadlineFired {key, reason} through EngineUi::send_to_sidecar instead of a notice"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "launch/deadline.rs#a_quit_ends_an_armed_deadline_with_no_notice_and_releases_its_registrant, #a_bridge_deadline_sends_the_sidecar_its_frame_instead_of_a_notice"
        status: pass
      - kind: integration
        ref: "tests/process_match.rs#a_path_with_no_usable_form_a_context_never_shared_and_a_quit_start_nothing_or_end_quietly"
        status: pass
      - kind: unit
        ref: "lib.rs#the_deadline_ops_arm_a_bridge_deadline_cancel_it_by_a_closed_reason_and_need_a_shared_context"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-08: process_match.json replays (76 vectors: the prefix forms, the unix-path form, the ps parse, 32 match vectors incl. unix path, Z: and Y:, C:, case-insensitive, trailing separator, basename-only unmatchable, and the ps/pgrep listing); the gameProcessWatch behavioural tests run over the real watch task: a match on the third poll ends the watch once, a stop, the 20-failure and cap give-ups, a replaced watch, no usable form"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-engine/tests/process_match.rs (13 tests; vector floor 70, 76 present)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The ops the launcher will call (engine_launch_arm_deadline, engine_launch_end, engine_deadline_arm, engine_deadline_cancel, engine_launch_settings_get) take strict objects, refuse a bad key, an unknown reason and a context nobody shared"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "lib.rs#the_launch_deadline_op_arms_only_a_bottle_backed_launch_and_the_end_op_releases_it, #the_launch_settings_op_returns_the_stored_settings_and_refuses_a_non_object"
        status: pass
    human_judgment: false
  - id: D5
    description: "The window-raise rule and the notice on a real machine (a fired deadline posts one system notification and a toast and does not bring the window forward), the bridge launch's sidecar handler for engineDeadlineFired and the engine log lines a user would need reaching a log are not exercised"
    verification: []
    human_judgment: true
    rationale: "The tests use recording sinks and no AppHandle. The TS launcher still arms its own deadline and the sidecar has no engineDeadlineFired handler or rpc arms for the ops yet (87-52 and 87-55 own them), and ctx.log is None in the app. The live gate after the switch-over is live-gate item 1."

duration: 17 min (host clock 16:34 to 16:51 UTC, 2026-11-23)
completed: 2026-11-24
---

# Phase 87 Plan 51: The launch deadline, the process watch and the end of a launch in Rust Summary

**The 180 s launch deadline, the process watch that ends it on a match and the end of a launch run in `gamelib-engine` as shutdown-registered tokio tasks: a non-Steam deadline shows its no-kill notice without raising the window, a bridge deadline sends the sidecar `engineDeadlineFired {key, reason}`, and all 24 deadline goldens plus the 76 process-match vectors replay.**

## Performance

- **Duration:** 17 min (host clock)
- **Started:** 2026-11-23T16:34Z
- **Completed:** 2026-11-23T16:51Z
- **Tasks:** 2 (tracer, then TDD)
- **Files modified:** 11 (3 created)

## Accomplishments

- **Task 1 (tracer):** `deadline::arm` spawns a task holding an `engine-deadline` registrant that races the 180 s timer, `cancel` and the shutdown token (quit first, so no notice fires while the app quits). On expiry a non-Steam launch (`DeadlineKind::Notice`) logs the TS lines, stops the watch, shows the notice through `show_engine_notice` (notify only, never a raise) and pushes the in-app deadline notice; a bridge launch (`DeadlineKind::Bridge`) sends `engineDeadlineFired {key, reason: "no-game-process"}` through `ui.send_to_sidecar`. `watch::start` is the process watch: a task holding an `engine-watch` registrant that polls `list_processes_via` every 1.5 s (through the one spawn seam), matches the unix, `Z:`, `Y:` and `C:` forms, and gives up at its cap or after 20 failed listings. `step::arm_engine_launch_deadline` binds them (a watch that cannot start stands the deadline down) and `step::end_engine_launch` releases the watch, overlay context, deadline, ledger entry and registry selection. Five ops. `EngineCtx::share` gives the tasks their weak handle and the shell shares its context. The 24 deadline goldens replay on a paused clock. The tracer `<verify>` is automated only, so it was re-run end to end before Task 2 (and a deliberately planted `raise_main_window` in the fire path turned the golden and the no-raise test red, then was removed); no checkpoint.
- **Task 2 (TDD):** `tests/process_match.rs` replays every vector of `process_match.json` over the Rust functions and ports the behavioural `gameProcessWatch` tests over the real task: a match on the third poll reports the pid once and ends the watch, a stopped watch never polls, the cap and the 20-failure give-ups (and a good listing resetting the count), a replaced watch, no usable form, an unshared context and a quit. Assertions that only inspected TS timers (`unref` call counts) were dropped; the quit test asserts the Rust equivalent (the registrant is released).

## Task Commits

1. **Task 1 (tracer): the launch deadline, process watch and end of a launch in Rust, 24 goldens replayed** - `282c31b57` (feat)
2. **Task 2: the 76 process-match vectors and the watch incident tests** - `1fd9fed74` (test)

## Files Created/Modified

- `src-tauri/crates/gamelib-engine/src/launch/deadline.rs` - the deadline task, cancel reasons, the notice and the bridge frame
- `src-tauri/crates/gamelib-engine/src/launch/watch.rs` - prefix forms, the match, the watch task
- `src-tauri/crates/gamelib-engine/src/launch/step.rs` - `arm_engine_launch_deadline`, `end_engine_launch`
- `src-tauri/crates/gamelib-engine/src/launch/mod.rs` - `LaunchState` holds the armed deadlines and watches
- `src-tauri/crates/gamelib-engine/src/ctx.rs` - `share` and `weak`
- `src-tauri/crates/gamelib-engine/src/lib.rs` - the five ops and their tests
- `src-tauri/crates/gamelib-engine/tests/golden_launch.rs` - the deadline cases (paused clock, scripted `ps`)
- `src-tauri/crates/gamelib-engine/tests/process_match.rs` - the vectors and the watch tests

## Differences from the goldens

Named in the header of `tests/golden_launch.rs`:

- The deadline cases run on a paused tokio clock moved 100 ms at a time, with the wall-clock fake moved the same, over a scripted `ps` through the one spawn seam. The TS fake clock's timer trace (`timer-set`, `timer-fire`, `timer-clear`, `timer-unref`, the `listing` poll count) is not compared; the notification, the `watch` request, the log, the `engineStateChanged` pushes, the registry, overlay, ledger and `activeDeadlines` are. A poll that lands on the same instant as the deadline (the 120th, at 180 s) may run in Rust where the TS cleared it first; nothing in the cases can match there.
- A quit with a deadline armed ends the task and the entry in Rust (the TS left the entry and three pending timers); the replay compares those cases up to the quit and unit tests assert the Rust side.
- The oracle's `ps failed` is the engine's `ps did not run` for a real failed spawn.
- `started` in the oracle's `watch` entry is the case's choice of a real watcher, not whether a form derived; the replay writes it the same way.

## Do the engine log lines reach a log? (carry-forward from 87-48, still open)

No. `ctx.log` is `None` in the app (the shell has no `EngineLog`), so this plan's lines reach no log there: `Engine: launch deadline for key <key> cancelled (<reason>)`, `Engine: launch deadline fired for key <key> after <n> ms (no game process seen)`, `Engine: <key> launch deadline fired (<engine label>) with no game process seen; not stopping anything`, `Engine: <key> no process monitor started; launch deadline stood down (monitor-unavailable)`, `Engine: <key> launch deadline notice surface=in-app pushed=<bool> raise=false`, the `[engine-notice] key=<key> tag=launch-deadline-unconfirmed dispatched=notify raise=false` line, and `gameProcessWatch: process listing failed (<n>/20): <error>`, `gameProcessWatch: game process seen (pid <pid>)` and `gameProcessWatch: gave up (<reason>) after <n> ms`. They are fixed text with the engine key, a count, a pid or the `ps` error text; the watch lines never carry another process's command line. Whether to wire an engine log into `gamelib.log` was not decided here.

## Decisions Made

See `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 carried the watch implementation, so Task 2 had no RED**
- **Found during:** Task 1
- **Issue:** the tracer's fired-deadline golden needs a real watcher (a launch with no watch is stood down at once), so `watch.rs` (prefix forms, match, the polling task) is in the Task 1 commit. Task 2's tests therefore passed the first time they ran; there is no failing RED commit. The `<behavior>` lines of Task 2 are covered by `process_match.rs` and the cancel-on-match goldens (`deadline-cancel-first-match-*`, which were green from Task 1).
- **Files modified:** `src/launch/watch.rs`
- **Commits:** `282c31b57`, `1fd9fed74`

**2. [Rule 3 - Blocking] The plan's "on ctx.clock so tests drive it" cannot hold: the `Clock` seam only reads the wall clock**
- **Found during:** Task 1
- **Issue:** `gamelib_core::clock::Clock` has `now_ms` only; the timers are `tokio::time`. The deadline and the watch sleep on tokio's clock, which a test pauses and moves (`start_paused`), and `ctx.clock` reads the elapsed time the log reports (`after 180000 ms`). The test crate's tokio dev-dependency gained `test-util`.
- **Files modified:** `Cargo.toml`
- **Commit:** `282c31b57`

**3. [Rule 3 - Blocking] Files outside the plan's list**
- `src/launch/process_listing.rs` (`list_processes_via`: the watch task holds the spawn seam, not the context), `Cargo.toml` (above) and `src-tauri/src/engine_dispatch.rs` (`ctx.share()` where the shell builds its `Arc<EngineCtx>`; without it the arming ops answer `not-shared` in the app).
- **Commit:** `282c31b57`

**Total deviations:** 3 (all Rule 3). **Impact:** none on the goals.

## Issues Encountered

- A first replay run fired the deadline 100 ms late because the spawned task starts its timer when it first runs, after the replay had already moved the clock; the replay now lets the tasks start (`settle`) right after the arm step. No production change.
- `Option::is_none_or` is past the crate's MSRV (1.77.2); the match uses `map_or`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-87-51 (denial of service): mitigated; the deadline and the watch hold a registrant only while armed, end with the shutdown token and on end/cancel, and the watch is bounded by its cap, by 20 consecutive failures and by a 10 s `ps` timeout, with the listing raced against the stop and the quit. The `engineDeadlineFired` frame goes Rust to sidecar through `EngineUi::send_to_sidecar`; the renderer has no way to send it. The new ops take strict objects (unknown fields, a bad key and an unknown cancel reason answer `bad-args`). T-87-SC accepted: no new crate (`tokio`'s `test-util` feature is a dev-dependency flag).

## What is not wired yet (owners)

- The TS launcher still arms its own deadline and watch (`launchEngine.ts`, `gameBridgeWineLaunch.ts`); the five ops have no shell rpc arms and the sidecar has no `engineDeadlineFired` handler (it must run `onBridgeLaunchDeadline`): 87-55 owns the arms and 87-52 the caller switch. Until then TS and Rust hold separate deadlines.
- `ctx.log` in the app (above).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

87-52 can call `arm_engine_launch_deadline` after the prerequisite installers and `end_engine_launch` when the launcher exits; a bridge launch arms with `engine_deadline_arm` and cancels with `engine_deadline_cancel`. The golden launch replay now covers all 77 cases.

## Self-Check: PASSED

- Commits `282c31b57` and `1fd9fed74` are ancestors of HEAD; `commits: 2` measured from the ledger base `d19f5a660`.
- `deadline.rs`, `watch.rs` and `process_match.rs` exist.
- `cargo test -p gamelib-engine --features testing` passes (183 lib tests; `golden_launch` 8 tests: 53 cases without a deadline against a floor of 53, 24 deadline cases against a floor of 24, the manifest 77 against a floor of 25; `process_match` 13 tests, 76 vectors against a floor of 70), `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-engine --check` pass, and `cargo test --bin gamelib-shell engine_dispatch` passes (30).

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
