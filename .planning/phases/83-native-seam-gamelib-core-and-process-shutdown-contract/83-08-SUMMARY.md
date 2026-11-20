---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 08
subsystem: infra
tags: [rust, tauri, gamelib-proc, reaper, sigkill, process-group, job-object, steampoll, steamcm]
status: complete

requires:
  - phase: 83-04
    provides: gamelib-proc spawn classes, Job, kill_tree, ProcRunner, spawn_helper_tokio
  - phase: 83-07
    provides: reaper API (dispatch_if_requested, start, register_group, unregister_group, disarm) and the `[reaper] ...` status lines
provides:
  - fn main dispatches reaper mode right after install_panic_hook; the primary instance starts the reaper after the single-instance guard
  - the sidecar's process group registered with the reaper after spawn; reaper::disarm() last in handle_exit
  - the sidecar's Windows kill-on-close Job created by gamelib_proc::job::Job; the shell's kill/job copies deleted
  - steampoll's runner is ProcRunner::helper("steampoll"); the mac-owned helper is spawned with spawn_helper_tokio
  - TokioRunner compiled only under steampoll's testing feature
  - pending todo for the D-15 interim behaviour change
affects: [83-09 handle_exit/Shutdown (moves disarm into the finish stage), 83-10 three-leg CI run, 83-11 live gate, 88 launch port, 95-97 bridge slices]

actuals:
  tokens: 7600
  tasks: 3
  commits: 3
plan_head_before: 8cd067c3c5466a91f176bfb5feb132cefa87f5b
plan_head_after: a75ee503245fc284e7b4365ddd3a778a0c8ff3f1

tech-stack:
  added: []
  patterns:
    - "Reaper mode is the app's own binary dispatched as main's second statement, before the crypto provider, single-instance guard, Tauri builder and AppKit"
    - "Reaper start/registration failures are logged through shell_diag and never propagate out of startup"
    - "fn main source-order test over comment-stripped production source"

key-files:
  created:
    - .planning/todos/pending/2026-11-21-ts-launched-games-die-on-gamelib-sigkill-unix.md
  modified:
    - src-tauri/src/main.rs
    - src-tauri/src/sidecar.rs
    - src-tauri/src/shell_state.rs
    - src-tauri/src/steampoll_dispatch.rs
    - src-tauri/crates/gamelib-steampoll/src/runtime.rs
    - src-tauri/crates/gamelib-steamcm/Cargo.toml
    - src-tauri/crates/gamelib-steamcm/src/macowned.rs
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock

key-decisions:
  - "The Windows Job in the shell is now gamelib_proc::job::Job (SidecarState.job: Mutex<Option<Job>>); the shell no longer declares Win32_System_JobObjects"
  - "reap_dead_sidecar_tree unregisters the reaped pgid from the reaper after child.wait(), so a restart cannot leave a recycled id registered"
  - "TokioRunner is moved into a feature-gated inner module (`mod tokio_runner`, re-exported under `testing`) so its imports are gated with it"
  - "Short-lived synchronous probes (osascript, reg, pgrep, codesign, ps) stay on Command::output(); recorded in the spawn-site table below"

patterns-established:
  - "Production Rust helper spawns go through gamelib-proc (ProcRunner::helper, spawn_helper_tokio); a crate's own real-spawn runner exists only behind its testing feature"

requirements-completed: [FND-04]

