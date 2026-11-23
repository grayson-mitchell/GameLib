---
phase: 87-engine-wine-and-tools
plan: 04
subsystem: infra
tags: [rust, gamelib-proc, gamelib-core, spawn, process-tree, orphan-harness, tokio]

requires:
  - phase: 83-process-lifetime
    provides: spawn_helper_tokio, HelperGuard, ChildSet, the reaper, the orphan harness and its stand-in
  - phase: 87-engine-wine-and-tools
    provides: the gamelib-engine and gamelib-wine crates (87-02)
provides:
  - gamelib_core::process::{ProcSpec, SpecOutput, SpecRunner, LineSink, DEFAULT_MAX_BUFFER}
  - gamelib_proc::SpecProcRunner (gamelib_proc::spec), the only SpecRunner implementation
  - tests/spec_runner.rs, twelve real-child tests, and two shutdown-token unit tests in spec.rs
  - stand-in mode `spec-tree` with a parent `--spec-tree` flag, and the orphan arms sigkill_kills_spec_child_and_grandchild and graceful_quit_kills_spec_child_and_grandchild
affects: [87-06, engine ports, wine ports, winetricks, tools]

actuals:
  tokens: 9244
  tasks: 2
  commits: 2

plan_head_before: 497fd83ed73bbce35a9ee72754d551eeb5f6667f
plan_head_after: df363d4508cf1ad7d5afb0124ac075de93556839

tech-stack:
  added: []
  patterns:
    - "one spawn seam per domain slice: a trait in gamelib-core, one implementation in gamelib-proc, the domain crates never import a Command"
    - "a run future that owns its child and HelperGuard, writes output into caller-owned captures so a timeout or cancel keeps what was read, and holds a Shutdown registrant only while the child is in flight"
    - "a bounded post-exit drain, so a descendant that inherited the output pipe cannot stall a finished run"

key-files:
  created:
    - src-tauri/crates/gamelib-proc/src/spec.rs
    - src-tauri/crates/gamelib-proc/tests/spec_runner.rs
  modified:
    - src-tauri/crates/gamelib-core/src/process.rs
    - src-tauri/crates/gamelib-proc/src/lib.rs
    - src-tauri/crates/gamelib-proc/src/bin/standin.rs
    - src-tauri/crates/gamelib-proc/tests/orphans.rs

key-decisions:
  - "SpecRunner::run takes Option<LineSink> where LineSink is the type alias Box<dyn FnMut(&str) + Send>: the same type as the plan's signature, aliased because clippy::type_complexity denies the spelled-out form"
  - "A spec run asked for after the shutdown token fired, or with a token already cancelled, is not spawned and returns cancelled: nothing would reap it in time"
  - "A timeout, cancel or shutdown kills the process group through the sanctioned kill_tree::kill_process_group (unix, only while the leader is unreaped so the pgid cannot be recycled) plus tokio's own kill, and on Windows through the Job closing when the HelperGuard drops; the leader is then reaped within 2 s before the run returns"
  - "The capture cap is per stream (stdout and stderr each), counted in raw bytes before lossy decoding; bytes past it are read and dropped so the child never blocks on a full pipe"
  - "A spawn failure is SpecOutput { code: None, stderr: 'spawn <program>: <io error>' } with no flag set, so callers can tell it from a timeout or cancel"

patterns-established:
  - "Orphan-arm precedent for a new spawn shape: a stand-in mode, a parent flag that adds the child to helpers and its descendant to grandchildren, so the shared assertion covers it; mutation-checked by running the arm with --no-reaper and seeing it fail"

requirements-completed: [SVC-02]

