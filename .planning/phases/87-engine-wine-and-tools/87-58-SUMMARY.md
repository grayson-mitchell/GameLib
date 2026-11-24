---
phase: 87-engine-wine-and-tools
plan: 58
subsystem: testing
tags: [ci, windows, golden-replay, clippy-ratchet, release-dry-run, signed-build, d-12, d-13]

requires:
  - phase: 87-engine-wine-and-tools
    provides: 87-01..87-57 (every Phase 87 source commit), the 87-VALIDATION.md map and the schedule/survivor gates
provides:
  - the Phase 87 automated proof from a clean worktree (87-VALIDATION.md "## Phase proof", "## SC4 sweep")
  - three-OS CI green at f9f1cce2e45ebee3712e791c6e63b6c5fb88b9fc (rust-test.yml run 45307026824, codecheck, test, lint)
  - the release-tauri.yml dry run record and `Gate: blocked (no artifact from a dry run)` for 87-59
affects: [87-59, release]

requirements-completed: [SVC-02]

actuals:
  tokens: 12700
  tasks: 3
  commits: 15

plan_head_before: 20fc9d89039f77198aa26c8e6fcb51d8d5b00791
plan_head_after: 6c5bfa0a3d2040e6a44c068e1612ebcbe162364b

tech-stack:
  added: []
  patterns:
    - "a Windows leg that has never run a macOS-first crate is fixed by gating POSIX fixtures with #[cfg(unix)] and a stated reason, and by fixing the one real bug (leading-tilde expansion), not by loosening an assertion"

key-files:
  created:
    - .planning/phases/87-engine-wine-and-tools/87-58-SUMMARY.md
  modified:
    - .planning/phases/87-engine-wine-and-tools/87-VALIDATION.md
    - .planning/phases/87-engine-wine-and-tools/deferred-items.md
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/wine_dispatch.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/testing.rs
    - src-tauri/crates/gamelib-engine/tests/golden_config.rs
    - src-tauri/crates/gamelib-proc/tests/spec_runner.rs
    - src-tauri/crates/gamelib-wine/src/discovery/default_wine.rs
    - src-tauri/crates/gamelib-wine/src/discovery/linux.rs
    - src-tauri/crates/gamelib-wine/src/discovery/mod.rs
    - src-tauri/crates/gamelib-wine/src/tools/dxvk.rs
    - src-tauri/crates/gamelib-wine/src/tools/vulkan.rs
    - src-tauri/crates/gamelib-wine/tests/dxvk_incidents.rs
    - src-tauri/crates/gamelib-wine/tests/golden_discovery.rs
    - src-tauri/crates/gamelib-wine/tests/golden_dxmt.rs
    - src-tauri/crates/gamelib-wine/tests/golden_dxvk.rs
    - src-tauri/crates/gamelib-wine/tests/golden_runtimes.rs
    - src-tauri/crates/gamelib-wine/tests/golden_wine_core.rs
    - src-tauri/crates/gamelib-wine/tests/golden_wine_manager.rs
    - src-tauri/crates/gamelib-wine/tests/golden_winetricks.rs

key-decisions:
  - "Operator choice at the Task 2 checkpoint: push-and-build (CI-fix commits allowed without asking), dry_run=true for release-tauri.yml, D-10 accepted as met"
  - "Windows-only reds were gated with #[cfg(unix)] (matching the engine crate's existing unix-only suites) rather than weakened; the coverage given up on Windows is listed in 87-VALIDATION.md"
  - "tools/dxvk.rs now expands only a leading `~` (a real bug: the first `~` anywhere was replaced, corrupting `C:\\Users\\RUNNER~1\\...`)"

patterns-established:
  - "Per-leg golden counts are read from the CI logs, since a cfg(unix) binary still prints a `Running` line with zero tests on Windows"

duration: ~4h40m
completed: 2026-11-24
status: complete
---

# Phase 87 Plan 58: Phase proof, three-OS CI and the signed-build gate Summary

**Phase 87 is proven from a clean worktree and green on windows-latest, macos-latest and ubuntu-latest at `f9f1cce2e` after twelve Windows-found fixes. The signed Phase 87 artifact does not exist: the operator chose `dry_run=true`, which uploads nothing, so the D-12 gate is `blocked`.**

## What was done

**Task 1 (tracer).** Candidate head P, clean `git worktree add --detach` checkout, own frozen-lockfile install, vite build and SEA sidecar, cold cargo target. All 286 commits named in the 87-01..87-57 SUMMARYs are ancestors of P. The darwin clippy ratchet was red at `20fc9d890` (`cloned_ref_to_slice_refs` 10 against a ceiling of 2, eight of them Phase 87 test code); fixed in `1e586bf8d` and every step re-run at that head: every rust-test.yml step, the engine and wine `--features testing` suites (338 and 326), the shell tests (837), the clippy ratchet, `check:ipc-contract`, jest (1107 suites, 24246 tests), both smokes, the nine pre-push gates and `planning-gates`. The SC4 sweep: the TS slices are gone, no rollback flag is anywhere, the DXMT gap is closed (`on_wine_installed` 1, `on_wine_uninstalled` 1, `golden_wine_manager` green).

**Task 2 (checkpoint, resolved by the operator).** `push-and-build`; `dry_run=true`; D-10 `Accept as met`. The `src/frontend` diff since the 87-01 base is 14 files: 12 from quick 261123-pnl, and two Phase 87 one-line source-path comment edits (87-37, 87-57).

