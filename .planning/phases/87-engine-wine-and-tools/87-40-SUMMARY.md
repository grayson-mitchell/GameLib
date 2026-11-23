---
phase: 87-engine-wine-and-tools
plan: 40
subsystem: wine
tags: [rust, gamelib-engine, engine-switch, fallback-bottle, per-game-bottle, single-flight, d-07, d-17, golden]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the 87-16 switch goldens (73), the 87-11 createFallbackBottle and ensure goldens (27), bottle marker and state primitives (87-38), bottle lifecycle ops and the twin (87-39), EngineCtx and the DxvkInstaller seam (87-06, 87-25)
provides:
  - gamelib_engine::bottles::switch::{prepare_bottle_for_engine, prepare_bottle_for_engine_with, PrepareArgs, PrepareResult, PrepareOutcome, PrepareReason, MonitorPhase, OwnBottle}
  - gamelib_engine::bottles::fallback_bottle::{create_fallback_bottle, create_fallback_bottle_with}
  - gamelib_engine::bottles::per_game::{per_game_bottle_name, ensure_per_game_bottle, PerGameDeps, CtxPerGameDeps, PerGameFlights, CreationDecision, PinOutcome, EnsureOutcome}
  - EngineCtx.flights (the per-bottle-name single flight, in memory only)
  - ops engine_bottle_prepare, engine_bottle_create_fallback, engine_bottle_ensure_per_game (strict arguments; an engine the sidecar names must sit inside the engine roots)
  - golden_switch.rs replays 50 of the 73 switch goldens; golden_bottles.rs replays the 27 fallback and ensure goldens (spawn trace, time limits and cancel wiring, installer requests)
affects: [87-41, 87-42, 87-43, 87-56]

actuals:
  tokens: 42400
  tasks: 2
  commits: 2

plan_head_before: 71535ba991d267b56eedc504508e37a494339a35
plan_head_after: c3ddfc3c27cf86ae7c1286c4d2dafcf244d7ef6a

tech-stack:
  added: []
  patterns:
    - "a TS callback is a value in a Rust args struct, or a method of a small deps trait the context implements (CtxPerGameDeps) and a test replaces; the gate the marker writers ask is a `Send + Sync` parameter so the switch future stays `Send`"
    - "single flight per key over `tokio::sync::watch`: the leader runs and publishes its answer, a follower waits on the receiver, a guard removes the entry however the leader ends, and a follower whose leader was dropped starts a flight of its own"
    - "a golden whose process is scripted records its ordered effects (switching, each wineserver stop, each installer call) in one timeline, and a scripted runner yields once before it answers so two callers started together really overlap"
    - "a case list this build cannot replay is named in a `LATER` list that is checked both ways (every listed case must still be unreplayable, every other case must replay)"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/bottles/switch.rs
    - src-tauri/crates/gamelib-engine/src/bottles/fallback_bottle.rs
    - src-tauri/crates/gamelib-engine/src/bottles/per_game.rs
    - src-tauri/crates/gamelib-engine/tests/golden_switch.rs
    - src-tauri/crates/gamelib-engine/tests/common/mod.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-engine/src/bottles/mod.rs
    - src-tauri/crates/gamelib-engine/src/bottles/marker.rs
    - src-tauri/crates/gamelib-engine/src/bottles/paths.rs
    - src-tauri/crates/gamelib-engine/src/bottles/lifecycle.rs
    - src-tauri/crates/gamelib-engine/src/bottles/registry.rs
    - src-tauri/crates/gamelib-engine/tests/golden_bottles.rs
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/bottles/deltas.json