duration: 25 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "ProcSpec, SpecOutput and SpecRunner in gamelib-core beside the untouched ProcessRunner; the workspace still builds"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cd src-tauri && cargo test -p gamelib-core && cargo build --workspace"
        status: pass
    human_judgment: false
  - id: D2
    description: "SpecProcRunner: env, replace_env, cwd, stdin text, timeout, cancel, 1 MiB cap on 2 MiB of output, per-line callback, all through spawn_helper_tokio"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-proc/tests/spec_runner.rs"
        status: pass
    human_judgment: false
  - id: D3
    description: "A timeout, a cancel and the shutdown token kill the child and, on unix, its grandchild, and leave nothing registered"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "tests/spec_runner.rs#a_timeout_kills_the_grandchild_too, #a_cancel_kills_the_child_and_says_so; src/spec.rs#the_shutdown_token_ends_a_running_child"
        status: pass
    human_judgment: false
  - id: D4
    description: "A winetricks-shaped child-and-grandchild tree run through SpecProcRunner dies on SIGKILL of the parent and on a graceful quit, and the game tree survives"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-proc/tests/orphans.rs#sigkill_kills_spec_child_and_grandchild, #graceful_quit_kills_spec_child_and_grandchild"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Windows variants of the spec_runner tests and the Windows leg of the two orphan arms"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "Written for cmd, findstr, ping and powershell and for the kill-on-close Job but only compiled and run on macOS here; the three-OS cargo test -p gamelib-proc CI step is what runs them"
---

# Phase 87 Plan 04: The SpecRunner spawn seam Summary

**One reaped-helper spawn seam for every engine and wine port: `ProcSpec`/`SpecOutput`/`SpecRunner` in gamelib-core, implemented only by `SpecProcRunner` over `spawn_helper_tokio`, with timeout, cancel and shutdown kills that reach the process group and an orphan arm proving a winetricks-shaped tree dies with GameLib.**

## Performance

- **Duration:** about 25 min (estimated; the start time was not recorded)
- **Completed:** 2026-11-23
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified), 817 insertions

## Accomplishments

- `ProcSpec` carries program, argv, env, `replace_env`, cwd, stdin text, timeout, `max_buffer`, a `CancellationToken` and a `&'static str` label; `SpecOutput` returns `code`, both streams, `timed_out`, `cancelled` and `truncated`. `ProcessRunner` and its implementers are untouched, and `cargo build --workspace` is clean.
- `SpecProcRunner` builds a tokio `Command`, spawns through `spawn_helper_tokio` and keeps the `HelperGuard` in the run future. It selects over the child, `spec.timeout`, `spec.cancel` and `gamelib_core::shutdown::global().token()`, and holds a `Shutdown` registrant only while the child is in flight.
- Output is bounded in memory: each stream is captured to `max_buffer` bytes and the rest is read and dropped, and a stdout line longer than 64 KiB is handed to `on_line` in pieces. `on_line` sees every line regardless of the cap.
- A timeout, cancel or shutdown returns the partial output with the flag set and `code: None`. On unix it also SIGKILLs the process group through `kill_tree::kill_process_group`, so a hung winetricks does not leave its wine processes behind; `a_timeout_kills_the_grandchild_too` proves it.
- After the child exits the readers get 2 s to drain, then the run returns, so a daemonised descendant holding the pipe (a wineserver) cannot stall it; `a_daemonised_descendant_holding_the_pipe_does_not_stall_the_run` proves it.
- Orphan harness: stand-in mode `spec-tree` (spawns a grandchild after `go`, prints both pids) and parent flag `--spec-tree` running it through `SpecProcRunner` on a background runtime thread. `sigkill_kills_spec_child_and_grandchild` and `graceful_quit_kills_spec_child_and_grandchild` pass beside the seven existing arms, which are unchanged. Run with `--no-reaper` added, the SIGKILL arm fails with a timeout, so it is not vacuous.

## Task Commits

1. **Task 1 (tracer): the SpecRunner seam, SpecProcRunner and spec_runner.rs** - `f3a327c9c` (feat)
2. **Task 2: the spec-tree stand-in mode and the two orphan arms** - `df363d450` (test)

The tracer gate ran: the Task 1 verify (core and proc tests, clippy `-D warnings`, `cargo fmt --check`) passed before Task 2 started, and the whole gamelib-proc suite re-ran green after it. ⚡ Tracer verified end-to-end, expanded.

## Files Created/Modified

