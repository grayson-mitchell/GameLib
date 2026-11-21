---
phase: 84-logger
plan: 08
subsystem: infra
tags: [logger, rust, tracing, log-facade, shell-diagnostics, deletion-gate]
status: complete

requires:
  - phase: 84-logger
    provides: "the native writer and golden (84-01/84-04), logger channels served by Rust (84-05, 84-06), the TS logger reduced to a forwarder and loggerPortComplete's TS half (84-07)"
provides:
  - "shell_log / shell_log_to / shell_log_level in main.rs: every shell diagnostic is a [Shell] line in gamelib.log (and still `[shell] <message>` on stderr); shell_diag, shell_diag_log_path and the gamelib-shell.log append are deleted"
  - "steamcm_diag: the gamelib-steamcm diag sink logs Steam-prefixed lines"
  - "gamelib_log::bridge: LogLayer (tracing Registry layer), LogBridge (log::Log), CrateLevel, crate_level_from_env, target_prefix, Sink, install_bridges; the writer thread marks itself so bridged events raised on it are dropped"
  - "install_bridges runs in init_native_logger (primary instance only); GAMELIB_LOG_LEVEL=debug raises crate diagnostics to DEBUG"
  - "gamelib-steamcm's private tracing subscriber, its install call and its tracing dependency are deleted"
  - "loggerPortComplete's Rust half: shell_diag and gamelib-shell.log under src-tauri/src, the two steamcm forwarder identifiers under gamelib-steamcm/src, each with a self-test"
affects: [84-09, 84-10]

actuals:
  tokens: 17000
  tasks: 2
  commits: 4
plan_head_before: c98a489f961070817f0807fbf069162865d5a8c9
plan_head_after: f0c2ae05960ab8f8e0fb4ba92e9dd372b8799dbb

tech-stack:
  added: [tracing-subscriber 0.3 (registry feature only), sharded-slab 0.1.7, thread_local 1.1.10, log 0.4 (direct dependency of gamelib-log; already locked)]
  patterns:
    - "one process-wide tracing Registry plus a log::Log bridge feeding the single native writer, with a thread-local writer-thread guard against feedback"
    - "a target-prefix map on module boundaries onto the closed LogPrefix set"
    - "a gate's red run recorded before the deletion it gates, in the SUMMARY, per task"

key-files:
  created:
    - src-tauri/crates/gamelib-log/src/bridge.rs
  modified:
    - src-tauri/src/main.rs
    - src-tauri/src/depot_dispatch.rs
    - src-tauri/src/keyring_dispatch.rs
    - src-tauri/src/macos_notifications.rs
    - src-tauri/src/shell_state.rs
    - src-tauri/src/sidecar.rs
    - src-tauri/src/steamcm_dispatch.rs
    - src-tauri/src/terminate_veto.rs
    - src-tauri/src/macos_epic_embed/nav_delegate.rs
    - src-tauri/src/macos_epic_embed/surface.rs
    - src-tauri/src/single_instance/windows_protocol.rs
    - src-tauri/crates/gamelib-log/Cargo.toml
    - src-tauri/crates/gamelib-log/src/lib.rs
    - src-tauri/crates/gamelib-log/src/writer.rs
    - src-tauri/crates/gamelib-steamcm/Cargo.toml
    - src-tauri/crates/gamelib-steamcm/src/vent.rs
    - src-tauri/crates/gamelib-steamcm/src/facade.rs
    - src-tauri/Cargo.lock
    - src/backend/__tests__/keyringDiagPersistence.test.ts
    - src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts
    - src/backend/__tests__/shellDiagPersistence.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/loggerPortComplete.test.ts
    - src/backend/__tests__/cargoFeatures.test.ts

key-decisions:
  - "shell_log_to takes the Logger as a parameter so the 84-01 shell-line golden is asserted byte for byte against a FakeHome Logger with the fixed 13:05:09 clock; shell_log itself is just the stderr echo plus shell_log_to(global())"
  - "steamcm_diag is a separate sink from shell_log (Steam prefix, same level rule and same stderr echo), so crate lines are Steam session events rather than Shell events"
  - "The panic-hook doc block had been attached to shell_diag_log_path by a stray adjacency; it was moved onto install_panic_hook with the deletion rather than left orphaned or deleted"
  - "The fatal sidecar-spawn arm flushes the writer for at most 500 ms before the blocking dialog, and the dialog names gamelib_core::paths::log_file(.., General) (fallback text unchanged)"
  - "The `tracing` dependency of gamelib-steamcm was removed with the forwarder: nothing else in the crate or its CLI named it (only two doc comments), and Cargo.lock records the dropped edge"
  - "LogLayer implements Layer::max_level_hint (WARN or DEBUG) so callsites above the level are never evaluated; a Sink type alias is public because clippy's type_complexity rejected the raw Arc<dyn Fn> in two signatures"