coverage:
  - id: D1
    description: "fn main order - panic hook, then reaper dispatch, then crypto provider, single-instance guard, reaper start (after the windows block) and the Tauri builder; the start arms log `reaper started (pid ` / `reaper unavailable: ` and contain no `?`, unwrap or expect"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "src-tauri/src/main.rs#tests::fn_main_dispatches_reaper_mode_first_and_starts_it_after_the_single_instance_guard (cargo test --bin gamelib-shell, Windows host)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reaper mode never starts the app - the built binary run with --gamelib-reaper and empty stdin exits 0 at once under a 20 s timeout, opening no window"
    requirement: FND-04
    verification:
      - kind: command
        ref: "timeout 20 ./target/debug/gamelib-shell.exe --gamelib-reaper < /dev/null (Windows host; exit=0, no output)"
        status: pass
    human_judgment: true
    rationale: "On Windows run() is a stub that exits 0, so the literal `[reaper] parent gone: signalled 0 group(s)` is not printed here; that line and the macOS Dock/Cmd-Tab absence are first observed on the macos-latest leg (83-10) and by 83-HUMAN-UAT item 2."
  - id: D3
    description: "D-10/D-11 in the real app on macOS and Linux - a SIGKILL of GameLib leaves no sidecar-group helper (comet, legendary/gogdl/nile, bridge helper), no nettop/watchdog and no mac-owned helper alive"
    requirement: FND-04
    verification:
      - kind: other
        ref: "83-HUMAN-UAT item 1 (live gate, plan 83-11); gamelib-proc tests/orphans.rs unix legs on plan 83-10's CI"
        status: unknown
    human_judgment: true
    rationale: "Every unix code path added here (reaper start, register_group, unregister_group, group kill) is cfg(unix) and cannot be compiled or run on the operator's Windows box."
  - id: D4
    description: "One implementation of group kill and the Windows Job, in gamelib-proc; the shell's copies and their tests are gone"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell (515 passed), cargo test -p gamelib-proc (17 + 4 + 1 passed); sidecarShutdownFlagSource, quitTeardownWiring, cargoFeatures jest suites pass"
        status: pass
    human_judgment: false
  - id: D5
    description: "Long-lived Rust helpers spawn through gamelib-proc: steampoll monitor + watchdog sh as ProcRunner::helper, mac-owned helper through spawn_helper_tokio; TokioRunner only under `testing`"
    requirement: FND-04
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-steampoll -p gamelib-steamcm (monitor.rs, contracts.rs and 304 steamcm tests pass; only the 6 baseline Windows-local failures remain)"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-15 behaviour change recorded where developers will see it and triaged"
    requirement: FND-04
    verification:
      - kind: other
        ref: "pnpm planning-gates (12/12) over .planning/todos/pending/2026-11-21-ts-launched-games-die-on-gamelib-sigkill-unix.md; 83-HUMAN-UAT.md 'Known behaviour change (D-15)'"
        status: pass
    human_judgment: false

duration: not captured (start time was not recorded at launch)
completed: 2026-11-20
---

# Phase 83 Plan 08: Reaper wired into the real shell Summary

**GameLib's `fn main` now dispatches `--gamelib-reaper` before anything else, starts a reaper for the primary instance, registers the sidecar's process group with it and disarms it on a graceful exit; the Windows sidecar Job is created by gamelib-proc, the shell's own kill/job copies are deleted, and steampoll's monitor and the mac-owned helper spawn as gamelib-proc Helpers.**

## Performance

- **Duration:** not captured (start time was not recorded at launch)
- **Completed:** 2026-11-20
- **Tasks:** 3 (task 1 tracer)
- **Files:** 1 created, 9 modified (+223 / -246 lines under `src-tauri`, plus the todo)

## Accomplishments

