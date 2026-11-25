---
phase: 87-engine-wine-and-tools
plan: 76
subsystem: gap-closure-offline-warning-engine-verdict
tags: [gap-closure, svc-02, rf5, d-06, offline-gate, engine-state, launch]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-63 offline gate (offline_launch_certainly_blocked in the launch step); 87-73 launch() dialog onClose lifecycle"
provides:
  - "offline_gate_verdict(ctx, on_bottle, bottle_name, effective_id) in launch/step.rs: the offline gate's inputs and verdict gathered once, called by the step and by get_engine_state"
  - "EngineState.offlineLaunchRefused (Rust offline_launch_refused): a read-time boolean on the engine_state_get reply only, never persisted and never published in engineStateChanged"
  - "launch() reads getEngineState before the generic offline warning and skips the warning when the engine will refuse the launch itself"
affects: [87-77, 87-78, 87-79]

requirements-completed: []

actuals:
  tokens: 6900
  tasks: 2
  commits: 4

plan_head_before: 809fc000a09588f29c186b96fa5c36c4355dd86b
commits: 4
plan_head_after: bbbc325abfdecc1a6d2837bb8fb22b23e7c8bdcf

tech-stack:
  added: []
  patterns:
    - "A read-time verdict on a state reply: set on the read path after compute(), left None in compute() so every publish path (record_launch_decision, the notice re-pushes) stays without it"
    - "A shared gate-input function used by the step and the state, with a test that drives both over the gate matrix"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/tests/offline_state_verdict.rs
    - src/frontend/helpers/__tests__/offlineWarningEngineVerdict.test.ts
  modified:
    - src-tauri/crates/gamelib-engine/src/launch/step.rs
    - src-tauri/crates/gamelib-engine/src/state/engine_state.rs
    - src-tauri/crates/gamelib-engine/tests/golden_state.rs
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/state/deltas.json
    - src/common/types/engine.ts
    - src/frontend/helpers/library.ts
    - src/frontend/helpers/__tests__/launchOptionPicker.test.ts

key-decisions:
  - "87-76: the verdict is Some(bool) on every engine_state_get read, not only when true, and the golden_state replay drops the key after checking it is a boolean (deltas.json entry a-state-read-carries-the-offline-launch-verdict)"
  - "87-76: a Legacy engine reads false (the step returns before its gate), computed in get_engine_state because override_of() maps Legacy to Automatic"

duration: about 45 min
completed: 2026-11-25
---

# Phase 87 Plan 76: Offline Warning Skips When the Engine Refuses Summary

**An offline Play of a game whose launch the engine will refuse now shows only the engine's refusal dialog: `engine_state_get` carries `offlineLaunchRefused`, computed by the very function the launch step's offline gate uses, and `launch()` skips the generic "might not work properly offline" warning when it is true.**

## What was built

**Task 1 (tracer, engine, `c83c6273c`).** The gate's input gathering moved out of `select_engine_for_launch` into `pub(crate) async fn offline_gate_verdict` in `launch/step.rs`. It returns `None` when the gate does not apply (not on the game's bottle, or an engine other than Automatic or CrossOver) and otherwise the `OfflineRefusalInput` and the `offline_launch_certainly_blocked` verdict. The step calls it only when `args.offline`, and its `offline gate:` note line and refusal are where they were. `get_engine_state` calls the same function after `compute()` and sets `EngineState.offline_launch_refused` (serialized `offlineLaunchRefused`, skipped when `None`); `compute()` leaves it `None`, so `record_launch_decision` and every notice re-push publish a state without the key.

