---
phase: 87-engine-wine-and-tools
plan: 48
subsystem: engine
tags: [rust, boot-sweep, shutdown-registrant, gamelib-safety, golden, sidecar-removal]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the fallback engine module and its guarded remove (87-47), the three sweep goldens (87-14), gamelib-safety (87-01)
provides:
  - gamelib_engine::fallback::prune::{sweep_stale_engine_temps, sweep_stale_engine_temps_at, spawn_engine_sweep, ENGINE_SWEEP_BOUND, Sweep}
  - the Rust boot start of the sweep (engine_dispatch::install -> start_engine_sweep)
  - the sidecar's engine temp sweep boot step removed (one owner at every commit)
affects: [87-50, 87-55, 87-56]

actuals:
  tokens: 7000
  tasks: 2
  commits: 2

plan_head_before: 59190dfb332ca59c299ab5f43227f01ccabcd9ab
plan_head_after: 63ea623d2b1133fb3f72e2df24cc0e6052704ced

tech-stack:
  added: []
  patterns:
    - "bounded boot task = a registrant taken synchronously before the spawn returns, a blocking worker holding it, a select over the bound and the shutdown token, one report of a word and a count; the worker keeps the registrant after an abandonment until it returns"
    - "a boot sweep that now runs beside the app (the TS ran before READY) lists first and reads the in-flight counters after, so a temp directory in the listing is either gone or still visible in the counters"

key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-engine/src/fallback/prune.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/tests/golden_fallback.rs
    - src-tauri/src/engine_dispatch.rs
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/engineTempSweepBootWire.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - meta/backendDiCeilings/sidecar-tests-boot.json

key-decisions:
  - "The sweep lists the engine root first and reads in_flight() and active_installs() after. The TS ran synchronously before READY so no install could hold a temp directory; the Rust task runs beside the app, and this order is what keeps it from deleting a fresh install's directory (an install raises its counter before it creates its temp directory)."
  - "The shell logs one line, 'engine temp sweep: <word> (removed <n>)', through shell_log. No shell EngineLog was wired: it would send every engine line (some may carry paths) to the uploaded gamelib.log, a privacy decision that belongs to the plan that ports those lines. The count is what the TS 'removed N stale engine temp dir(s)' line carried."
  - "The TS test is kept as a source-text assertion (no jest.mock) that the sidecar boot has neither the step nor a sweepStaleEngineTemps call, rather than deleted."

patterns-established:
  - "a boot task's report is (word, count): a category and a number, never a path or a name"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "D-19, SC1: the stale .tmp-<kind>-* sweep removes only real directories directly under <tools>/steam-engines through gamelib-safety (a .tmp-* file and a .tmp-* symlink stay; a target outside the root is refused); the three boot-sweep goldens replay, so all 39 fallback goldens now do"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-engine/tests/golden_fallback.rs#every_fallback_golden_replays (39 cases, floor 39)"
        status: pass
      - kind: unit
        ref: "src/fallback/prune.rs tests: the_sweep_removes_only_stale_temp_directories_and_logs_the_count, the_sweep_guard_refuses_a_temp_named_directory_outside_the_engine_root, a_symlinked_engine_root_is_resolved_and_its_stale_temps_are_swept"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-17: the boot sweep is bounded work with one owner: it holds an engine-temp-sweep registrant, is abandoned after ENGINE_SWEEP_BOUND with one word and still releases the registrant when the worker returns, is not started once the application is exiting, stops between directories at a quit, and reports a panic; the sidecar step is removed in the same commit as the Rust start"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "prune.rs: a_sweep_past_its_bound_is_abandoned_with_one_word_and_still_releases_its_registrant, a_sweep_is_not_started_once_the_application_is_exiting, a_sweep_stops_between_directories_when_the_application_exits, a_panicking_sweep_reports_panic_and_releases_its_registrant, the_spawned_sweep_reports_one_word_and_releases_its_registrant"
        status: pass
      - kind: unit
        ref: "src-tauri/src/engine_dispatch.rs#the_boot_sweep_logs_one_line_with_a_word_and_a_count_and_nothing_else"
        status: pass
      - kind: command
        ref: "grep -c \"'engine-temp-sweep'\" src/backend/sidecar/bootstrap.ts == 0; engineTempSweepBootWire.test.ts and bootSourceShape.test.ts pass"
        status: pass
    human_judgment: false
  - id: D3
    description: "A live boot on the operator's Mac with a stranded .tmp-* engine directory (the sweep running from the real shell, its line in gamelib.log, a quit during the sweep) is not exercised: the shell test builds a context over a fake profile and calls start_engine_sweep, but install itself needs an AppHandle"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "No headless test builds an AppHandle; the live check belongs to the Mac run owed after the switch-over (87-50 onward). The one-owner property itself is held by the source assertion."

duration: not recorded (start time was not captured; the commits landed 2026-11-23 by the host clock)
completed: 2026-11-24
---

# Phase 87 Plan 48: The engine temp sweep as a bounded Rust boot task Summary

**The stale `steam-engines/.tmp-*` sweep moved from the sidecar to Rust in one commit: a guarded sweep (list first, in-flight counters after), a bounded spawn holding an `engine-temp-sweep` registrant, started from `engine_dispatch::install`, with the TS boot step removed; all 39 fallback goldens now replay.**

## Accomplishments

