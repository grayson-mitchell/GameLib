---
phase: 87-engine-wine-and-tools
plan: 49
subsystem: engine
tags: [rust, engine-state, notices-store, store-host, native-channel, golden, fnd-06]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the 41 TS state goldens (87-14), the tested-versions NoticeStore trait (87-44), the decision and config modules (87-13, 87-25, 87-45), the engine native slice (87-28)
provides:
  - gamelib_engine::state::{notices, engine_state, publish}
  - ops engine_notice_dismiss, engine_state_get, engine_state_record_decision, engine_state_publish_overlay_notice, engine_state_publish_overlay_exit_notice
  - the native engine channel dismissEngineNotice (sidecar handle and zod entry deleted)
affects: [87-50, 87-52, 87-56]

actuals:
  tokens: 34000
  tasks: 3
  commits: 3

plan_head_before: 9f6b809d98b9d638be70e38fe5154eda6f2e0504
plan_head_after: fadec53922cf7f1e4a04f4af210367024404ae63

tech-stack:
  added: []
  patterns:
    - "a notice store view over the StoreHost: lazy open held in a Slot (Unopened, Open, Refused), a refused open remembered for the process so the host's corrupt-file copy is made once; writes go through a NoticeStore impl that raises a refused flag instead of failing silently"
    - "a page pre-flight single flight as an Arc<tokio OnceCell<Result>> per bottle: the initializer caches, releases the slot only if it is still its own, and a caller dropped mid-probe leaves a cell the next caller re-initialises"
    - "TS-only facts cross as values: GameFacts for the owner, FactsRequest for the op, so the 87-52 resolver makes one typed call"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/state/mod.rs
    - src-tauri/crates/gamelib-engine/src/state/notices.rs
    - src-tauri/crates/gamelib-engine/src/state/engine_state.rs
    - src-tauri/crates/gamelib-engine/src/state/publish.rs
    - src-tauri/crates/gamelib-engine/tests/golden_state.rs
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/state/deltas.json
  modified:
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/crossover/tested_versions.rs
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/engine.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/backend/sidecar/engineFlowRegistration.ts

key-decisions:
  - "A corrupt notices file is kept and a dismissal the store cannot record answers {ok: false} (the TS replaced the file and answered true). The StoreHost refuses to open it and never overwrites it; every notice reads as not dismissed until the file is repaired."
  - "The host's one .corrupt.<stamp>.json copy of a corrupt notices file is accepted, and made once per process: a refused open is remembered (Slot::Refused) instead of retried on every state read, which would write a copy per read."
  - "The renderer push cannot fail in Rust (FrontendEmitter::emit returns nothing), so the TS 'publisher throws' behaviour (log, answer false, publish nothing) has no Rust equivalent; a notice answers true once a state was published for the title."
  - "dismissEngineNotice at the engine op is lenient like the TS (any bad shape is {ok: false}); the strict two-arm decode is at the shell channel, with fixed-literal rejections that never echo the renderer's value."
  - "get_engine_state takes GameFacts (bottle, state-without-bottle, three eligibility flags, effective engine, prefix kind, per-game bottle name) as values and a StateProbes seam; a non-Steam game's facts are derived in Rust (non_steam_facts), a Steam bridge game's come in the op's facts object, with the effective engine always read from the stored settings."
  - "TS dismissEngineNotice and createEngineState stay (the oracle and engineState unit tests use them) until 87-56 deletes the TS engine; only the channel registration and zod entry were removed."

