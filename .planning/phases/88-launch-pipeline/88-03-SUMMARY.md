---
phase: 88-launch-pipeline
plan: 03
subsystem: rust-crates
tags: [gamelib-knownfix, gamelib-launch, overlay-catalogue, shared-json, rust-test-ci, svc-03]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the gamelib-wine crate shape (dispatch, guarded, dispatch_sync, CLI), gamelib-engine EngineCtx and the enginePins.json shared-file pattern
  - phase: 88-launch-pipeline
    plan: 02
    provides: the shim schedule re-targeting and the launch port-complete gate (D-25 order: contract before code)
provides:
  - gamelib-knownfix (KnownFixCtx, KnownFixPaths, the catalogue module, op knownfix_overlay_catalogue) and gamelib-knownfix-cli
  - gamelib-launch (LaunchCtx, empty OPS, the dispatch contract) and gamelib-launch-cli
  - src/common/knownFixOverlayCatalogue.json, the one overlay pin file the TS and the Rust both read
  - both crate pairs in the three-OS rust-test.yml multi-crate step, with the workflow test, lockfile name list, README and .prettierignore entries
affects: [88.1, 88.2, 88.3, 88-10]

actuals:
  tokens: 18400
  tasks: 2
  commits: 2
plan_head_before: d098fb27ba0dbe8703963ac8e4c455791a2c9914
plan_head_after: c8aac17d2a1c91a69e11cf7d6dcc05ac84d0d835

tech-stack:
  added: []
  patterns:
    - "a compiled-in shared JSON read by both languages, with a jest equality test pinning the URL literals the Rust test pins too (the enginePins.json shape)"
    - "every op runs inside guarded: a shutdown registrant raced against the token, answering <op>:shutdown, <op>:panic, <op>:wrong-thread"

key-files:
  created:
    - src-tauri/crates/gamelib-knownfix/Cargo.toml
    - src-tauri/crates/gamelib-knownfix/src/lib.rs
    - src-tauri/crates/gamelib-knownfix/src/ctx.rs
    - src-tauri/crates/gamelib-knownfix/src/catalogue.rs
    - src-tauri/crates/gamelib-knownfix-cli/Cargo.toml
    - src-tauri/crates/gamelib-knownfix-cli/src/main.rs
    - src-tauri/crates/gamelib-knownfix-cli/tests/cli.rs
    - src-tauri/crates/gamelib-launch/Cargo.toml
    - src-tauri/crates/gamelib-launch/src/lib.rs
    - src-tauri/crates/gamelib-launch/src/ctx.rs
    - src-tauri/crates/gamelib-launch-cli/Cargo.toml
    - src-tauri/crates/gamelib-launch-cli/src/main.rs
    - src-tauri/crates/gamelib-launch-cli/tests/cli.rs
    - src/common/knownFixOverlayCatalogue.json
    - src/common/__tests__/knownFixOverlayCatalogue.test.ts
  modified:
    - src/common/knownFixOverlayCatalogue.ts
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - .github/workflows/rust-test.yml
    - meta/__tests__/rustTestWorkflow.test.ts
    - src/backend/__tests__/cargoFeatures.test.ts
    - src-tauri/crates/README.md
    - .prettierignore

key-decisions:
  - "The catalogue JSON is `{ targetEnv, entries: [] }` with entries as an array in file order; the TS builds the id-keyed record and the notices page from entries[0], and the Rust notices_url reads the same first entry, so the two cannot name different release pages"
  - "An empty or unparseable catalogue is an error on both sides (Rust catalogue() answers a fixed `overlay-catalogue:corrupt-table`, the TS module throws at load): an empty table would read as 'no overlay pinned'"
  - "KnownFixCtx carries only the engine context, derived paths and two handed-in values (relay_url, app_version); gamelib-wine, gamelib-store, gamelib-proc, gamelib-safety, sha2 and flate2 are declared now with a comment each for the plan that first uses them, so later plans add modules, not dependencies"
  - "The CLIs build the context on a StoreHost with SystemClock and take `--relay-url` and `--app-version` flags (default empty and the crate version) so no environment is read"