key-decisions:
  - "The switch ports every branch except the CrossOver restore and the per-bottle serialisation, not only crossover->pin: the refusals, the same-engine no-op, the failed-DXVK retry, the previous wineserver stop and the DXVK install all share the tracer path, so 50 of the 73 goldens replay. A switch to CrossOver that needs the DXVK restore answers `restore-pending` BEFORE anything is stopped, installed or written (a unit test pins that), so the unported branch can never half-switch a bottle."
  - "`selection` is returned in the result and `PrepareArgs.register_selection` (off by default) records it in `ctx.registry`. The plan's truth says the switch 'sets the registry selection'; the TS switch never touched the registry (its callers do) and the goldens' logs carry no registry line, so registering by default would change the log. Recorded as a deviation."
  - "`cancel_id` is not a PrepareArgs field: the TS prepare has no cancel (the wineserver stop and the DXVK install take none); only the app shutdown (the `guarded` op wrapper) ends a switch early. The fallback creation and the ensure do take a cancel token."
  - "An engine the sidecar names (engine_bottle_prepare `next`, engine_bottle_create_fallback `engine`) must have its Wine and wineserver inside the pinned-engine root or `<tools>/wine`, and its DXVK inside the pinned-engine root, because the DXVK installer and the creation spawn them (T-87-82). Every installed engine already sits there."
  - "`create_fallback_bottle` refuses an unclean name outright. The TS had no check of its own (only its wineserver kill refused one), so `a/b` would have run wineboot at a path outside the Bottles root."
  - "The DXVK installer trait answers a bool, so a TS 'installer throws' becomes a panic caught around the call and reported with the TS wording after the cleanup; recorded in `golden/bottles/deltas.json` (installer-answers-a-bool-and-a-throw-is-a-panic)."
  - "`CtxPerGameDeps` fails a pinned engine that is not installed as `engine-download-failed` and never downloads: the pinned-engine download and the creation decision are later plans'."

patterns-established:
  - "a gate parameter shared by marker writers is `Send + Sync` once an async fn holds it across an await"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "The crossover->pin switch replays in Rust: the CrossOver wineserver is stopped (CX_ROOT, 15 s) before DXVK is installed through ctx.dxvk, the marker names the pin and its DXVK copy, and the outcome, ordered effects, marker bytes, tree diff, logs, spawn trace and limits and installer request all equal the 87-16 golden"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/golden_switch.rs#the_crossover_to_pin_tracer_replays"
        status: pass
    human_judgment: false
  - id: D2
    description: "50 of the 73 switch goldens replay: every refusal (invalid bottle, game starting or running, newer marker, shared bottle, bottle busy), the same-engine and failed-DXVK retry paths, the unreadable, contradicted, bad-id and legacy markers, pin to Wine Manager and back to the pin, the DXVK install failing three ways and the stop timing out or failing to spawn; a newer marker's bytes are unchanged. The 23 left (6 concurrent interleaves, 17 that restore CrossOver's stack) are named in LATER and checked both ways"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "golden_switch.rs#every_switch_golden_this_build_ports_replays, #the_later_list_names_exactly_the_cases_this_build_cannot_replay"
        status: pass
    human_judgment: false
  - id: D3
    description: "createFallbackBottle replays all 16 goldens: wineboot -i (180 s) and wineserver -w (60 s) with USER=crossover, WINEDLLOVERRIDES=mshtml=, WINEDEBUG=-all, MVK_CONFIG_LOG_LEVEL=0 and the creation's cancel, DXVK through the trait, the conf last, the stops with no cancel, cleanup of only what the call created, a cancel from inside a spawn or the installer"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/golden_bottles.rs#every_fallback_golden_replays (27 cases with ensure)"
        status: pass
    human_judgment: false
  - id: D4
    description: "ensure_per_game_bottle replays the 11 ensure goldens, including two concurrent callers sharing one cxbottle process, ensure twice creating once, a CrossOver failure falling back to the pin and a cancelled CrossOver create staying final; a leader dropped mid-flight leaves its follower to start its own and the flight map empties"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "golden_bottles.rs#every_fallback_golden_replays; per_game.rs#a_follower_waits_for_the_leader_and_a_dropped_leader_leaves_it_a_flight_of_its_own"
        status: pass
    human_judgment: false
  - id: D5
    description: "The three ops take strict arguments: an unknown member, a key the runner and app name do not make, a pin the table lacks, settings that are not objects, a relative or out-of-root engine program and a DXVK directory outside the pinned engines are bad arguments and spawn nothing"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/src/lib.rs (the_prepare_op_switches_a_bottle_and_takes_strict_arguments, the_ensure_op_reuses_a_provisioned_bottle_and_takes_strict_arguments, the_create_fallback_op_refuses_an_engine_outside_the_engine_roots)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real bottle switched, created with the built-in engine and ensured on a Mac through the Rust ops, with a live CrossOver and a live wineserver (no TS caller is switched, D-06; 87-42 switches the callers)"
    verification: []
    human_judgment: true
    rationale: "The goldens replay a scripted wineserver, wineboot and DXVK installer; nothing here runs Wine. The live check belongs to the plan that switches the callers."

