---
phase: 87-engine-wine-and-tools
plan: 50
subsystem: engine
tags: [rust, launch-step, engine-selection, dialogs, notices, golden, fnd-06]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the 77 launch goldens (87-15), the decision, offline gate, bottle switch, per-game bottle, pinned-engine download and engine state (87-38 to 87-49)
provides:
  - gamelib_engine::launch::{step, settings, dialogs, LaunchState}
  - ops engine_launch_select, engine_dialog_displayed
  - EngineCtx fields launch_settings, launch_state, display_acks
affects: [87-51, 87-52, 87-55, 87-56]

actuals:
  tokens: 30000
  tasks: 2
  commits: 4

plan_head_before: de86e417bfaa9d41ee5ff1b05053384bc11008a9
plan_head_after: c24dd982d6eccae1b322511fb6584e749da8be03

tech-stack:
  added: []
  patterns:
    - "the TS Partial<LaunchEngineDeps> as a StepDeps trait: CtxStepDeps is the real set, the golden replay scripts the four collaborators the TS oracle scripted and runs the decision over real files and scripted spawns"
    - "one ordered trace shared by the scripted collaborators, the host surfaces (a TraceUi that expands one show_dialog into the TS raise, ack tracking and frame) and the status emitter, compared entry by entry to the oracle's"
    - "a dialog's acknowledgement is a pending table plus a bounded task holding a shutdown registrant, ended by the ack, the timeout or the quit"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/launch/step.rs
    - src-tauri/crates/gamelib-engine/src/launch/settings.rs
    - src-tauri/crates/gamelib-engine/src/launch/dialogs.rs
    - src-tauri/crates/gamelib-engine/tests/golden_launch.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/launch/mod.rs
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/bottles/per_game.rs
    - src-tauri/src/engine_dispatch.rs

key-decisions:
  - "The select op's reply is {kind, key, selection, prefix, logLines, launchSettings}: the plan named the first, second, third, fifth and sixth; the prefix is added because the TS launcher branches on it (a plain prefix versus a bottle) and the goldens record it."
  - "The registry and the ledger are written the way a TS-initiated op writes them: the selection is set and cleared quietly (the reply already carries it, so no engineSelectionChanged frame), the ledger marks the bottle and remembers it in LaunchState for 87-51's end of launch."
  - "An unreadable pin table at the decision is a refused launch with the override-unavailable dialog (the TS could not reach that state; a silent no-op launch would be worse)."
  - "The interpolation of the shared Catalog escapes its values like i18next's default; the goldens were recorded with escapeValue false. No golden value holds an escaped character, so the replay matches; a game title with an ampersand in {{title}} would read &amp; as it does in the shipped TS."

patterns-established:
  - "the per-launch bottle of an engine launch is released by whoever remembered it: LaunchState::take_ledger_bottle"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "D-01, SC1: Rust select_engine_for_launch runs the whole launch-time engine step (eligibility, effective engine, prefix, per-game bottle, decision with the G29 rule, offline refusal, first-need pinned-engine download, bottle switch with the DXVK refusals, registry and overlay context, decision record) and replies {kind, key, selection, prefix, logLines, launchSettings}; 53 of the 77 87-15 launch goldens replay with the same reply, trace of collaborators, dialogs, notifications, raise calls and engineStateChanged pushes, the other 24 are the deadline cases of 87-51"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-engine/tests/golden_launch.rs#every_launch_golden_this_plan_owns_replays (53 cases; floor 25 on the manifest and 53 on the replayed list)"
        status: pass
      - kind: unit
        ref: "lib.rs#the_launch_select_op_takes_a_strict_object_and_skips_where_the_engine_layer_does_not_apply"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-02: a refused attempt notifies, raises the window and shows the dialog under a new engine:<n> ack id every time; a notice and the fallback toast never raise or open a modal; the toast and dialog texts come from the gamelib catalog; the [engine-notice] log lines keep the TS text"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "golden_launch.rs#a_refused_attempt_raises_the_window_and_shows_a_dialog_every_time, #a_fallback_toast_is_a_notification_and_never_raises_the_window"
        status: pass
      - kind: unit
        ref: "launch/dialogs.rs tests (dialog, notice, headless, toast words, ack settles once, unconfirmed after the timeout, quit releases the registrant)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell engine_dispatch (an_engine_dialog_is_the_show_dialog_frame_with_an_engine_ack_id_and_a_notice_never_raises)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-20: the step never routes to bottled Steam; the closed EngineSelection has no such variant and a refused launch clears the registry and overlay"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "golden_launch.rs#every_launch_golden_this_plan_owns_replays (the refused cases leave registry and overlay null)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The window-raise rule on a real machine (a refused launch brings the window forward, a toast and a notice do not, a dialog's acknowledgement reaches Rust) and the log lines a user would need reaching a log are not exercised"
    verification: []
    human_judgment: true
    rationale: "The shell tests build a context over a fake profile with recording sinks and no AppHandle; the renderer's dialogDisplayed is not routed to the engine_dialog_displayed op yet (87-55) and ctx.log is None in the app. The live gate after the switch-over covers both."

