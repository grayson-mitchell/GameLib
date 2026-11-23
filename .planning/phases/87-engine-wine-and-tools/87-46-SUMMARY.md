---
phase: 87-engine-wine-and-tools
plan: 46
subsystem: engine
tags: [rust, engine-decision, offline-gate, g25, g29, wr-01, d-20, golden]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the decision module and its replay (87-45), the decision goldens (87-13), the offline predicate (87-38), the marker views (87-25, 87-38), the CrossOver locator and probe (87-42, 87-44)
provides:
  - gamelib_engine::decision::offline (re-export of offline_launch_certainly_blocked, OfflineRefusalInput, OfflineArm, MarkerKind, verdict_value; launch_outcome)
  - OfflineArm::as_str
  - test decision_incidents.rs (26 behavioural tests of the inconclusive pre-flight incidents)
  - golden_decision.rs now replays the offline gate and the launch outcome of every launch item (1692 items, floor 80 cases)
affects: [87-50, 87-55, 87-56]

actuals:
  tokens: 7000
  tasks: 2
  commits: 2

plan_head_before: b8f6aca25aae795f5e8839a361f2241ad6cdba79
plan_head_after: c04b76c7656f77870406137e99f1028508c1da19

tech-stack:
  added: []
  patterns:
    - "an offline-gate replay builds the gate's inputs from the replay's own disk (is_crossover_missing, is_pinned_engine_installed) and marker view, never from the golden, and compares them to the oracle's recorded inputs as well as the verdict"
    - "an incident test names a marker fixture on disk, hashes its bytes before and after the decision, and snapshots the whole profile tree"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/decision/offline.rs
    - src-tauri/crates/gamelib-engine/tests/decision_incidents.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/decision/mod.rs
    - src-tauri/crates/gamelib-engine/src/offline.rs
    - src-tauri/crates/gamelib-engine/tests/golden_decision.rs

key-decisions:
  - "The decision and the WR-01 inconclusive branch were already complete from 87-45; this plan added no decision logic. It adds the offline gate's replay, the incident tests and the verification of the whole matrix, and the Rust code it changed is the module path of the gate and one accessor."
  - "The gate predicate stays in gamelib_engine::offline (87-38 ported it with the switch). decision::offline re-exports it so the plan's named path exists and the decision names its surface in one place, rather than moving a function two modules and a test already import."
  - "The gate is not composed into a production function here. The TS composes it inline in launchEngine; that step is 87-50's. This plan proves the predicate and the launch outcome word against 1692 recorded items."

patterns-established:
  - "a replay that asserts the verdicts it saw (both refusal arms and the proceeding launches all occur) so an always-proceeds or never-proceeds gate cannot pass"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "every decision golden (122 cases, 1798 items, floor 80) replays with the same kind, reason, log lines and ordered dependency calls, and the goldens are untouched"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-engine/tests/golden_decision.rs#every_decision_golden_replays"
        status: pass
      - kind: other
        ref: "git diff --stat HEAD -- src-tauri/crates/gamelib-engine/tests/fixtures/golden/decision shows no change"
        status: pass
    human_judgment: false
  - id: D2
    description: "the shipped WR-01 fix: an inconclusive pre-flight keeps the engine the marker records (cx-inconclusive), preserves the marker bytes, stops no wineserver and shows no toast; a corroborated failure still falls back as cx-broken or cx-missing"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-engine/tests/decision_incidents.rs (26 tests; an_inconclusive_pre_flight_keeps_a_{pinned,crossover,wine_manager}_marker_byte_for_byte hash the marker and snapshot the tree)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SVC-02 offline edge: offline_launch_certainly_blocked gives the TS verdict and launch outcome for every launch item (1556 proceed, 116 restore-needs-pin, 20 crossover-missing)"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "golden_decision.rs#every_decision_golden_replays (gate input, verdict and launch word of each launch item)"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/src/offline.rs#the_two_arms and src/decision/offline.rs#the_outcome_words_are_the_oracles"
        status: pass
    human_judgment: false

