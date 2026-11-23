---
phase: 87-engine-wine-and-tools
plan: 39
subsystem: wine
tags: [rust, gamelib-engine, bottles, cxbottle, wineserver, gamelib-safety, d-19, d-24, twin, golden]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the 87-11 bottle goldens (create-crossover, kill, remove-created) and bottle_twin.json, the bottle state primitives and EngineCtx (87-38), the D-24 twin twin.ts (87-28), gamelib_safety remove_tree (Phase 82)
provides:
  - gamelib_engine::bottles::lifecycle::{create_crossover_bottle, kill_bottle_wineserver, remove_created_bottle_dir, CreateOptions, CreateBottleResult, RemoveCreated}
  - ops engine_bottle_create_crossover, engine_bottle_kill_wineserver, engine_bottle_remove_created
  - golden_bottles.rs replays 21 more goldens (12 create-crossover, 5 kill, 4 remove-created) with the spawn trace and the per-spawn time limit and cancel wiring compared
  - twin.ts holds the bridge's sync bottle helpers once, re-exported by bottlePrimitives, engineSwitch, fallbackEngine and enginePins; ENGINE_PINS/pinById read src/common/enginePins.json
  - bottle_twin.json (216 vectors, 8 groups) replayed by twinVectors.test.ts and twin_vectors.rs
affects: [87-40, 87-42, 87-43, 87-56]

actuals:
  tokens: 36500
  tasks: 2
  commits: 3

plan_head_before: e71e0c91c070f2ad8fc7e87aebb87be3da752715
plan_head_after: 4eaf54e0b8639627cd8dd1162fbe29c3ddc09c66

tech-stack:
  added: []
  patterns:
    - "a destructive delete is name-checked (one clean segment directly under the root) and then goes through gamelib_safety remove_tree with the root as trust root and known_installs Some(empty): the guard is a second layer, never the only one"
    - "a lifecycle golden replays through a scripted SpecRunner wrapped with a one-shot effect (what cxbottle leaves behind, or a cancel that fires mid-run) and records each spawn's timeout and cancel wiring next to the argv and env diff"
    - "a sync TS helper shared by a read-only view and a still-TS writer is exported from the twin as an intra-phase schedule row (deletedBy 87), as perGameBottleName was"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/bottles/lifecycle.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/bottles/mod.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/pins.rs
    - src-tauri/crates/gamelib-engine/tests/golden_bottles.rs
    - src-tauri/crates/gamelib-engine/tests/twin_vectors.rs
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/bottles/deltas.json
    - src/backend/enginewine/twin.ts
    - src/backend/enginewine/__tests__/twinVectors.test.ts
    - src/backend/engine/bottlePrimitives.ts
    - src/backend/engine/engineSwitch.ts
    - src/backend/engine/fallbackEngine.ts
    - src/backend/engine/enginePins.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - src/backend/engine/__tests__/engineSwitch.test.ts
    - src/backend/engine/__tests__/engineConfig.test.ts
    - src/backend/engine/__tests__/oracle/fallbackEngine.oracle.test.ts

key-decisions:
  - "Removal refuses before it asks the guard: a name that is not one clean segment directly under the Bottles root (so '.', '..', separators, padding, NUL) logs a warning and deletes nothing; the guard (Bottle target, trust root = the Bottles directory, known_installs Some(empty), protected root = the home) is the second layer. A symlinked bottle is unlinked and its referent untouched; an unresolvable Bottles root answers unknown and deletes nothing (Rust tests)."
  - "The kill and the create take the cancel differently on purpose: the create spawn carries the caller's cancel token and a 120 s cap, the kill carries none (a kill must still run for a cancelled create) and a 15 s cap. The ops pass no token (only an app shutdown cancels early); the token is a library parameter for 87-40 and 87-42."
  - "Real-profile arm of the two-profile rule: kill_bottle_wineserver inherits the real environment and sets only the caller's extra variables and WINEPREFIX (any WINEPREFIX in extra_env is dropped), named and justified in the function's doc comment (T-87-82)."
  - "A failed spawn is told apart from a timeout by SpecOutput.timed_out (the TS used code === null for the timeout and a catch for the spawn): timed_out is the timeout error code, anything else with no exit code is the 'threw' path carrying the runner's stderr."
  - "The removal's refusal log names the quoted bottle name, not the resolved path (T-86-15), so the replay maps each golden path line to the name in the same position; three deltas are recorded in deltas.json (removal log, removal through the guard, spawn-failure wording)."
  - "twin.ts exports six helpers beyond the plan's ten names (readEngineMarker, hasStagingDxvk, isContradictedCrossover, isInside, pinMarkerMatches, pinnedEnginePaths) because the still-TS marker writer and installer share them with the readers and the schedule test enforces export/row set equality; they are deletedBy 87 rows 87-56 makes private."
  - "isPinnedEngineInstalled in the twin takes the pinned-engine root and the pin (a pure reader over .gamelib-pin.json); FallbackEngine's method delegates to it, so no caller changes."

