---
phase: 87-engine-wine-and-tools
plan: 02
subsystem: infra
tags: [rust, crates, dispatch, engine-pins, ci, wine, tauri-free]

requires:
  - phase: 86-pure-leaf-services
    provides: the gamelib-info dispatch contract (sorted OPS, strict decode, guarded, dispatch_sync), the include_str! shared-JSON pattern, the crate registration checklist
provides:
  - gamelib-engine, gamelib-engine-cli, gamelib-wine and gamelib-wine-cli (Tauri-free, no keyring), each pair with the 86 dispatch contract
  - EngineCtx, EnginePaths, Platform and WineCtx, the ctx every later 87 port plan fills
  - src/common/enginePins.json, the one pin table Rust reads through include_str! and a jest test proves equal to ENGINE_PINS
  - the engine_pins op, reachable from the CLI over a fake HOME
  - CI, lockfile census and README registration for all four crates (D-13)
affects: [87-03, 87-47, 87-59, 98-shell-cutover]

actuals:
  tokens: 15100
  tasks: 2
  commits: 2

plan_head_before: 18214f257762aef71fd84465c9f36d1dc79fd540
plan_head_after: c94d704fc97cc2d69d7ff93b650b2bf46b07efcd

tech-stack:
  added: []
  patterns:
    - "two Tauri-free crate pairs with gamelib-wine depending on gamelib-engine and never the reverse, proven by cargo tree"
    - "a table both languages read from one src/common JSON file, with a jest equality test and a tampered-copy anti-vacuity case"
    - "a crate with no ops yet keeps the full dispatch shape (empty OPS, decode kept under allow(dead_code)) so the first port adds only an arm"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/Cargo.toml
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-engine/src/pins.rs
    - src-tauri/crates/gamelib-engine-cli/Cargo.toml
    - src-tauri/crates/gamelib-engine-cli/src/main.rs
    - src-tauri/crates/gamelib-engine-cli/tests/cli.rs
    - src-tauri/crates/gamelib-wine/Cargo.toml
    - src-tauri/crates/gamelib-wine/src/lib.rs
    - src-tauri/crates/gamelib-wine/src/ctx.rs
    - src-tauri/crates/gamelib-wine-cli/Cargo.toml
    - src-tauri/crates/gamelib-wine-cli/src/main.rs
    - src-tauri/crates/gamelib-wine-cli/tests/cli.rs
    - src/common/enginePins.json
    - src/common/__tests__/enginePins.test.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - .github/workflows/rust-test.yml
    - meta/__tests__/rustTestWorkflow.test.ts
    - src/backend/__tests__/cargoFeatures.test.ts
    - src-tauri/crates/README.md

key-decisions:
  - "pins() returns Err(\"engine-pins:corrupt-table\") on a malformed table rather than an empty table, because an empty table would read as nothing pinned to a prune"
  - "the dispatch-contract panic and shutdown tests drive the public guarded() with a panicking or pre-cancelled future instead of adding a test-only op, so OPS never carries a test name in any build"
  - "gamelib-wine ships an empty OPS; the wine CLI test pins that ops prints nothing and exits 0 until the first wine port lands"

patterns-established:
  - "CLI derives every directory (tools, temp, home) from --user-data, so a CLI run can never read the real profile"

requirements-completed: [SVC-02]

duration: 25min
completed: 2026-11-23
status: complete
---

# Phase 87 Plan 02: Engine and Wine Crate Scaffold Summary

**Two Tauri-free crate pairs (gamelib-engine and gamelib-wine, each with a CLI) carry the 86 dispatch contract and the CI wiring, and one real op, `engine_pins`, reads a shared `src/common/enginePins.json` end to end through the CLI.**

## Performance

- **Duration:** about 25 min (start time not captured at launch; estimated from the tool timeline)
- **Tasks:** 2
- **Files modified:** 21 (15 created, 6 modified)

## Accomplishments

- gamelib-engine and gamelib-wine each have a sorted `OPS`, `dispatch`, strict single-argument `decode` (`<op>:bad-args`), `guarded` with a `Shutdown` registrant and `catch_unwind` (`<op>:shutdown`, `<op>:panic`), a crate-owned 2-worker runtime and `dispatch_sync` answering `<op>:wrong-thread` inside a runtime.
- `cargo tree -p gamelib-engine` names no gamelib-wine, and neither crate pulls tauri or keyring (counts all 0).
- `src/common/enginePins.json` was generated from `ENGINE_PINS`; `pins.rs` parses it once through `include_str!` and `pinned_engine_ids()` matches `pinnedEngineIdsFrom`. `enginePins.test.ts` proves the equality, and a mutated size in the JSON was confirmed to fail it.
- Both CLIs take `--user-data <dir>`, print `ops`, and run `op <name> <json-args> [--now-ms]`; their tests run against a `FakeHome`. `op engine_pins '[]'` prints a table whose `current.id` is `wine-staging-11.20`.
- Registered everywhere the 86 checklist requires: workspace members and shell path deps, Cargo.lock (no third-party name added), the three-OS multi-crate `-p` step and its name, `rustTestWorkflow.test.ts` (new case plus an omission mutation for the engine pair and the wine pair), the lockfile census, and the README crate list and CI command.