- `fn main` order is now panic hook, `gamelib_proc::reaper::dispatch_if_requested()`, `gamelib_proc::diag::set_diag_sink(shell_diag)`, crypto provider, single-instance guards, reaper start, Tauri builder. A source-order test over the comment-stripped production source pins it, including that the start arms contain no `?`, `unwrap` or `expect`.
- On unix the primary instance logs `reaper started (pid <n>)` or `reaper unavailable: <io error kind>` through `shell_diag` and continues either way. A secondary instance exits before it, so it never spawns a reaper.
- `spawn_sidecar_state` registers the sidecar's pgid (its own pid) as `"sidecar"`; `handle_exit` calls `reaper::disarm()` as its last step; `reap_dead_sidecar_tree` unregisters the group after `child.wait()` and before `tree_reaped` latches.
- Windows: `SidecarState.job` is `Mutex<Option<gamelib_proc::job::Job>>` built with `Job::create_for(child.as_raw_handle())`; `Win32_System_JobObjects` is gone from the shell's `windows-sys` features.
- Deleted from `sidecar.rs`: `kill_process_group`, `create_kill_on_close_job`, `spawn_orphaned_group` and three tests (they live in `gamelib-proc/src/kill_tree.rs`). `configure_sidecar_process_group` and its doc stay. The text the TS gates read in `reap_dead_sidecar_tree` (`kill_process_group(`, `job.lock()`, `tree_reaped.store(true`, and the kill before `child.wait()`) is unchanged in order.
- steampoll's registry is built with `Arc::new(gamelib_proc::runner::ProcRunner::helper("steampoll"))`; the nettop monitor and its watchdog `sh` therefore share one registered group. `TokioRunner` now compiles only with `testing`.
- `gamelib-steamcm` depends on `gamelib-proc`; `run_helper` spawns `--steam-owned-apps` with `spawn_helper_tokio(&mut cmd, "mac-owned")` and holds the `HelperGuard` until `wait_with_output` returns (timeout still drops the future, which kills the child).

## Task Commits

1. **Task 1 (tracer): reaper dispatch, start, sidecar group registration, disarm, source-order test** - `a58ec952e` (feat)
2. **Task 2: sidecar Windows Job and dead-sidecar reap through gamelib-proc; shell copies deleted** - `bd107dcde` (refactor)
3. **Task 3: Rust helpers through gamelib-proc; D-15 todo** - `a75ee5032` (feat)

`commits: 3` counts this plan's commits (`git log --grep="(83-08)"`). `git rev-list --count 8cd067c3c..HEAD` reads 4 because another session's commit `aab0354e3` (`test(phase-82): ...`) landed on `main` between tasks 2 and 3; it is not this plan's.

Tracer gate: auto/end-of-phase, automated-only `<verify>`; the `cargo test --bin gamelib-shell` run, the debug build and the reaper-mode run were re-run green before expansion (`Tracer verified end-to-end - expanding`).

## Known behaviour change (D-15)

On macOS and Linux a SIGKILL of GameLib now also kills games the TS runner launched: they are children of the sidecar, so they are in the process group the reaper kills. Before Phase 83 they were orphaned and survived by accident. What did not change: a graceful quit and Windows already killed them (SIGTERM to the group, the kill-on-close Job), `steam://rungameid` launches are Steam's processes and survive, and Rust `SpawnClass::Game` trees (own session, never registered) survive. Recorded here, in `83-HUMAN-UAT.md` ("Known behaviour change (D-15)", written by 83-01) and in `.planning/todos/pending/2026-11-21-ts-launched-games-die-on-gamelib-sigkill-unix.md` (`severity: medium`, `platform: any`, `ready: blocked`). Blocked on Phase 88 (launch port) and Phases 95-97 (bridge slices) moving games onto `SpawnClass::Game`.

## Rust spawn sites

Every `Command::new` / tokio `Command` site under `src-tauri/src` and `src-tauri/crates/*/src` at execution (grep), excluding gamelib-proc's own internals and test-only helpers.