patterns-established:
  - "a TS module that re-exports a table through `export ... from` cannot have that property replaced by jest.replaceProperty: tests that swap the pin table now replace it on the twin's own export"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "CrossOver bottle creation, the wineserver kill and the guarded removal replay all 21 87-11 goldens in Rust: outcome, logs, before and after trees (a sibling bottle byte-identical), the spawn argv and env diff, the per-spawn timeout and whether a cancel token is wired"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/golden_bottles.rs#every_lifecycle_golden_replays (21 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Removal never touches a sibling: a name that climbs or names the root is refused, a symlink aimed at a sibling bottle is unlinked with the sibling intact, a Bottles root that cannot be resolved deletes nothing, a sibling directory and a directory whose name starts with the root's are untouched; no remove_dir_all in bottles/*.rs"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-engine --lib bottles::lifecycle (a_name_that_climbs_or_names_the_root_deletes_nothing, a_bottle_that_is_a_symlink_to_a_sibling_bottle_is_unlinked_and_the_sibling_survives, an_unresolvable_bottles_root_is_unknown_and_deletes_nothing and 3 more)"
        status: pass
      - kind: other
        ref: "grep -c remove_dir_all src-tauri/crates/gamelib-engine/src/bottles/*.rs (0 in every file)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The three ops take strict arguments (an absolute program, a clean env, a bounded cap) and spawn through the context's runner as helpers"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/src/lib.rs (the_remove_op_deletes_only_the_named_bottle_and_refuses_an_unsafe_name, the_kill_and_create_ops_take_strict_arguments, the_create_and_kill_ops_spawn_through_the_context_runner)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The bridge's sync bottle helpers live once in twin.ts and answer all 216 bottle_twin.json vectors in TS (twinVectors.test.ts) and in Rust (twin_vectors.rs); the old modules re-export them and the schedule rows are in place"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/enginewine/__tests__/twinVectors.test.ts (twin vectors (bottle_twin.json), 10 tests)"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/twin_vectors.rs (bottle_twin::every_recorded_bottle_vector_replays_against_the_rust_functions)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts (30 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The whole backend still passes through the re-exports: 628 suites, 15083 tests"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "pnpm exec jest src/backend src/common"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real CrossOver bottle created, killed and removed on a Mac through the Rust ops (no TS caller is switched yet, D-06; 87-42 switches the bottle callers)"
    verification: []
    human_judgment: true
    rationale: "The goldens replay a scripted cxbottle and wineserver; nothing here runs CrossOver. The live check belongs to the plan that switches the callers."

duration: 23min
completed: 2026-11-23
---

# Phase 87 Plan 39: Bottle lifecycle in Rust and the bridge's bottle twin Summary

**gamelib-engine now creates CrossOver bottles, kills their wineserver and removes a created bottle only through a name check plus gamelib-safety `remove_tree` with the Bottles trust root (21 goldens replay, spawn traces and time limits included), and the bridge's sync bottle helpers live once in `twin.ts` with all 216 `bottle_twin.json` vectors replayed in TS and Rust.**

## Performance

- **Duration:** about 23 min
- **Completed:** 2026-11-23
- **Tasks:** 2 of 2 (Task 1 a tracer; its `<verify>` is automated only, so no checkpoint)
- **Files:** 17 changed in the three code commits (2599 insertions, 424 deletions)

## Accomplishments