## Task Commits

1. **Task 1: Tracer, scaffold the four crates, register them, print the pinned engine table** - `c125353b8` (feat)
2. **Task 2: The pin-table equality test and the dispatch contract tests** - `c94d704fc` (test)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Files Created/Modified

- `src-tauri/crates/gamelib-engine/src/{lib,ctx,pins}.rs` - dispatch contract, `EngineCtx`/`EnginePaths`/`Platform`, the shared pin table and its three unit tests
- `src-tauri/crates/gamelib-wine/src/{lib,ctx}.rs` - the same dispatch contract with an empty `OPS`, and `WineCtx { engine, runtime_path }`
- `src-tauri/crates/gamelib-{engine,wine}-cli/` - headless front ends and their fake-HOME CLI tests
- `src/common/enginePins.json`, `src/common/__tests__/enginePins.test.ts` - the shared table and its drift test
- `.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts`, `src/backend/__tests__/cargoFeatures.test.ts`, `src-tauri/crates/README.md`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` - registration

## Decisions Made

See `key-decisions` above. The shell path deps on gamelib-engine and gamelib-wine were added with the workspace members as the plan directed, so the shell arms of later plans need no manifest edit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vacuous assertion in the first draft of the engine CLI test**
- **Found during:** Task 1 (immediately after writing, before the first commit)
- **Issue:** the draft compared `archiveName` to a clone of itself, which cannot fail.
- **Fix:** it now asserts the literal `wine-staging-11.20-osx64.tar.xz` and a 64-character sha256.
- **Files modified:** `src-tauri/crates/gamelib-engine-cli/tests/cli.rs`
- **Committed in:** `c125353b8`

### Process note (not a rule deviation)

Task 2 is marked `tdd="true"`, but the behaviours it pins (the dispatch contract) were implemented in Task 1's tracer, so the tests passed on first run and there was no RED commit. To keep them from being vacuous, the equality test was mutation-checked (a changed `size` in the JSON failed it, then the file was restored), and the jest suite carries its own tampered-copy case. The panic and shutdown cases drive `guarded()` directly instead of a test-only op.

**Total deviations:** 1 auto-fixed (Rule 1), 1 process note.
**Impact on plan:** none; no scope change.

## Issues Encountered

None. `pnpm exec jest` re-ran the project's `prepare` step (husky install, helper-binary check); it changed no tracked file.

## Known Stubs

None. `gamelib-wine` ships an empty `OPS` and an unused `decode` (kept under `#[allow(dead_code)]`) on purpose: it is the shape the first wine port fills, and the wine CLI test pins the empty list.

## Threat Flags

None. The plan's threat model is covered: T-87-04 by `enginePins.test.ts` (JSON equals `ENGINE_PINS`; the size and sha256 refusal itself lands in 87-47), T-87-05 by strict single-argument decode with fixed error literals, T-87-SC by a lockfile that gained only the four workspace crates (`cargoFeatures.test.ts` passes).

## Verification

- `cargo test -p gamelib-engine -p gamelib-engine-cli -p gamelib-wine -p gamelib-wine-cli`: engine lib 12 passed, engine CLI 5, wine lib 7, wine CLI 3.
- `cargo clippy ... --all-targets -- -D warnings` and `cargo fmt --check` clean on all four crates.
- `cargo tree` checks: 0 matches for gamelib-wine in the engine tree, 0 for keyring or tauri in either tree.
- `jest meta/__tests__/rustTestWorkflow.test.ts src/backend/__tests__/cargoFeatures.test.ts`: 43 passed; `jest src/common/__tests__/enginePins.test.ts`: 3 passed.
- `npx prettier --check` over the TS, YAML, JSON and Markdown paths written: clean (every path reports `ignored: false` under `--file-info`; Rust has no prettier parser and is covered by `cargo fmt`).
- Acceptance greps: `grep -c "gamelib-engine" rust-test.yml` = 2, `grep -c '"gamelib-wine-cli"' cargoFeatures.test.ts` = 1.

## Next Phase Readiness

The ctx types, dispatch shape, CLI and CI step are in place, so every later 87 plan adds modules and an op arm only. 87-47 consumes the pin table for the size and sha256 refusal.

## Self-Check: PASSED

- All 15 created files exist on disk; both task commits are ancestors of HEAD.
