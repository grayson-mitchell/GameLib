---
phase: 87-engine-wine-and-tools
plan: 21
subsystem: infra
tags: [rust, gamelib-wine, wine-env, valid-wine, run-wine-command, golden, replay, spawn-seam, umu]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the wine core vectors and goldens recorded from the TS (87-08), the WineCtx and SpecRunner seam (87-06), the crate-port pattern with golden replay and deltas.json (87-19)
provides:
  - gamelib_wine::wine_cmd::valid::valid_wine and is_mac_sonoma_or_higher, with WineInstallation, WineKind and WineHost
  - gamelib_wine::wine_cmd::env::{setup_env_vars, setup_wine_env_vars, build_wine_env_vars, GameSettingsView, EnvSnapshot, WineEnvPaths}
  - gamelib_wine::wine_cmd::command::{run_wine_command, WineCommandArgs, WineCommandResult, MAX_BUFFER} and prefix::verify_wine_prefix
  - ops wine_valid and wine_run_command, crate-only with no channel, shim or caller (D-06)
  - golden_wine_core.rs replaying 19 valid_wine vectors, 61 wine_env vectors and 16 wine_command goldens
  - golden/wine_command/deltas.json documenting the three places the Rust runner differs from the TS (D-19)
affects: [87-22, 87-24, Phase 88, DXVK, Winetricks and bottle-creation ports]

actuals:
  tokens: 22400
  tasks: 2
  commits: 3

plan_head_before: 944510a9ffde0a3ea017822da1b2eee09db6272b
plan_head_after: e18a06092091f3076d865c5e117dcffa37ec4683

tech-stack:
  added: []
  patterns:
    - "env builders as pure functions taking the platform, an EnvSnapshot of the process env and an exists closure, so a vector injects its inputs and production passes the real ones"
    - "the shell-read facts a crate may not read itself (process env, Darwin release, default settings, a caller cancel) travel in one WineHost value, serde-decodable so the op takes it as an optional second argument"
    - "a spawn future raced against a caller cancel without a task: the run's spec carries a child of the shutdown token, and the caller's cancel cancels that child and awaits the same run"
    - "async recursion avoided by splitting the checked entry (prefix check) from run_unchecked, which verify_wine_prefix calls"

key-files:
  created:
    - src-tauri/crates/gamelib-wine/src/wine_cmd/mod.rs
    - src-tauri/crates/gamelib-wine/src/wine_cmd/valid.rs
    - src-tauri/crates/gamelib-wine/src/wine_cmd/env.rs
    - src-tauri/crates/gamelib-wine/src/wine_cmd/command.rs
    - src-tauri/crates/gamelib-wine/src/wine_cmd/prefix.rs
    - src-tauri/crates/gamelib-wine/tests/golden_wine_core.rs
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_command/deltas.json
  modified:
    - src-tauri/crates/gamelib-wine/src/lib.rs

key-decisions:
  - "The facts the crate may not read travel as `WineHost` (`env`, `darwinRelease`, `defaultSettings`, and a non-serialised `cancel`), a per-call argument and not a WineCtx field, so ctx.rs is untouched. Both ops take it as an optional second argument; 87-24 builds it from the shell's process env and `os.release()`"
  - "`EnvSnapshot` is the whole process env, not the six read keys, because run_wine_command's merge base is `process.env` and the umu lookup scans its `PATH`"
  - "`flatpakHome` is `ctx.engine.paths.user_home` and `runtimePath` is `ctx.runtime_path`; if the shell's user_home differs from the TS flatpakHome under Flatpak, 87-24 passes the flatpak value as `user_home`"
  - "The builders return their logs as `EnvNote` values and run_wine_command logs them as fixed text: the TS error line named the wine and its lib paths, and the engine log never carries a profile path (T-86-15)"
  - "Output cap is 4 MiB per stream (`MAX_BUFFER`), above the 1 MiB spec default because a game's wine output is read by an installer or log tail, and bounded because MoltenVK once wrote 3.37 GB (spike 059)"
  - "A wine command with neither settings nor a default settings answers `Invalid wine` rather than a distinct error: the same refusal an unusable wine gets"
  - "A cancelled command skips the wineserver --wait; the TS had no cancel, and waiting on a prefix the caller just abandoned would defeat the cancel"

