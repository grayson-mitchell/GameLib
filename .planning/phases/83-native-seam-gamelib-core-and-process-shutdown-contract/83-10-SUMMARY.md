---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 10
subsystem: infra
tags: [rust, ci, clippy-ratchet, gamelib-proc, three-os-proof, validation]
status: complete

requires:
  - phase: 83-01..83-09
    provides: every Phase 83 code commit (35 commits across the nine plan SUMMARYs), all ancestors of the proof head
provides:
  - 83-VALIDATION.md "## Phase proof": clean-worktree measurement at P = 844d2eee8, the filled per-task verification map, wave_0_complete true
  - 83-VALIDATION.md "## CI proof": three-OS rust-test.yml green at 90ca09d02 with run ids, per-leg conclusions and the orphans tests per leg
  - three small fixes found by the proof (testContainment/rendererAllowList classification, two clippy unix lints in gamelib-proc)
affects: [83-11 live macOS gate, /gsd-verify-work, /gsd-validate-phase]

actuals:
  tokens: 9000
  tasks: 3
  commits: 5
plan_head_before: 0f33fbe987492706ff4e223ac54542cd2b16ae98
plan_head_after: b841140a71c714fa26bb86634d3c00c87ea92997

key-files:
  created: []
  modified:
    - .planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-VALIDATION.md
    - src-tauri/crates/gamelib-proc/src/spawn.rs
    - src-tauri/crates/gamelib-proc/src/reaper.rs
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/backend/sidecar/__tests__/rendererAllowList.test.ts

key-decisions:
  - "Did not push again to add the three unpushed phase-84 docs commits while bd150a0c7's runs were in flight: every workflow here has cancel-in-progress, so a second push would have cancelled the proof runs. The fix push (90ca09d02) carried them with it after those runs had finished"
  - "Re-ran the failed macOS job once before calling the steampoll watchdog failure a flake (passed on rerun, and at 90ca09d02), and the failed Test job once for sharedRedistInstall (passed on rerun)"
  - "Fixed the unix clippy lints with scoped #[allow] and a stated reason, not by raising or adding a ceiling: unit_arg has no ceiling and meta/clippyRatchet.cjs is untouched since P"

requirements-completed: [FND-03, FND-04]

coverage:
  - id: D1
    description: "Every local gate re-measured from a clean git worktree at candidate head P"
    requirement: FND-03
    verification:
      - kind: command
        ref: "83-VALIDATION.md '## Phase proof' command table, rows 1-17 (all green except pnpm test, whose 85 reds are the Windows-local set shown by the base comparison)"
        status: pass
    human_judgment: false
  - id: D2
    description: "rust-test.yml green on windows-latest, macos-latest and ubuntu-latest at 90ca09d02 including the gamelib-proc step, the SIGKILL reaper legs, the negative control and the Node stand-in leg; codecheck, lint and supply-chain green; Test green"
    requirement: FND-04
    verification:
      - kind: other
        ref: "gh run 44850161688 (Rust test, all three legs success), 44850161669 (Code check), 44850161817 (Lint), 44850161707 (Supply-chain audit), 44850161668 (Test, success on attempt 2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No gate ceiling moved: git diff 844d2eee8 HEAD -- meta/clippyRatchet.cjs is empty; no push used --no-verify"
    requirement: FND-04
    verification:
      - kind: command
        ref: "git diff --stat 844d2eee8 HEAD -- meta/clippyRatchet.cjs (empty); the pre-push hook ran on the 90ca09d02 push"
        status: pass
    human_judgment: false
  - id: D4
    description: "Test workflow and macOS steampoll watchdog are flaky independently of phase 83"
    requirement: FND-04
    verification:
      - kind: other
        ref: "83-VALIDATION.md '## CI proof' > 'Failures that are not phase 83'"
        status: unknown
    human_judgment: true
    rationale: "A flake is shown by rerun and by no phase 83 diff touching the code, not proven fixed; the verifier should decide whether the watchdog test needs a todo"

duration: not captured (start time was not recorded at launch)
completed: 2026-11-21
---

# Phase 83 Plan 10: Clean-worktree proof and three-OS CI proof Summary

**The Phase 83 gates pass from a clean worktree and rust-test.yml is green on windows-latest, macos-latest and ubuntu-latest at `90ca09d02`, including the gamelib-proc orphan harness on all three; it took four small fixes the proof itself exposed.**

## Performance

- **Duration:** not captured (start time was not recorded at launch)
- **Completed:** 2026-11-21
- **Tasks:** 3 (task 1 tracer, task 2 checkpoint, task 3 auto)
- **Files:** 5 modified (one planning file, two Rust, two jest), none created

## Operator decision (Task 2, recorded verbatim)

The operator answered the push checkpoint: `push-now`. As offered: push main now with hooks (never `--no-verify`), and follow-up CI-only fix commits inside this plan are authorised without asking again. The operator was told the push carries all of main's commits ahead of origin/main, including another session's phase-82 and phase-84 commits, and accepted that.

## Task Commits

1. **Task 1: tracer, clean-worktree proof at P** - `cfe0fa2fc` (fix: `nativeChannelOwnership` classified in `testContainment`; `rendererAllowList` unions the `nativeChannels.json` names), `844d2eee8` (fix: `gamelib-proc/src/spawn.rs` `clippy::let_unit_value`), `bd150a0c7` (docs: "## Phase proof", the filled map, `wave_0_complete: true`)
2. **Task 2: push checkpoint** - no commit. The operator replied `push-now`. By the time this agent resumed, origin/main was already at `bd150a0c7` (the orchestrator or another session had pushed the phase commits), and CI was running on it
3. **Task 3: CI proof and CI-only fix** - `90ca09d02` (fix: `clippy::unit_arg` at two sites in `gamelib-proc`, pushed with the pre-push hook), `b841140a7` (docs: "## CI proof")