duration: 22 min (host clock 16:05 to 16:27 UTC, 2026-11-23)
completed: 2026-11-24
---

# Phase 87 Plan 50: Launch-time engine selection and the engine dialogs in Rust Summary

**`select_engine_for_launch` runs the whole non-Steam launch engine step in `gamelib-engine` (eligibility, the decision with the G29 rule, the offline refusal, the first-need pin download, the bottle switch, the registry, overlay and decision record) and answers `{kind, key, selection, prefix, logLines, launchSettings}`; the refusal dialogs, the fallback toast and the notices run under the TS raise rules, and 53 of the 77 launch goldens replay with the same dialogs, notifications and raise calls.**

## Performance

- **Duration:** 22 min (host clock)
- **Started:** 2026-11-23T16:05Z
- **Completed:** 2026-11-23T16:27Z
- **Tasks:** 2 (tracer, then TDD)
- **Files modified:** 9 (4 created)

## Accomplishments

- **Task 1 (tracer):** `launch::step` composes every module ported so far behind a `StepDeps` trait; `CtxStepDeps` is the real set (the per-game bottle through `decide_creation_engine` and `CtxPerGameDeps`, the pin through `ensure_pinned_engine`, the switch through `prepare_bottle_for_engine` with the TS `prepareBottle`'s second half: a restore to CrossOver whose DXVK source is the pin asks for the pin and asks once more). `launch::settings` holds the overlay contexts and `get_launch_settings` (the CrossOver overlay with the context's bin dir over the selection's, the fallback bottle overlay, the plain-prefix overlay, the input never changed). `EngineCtx` gained `launch_settings`, `launch_state` and `display_acks`. Op `engine_launch_select`. The offline gate is composed inline from the 87-46 pieces (`offline_launch_certainly_blocked` over `is_crossover_missing`, the marker kind, the current pin and `restore_needs_absent_pin`). The tracer `<verify>` is automated only, so it was re-run end to end before Task 2 (golden replay, clippy, fmt, the full engine suite) and passed; no checkpoint.
- **Task 2 (TDD):** `launch::dialogs` (`show_engine_dialog`, `show_engine_notice`, `notify_engine_fallback`, `DisplayAcks`) and the dialog calls of every refusal site of the step plus the fallback toast. RED was the replay comparing the host surfaces (39 of 53 cases failed), GREEN the port. Op `engine_dialog_displayed`; a shell test through the installed `ShellEngineUi` shows one `showDialog` frame with an `engine:` ack id and a notice that only notifies.
- **Carry-forward 87-47 done:** `CtxPerGameDeps::ensure_pin` answered `Failed("the pinned engine is not installed")`; it now runs `ensure_pinned_engine` (Ready, aborted, or the failure text). `PerGameDeps::ensure_pin` returns a future that may borrow the deps so it can use the context; the implementations that return a `'static` future still compile unchanged.
- **Carry-forward 87-46 done:** the offline gate is a production composition in the step, not only verified against goldens.

## Task Commits

1. **Task 1 (tracer): launch-time engine selection end to end in Rust, matched to the 87-15 goldens** - `283ddc7c4` (feat)
2. **Task 2 RED: the launch goldens compare the notifications, window raises and dialogs** - `68300640d` (test)
3. **Task 2 GREEN: engine dialogs, the fallback toast and notices with their raise rules** - `cbb0dbf8f` (feat)
4. **The production switch dep asks for the pin when a restore has no DXVK source** - `c24dd982d` (test)

## Differences from the goldens

Named in the header of `tests/golden_launch.rs`:

- The 24 cases with `end`, `arm`, `advance`, `registry-clear` or `quit` steps are the launch deadline and the end of a launch (87-51); a test pins that they are the cases with those steps.
- One `show_dialog` is the TS window raise for the in-app dialog, the acknowledgement tracking and the frame; the replay expands one into the other. The ack id is `engine:<n>` where the TS had `ack-<n>`.
- The oracle's scripted probe failures are the engine's own text for a real spawn: `exit 3` is `code=3 stderr= stdout=`; an `invalid-bottle` probe (a name the launch never produces) is the inconclusive timeout of a starting title; the oracle's `other` refusal is `invalid-bottle` (the closed reason has no `other`).
- `sameObject` is value equality (Rust has no object identity); `inputUnchanged` is true by borrow.
- The engine's own `Engine: demo-status probe ...` line per spawn is not compared (the oracle's probe was scripted).