- **Task 1 (tracer):** `sweep_stale_engine_temps(_at)` removes `.tmp-*` real directories directly under the engine root through `remove_guarded` (gamelib-safety, trust root `<tools>/steam-engines`, refusing on `unknown`; no std recursive delete). `spawn_engine_sweep(ctx, ENGINE_SWEEP_BOUND (10 s), report)` runs it in `spawn_blocking` on the engine crate's runtime with the registrant taken before it returns, and reports one word and a count (`done`, `timeout`, `shutdown`, `panic`). The three sweep goldens replay in `golden_fallback.rs` (the `sweep` and `sweep-inflight` ops; the in-flight case starts a real flight, polls it once so it has joined, calls the sweep, and asserts `Skipped`). The tracer `<verify>` is automated only, so it was re-run end to end before Task 2 (fallback tests, clippy, fmt) and passed; no checkpoint.
- **Task 2:** `engine_dispatch::install` starts the sweep when the context is set (first `set` only); the report becomes `engine temp sweep: <word> (removed <n>)`. In the same commit `bootstrap.ts` loses the step and its name in `BOOT_STEP_NAMES`, and `engineTempSweepBootWire.test.ts` now asserts the step and any `sweepStaleEngineTemps` call are absent. No todo was edited (the single-stream todo was closed by quick 261123-txk).
- **Mutation evidence:** making the sweep ignore the in-flight counters turned the replay red (`left: Swept { removed: 1 }, right: Skipped`); reverted before the commit.

## Task Commits

1. **Task 1 (tracer): the stale engine-temp sweep as a bounded Rust boot task, golden-matched** - `69cfdc0bd` (feat)
2. **Task 2: start the engine temp sweep from Rust at boot and drop the sidecar step** - `63ea623d2` (feat)

## Decisions Made

See `key-decisions`: list-then-check ordering, the count-only shell line (no shell `EngineLog`), the TS test kept as a source assertion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Files outside the plan's list**
- **Found during:** Tasks 1 and 2
- **Issue:** the engine crate's `runtime()` was private to `lib.rs` (the spawn needs it); the replay file excluded the sweep cases by design; and `pnpm backend-di-ceilings` failed on `meta/backendDiCeilings/sidecar-tests-boot.json` ("stale baseline entry ... no sites left") once the old test dropped its two `jest.mock` calls. `testContainment.test.ts`'s prose described the removed mocks.
- **Fix:** `runtime()` made `pub(crate)`; the golden replay now runs all 39 cases; the stale baseline entry removed; the containment comment updated (the file name stays in its classified list).
- **Files modified:** `src-tauri/crates/gamelib-engine/src/lib.rs`, `src-tauri/crates/gamelib-engine/tests/golden_fallback.rs`, `meta/backendDiCeilings/sidecar-tests-boot.json`, `src/backend/sidecar/__tests__/testContainment.test.ts`
- **Commits:** `69cfdc0bd`, `63ea623d2`

**2. [Rule 1 - Bug] A Rust sweep beside the app could race an install**
- **Found during:** Task 1
- **Issue:** the TS "skip while in flight" check was safe only because it ran before READY; copied as is, a download starting between the check and the deletes would lose its fresh temp directory.
- **Fix:** list first, read the counters after (see `key-decisions`); a unit test and the in-flight golden pin the skip.
- **Commit:** `69cfdc0bd`

**3. [Rule 2 - Missing critical] A quit stops the sweep between directories**
- **Fix:** the sweep checks the shutdown token before each directory (`Sweep::Stopped`), so an exit does not wait for the rest of a long list.
- **Commit:** `69cfdc0bd`

**Total deviations:** 3 (1 Rule 3, 1 Rule 1, 1 Rule 2). **Impact:** none on the goals.

## Issues Encountered

- The shell has no `EngineLog`, so the sweep's own lines (`Engine: removed N ...`, refusal warnings) go to a `None` log in the app; the one `shell_log` line carries the count instead. Wiring an engine log into `gamelib.log` is left to the plan that decides what engine lines may carry (see `key-decisions`).
- Two pre-existing snake-case warnings in the shell test build (`wake_lock_*`, `the_keyring_*`), not from this plan.

## Known Stubs

None.

## Threat Flags

None. T-87-49 is mitigated as planned (bounded boot task with a registrant, abandoned after the bound, stops at a quit; the download's registrant and quit-cancel were delivered in 87-47); T-87-SC accepted (no new crate, `Cargo.lock` untouched).

## Self-Check: PASSED

- Commits `69cfdc0bd` and `63ea623d2` are ancestors of HEAD; `commits: 2` measured from the ledger base `59190dfb3`.
- `cargo test -p gamelib-engine --features testing` passes (145 lib tests, `golden_fallback` 8 with all 39 cases); `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-engine --check` pass; `cargo test --bin gamelib-shell engine_dispatch` passes (25); `rustfmt --edition 2021 --check src/engine_dispatch.rs` passes.
- `grep -c "'engine-temp-sweep'" src/backend/sidecar/bootstrap.ts` is 0; jest `bootSourceShape`, `bootstrap`, `engineTempSweepBootWire`, `testContainment`, `shellLogCategoryOnly`, `tauriShellSource`, `loggerPortComplete` pass; `pnpm codecheck`, `pnpm planning-gates` (12/12) and `pnpm backend-di-ceilings` pass; `npx prettier --check` over the four TS and JSON files written passes (none is prettier-ignored).

## Next Phase Readiness

Ready for 87-49. Still live in TS until 87-56: `engine/fallbackEngine.ts` (its `sweepStaleEngineTemps` is now uncalled outside its own tests), `bottleLedger`, `engineRegistry`, `perGameBottle`, `gamePrefix`, `pinEngine.ts`. The live first-need download, the sweep from the real shell, and `CtxPerGameDeps::ensure_pin` are owed to 87-50 onward.

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