patterns-established:
  - "Bridged crate events carry a thread-local ON_WRITER_THREAD guard (writer.rs) instead of a re-entrancy lock: the writer thread cannot be the cause of its own next entry"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "Every shell diagnostic logs through the native writer as a [Shell] line in the standard format; shell_diag, shell_diag_log_path and gamelib-shell.log's writer are deleted; the level comes from the text; stderr echo kept"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell shell_log (shell_log_to_writes_the_golden_shell_line, shell_log_level_follows_the_text, shell_log_to_without_a_logger_does_nothing)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/loggerPortComplete.test.ts (comment-stripped shell_diag / gamelib-shell.log scans and self-test)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The four source-text gates were rewritten in the commit of the rename: keyring count 14 and its non-vacuous leak-shape guard, macOS Epic embed count 30, shellDiagPersistence's Site A/B and three abandoned-invoke regexes, tauriShellSource gate 5C and the handle_exit exit-line regexes"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "keyringDiagPersistence, macosEpicEmbedDiagPersistence, shellDiagPersistence, tauriShellSource (jest, 392 tests across the six touched suites)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The two crate diag sinks log Shell and Steam lines; the panic hook and shell_panic_log_path are unchanged (D-03); the fatal spawn-failure exit flushes the writer and names gamelib.log"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell (588 passed); grep set_diag_sink(steamcm_diag) == 1; ^fn shell_panic_log_path( == 1"
        status: pass
    human_judgment: true
    rationale: "The fatal-exit dialog text and the live flush cannot be provoked from a unit test; the live gate (84-10) is where a real spawn failure is observed"
  - id: D4
    description: "steam-vent and reqwest diagnostics appear in gamelib.log with mapped prefixes through one app-wide Registry LogLayer and a log::Log bridge, WARN by default, DEBUG only by GAMELIB_LOG_LEVEL=debug, TRACE never, no feedback loop"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-log bridge (15 tests: both bridges, level policy, target map, spans, writer-thread guard, install_bridges first-call-wins, a real-Logger line `(13:05:09) [WARNING]: [Steam]: heartbeat failed reason=eof`)"
        status: pass
    human_judgment: true
    rationale: "Whether a real steam-vent heartbeat failure lands in a real gamelib.log is a live-gate observation (84-10); the unit proof is a synthetic event"
  - id: D5
    description: "steamcm's forwarder subscriber (VentLogForwarder, MessageVisitor, install_vent_log_forwarder), its call in facade::configure and its test are deleted behind a red-first gate scan; the lockfile census gained exactly tracing-subscriber, sharded-slab and thread_local"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "loggerPortComplete.test.ts (steamcm forwarder identifiers); cargoFeatures.test.ts (crate-name pin, tracing-log absent)"
        status: pass
    human_judgment: false
---

# Phase 84 Plan 08: Shell diagnostics and crate diagnostics into the native writer Summary

**The shell has one log path, the native writer: `shell_log` replaces `shell_diag` across every shell module, and steam-vent, gamelib-steamcm, reqwest and the other crates reach `gamelib.log` with mapped prefixes through one app-wide tracing Registry layer plus a `log::Log` bridge, WARN by default, DEBUG only by `GAMELIB_LOG_LEVEL=debug`, with no feedback loop.**

## Performance

- **Duration:** about 1 h (not timed by the harness; estimated from the session)
- **Completed:** 2026-11-21
- **Tasks:** 2 (a tracer and an auto/tdd task)
- **Files:** 31 changed across the two task commits (1 created)

## Accomplishments

