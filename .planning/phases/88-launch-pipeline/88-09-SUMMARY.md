---
phase: 88-launch-pipeline
plan: 09
subsystem: known-fix-launch-and-registry
tags: [knownfix, launch-overrides, registry, dll-overrides, wine-command-core, golden-replay, helper-spawn, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 08
    provides: the known-fix reader (read_known_fixes, read_known_fix_profile), the order-preserving jsvalue.rs and the golden replay pattern
  - phase: 88-launch-pipeline
    plan: 05
    provides: golden/launch_overrides (19 cases) recorded from knownFixLaunch.ts
  - phase: 88-launch-pipeline
    plan: 06
    provides: golden/registry (57 cases, spawns.json, calls.json) and classes.json (`knownfix.registry.reg_add` is helper)
provides:
  - gamelib-knownfix launch.rs (KnownFixLaunchOverrides, resolve_exe_override, read_launch_overrides)
  - gamelib-knownfix registry.rs (ValidRegistryFix, validate_registry_fixes, dll_overrides_to_registry_fixes, profile_registry_fixes, command_parts, value_is_set, prefix_dir, RegistryRun, WineRegistryRun, apply_registry_fixes, apply_known_fix_profile_registry, apply_bridge_registry_fixes, REGISTRY_FIX_TIMEOUT)
  - ops knownfix_launch_overrides, knownfix_apply_profile_registry, knownfix_apply_registry (strict object args, null answers, fixed literals)
  - KnownFixCtx.wine and KnownFixCtx.wine_host, set by the shell from wine_dispatch and by the CLI over the fake HOME
  - tests golden_launch_overrides.rs (LAUNCH_OVERRIDES_FLOOR 19 on unix) and golden_registry.rs (REGISTRY_FLOOR 57)
affects: [88-10, 88-11, 88-12, 91]

actuals:
  tokens: 37400
  tasks: 3
  commits: 4
commits: 4
plan_head_before: 0b5b8886a62d3ce23d52dd41c19296785f49bf66
plan_head_after: 394c74855a7bd4a6a1c09a3a3f1018addc983e89

tech-stack:
  added: []
  patterns:
    - "a RegistryRun seam whose run takes a cancel token: the applier owns the 15 s bound and the token, the run owns the kill, so the Rust side has no hand-rolled kill (the production run hands the token to run_wine_command, whose child is a gamelib-proc helper)"
    - "a launcher-path golden replays through the real wine command core on a ScriptedSpecRunner and compares the whole spawn (program, argv, full env, cwd); the calls the TS recorded are derived back from the spawns"
    - "a paused tokio clock (start_paused) replays a 15 s bound in no wall time; registry files are read with std::fs inside the applier because tokio::fs's blocking pool can let the auto-advance fire early"

key-files:
  created:
    - src-tauri/crates/gamelib-knownfix/src/launch.rs
    - src-tauri/crates/gamelib-knownfix/src/registry.rs
    - src-tauri/crates/gamelib-knownfix/tests/golden_launch_overrides.rs
    - src-tauri/crates/gamelib-knownfix/tests/golden_registry.rs
  modified:
    - src-tauri/crates/gamelib-knownfix/src/lib.rs
    - src-tauri/crates/gamelib-knownfix/src/ctx.rs
    - src-tauri/crates/gamelib-knownfix/src/reader.rs
    - src-tauri/crates/gamelib-knownfix/Cargo.toml
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/launch_overrides/deltas.json
    - src-tauri/crates/gamelib-knownfix-cli/Cargo.toml
    - src-tauri/crates/gamelib-knownfix-cli/src/main.rs
    - src-tauri/crates/gamelib-knownfix-cli/tests/cli.rs
    - src-tauri/src/knownfix_dispatch.rs
    - src-tauri/src/wine_dispatch.rs
    - src-tauri/Cargo.lock

key-decisions:
  - "The launcher's `reg add` is asked with protonVerb `runinprefix` and the prefix check on; only the Steam bridge uses `run` with the check skipped. The plan text said `run` for both; the goldens (calls.json, spawns.json PROTON_VERB) and the TS say otherwise, and D-20 is to match the TS, so RunOptions carries the two sets (LAUNCHER_RUN_OPTIONS, BRIDGE_RUN_OPTIONS)"
  - "KnownFixCtx gains the wine host facts beside the Arc<WineCtx>: the command core takes the process environment as an argument and this crate reads none, so a wine child with no host environment would run without PATH or HOME. The shell takes them from wine_dispatch::wine_run_host (the same source the wine ops use), the CLI from its own process"
  - "A run answers one of Code, Killed(pid), Cancelled or Failed, and the applier alone logs the timeout. After the 15 s cancel it waits at most 2 s for the run to say it killed its child, then abandons the run (the helper reaper owns the orphan); nothing waits without a bound"
  - "Once shutdown has begun apply_registry_fixes starts nothing more and a run ended by the shutdown token logs nothing; the whole application also holds the knownfix registrant through guarded"
  - "The reader's profile values are plain JSON, so a warning that echoes an invalid entry from a profile read through the reader lists its keys sorted; the pure functions take the order-preserving JsValue so the goldens replay exactly"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "resolve_exe_override and read_launch_overrides replay all 19 golden/launch_overrides cases (results and events): launchArgs pass through, exeOverride is realpath-contained inside the realpath'd install and a regular file, every failure warns and keeps the default exe"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-knownfix/tests/golden_launch_overrides.rs#every_launch_override_golden_replays"
        status: pass
      - kind: unit
        ref: "launch.rs#an_override_through_a_symlink_outside_the_install_folder_is_refused, and a planted mutant that removes the realpath containment fails 4 cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "The registry module (validate, dllOverrides compile, profile fixes, command parts, value_is_set, prefix_dir) and apply_registry_fixes replay all 52 recording-seam golden/registry cases (results, events, calls); planted mutants of the DWORD compare, the name bound, the line-continuation guard and the timeout each fail cases"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-knownfix/tests/golden_registry.rs#every_registry_golden_replays"
        status: pass
    human_judgment: false
  - id: D3
    description: "A reg add that never settles is cancelled at 15 000 ms on a paused clock (no wall time), logs the timeout line with the pid when the run reports one, and the next fix still runs; a run that ignores the cancel is abandoned after a 2 s grace"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "golden_registry.rs#a_run_that_never_settles_is_cancelled_at_15_s_and_the_next_fix_still_runs and #a_run_that_ignores_the_cancel_is_abandoned_after_the_grace_with_the_no_child_warning"
        status: pass
    human_judgment: false
  - id: D4
    description: "The 5 launcher-path cases run through run_wine_command on a scripted spawn seam and match golden spawns.json (program, argv, full env, cwd), every spawn's call site is `knownfix.registry.reg_add` and classes.json maps it to helper; a real child through gamelib-proc's SpecProcRunner is ended by the run's cancel token and is gone afterwards (unix)"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "golden_registry.rs#every_registry_golden_replays (launcher-path cases), #every_recorded_reg_add_is_the_one_call_site_and_the_class_is_helper, #a_cancelled_reg_add_is_a_helper_child_that_is_gone_afterwards; a planted launcher protonVerb change fails 16 differences"
        status: pass
    human_judgment: false
  - id: D5
    description: "Ops knownfix_launch_overrides, knownfix_apply_profile_registry and knownfix_apply_registry exist with deny_unknown_fields object args, answer fixed `<op>:bad-args` / `<op>:not-ready` literals that never echo input, and are listed by gamelib-knownfix-cli ops; the shell installs the wine core into the context"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "lib.rs tests (the_launch_overrides_op_decodes_one_strict_object_and_never_echoes_input, the_registry_ops_decode_one_strict_object_and_say_not_ready_without_a_wine_core, the_registry_ops_answer_null_with_a_wine_core_and_no_profile), cli.rs (the_launch_overrides_op_prints_the_resolved_exe_for_a_seeded_install_over_a_fake_home, the_registry_ops_answer_null_for_a_game_with_no_profile_and_refuse_a_bad_call_over_a_fake_home), cargo test --bin gamelib-shell knownfix (7 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The Windows and Linux legs of both replays, and a live `reg add` against a real CrossOver or Wine prefix, were not run; only the macOS dev machine built and tested these crates"
    verification: []
    human_judgment: true
    rationale: "Cross-OS behaviour (path separators in the containment test, the OS's not-found text, symlink creation on Windows, the proton and wine spawn envs on Linux) is proven only by the first CI run of rust-test.yml; the launcher spawn is proven over a scripted seam, never against a real wine"

duration: 24min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 09: Known-fix launch overrides and registry fixes Summary

**Known-fix `launchArgs`/`exeOverride` (realpath-contained, T-88-20) and the tier-2 registry and dllOverrides fixes are Rust, replay all 19 launch and 57 registry goldens, and every `reg add` is a helper spawned through gamelib-wine's wine command core under a 15 s cancel the helper's group kill acts on.**

## Performance

- **Duration:** about 24 min (start time was not recorded at launch; estimated from the first commit and the plan's reading phase)
- **Tasks:** 3 (one tracer, one TDD, one auto)
- **Commits:** 4 (tracer, RED, GREEN, wine-core wiring)
- **Files:** 4 created and 11 modified; 15 changed, 3441 insertions and 10 deletions (Cargo.lock one line)

## Accomplishments

- **Tracer (Task 1):** `knownfix_launch_overrides` end to end through the CLI. `resolve_exe_override` ports the TS algorithm (shape check, realpath of the install, lexical containment, regular-file check, realpath containment) and keeps the default exe with the TS warning text on every failure. The one warning that carried a path in the TS ("could not be verified (Error: ENOENT ... '<path>')") carries the OS error's own text instead, and the info line names the relative override from the fix file; both are `deltas.json` entries citing the EngineLog rule. `golden_launch_overrides.rs` replays all 19 cases (symlink cases `#[cfg(unix)]`, named when skipped). A planted mutant that drops the realpath containment fails the four symlink-escape results and events. The tracer `<verify>` was re-run end to end before expansion.
- **Registry (Task 2, TDD):** `registry.rs` ports `validateRegistryFixes`, `dllOverridesToRegistryFixes`, `knownFixProfileRegistryFixes`, `buildRegistryFixCommandParts`, `wineRegistryValueIsSet`, `knownFixPrefixDir` and `applyRegistryFixes` over a `RegistryRun` seam. The pure functions take the order-preserving `JsValue`, so the "skipping invalid registry fix" lines echo each entry in its file's key order exactly. The applier reads each registry file once per application, skips values already set (info line with the file's base name only), bounds each (fix, view) at 15 000 ms by a cancel token and never returns an error. 52 recording-seam cases replay; the timeout cases run on a paused clock in no wall time.
- **Wine-core wiring (Task 3):** `WineRegistryRun` calls `run_wine_command` with `wait` false and the caller's cancel as the host cancel, so the child is whatever the context's spawn seam makes it, `gamelib-proc`'s `SpawnClass::Helper` in the app (`SpecProcRunner`), and the timeout kill is gamelib-proc's group kill. `apply_known_fix_profile_registry` (launcher: `runinprefix`, prefix check on) and `apply_bridge_registry_fixes` (bridge: `run`, check skipped, the Steam tier-2 profile read in the crate so the fix data has one owner) sit over it, with ops `knownfix_apply_profile_registry` and `knownfix_apply_registry`. The 5 launcher-path goldens compare the whole spawn (program, argv, the full environment map with no key gained or lost, cwd) against `spawns.json`, and `classes.json` maps `knownfix.registry.reg_add` to `helper`. A unix test starts a real child through `SpecProcRunner`, cancels the run's token and proves the child is gone.

## Task Commits

1. **Task 1 (tracer): launch overrides end to end** - `7f9aa7392` (feat)
2. **Task 2 RED: failing registry replay** - `f2f1f746b` (test)
3. **Task 2 GREEN: registry and dllOverrides over the RegistryRun seam** - `793380fb9` (feat)
4. **Task 3: registry ops over the wine command core, spawn-level replay** - `394c74855` (feat)

**Plan metadata:** the docs commits that follow this summary (STATE, ROADMAP, REQUIREMENTS).

## TDD Notes

- **RED (f2f1f746b):** `registry.rs` held only the public shapes with inert bodies, and `golden_registry.rs` replayed 52 cases plus the paused-clock timeout tests. The run failed on assertions for the planned behaviour: 65 result, event and call differences over 52 cases (`validate` answering `[]` where the golden holds the fix, no warning where the golden holds one) and the 15 s test failing at `0ns` against `15s`. No syntax, build or zero-test failure. Semantic assessment: the target tests executed and failed on the planned assertions. `an_application_after_shutdown_began_runs_nothing` passed against the inert stub, which is correct for a no-op and so proves nothing until the GREEN applier exists. `gsd check tdd-red-evidence` was not run: `cargo test`'s console output is not one of its supported report formats, and `workflow.tdd_mode` is off.
- **GREEN (793380fb9):** all 52 cases and the timeout tests pass; four planted mutants (the DWORD compare, the name bound 256 to 257, the 15 s constant, the continuation-line guard) each fail the replay and were reverted.
- **REFACTOR:** none.

## Decisions Made

See `key-decisions` above. In short: launcher `runinprefix` versus bridge `run` follows the goldens, the context carries the host facts beside the wine core, a run reports its own kill and the applier owns the bound, and a profile read through the reader echoes sorted keys.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's "protonVerb run" is the bridge's, not the launcher's**
- **Found during:** Task 2 (reading `calls.json` and `spawns.json`)
- **Issue:** Task 3's action says `WineRegistryRun` calls `run_wine_command` "with wait false and protonVerb run". The goldens and `applyKnownFixProfileRegistry` use `runinprefix` with the prefix check on for the launcher; only the bridge uses `run` with the check skipped.
- **Fix:** `RunOptions` with `LAUNCHER_RUN_OPTIONS` and `BRIDGE_RUN_OPTIONS`; the launcher-path replay compares `PROTON_VERB` in the full env, and a planted `run` for the launcher fails 16 differences.
- **Files modified:** `registry.rs`
- **Commit:** `793380fb9`, `394c74855`

**2. [Rule 2 - Missing critical] The wine core needs the host environment**
- **Found during:** Task 3
- **Issue:** The plan gives `KnownFixCtx` an optional `Arc<WineCtx>` only. `run_wine_command` builds the child's environment from a `WineHost` snapshot the caller supplies (the crate reads no environment), so a context with no host would spawn wine with no PATH or HOME.
- **Fix:** `KnownFixCtx.wine_host: WineHost` beside `wine`, set by `with_wine`; the shell takes it from `wine_dispatch::wine_run_host()` (made `pub(crate)`, the source the wine ops already use), the CLI from its own process environment.
- **Files modified:** `ctx.rs`, `knownfix_dispatch.rs`, `wine_dispatch.rs`, `knownfix-cli/src/main.rs`
- **Commit:** `394c74855`

**3. [Rule 1 - Bug] `decode` accepted a JSON array for an object argument**
- **Found during:** Task 1 (the op's bad-args test)
- **Issue:** serde decodes a struct from a JSON array of its fields in order, so `[["a","gog",null]]` was a valid `knownfix_launch_overrides` call.
- **Fix:** `decode` requires `Value::Object`; the existing strict-argument test still holds.
- **Files modified:** `lib.rs`
- **Commit:** `7f9aa7392`

**4. [Rule 2 - Missing critical] Argument bounds on the registry ops**
- **Found during:** Task 3
- **Issue:** `appName`, `appId` and `label` go into log lines and file names; the shell's reader channels bound them (1 to 256 UTF-16 units) but the new ops took any string.
- **Fix:** both registry ops reject an empty or over-256 value and a non-object `gameSettings` with the fixed `<op>:bad-args`.
- **Files modified:** `lib.rs`
- **Commit:** `394c74855`

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 missing critical). **Impact on plan:** none on scope; each is a correctness or boundary fix inside the plan's files, plus the `wine_dispatch.rs` visibility change.

## Behaviour that differs from the TS (recorded, not fixed)

- **No pid on the timeout line in the app.** gamelib-wine's `SpecOutput` does not carry the child's pid, so `WineRegistryRun` reports `Killed(None)` and the line reads `timed out after 15000 ms; killed reg add` without ` (pid N)`. A run that knows the pid (the replay's fake) prints it and the golden line matches byte for byte. `deltas.json` `timeout-kill-is-a-group-kill` already allows the pid to differ.
- **Profile-path warning key order.** A warning that echoes an invalid entry from a profile read through `reader::read_known_fix_profile` lists the entry's keys sorted, because the reader holds plain JSON. Echoes from `JsValue` input (the goldens) keep file order.
- **The TS "could not read launch overrides" catch** is not ported: the Rust reader cannot throw.
- **A registry value whose `reg add` ends by a signal** prints `code undefined` (the TS printed `null`). Not recorded in a golden.

## Issues Encountered

- `cargo fmt -p gamelib-shell --check` (in Task 3's `<verify>`) prints diffs for `src/ipc_contract.rs` only, the generated file that was rustfmt-unclean at HEAD; every file this plan touched is clean.
- The Windows and Linux legs were not run (D6).

## Known Stubs

None. The RED-phase inert bodies were replaced in the GREEN commit; nothing in the final files returns placeholder data.

## Threat Flags

None. The two new ops spawn children, which T-88-21 and T-88-22 already cover (argv vector to `run_wine_command`, never a shell string; 15 s cancel per run; the op holds the knownfix registrant through `guarded`). Neither op has a native channel yet; 88-12 adds the shims.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `knownFixLaunch` is available in Rust for Lane B's 91, and both the launcher and the bridge can call the registry ops through one owner; 88-12 wires the shims.
- Open for a live run: a real `reg add` against a real CrossOver bottle and a Wine or Proton prefix, and the Windows and Linux CI legs.

---
*Phase: 88-launch-pipeline*
*Completed: 2026-11-25*

## Self-Check: PASSED

- FOUND: `src-tauri/crates/gamelib-knownfix/src/launch.rs`, `src/registry.rs`, `tests/golden_launch_overrides.rs`, `tests/golden_registry.rs`
- FOUND commits: `7f9aa7392`, `f2f1f746b`, `793380fb9`, `394c74855` (all ancestors of HEAD)
- Acceptance: golden_launch_overrides compared 19 cases (floor 19 on unix, plan asks 11); golden_registry compared 57 (floor 57, plan asks 50); the timeout case passes on a paused clock in 0.06 s of wall time; `gamelib-knownfix-cli ops` lists `knownfix_apply_profile_registry`, `knownfix_apply_registry` and `knownfix_launch_overrides`; the launcher-path cases compare full spawns and pass
- Plan verification: `cargo test -p gamelib-knownfix` (45 lib, 4 bundled seeds, 3 launch, 6 reader, 9 registry), `cargo test -p gamelib-knownfix-cli` (7), `cargo test --bin gamelib-shell knownfix` (7), `cargo clippy -p gamelib-knownfix -p gamelib-knownfix-cli --all-targets -- -D warnings` clean, `cargo fmt --check` clean for the knownfix crates and for every shell file but the generated `ipc_contract.rs`
