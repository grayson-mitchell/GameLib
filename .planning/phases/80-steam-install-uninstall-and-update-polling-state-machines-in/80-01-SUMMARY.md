---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 01
subsystem: steam-polling
tags: [rust, tokio, steam, polling, contracts, workspace]
requires: []
provides:
  - gamelib-steampoll crate (contracts, registry, runtime, test fakes) with every module of the port declared once in lib.rs
  - gamelib-steampoll-cli and gamelib-i18n crates (skeletons)
  - StateEvent / AckReply / Effect / Continuation / PollHost / ProcessRunner / Clock / HoldSink contracts
affects: [80-02 .. 80-33]
tech-stack:
  added: []
  patterns: [interface-first contracts, host traits with BoxFuture (no async_trait), watch-channel guard-on-drop registry]
key-files:
  created:
    - src-tauri/crates/gamelib-steampoll/ (Cargo.toml, src/*.rs, tests/contracts.rs)
    - src-tauri/crates/gamelib-steampoll-cli/ (Cargo.toml, src/main.rs)
    - src-tauri/crates/gamelib-i18n/ (Cargo.toml, src/lib.rs)
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - .github/workflows/rust-test.yml
    - src-tauri/crates/README.md
    - src/backend/__tests__/cargoFeatures.test.ts
decisions:
  - "R1-R7 recorded verbatim in lib.rs under 'Phase 80 design record'"
  - "OPS is sorted (breadcrumb_installed_on_disk precedes bridge_finalized); the plan's list had them in the other order"
  - "Registry::cancel_all_and_wait is async (tokio watch channels) so it runs under paused time; the shell blocks on it via runtime::handle()"
metrics:
  tasks: 2
  files: 31
  completed: 2026-11-16
---

# Phase 80 Plan 01: steampoll crates and contracts Summary

Three new workspace crates (gamelib-steampoll, gamelib-steampoll-cli, gamelib-i18n) with the cross-plan contracts fixed as compiling code: state-event schema and lenient ack, effect/continuation model, host traits, constants pinned to pollState.ts, an async per-appId registry with guard-on-drop, a crate-private runtime handle with real `TokioRunner`/`SystemClock`, and `RecordingHost`/`ScriptedRunner`/`FakeClock` fakes. CI runs the three crates on all legs.

## Commits

- 9066d5a90: contract modules (events, effects, host, constants)
- 25081fdd8: crates, workspace, CI step, runtime, registry, fakes, contracts tests

(Task 1's commit does not compile alone because lib.rs lands in task 2; the pair is the unit.)

## Verification

`cargo test -p gamelib-steampoll -p gamelib-steampoll-cli -p gamelib-i18n` green (10 contract tests), clippy `-D warnings` clean, `cargo fmt --check` clean, prettier clean on the YAML/README/test file, `--list` prints 24 ops, no `tauri` string in the crate, `cargoFeatures.test.ts` green.

## Effect inventory

Destinations: HF = `host.emit_frontend`, HN = `host.notify`, SE = state event, PUSH = TS to Rust push op, TS = stays TS.

### sendFrontendMessage call sites (27 grep hits; each row is one hit)

| #   | File:line                     | Channel / payload                                                                  | Rust destination                                                          |
| --- | ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | installPolling.ts:289         | gameStatusUpdate {appName,runner,status:'done'} (safety cap, awaitingUpdate)       | HF                                                                        |
| 2   | installPolling.ts:361         | gameStatusUpdate done (no-activity give-up)                                        | HF                                                                        |
| 3   | installPolling.ts:369         | steamRequestNotice {appId,title,kind:'install-not-started',seq}                    | HF; title from start args/ack, seq from `Registry::next_notice_seq`       |
| 4   | installPolling.ts:389         | gameStatusUpdate done (delegated stop)                                             | HF                                                                        |
| 5   | installPolling.ts:405         | gameStatusUpdate done (grace expiry; reads isNativeInstallInFlight)                | HF; in-flight via PUSH `steampoll_native_in_flight` (R7)                  |
| 6   | installPolling.ts:449         | gameStatusUpdate installing + managedBySteam (markManagedBySteam)                  | HF directly (R7)                                                          |
| 7   | installPolling.ts:508         | gameStatusUpdate done (cancel delegated)                                           | HF                                                                        |
| 8   | installPollOnce.ts:139        | gameStatusUpdate done after markSteamInstallIncomplete                             | SE `installIncomplete`, then HF via `Continuation::InstallIncomplete`     |
| 9   | installPollOnce.ts:194        | gameStatusUpdate installing + context steam-waiting-for-restart / steam-paused + managedBySteam | HF                                                         |
| 10  | installPollOnce.ts:290        | progressUpdate {percent,bytes,eta,downSpeed?}                                      | HF                                                                        |
| 11  | installPollOnce.ts:323        | gameStatusUpdate installing steam-waiting-for-restart (hold)                       | HF                                                                        |
| 12  | installPollOnce.ts:358        | pushGameToLibrary (updated SteamGameInfo)                                          | SE `installed`; TS handler builds entry and pushes before ack (R2)        |
| 13  | installPollOnce.ts:373        | gameStatusUpdate done, or installing + steam-bridge-finishing                      | HF via `Continuation::Installed`                                          |
| 14  | installPollOnce.ts:481        | gameStatusUpdate done (manifest gone while holding)                                | HF                                                                        |
| 15  | uninstallPolling.ts:192       | pushGameToLibrary (survivor re-resolved)                                           | SE `uninstalled` with `survivor`; handler pushes                          |
| 16  | uninstallPolling.ts:193       | gameStatusUpdate done (survivor case)                                              | HF via `Continuation::Uninstalled`                                        |
| 17  | uninstallPolling.ts:235       | pushGameToLibrary (not installed)                                                  | SE `uninstalled` (survivor None); handler pushes                          |
| 18  | uninstallPolling.ts:237       | gameStatusUpdate done                                                              | HF via `Continuation::Uninstalled`                                        |
| 19  | uninstallPolling.ts:263       | gameStatusUpdate uninstalling                                                      | HF                                                                        |
| 20  | uninstallPolling.ts:363       | gameStatusUpdate done (no-activity give-up)                                        | HF                                                                        |
| 21  | uninstallPolling.ts:372       | steamRequestNotice kind 'uninstall-not-started'                                    | HF (as row 3)                                                             |
| 22  | updatePollOnce.ts:119         | pushGameToLibrary existing                                                         | SE `updateDone{completed:true}`; handler pushes                           |
| 23  | updatePollOnce.ts:122         | gameStatusUpdate updating + managedBySteam                                         | HF via `Continuation::UpdateDone`                                         |
| 24  | updatePollOnce.ts:128         | gameStatusUpdate done                                                              | HF via `Continuation::UpdateDone`                                         |
| 25  | updatePollOnce.ts:140         | gameStatusUpdate done (endQuietly)                                                 | SE `updateDone{completed:false}` (invalidateSteamUpdateState), then HF   |
| 26  | updatePollOnce.ts:216         | gameStatusUpdate updating + managedBySteam                                         | HF                                                                        |
| 27  | updatePollOnce.ts:225         | progressUpdate {percent,bytes,eta:''}                                              | HF                                                                        |
| +   | runningPoll.ts:228,243,257,303 | `deps.notify(appId,'playing'/'done')` (not sendFrontendMessage; the callback is a sidecar emit of the running-app status) | HF in plan 08 (running poll owns it) |

### Notifications

| Source                                    | Title source                     | i18n key / default / params                                                                                        | Destination                                     |
| ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| installPollOnce.ts:213 (waiting, bottle)  | libraryState title               | `steam.waitingForSteam.notify` "Restart Steam to finish installing {{game}}" {game}                                 | HN (`restart_steam_notice`)                     |
| restartHold.ts:27 notifyRestartSteamToFinish (installPollOnce:334,448) | libraryState title | same key                                                                                       | HN via `Continuation::Installed.notify_restart_steam` / direct |
| installPollOnce.ts:390                    | existing.title                   | `notify.install.finished` "Installation Finished"                                                                  | HN via `Continuation::Installed`                |
| installPollOnce.ts:413                    | existing.title                   | `steam.download.notify.depotSkipped` {depots}                                                                      | HN via `Continuation::Installed`                |
| uninstallPolling.ts:203                   | existing.title                   | `gamelib:steam.uninstall.copySurvives` {removed, survivor}                                                         | HN via `Continuation::Uninstalled`              |
| uninstallPolling.ts:246                   | existing?.title                  | `notify.uninstalled` "Game Uninstalled"                                                                            | HN via `Continuation::Uninstalled`              |

### Sidecar-state touches

| Call site                                                              | Touch                                                    | Destination                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| installPollOnce:304-358                                                | libraryState.set, steamLibraryStore.set 'games'          | SE `installed` (TS handler writes)                           |
| installPollOnce:138                                                    | markSteamInstallIncomplete                               | SE `installIncomplete` (R5)                                  |
| installPollOnce:462                                                    | verifyMacArchGroundTruth                                 | probe in Rust (plan 10); apply via SE `macArchVerdict` (R6)  |
| uninstallPolling:103                                                   | clearForcedWindowsViaBottle                              | SE `forcedWindowsViaBottleCleared`                           |
| uninstallPolling:105-235                                               | libraryState get/set, steamLibraryStore.set              | SE `uninstalled` (handler)                                   |
| uninstallPolling:~95 isBridgeAuthoritativeForInstallState              | read libraryState/metadata                               | `AckReply.bridgeAuthoritative` from the preceding ack        |
| uninstallPolling / bridge uninstall                                    | markBridgeGameUninstalled                                | SE `bridgeUninstalled` (D-11)                                |
| updatePollOnce:112-119, 139                                            | libraryState.get, invalidateSteamUpdateState             | SE `updateDone`                                              |
| installPolling:399,414                                                 | gameSession.isNativeInstallInFlight (per tick)           | PUSH `steampoll_native_in_flight` (R7)                       |
| installPolling:371, uninstallPolling:374; installPollOnce:212          | libraryState title                                       | start-arg `title`, refreshed by every ack (R2)               |
| resume.ts breadcrumbs (mark/clear/get)                                 | libraryState + steamLibraryStore                         | stays TS (R5, deferred); only `breadcrumbAppIsFullyInstalledOnDisk` moves to Rust |
| installPolling.ts `nextSteamRequestNoticeSeq`                          | closure counter                                          | `Registry::next_notice_seq` + `steampoll_next_notice_seq`    |

### Files and child processes

| Operation                                                     | Destination                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| appmanifest ACF reads (acfState.ts, acfUpdateState.ts)        | Rust, gamelib-steamfiles (plans 04, 05)                                  |
| restart-hold record write/remove (`steam_restart_hold` store) | `Effect::WriteHoldRecord/ClearHoldRecord` via `HoldSink`; single writer per run (R3) |
| nettop long-lived child (steamDownloadMonitor)                | `ProcessRunner::spawn_streaming` (plan 06)                               |
| ps / pgrep / tasklist / reg.exe probes (steamClientProcess, runningPoll) | `ProcessRunner::run` (plans 07, 08)                           |
| lipo -archs / file (macArch)                                  | `ProcessRunner::run` (plan 10)                                           |
| steam-bridge-helper                                           | `PollHost::bridge_helper_path` + `ProcessRunner::run`                    |
| wall-clock reads (Date.now for recordedAt, lastTickMs, lastSteamProbeMs) | `Clock::now_ms`                                               |

## Contract changes (versus the plan's `<interfaces>`)

- `StateEvent::Uninstalled` fields enumerated as `{appId, seq, source, survivor: Option<Survivor{source,installPath,sizeOnDisk,buildid}>}` (plan left `...fields`). Reason: uninstallPolling.ts:90-250 only needs the removed root and a surviving copy.
- `StateEvent::Installed.buildid` and `Survivor.buildid` are `Option<String>` (TS `installVersionField(undefined)` omits the field); `sizeOnDisk` stays the ACF string.
- `PollHost::state_event` returns the crate alias `BoxFuture<AckReply>` (no `'static` spelled out; alias is `Pin<Box<dyn Future + Send>>` which is `'static` by default for boxed trait objects).
- `StreamingChild` is `{ lines: mpsc::Receiver<String>, kill: CancellationToken }`.
- `Registry::cancel_all_and_wait(deadline)` is `async` (not blocking); `Registry` is `Clone` and also has `spawn`, `handle`, `host`, `runner`, `clock` accessors.
- `Continuation` variants: `None`, `InstallIncomplete`, `Installed`, `UpdateDone`, `Uninstalled`; `Effect::Log` carries a `LogLevel {Info, Warn}`.
- `AckReply::from_value` added (lenient parse for the host transport, T-80-01).
- `StateEvent` has `kind()`, `app_id()`, `seq()`, `key()` helpers.
- `testing` feature enabled by the crate's self dev-dependency and by the CLI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned the new crate names in cargoFeatures.test.ts**
- **Found during:** Task 2
- **Issue:** `src/backend/__tests__/cargoFeatures.test.ts` pins the Cargo.lock crate-name set; adding three crates would fail it (crates/README.md requires the same-commit update).
- **Fix:** added `gamelib-i18n`, `gamelib-steampoll`, `gamelib-steampoll-cli` to `EXPECTED_LOCKFILE_CRATE_NAMES`.
- **Files modified:** src/backend/__tests__/cargoFeatures.test.ts
- **Commit:** 25081fdd8

**2. [Rule 1 - Bug] OPS order**
- The plan's final OPS list put `steampoll_bridge_finalized` before `steampoll_breadcrumb_installed_on_disk`, which is not sorted; the contract requires sorted. Swapped; still 24 ops.

**3. Crate rust-version** set to 1.77.2 (README default), not the depot exception; builds on the current toolchain.

## Known Stubs

Module files other than events/effects/host/constants/registry/runtime/testing/dispatch/acf_state hold only a `//!` header naming the TS source and the plan that fills them (intended, per plan). `dispatch` answers `{op}:unknown-op` until plan 17.

## Threat Flags

None. T-80-01 (lenient ack), T-80-02 (logging rule in lib.rs doc), T-80-03 (`catch_unwind` in dispatch) mitigated.

## Self-Check: PASSED

Files and commits (9066d5a90, 25081fdd8) verified present.