- Task 1 (tracer): `shell_log(message)` echoes `[shell] <message>` to stderr and writes a `[Shell]` line through the writer; `shell_log_level` picks the level from the text (`FATAL` prefix -> ERROR; `WARN` prefix or `failed` -> WARNING; else INFO). One scripted rename over the 11 modules the grep listed (111 mentions), the four source-text gates in the same commit, and loggerPortComplete's Rust scan. The 84-01 `shell-line` golden is asserted byte for byte by a shell test.
- Task 2: `gamelib_log::bridge` (`LogLayer`, `LogBridge`, `CrateLevel`, `crate_level_from_env`, `target_prefix`, `install_bridges`), the writer-thread guard, the install in `init_native_logger`, and the steamcm forwarder deletion.

## Red-first gate runs (recorded as the plan requires)

- **Rust shell scan, before the codemod** (task 1): `pnpm exec jest --runTestsByPath src/backend/__tests__/loggerPortComplete.test.ts` -> `Tests: 2 failed, 43 passed, 45 total`. `shell_diag` was named in code in 11 files (depot_dispatch, keyring_dispatch, nav_delegate, surface, macos_notifications, main, shell_state, sidecar, windows_protocol, steamcm_dispatch, terminate_veto) and `gamelib-shell.log` in main.rs. After the codemod and the gate rewrite the same suite is green (45 tests; 48 after task 2).
- **steamcm scan, before the forwarder deletion** (task 2): `Tests: 2 failed, 46 passed, 48 total`; `VentLogForwarder` in vent.rs, `install_vent_log_forwarder` in vent.rs and facade.rs. Green after the deletion.