- `src-tauri/crates/gamelib-core/src/process.rs` - `ProcSpec`, `SpecOutput`, `SpecRunner`, `LineSink`, `DEFAULT_MAX_BUFFER`
- `src-tauri/crates/gamelib-proc/src/spec.rs` - `SpecProcRunner`, the run future, bounded capture and line splitting, `stop`, two shutdown-token unit tests
- `src-tauri/crates/gamelib-proc/src/lib.rs` - `pub mod spec`, `SpecProcRunner` re-export
- `src-tauri/crates/gamelib-proc/tests/spec_runner.rs` - twelve real-child tests
- `src-tauri/crates/gamelib-proc/src/bin/standin.rs` - `spec-tree` mode, `--spec-tree` flag
- `src-tauri/crates/gamelib-proc/tests/orphans.rs` - the two spec-tree arms

## Decisions Made

See `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `LineSink` type alias for the line callback**
- **Found during:** Task 1 (clippy)
- **Issue:** `Option<Box<dyn FnMut(&str) + Send>>` in the trait signature trips `clippy::type_complexity`, which the verify runs with `-D warnings`.
- **Fix:** `pub type LineSink = Box<dyn FnMut(&str) + Send>;` and `on_line: Option<LineSink>`. Callers still pass a `Box<dyn FnMut(&str) + Send>`; the type is identical.
- **Files modified:** `gamelib-core/src/process.rs`, `gamelib-proc/src/spec.rs`
- **Commit:** f3a327c9c

**2. [Rule 2 - Missing critical] Process-group kill, post-exit drain and no spawn after shutdown**
- **Found during:** Task 1
- **Issue:** The plan says a timeout or cancel is `kill_on_drop` and the ChildSet. `kill_on_drop` kills the leader only, so a timed-out winetricks would leave its wine processes running until app exit, and a reader loop that waits for pipe EOF is held open by any descendant that inherited the pipe. A run started after the exit began would not be reaped in time.
- **Fix:** On timeout, cancel or shutdown, unix calls the sanctioned `kill_tree::kill_process_group` (not a hand-rolled kill) while the leader is unreaped, then tokio's `start_kill` and a bounded reap; Windows relies on the Job closing with the guard. Readers get 2 s after the child exits. A run with an already-cancelled shutdown or spec token is not spawned. Each has a test.
- **Files modified:** `gamelib-proc/src/spec.rs`, `gamelib-proc/tests/spec_runner.rs`
- **Commit:** f3a327c9c

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical). **Impact:** none on the planned interface; both strengthen T-87-07 and T-87-08.

## Authentication Gates

None.

## Issues Encountered

None.

## Verification

- `cargo test -p gamelib-core`: 26 pass. `cargo build --workspace` clean.
- `cargo test -p gamelib-proc --test spec_runner`: 12 pass. `cargo test -p gamelib-proc --features harness`: lib 23, orphans 9, runner 1, spec_runner 12, all pass.
- `cargo clippy -p gamelib-core -p gamelib-proc --all-targets [--features harness] -- -D warnings` and `cargo fmt -p gamelib-core -p gamelib-proc --check`: clean. No prettier check: every path written is Rust, which prettier does not own.
- Acceptance: `pub trait SpecRunner` count is 1; `spawn_helper_tokio` in spec.rs count is 3; `process::Command` in gamelib-engine and gamelib-wine src outside testing.rs is 0; both new orphan arm functions exist and pass.
- Mutation check: the SIGKILL spec arm with `--no-reaper` added fails (timed out waiting for the child and grandchild to die), then the test file was restored.

## Known Stubs

None.

## Threat Flags

None. The new surface is the spawn seam itself, covered by T-87-07 (helper trees die with GameLib, proven by the orphan arms) and T-87-08 (output capped at `max_buffer`, streamed per line).

## Next Phase Readiness

87-06 can build the Fetch seam and the full `EngineCtx`/`WineCtx` on `SpecRunner`. The shutdown-token branch is tested with a local token, not the global one, because cancelling the process-wide token would end every other test in the binary. The Windows variants of the new tests and arms are unrun here (D5); the three-OS `cargo test -p gamelib-proc` CI step is the first to run them.

## Self-Check: PASSED
