---
phase: 87-engine-wine-and-tools
plan: 45
subsystem: engine
tags: [rust, engine-decision, crossover, g29, d-20, golden, wr-01]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the decision goldens and the oracle (87-13), the engine marker view and the ledger (87-38, 87-25), the CrossOver locator, demo-status probe, build read and the wineserver kill (87-42, 87-44), the pin table and the pinned-engine paths (87-02)
provides:
  - gamelib_engine::decision::preflight (preflight_crossover with the G29 two-probe rule, is_crossover_missing, CrossoverPreflight, MonitorPhase, ProbeTuning, PreflightArgs)
  - gamelib_engine::decision::launch (decide_launch_engine, DecideArgs, LaunchDecision, LaunchUse, FallbackReason)
  - gamelib_engine::decision::creation (decide_creation_engine, CreationDecision, CX_CREATE_CAP_MS)
  - gamelib_engine::decision::override_options (list_engine_override_options, override_option_rows, options_value, re-export of resolve_wine_manager_staging)
  - ops engine_decide_launch, engine_decide_creation, engine_list_override_options, engine_preflight_crossover, engine_is_crossover_missing
  - test golden_decision.rs (118 cases, 1798 items replayed, floor 80)
affects: [87-46, 87-50, 87-55, 87-56]

actuals:
  tokens: 21300
  tasks: 2
  commits: 2

plan_head_before: db30dcd6caacde76a72001a855afd93a6d2a50b9
plan_head_after: cc4530400345113edffe246c02770a1d36920d3b

tech-stack:
  added: []
  patterns:
    - "a TS dependency callback becomes a Rust call (bin dir, probe, build read, kill, ledger, Wine Manager releases, pin install check) or a value field of the op's args (the stored override, the process monitor's phase); nothing calls back into TS"
    - "a decision result is a closed enum with no engine outside CrossOver, the pinned fallback and a Wine Manager build, so bottled Steam, GPTK and DXMT cannot be written (D-20)"
    - "a golden replay builds one fake profile per item (real files for CrossOver, the pinned engines, the Wine Manager builds; scripted spawns for the probe, plutil and the wineserver stop) and asserts the tree is unchanged afterwards"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/decision/mod.rs
    - src-tauri/crates/gamelib-engine/src/decision/preflight.rs
    - src-tauri/crates/gamelib-engine/src/decision/launch.rs
    - src-tauri/crates/gamelib-engine/src/decision/creation.rs
    - src-tauri/crates/gamelib-engine/src/decision/override_options.rs
    - src-tauri/crates/gamelib-engine/tests/golden_decision.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/game_engine.rs
    - src-tauri/crates/gamelib-engine/src/crossover/demo_status.rs

key-decisions:
  - "The launch decision is ported whole, the WR-01 inconclusive branch included, not just the plan's tracer case: the TS was in front of the port and a decision with a wrong branch is worse than a decision with a full one. 87-46 now has the offline gate, decision_incidents.rs and the verification of the rest of the matrix to do, not the porting."
  - "engine_decide_launch takes the stored override and the process monitor's phase from the caller (the two things only the TS still knows) and nothing else: the pin table is always the shared one and the bottle's marker view is read from disk in Rust, so a caller cannot name an engine or a pin the shared table does not ship (T-87-46)."
  - "The decision has no `offline` field. The TS decision never read it; the offline gate (`offline_launch_certainly_blocked`, already in gamelib_engine::offline) is 87-46's replay."
  - "The decision kinds are the TS's two (use, unavailable) over the registry's EngineSelection (crossover, pinned, wine-manager), not the plan's sketch of five. Unavailable is the TS refusal. The D-20 enforcement is the exhaustive matches in `engine_kind` and `reason` and the unit test that names every kind."
  - "Two override-option lists share one body: game_engine::list_engine_override_options keeps the old CrossOver bin-dir hook, decision::override_options::list_engine_override_options asks the new locator; both build their rows in override_option_rows, so the picker and the decision cannot drift. The two locators still coexist until 87-55."