patterns-established:
  - "New Tauri-free crate pair checklist: workspace members and shell path deps, Cargo.lock, the rust-test.yml run line and step name together with rustTestWorkflow.test.ts, EXPECTED_LOCKFILE_CRATE_NAMES, README, .prettierignore fixture roots"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "gamelib-knownfix and gamelib-launch (with CLIs) exist, build, pass clippy -D warnings and cargo fmt, and are Tauri-free: cargo tree shows no keyring or tauri in either, and no path from gamelib-wine or gamelib-engine to either crate"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-knownfix -p gamelib-knownfix-cli -p gamelib-launch -p gamelib-launch-cli && cargo clippy ... --all-targets -- -D warnings && cargo tree grep counts 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "op knownfix_overlay_catalogue returns the shared JSON end to end through gamelib-knownfix-cli over a FakeHome (first entry gst-libav-1.24.13, its archive sha256 and the target env map)"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-knownfix-cli/tests/cli.rs#the_overlay_catalogue_op_prints_the_shared_json_over_a_fake_home"
        status: pass
    human_judgment: false
  - id: D3
    description: "The TS catalogue is read from the shared JSON and equals it field for field; the archive and notices URL literals are pinned identically in the jest and the Rust tests; a tampered copy is not equal"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/common/__tests__/knownFixOverlayCatalogue.test.ts (5 tests) and gamelib-knownfix lib test the_catalogue_urls_are_the_literals_the_ts_test_pins"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both crate pairs run in the rust-test.yml multi-crate step on the three OS legs, asserted verbatim by rustTestWorkflow.test.ts with an omission mutation; the lockfile name list gained only the four workspace crates"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "meta/__tests__/rustTestWorkflow.test.ts and src/backend/__tests__/cargoFeatures.test.ts, 45 passed"
        status: pass
    human_judgment: false
  - id: D5
    description: "Both dispatch contracts are pinned: unknown op, bad-args, wrong-thread, panic, shutdown (registrant released), sorted unique OPS; 10 knownfix and 7 launch lib tests"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-knownfix --lib (10 passed) and cargo test -p gamelib-launch --lib (7 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The three-OS legs of the CI step (Windows and Linux) were not run; only the macOS dev machine built and tested the crates"
    verification: []
    human_judgment: true
    rationale: "Cross-OS behaviour of the new crates is proven only by the first CI run of rust-test.yml; no local check can stand in for the other two legs"

duration: 30min
completed: 2026-11-24
status: complete
---

# Phase 88 Plan 03: Launch scaffolding and known fixes Summary

**Two Tauri-free crate pairs (gamelib-knownfix, gamelib-launch) wired into workspace and three-OS CI, with the overlay catalogue moved to one shared JSON the TS and the Rust both read and a first end-to-end op, knownfix_overlay_catalogue.**

## Performance

- **Duration:** about 30 min (start time was not recorded at launch; estimated from the clock)
- **Completed:** 2026-11-24T19:48:24Z
- **Tasks:** 2
- **Files modified:** 23 (15 new crate and test files, the shared JSON, 7 registrations)

## Accomplishments

- `gamelib-knownfix` with `KnownFixCtx`, `KnownFixPaths` (derived from the app folder as `process/appPaths.ts` builds them, plus the bundled layer passed in), the `catalogue` module (serde structs with `deny_unknown_fields`, `lookup`, `archive_url`, `notices_url`) and the op `knownfix_overlay_catalogue`; `gamelib-launch` with `LaunchCtx`, an empty `OPS` and the same dispatch contract for 88.1 to extend.
- `src/common/knownFixOverlayCatalogue.json` is now the single owner of the overlay pins (D-03). `knownFixOverlayCatalogue.ts` imports it and keeps every export name and type, so the frontend and the two backend modules compile and their 14 existing install tests still pass.
- Both pairs run in the rust-test.yml multi-crate step (name and `-p` list), asserted by a new `testsKnownfixAndLaunchCrates` predicate with an omission mutation; the lockfile list gained only the four workspace names (no third-party crate).
- The one-way rule is proven by `cargo tree`: no path from gamelib-wine or gamelib-engine to either new crate; neither new crate reaches keyring or tauri.

## Task Commits

1. **Task 1: Tracer, scaffold the four crates, register them, print the catalogue from the CLI** - `755fe601e` (feat)
2. **Task 2: Catalogue equality test and dispatch contract tests** - `c8aac17d2` (test)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `src-tauri/crates/gamelib-knownfix/` - lib (OPS, dispatch, guarded, decode, dispatch_sync), ctx, catalogue
- `src-tauri/crates/gamelib-knownfix-cli/` - `ops` and `op` front end over a FakeHome-testable context, plus `tests/cli.rs`
- `src-tauri/crates/gamelib-launch/` and `gamelib-launch-cli/` - the skeleton with an empty op list
- `src/common/knownFixOverlayCatalogue.json` - the shared pins (targetEnv and entries)
- `src/common/knownFixOverlayCatalogue.ts` - reads the JSON; throws at load on an empty catalogue
- `src/common/__tests__/knownFixOverlayCatalogue.test.ts` - equality, URL literals, own-id lookup, mutation self-test
- `src-tauri/Cargo.toml`, `Cargo.lock`, `.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts`, `src/backend/__tests__/cargoFeatures.test.ts`, `src-tauri/crates/README.md`, `.prettierignore` - registrations

## Decisions Made

See `key-decisions` above. In short: entries as an ordered array; both sides fail closed on an empty catalogue; dependencies for later plans declared now with a per-line reason; the CLIs take the relay URL and app version as flags so no environment is read.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gamelib-launch needs gamelib-store as a dev-dependency**
- **Found during:** Task 2 (the launch lib tests build an `EngineCtx` over a `StoreHost`)
- **Issue:** the plan's dependency list for gamelib-launch omits gamelib-store, so the test module did not compile
- **Fix:** added `gamelib-store` under `[dev-dependencies]` with a comment (the CLI already depends on it)
- **Files modified:** src-tauri/crates/gamelib-launch/Cargo.toml, src-tauri/Cargo.lock
- **Verification:** `cargo test -p gamelib-launch --lib` 7 passed; cargo tree still shows no keyring or tauri
- **Committed in:** c8aac17d2

### Plan-text corrections (no code impact)

- **The `.prettierignore` path in Task 1's `<verify>` prettier line** has no prettier parser ("No parser could be inferred"), so `npx prettier --check` errors on it rather than passing. It was dropped from the check; the other six paths each report `ignored: false` and pass.
- **TDD RED not obtainable for Task 2.** The task is `tdd="true"`, but the plan orders it after the tracer, which already ships every behaviour Task 2 pins (dispatch contract, URL builders, JSON view). The new tests therefore passed on first run and no separate failing-test commit exists. In place of RED, non-vacuity was proven by mutation, each reverted afterwards: changing the Rust archive URL path, disabling the wrong-thread guard, renaming the `:shutdown` and `:panic` answers made 4 of the 10 knownfix tests fail; changing the TS archive URL made the jest URL test fail; inflating `archiveSize` in the TS view made the equality test fail. This is not a `type: tdd` plan, so no TDD Gate Compliance violation is recorded against the gate sequence.

---

**Total deviations:** 1 auto-fixed (1 blocking), 2 plan-text corrections
**Impact on plan:** none on scope; the one code fix is a missing test-only dev-dependency.

## Issues Encountered

None beyond the above. The gamelib-shell package was not built or tested here: it now lists the two new crates as path dependencies (as the plan requires), which resolved in `Cargo.lock`, but a full Tauri build was not part of the plan's verify.

## Known Stubs

None. `gamelib-launch`'s empty `OPS` and its `route` returning `unknown op` are the documented contract for the skeleton (88.1 adds the first op), not a stub hiding data. `gamelib-knownfix`'s `decode` carries `#[allow(dead_code)]` until the next plan's first op uses it.

## Threat Flags

None. The only new trust-boundary surface, the overlay pins, is the plan's own T-88-06, mitigated by the shared JSON and its equality test; the tree assertions for T-88-07 pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88.1 can add its first op to `gamelib-launch` (`OPS`, a `route` arm) and further modules to `gamelib-knownfix` without touching CI or the workspace.
- The first CI run of rust-test.yml is the only proof for the Windows and Linux legs (coverage item D6).

## Self-Check: PASSED

All 15 created files exist on disk; commits `755fe601e` and `c8aac17d2` are ancestors of HEAD; the plan verification (cargo test, clippy -D warnings, fmt, cargo tree assertions, jest on the workflow, lockfile and catalogue tests, `pnpm codecheck`, prettier over the six parsed paths) passes.

---
*Phase: 88-launch-pipeline*
*Completed: 2026-11-24*