patterns-established:
  - "a golden replay whose runOptions events are compared to what the spawn seam can state (replace_env, timeout, label) and whose remaining event kinds are named and explained in deltas.json, with the test asserting the kind set so a new unexplained kind fails it"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "valid_wine gives the recorded boolean for every one of the 19 valid_wine.json vectors (wine, proton, crossover and toolkit, binaries present, missing and partly present, the Darwin 14 check) on a fake HOME"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_wine_core every_valid_wine_vector_gives_the_recorded_boolean"
        status: pass
    human_judgment: false
  - id: D2
    description: "setup_env_vars and setup_wine_env_vars give the recorded maps for all 61 wine_env.json vectors, given each vector's platform, env keys and existing paths"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_wine_core every_wine_env_vector_gives_the_recorded_maps"
        status: pass
    human_judgment: false
  - id: D3
    description: "run_wine_command gives the recorded result, spawn trace (program, argv, envDiff, cwd), warnings and tree for all 16 wine_command goldens, including the missing-prefix case that creates the prefix first and the invalid-wine cases"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_wine_core every_wine_command_golden_gives_the_recorded_spawn_trace_result_and_tree"
        status: pass
    human_judgment: false
  - id: D4
    description: "run_wine_command spawns as a labelled wine-command child with the merged env replacing the inherited one, truncates output past MAX_BUFFER through the real SpecProcRunner, holds a shutdown registrant while it runs and ends the child on the caller's cancel or the shutdown token"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_wine_core (a_command_runs_as_a_labelled_capped_child, output_past_the_cap_is_truncated, a_cancel_and_the_shutdown_token_each_end_a_running_child)"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 21: The wine command core in gamelib-wine Summary

**validWine, the two env builders and runWineCommand with its prefix check and umu support now run in Rust against the 87-08 vectors and goldens (19 + 61 + 16 cases, all passing), spawning through the SpecRunner as an argv-only, output-capped, shutdown-registered Helper child, with ops `wine_valid` and `wine_run_command` wired to no caller.**

## Performance

- **Duration:** about 35 min (2026-11-23T05:08Z to 05:44Z)
- **Tasks:** 2 of 2 (Task 2 as RED then GREEN)
- **Files:** 5 source files and 1 test file created, `lib.rs` edited, 1 fixture file (`deltas.json`) added

## Accomplishments