| Site | What | Disposition |
|------|------|-------------|
| `src/sidecar.rs` (`spawn_sidecar_dev`, `spawn_sidecar_packaged`) | the Node sidecar | gamelib-proc: own group via `configure_sidecar_process_group`, registered with the reaper in `spawn_sidecar_state`; Windows Job via `Job::create_for` |
| `gamelib-steampoll/src/runtime.rs` (`TokioRunner`, two sites) | test-only real-spawn runner | compiled only under `testing`; production uses `ProcRunner` |
| `gamelib-proc/src/runner.rs` (two sites) | steampoll's production runner (nettop monitor, watchdog `sh`, `ps`/probe commands run through it) | gamelib-proc Helper (`ProcRunner::helper("steampoll")`) |
| `gamelib-steamcm/src/macowned.rs:162` | the `--steam-owned-apps` helper | gamelib-proc Helper (`spawn_helper_tokio`, label `mac-owned`) |
| `gamelib-steamcm/src/macowned.rs:528` | `ps` start-time stat | self-bounded synchronous probe, not migrated in 83 |
| `src/keyring_dispatch.rs:49` | `osascript` keyring probe | self-bounded synchronous probe, not migrated in 83 |
| `src/steamcm_dispatch.rs:256` | `pgrep` | self-bounded synchronous probe, not migrated in 83 |
| `src/tray.rs:489` | `reg` query | self-bounded synchronous probe, not migrated in 83 |
| `gamelib-depot/src/steam_api_pin.rs:306,314` | `/usr/bin/codesign` (two calls) | self-bounded synchronous probe, not migrated in 83 |
| `src/wake_lock/linux.rs:8` | `systemd-inhibit ... cat` | already EOF-bounded: it ends when its stdin closes |
| `gamelib-steamcm-cli/src/main.rs:59,63,71,76,83` | `open`, `pgrep`, `kill -0`, `sysctl`, `date` | CLI-only developer binary, short-lived probes, not part of the shell |
| `gamelib-testutil/src/lib.rs`, `gamelib-proc` tests and stand-in | test harnesses | test-only |

`steam://` opens go through `tauri_plugin_opener`, not a `Command`, and are unchanged.

## Decisions Made

See `key-decisions`. One implementation detail: `TokioRunner` moved into a feature-gated inner module rather than `#[cfg]`-ing each item, so its `Stdio`/`Duration`/`BufReader` imports are gated with it and the default build has no unused-import warnings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The reaper-mode verify cannot print the plan's literal on this host**
- **Found during:** Task 1
- **Issue:** the plan's verify greps the built binary's reaper-mode output for `parent gone: signalled 0 group`. On Windows `reaper::run()` is the documented `cfg(not(unix))` stub returning 0 and printing nothing (83-07), so the grep counts 0.
- **Fix:** ran `timeout 20 ./target/debug/gamelib-shell.exe --gamelib-reaper < /dev/null`: exit 0 at once, no window, no hang, which is what the prohibition ("MUST NOT start the app in reaper mode") actually requires. The literal is first observable on 83-10's macos-latest/ubuntu-latest legs and 83-HUMAN-UAT.
- **Files modified:** none
- **Commit:** n/a

**2. [Rule 1 - Bug] The new source-order test failed twice on its own text**
- **Found during:** Task 1
- **Issue:** (a) the "no `?`" assertion matched the `{:?}` in the `reaper unavailable` format string; (b) a Python-written `"\n"` literal landed in the Rust source as a real newline.
- **Fix:** assert on `)?` instead; rewrote the two string literals with escaped `\n`. rustfmt on `main.rs` reports no diff in the new test.
- **Files modified:** src-tauri/src/main.rs
- **Commit:** a58ec952e

**3. [Rule 3 - Blocking] The edited shell sources were CRLF in the working tree**
- **Found during:** Task 1
- **Issue:** `main.rs`, `sidecar.rs`, `shell_state.rs`, `steampoll_dispatch.rs`, `runtime.rs`, `macowned.rs` and two `Cargo.toml` files were CRLF on disk (core.autocrlf on Windows, `.gitattributes` pins `eol=lf`), which breaks exact-text edits and source-text tests.
- **Fix:** converted those eight files to LF before editing. Git normalises on add, so the diffs carry no line-ending noise. Side effect: `shell_production_source_main_part_equals_pre_test_slice` and `cut_test_modules_cuts_cfg_all_and_stacked_test_mods` (baseline failures in 83-03/83-06) now pass, and `tauriShellSource.test.ts` drops from 3 failures to 1 (the remaining one reads `relay_commands.rs`, still CRLF and untouched here).
- **Commit:** a58ec952e onward (no content change from the conversion)