`offline_state_verdict.rs` has six cases. The matrix builds two identical fake profiles per point (one for the state read, one for the select, so neither sees the other's caches) and asserts the state's field equals "`engine_launch_select` with `offline: true` refused with the gate's own warning". It covers CrossOver missing or healthy, pin installed or absent, three bottle markers (crossover, pinned, none) and three overrides (automatic, crossover, a pinned engine), plus an off-bottle plain prefix: 37 points, a mix of refusals and non-refusals asserted. The three named cases, a published state without the key, and a read that publishes nothing are separate tests.

**Task 2 (renderer, `bbbc325ab`).** `EngineState.offlineLaunchRefused?: boolean` is typed with a doc comment. `launch()` calls `engineRefusesOfflineLaunch(appName, runner)` when `notPlayableOffline`: a try/catch around `window.api.getEngineState({ runner, appName })` that answers true only for `offlineLaunchRefused === true`. On true it logs the fixed line `Offline warning skipped: the engine refuses this launch offline` once and returns `proceedToLaunch()`; a false, absent or null state and a rejected or thrown read fall through to the existing warning with 87-73's `onClose`. A game playable offline never reads the state.

## Tracer feedback gate

`gate` was not `blocking-human`; the tracer `<verify>` ran green end to end (offline_state_verdict, offline_refusal, golden_state, golden_launch, roundtrip_state, `launch::` unit tests, clippy `-D warnings`, `cargo fmt --check`) before Task 2 started.

## Verification

- `cargo test -p gamelib-engine --features testing --test offline_state_verdict --test offline_refusal --test golden_state --test golden_launch --test roundtrip_state`: 6, 17, 9, 8, 7 passed. `cargo test -p gamelib-engine launch::`: 24 passed. Clippy and fmt clean.
- RED first: the new matrix and named cases failed at HEAD (field absent, `Null` against `true`/`false`) before the code change, and the renderer's refused case timed out on the warning waiting for a button.
- `pnpm exec jest` over `offlineWarningEngineVerdict`, `launchDialogsSettle`, `launchOptionPicker`, `libraryLaunchSteamUpdatePrompt`: 22 passed. `pnpm codecheck` clean. `npx prettier --check` over the four renderer paths: clean, each `ignored: false`. ESLint over the changed renderer files: clean.
- Acceptance: `git grep -c offlineLaunchRefused -- src-tauri/crates/gamelib-engine/src` lists step.rs (doc) and engine_state.rs; `offline_gate_verdict(` is 1 in engine_state.rs and 2 in step.rs; `offlineLaunchRefused` is 1 in `engine.ts`; the fixed line is 1 in `library.ts`.
- No IPC schema needed a change: the `getEngineState` reply is typed only on the renderer side (`ipc/engine.ts`) and the sidecar resolver passes the Rust reply through.

## Deviations from Plan

**1. [Rule 1 - Bug] `launchOptionPicker.test.ts` WR-01 depended on the warning opening synchronously.**
- **Found during:** Task 2 (plan lists it in `<verify>` but not in `files_modified`)
- **Issue:** the case called `launch({notPlayableOffline: true})` and asserted the dialog queue in the same tick. The warning now opens one round later, after the state read, so the queue was empty.
- **Fix:** the harness gains `getEngineState` (resolving `null`) and `logInfo` mocks, and the case awaits `jest.advanceTimersByTimeAsync(0)` after calling `launch()`. The assertions are unchanged.
- **Files modified:** `src/frontend/helpers/__tests__/launchOptionPicker.test.ts`. **Commit:** `bbbc325ab`.

**2. [Process] Commit count.** `commits: 4` is measured from the ledger base; two of the four (`7f08939f1` docs(94), `69847af6e` feat(88.1-07)) are other sessions' commits on main in the same window. This plan's own commits are `c83c6273c` and `bbbc325ab`. Both task commits held only this plan's files (`git show --stat HEAD` checked after each).

**3. [Process] Scope.** STATE.md: only `state.record-metric` and `state.add-decision` ran; no `state.advance-plan`, `state.record-session` or `state.update-progress`. `requirements.mark-complete` for SVC-02 was not run (its live half is proven only at 87-79).

**Total deviations:** 1 auto-fixed (Rule 1), 2 process notes. **Impact:** none on scope.

## Known Stubs

None.

## Threat Flags

None. T-87-148 is mitigated as planned: the verdict comes from the step's own gate function, the matrix test asserts the state equals the step's refusal, and any read failure shows the warning. T-87-149 (accepted): a fixed-text log line and a boolean.

## Issues Encountered

None.

## Next Phase Readiness

87-77 can proceed (it owns `launch/settings.rs`; this plan touched `launch/step.rs` only for the extracted gate function). The live proof is re-run 2 items 1 and 2 (87-79): an offline Play with CrossOver missing and no pin must show only the engine's "couldn't download its built-in engine (offline)" dialog, with `Offline warning skipped: the engine refuses this launch offline` in the log.

## Self-Check: PASSED

- FOUND: `src-tauri/crates/gamelib-engine/tests/offline_state_verdict.rs`, `src/frontend/helpers/__tests__/offlineWarningEngineVerdict.test.ts`
- FOUND: `c83c6273c`, `bbbc325ab` (ancestors of HEAD)