- **`valid_wine`** (`wine_cmd/valid.rs`): the TS existence rules by type (a wine needs `bin` and a non-empty `wineserver`, the others only `bin`), the toolkit's Darwin major >= 14 check on macOS, `None` is `false`. `WineInstallation` is a serde struct with `deny_unknown_fields`. Op `wine_valid` takes `[wine|null, host?]`.
- **Env builders** (`wine_cmd/env.rs`): `setup_env_vars` and `setup_wine_env_vars` are pure over `GameSettingsView` (a serde struct over the 22 settings the builders read, ignoring the rest), the platform, an `EnvSnapshot` and an `exists` closure. All 61 vectors pass on the first run, including the unset-variable syntax, `WINEDLLOVERRIDES` appended case-insensitively, the Steam id fallbacks (JS truthiness, so an empty variable falls back), the GStreamer and wine-dll probes, `maxSharpness` of 0 and the deprecated Wine-GE regex (hand-matched, no regex crate; its table was checked against Node).
- **`run_wine_command`** (`wine_cmd/command.rs`): the TS order exactly: prefix check unless skipped or crossover (warn, make the prefix, `verify_wine_prefix`), `valid_wine`, env merge (process env, options env, the two builders, `PROTON_VERB`), `PROTON_LOG` removal under `ignoreLogging`, the umu path (`umu-run` on `PATH`, else `runtime/umu/umu_run.py`), the proton verb unless umu, wrappers, then spawn and the optional `wineserver --wait` (30 minute timeout).
- **Spawn properties (D-17, D-25 (c), T-87-23):** `ProcSpec` label `wine-command`, `replace_env: true`, an argv array and never a shell, no time limit, `max_buffer` 4 MiB, a `child_token` of the shutdown token as its cancel (and the caller's cancel raced against the run), and a `shutdown.register("wine-command")` held for the whole run. A test through the real `SpecProcRunner` shows 5 MB of output cut to the cap, and `sleep 30` ended by a caller cancel and by the shutdown token.
- **`verify_wine_prefix`** (`wine_cmd/prefix.rs`): `wineboot --init`, or umu's `createprefix` without making the directory, waiting on `wineserver` only when `system.reg` is missing; an invalid wine and a crossover bottle run nothing.
- **Ops** `wine_valid` and `wine_run_command`, sorted into `OPS`, strict-decoded with fixed `<op>:bad-args` errors.

## Task Commits

1. **Task 1 (tracer): valid_wine over valid_wine.json, op wine_valid** - `6625401cd` (feat)
2. **Task 2 RED: failing wine_env and wine_command replays over stubbed builders and runner** - `c74c2cc01` (test)
3. **Task 2 GREEN: env builders and run_wine_command with the prefix check** - `e18a06092` (feat)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase and the tracer's `<verify>` is automated only, so it was run end to end (cargo test, clippy, fmt) before the commit; a mutation (`valid_wine` always true) failed three tests and was reverted. Tracer verified end to end, expansion followed.

## TDD Gate Compliance

RED `c74c2cc01` precedes GREEN `e18a06092`; no REFACTOR commit (clippy's collapsible-if and the PATH split portability fixes went into GREEN before its commit).

- **RED evidence:** `cargo test -p gamelib-wine --features testing --test golden_wine_core` over stubs returning empty maps and an empty result: 9 failed, 9 passed. `cargo test` output is not one of the report formats `gsd_run check tdd-red-evidence` reads, so the classifier was not run and the semantic assessment below stands in for it.
- **semanticAssessment:** the target tests compiled and ran and failed on the planned assertions: `every_wine_env_vector_gives_the_recorded_maps` on `env-linux-defaults` (left: two empty maps, right: the recorded `LD_PRELOAD` and the five wine variables), `every_wine_command_golden_...` on the first case's result, `the_wine_run_command_op_...` (empty object against `{"stdout":"hi","stderr":"","code":0}`), the lib-folder note test (empty against `[WineLibFoldersMissing]`) and the control inside `verifying_a_crossover_or_an_invalid_wine_runs_nothing` (0 spawns, expected 2). No build failure, zero-test run or fixture crash. Nine tests passed on the stubs by design: Task 1's valid_wine tests, the floor and manifest guards, and the deltas test.

## Verification

- `cargo test -p gamelib-wine --features testing`: 82 unit, 5 + 18 + 7 integration (`golden_runtimes`, `golden_wine_core`, `golden_wine_manager`), 0 failed. `cargo clippy -p gamelib-wine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-wine --check`: clean. `cargo check` of the shell: builds (one pre-existing `observe_live_url` dead-code warning in `store_embed`, not this plan's).
- Acceptance: all 61 `wine_env.json` vectors (floor 40) and all 16 `wine_command` goldens pass; `grep -c "process::Command" .../wine_cmd/command.rs` is 0.
- Regression: `npx jest` over `infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule` and `engineWineFixtureRedaction`: 4 suites, 264 tests passed (the redaction scan reads the new `deltas.json` without a finding).
- Non-vacuity by mutation: dropping the `PROTON_LOG` removal, skipping the wineserver wait and replacing the proton verb each failed the wine_command replay; all restored.
- No prettier check: every path written is Rust or a prettier-ignored fixture (`npx prettier --file-info` on `deltas.json` reports `ignored: true`).

## Deviations from Plan

### Auto-fixed Issues

None needed beyond what the tests themselves caught before the GREEN commit (a wrong expectation in my own deprecated-GE name table, corrected against the regex run in Node; `PATH` split and join made host-portable with `std::env::split_paths` and `join_paths`).

### Plan interpretation (not defects)

- **`run_wine_command(ctx, args, host)` takes a third `WineHost` argument.** The plan's `run_wine_command(ctx, WineCommandArgs)` has nowhere to get the process env, the default settings or a cancel from, and the crate reads no environment. `WineHost` is also the optional second op argument.
- **D-19 deltas (the TS runner's own behaviour, documented in `golden/wine_command/deltas.json`, three entries):** chunked output to log writers and the `Wine Command:` header are the caller's (the Rust function returns the captured output); the caller's `commandParts` is never mutated (87-08 finding 3); `track` and `resolveOn` have no counterpart in the spawn seam, so `trackKey` and `resolveOnExit` are accepted and ignored until Phase 88 owns launching a game. The replay compares result, spawn trace, `replaceEnv`, timeouts, warnings and the tree; the test asserts the golden event kinds are exactly the four it knows, so a new unexplained kind fails.
- **87-08 findings 1 and 2 are ported as the TS behaves** (Darwin major >= 14; the binary tested with quotes included), because `valid_wine.json` pins them.
- **Log text is fixed text.** The TS logged the wine's name and library paths on a missing-lib error; the Rust logs a fixed line, per the engine log rule that no profile path reaches it.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. T-87-23 is mitigated as the register says: argv arrays only (never a shell), `SpawnClass::Helper` through `SpecProcRunner`, the 4 MiB output cap, and the registrant plus cancel (tested through the real runner). T-87-SC: no new crate (`Cargo.toml` untouched).

## Next Phase Readiness

87-24 can serve `wine.isValidVersion` natively and switch the validWine callers over the `wine_valid` op: it must build the `WineHost` (process env, `os.release()` on macOS) and pass the Flatpak home as `user_home` if it differs from the TS `flatpakHome`. Phase 88 extends `run_wine_command` for a launched game rather than re-porting it.

## Self-Check: PASSED

All created files exist on disk (`wine_cmd/{mod,valid,env,command,prefix}.rs`, `tests/golden_wine_core.rs`, `golden/wine_command/deltas.json`) and commits `6625401cd`, `c74c2cc01` and `e18a06092` are ancestors of HEAD; acceptance criteria and plan-level verification re-run green.
