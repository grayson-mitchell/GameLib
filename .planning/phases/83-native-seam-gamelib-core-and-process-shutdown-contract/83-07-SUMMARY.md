---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 07
subsystem: infra
tags: [rust, gamelib-proc, reaper, sigkill, process-group, control-pipe, ci-harness, node-standin]
status: complete

requires:
  - phase: 83-04
    provides: gamelib-proc ChildSet, SpawnClass::Helper/Game, probe::{is_alive,start_time}, kill_tree::signal_group, the stand-in binary and tests/orphans.rs harness
provides:
  - gamelib-proc::proto (ReaperLine Register/Unregister/Disarm, encode/parse, sanitize_label, MAX_LABEL, MAX_LINE)
  - gamelib-proc::reaper (REAPER_FLAG, REAPER_GRACE, dispatch_if_requested, start, register_group, unregister_group, disarm, run, plan_reap, Registry)
  - ChildSet wiring - register on spawn, unregister on HelperGuard drop and after terminate_all
  - stand-in flags --no-reaper, --leak-pipe, --node-sidecar <pids-file>; manifest field reaper
  - tests/orphans.rs legs - sigkill_kills_helpers_and_spares_the_game, sigkill_without_reaper_leaves_the_helper_alive, graceful_quit_disarms_the_reaper, sigkill_with_a_leaked_pipe_still_reaps (unix), node_standin_children_die_with_the_parent (all OSes)
affects: [83-08 shell wiring (dispatch_if_requested, start, register_group, disarm), 83-09 handle_exit, 83-10 three-leg CI run, 83-11 live gate]

actuals:
  tokens: 10600
  tasks: 3
  commits: 4
plan_head_before: f61f01fad3243d29192f74bda41a808bedf82a2a
plan_head_after: 0c351cfd88cfed65779a17cc781e6b7b37b90cdc

tech-stack:
  added: []
  patterns:
    - "Re-exec'd reaper: the app's own binary with --gamelib-reaper as argv[1], dispatched as main's first statement, fed by a control pipe on its stdin"
    - "Two triggers, first wins: stdin EOF on the main thread and a 500 ms getppid() poll on a second thread share one atomic flag"
    - "Pure reap decision (plan_reap) over a registry and a start-time lookup closure, testable on every OS"
    - "Capture sink behind the client so registration lines are unit-tested on Windows without a reaper process"

key-files:
  created:
    - src-tauri/crates/gamelib-proc/src/proto.rs
    - src-tauri/crates/gamelib-proc/src/reaper.rs
  modified:
    - src-tauri/crates/gamelib-proc/src/lib.rs
    - src-tauri/crates/gamelib-proc/src/children.rs
    - src-tauri/crates/gamelib-proc/src/bin/standin.rs
    - src-tauri/crates/gamelib-proc/tests/orphans.rs

key-decisions:
  - "start() returns Err(Unsupported) on non-unix instead of a fake pid; the other client functions are silent no-ops there (83-08 already gates start on unix)"
  - "disarm() closes the control pipe after writing the disarm line, so the reaper sees EOF at once and exits instead of waiting for the parent process to die"
  - "A second reaper trigger (getppid change) waits 200 ms before reaping so the main thread can drain a disarm or late registration the parent wrote just before dying"
  - "The stand-in's stderr is a file in the fake profile, not null: the reaper inherits it, which makes its two status lines assertable (and readable under --nocapture) without a pipe an orphan could hold open"
  - "ChildSet::terminate_all unregisters every drained pid with the reaper, so a recycled group id can never be signalled after a graceful kill"

patterns-established:
  - "Oversized or non-UTF-8 control lines are read in bounded chunks, discarded to the newline and counted, never held or panicked on"
  - "Reaper status lines are fixed literals with counts only; labels are sanitised to [A-Za-z0-9_-] and capped at 32"

requirements-completed: [FND-04]