**Total deviations:** 3 (1 plan-precision on host capability, 1 bug in own test, 1 blocking environment). **Impact:** none on scope.

## Issues Encountered

- **No unix code path here was compiled or run.** The box is Windows (`x86_64-pc-windows-msvc` only, no WSL). The unix-only additions are: the `reaper::start()` match, the `register_group(child.id() as i32, "sidecar")` call and the `reaper::unregister_group` call in `reap_dead_sidecar_tree`, plus the existing unix arm of `reap_dead_sidecar_tree` now calling `gamelib_proc::kill_tree::kill_process_group`. They follow the exact `#[cfg(unix)]` statement shapes already used in `handle_exit`, but they have never been through a compiler or clippy. The Windows branch (`Job::create_for`) did compile and the shell builds. Plan 83-10's macos-latest and ubuntu-latest legs are their first compile; D-10's live SIGKILL result is 83-HUMAN-UAT item 1. The plan-level darwin clippy ratchet (`clippyRatchet.cjs`) was not run; `cargo clippy -p gamelib-steampoll -p gamelib-steamcm --all-targets` is clean on Windows, and moving code out of `sidecar.rs` can only lower the darwin shell count (no ceiling was raised).
- Baseline failures unchanged and not attributed to this plan: `gamelib-steampoll --test adoption` `on_windows_a_changed_steam_pid_is_never_adopted`; `gamelib-steampoll-cli` five replay/frozen-parity tests (`tempdir` under `C:\Windows`); `tauriShellSource.test.ts` one test (CRLF `relay_commands.rs`). See `deferred-items.md`.
- `main.rs:1625` has a pre-existing rustfmt diff (the shell crate is not fmt-clean); this plan adds none.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-83-27 (reaper mode only reads its own stdin; dispatched before the app and proven by running the built binary), T-83-28 (start failure logs `reaper unavailable:` and continues; the source-order test forbids `?`/`unwrap`/`expect` in the arm), T-83-30 (the sidecar group and every Rust Helper group are reaper-registered) are implemented; T-83-29 is the accepted D-15 change above. T-83-27's and T-83-30's unix evidence is the unrun live gate and CI legs.

## Next Phase Readiness

Ready for 83-09: `handle_exit` ends with `reaper::disarm()`; move it into the Shutdown finish stage. 83-10 runs the unix legs of 83-04, 83-07 and the unix compile of this plan on macos-latest and ubuntu-latest; any red there comes before 83-11's live gate.

## Self-Check: PASSED

- Created file present: `.planning/todos/pending/2026-11-21-ts-launched-games-die-on-gamelib-sigkill-unix.md`.
- Commits found: a58ec952e, bd107dcde, a75ee5032.
- Acceptance greps re-run: Task 1 (`dispatch_if_requested` 2, `reaper started (pid ` 2, `reaper unavailable: ` 2, `register_group(child.id() as i32, "sidecar")` 1, `gamelib_proc::reaper::disarm()` 1); Task 2 (`pub(crate) fn kill_process_group(` 0, `fn create_kill_on_close_job` 0, `Win32_System_JobObjects` 0, `fn configure_sidecar_process_group` 2, `unregister_group` in shell_state.rs 1); Task 3 (`ProcRunner::helper` 1, `TokioRunner` in steampoll_dispatch.rs 0, `spawn_helper_tokio` in macowned.rs 1, `^ready: blocked` 1).
- Plan verification on this host: `cargo test --bin gamelib-shell` 515 passed; `cargo test -p gamelib-proc` green; `cargo test -p gamelib-steampoll -p gamelib-steampoll-cli -p gamelib-steamcm` only the baseline failures above; `cargo fmt -p gamelib-steampoll -p gamelib-steamcm --check` clean; `pnpm planning-gates` 12/12; jest `cargoFeatures`, `quitTeardownWiring`, `sidecarShutdownFlagSource` pass.
