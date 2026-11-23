---
phase: 87-engine-wine-and-tools
plan: 41
subsystem: wine
tags: [rust, gamelib-engine, engine-switch, wr-02, per-bottle-lock, restore, g30, incidents, golden]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: prepare_bottle_for_engine and 50 of the 73 switch goldens (87-40), the bottle marker, reconcile and record primitives (87-38), the DxvkInstaller seam and EngineCtx (87-06, 87-25), bottle removal over gamelib-safety (87-39)
provides:
  - gamelib_engine::bottles::switch::{InFlightSwitches, restore, reconcile_marker, record_crossover, EnsurePin}
  - EngineCtx.in_flight (the per-bottle async lock map, the TS inFlightSwitches)
  - PrepareArgs.ensure_pin (the TS ensurePinEngine, a value; absent means an installed pin or nothing)
  - ops engine_bottle_reconcile_marker and engine_bottle_record_crossover (strict arguments)
  - golden_switch.rs replays all 73 switch goldens (LATER is gone); switch_incidents.rs
affects: [87-42, 87-43, 87-56]

actuals:
  tokens: 15000
  tasks: 2
  commits: 2

plan_head_before: 5cb9cd07506f4d5cc43617d23c64630ad81c72eb
plan_head_after: 55ab9895755e3409ddac26b138399ff4b5057200

tech-stack:
  added: []
  patterns:
    - "one async lock per key in a std-mutex map, taken through `try_lock_owned` (so the caller can say it waits) then `lock_owned`; a Drop guard releases the lock and tidies the entry however the call ends, so a panicking or dropped holder never blocks the chain"
    - "a TS entry registered before its body's first await is reproduced by one `yield_now` after the lock is taken, so a caller started in the same tick queues"
    - "concurrent goldens drive the calls with `join_all` on one thread, a `tokio::task_local` call stamp on the scripted seams, and a yield wherever the TS awaited, so the events fall in the oracle's order"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/tests/switch_incidents.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/bottles/switch.rs
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/tests/golden_switch.rs

key-decisions:
  - "The per-bottle serialisation is a fair tokio mutex per bottle name, not the TS promise chain: callers run in arrival order, the waiting call re-reads the marker because the body runs after the lock, and the 'waits for an in-flight switch (WR-02)' line is logged when the lock is already held. The entry is dropped when the last holder or waiter is gone."
  - "One `yield_now` after taking the lock. The TS registers its in-flight entry before the body's first await (the version gate's question); the Rust gate is answered in process, so without a turn a switch that finishes at once would let a call started in the same tick skip both the wait and its log line. It costs one scheduler turn per switch."
  - "`ensurePinEngine` is `PrepareArgs.ensure_pin`, a value. Absent (the ops), a pin that is installed is used and one that is not is unavailable, so a restore whose source is missing answers `no DXVK source to restore`. This crate downloads no engine yet (87-40 left that to a later plan); the goldens pass a callback that records the fetch."
  - "`PrepareReason::RestorePending` and its refusal are removed: the restore is ported, so no branch half-switches a bottle any more."
  - "A restore whose installer panics propagates the panic (the TS promise rejected and the golden expects `threw`); only the fallback creation catches a panic, because its golden says so."
  - "The legacyBottleUntouched port covers the prepare half (a launch on the engine the bottle already runs, every refused switch, a plain prefix outside the Bottles root). The TS file's `selectEngineForLaunch` and `resolveGamePrefix` assertions belong to the launch plans (87-42, 87-43), which are not ported yet."