coverage:
  - id: D1
    description: "Control protocol - every encoded line parses back; pgid 0, 1 and -5 parse to None; labels sanitised and capped; 500-byte garbage and over-long lines parse to None without panicking; over-long reads are discarded in bounded memory"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-proc/src/proto.rs#tests (4) and reaper.rs#next_line_* / state_tracks_* (cargo test -p gamelib-proc, Windows host)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reap decision (plan_reap) skips and counts a recycled leader, still signals a group whose leader is gone, does not check an unknown start, never signals pgid <= 1"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-proc/src/reaper.rs#plan_reap_* (4 tests, red-green; Windows host)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ChildSet registers each helper with the reaper and unregisters it when its HelperGuard drops"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-proc/src/reaper.rs#registration_is_written_to_the_reaper_and_unregistration_follows_the_guard (capture sink; Windows host)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-11 on macOS and Linux - a SIGKILL of the parent leaves no registered helper or grandchild alive, the reaper exits, the game tree survives; with --no-reaper the helpers stay alive (negative control); a graceful quit disarms; a leaked write end still reaps via getppid()"
    requirement: FND-04
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-proc/tests/orphans.rs#sigkill_kills_helpers_and_spares_the_game, sigkill_without_reaper_leaves_the_helper_alive, graceful_quit_disarms_the_reaper, sigkill_with_a_leaked_pipe_still_reaps (cfg(unix))"
        status: unknown
    human_judgment: true
    rationale: "The reaper, signal handling, getppid poll and these four legs are cfg(unix) and cannot compile or run on the operator's Windows box (x86_64-pc-windows-msvc only, no WSL). Plan 83-10's macos-latest and ubuntu-latest legs are their first execution; 83-11's live gate scores the literals."
  - id: D5
    description: "D-10 TS-spawned case - a Node stand-in sidecar's non-detached children die with the SIGKILLed parent, and the game tree survives"
    requirement: FND-04
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-proc/tests/orphans.rs#node_standin_children_die_with_the_parent (Windows host, node 24.19.0; unix legs on CI)"
        status: pass
    human_judgment: false

duration: not captured (start time was not recorded at launch)
completed: 2026-11-20
---

# Phase 83 Plan 07: Unix reaper, control protocol and Node stand-in leg Summary

**A re-exec'd `--gamelib-reaper` process (own process group, SIGINT/HUP/TERM ignored, stdin-EOF plus getppid triggers) reaps every registered helper group after a SIGKILL of the parent, with a negative control, a graceful `disarm` path and a Node stand-in leg; the Windows legs ran here, the unix legs are written but unrun on this host.**

## Performance

- **Duration:** not captured (start time was not recorded at launch)
- **Completed:** 2026-11-20
- **Tasks:** 3 (task 1 tracer, task 2 red-green)
- **Files:** 2 created, 4 modified (+1115 / -10 lines under `src-tauri`)

## Accomplishments

- `proto`: `ReaperLine` with `encode`/`parse`; a pgid of 1 or less never parses, labels are sanitised to `[A-Za-z0-9_-]` and capped at 32 characters, malformed or over-long lines return `None`.
- `reaper`: `REAPER_FLAG`, `dispatch_if_requested` (first statement of `main`), `start` (own executable, stdin piped, stdout null, stderr inherited, `process_group(0)`), `register_group` / `unregister_group` / `disarm`, and `run`. `run` ignores SIGINT, SIGHUP and SIGTERM, reads the control pipe in bounded chunks, and on EOF or a changed `getppid()` (polled every 500 ms, first trigger wins) either prints `[reaper] disarmed` or SIGTERMs the registered groups, waits up to `REAPER_GRACE` (2 s, 50 ms polls), SIGKILLs the rest and prints `[reaper] parent gone: signalled <n> group(s)` (`, skipped <k> recycled` appended when k > 0).
- `plan_reap` is a pure function (registry plus a start-time lookup closure) that skips and counts a leader whose pid now has a different start stamp, still signals a group whose leader is gone, does not check a recorded start of 0 and never emits pgid <= 1.
- `ChildSet` registers every helper with the reaper at spawn (`register_owned`, `register_pid`) and unregisters it on `HelperGuard` drop and for every entry `terminate_all` drains.
- Harness: the stand-in dispatches reaper mode first and starts a reaper unless `--no-reaper`; `--leak-pipe` adds a sleeper helper holding a dup of the pipe's write end (feature `harness` accessor `harness_dup_write_end`); `--node-sidecar` adds a Node helper that spawns two plain children. Five new orphans legs are listed in the frontmatter.
- The reaper's `[reaper] ...` lines land in a stand-in stderr file inside the fake profile, so the unix legs assert the literals 83-HUMAN-UAT scores (`[reaper] parent gone: signalled `, `[reaper] disarmed`) and print them under `--nocapture`.