duration: not timed (start time was not captured)
completed: 2026-11-23
---

# Phase 87 Plan 40: Engine switch tracer, fallback bottle creation and per-game flights Summary

**gamelib-engine now switches a bottle's engine in Rust (kill the previous wineserver, DXVK through `ctx.dxvk`, marker through the version gate, with every refusal and the newer-marker rule; 50 of the 73 goldens replay), creates a bottle with the built-in engine (`wineboot -i` 180 s, `wineserver -w` 60 s, the recorded env, the conf last, cleanup of only what it created) and ensures a game's bottle once with a single flight per bottle name; the 27 fallback and ensure goldens replay with their spawn traces, limits and installer requests.**

## Performance

- **Tasks:** 2 of 2 (Task 1 a tracer; its `<verify>` is automated only, so it was re-run end to end and passed before Task 2, no checkpoint)
- **Files:** 14 changed in the two code commits (3767 insertions, 47 deletions)

## Accomplishments

- **Tracer (Task 1):** `bottles::switch` with `prepare_bottle_for_engine` and op `engine_bottle_prepare`. The monitor phase, the title's own bottle, the stored CrossOver settings and the global settings arrive as values in `PrepareArgs`; the wineserver stop goes through `ctx.proc`, DXVK through `ctx.dxvk`, CrossOver is found through `ctx.crossover_bin_dir`, the running games come from `ctx.ledger`. `golden_switch.rs` replays each case over a scripted spawn seam and a scripted DXVK installer and compares the outcomes, the ordered effects (switching, each stop, each installer call), the marker bytes before and after, the tree diff, the logs, the spawn trace and limits, the installer requests and the trees.
- **Fallback creation (Task 2):** `fallback_bottle::create_fallback_bottle` with `wineboot -i` and `wineserver -w` carrying the creation's cancel token and the TS env, the DXVK step through `ctx.dxvk` over `build_fallback_game_settings`, `cxbottle.conf` last, and the stops (15 s, no cancel) that end every path. A failure or a cancel stops the wineserver and removes the bottle directory only when this call created it.
- **Per-game flights (Task 2):** `per_game::ensure_per_game_bottle` over a `PerGameDeps` trait (the decision, CrossOver's `bin`, how the pin is made available, the global settings, the BottleID), a `watch`-based single flight in `EngineCtx.flights`, the CrossOver-then-pin fallback and a final cancel. `CtxPerGameDeps` is the context's own implementation.
- **Non-vacuity:** removing the previous wineserver stop failed the tracer and the replay; changing `WINEDLLOVERRIDES=mshtml=` failed the fallback goldens; each was reverted. Count floors (73 cases, 50 replayed, 27 fallback) and an empty-list negative live in the tests; a tampered marker fails the comparison.

## Task Commits

1. **Task 1 (tracer): the crossover to pin engine switch in gamelib-engine, 50 switch goldens replay** - `19d0ee061` (feat)
2. **Task 2: fallback bottle creation and per-game bottle flights in gamelib-engine, 27 goldens replay** - `c3ddfc3c2` (feat)

## Verification

- Task 1 chain: `cargo test -p gamelib-engine --features testing --test golden_switch` (6 passed), `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings`, `cargo fmt -p gamelib-engine --check`. Acceptance: the crossover->pin golden passes.
- Task 2 chain: the whole crate (104 lib, 24 fetch_replay, 14 golden_bottles, 7 golden_config, 6 golden_switch, 7 roundtrip_state, 6 twin_vectors), clippy and fmt clean; `cargo check -p gamelib-wine --all-targets` clean. Acceptance: the createFallbackBottle goldens pass with `USER=crossover` (and the other four variables) in their spawn traces.
- The Rust-only `<verify>` blocks carry no prettier check as the plan says (the written paths are Rust and fixture JSON that is prettier-ignored; `deltas.json` was checked with `--file-info`: ignored).
- Not run: a live Mac run (no TS caller is switched, D-06); `cargo test` on Windows or Linux (the goldens are `cfg(unix)`, as 87-38 and 87-39).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Files the plan does not list**
- **Found during:** Tasks 1 and 2
- **Issue:** the switch needs `marker::{identity_of, marker_path, current_pin_engine, has_staging_dxvk}`, `paths::lexical_resolve`, `lifecycle::{dirname, CreateBottleResult::failed}` and `EngineSelection::engine` from the 87-38 and 87-39 modules; the single flight needs a map in `EngineCtx` (`ctx.rs`); both golden replays need a shared fake profile; the ensure replay needs the case list in `golden_bottles.rs` (the plan allowed it) and `deltas.json`.
- **Fix:** visibility-only edits to the five 87-38 and 87-39 modules, `EngineCtx.flights`, `tests/common/mod.rs` (the oracle's profile, the tree snapshot and the floor guard, used by `golden_switch.rs`; `golden_bottles.rs` keeps its own copy as `twin_vectors.rs` does), one delta in `deltas.json`.
- **Files modified:** `bottles/{marker,paths,lifecycle,registry,mod}.rs`, `ctx.rs`, `tests/common/mod.rs`, `tests/golden_bottles.rs`, `tests/fixtures/golden/bottles/deltas.json`
- **Commit:** `19d0ee061`, `c3ddfc3c2`

**2. [Plan conflict] "the registry selection set" and `cancel_id`**
- **Found during:** Task 1
- **Issue:** the plan's truth says the crossover->pin path sets the registry selection and lists `cancel_id` in `PrepareArgs`. The TS `prepareBottleForEngine` never touches the registry (its callers set it) and has no cancel; the golden's logs carry no registry line (`setEngineSelection` logs `Engine: <key> uses ...`), so setting it by default would change the replayed log.
- **Fix:** the result carries `selection` (the engine the bottle is now on) and `PrepareArgs.register_selection` records it in `ctx.registry` when a caller asks (unit-tested); no `cancel_id`. The launch plan (87-42, 87-43) registers as the TS callers did.
- **Files modified:** `bottles/switch.rs`

**3. [Rule 2 - Missing critical] Strict, rooted engine arguments; unsafe name refused**
- **Found during:** Tasks 1 and 2
- **Issue:** `engine_bottle_prepare` and `engine_bottle_create_fallback` take an engine from the sidecar whose Wine, wineserver and DXVK directory get spawned or installed from (T-87-82); the TS `createFallbackBottle` accepted any name and would run wineboot at a path outside the Bottles root.
- **Fix:** the ops require the Wine and wineserver inside the pinned-engine root or `<tools>/wine` and the DXVK inside the pinned-engine root (`bad-args`, nothing spawned); `create_fallback_bottle` refuses an unclean name with `Invalid bottle name` and spawns nothing; the ensure op requires the key to be the runner's and app name's and the pin to be in the table.
- **Files modified:** `src/lib.rs`, `bottles/fallback_bottle.rs`
- **Commit:** `19d0ee061`, `c3ddfc3c2`

**4. [Scope] The switch replays more than the tracer, and the G30 restore note is not touched here**
- **Found during:** Task 1
- **Issue:** the plan scopes this build to the tracer path and leaves every other branch to 87-41. Every branch except the restore shares the tracer's code, so it was cheaper and safer to port them together than to ship an incomplete function. The plan's truth about "the DXVK restore leaves the G30 wineserver note's behaviour unchanged" names the restore branch, which stays 87-41's.
- **Fix:** the whole body is ported except the restore and the serialisation (50 goldens replay); a switch that would restore answers `restore-pending` before touching anything. The 23 cases left (6 concurrent, 17 restoring) are the `LATER` list in `golden_switch.rs`; 87-41 empties it.
- **Files modified:** `bottles/switch.rs`, `tests/golden_switch.rs`

**5. [Documented delta] The DXVK installer cannot throw**
- **Found during:** Task 2
- **Issue:** the TS golden `create-fallback-installer-throws` expects a throw caught as `fallback bottle creation threw: Error: DXVK installer blew up`; the Rust trait answers a bool.
- **Fix:** a panic in the installer is caught around the call and reported with the TS wording after the cleanup; a plain failure is `DXVK install failed for bottle`. Recorded in `deltas.json`.
- **Files modified:** `bottles/fallback_bottle.rs`, `golden/bottles/deltas.json`

**Total deviations:** 5 (2 Rule 3 / scope, 1 Rule 2, 1 plan conflict, 1 documented delta). **Impact on plan:** 87-41 has less to port (50 of 73 replay); deviation 2 needs 87-42 to register the selection as the TS callers did.

## Issues Encountered

- `gsd-tools windows append` refused to write: `.planning/WINDOWS.md` has a pre-existing mismatch between its table and its fenced JSON (row 3). The ledger is best-effort and not this plan's, so it was left alone; the one intentional deferral (`restore-pending`, `bottles/switch.rs`) is listed under Known Stubs below.
- Rust 1.99's `large_enum_variant` and `cloned_ref_to_slice_refs` lints needed a boxed pin and `from_ref` in the new code.

## Known Stubs

- `PrepareReason::RestorePending` (`src-tauri/crates/gamelib-engine/src/bottles/switch.rs`): a switch to CrossOver that must restore DXVK is refused before anything is touched. Intentional; 87-41 ports the restore, the CrossOver-unhealthy path and the per-bottle serialisation, and empties `LATER` in `golden_switch.rs`. No TS caller is switched (D-06), so no user path reaches it.
- `CtxPerGameDeps::ensure_pin` does not download: a pinned engine that is not installed is `engine-download-failed`. The download and the creation decision are later plans'.

## Threat Flags

None. T-87-40 (denial of service) is mitigated as planned: wineboot 180 s and the wait 60 s each carry the creation's cancel token, the stops are capped at 15 s, every spawn goes through `ctx.proc` (the one SpecRunner seam), and the op wrapper races the shutdown token. The new op surface is covered by the strict arguments of deviation 3 (T-87-82). T-87-SC: no new crate (`futures-util` and `tokio`'s `sync` are existing dependencies).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-41 completes the switch: the restore, the unhealthy-CrossOver path, `reconcile_marker` and `record_crossover` ops, the per-bottle serialisation (`inFlightSwitches`, in `EngineCtx`), the incident tests; `LATER` in `golden_switch.rs` names the 23 cases it takes over.
- 87-42 switches the bottle and engine callers: it must register the returned `selection` (or pass `register_selection`) as the TS callers did.
- `graphify update .` was run.

## Self-Check: PASSED

- FOUND: `bottles/switch.rs`, `bottles/fallback_bottle.rs`, `bottles/per_game.rs`, `tests/golden_switch.rs`, `tests/common/mod.rs`
- FOUND: `19d0ee061`, `c3ddfc3c2` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)