patterns-established:
  - "a delta file per golden slice names every case or rule the replay treats differently, and a test pins the list to the cases the replay skips"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "D-07, D-08: Rust reads and writes store_cache/steam_engine_notices.json (user-state, dismissedUntestedCrossoverBuilds capped at 50 with the __timestamp pair) only through the StoreHost, byte-equal to the TS for every 87-14 state golden that writes it (the 50th and 51st, the store over the cap, the populated store, dismiss twice, bad entries, a non-array); a corrupt notices file is kept"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-engine/tests/golden_state.rs#every_state_golden_replays (39 cases replayed against the goldens, 2 by named delta tests)"
        status: pass
      - kind: integration
        ref: "golden_state.rs#a_corrupt_notices_file_is_kept_on_a_dismissal, #the_cap_and_the_two_key_write_hold_without_the_goldens"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-10: engineStateChanged is emitted through the FrontendEmitter with the TS payload and sequence; the trial notice at 7, 0 and 8 days and expired, the untested-build notice and its dismissal, recordLaunchDecision (fallback notice sequence 1, 2, 3, none for forced CrossOver or an inconclusive probe), and the overlay, exit and deadline publishes returning the boolean match the goldens"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "golden_state.rs#every_state_golden_replays (events.json, result steps and tree compared per case)"
        status: pass
      - kind: unit
        ref: "state::publish tests and state::engine_state tests (single flight dropped mid-probe, 23-key payload, title cut at 200 UTF-16 units)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-14: dismissEngineNotice is a native invoke channel in slice engine with a strict tagged-union decode; its sidecar handle and zod entry are deleted in the same commit, the census, snapshot and contract follow"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell engine_dispatch (dismiss_engine_notice_* x3), native_manifest_vectors"
        status: pass
      - kind: command
        ref: "pnpm check:ipc-contract; jest nativeChannelOwnership, ipcSchemaCoverage, engineFlows, flowRegistrationCensus; grep -c \"'dismissEngineNotice'\" over the non-comment lines of engineFlowRegistration.ts == 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Research Pattern 2: get_game_engine_state takes the TS-only facts as values so the D-23 resolver in 87-52 can call it once; installing the context reads no notices file (D-17)"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/src/engine_dispatch.rs#install_builds_a_context_whose_notices_are_not_loaded_and_the_first_state_loads_them"
        status: pass
      - kind: integration
        ref: "golden_state.rs#the_ops_answer_through_dispatch (engine_state_record_decision, the two overlay ops)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A live check on the operator's Mac that a dismissal made through the Rust channel is seen by the TS getEngineState (the sidecar's store mirror) and by a restarted app, and that a real corrupt notices file leaves the badge usable, is not exercised"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "The shell tests build a context over a fake profile and never an AppHandle or a sidecar; the mirror's reception of a Rust-origin write is the store host's contract (Phase 85), not re-proved here. The live run owed after the switch-over (87-50 onward) covers it."

duration: 20 min (host clock 15:43 to 16:03 UTC, 2026-11-23)
completed: 2026-11-24
---

# Phase 87 Plan 49: Engine state, notices and dismissEngineNotice in Rust Summary

**The notices store, the per-title engine state (trial and untested-build notices, launch records, overlay, exit and deadline notices) and `engineStateChanged` moved into `gamelib-engine`, replaying all 41 TS goldens, and `dismissEngineNotice` is a native channel that writes the store only through the StoreHost and keeps a corrupt file.**

## Accomplishments

