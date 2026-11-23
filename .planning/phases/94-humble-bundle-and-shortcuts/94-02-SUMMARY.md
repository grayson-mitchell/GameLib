---
phase: 94-humble-bundle-and-shortcuts
plan: 02
subsystem: infra
tags: [rust, tauri-free, dispatch-contract, ci, cargo, windows, proc-spec, icns]

requires:
  - phase: 86-pure-leaf-services
    provides: the gamelib-info dispatch shape (OPS, dispatch, guarded, decode, dispatch_sync) copied here
  - phase: 87-engine-wine-and-tools
    provides: the empty-OPS crate contract tests and the SpecRunner spawn seam
provides:
  - gamelib-humble and gamelib-shortcuts, two Tauri-free crates with the 86 dispatch contract and an empty OPS
  - the full dependency set for both crates declared once (icns 0.5 the only new lockfile crate)
  - CI multi-crate step, lockfile census, README and .prettierignore fixture registration for both
  - ProcSpec::hide_window and gamelib_proc::spec::creation_flags (Windows CREATE_NO_WINDOW)
affects: [94-03, 94-04, 94-05, 94-06, 94-07, 94-08, 94-18, 94-19, 94-20, 94-31, 94-32]

requirements-completed: [SVC-04, SVC-05]

actuals:
  tokens: 9200
  tasks: 2
  commits: 2

plan_head_before: 64c1562787c8ffc98ba03e53907d509514ed28df
plan_head_after: bee0a3144da21902d31a13966ff86b0dfdaf0f86

tech-stack:
  added: [icns 0.5]
  patterns:
    - "test-only ops live behind cfg(test) in a TEST_OPS list chained into dispatch, never in a release OPS"
    - "a Windows-only spawn flag is computed by a pure fn that every OS unit-tests, applied only in the cfg(windows) arm"

key-files:
  created:
    - src-tauri/crates/gamelib-humble/Cargo.toml
    - src-tauri/crates/gamelib-humble/src/lib.rs
    - src-tauri/crates/gamelib-humble/src/ctx.rs
    - src-tauri/crates/gamelib-shortcuts/Cargo.toml
    - src-tauri/crates/gamelib-shortcuts/src/lib.rs
    - src-tauri/crates/gamelib-shortcuts/src/ctx.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - .github/workflows/rust-test.yml
    - meta/__tests__/rustTestWorkflow.test.ts
    - src/backend/__tests__/cargoFeatures.test.ts
    - src-tauri/crates/README.md
    - .prettierignore
    - src-tauri/crates/gamelib-core/src/process.rs
    - src-tauri/crates/gamelib-proc/src/spec.rs

key-decisions:
  - "gamelib-shortcuts declares no jiff: the plan's dependency list for it omits jiff and nothing in the shortcuts port needs civil time; humble keeps it"
  - "Test ops (`<crate>_test_echo`, `<crate>_test_panic`) are chained into dispatch only under cfg(test), so no release OPS names them"
  - "creation_flags(base, hide_window) is called with base 0 and only when hide_window is true, so a spec that does not ask spawns with exactly today's flags"

patterns-established:
  - "icns pulls only byteorder (already locked); image's jpeg feature already locked zune-jpeg, so the lockfile gained one crate name"

duration: 25min
completed: 2026-11-24
status: complete
---

# Phase 94 Plan 02: Crate scaffolds, CI registration and ProcSpec hide_window Summary

**gamelib-humble and gamelib-shortcuts exist as Tauri-free crates carrying the 86 dispatch contract (10 passing contract tests each), registered on the three-OS CI step, and `ProcSpec::hide_window` makes helper spawns console-less on Windows.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 2
- **Files modified:** 15 (6 created, 9 modified)

## Accomplishments

- Both crates have a sorted `OPS` (empty), `dispatch` answering `unknown op: <op>`, strict single-argument `decode` answering `<op>:bad-args` (never echoing input), `catch_unwind` in the op future (`<op>:panic`), `guarded` holding a `gamelib_core::shutdown::global()`-style registrant (`"humble"`, `"shortcuts"`) raced against the token (`<op>:shutdown`, no work started once cancelled), and `dispatch_sync` on a crate-owned 2-worker runtime answering `<op>:wrong-thread` inside a runtime. Ten lib tests each pass.
- `cargo tree` shows neither crate pulls `keyring`, `tauri` or the sibling crate (both counts 0). `gamelib-shortcuts` links `icns 0.5` with default features off, and `rust-version` 1.87 for it (the gamelib-depot precedent).
- The lockfile gained exactly one crate name, `icns`, plus the two workspace crates; every other dependency (reqwest 0.13, rustls ring, regex without default features, jiff, url, percent-encoding, tokio, serde, serde_json, image 0.25 png and jpeg, crc32fast) was already locked.
- Registration: workspace members and shell path deps in `src-tauri/Cargo.toml`, the rust-test.yml multi-crate step (name and `-p` flags), `rustTestWorkflow.test.ts` (positive case plus omission mutation), `EXPECTED_LOCKFILE_CRATE_NAMES` (`gamelib-humble`, `gamelib-shortcuts`, `icns` in sorted position, with a Phase 94 comment), README crate list and command, and `.prettierignore` fixture entries for both crates. Jest: 45 of 45 pass across the two suites.
- `ProcSpec` gains `hide_window: bool` (default false in `ProcSpec::new`, the only struct literal). `gamelib-proc`'s spec runner applies `CREATE_NO_WINDOW` (0x0800_0000) through the pure `creation_flags(base, hide_window)` in the Windows arm only. Three unit tests run on every OS, and a `cfg(windows)` test spawns `cmd.exe /c exit 0` hidden through the runner and gets exit 0. `cargo test -p gamelib-proc` passes (the orphan harness included) on this Windows machine.