- **Tracer (Task 1):** `bottles::lifecycle` with `create_crossover_bottle` (`cxbottle --create --bottle <name> --template win10_64`, label `engine-cxbottle`, 120 s cap, cancel token), `kill_bottle_wineserver` (label `engine-wineserver-kill`, 15 s cap, the declared real-profile env arm) and `remove_created_bottle_dir` (name check, then `remove_tree`). Ops `engine_bottle_create_crossover`, `engine_bottle_kill_wineserver` and `engine_bottle_remove_created`. `golden_bottles.rs` replays the 12 create, 5 kill and 4 removal goldens against a scripted runner wrapped with a one-shot effect (what `cxbottle` leaves behind, or a cancel that fires mid-run), comparing the spawn argv and env diff and each spawn's timeout and cancel wiring.
- **Adversarial removal (FND-02):** Rust tests for a climbing or root-naming name, a bottle that is a symlink to a sibling bottle (unlinked, sibling intact), a Bottles root that is itself a symlink and one that dangles (`unknown`, nothing deleted), a sibling directory and a directory whose name starts with the root's.
- **Twin (Task 2):** `getBottleDir`, `sanitizeBottleName`, `isBottleProvisioned`, `buildFallbackGameSettings`, the three marker views, `isPinnedEngineInstalled` and `ENGINE_PINS`/`pinById` moved into `twin.ts`; `bottlePrimitives`, `engineSwitch`, `fallbackEngine` and `enginePins` re-export them, so no caller changed. `twinVectors.test.ts` and `twin_vectors.rs` replay the 216 vectors (the Rust side against `bottles::paths`, `bottles::marker`, `engines`, `pin_marker` and `tool_settings`). Ten twin schedule rows (`deletedBy` 96) and six intra-phase helper rows (`deletedBy` 87).
- **Non-vacuity:** a mutated kill argv (`-x`) failed the lifecycle goldens on the spawn trace and a mutated wineserver basename check failed the TS marker-summary vectors, each reverted. The replays carry count floors and an empty-list negative.

## Task Commits

1. **Task 1 (tracer): CrossOver bottle create, wineserver kill and sibling-safe removal in gamelib-engine, 21 lifecycle goldens replay** - `6397e4f76` (feat)
2. **Task 2: the bridge's sync bottle helpers live once in the D-24 twin, bottle_twin.json replayed in both languages** - `8b08734b4` (feat)
3. **pins.rs doc names the twin as the TS reader of enginePins.json** - `4eaf54e0b` (docs)

## Verification