## Do the engine log lines reach a log? (open decision for the user)

No. `ctx.log` is `None` in the app (the shell has no `EngineLog`, 87-48), so the warnings this plan ports (`Engine: <key> engine override ... is unavailable`, `cannot switch engine`, `launch blocked before pre-flight while offline`, ...) and the `[engine-notice] key=... tag=... dispatched=...` and `display=confirmed|unconfirmed` lines reach no log in the app. They are fixed text plus the engine key, a tag and a reason; the `unavailable` and `could not be created` warnings carry a detail string from the engine layer. Whether to wire an engine log into `gamelib.log` is the open privacy decision and was not made here. The lines meant for the game's own launch log (`engine=crossover build=... reason=...`) do not depend on it: they travel in the reply's `logLines`.

## Decisions Made

See `key-decisions`. Beyond the frontmatter:

- The dialog's acknowledgement timeout is a real 15 s task, not lazy expiry: an unconfirmed dialog is a diagnostic the TS logged on time, and the project's Rust rule is a registrant plus the token. The tests use a 20 ms timeout through `DisplayAcks::track`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 carried the whole selection flow, not only the healthy case**
- **Found during:** Task 1
- **Issue:** the refusal branches, the offline gate, the pin download and the bottle switch are one function; the tracer replays 53 goldens (the healthy case among them). Task 1 logs and refuses at each refusal site; Task 2's RED/GREEN is the dialogs, the toast and the notices (the replay's `COMPARE_UI` flag).
- **Commits:** `283ddc7c4`, `68300640d`, `cbb0dbf8f`

**2. [Rule 2 - Missing critical] The ctx-backed `ensure_pin` could not stay an installed-only check**
- **Found during:** Task 1
- **Issue:** with the first-need download in this plan, `CtxPerGameDeps::ensure_pin` answering "not installed" would make a first launch on a machine with no CrossOver fail to create its bottle. It now runs the fallback download (single flight, progress, hash check, shutdown); the context starts offline, so the old unit test became "the download is refused before any request".
- **Files modified:** `src/bottles/per_game.rs`
- **Commit:** `283ddc7c4`

**3. [Rule 3 - Blocking] Files outside the plan's list**
- `src/bottles/per_game.rs` (above) and `src/launch/mod.rs` (`LaunchState`, which 87-51's end of launch reads: the bottle the launch was marked running in).

**Total deviations:** 3 (1 Rule 2, 2 Rule 3). **Impact:** none on the goals.

## Issues Encountered

- A first replay run filtered out the probe's retry warning together with the per-spawn probe line; the golden does carry the warning, so only the per-spawn line is filtered.

## Known Stubs

None.

## Threat Flags

None. T-87-52 (raise rule): mitigated by the goldens and by tests: a toast and a notice record zero raise calls, a refusal raises every time, and `show_engine_notice` calls only `notify`. The op arguments (`engine_launch_select`, `engine_dialog_displayed`) are strict objects with bounded strings; an acknowledgement id must be `engine:` and digits before it is looked up. T-87-SC accepted: no new crate.

## What is not wired yet (owners)

- The TS launcher still runs its own `selectEngineForLaunch`; the ops have no shell rpc arms (`engine_launch_select`, `engine_dialog_displayed`) and the sidecar's `dialogDisplayed` handler does not forward `engine:` ids: 87-55 owns the arms and 87-52 the caller switch. Until then TS and Rust hold separate registry, ledger, overlay and state seq counters.
- The launch deadline, the process watch and the end of a launch (`LaunchState` is ready for it): 87-51.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

87-51 can arm the deadline from the registry and overlay context this step leaves (`ctx.launch_settings`, `ctx.registry`) and release `ctx.launch_state.take_ledger_bottle(key)`; its `golden_launch.rs` replay extends the same `replay` function and the 24 deadline cases.

## Self-Check: PASSED

- Commits `283ddc7c4`, `68300640d`, `cbb0dbf8f` and `c24dd982d` are ancestors of HEAD; `commits: 4` measured from the ledger base `de86e417b`.
- `cargo test -p gamelib-engine --features testing` passes (169 lib tests; `golden_launch` 6 tests, 53 cases replayed against a floor of 53, the manifest 77 against a floor of 25); `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings`, `cargo fmt -p gamelib-engine --check` and `rustfmt --edition 2021 --check src/engine_dispatch.rs` pass; `cargo test --bin gamelib-shell engine_dispatch` passes (30).
- `src/launch/step.rs`, `dialogs.rs`, `settings.rs` and `tests/golden_launch.rs` exist.

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