## Task Commits

1. **Task 1: Tracer, scaffold both crates, register them, run the dispatch contract on the CI step** - `b83d9576c` (feat)
2. **Task 2: ProcSpec::hide_window and the Windows CREATE_NO_WINDOW flag** - `bee0a3144` (feat)

**Plan metadata:** committed separately (docs: complete plan).

## Decisions Made

- `jiff` is declared in gamelib-humble only (the plan lists it for the humble crate; the shortcuts list omits it). A later plan that needs civil time in shortcuts adds the line; jiff is already locked, so Cargo.lock does not move.
- Test-only ops are chained into `dispatch` under `cfg(test)` rather than added to `OPS`, so the plan's rule that a release `OPS` never names a test op holds by construction, and a unit test pins it.
- `decode` carries `#[allow(dead_code)]` because no release op uses it until 94-03 onward adds the first one; the `route` function carries `#[allow(unused_variables)]` for the same reason.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The lockfile census needed `icns` in sorted position**
- **Found during:** Task 1 verify (jest `cargoFeatures.test.ts`)
- **Issue:** the plan named `gamelib-humble`, `gamelib-shortcuts` and `icns` for the census; my first edit added only the two crate names and the test reported `icns` appeared.
- **Fix:** added `"icns"` before `"ico"` in `EXPECTED_LOCKFILE_CRATE_NAMES`.
- **Files modified:** `src/backend/__tests__/cargoFeatures.test.ts`
- **Commit:** `b83d9576c`

### Process notes (not deviations in behaviour)

- The plan's precondition names branch `phase-94-humble-shortcuts`; the worktree branch is `gsd/phase-94-humble-bundle-and-shortcuts`, as dispatch directed (same note as 94-01). The worktree is `.claude/worktrees/phase-94`.
- The pre-commit worktree allow-list (`agent-*` branch namespace) was not applied, as in 94-01: this sequential executor was directed onto the `gsd/phase-94-...` branch, which is not a protected branch.
- Task 2 is `tdd="true"` but the orchestrator passed no `TDD_MODE`, and the plan is `type: execute`. The tests and the implementation went into one commit rather than a RED commit then a GREEN commit.
- The acceptance line "the gamelib-proc orphan harness still passes on the macOS run" cannot be observed on this Windows machine; the Windows run of `cargo test -p gamelib-proc` passes, and the change touches no unix code path (the flag is applied under `cfg(windows)` only).
- The `Co-Authored-By` trailer in the commits names Claude Sonnet 5.5, per the attribution instruction.

**Total deviations:** 1 auto-fixed (1 blocking). **Impact on plan:** none; the census edit was in the plan, only incomplete at first.

## Issues Encountered

None beyond the census edit. The cargo tree check also confirmed `icns` brings no JPEG 2000 decoder (its only dependency is `byteorder`).

## Known Stubs

None. `OPS` is empty by design: every later port plan adds its ops, and the test-only ops are `cfg(test)`.

## Threat Flags

None. No network endpoint, auth path, file access or schema is added. T-94-04 (strict decode, fixed error literals) is pinned by `bad_args_never_echo_the_input`; T-94-05 holds because `hide_window` only changes window creation and the spawn stays in its kill-on-close Job; T-94-SC: `icns` 0.5 is the one new crate, default features off, checksum pinned in Cargo.lock.

## User Setup Required

None.

## Next Phase Readiness

- 94-03 and the later port plans can add modules and ops to both crates, and their golden fixtures are already prettier-ignored.
- The shortcuts crate's `rust-version` 1.87 must hold on the CI toolchain; the Windows run here built it without error.

## Self-Check: PASSED

- FOUND: `src-tauri/crates/gamelib-humble/src/lib.rs`, `src-tauri/crates/gamelib-shortcuts/src/lib.rs` (`pub const OPS`)
- FOUND: `pub hide_window: bool` once in `process.rs`; `fn creation_flags` once in `spec.rs`
- FOUND: commits `b83d9576c`, `bee0a3144` on `gsd/phase-94-humble-bundle-and-shortcuts`
- FOUND: `gamelib-humble` in `.github/workflows/rust-test.yml`; `gamelib-shortcuts/tests/fixtures` once in `.prettierignore`