- **Task 1 (tracer):** `state::notices` (`NOTICES_STORE`, `UNTESTED_DISMISSED_KEY`, `NO_CROSSOVER_KEY`, `MAX_DISMISSED`, `dismiss`) opens `steam_engine_notices` lazily through `ctx.host.open_cache`, implements the existing `NoticeStore` trait (87-44) over it, and writes the value and its `__timestamp.<key>` pair as the TS `CacheStore` did (a UTC `Date()` text, hand-computed, no new crate). Op `engine_notice_dismiss`; native channel `dismissEngineNotice` (slice `engine`) with a strict two-arm decode, fixed-literal rejections, manifest vectors, and the sidecar handle, zod key, census count and snapshot updated in the same commit. The tracer `<verify>` is automated only, so it was re-run end to end before Task 2 (golden replay, shell vectors, contract, jest, codecheck) and passed; no checkpoint.
- **Task 2:** `state::engine_state` ports the owner: `get_engine_state` (the preflight cache with its 60 s unhealthy TTL, one probe per bottle however many callers, the forced-CrossOver warnings, Legacy and unsupported engines never probing), `record_launch_decision` (the shared `seq` counter, the fallback launch notice, the label of the last launch), `get_game_engine_state` and `non_steam_facts` (a non-Steam game's prefix, bottle and eligibility from its stored settings), and `state::publish` (`emit_engine_state`, the overlay, exit and deadline notices returning the boolean). Four ops over them. `EngineCtx` gained `notices` and `engine_state` fields, both empty at construction.
- **Task 3:** installing the context reads no notices file: pinned by a shell test over a corrupt notices file (nothing opened, no backup copy, store not loaded after the build; a computed state loads it; a refused dismissal keeps the bytes). The store was already lazy from Task 1, so this task is the proof at the shell's own build.
- **Mutation evidence:** setting the trial threshold to 6 turned `trial-notice-7-days` red (`showTrialNotice` true against false); starting the notices slot as already opened turned the Task 3 test red. Both reverted.

## Task Commits

1. **Task 1 (tracer): dismissEngineNotice native end to end over the Rust notices store, golden-matched** - `aaec738f0` (feat)
2. **Task 2: engine state single flight, lazy notices and notice publishes beyond the goldens** - `b0f136369` (test)
3. **Task 3: installing the engine context reads no notices file and the first state read loads it** - `fadec5392` (test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The state module could not be split across the task boundary**
- **Found during:** Task 1
- **Issue:** `golden_state.rs` replays dismissal cases that include `state` steps, and the notices module, the publish function and the context fields reference the owner, so the state module compiled only as a whole. Task 1's commit therefore carried the whole implementation and replays all 41 goldens; Task 2's and Task 3's commits are the tests the plan's behaviour lists name beyond the goldens (single flight dropped mid-probe, unavailable decision, title cut, lazy boot).
- **Files modified:** all of `src/state/*`, `golden_state.rs`
- **Commits:** `aaec738f0`, `b0f136369`, `fadec5392`

**2. [Rule 1 - Bug] Retrying a refused open on every read would write a corrupt-file copy per read**
- **Found during:** Task 1
- **Issue:** the host keeps a `.corrupt.<stamp>.json` copy of a store it cannot read each time it is asked to open one; a state read that retried the open would have written one per read.
- **Fix:** `Notices` holds a `Slot` (`Unopened`, `Open`, `Refused`) and a refused open is remembered for the process. A test asserts one copy after two dismissals and a read.
- **Commit:** `aaec738f0`

**3. [Rule 2 - Missing critical] Closed-set checks the TS left to its types**
- **Found during:** Task 1
- **Issue:** the new ops accept values a renderer or the sidecar could send as arbitrary strings.
- **Fix:** an overlay step outside the six-name union publishes nothing; `engine_state_record_decision` requires a clean bottle name and an override id that survives `parse_engine_override_str` unchanged; `prefixKind` must be `bottle`, `plain` or `legacy`; every request struct denies unknown fields (T-87-50).
- **Commit:** `aaec738f0`

**4. [Rule 3 - Blocking] Two files outside the plan's list**
- **Issue:** `crossover/tested_versions.rs` kept `MAX_DISMISSED` private (the plan has the notices module export it); `golden/state/deltas.json` is the named record of the replay's differences (the fallback and config slices have one) and `golden_state.rs` pins it.
- **Files modified:** `src-tauri/crates/gamelib-engine/src/crossover/tested_versions.rs`, `tests/fixtures/golden/state/deltas.json`, and the three jest files that counted the removed handle (`engineFlows.test.ts`, `flowRegistrationCensus.test.ts`, `runnerMiscEngine.test.ts`).
- **Commit:** `aaec738f0`

**Total deviations:** 4 (1 Rule 1, 1 Rule 2, 2 Rule 3). **Impact:** none on the goals.

## Differences from the goldens (golden/state/deltas.json)

- `store-corrupt-dismiss-overwrites-as-shipped`: the corrupt file is kept and the dismissal answers `{ok: false}` (the plan's FND-06 requirement; the TS replaced the file).
- `publisher-throws`: a push cannot fail in Rust, so every launch publishes and every notice answers true once a state is published; the replay asserts the shared sequence instead.
- A corrupt notices file leaves one host-made `.corrupt.<stamp>.json` copy beside it (the TS made none).
- A notices file the host wrote is `0600` whatever mode it started with (the TS rewrote in place).

## Do the engine lines reach a log?

No engine log line is ported by this plan. The only lines the TS state code logged were "engine state publisher failed" and the three notice-publisher variants, which can no longer happen (see the `publisher-throws` delta), so the Rust state module writes none and `ctx.log` is not used by it. `EngineLog` is still `None` in the app (87-48), so the open privacy decision on wiring one into `gamelib.log` is unchanged and owed to the plan that ports lines a user needs.

## Issues Encountered

- Cargo did not rebuild after a `mv` restored a source file with an old mtime, so a mutation check briefly looked like a real failure; fixed by `touch`.
- Two pre-existing snake-case warnings in the shell test build (`wake_lock_*`, `the_keyring_*`), not from this plan.

## Known Stubs

None.

## Threat Flags

None. T-87-50 is mitigated as planned: the shell decode is a tagged union with `deny_unknown_fields` semantics, the build is length-capped at 256 units at the channel and refused by `dismiss_untested_notice` unless it is four dotted numbers, the 50-entry cap is kept, and rejections are fixed literals (a test asserts a hostile value is never echoed); T-87-SC accepted, no new crate (`Cargo.toml` and `Cargo.lock` untouched).

## Self-Check: PASSED

- Commits `aaec738f0`, `b0f136369` and `fadec5392` are ancestors of HEAD; `commits: 3` measured from the ledger base `9f6b809d9`.
- `cargo test -p gamelib-engine --features testing` passes (155 lib tests; `golden_state` 9 tests, the manifest count 41 against a floor of 35); `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings`, `cargo fmt -p gamelib-engine --check` and `rustfmt --edition 2021 --check src/engine_dispatch.rs src/native_router.rs` pass; `cargo test --bin gamelib-shell` passes (836, including `native_manifest_vectors` and `engine_dispatch`).
- `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm planning-gates` (12/12) and `pnpm backend-di-ceilings` pass; jest `nativeChannelOwnership`, `ipcSchemaCoverage`, `engineFlows`, `flowRegistrationCensus` and `runnerMiscEngine` pass; `npx prettier --check` over `nativeChannels.json`, `native.ts`, `engine.ts` and `engineFlowRegistration.ts` passes (none is ignored; `ipcSchemaSnapshot.json` is prettier-ignored and generated).
- `grep -v '^\s*\(//\|\*\)' src/backend/sidecar/engineFlowRegistration.ts | grep -c "'dismissEngineNotice'"` is 0; the corrupt-store replay leaves the file byte for byte `not json {`.

## Next Phase Readiness

Ready for 87-50 (the launch step records into `record_launch_decision`) and 87-52 (the `getEngineState` resolver calls `engine_state_get` with the Steam facts). Still live in TS until 87-56: `engine/bottleLedger`, `engineRegistry`, `engine/perGameBottle`, `engine/gamePrefix`, `engine/pinEngine.ts`, `engine/fallbackEngine.ts`, and now also `engineState.ts` (its `dismissEngineNotice` and `createEngineState` back the oracle and unit tests). The TS `getEngineState` channel and the TS launch path still publish through the TS owner, so until 87-50 and 87-52 two owners hold separate preflight caches and notice sequences; both read the one notices file through the StoreHost.

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