patterns-established:
  - "an op that answers a switch result keeps the TS wire shape and adds `selection`; the new marker ops answer `\"crossover\" | \"pinned\" | null` and a bool, as the TS functions did"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "Two concurrent prepares of one bottle serialise like the TS inFlightSwitches: the second waits and says so, re-reads the marker the first wrote, and the order of stops, installer calls, results and marker bytes equals the WR-02 goldens (same target, three same target, first rejects, second refused busy); different bottles do not wait for each other. A panicking switch releases the bottle."
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/golden_switch.rs#the_wr02_interleave_tracer_replays, #every_switch_golden_this_build_ports_replays"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/src/bottles/switch.rs (a_second_turn_on_one_bottle_waits_and_a_turn_on_another_does_not, a_switch_that_panics_does_not_block_the_chain, a_dropped_waiter_leaves_the_bottle_to_the_next_caller)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 73 87-16 switch goldens replay in Rust with the same switched flag, marker bytes, tree, wineserver argv, DXVK installer calls and pin fetches: crossover to pin, pin to crossover healthy and unhealthy (built-in restore, source fetched, source unavailable, restore fails or leaves its file), pin to Wine Manager, DXVK failing, a newer marker kept byte for byte, unreadable, contradicted and legacy markers, the shared-bottle refusal, bottle-busy and game-running, the G30 wineserver stop after a healthy restore."
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/golden_switch.rs#every_switch_golden_this_build_ports_replays (73 of 73, count floor 73, MANIFEST count 73)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The incident tests: a pre-61 bottle (the legacy shared GameLib bottle and a user-picked one) is byte-identical after a launch on its own engine apart from the marker, and byte-identical with no marker after every refused switch; a plain prefix outside the Bottles root is never reached; removing or switching one bottle leaves a sibling bottle, its marker, a longer-named bottle and a neighbouring directory byte-identical."
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/switch_incidents.rs (legacy_bottle_untouched_by_a_launch_on_the_engine_it_already_runs, legacy_bottle_untouched_by_every_refused_switch, a_plain_prefix_outside_the_bottles_root_is_never_touched_by_a_switch, removing_or_switching_one_bottle_leaves_a_sibling_bottle_untouched)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ops engine_bottle_reconcile_marker (answers crossover, pinned or null, writes only for a provisioned bottle whose marker is missing or contradicted) and engine_bottle_record_crossover (a bool; a relative bin directory is a bad argument) take strict arguments and never write over a newer marker."
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/src/lib.rs#the_record_crossover_op_writes_the_marker_and_the_reconcile_op_reports_what_it_wrote"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real bottle switched back to CrossOver on a Mac, restored with a live CrossOver and a live wineserver, and two real launches racing one bottle"
    verification: []
    human_judgment: true
    rationale: "The goldens replay a scripted wineserver and DXVK installer; nothing here runs Wine, and no TS caller is switched yet (D-06; 87-42 switches the callers)."

duration: 10 min
completed: 2026-11-23
---

# Phase 87 Plan 41: Engine switch serialisation, the CrossOver restore and the incident tests Summary

**gamelib-engine now serialises switches per bottle (a fair async lock per bottle name that logs its wait, re-reads the marker and survives a panicking holder), restores CrossOver's graphics stack on a switch back to CrossOver (source resolved first, built-in engine when CrossOver cannot run, CrossOver's wineserver stopped once afterwards), adds the reconcile and record-crossover ops, and replays all 73 switch goldens plus ported incident tests (legacyBottleUntouched, sibling-safe removal).**

## Performance

- **Tasks:** 2 of 2. Task 1 is a tracer; its `<verify>` is automated only, so it was re-run end to end and passed before Task 2 started (no checkpoint).
- **Files:** 5 changed in the two code commits (1185 insertions, 239 deletions), one created.
- **Started:** 2026-11-23T12:58Z (approximate)  **Completed:** 2026-11-23T13:08Z

## Accomplishments