Note on TDD order for the bridge tests: the 15 bridge tests were written in the same pass as `bridge.rs` and were first run against the finished implementation (one failed on a wrong guess of the line's column padding in my expected string, corrected against the writer's real output and the golden's alignment). The plan's red-first gates (the two scans above) were run red; the bridge behavior tests have no separate red run.

## Measured lockfile names

Cargo.lock gained exactly three package entries: `tracing-subscriber` 0.3.23, `sharded-slab` 0.1.7, `thread_local` 1.1.10. `tracing-log` is NOT pulled (tracing-subscriber is built with default features off; cargoFeatures pins its absence). `lazy_static`, `cfg-if`, `log` and `tracing` were already locked. `EXPECTED_LOCKFILE_CRATE_NAMES` was set to this measured set (alphabetical: `sharded-slab` sorts before `shared_child`, which a first attempt got wrong and the test caught).

## Accepted: gamelib-steamcm-cli stderr

`gamelib-steamcm-cli` no longer forwards steam-vent WARN events to stderr: its only route was the deleted forwarder subscriber, and the CLI does not install the app-wide LogLayer (a dev tool; the app path is what criterion 3 covers).

## Task Commits

1. **Task 1: shell diagnostics log through the native writer as [Shell] lines** - `1c07ef30a` (refactor)
2. **Task 2: crate diagnostics reach gamelib.log through one app-wide subscriber** - `f0c2ae059` (feat)

`commits: 4` in the frontmatter is the measured `git rev-list --count plan_head_before..HEAD`; two of those four (`123b31139`, `d3cb76109`, the macowned stub-helper flake fix) were committed concurrently on main by another session and are not this plan's. This plan's commits are the two above.

## Verification (plan-end gates, run at the plan's last code commit)

| Gate | Result |
| --- | --- |
| `cargo test --bin gamelib-shell` (and the `shell_log`, `fn_main`, `panic` filters) | 588 passed; filters ran 4, 2 and 15 tests |
| `cargo test -p gamelib-log` / `-p gamelib-steamcm` | 69 + 2 + 1 passed / 308 passed |
| `cargo clippy -p gamelib-log --all-targets -- -D warnings`, `cargo fmt -p gamelib-log -p gamelib-steamcm --check` | clean |
| `rustfmt --check` on the shell modules in the plan's list; main.rs | clean for my hunks (main.rs, ipc_contract.rs and store_embed/controls.rs carry pre-existing diffs outside this plan) |
| jest: keyring/macOS Epic/shellDiag/tauriShellSource/loggerPortComplete/cargoFeatures | 392 passed, 6 suites |
| `pnpm lint` | production: PASS, tests: PASS |
| `pnpm find-deadcode` | PASS (312 baselined) |
| darwin clippy ratchet (`cargo +1.99.1 clippy --workspace --all-targets`) | PASS, no ceiling moved |
| prettier (`--file-info` not ignored, then `--check`) over the 7 test files written | clean |
| `pnpm codecheck` | FAILS, pre-existing and not this plan's (below) |
| `pnpm backend-di-ceilings` | FAILS, pre-existing and not this plan's (below) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `type_complexity` and `redundant_closure` in bridge.rs**
- **Found during:** Task 2 (clippy -D warnings)
- **Issue:** the `Arc<dyn Fn(Prefix, Level, &str) + Send + Sync>` signature on `with_sink` tripped `clippy::type_complexity`, and the global sink closure was redundant
- **Fix:** a public `Sink` type alias used in both `with_sink` signatures; `Arc::new(crate::log)`
- **Files modified:** src-tauri/crates/gamelib-log/src/bridge.rs
- **Commit:** f0c2ae059

**2. [Rule 1 - Dead code] gamelib-steamcm's `tracing` dependency and the `diag`/`Once` imports**
- **Found during:** Task 2 (steamcm deletion)
- **Issue:** with the forwarder gone the `tracing = "0.1"` dependency in gamelib-steamcm/Cargo.toml, `Once`, and `diag` in vent.rs's imports were unused (`diag` raised a compiler warning)
- **Fix:** removed all three; Cargo.lock records the dropped edge. Not in the plan's files_modified (Cargo.toml for steamcm), a one-line removal of a dependency that existed only for the deleted code
- **Files modified:** src-tauri/crates/gamelib-steamcm/Cargo.toml, src-tauri/crates/gamelib-steamcm/src/vent.rs
- **Commit:** f0c2ae059

**3. [Rule 1 - Misattached doc] panic-hook doc comment**
- **Found during:** Task 1
- **Issue:** the long `Routes every shell panic to a FILE` doc block sat directly above `shell_diag_log_path`'s own doc, so it documented the wrong function and would have gone with the deletion
- **Fix:** moved onto `install_panic_hook`, which it describes; the hook itself is unchanged (D-03)
- **Commit:** 1c07ef30a

**Total deviations:** 3 auto-fixed (1 blocking lint, 2 dead-code/doc). **Impact:** none on behavior or scope.

## Pre-existing failures (recorded, not fixed)

- `pnpm backend-di-ceilings` fails only on `src/backend/storeManagers/steam/__tests__/games.test.ts` (jestMock 47 > baseline 45) and the untracked steam bridge tests `otherSessionPlaying.test.ts` (2) and `steamOfflineMode.test.ts` (1), from another session's uncommitted work, as the dispatch note said.
- `pnpm codecheck` fails with one error, `src/backend/storeManagers/steam/bridge/__tests__/otherSessionPlaying.test.ts(192,7): TS2322` (an untracked file from the same other session). Nothing this plan touched is named.

## Out-of-scope stale prose left for 84-09

`src-tauri/crates/README.md` (~line 119), `meta/captureShellScrollback.ts`, and the frontend comments in `Login/components/Runner/index.tsx` and its `logoutFailureSurface.test.tsx` still name `shell_diag`/`gamelib-shell.log`; 84-09's doc-corrections task owns them. Two doc comments in gamelib-steamcm (macowned.rs:606, refresh/owned_demos.rs:632) say a `tracing::` call "no subscriber in the app passes"; they describe a past bug and are now merely dated.

## Prohibition status

"MUST NOT delete or rewrite users' existing log files" holds: no code path in this plan touches a stale `gamelib-shell.log` or any `.old` file; the old file is simply never written again.

## Known Stubs

None.

## Threat Flags

None: no new endpoint, auth path or file access beyond the planned log writes. T-84-24 (feedback loop) is covered by the writer-thread guard tests and first-call-wins install; T-84-26 (keyring) by the leak-shape guard kept on `shell_log(` with its planted-secret self-test (still passing); T-84-25 (DEBUG exposure) is the accepted opt-in env var.

## Self-Check: PASSED

- Created file present: `src-tauri/crates/gamelib-log/src/bridge.rs`
- Commits present on HEAD: `1c07ef30a`, `f0c2ae059`
- Acceptance greps: `shell_diag` in src-tauri/src 0; literal `gamelib-shell.log` 0; one `^fn shell_panic_log_path(`; `set_diag_sink(steamcm_diag)` 1; steamcm forwarder identifiers 0 files; `install_bridges(` in main.rs 1; `impl log::Log for LogBridge` 1; `set_boxed_logger` 1; `"tracing-subscriber"` pinned 1; `"tracing-log"` 0; 15 bridge tests
