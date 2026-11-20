---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 02
subsystem: infra
tags: [rust, gamelib-core, shutdown, exit-budget, process-runner, tauri-free]
status: complete

requires:
  - phase: 80-steam-poll-crate
    provides: gamelib-steampoll host.rs/runtime.rs/profile.rs, the Clock and ProcessRunner seams being hoisted
provides:
  - gamelib-core crate (Tauri-free, rust-version 1.77.2, no tokio runtime of its own)
  - clock::{Clock, SystemClock}, process::{BoxFuture, RunOutput, StreamingChild, ProcessRunner}
  - paths::{Platform, join, AppPaths, resolve}, emitter::FrontendEmitter
  - shutdown::{Shutdown, Registrant, ExitBudget (DEFAULT 5 s / 1.5 s), ExitReport, run_exit, global}
  - shell TauriFrontendEmitter, the one Rust-side builder of the FRONTEND_MESSAGE_EVENT payload
affects: [83-04 gamelib-proc, 83-09 handle_exit wiring, later Rust tasks registering with shutdown::global()]

actuals:
  tokens: 9800
  tasks: 3
  commits: 4
plan_head_before: b69d4301803396bb8c011991410ee94cf46078b7
plan_head_after: 43d517ee092373405fd3d3738d4d5fb78aaf226a

tech-stack:
  added: []
  patterns:
    - "Hoist-with-re-export: move a seam to core, `pub use` it from the old module so every existing path keeps resolving"
    - "Exit stages inside one budget: detached drain threads + Condvar deadline, never a scoped join"
    - "Poison-tolerant locking (unwrap_or_else(|e| e.into_inner())) on the exit path"

key-files:
  created:
    - src-tauri/crates/gamelib-core/Cargo.toml
    - src-tauri/crates/gamelib-core/src/lib.rs
    - src-tauri/crates/gamelib-core/src/clock.rs
    - src-tauri/crates/gamelib-core/src/process.rs
    - src-tauri/crates/gamelib-core/src/paths.rs
    - src-tauri/crates/gamelib-core/src/emitter.rs
    - src-tauri/crates/gamelib-core/src/shutdown.rs
  modified:
    - src-tauri/crates/gamelib-steampoll/Cargo.toml
    - src-tauri/crates/gamelib-steampoll/src/host.rs
    - src-tauri/crates/gamelib-steampoll/src/runtime.rs
    - src-tauri/crates/gamelib-steampoll/src/profile.rs
    - src-tauri/src/steampoll_dispatch.rs
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src/backend/__tests__/cargoFeatures.test.ts
    - .github/workflows/rust-test.yml
    - meta/__tests__/rustTestWorkflow.test.ts

key-decisions:
  - "gamelib-safety is NOT re-homed into gamelib-core in this phase (Phase 82 still closing; its CI step stays first); plan 83-09 amends README 2b"
  - "paths::join is public (the plan called it private) because steampoll derives restart_hold_store_path from store_cache_dir through the same join rule"
  - "Deadline semantics: the drain wait ends when now >= deadline (exclusive end); a registrant released after the deadline is still reported, pinned by a test"
  - "run_exit drains run on detached std threads, so a never-returning drain cannot hold exit past total"

patterns-established:
  - "global() is the one app-wide Shutdown every later Rust task registers with (D-14)"
  - "No logging inside core: the caller logs the ExitReport (counts and names only)"

requirements-completed: [FND-04]

coverage:
  - id: D1
    description: "gamelib-core crate exists, Tauri-free, with Clock/ProcessRunner hoisted and re-exported so steampoll and the shell compile unchanged"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-core -p gamelib-steampoll (all green except 6 pre-existing Windows-local failures, see Issues Encountered); cargo test --bin gamelib-shell: 485 passed"
        status: pass
    human_judgment: false
  - id: D2
    description: "ExitBudget 5 s / 1.5 s, Shutdown::drain and run_exit return by the deadline with stragglers named"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-core/src/shutdown.rs#tests (11 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Profile path maths hoisted to core::paths; steampoll SidecarProfile delegates and the TS-generated fixture test still passes"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-steampoll/tests/profile.rs#matches_ts_paths_for_every_fixture_row; gamelib-core paths::tests (6 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Shell TauriFrontendEmitter implements FrontendEmitter and ShellPollHost::emit_frontend delegates to it (payload shape unchanged)"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell steampoll (17 passed); cargo check --bin gamelib-shell"
        status: pass
    human_judgment: true
    rationale: "No test fires a real Tauri emit; the unchanged renderer payload is asserted by construction (same FrontendMessagePayload), not by a runtime event test"
  - id: D5
    description: "gamelib-core pinned in Cargo.lock test and rust-test.yml -p step"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "meta/__tests__/rustTestWorkflow.test.ts + src/backend/__tests__/cargoFeatures.test.ts (29 passed)"
        status: pass
    human_judgment: false
---

# Phase 83 Plan 02: gamelib-core Summary

**Tauri-free gamelib-core crate: Clock/ProcessRunner/paths/emitter hoisted from steampoll with re-exports, plus a Shutdown token and run_exit stage orchestrator proven to finish inside one 5 s exit budget (1.5 s child grace).**

## Performance

- **Duration:** about 35 min (start time was not captured at launch; estimate)
- **Completed:** 2026-11-20
- **Tasks:** 3 (task 2 TDD: RED + GREEN)
- **Files:** 7 created, 10 modified

## Accomplishments