- **Tracer (Task 1):** `InFlightSwitches` in `EngineCtx.in_flight`; `prepare_bottle_for_engine_with` takes the bottle's lock for its whole run. `golden_switch.rs` now drives the concurrent cases with `join_all` on one thread under a task-local call stamp; the five WR-02 goldens that do not need the restore replay (same target, three same target, first rejects, second refused busy, different bottles), and the tracer test pins the order for the two-caller case.
- **Restore (Task 2):** `resolve_restore_source` (the marker's DXVK copy, else the pin it was prepared with, else the current pin, fetched through `ensure_pin` when absent) runs before anything is stopped; `restore` runs the installer through the CrossOver settings (healthy) or the built-in engine (unhealthy), stops the right wineserver (G30 / G10), and on a failed or file-leaving restore writes the previous marker with `dxvk: failed` (CR-03). `reconcile_marker` and `record_crossover` are the switch module's names for the 87-38 marker functions, with ops `engine_bottle_reconcile_marker` and `engine_bottle_record_crossover`.
- **Goldens:** the `LATER` list, the restore-pending refusal and the REPLAYED floor are gone; all 73 cases replay and the floor is 73. The replay also compares each case's pin fetches.
- **Incidents (Task 2):** `switch_incidents.rs` on a fake HOME with scripted seams and no child process.
- **Non-vacuity:** removing the per-bottle lock failed the WR-02 tracer and the replay; removing the G30 wineserver stop failed five restore goldens; each was reverted.

## Task Commits

1. **Task 1 (tracer): concurrent switches of one bottle serialise in gamelib-engine, the 5 WR-02 goldens replay** - `2b43b32ff` (feat)
2. **Task 2: the CrossOver restore, reconcile and record ops and the incident tests, all 73 switch goldens replay** - `55ab98957` (feat)

## Verification

- Task 1 chain: `cargo test -p gamelib-engine --features testing --test golden_switch` (7 passed), `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings`, `cargo fmt -p gamelib-engine --check`. Acceptance: the WR-02 interleave golden passes.
- Task 2 chain: `golden_switch` (6 passed, 73 of 73 cases), `switch_incidents` (4 passed), `cargo test -p gamelib-engine bottles::switch` (7 passed), the whole crate (107 lib, 24 fetch_replay, 14 golden_bottles, 7 golden_config, 6 golden_switch, 7 roundtrip_state, 4 switch_incidents, 6 twin_vectors), clippy and fmt clean. Acceptance: MANIFEST count 73 (at least 15), every golden/switch case passes, `switch_incidents.rs` carries a test named for legacyBottleUntouched.
- The Rust-only `<verify>` blocks carry no prettier check, as the plan says (every written path is Rust).
- Not run: a live Mac run (no TS caller is switched, D-06); `cargo test` on Windows or Linux (the goldens and incident tests are `cfg(unix)`, as 87-38 to 87-40).

## Deviations from Plan

### Auto-fixed Issues

**1. [Plan conflict] The mutex map is a type in switch.rs, held by `EngineCtx`**
- **Found during:** Task 1
- **Issue:** the plan lists the map under `ctx.rs`; the 87-40 pattern (`PerGameFlights`) keeps the type in its own module and the context holds the field.
- **Fix:** `InFlightSwitches` lives in `bottles/switch.rs`; `ctx.rs` holds `in_flight`. The key link (`in_flight`) holds.
- **Files modified:** `bottles/switch.rs`, `ctx.rs`

**2. [Rule 3 - Blocking] A yield after taking the lock and yields in the scripted seams**
- **Found during:** Task 1
- **Issue:** the oracle's two concurrent calls interleave at each TS `await`; the Rust seams answered at once, so the second call saw no switch in flight (no wait line) and events fell out of order.
- **Fix:** one `yield_now` after the lock is taken (the TS registers before its first await); the test harness yields before and after a wineserver stop's answer, in the installer and in the CrossOver bin hook, where the oracle awaited. Production code gains one scheduler turn per switch only.
- **Files modified:** `bottles/switch.rs`, `tests/golden_switch.rs`

**3. [Scope] `reconcile_marker` and `record_crossover` already existed as 87-38 marker functions**
- **Found during:** Task 2
- **Issue:** the plan lists them as new in switch.rs; `marker::reconcile` and `marker::record_crossover` are ported and golden-tested.
- **Fix:** thin functions of those names in switch.rs over the marker ones, plus the two ops; no second implementation.
- **Files modified:** `bottles/switch.rs`, `lib.rs`

**4. [Scope] legacyBottleUntouched ports the prepare half only**
- **Found during:** Task 2
- **Issue:** the TS test drives `selectEngineForLaunch` and the per-game bottle creation, which are the launch plans' (87-42, 87-43).
- **Fix:** the Rust test covers what this plan owns: a launch on the engine the bottle already runs, every refused switch, a plain prefix; the launch-level cases move with the launch port.
- **Files modified:** `tests/switch_incidents.rs`

**Total deviations:** 4 (1 Rule 3, 1 plan conflict, 2 scope). **Impact on plan:** none on behaviour; the goldens are the contract and all 73 pass.

## Issues Encountered

- `gsd-tools windows append` refuses on `.planning/WINDOWS.md` (a pre-existing table-versus-JSON mismatch at row 3, noted in 87-40). The ledger is best-effort and not this plan's, so it was left alone; no stub was left by this plan.
- 87-40's one intentional deferral (`PrepareReason::RestorePending`) is resolved here and removed.

## Known Stubs

None from this plan. Carried from 87-40: `CtxPerGameDeps::ensure_pin` and the default `PrepareArgs.ensure_pin` (absent) download no engine, so a pin that is not installed is unavailable; the pinned-engine download is a later plan's. No user path reaches them (no TS caller is switched, D-06).

## Threat Flags

None. T-87-39 (tampering by concurrent switches) is mitigated as planned: a per-bottle async lock, the waiting call re-reads the marker, the WR-02 goldens pin the order. The two new ops take strict arguments (an unknown member or a relative bin directory is `bad-args`; an unsafe or absent bottle writes nothing). T-87-SC: no new crate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The engine switch is complete in Rust. 87-42 switches the bottle and engine callers: it must register the returned `selection` (or pass `register_selection`), pass `ensure_pin` where the TS passed a downloading `ensurePinEngine`, and call the two new ops.
- `graphify update .` was run.

## Self-Check: PASSED

- FOUND: `bottles/switch.rs`, `ctx.rs`, `lib.rs`, `tests/golden_switch.rs`, `tests/switch_incidents.rs`
- FOUND: `2b43b32ff`, `55ab98957` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)