**Task 3.** Open-time diff re-run before every push (only `.planning/` for push 1, then exactly the one fix commit's paths). Push 1 carried 337 commits. CI went red on windows-latest twelve times in a row before it went green, because the Windows leg had never run these crates; each cause and its fix commit is tabulated in 87-VALIDATION.md "## CI proof". Final run `45307026824`: macos `138153251538`, windows `138153251909`, ubuntu `138153252222` all success; Code check `45307026828`, Test `45307026813`, Lint `45307026740` success. Release dry run `45279091996`: all three legs success, macOS leg signed and notarized (`Accepted`, id `0f9f1f45-4aeb-4e9b-811a-aa34fac4d235`), no artifact (a dry run uploads nothing). Gate: blocked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Darwin clippy ratchet red at the candidate head**
- **Found during:** Task 1
- **Issue:** `clippy::cloned_ref_to_slice_refs` 10 against a ceiling of 2; eight in Phase 87 `engine_dispatch.rs` and `wine_dispatch.rs` tests
- **Fix:** `std::slice::from_ref(&x)`; no ceiling moved
- **Files modified:** `src-tauri/src/engine_dispatch.rs`, `src-tauri/src/wine_dispatch.rs`
- **Commit:** `1e586bf8d`

**2. [Rule 1 - Bug] `tools/dxvk.rs` replaced the first `~` anywhere in the wine prefix**
- **Found during:** Task 3 (windows-latest, `golden_dxvk`)
- **Issue:** the runner's 8.3 temp name `C:\Users\RUNNER~1\...` was rewritten, so the prefix marker was never found. The TS did the same; only a leading `~` is the home shorthand.
- **Fix:** `strip_prefix('~')`; every golden case still replays on macOS
- **Files modified:** `src-tauri/crates/gamelib-wine/src/tools/dxvk.rs`
- **Commit:** `9c9fd376f`

**3. [Rule 3 - Blocking] Windows-only test reds that blocked the D-13 CI proof (twelve red windows-latest runs)**
- **Found during:** Task 3
- **Issue:** POSIX fixtures in `gamelib-engine` `lib.rs` tests (`833fbb98a`), `golden_config`/`golden_discovery` missing the `#![cfg(unix)]` their headers promised (`ec957163e`), five `gamelib-wine` unit tests (`14527ed15`), `dxvk_incidents` (`feb5c76a7`), the Windows separator fold also folding registry-key backslashes (`af3ff09e9`), `ScriptedSpecRunner` byte-exact program matching (`8042d7267`), `golden_wine_manager` (`cbd73bc3c`), `golden_winetricks` (`f6e71594d`), a shell test helper and two shell tests (`39a3b1a7c`, `87abb588a`), one `unused_imports` for the Windows clippy ratchet (`f9f1cce2e`)
- **Fix:** `#[cfg(unix)]` where the fixture is POSIX, separator-tolerant comparison where one file is meant; no assertion was loosened and no ceiling moved
- **Authorisation:** the operator's `push-and-build` allowed CI-fix commits without asking

### Plan truths not met as worded

- **"golden replays observed running on every leg" (D-13):** met for gamelib-wine on all three legs; for gamelib-engine only on macos-latest and ubuntu-latest, because the engine goldens are `#![cfg(unix)]` (earlier plans' decision, plus `golden_config` here), so they compile to zero tests on windows-latest. Also unix-only now: wine `golden_discovery`, `golden_wine_manager`, `dxvk_incidents`. Per-leg counts are in 87-VALIDATION.md.
- **D-12 "equal identities ... Gate: pending":** not reachable. The operator chose `dry_run=true`, so there is no artifact to inspect and the gate line is `Gate: blocked (no artifact from a dry run)`, as at 86-25.
- **D-10 "no src/frontend file":** two comment-only Phase 87 edits exist; the operator accepted D-10 as met.
- **"Push only if the open-time diff lists nothing outside .planning":** true for push 1; every later push carried exactly one authorised CI-fix commit.

## Authentication gates

None.

## Known Stubs

None.

## Threat Flags

None. The two shipped-code changes are `tools/dxvk.rs` (narrows a string replace; no new surface) and `gamelib-engine`'s `testing` feature (`same_program`, test-only).

## Deferred Issues

Logged in `deferred-items.md`: the `Supply-chain audit` workflow is red on every push including before this plan (RUSTSEC-2026-0594, yanked crates); two `gamelib-depot` timing tests are load-sensitive (red once on macOS CI, red in this Mac's main tree in the 21-crate invocation only).

## What 87-59 faces

- There is no signed Phase 87 artifact. The live gate installs a signed Phase 87 build over the signed Phase 86 build, and `Gate: blocked (no artifact from a dry run)`. Producing one needs a `dry_run=false` dispatch from a version-bumped release branch (as 85-19 `release/v0.10` and 86-26 `release/v0.12` did), because `dry_run=false` on `main` at version 0.11.0 would write into the existing `GameLib v0.11.0` draft; that is an operator decision not yet made.
- The dry-run build was `6d9f12f49`, which predates the one shipped-code fix (`tools/dxvk.rs`); any signed build for the gate should be cut from the final head or later.
- The live gate's CI half is clean: nothing in CI is red except the pre-existing supply-chain audit.

## Self-Check: PASSED

- all 15 commits in `plan_head_before..plan_head_after` are on `main` and pushed (`origin/main` equals `HEAD` after the final docs commit)
- 87-VALIDATION.md holds `## Phase proof`, `## SC4 sweep`, `## CI proof`, `## Signed builds (D-12)` and the `Gate:` line; the Task 1 and Task 3 automated verifies pass
- the scratch worktree is removed