- gamelib-core exists (rust-version 1.77.2, deps tokio `sync` only, tokio-util, serde_json; no tauri). Pinned in the lockfile test and in rust-test.yml's multi-crate `-p` step, with a mutation test.
- Clock, SystemClock, BoxFuture, RunOutput, StreamingChild and ProcessRunner moved verbatim; steampoll `host.rs`/`runtime.rs` re-export them so every existing path and the shell's `gamelib_steampoll::runtime::SystemClock` keep compiling. `TokioRunner` untouched.
- `shutdown.rs`: `ExitBudget::DEFAULT` (5 s total, 1.5 s grace, drain 3.5 s), `Shutdown` (cancel-first Condvar drain, early return, sorted straggler names with duplicates), `Registrant`, `global()`, and `run_exit` (detached `exit-drain-<name>` threads, children with time left clamped to child_grace, then finish). 11 tests including a never-returning drain that cannot hold `run_exit` past total + 300 ms and a poisoned-mutex test.
- `paths.rs` holds the exact APPDATA / XDG_CONFIG_HOME / Library rules; `SidecarProfile::resolve` delegates and the TS fixture test passes unchanged.
- `FrontendEmitter` trait in core; shell `TauriFrontendEmitter` is now the single builder of the Rust-originated `FRONTEND_MESSAGE_EVENT` payload and `ShellPollHost::emit_frontend` delegates to it.

## Task Commits

1. **Task 1 (tracer): core crate + Clock/ProcessRunner hoist, workspace, lockfile pin, CI** - `c9918ce40` (feat)
2. **Task 2 RED: failing shutdown tests** - `b116a3819` (test) - 6 of 11 failed on assertions against a stub (drain returned empty, drain_budget zero, run_exit did nothing); the other 5 passed on the stub by design (no-registrant drain, early-release drain, poison tolerance, global, child_grace > total saturating to 0)
3. **Task 2 GREEN: Shutdown/ExitBudget/run_exit** - `ed6dd9fb1` (feat) - 11/11 pass, stable over 3 runs
4. **Task 3: paths + emitter hoists, steampoll and shell delegate** - `43d517ee0` (feat)

No REFACTOR commit (no change needed). The `check tdd-red-evidence` verb parses TAP/node-test output, not cargo output, and the MVP+TDD gate (`TDD_MODE`) was not enabled for this phase, so RED evidence is the failing cargo test list above rather than a verified record.

## Decisions Made

See `key-decisions`. In short: gamelib-safety stays out of core for now; `paths::join` is public; exclusive-end deadline; detached drain threads.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Unused `Clock` import in steampoll runtime.rs**
- **Found during:** Task 1 (clippy `-D warnings`)
- **Issue:** after SystemClock moved to core, `runtime.rs` no longer needed `Clock` in its `use crate::host::{...}` list
- **Fix:** dropped `Clock` from that import
- **Files modified:** src-tauri/crates/gamelib-steampoll/src/runtime.rs
- **Commit:** c9918ce40

**2. [Design note] `paths::join` is public, not private**
- **Found during:** Task 3
- **Issue:** plan said core's `join` is private, but steampoll must derive `restart_hold_store_path` from `store_cache_dir` through the same join rule and no longer owns a join
- **Fix:** `pub fn join(platform, base, parts)` in core::paths; profile.rs imports it. No duplicate join remains in steampoll.
- **Commit:** 43d517ee0

**3. [Plan precision] Existing rustTestWorkflow mutation test string updated**
- The "step is conditional" mutation test anchors on the multi-crate step's name; the name gained `gamelib-core,` so the anchor string was updated in the same commit (c9918ce40).

**Total deviations:** 3 minor (1 blocking fix, 2 plan-precision). **Impact:** none on behaviour or scope.

## Issues Encountered

- **6 steampoll tests fail on this Windows box, identically at the pre-plan baseline** (`b69d43018`, verified in a scratch `git archive` copy): `adoption::on_windows_a_changed_steam_pid_is_never_adopted` (real Steam is running locally and the Windows live path sees it) and 5 steampoll-cli tests (`tempdir: Access is denied` at `C:\Windows`, plus the dependent frozen-parity/replay tests). Not caused by this plan; logged in `deferred-items.md`. CI is ubuntu/macOS/Windows runners without these conditions.
- The pinned clippy toolchain (1.99.1) and darwin ratchet baseline are not available locally, so `meta/clippyRatchet.cjs` was not run. `cargo clippy -p gamelib-core -p gamelib-steampoll --all-targets -- -D warnings` is clean, and the shell's remaining clippy/rustc warnings are pre-existing and in files this plan did not touch. The darwin equality ratchet should be confirmed on CI or the macOS box.
- `git worktree add` for a baseline checkout failed on this filesystem (long `.planning` paths); no state was left behind (`git worktree prune` clean).

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or trust-boundary file access. T-83-03/04/05/SC mitigations are implemented (detached drain threads, poison-tolerant locks, names-and-duration-only report, no new external crate).

## Next Phase Readiness

Ready for 83-04 (gamelib-proc implements core's `ProcessRunner`) and 83-09 (wire `run_exit` into `handle_exit`; amend README 2b re: gamelib-safety).

## Self-Check: PASSED

- All 7 created files present on disk; all 10 modified files in commit diffs.
- Commits found: c9918ce40, b116a3819, ed6dd9fb1, 43d517ee0 (4 measured from the ledger).
- Acceptance greps re-run: lockfile/CI/workspace pins present, `pub trait ProcessRunner` absent from steampoll host.rs, `gamelib_core::process` re-export present, no `tauri` dependency in gamelib-core, no `thread::scope` in shutdown.rs, 11 `shutdown::tests`.