The plan's own commits are those five; `git rev-list plan_head_before..plan_head_after` also counts other sessions' phase-84 docs and a phase-82 docs commit interleaved on main, which are not this plan's.

## What was proven

- **Clean worktree at P = `844d2eee8`** (own install, vite build, sidecar-SEA build, own target dir): crate tests, `cargo test --bin gamelib-shell` 515 passed, the win32 clippy ratchet, `check:ipc-contract`, `planning-gates`, and the whole pre-push gate set are green. The darwin ratchet could not run on this Windows box and was left to CI. `pnpm test` is red here only on the operator-box Windows set (85 suites against 95 at the phase base; the 2 suites red at P and green at base are Windows file-lock and load flakes, shown not to be regressions).
- **Three-OS CI at `90ca09d02`**: Rust test run 44850161688: windows-latest, ubuntu-latest and macos-latest all success. gamelib-proc step: Windows runs the Job SIGKILL leg and the graceful legs (4 orphans tests); ubuntu and macOS run 7 orphans tests including the SIGKILL reaper leg, the reaper-disabled negative control, the leaked-pipe leg and the Node stand-in leg. macOS clippy `PASS (darwin, toolchain 1.99.1)`, Windows `PASS (win32, toolchain 1.99.1)`. Code check, Lint and Supply-chain audit success; Test success on attempt 2. Per-leg tables are in `83-VALIDATION.md` "## CI proof".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] jest gates red from phase 83 code** (Task 1, `cfe0fa2fc`)
- **Found during:** Task 1 (`pnpm test` at the first head, and on origin's red Test workflow)
- **Issue:** `nativeChannelOwnership.test.ts` (83-05) was not in `STRUCTURALLY_CONTAINED_SUITES`; `rendererAllowList`'s computed set omitted the native channel names that `genIpcContract` unions into `RENDERER_CHANNELS`
- **Fix:** classified the suite; unioned the manifest names in the test. No ceiling or baseline widened
- **Files modified:** `src/backend/sidecar/__tests__/testContainment.test.ts`, `src/backend/sidecar/__tests__/rendererAllowList.test.ts`
- **Commit:** `cfe0fa2fc`

**2. [Rule 1 - Bug] clippy `let_unit_value` on unix** (Task 1, `844d2eee8`)
- **Found during:** Task 1 (origin's macos-latest leg at `4566008950` had failed the ratchet on exactly these sites)
- **Issue:** `JobSlot` is `()` off Windows, so two bindings in `gamelib-proc/src/spawn.rs` were unit values
- **Fix:** one call inlined, one scoped `#[allow]` with the reason. The Windows box cannot lint `cfg(not(windows))` code, so this was fixed by inspection
- **Files modified:** `src-tauri/crates/gamelib-proc/src/spawn.rs`
- **Commit:** `844d2eee8`

**3. [Rule 1 - Bug] clippy `unit_arg` on unix, the successor of deviation 2** (Task 3, `90ca09d02`)
- **Found during:** Task 3 (macos-latest at `bd150a0c7`: `FAIL: 2 new warning(s) for clippy::unit_arg, which has no ceiling`)
- **Issue:** inlining the unit-valued call in deviation 2 turned `let_unit_value` into `unit_arg` at `spawn.rs:99`, and `Default::default()` as a `register_pid` argument in the reaper wiring test (`reaper.rs:571`) was the same lint
- **Fix:** scoped `#[allow(clippy::unit_arg)]` with the reason at both sites; no ceiling added or raised. Verified green on macos-latest at `90ca09d02`
- **Files modified:** `src-tauri/crates/gamelib-proc/src/spawn.rs`, `src-tauri/crates/gamelib-proc/src/reaper.rs`
- **Commit:** `90ca09d02`

### Flow deviation (not a code deviation)

Task 2's push had already happened before this continuation ran (origin/main was at `bd150a0c7`, including the 83-10 Task 1 commits), so this agent did not issue that first `git push`. It issued the second (`90ca09d02`), with hooks, and no `--no-verify`.

## Failures that are not phase 83

Recorded in full, with evidence, in `83-VALIDATION.md` "## CI proof" for the verifier. In short: the `gamelib-steampoll` macOS `watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first` timing test (failed macOS at `0c351cfd8` and at `bd150a0c7` attempt 1, passed on rerun and at `90ca09d02`; nothing it links changed between its last pass and first failure) and the Steam bridge `sharedRedistInstall.test.ts` installer-timeout fake-timer test (failed once at `90ca09d02`, passed on rerun; no phase 83 commit touches `src/backend/storeManagers/steam/bridge`). Neither was fixed here. The macOS watchdog test passed on 2 of 4 macOS attempts at phase 83 heads, so it can still turn a future run red.

## Known Stubs

None.

## Threat Flags

None. T-83-35 (push gated by a blocking-human decision; hook ran) and T-83-36 (no ceiling moved) hold as recorded under D3.

## Self-Check: PASSED

- 83-VALIDATION.md has "## Phase proof", "## CI proof" and `wave_0_complete: true`.
- Commits `cfe0fa2fc`, `844d2eee8`, `bd150a0c7`, `90ca09d02`, `b841140a7` exist; origin/main contains all but `b841140a7` (unpushed at this point; the operator or orchestrator decides when).
