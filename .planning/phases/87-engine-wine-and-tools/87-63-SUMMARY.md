---
phase: 87-engine-wine-and-tools
plan: 63
subsystem: engine-launch-step
tags: [svc-02, f1, offline-gate, gap-closure, engine-log, regression-matrix, macos]
status: complete
root_cause_established: false

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-60 (the re-run contract), 87-61 (the shell's engine log), 87-64 (the gap context)"
provides:
  - "tests/offline_refusal.rs: the F1 reproduction through gamelib_engine::dispatch op engine_launch_select, with the 87-59 game's exact request, plus one named case per hypothesis H2 to H5"
  - "The offline gate writes one engine-log line with both offline signals, the bottle, the override, the CrossOver / pin / marker facts and its verdict, whether or not it refuses"
  - "A shell test: the gate's warning and its reading reach gamelib.log as [WARNING] / [INFO] [Shell] lines"
  - "launcher.engineStep.test.ts: the request's offline flag for the monitor's three states, the window before the request is built (the Epic prompt path) and a second Play"
  - "A wiring assertion that the launcher and the managers get the boot's one monitor"
affects: [87-69, 87-HUMAN-UAT, 87-RERUN-1-HUMAN-UAT]

actuals:
  tokens: 10700
  tasks: 3
  commits: 5

plan_head_before: d9623705bf35d5a4999b56f981013c9ca6abd0fd
plan_head_after: 161229b9273592c1a808f84462dda68cd8782dff
commits: 5

tech-stack:
  added: []
  patterns:
    - "A gate that can refuse writes its reading (inputs and verdict) on both outcomes, in words and booleans only"
    - "A parity golden does not compare a line the TS never wrote; the Rust-only line is pinned by its own test (D-16)"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/tests/offline_refusal.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/launch/step.rs
    - src-tauri/crates/gamelib-engine/tests/golden_launch.rs
    - src-tauri/src/engine_dispatch.rs
    - src/backend/__tests__/launcher.engineStep.test.ts
    - src/backend/storeManagers/__tests__/createStoreManagers.test.ts

key-decisions:
  - "F1's root cause is NOT established: every crate, shell and TS reproduction was green at HEAD. Rather than guess a fix, the gate now writes its reading so the 87-69 re-run names the cause from gamelib.log."
  - "The reading line is not compared by golden_launch (no TS counterpart, D-16); offline_refusal.rs pins its exact text instead."
  - "The gate's truth table, the refusal and the dialog are untouched (no second offline check, no change to offline_launch_certainly_blocked)."

requirements-completed: [SVC-02]

duration: 23 min (approximate; the start time was not recorded, taken from the previous plan's last commit)
completed: 2026-11-25
---

# Phase 87 Plan 63: The F1 offline refusal reproduced and instrumented Summary

**F1 does not reproduce at the dispatch layer, the shell or the TS caller, so no root cause is named; instead the offline gate now writes its inputs and verdict on every offline launch, and a 17-case regression matrix pins the refusal, the zero-fetch rule and that line.**

## Outcome against the plan's truths

| # | Truth | Result |
|---|-------|--------|
| 1 | Offline, pin absent, CrossOver missing, Automatic, non-Steam launch with its own bottle: refused before the decision, dialog reason `offline`, log line, zero fetches | MET at HEAD and pinned: `the_live_request_offline_with_no_pin_and_no_crossover_is_refused_before_any_fetch` |
| 2 | Holds for the exact request launcher.ts sends for the 87-59 game's settings, through `dispatch` op `engine_launch_select` | MET: the test sends that JSON (`wineVersion` `wine` / `Default Wine - Not Found`, per-game `wineCrossoverBottle`, shared default `winePrefix`, `engineOverride` automatic) |
| 3 | The root cause of F1 is named with the discriminating test that was red at HEAD | NOT MET. Nothing was red at HEAD at any layer. See "Root cause" |
| 4 | The gate's warning reaches gamelib.log as a WARNING `[Shell]` line, proven by a shell test | MET: `an_offline_launch_with_no_engine_is_refused_and_the_gate_warning_reaches_gamelib_log` (the engine log was wired by 87-61) |
| 5 | Every golden_launch, decision and launcher.engineStep case still passes | MET, no golden expectation changed (the new line is filtered from the replay's comparison, with the reason in the file's header) |

## Root cause: not established

**The red set at HEAD was empty.** All 12 cases of the tracer (the main case and H2 to H5), the shell test and the TS cases (H1) passed against the unmodified source. The crate is clean, and so are the layers above it that this plan can reach:

- **H2** (the gate's CrossOver verdict versus the decision's): green for a discovery-found clone with `cxbottle` and no `wine`, and for a stale locator memo whose bundle was moved aside. Both calls go through the one locator and the same two checks (`resolve_bin_dir`, `bin/wine` exists), so they cannot disagree on one launch.
- **H3** (the pin check): green with another pin's directory present, and with the current pin half installed (Wine without DXVK, no marker). `is_pinned_engine_installed` needs both halves and the pin's sha marker.
- **H4** (the effective engine id): green for a stored `automatic`, for no stored override with a `crossover` wine (derived automatic), and a forced `crossover` override starts no fetch (the decision answers unavailable).
- **H5** (a path past the gate): green for no game bottle (offline, creating it refuses without a fetch), a `setup` call, and a second select for the same Play.
- **H1** (the TS request): green for the monitor in `offline`, `check-online` and `online`, for a monitor that moves to `check-online` while the launch reads the game's settings (the window the Epic offline prompt sits in), and for a second Play after the network returns. Nothing in `launchEngineStep.ts`, `enginewine/launch.ts`, the sidecar's RPC layer or the shell's `rpc_engine_op` drops or defaults the flag, and the launcher and the managers receive the same `deps.onlineMonitor`.

**What the 87-59 evidence still says, and cannot be reconciled with the code as read.** The dialog text was `download-failed failed-to-get-headers`. That text only exists when `ensure_pinned_engine` reached the network: `do_ensure` answers `offline no network connection` first when the context's online flag is false, and the gate answers `(offline)` when the request's flag is true. So the live Play had the context flag TRUE and the gate not firing, while the sidecar's connectivity log showed the monitor in `check-online` from 20:57:57 through both presses (no `online` line, no renderer override). Two readings of the monitor reached Rust, and neither matches the log. The remaining candidates, none provable here:

1. `engine_set_online(false)` did not reach the context at 20:57:57 (the sidecar swallows a rejected call, and the call is dispatched on the shell's worker), **and** the gate did not fire for a reason this fake HOME does not model;
2. the live profile differs from every world modelled here in an input the gate reads (a stored game config, a marker, a CrossOver the sandbox hides from `exists()` but not from another read);
3. the 87-59 build was not the code at this HEAD.

**What changed so the next run can name it.** The gate wrote a line only when it fired, so a launch it let through left nothing in any log (the engine log was also unwired until 87-61). It now writes one line whenever either offline signal says offline, refused or not:

`Engine: <key> offline gate: request-offline=<b> context-online=<b> on-bottle=<b> override=<id> [crossover-missing=<b> current-pin-installed=<b> marker=<kind|none> restore-needs-pin=<b>] verdict=<blocked:<arm>|proceeds|not-applicable>`

On 87-69's item 1 offline sub-check, that single line separates the candidates: `request-offline=false` is the TS caller (H1); `request-offline=true context-online=true` is the lost `engine_set_online` (candidate 1); `verdict=proceeds` with `crossover-missing=false` is a CrossOver verdict the sandbox does not hide, and `current-pin-installed=true` is the pin check. A re-run with no such line at all means the request never reached the gate (a different path to the dialog).

## What was built

### Task 1: tracer (`tests/offline_refusal.rs`, commit 4978fb5b6)

A fake HOME with the game's bottle `GameLib-legendary-54f79...` (a fixture crossover bottle), the stored game config on disk (where the real step reads the engine from), an empty `tools/steam-engines`, no CrossOver in any location the locator or the discovery reads, a scripted spawn runner, and a `Fetch` that counts every request. Twelve cases: the main case, the flag reaching the gate while the context says online, the opposite disagreement, and H2 to H5. All passed at HEAD. The tracer gate (re-run of `<verify>`) passed, so expansion continued.

### Task 2: the shell test and the gate's reading (commits 9009a96cd, 06840dac0, 161229b92)

- Shell test (`engine_dispatch.rs`): the shell's own `build_ctx` with a test logger, the 87-59 request through `dispatch_sync`, the refusal, and the gate's warning (once, `[WARNING] [Shell]`) and reading (once, `[INFO] [Shell]`) in the real `gamelib.log`. macOS only, like the engine layer.
- RED (06840dac0): three cases failed at HEAD on the missing reading line (`gate lines: []`); the online and no-path cases passed vacuously and guard the other side.
- GREEN (161229b92): `step.rs` writes the line (`Step::note`, `offline_gate_line`). No behaviour change: same truth table, same refusal, same dialog, same warning. The line is not part of the launch log (`log_lines`), only the engine log, so the TS caller's lines are unchanged.
- `golden_launch.rs` filters the line from the replay's comparison and records the reason in its header (the TS wrote nothing when the gate let a launch through; a fix is never mixed into a parity port, D-16). No oracle file changed.

### Task 3: the TS half (commits eb7c14f86)

A guard only: no source edit, because nothing was red (H1 is not the cause). `launcher.engineStep.test.ts` gained the three monitor states, the read-when-built window and the second Play; `buildLauncher` takes the monitor. `createStoreManagers.test.ts` gained the wiring assertion (the launcher and the managers get one `deps.onlineMonitor`, no other monitor is ever given, none is constructed there).

## TDD Gate Compliance

The plan is `type: execute`; Task 2 carried `tdd="true"`. RED `test(87-63)` 06840dac0 precedes GREEN `feat(87-63)` 161229b92. RED evidence: the three target tests `the_gate_writes_its_inputs_and_verdict_when_it_refuses`, `the_gate_says_so_when_it_is_not_applicable_to_an_offline_request` and `the_gate_names_a_disagreement_between_the_request_and_the_context` failed on `assertion left == right failed: gate lines: []` (the planned assertion, the right reason; the crate compiled and 14 other cases passed). The reference's `check tdd-red-evidence` classifier takes TAP, JUnit, swift, unittest and go reports, and `cargo test` prints none of them, so the machine check could not be run; the semantic assessment above is the evidence. No REFACTOR commit.

## Deviations from Plan

### Auto-fixed / added

**1. [Rule 2 - Missing critical functionality] Gate reading line instead of a root-cause fix**
- **Found during:** Task 2
- **Issue:** Tracer and TS cases were all green, so there is no named cause to fix. The gate and the download had no log of what they read, which is why F1 could not be diagnosed from the 87-59 logs ("no error logging" is the Rule 2 class).
- **Fix:** the one-line engine-log reading described above; `golden_launch.rs` does not compare it.
- **Files modified:** `launch/step.rs`, `tests/golden_launch.rs`, `tests/offline_refusal.rs`, `src/engine_dispatch.rs`
- **Commits:** 06840dac0, 161229b92

**2. [Rule 3 - Blocking] The shell test lives in `engine_dispatch.rs`, not `engine_log.rs`**
- Matches the plan's file list and the `cargo test --bin gamelib-shell engine_dispatch` filter; it builds its own small logger instead of reusing `engine_log.rs`'s private test helpers.

**3. [Scope] One file outside the plan's list: `storeManagers/__tests__/createStoreManagers.test.ts`**
- The wiring assertion needs a home next to `createStoreManagers`; `bootstrap.ts` (named in the plan) was not edited. Commit eb7c14f86.

**Total deviations:** 3 (1 Rule 2, 1 Rule 3, 1 scope). **Impact:** plan truth 3 (the named root cause) is unmet; the instrumentation is the route to it.

## Known Stubs

None.

## Observations (not fixed; out of scope)

- `LaunchSelectRequest.offline` is `#[serde(default)]`: a caller that omits it silently disables the gate (fails open). Every in-repo caller sends it and the TS type requires it, so it is not the F1 cause, but making it required would turn a forgotten flag into `bad-args`. Left for the planner (it changes the request schema, D-14).
- The module doc of `launch/step.rs` still says the engine log is `None` in the app; 87-61 wired it. Stale comment only.
- `cargo clippy --bin gamelib-shell --all-targets -- -D warnings` fails with 18 existing errors in `main.rs`, `login_window/devtools.rs`, `login_window/humble_open.rs` (none in files this plan touched). The plan's verify does not run it.
- `gsd_run windows append` refused (the `.planning/WINDOWS.md` table disagrees with its fenced JSON for row 3, pre-existing), so the unmet truth is recorded here and not in the ledger.

## Verification

- `cargo test -p gamelib-engine --features testing --test offline_refusal --test golden_launch --test golden_decision --test decision_incidents`: 17, 8, 3, 26 passed.
- `cargo test -p gamelib-engine launch::`: 24 passed. Whole crate with `--features testing`: no failure.
- `cargo test --bin gamelib-shell engine_dispatch`: 32 passed. `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings`, `cargo fmt -p gamelib-engine --check`, `rustfmt --edition 2021 --check src/engine_dispatch.rs`: clean.
- `pnpm exec jest --runTestsByPath` on `launcher.engineStep`, `launcher_launchSingleFlight`, `createStoreManagers`: 34 passed. `pnpm codecheck`: clean. `npx prettier --check` on the two TS test files (not ignored): clean.

## Next Phase Readiness

87-69's item 1 offline sub-check must keep `gamelib.log` from the run: the line `Engine: legendary:<id> offline gate: ...` is the discriminating evidence for F1 (see "Root cause"). If the line shows the gate proceeding, the fix goes at the layer it names.

## Self-Check: PASSED

- Files: `offline_refusal.rs`, `step.rs`, `golden_launch.rs`, `engine_dispatch.rs`, `launcher.engineStep.test.ts`, `createStoreManagers.test.ts` all FOUND.
- Commits: 4978fb5b6, 9009a96cd, eb7c14f86, 06840dac0, 161229b92 all reachable from HEAD; `commits: 5` measured from the ledger (`d9623705b..161229b92`).