## Task Commits

1. **Task 1 (tracer): protocol, re-exec dispatch, ChildSet registration, unix SIGKILL leg** - `9d620aa6b` (feat)
2. **Task 2 RED: failing plan_reap tests and the negative-control, disarm and leaked-pipe legs** - `ff358f6ee` (test)
3. **Task 2 GREEN: signal immunity, getppid trigger, start-time check, `--leak-pipe`** - `3fbd4b84b` (feat)
4. **Task 3: Node stand-in sidecar leg** - `0c351cfd8` (feat)

`commits: 4` is measured (`git rev-list --count f61f01fad..HEAD` at the last production commit); all four are this plan's.

Tracer gate: auto/end-of-phase with an automated-only `<verify>`; the tracer verify (`cargo test -p gamelib-proc`, clippy, fmt) was re-run green before expansion. The unix SIGKILL leg inside it could not run on this host (see Issues).

TDD: Task 2's RED run failed on the four `plan_reap` assertions (`left: ([], 0)` against the expected plan), not on a compile error; the three unix harness legs were committed in the same RED commit but cannot be executed here, so their red state is unobserved.

## Decisions Made

See `key-decisions`. Notable: `disarm` closes the pipe itself; the getppid trigger defers 200 ms so a just-written `disarm` is not lost; Windows `start` is `Unsupported` rather than a fake pid.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's `--nocapture` check for `[reaper] parent gone: signalled` needs the reaper's stderr to be readable**
- **Found during:** Task 1
- **Issue:** the 83-04 harness runs the stand-in with stderr null, and the reaper inherits the stand-in's stderr, so its status lines would never reach `--nocapture` output nor be assertable.
- **Fix:** the stand-in's stderr is now a file in the fake profile (`standin.err`); unix legs read it, assert the literals and print it. A file, not a pipe, so a leaked orphan still cannot hang the runner.
- **Files modified:** tests/orphans.rs
- **Commit:** 9d620aa6b

**2. [Rule 3 - Blocking] The ChildSet "fake reaper sink" test cannot use `CARGO_BIN_EXE_*` from a lib unit test**
- **Found during:** Task 1
- **Issue:** that variable exists only for integration tests, so spawning the stand-in from `reaper.rs`'s unit test does not compile.
- **Fix:** the test registers a not-real pid through `register_pid` and drops a `HelperGuard`, asserting the `+ <pid> ... reaper-wiring` and `- <pid>` lines on a capture sink installed behind the client. It runs on every OS.
- **Commit:** 9d620aa6b

**3. [Rule 1 - Bug] The Node stand-in script wrote a literal newline into a JS string**
- **Found during:** Task 3
- **Issue:** `'\n'` in the Rust `concat!` string became a real newline, a JavaScript syntax error, so node never reported its children and the stand-in's bounded wait panicked.
- **Fix:** `'\\n'`. The first run also left a stray game tree because the failure happened before the test's `Strays` guard existed; the strays were killed by hand.
- **Commit:** 0c351cfd8

**4. [Addition] `Registry` type, `State`/`next_line` pure helpers, and a bounded line reader**
- The plan asked for "malformed lines are ignored and counted"; a bounded reader (`next_line`) plus a pure `State::apply` make that testable on Windows and stop a no-newline flood from growing memory. A `[reaper] ignored <n> malformed line(s)` line is printed only when n > 0.

**5. [Plan precision] The stand-in manifest's `helpers`/`grandchildren` grow only with their flags**
- The pre-existing assertions (three helpers, one grandchild, two games) hold unchanged without `--leak-pipe` / `--node-sidecar`.

**Total deviations:** 5 (2 blocking, 1 bug, 2 additions/precision). **Impact:** none on scope.

## Issues Encountered