duration: ~10 min (the start was not recorded; bounded by 87-45 closing at 03:56 and this plan's code closing at 04:05 by the host clock, +13:00)
completed: 2026-11-24
---

# Phase 87 Plan 46: The full decision matrix in Rust, verified Summary

**The CrossOver-first decision matrix is proven in Rust: all 122 decision goldens replay (1798 items), the offline gate's inputs, verdict and launch outcome match the TS for every one of the 1692 launch items, and 26 incident tests pin the shipped WR-01 behaviour, marker bytes and toast included.**

## What was already present

The summary of 87-45 had already ported the whole launch decision, including the G29 two-probe pre-flight and the WR-01 `cx-inconclusive` branch (in `decision/preflight.rs` and `decision/launch.rs`), and 118 of 122 decision goldens replayed. `offline_launch_certainly_blocked` was already ported in `gamelib_engine::offline`. No decision logic changed in this plan. `launch.rs` and `preflight.rs` are listed in the plan's files and are unchanged.

## Accomplishments

- **Task 1 (tracer): `decision_incidents.rs`, 26 behavioural tests** of the `engineDecision.test.ts` incident cases (CR-01, D-05, WR-01, WR-07, D-16) over a fake profile: real CrossOver and pinned-engine files, scripted spawns for the `--demo-status` probe, `plutil` and the wineserver stop. They cover the invalid bottle name (no probe, no stop), the page read, the active monitor, a busy bottle, Automatic and forced CrossOver, the pinned (current and retired), Wine Manager and no-resolvable-engine markers, the uninstalled and pruned cases, the pin that needs a download, and the two regressions (nonzero exit twice is `cx-broken`, missing is `cx-missing`). Three tests lay a real marker fixture on disk (pinned, CrossOver, Wine Manager), run an inconclusive decision on a busy bottle and assert the marker's sha256 and the whole profile tree are unchanged, no wineserver was spawned and the recording UI saw no event (no toast, no dialog, no raise). The tracer's `<verify>` is automated only; it was re-run end to end before Task 2 and passed, so no checkpoint.
- **Task 2: the offline gate in the replay.** `golden_decision.rs` now reads `gate` and `launch` of each launch item. It builds the gate's inputs from the replay's own world (`is_crossover_missing`, `is_pinned_engine_installed` over the replay's disk, the marker kind from the marker view), calls `offline_launch_certainly_blocked`, and compares input, verdict and the launch word (`proceeds`, `refused-offline:<arm>`) to the oracle's. It counts the words and asserts all three occur. `decision/offline.rs` re-exports the gate and adds `launch_outcome`; `OfflineArm::as_str` is new.
- Mutation evidence: switching `current_pin_installed` in the CrossOver-missing arm turned the replay red (34 items); switching the WR-01 marker filter turned 8 incident tests red. Both were reverted (`git diff` empty).

## Task Commits

1. **Task 1 (tracer): the inconclusive pre-flight incidents as behavioural tests** - `94b4fc409` (test)
2. **Task 2: the offline gate replayed against every launch golden** - `c04b76c76` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The gate's call list is not compared**
- **Found during:** Task 2
- **Issue:** each launch item records `gate.calls`, the oracle's dependency calls of `isCrossoverMissing` (a locator call and an existence check). Rust has no callback layer to record them.
- **Fix:** the replay compares `gate.input`, `gate.verdict` and `launch`, and the locator and existence reads are covered by the `is-missing` goldens and the locator tests (87-44). Recorded in the test header.
- **Files modified:** `tests/golden_decision.rs`
- **Committed in:** `c04b76c76`

**2. [Process] Several plan assertions were already true**
- The plan's Task 1 asks to "complete the two-probe inconclusive branch in `preflight_crossover` and `decide_launch_engine`", and Task 2 to "complete every branch". Both were done in 87-45 (see the carry-forward note), so the Rust production code gained no branch. The work is the verification: the incident tests, the gate replay and the mutation checks.

**3. [Process] `decision/offline.rs` is a re-export, not the predicate's home**
- The plan names `gamelib_engine::decision::offline::offline_launch_certainly_blocked`. That path resolves (re-export); the function stays in `gamelib_engine::offline` where `engine switch` and its tests already use it.

---

**Total deviations:** 3 (1 Rule 3 comparison scope, 2 process notes)
**Impact on plan:** none on the goals: SC1's policy is proven case by case before 87-50 composes it.

## Known Gap

- One branch of the gate is unreachable from the goldens: the `automatic` and `current_pin_installed` early return under `restore-needs-pin`. The oracle derives `restoreNeedsAbsentPin` as "non-CrossOver marker and the current pin is not installed", so that combination never occurs in a recorded item. The unit test `offline::tests::the_two_arms` covers it. (Found by mutation: removing the branch left the replay green.)

## Issues Encountered

- `g29-kill-throws` stays unreplayed, as in 87-45 (Rust's stop never fails; `a_failed_wineserver_stop_is_logged_and_the_retry_still_runs` pins that instead). Its 8 launch items are the only launch items the gate counts do not cover; this is the 87-45 divergence, not a new one.

## Known Stubs

None.

## Threat Flags

None. T-87-84 is mitigated as planned: the decision goldens are untouched (`git diff --stat HEAD -- .../golden/decision` empty, checked after both commits) and the replay asserts the manifest count equals the case list, the floor of 80, and one `expected/` folder per case. T-87-SC accepted: no new crate.

## Self-Check: PASSED

- Created files verified on disk: `src/decision/offline.rs`, `tests/decision_incidents.rs`.
- Commits `94b4fc409` and `c04b76c76` are ancestors of HEAD; `commits: 2` measured from the ledger base `b8f6aca25`.
- `cargo test -p gamelib-engine --features testing` passes (123 lib tests, `golden_decision` 3, `decision_incidents` 26, the rest unchanged); `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings`, `cargo fmt -p gamelib-engine --check` and `cargo check -p gamelib-engine-cli` pass.
- Acceptance criteria: a `cx-inconclusive` golden and incident test pass with marker bytes unchanged; `golden_decision.rs` passes every case and asserts the manifest count (122) at or above 80; the golden diff is empty.
- Prettier check omitted as the tasks' verify blocks say: every path written is Rust.

## Next Phase Readiness

Ready for 87-47 (the pinned fallback engine) and, later, 87-50. 87-50 composes the gate inline as `launchEngine.ts` does (`is_crossover_missing`, `read_marker_summary` and `restore_needs_absent_pin`, the current pin's install check, then `offline_launch_certainly_blocked`). 87-55 still owes the rpc arms for the decision ops, and two Rust CrossOver locators still coexist until then. A live Mac decision run stays owed (87-45 D5).

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