patterns-established:
  - "test seams for a production default stay out of the signature: ProbeTuning (base env, probe limit, settle wait) is a struct whose Default is the production call (real-profile arm, 15 s, 2000 ms)"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "decide_launch_engine picks CrossOver first (cx-healthy), the override engines, and the pinned fallback with cx-missing, cx-expired or cx-broken, and keeps the bottle's engine on an inconclusive pre-flight (cx-inconclusive); never bottled Steam, GPTK or DXMT"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-engine/tests/golden_decision.rs#every_decision_golden_replays (the 107 launch cases, the healthy Automatic ones included)"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/src/decision/launch.rs#the_decision_kinds_name_exactly_the_three_engines"
        status: pass
    human_judgment: false
  - id: D2
    description: "preflight_crossover reproduces the G29 two-probe rule: one nonzero exit or timeout is retried once after a wineserver stop, broken only on two in a row, no stop and no retry for a timeout while a game runs or for a page read, an invalid bottle name is inconclusive and spawns nothing"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "golden_decision.rs#every_decision_golden_replays (g29-*, preflight-* cases: the decision, the log lines, the wine --demo-status spawn trace and the order of probes and stops)"
        status: pass
      - kind: integration
        ref: "golden_decision.rs#a_failed_wineserver_stop_is_logged_and_the_retry_still_runs"
        status: pass
    human_judgment: false
  - id: D3
    description: "decide_creation_engine and list_engine_override_options and resolve_wine_manager_staging replay their goldens"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "golden_decision.rs#every_decision_golden_replays (creation-*, options-*, wm-staging-resolution, is-missing)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The five decision ops take strict arguments, and a launch with no CrossOver falls to the current pin with cx-missing and needsDownload"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/src/lib.rs#the_decision_ops_take_strict_arguments_and_fall_back_when_crossover_is_missing"
        status: pass
    human_judgment: false
  - id: D5
    description: "A live decision on a Mac with CrossOver installed: the production pre-flight (real-profile --demo-status, a real plutil build read, a real wineserver stop)"
    verification: []
    human_judgment: true
    rationale: "The replay scripts the three spawns. No TS caller reaches the new ops yet (87-55 registers the rpc arms and switches the callers), so the live check belongs to that switch or a UAT of the phase."

