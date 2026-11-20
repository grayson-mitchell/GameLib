---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 04
subsystem: infra
tags: [rust, gamelib-proc, process-lifetime, kill-tree, job-object, process-group, tauri-free, ci-harness]
status: complete

requires:
  - phase: 83-02
    provides: gamelib-core process::ProcessRunner / RunOutput / StreamingChild (ProcRunner implements it)
provides:
  - gamelib-proc crate (Tauri-free, rust-version 1.77.2), already declaring every dependency plans 83-07/83-08 need
  - SpawnClass::Helper (own process group on unix, own kill-on-close Job on Windows, registered in the ChildSet) and SpawnClass::Game (setsid, null/file stdio, never a Job, never registered)
  - kill_tree::{kill_process_group, terminate_group}, probe::{is_alive, start_time}, diag::set_diag_sink
  - children::{ChildSet, HelperGuard, global} with terminate_all(grace)
  - runner::ProcRunner (core's ProcessRunner over Helper tokio children)
  - stand-in binary gamelib-proc-standin (feature harness) and tests/orphans.rs process-lifetime harness
  - rust-test.yml early step `cargo test -p gamelib-proc`, pinned by rustTestWorkflow.test.ts
affects: [83-07 reaper, 83-08 shell wiring, 83-09 handle_exit, 83-10 three-leg CI run]

actuals:
  tokens: 15900
  tasks: 3
  commits: 3
plan_head_before: f56387047c285478940ac02ff48dbaa3f14b77b2
plan_head_after: 917f3e290

tech-stack:
  added: []
  patterns:
    - "Self dev-dependency with a feature (`harness`) to build a test-only stand-in binary, copied from steampoll's `testing`"
    - "Per-helper kill-on-close Job (Windows) as the analogue of one process group per helper (unix)"
    - "Drain the registry under the lock, then signal and wait without it"
    - "Liveness is 'exists and not a zombie', probed from outside the code under test"

key-files:
  created:
    - src-tauri/crates/gamelib-proc/Cargo.toml
    - src-tauri/crates/gamelib-proc/src/lib.rs
    - src-tauri/crates/gamelib-proc/src/diag.rs
    - src-tauri/crates/gamelib-proc/src/probe.rs
    - src-tauri/crates/gamelib-proc/src/kill_tree.rs
    - src-tauri/crates/gamelib-proc/src/spawn.rs
    - src-tauri/crates/gamelib-proc/src/children.rs
    - src-tauri/crates/gamelib-proc/src/job.rs
    - src-tauri/crates/gamelib-proc/src/runner.rs
    - src-tauri/crates/gamelib-proc/src/bin/standin.rs
    - src-tauri/crates/gamelib-proc/tests/orphans.rs
    - src-tauri/crates/gamelib-proc/tests/runner.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src/backend/__tests__/cargoFeatures.test.ts
    - .github/workflows/rust-test.yml
    - meta/__tests__/rustTestWorkflow.test.ts

key-decisions:
  - "One kill-on-close Job per Helper spawn rather than one process-wide Job, so reaping a dead sidecar's Job never kills unrelated helpers (plan's recorded discretion)"
  - "ChildSet::terminate_all takes the entries out under the lock and signals/waits without it, so a HelperGuard drop on a tokio worker is never stalled for the grace period"
  - "Unix hard-kill only for groups whose leader did not exit within grace (the shell's existing behaviour); a reaped leader's group is never signalled again, so a recycled pgid cannot be hit"
  - "Tokio-registered helpers (no owned Child) are signalled only after their recorded start stamp still matches; Windows has no graceful stage, so terminate_all returns no stragglers there"

patterns-established:
  - "A helper told to 'go' on stdin only after the parent has assigned it to its Job, so the known assign-after-spawn limit cannot race in the harness"
  - "Harness stand-in stderr is null, so an orphan left by a bug cannot hold the test runner's pipe and turn a red run into a hung one"

requirements-completed: [FND-04]

coverage:
  - id: D1
    description: "gamelib-proc exists, Tauri-free, implements core's ProcessRunner (ProcRunner), declares libc (unix) and windows-sys 0.61 with the four features, and is pinned in Cargo.lock / EXPECTED_LOCKFILE_CRATE_NAMES"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-proc (9 tests); src/backend/__tests__/cargoFeatures.test.ts (12 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Helper class: own group/Job and registered; Game class: own session, no Job, not registered, null/file stdio. Helpers and grandchildren die on graceful quit; the game tree keeps running and writing after the parent leaves"
    requirement: FND-04
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-proc/tests/orphans.rs#graceful_quit_kills_helpers_and_grandchildren_and_spares_the_game (Windows, local run)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Windows SIGKILL leg: TerminateProcess of the parent closes its Job handles; helpers and grandchildren die, the Game tree survives"
    requirement: FND-04
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-proc/tests/orphans.rs#sigkill_kills_helpers_and_grandchildren_and_spares_the_game (Windows, local run; negative control: with the Job assignment disabled the helpers survived and the test timed out)"
        status: pass
    human_judgment: false
  - id: D4
    description: "kill_process_group refuses pgid <= 1 and the three shell tests are carried; terminate_group implements shutdown_child's sequence; ChildSet::terminate_all on unix"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-proc/src/kill_tree.rs#tests (unix-only; compiled and run on CI, not on this Windows host)"
        status: pass
    human_judgment: true
    rationale: "The unix legs (kill_tree tests, terminate_group, terminate_all signalling, macOS/Linux probes, setsid) cannot compile or run on the operator's Windows box; they are proven by plan 83-10's three-leg CI run"
  - id: D5
    description: "rust-test.yml runs `cargo test -p gamelib-proc` as its own unconditional step before the multi-crate step; rustTestWorkflow.test.ts pins it with mutation tests"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "meta/__tests__/rustTestWorkflow.test.ts (22 passed)"
        status: pass
    human_judgment: false
---

# Phase 83 Plan 04: gamelib-proc Summary

**Tauri-free gamelib-proc crate: Helper vs Game spawn classes, unix process-group / Windows per-helper Job tree kill, the ChildSet the exit path drains, ProcRunner over core's ProcessRunner, and a stand-in harness proving helpers die and a game tree survives, run first on all three CI legs.**

## Performance

- **Duration:** about 20 min (start time was not captured at launch; bounded by the previous plan's close-out)
- **Completed:** 2026-11-20
- **Tasks:** 3 (task 1 tracer)
- **Files:** 12 created, 5 modified

## Accomplishments

- `gamelib-proc` (rust-version 1.77.2, no tauri dependency) with `libc` on unix and `windows-sys` 0.61 (`Win32_Foundation`, `Win32_Security`, `Win32_System_JobObjects`, `Win32_System_Threading`) already declared, so plans 83-07/83-08 do not touch Cargo.lock. The lockfile gained exactly `gamelib-proc`.
- `kill_tree`: `kill_process_group` moved from the shell with its `pgid <= 1` refusal, SAFETY text and the three tests; `terminate_group` is `shutdown_child`'s SIGTERM, 50 ms poll, SIGKILL, wait sequence made reusable.
- `spawn`: `spawn_helper` (own group on unix, own Job on Windows, registered), `spawn_helper_with_pipes`, `spawn_helper_tokio` (kill_on_drop plus a `HelperGuard`), `spawn_game` (setsid, null or file stdio, no Job, never registered).
- `children::ChildSet` with `terminate_all(grace)`: SIGTERM every group, wait, SIGKILL the rest and reap (unix); `TerminateJobObject` then wait (Windows). Only groups created by this crate are signalled, never `pgid <= 1`, and a pid we hold no `Child` for is checked against its recorded start stamp first.
- `ProcRunner` carries `TokioRunner`'s semantics exactly, plus registration.
- Harness: `tests/orphans.rs` drives a stand-in parent that spawns two helpers, a helper with a grandchild and a Game tree. Graceful quit (all OSes) and `Child::kill` (Windows) both leave helpers and grandchildren dead and the game tree alive and still writing to its log (Pitfall 5).
- Negative control: with the Job assignment temporarily disabled, the Windows SIGKILL leg failed (the helpers survived and the 15 s poll timed out), so the probe demonstrably sees live orphans.
- CI: `cargo test -p gamelib-proc` is its own step between the safety step and the multi-crate step, pinned by three predicates and three mutation tests.

## Task Commits

1. **Task 1 (tracer): crate, probe, kill_tree, spawn_helper, ChildSet, one-helper graceful harness** - `c658c8678` (feat)
2. **Task 2: Job, Game class, trees, graceful and Windows SIGKILL legs** - `417f972f1` (feat)
3. **Task 3: ProcRunner, spawn_helper_tokio, early CI step** - `917f3e290` (feat)

`plan_head_before` is `f56387047`. A raw `rev-list` from it to `HEAD` shows 6 commits because a concurrent session landed three `quick-261120-uzn` commits on main in the same window; `commits: 3` counts this plan's own (`--grep="(83-04)"`).

Tracer gate: auto/end-of-phase mode with an automated-only `<verify>`; the tracer verify was re-run green before expansion.

## Decisions Made

See `key-decisions`. In short: a Job per helper, drain-then-signal without the lock, hard-kill only when the leader outlives grace, start-stamp check for unowned pids.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `spawn_helper_with_pipes` replaces the planned stdout-only variant**
- **Found during:** Task 2
- **Issue:** the stand-in `tree` helper creates its grandchild on startup; on Windows the Job is assigned after spawn, so a grandchild created before assignment would escape the Job (the documented known limit) and make the Windows SIGKILL leg flaky.
- **Fix:** the helper is spawned with piped stdin and stdout; the parent writes `go` only after `spawn_helper_with_pipes` returned (Job assigned), and only then does the helper spawn its grandchild. `spawn_helper(cmd, label) -> io::Result<u32>` keeps its planned signature.
- **Files modified:** spawn.rs, bin/standin.rs, lib.rs
- **Commit:** 417f972f1

**2. [Rule 3 - Blocking] Streaming-runner test lives in `tests/runner.rs`, with a new stand-in mode `lines`**
- **Found during:** Task 3
- **Issue:** a portable long-running child that prints a line and idles has no one-line `sh`/`cmd` spelling; the stand-in is the one binary that behaves the same on all three OSes.
- **Fix:** `tests/runner.rs` runs `ProcRunner::spawn_streaming` against the stand-in's `lines` mode, asserts a line arrives, cancels the token, and polls the pid dead and unregistered. The three `run` tests stay as unit tests in `runner.rs`.
- **Commit:** 917f3e290

**3. [Plan precision] "ChildSet len back to its starting value" asserted by label**
- The `ChildSet` is process-wide and unit tests run in parallel, so a total-count comparison would flake. The test asserts its own unique label is absent after `run` returns.
- **Commit:** 917f3e290

**4. [Rule 2 - Missing critical] Stand-in stderr is null in the harness**
- With `Stdio::inherit()`, an orphan left behind by a regression held the test runner's stderr pipe open: the negative-control run hung instead of failing. Null keeps a red run red.
- **Commit:** 417f972f1 (follow-up folded into the same commit)

**5. [Rule 3 - Blocking] `#[allow(clippy::zombie_processes)]` on the stand-in's `tree`/`game`**
- clippy 1.98 (`-D warnings`) flags the deliberately never-waited idle children; the comment says why.
- **Commit:** 417f972f1

**6. [Addition] unix test for `terminate_group`**
- The plan carried only the three kill_process_group tests; one more test covers `terminate_group` (SIGTERM-responsive leader ends inside the grace period and is reaped). Unix-only, so unrun on this host.
- **Commit:** 417f972f1

**7. [Host difference] Windows host, not the plan's macOS host**
- The Task 2 acceptance line "On this macOS host the graceful test passes and its --nocapture output lists the game pid alive after quit" was verified on Windows instead (output lists the game pids after quit, all three orphans tests green). The plan-level `cargo +1.99.1 clippy --workspace ... clippyRatchet.cjs` was not run (toolchain 1.99.1 and the darwin baseline are not available here); `cargo clippy -p gamelib-proc --all-targets -- -D warnings` is clean and `cargo check --bin gamelib-shell` still builds.

**Total deviations:** 7 (3 blocking fixes, 1 missing-critical, 3 plan-precision/additions). **Impact:** none on scope; the Windows legs are measured, the unix legs are written but unproven until CI.

## Issues Encountered

- **Unix code is unverified locally.** The Windows box has only the `x86_64-pc-windows-msvc` target, and WSL is not installed, so the linux/macOS probes, `kill_tree` tests, `setsid` spawn, and the unix `terminate_all` path were written against the libc 0.2.186 sources (`proc_bsdinfo`, `PROC_PIDTBSDINFO`, `SZOMB` confirmed present) but have never compiled here. Plan 83-10's CI run is their first test. Risk is concentrated in `children.rs` (`terminate_entries` unix arm), `probe.rs` (`macos` and `linux` mods) and `kill_tree.rs`.
- `.planning`-independent working copies on this machine carry CRLF (`core.autocrlf=true`); `prettier --check` on the working copy of `cargoFeatures.test.ts` warns for that reason alone. The staged (LF) content of every file this plan touched checks clean under prettier, which is what the pre-commit hook runs.
- Pre-existing Windows-local baseline failures were not touched (see `deferred-items.md`).

## Known Stubs

None. `SpawnClass` is an enum documenting the two classes; it is not yet consumed by the shell (plan 83-08 wires it).

## Threat Flags

None beyond the plan's register. T-83-10 (group-kill refusal for `pgid <= 1`, signalling only registered groups), T-83-11 (Game class tested alive after both legs), T-83-12 (no breakaway limit, per-helper Job, log-and-fall-back), T-83-13 (bounded 15 s polls, stray-killing drop guard, FakeHome) and T-83-SC (no new external crate) are implemented.

## Next Phase Readiness

Ready for 83-07 (reaper uses `probe::start_time` and `kill_tree::signal_group`-style refusal, and the unix SIGKILL leg and negative control slot into `tests/orphans.rs`) and 83-08 (shell installs `set_diag_sink` and routes the sidecar through `spawn_helper`). The unix legs of this plan's harness first run in plan 83-10's CI.

## Self-Check: PASSED

- All 12 created files present on disk; the 5 modified files appear in the commit diffs.
- Commits found: c658c8678, 417f972f1, 917f3e290.
- Acceptance greps re-run: `crates/gamelib-proc` in Cargo.toml (1), `"gamelib-proc"` in cargoFeatures (1), `refusing to signal process group` (1), `FakeHome::new` in orphans.rs (1), no `tauri` dependency (0), `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (3), `BREAKAWAY_OK` (0), `setsid` in spawn.rs (3), the graceful test fn (1), `impl gamelib_core::process::ProcessRunner for ProcRunner` (1), `run: cargo test -p gamelib-proc` (1), `PROC_TEST_RUN` (6), and the step order in rust-test.yml (safety line 120, proc line 128, multi-crate line 132).
- Plan verification: `cargo test -p gamelib-proc -p gamelib-core` green, clippy `-D warnings` clean, `cargo fmt --check` clean, cargoFeatures (12) and rustTestWorkflow (22) jest green.