- Task 1: `cargo test -p gamelib-engine --features testing --test golden_bottles` (13 passed), `cargo test -p gamelib-engine bottles::` (the lib binary's bottles tests, 10 of them the lifecycle unit tests), clippy `-D warnings` and `cargo fmt --check` clean. Acceptance: 146 cases in the MANIFEST (at or above 15); `remove_dir_all` count 0 in every `bottles/*.rs`.
- Task 2: the plan's jest chain (174 passed), `twin_vectors` (6 passed), `pnpm codecheck`, `npx prettier --check` over the eight paths it names plus the three tests I touched. Acceptance: `export function getBottleDir` is 1 in `twin.ts` and 0 in `bottlePrimitives.ts`.
- Beyond the plan: the whole `src/backend` and `src/common` jest tree (628 suites passed) and `pnpm lint` (0 errors).
- Not run: a live Mac run of CrossOver (no TS caller is switched, D-06); `cargo test` on Windows or Linux (the lifecycle goldens are `cfg(unix)`, as the 87-38 ones).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tests that mocked what moved**
- **Found during:** Task 2
- **Issue:** `engineSwitch.test.ts` mocked `bottlePrimitives.getBottleDir` to a temp directory, which the read-only views no longer reach (they moved into the twin); `engineConfig.test.ts` mocked `../enginePins` through `requireActual('../enginePins')`, which now loads the twin, which loads `engineIds`, which loads that same mock mid-factory (undefined table); `fallbackEngine.oracle.test.ts` replaced `ENGINE_PINS` on a module that now re-exports it through a getter (`jest.replaceProperty` cannot replace a getter). 39 tests failed until each followed the table.
- **Fix:** the switch test lays its bottles under a fake home's real Bottles directory and mocks `bottlePrimitives` with the twin's own functions; the config test builds its mock from `common/enginePins.json`; the oracle replaces the table on the twin's export. No production behaviour changed.
- **Files modified:** `engineSwitch.test.ts`, `engineConfig.test.ts`, `oracle/fallbackEngine.oracle.test.ts` (none in the plan's list)
- **Commit:** `8b08734b4`

**2. [Rule 3 - Blocking] Six twin exports the plan did not name**
- **Found during:** Task 2
- **Issue:** the still-TS marker writer (`engineSwitch.ts`) and the installer (`fallbackEngine.ts`) share `readMarker`, `hasStagingDxvk`, `isContradictedCrossover`, `isInside`, the pin-marker check and the pinned-engine layout with the readers being moved. The schedule test enforces set equality between twin exports and rows, so either a second TS copy or extra exports were needed; a second copy would break the twin's "once" contract.
- **Fix:** exported them from `twin.ts` as `readEngineMarker`, `hasStagingDxvk`, `isContradictedCrossover`, `isInside`, `pinMarkerMatches` and `pinnedEnginePaths` with six `deletedBy: 87` rows (the `perGameBottleName` precedent); 87-56 makes them private when the TS callers go. `isPinnedEngineInstalled` takes `(root, pin)`.
- **Files modified:** `twin.ts`, `engineWineShimSchedule.test.ts`
- **Commit:** `8b08734b4`

**3. [Rule 3 - Blocking] The Rust replay needs its own fixture harness and the plan's file list omits deltas.json and pins.rs**
- **Found during:** Tasks 1 and 2
- **Issue:** `twin_vectors.rs` is a separate test crate from `golden_bottles.rs`, so the fake-profile layout is re-stated there; the documented behaviour differences (`deltas.json`) and the stale `pins.rs` doc needed edits the plan does not list.
- **Fix:** a compact `Profile` in `twin_vectors.rs`; three deltas recorded (below); one doc comment.
- **Files modified:** `tests/twin_vectors.rs`, `tests/fixtures/golden/bottles/deltas.json`, `src/pins.rs`
- **Commit:** `6397e4f76`, `8b08734b4`, `4eaf54e0b`

**4. [Rule 2 - Missing critical] Strict op arguments**
- **Found during:** Task 1
- **Issue:** the kill op spawns a program and sets an environment from op arguments, which a sidecar or renderer string can reach (T-87-82).
- **Fix:** `engine_bottle_kill_wineserver` and `engine_bottle_create_crossover` refuse a relative program or bin directory, an env name that is empty or holds `=` or NUL, and a non-string value (`<op>:bad-args`); a requested cap is clamped to 300 s; unknown fields are refused.
- **Files modified:** `src/lib.rs`, `src/bottles/lifecycle.rs`
- **Commit:** `6397e4f76`

**Total deviations:** 4 (3 Rule 3, 1 Rule 2). **Impact on plan:** none on scope; deviation 2 adds six scheduled intra-phase rows for 87-56 to close.

### Behaviour differences from the TS (recorded in `golden/bottles/deltas.json`)

- `removal-refusal-names-the-bottle-not-its-path`: a refused removal logs the quoted name, not the resolved path (T-86-15). The replay maps each golden path line to the name in the same position.
- `removal-goes-through-the-safety-guard`: the TS deleted with `rmSync` after its relative check; the Rust function also asks `remove_tree`. No golden exercises the extra refusals; the Rust tests do.
- `spawn-failure-text-is-the-runners-not-nodes`: a failed spawn's error and log wording carries the runner's stderr, not Node's `Error: spawn ... ENOENT`. The replay scripts the failure with the golden's text.

## Issues Encountered

- The tracer's `bottles::` filter ran 0 tests in the last test binary of `cargo test -p gamelib-engine bottles::`; the lifecycle unit tests are in the lib binary and passed there.
- The trust root is defence in depth, not independently exercised: because the name check already pins the target to a direct child of the Bottles directory, a mutation that widened the trust root to the home directory still passed every test. The adversarial cases that matter (a symlinked bottle, an unresolvable root) are covered by the guard's own link and resolution rules.

## Known Stubs

None. `kill_bottle_wineserver`, `create_crossover_bottle` and `remove_created_bottle_dir` have no TS caller yet by design (D-06); the fallback creation that also calls the kill and removal is 87-40.

## Threat Flags

None. T-87-37 (sibling deletion) is mitigated as planned (name check, `remove_tree` with the Bottles trust root, refusal on `no` and `unknown`, the sibling-safe golden and the adversarial Rust tests); T-87-82 (spawns) as planned plus the strict op arguments of deviation 4; T-87-SC: no new crate (`tokio-util` and `gamelib-safety` are existing dependencies).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-40 ports the fallback bottle creation, the per-game flight and the switch: `kill_bottle_wineserver` and `remove_created_bottle_dir` are what its failure and abort paths call; the 27 `create-fallback` and `ensure` goldens are still in `LATER_OPS`.
- 87-42 and 87-43 switch and repoint the bottle callers; the re-exporting modules (`bottlePrimitives`, `engineSwitch` readers, `fallbackEngine`, `enginePins`) go then.
- `graphify update .` was run.

## Self-Check: PASSED

- FOUND: `src-tauri/crates/gamelib-engine/src/bottles/lifecycle.rs`, `src/backend/enginewine/twin.ts`
- FOUND: `6397e4f76`, `8b08734b4`, `4eaf54e0b` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 3)