duration: ~17 min (start not recorded; bounded by 87-44 closing at 2026-11-23T14:38Z and this plan's code closing at 14:55Z by the host clock)
completed: 2026-11-24
---

# Phase 87 Plan 45: The engine decision in Rust Summary

**The CrossOver-first engine decision runs in gamelib-engine: the G29 two-probe pre-flight, the launch decision (override, cx-healthy, the pinned fallback and the WR-01 inconclusive keep-the-marker branch) over closed kinds with no bottled-Steam variant, the creation decision and the override options; 1798 items of the 87-13 decision goldens replay.**

## Performance

- **Duration:** about 17 min (see the frontmatter note: the start was not recorded)
- **Tasks:** 2 of 2 (Task 1 is a tracer whose `<verify>` is automated only: it was re-run end to end before Task 2, no checkpoint)
- **Files:** 9 changed across the two code commits (2041 insertions, 66 deletions)

## Accomplishments

- **Task 1 (tracer):** `decision::preflight` (`preflight_crossover`, `is_crossover_missing`: locator, existence and execute checks, the concurrent build read and probe, the retry loop with the wineserver stop, the game-running and page-read no-kill reasons, the settle wait) and `decision::launch` (`decide_launch_engine` over `LaunchDecision`, with the pin and Wine Manager overrides, the CrossOver override, the healthy and fallback arms, and the whole WR-01 inconclusive branch), op `engine_decide_launch`. `golden_decision.rs` replays 107 launch cases, the pre-flight, is-missing and Wine Manager staging cases against fake profiles with real files and scripted spawns. The healthy Automatic goldens give `reason=cx-healthy`.
- **Task 2:** `decision::creation` (`decide_creation_engine`, `CX_CREATE_CAP_MS`), `decision::override_options` (`list_engine_override_options`, `override_option_rows`, the re-export of `resolve_wine_manager_staging`), ops `engine_decide_creation`, `engine_list_override_options`, `engine_preflight_crossover` and `engine_is_crossover_missing`, and the creation and option goldens in the same replay.
- The replay compares, per item, the decision (selection, pre-flight, pin, `needsDownload`, override, log lines), the log lines the run wrote, the `wine --demo-status` spawn trace and the order of probes and wineserver stops against the TS's dependency-call order, and asserts the profile tree is unchanged afterwards (59-UAT G11). Three mutations (a changed `cx-healthy` word, a third probe attempt, the inconclusive marker branch switched off) each turned it red (158, 716 and 112 failing items).

## Task Commits

1. **Task 1 (tracer): the CrossOver pre-flight and the launch decision in Rust, golden-matched** - `fc5267ba1` (feat)
2. **Task 2: the creation decision and the override options in Rust, golden-matched** - `cc4530400` (feat)

## Decisions Made

See `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] The pin table and the bottle's marker are not op arguments**
- **Found during:** Task 1 (`engine_decide_launch`)
- **Issue:** the plan lists `pins` and `marker_view` among the args the caller fills. An op that took a pin table from the wire would let a caller name a pin whose id is joined into a path (`steam-engines/<id>`), and the marker view is a disk read Rust already owns.
- **Fix:** `DecideArgs` carries both for the library and the tests; the op sets `pins: None` (the shared table) and reads `read_marker_summary` itself. The request struct denies unknown fields, so `pins` in an op call is `bad-args` (tested).
- **Files modified:** `src/lib.rs`, `src/decision/launch.rs`
- **Committed in:** `fc5267ba1`

**2. [Rule 3 - Blocking] `game_engine.rs` and `demo_status.rs` are touched, and are not in the plan's file list**
- **Found during:** Task 2 and Task 1
- **Issue:** `game_engine::list_engine_override_options` already existed with the same rows but over the old CrossOver hook and the shared table only; the golden's retired-pin states need a pin table the caller passes. `utf16_prefix` (a UTF-16 slice for the 64-unit bottle name in a log line) was private to `demo_status.rs`.
- **Fix:** the rows moved to `decision::override_options::override_option_rows`, which both lists call (behaviour unchanged: every `golden_config` case still passes); `utf16_prefix` is `pub(crate)`.
- **Files modified:** `src/game_engine.rs`, `src/crossover/demo_status.rs`
- **Committed in:** `cc4530400`, `fc5267ba1`

**3. [Rule 1 - Divergence, recorded in the test] Four things the Rust replay maps or skips, each with its reason in the test header**
- `g29-kill-throws`: the TS injected a wineserver stop that threw. Rust's stop never fails (it logs and returns), so the golden cannot replay; `a_failed_wineserver_stop_is_logged_and_the_retry_still_runs` pins the Rust behaviour instead.
- `throws` probe steps (`g29-spawn-error-*`): Rust reads a rejected spawn as `nonzero-exit` with `code=null` (the 87-44 divergence); the replay maps those strings back to the TS's `spawn-error` text for those items only.
- `resolverRejects` items (4): the Rust locator cannot reject.
- The three `locator` cases: 87-44 owns the resolver.
- **Committed in:** `fc5267ba1`

**4. [Process - TDD ordering] Task 2 is `tdd="false"` in the plan but the whole unit was developed together, then committed task by task**
- The decision module was written and verified as one piece; the Task 1 commit was cut from it by trimming the Task 2 files (`creation.rs`, `override_options.rs`, the `game_engine.rs` edit, four ops) and was compiled, clippy-clean and tested on its own before the commit. The mutations above are the evidence the replay is not vacuous.

---

**Total deviations:** 4 (1 Rule 2 security narrowing, 1 Rule 3 file-list addition, 1 recorded divergence set, 1 process note)
**Impact on plan:** none on the plan's goals. The plan's tracer case was exceeded: the whole launch decision replays, which leaves 87-46 with the offline gate, `decision_incidents.rs` and its own verification.

## Issues Encountered

- `clippy::large_enum_variant` on `CreationDecision` (the pin is 257 bytes); the pin is boxed.
- The first replay failed on clock and level names only (`elapsedMs=1` from a real clock, `WARN` for the TS `WARNING`); the replay uses a fixed clock and maps the level, no golden was touched.

## Known Stubs

None. No stub, skipped test or unrun verify was left. (D5 in the coverage block is a live check no desk run can make, recorded there and not as a stub.)

## Threat Flags

None. T-87-46 (engine override value) is mitigated as planned: the override is parsed by the closed grammar (`parse_engine_override`, the same rule the twin pins), an unknown value is `automatic`, the pin table is never taken from the caller, and the decision enums have no unsupported engine (unit test plus the 1798-item replay). T-87-SC accepted: no new crate.

## Self-Check: PASSED

- Created files verified on disk: `decision/{mod,preflight,launch,creation,override_options}.rs` and `tests/golden_decision.rs` all exist.
- Commits `fc5267ba1` and `cc4530400` are ancestors of HEAD; `commits: 2` measured from the ledger base `db30dcd6c`.
- `cargo test -p gamelib-engine --features testing` passes (122 lib tests, `golden_decision` 3, the other suites unchanged); `cargo test --bin gamelib-shell engine_dispatch` 24 passed; `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings`, `cargo fmt -p gamelib-engine --check` and `cargo check -p gamelib-engine-cli` pass.
- `git diff --stat HEAD -- src-tauri/crates/gamelib-engine/tests/fixtures/golden/decision` shows no change: the goldens were not edited.
- Prettier check omitted as the tasks' verify blocks say: every path written is Rust, nothing prettier sees.

## Next Phase Readiness

Ready for 87-46: `decision::launch` already holds every branch and every launch golden replays, so 87-46 adds `decision_incidents.rs` (the engineDecision.test.ts WR-01 incident cases as behavioural tests), replays the offline gate (`gamelib_engine::offline::offline_launch_certainly_blocked`, already ported, against the `gate` and `launch` fields of each launch item, which `golden_decision.rs` does not read) and checks the goldens stay untouched. 87-55 registers the rpc arms for these five ops and the 87-44 ones and switches the callers; until then no TS code reaches them. Two Rust CrossOver locators still coexist (the shell's older hook behind `EngineCtx.crossover_bin_dir`, read by `game_engine::list_engine_override_options` and the engine config, and the new `CrossoverLocator` the decision uses). Carried unchanged: no engine is downloaded in Rust yet, the TS launch-step modules stay until 87-56, and a live Mac run is still owed (D5 above, 87-44's and 87-42's).

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