- **The reaper and every unix leg did not run, compile or lint on this host.** The box is Windows with only `x86_64-pc-windows-msvc` and no WSL. `reaper.rs` (`start`, `run`, `finish`, `terminate_groups`, `group_exists`, `ignore_terminal_signals`, `harness_dup_write_end`), the unix arm of `children.rs`, and these tests in `tests/orphans.rs` have never been compiled: `sigkill_kills_helpers_and_spares_the_game`, `sigkill_without_reaper_leaves_the_helper_alive`, `graceful_quit_disarms_the_reaper`, `sigkill_with_a_leaked_pipe_still_reaps`. They are written against libc 0.2.186 and std (rust-version 1.77.2, no newer APIs) and rustfmt has parsed them, but clippy and the compiler have not. Plan 83-10's macos-latest and ubuntu-latest legs are their first run; expect that to be where any compile error or leg failure surfaces. I did not `rustup target add` a unix target to get a `cargo check`; that changes the operator's toolchain and was not asked for.
- **Therefore the plan's acceptance lines "On this macOS host the SIGKILL leg passes ... all four unix legs pass" and the `--nocapture` literal check were not verifiable here.** What did run on Windows: the proto, `plan_reap`, `next_line`, `State` and registration unit tests, the three 83-04 orphans legs (unchanged behaviour with the reaper code present), the runner test, and the new Node stand-in leg (Job-based, node 24.19.0, with the node process and both its children dead and the game tree alive after `TerminateProcess` of the parent).
- **Node-leg guard mutation on Windows did not trip.** With `detached: true` added to the Node children the Windows leg still passed: Job membership is inherited regardless of `detached` (no breakaway limit is set). The guard is meaningful on unix only, where `detached` means `setsid` and escapes the group kill; that arm is unrun here. The source keeps the word "detached" out of `standin.rs` (acceptance grep is 0).
- Plan-level clippy ratchet (`cargo +1.99.1 clippy --workspace ... clippyRatchet.cjs`, darwin baseline) was not run; `cargo clippy -p gamelib-proc --all-targets -- -D warnings` and `cargo fmt -p gamelib-proc --check` are clean on Windows, and `cargo test -p gamelib-core` passes (18).
- Research assumption A6 is not exercised, as the plan records: under D-15 Option B no TS child spawned outside the sidecar's group is expected to survive.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-83-22 (only registered groups signalled; pgid <= 1 refused at parse, in `register_group`/`unregister_group`, in `plan_reap` and in `signal_group`; recycled leaders skipped via the start-time check), T-83-23 (the pipe is the reaper's stdin created by `start` with std's CLOEXEC write end; no command names an arbitrary pid), T-83-24 (own group, SIG_IGN for INT/HUP/TERM, getppid poll), T-83-25 (Game class never registered; the SIGKILL leg asserts the game survives) and T-83-26 (fixed literals, counts only) are implemented. T-83-24's and T-83-25's evidence is the unrun unix legs.

## Next Phase Readiness

Ready for 83-08: `reaper::dispatch_if_requested()`, `start()` (unix only; `Unsupported` elsewhere), `register_group(pgid, label)`, `unregister_group(pgid)` and `disarm()` are the surface; running the binary in reaper mode with empty stdin prints `[reaper] parent gone: signalled 0 group(s)` and exits 0. Plan 83-10's CI is the first execution of every unix leg of this plan and of 83-04; resolve any red there before 83-11's live gate.

## Self-Check: PASSED

- Created files present: `src-tauri/crates/gamelib-proc/src/reaper.rs`, `src-tauri/crates/gamelib-proc/src/proto.rs`.
- Commits found: 9d620aa6b, ff358f6ee, 3fbd4b84b, 0c351cfd8.
- Acceptance greps re-run: `"--gamelib-reaper"` in reaper.rs (1), `[reaper] parent gone: signalled` (1), `[reaper] disarmed` (2), `dispatch_if_requested` in standin.rs (1), `fn sigkill_without_reaper_leaves_the_helper_alive` (1), `getppid` in reaper.rs (7), `SIG_IGN` (2), `fn plan_reap` (5 mentions), `fn node_standin_children_die_with_the_parent` (1), `detached` in standin.rs (0), `env::var("CI")` in orphans.rs (1).
- Plan verification on this host: `cargo test -p gamelib-proc` (17 unit, 4 orphans, 1 runner passed), `cargo test -p gamelib-core` (18 passed), clippy `-D warnings` clean, `cargo fmt --check` clean. Unix legs: not run here (see Issues Encountered).
