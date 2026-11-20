# Phase 80: Steam install/uninstall/update polling state machines in Rust - Pattern Map

**Mapped:** 2026-11-16
**Files analyzed:** 30 (new/modified; Rust new, TS thin wrappers/handler, TS to delete, tests)
**Analogs found:** 27 / 30 (3 have no analog: locale/i18n loader, nettop child + watchdog in Rust, scenario-replay timeline harness)

Line numbers are from reads on 2026-11-16 of the working tree. Paths are relative to `/Users/graysonmitchell/Projects/GameLib`.

## File Classification

### Rust (new)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/crates/gamelib-steampoll/Cargo.toml` (+ workspace member in `src-tauri/Cargo.toml:440-449`) | config | n/a | `src-tauri/crates/gamelib-depot/Cargo.toml` | exact |
| `.../gamelib-steampoll/src/lib.rs` (`PollHost` trait, `Registry`, effect/event types) | service | event-driven (host trait) | `gamelib-depot/src/lib.rs` + `JobHost` in `src-tauri/src/depot_dispatch.rs` | exact |
| `.../src/constants.rs` | config | n/a | `src/backend/storeManagers/steam/library/pollState.ts:34-70` (verbatim port) | exact (source-of-truth) |
| `.../src/install.rs` (installPolling + installPollOnce) | service | event-driven, timer-driven | `library/installPolling.ts:225-431`, `installPollOnce.ts` (TS being ported) | port |
| `.../src/uninstall.rs` | service | event-driven | `library/uninstallPolling.ts:90-250` | port |
| `.../src/update.rs` (74 D-11) | service | event-driven | `library/updatePollOnce.ts` | port |
| `.../src/running.rs` | service | polling | `library/runningPoll.ts` | port |
| `.../src/acf_state.rs` (acfState + acfUpdateState) | service | file-I/O | `gamelib-steamfiles/src/{acf.rs,library.rs}` + `gamelib-depot/src/acf.rs` | role-match |
| `.../src/monitor.rs`, `progress.rs` (nettop + content_log) | service | streaming (child process) | `steamDownloadMonitor.ts` (TS being ported); no Rust analog | partial |
| `.../src/hold.rs`, `breadcrumbs.rs`, `mac_arch.rs` | service | file-I/O + process probe | `steamRestartHold.ts`, `resumeBreadcrumbs.ts`, `macArch.ts` (TS being ported) | port |
| `.../src/outbox.rs` (state-event queue + ack) | service | pub-sub / request-response | `ShellJobHost` writer thread (`depot_dispatch.rs:70-147`) + `SidecarState::invoke` (`shell_state.rs:215-281`) | role-match |
| `gamelib-i18n` (or `locale.rs`) | utility | transform | none | no analog |
| `.../gamelib-steampoll/tests/*.rs` (ported 18 TS tests) | test | n/a | `gamelib-depot/tests/job_install.rs`, `gamelib-steamfiles/tests/security.rs` | role-match |
| `crates/gamelib-steampoll-cli/` (replay runner, optional) | utility | batch/ndjson | `crates/gamelib-steamfiles-cli/src/main.rs` | exact |
| `src-tauri/src/steampoll_dispatch.rs` (Args validation, `ShellPollHost`, boot resume, exit hook) | controller | request-response | `src-tauri/src/depot_dispatch.rs` (+ `steamfiles_dispatch.rs` for the thin-arm shape) | exact |
| `src-tauri/src/rust_dispatch.rs` (new arms) | route | request-response | itself, lines 20-132 | exact |
| `src-tauri/src/ipc_contract.rs` (generated, DO NOT EDIT) | config | n/a | regenerate with `pnpm gen:ipc-contract` | generated |
| `src-tauri/src/main.rs` (boot resume, `handle_exit`, `LONG_RUNNING_CHANNELS`/`timeout_for`) | config | lifecycle | `main.rs:745-755` (`handle_exit`), `main.rs:187-403` | exact |
| `src-tauri/crates/gamelib-steamfiles/src/readers.rs` (Windows `RunningAppID` DWORD read) | utility | file/registry I/O | `gamelib-steamfiles/src/discover.rs:120-180` (`hkcu_string_impl`) | exact |

### TypeScript (modified / new / deleted)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/common/types/sidecarTransport.ts` (new `RUST_STEAMPOLL_*` consts + `RUST_STEAMPOLL_CHANNELS` + add to `RUST_INVOKE_CHANNELS`) | config | n/a | same file `:500-520`, `:876-935` | exact |
| `src/common/types/ipc/rustInvoke.ts` (args types per channel) | config | n/a | same file, steamfiles entries | exact |
| `src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts` (typed `invokeSteamPoll`) | service | request-response | `localFiles/rustSteamFiles.ts` | exact |
| `src/backend/sidecar/steamPollEventRegistration.ts` (thin state-event handler; the only poll code left in TS) | controller | event-driven (ipc invoke) | `src/backend/sidecar/depotHostRegistration.ts` | exact |
| `src/backend/sidecar/handlers.ts` (register the handler) | config | n/a | `handlers.ts:104`, `:472` (`registerDepotHostFlows`) | exact |
| `library/installPolling.ts`, `uninstallPolling.ts`, `runningPoll.ts`, `acfState.ts`, `acfUpdateState.ts` (become thin wrappers or deleted) | service | request-response | `localFiles/rustSteamFiles.ts` | role-match |
| `library/macSteamPathFlag.ts` -> new `library/pollsFlag.ts` (`GAMELIB_STEAM_POLLS=ts`, dev-only) | config | n/a | `library/macSteamPathFlag.ts` | exact |
| `src/backend/__tests__/steamPollsPortComplete.test.ts` (delete gate) | test | n/a | `src/backend/__tests__/steamFilesPortComplete.test.ts` | exact |
| `meta/steamPollParitySweep.ts` + `80-PARITY.md` | test/utility | batch | `meta/depotParitySweep.ts`, `.planning/phases/79-*/79-PARITY.md` | role-match |
| `src/backend/__tests__/tauriShellSource.test.ts` (arm count pin, source registration) | test | n/a | itself `:484-488` | exact |

## Pattern Assignments

### `src-tauri/crates/gamelib-steampoll/Cargo.toml` (config)

**Analog:** `src-tauri/crates/gamelib-depot/Cargo.toml` (and `gamelib-steamfiles/Cargo.toml` for the clippy lint block).

```toml
[package]
name = "gamelib-steampoll"
version = "0.1.0"
edition = "2021"
rust-version = "1.77.2"       # depot is the documented exception (1.89); steampoll needs neither aes nor prost
publish = false

[lib]
path = "src/lib.rs"

[dependencies]
gamelib-steamfiles = { path = "../gamelib-steamfiles" }
tokio = { version = "1", features = ["rt-multi-thread", "sync", "time", "process", "macros", "io-util"] }   # depot has no "process": add it for nettop
tokio-util = "0.7"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[dev-dependencies]
tempfile = "3"
tokio = { version = "1", features = ["test-util"] }

[lints.clippy]
dbg_macro = "deny"
todo = "deny"
```

Register in `src-tauri/Cargo.toml` `[dependencies]` as `gamelib-steampoll = { path = "crates/gamelib-steampoll" }` (beside `:21-23`) and add to `[workspace] members` (`:440-449`). A `-cli` crate would also be a member.

### `gamelib-steampoll/src/lib.rs` + `src-tauri/src/steampoll_dispatch.rs` (host trait + shell glue)

**Analog:** `src-tauri/src/depot_dispatch.rs` (host trait injected by the shell) and `crates/gamelib-depot/src/lib.rs`.

**Module doc + imports** (`depot_dispatch.rs:1-13`):
```rust
//! Handlers for the three `depot_*` rustInvoke channels ... Each validates
//! through its generated Args struct, then passes to the Tauri-free `gamelib-depot` crate with a
//! `ShellJobHost` ...
//! Nothing here formats a job, event, token or argument into a log line (T-28-04 / T-73-46).
use super::*;
use gamelib_depot::{JobContext, JobEvent, JobHost, TokenRequest};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
```

**Host-trait shape to copy** (`depot_dispatch.rs:129-180`): `impl JobHost for ShellJobHost { fn emit(&self, ev) ... fn cdn_token(&self, req) -> Result<Option<String>,String> { self.state.invoke("depotCdnToken".to_string(), vec![json!({...})])? } }`. The new `PollHost` follows the same split: fire-and-forget methods (`emit_frontend`, `notify`) and one blocking request method (`state_event`).

**Fire-and-forget send frame** (`depot_dispatch.rs:93-104`), the pattern for progress-type state events that do not wait:
```rust
let req = SidecarRpcRequest {
    id: writer_state.next_id(),
    kind: "send",
    channel: "depotJobEvent".into(),
    args: vec![value],
};
// A dead pipe just means the sidecar is gone; EOF handling cancels the job.
let _ = writer_state.write_frame(&req);
```

**Acked request (the D-05 ack)**: `SidecarState::invoke` (`shell_state.rs:215-281`) writes an `invoke` frame and BLOCKS on an `mpsc` `recv_timeout(bound)` where `bound = timeout_for(&channel)` (`main.rs:397-403`; `None` means wait forever for channels in `LONG_RUNNING_CHANNELS`, `main.rs:187`). The timeout path removes the pending entry and calls `shell_diag(&invoke_abandoned_message(...))` + `record_abandoned`. Consequence for the planner: add an arm to `timeout_for` (or a new constant) so the state-event channel is bounded at about 5 s, rather than inheriting `INVOKE_TIMEOUT` (60 s default per RESEARCH). Call `invoke` only inside `tokio::task::spawn_blocking`, never on a worker thread.

**Emit to webview** (`main.rs:493-498` + `sidecar.rs:570-573`), the exact shape for D-04:
```rust
#[derive(Clone, Serialize)]
struct FrontendMessagePayload { channel: String, args: Vec<Value> }
// ...
let _ = app.emit(FRONTEND_MESSAGE_EVENT, FrontendMessagePayload { channel, args });
```
`FRONTEND_MESSAGE_EVENT` is `"frontend_message"` (`ipc_contract.rs:15`). `ShellPollHost::emit_frontend(channel, args)` = this call. `FrontendMessagePayload` is private to `main.rs` (a `struct` with no `pub`); `steampoll_dispatch.rs` uses `use super::*;` like the siblings so it sees it.

**Notification delivery** (`notification_show.rs:19-46`): there is no reusable fn that takes `(title, body)` with an `AppHandle` apart from `rpc_notification_show(args, app)`. `ShellPollHost::notify` should call it with `args = [json!({"title":..., "body":...})]` (it parses through `NotificationShowArgs::from_args`) or factor the body into a `pub(crate) fn show_notification(app, title, body)` and have both call it. It branches `macos_notifications::deliver(title, body)` when `notification_backend::backend() == UserNotifications`, else `app.notification().builder()...show()`. Do not duplicate that branch.

**Args structs / validation** (`steamfiles_dispatch.rs:1-54`):
```rust
pub(crate) fn rpc_steamfiles_read_acf(args: &[Value]) -> Result<Value, String> {
    SteamfilesReadAcfArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_read_acf", args)
}
```
and the generated `from_args` (`ipc_contract.rs:1380-1384`): `args.first().ok_or_else(|| "<chan>:bad-args")` then `serde_json::from_value(first.clone()).map_err(|_| "<chan>:bad-args")`. The `*Args` structs are generated from `src/common/types/ipc/rustInvoke.ts` by `meta/genIpcContract.ts`; add TS types, then run `pnpm gen:ipc-contract`. Never hand-edit `ipc_contract.rs`.

**Install-root path guard (D-12 / ASVS V4)** (`depot_dispatch.rs:17-40`): copy `guard_install_root`; move it (or call it) from the poll crate so `removeSteamInstallCopy` uses the same guard:
```rust
pub(crate) fn guard_install_root(root: &str) -> Result<(), String> {
    let bad = || "depot_job_run:bad-install-root".to_string();
    if !std::path::Path::new(root).is_absolute() { return Err(bad()); }
    let segs: Vec<&str> = root.split(['/', '\\']).filter(|s| !s.is_empty()).collect();
    if segs.iter().any(|s| *s == "." || *s == "..") { return Err(bad()); }
    let Some((_leaf, ancestors)) = segs.split_last() else { return Err(bad()); };
    if ancestors.iter().any(|s| s.eq_ignore_ascii_case("steamapps")) { Ok(()) } else { Err(bad()) }
}
```
Note: `removeSteamInstallCopy` deletes directories. Add canonicalisation + a refuse-symlink check on top of this (RESEARCH threat table); tests modelled on `crates/gamelib-steamfiles/tests/security.rs`.

**Runtime ownership: DECISION NEEDED.** `gamelib-depot` owns a private process-wide runtime (`lib.rs:~38-48`, `OnceLock<Runtime>`, 2 workers, `max_blocking_threads(8)`) and `run_job` calls `block_on`. D-07 says "in-process tokio tasks in the Tauri shell". Two valid analogs: (a) copy the depot `OnceLock<Runtime>` approach (self-contained, Tauri-free, testable) or (b) spawn on `tauri::async_runtime` from `steampoll_dispatch.rs` through the host. (a) is the closest existing pattern and keeps the crate Tauri-free; the planner should pick one and say so in plan 01.

**Shutdown hook** (`main.rs:742-756`, `handle_exit`) and sidecar-EOF hooks (`depot_dispatch.rs:290-293`, `steamcm_dispatch.rs:294-296`):
```rust
let still_running = gamelib_depot::registry::cancel_all_and_wait(EXIT_FINALIZE_WAIT);
if still_running > 0 { shell_eprintln!("[shell] depot jobs still running at exit deadline: {still_running}"); }
steamcm_exit_shutdown();
if let Some(state) = app_handle.try_state::<Arc<SidecarState>>() { state.shutdown_child(); }
```
Add a `steampoll_exit_shutdown()` call here, before `shutdown_child()`, that cancels every poll task (`CancellationToken`) and kills the Rust-owned nettop child. The depot registry (`gamelib-depot/src/registry.rs:57-120`: `register` returns a `JobGuard` whose `Drop` unregisters; `cancel`, `cancel_all`, `cancel_all_and_wait`) is the template for a poll registry keyed by appId: one entry per appId, guard dropped when the task ends.

**CRITICAL FINDING for D-08 (verified this session).** `surface_dead_sidecar` (`sidecar.rs:693-712`) always shows a Restart/Quit dialog, then `state.begin_shutdown()` and `app.restart()` or `app.exit(0)`. The shell never keeps running with a replacement sidecar. So "sidecar dies or restarts, polls keep running, replay on reconnect" (D-08) cannot occur mid-session; the only real un-acked window is boot (D-09: events produced before the sidecar's first READY, `sidecar.rs:461-464`). The queue/replay design should be sized for that single case. The existing EOF hooks (`on_sidecar_eof_cancel_jobs`, `on_sidecar_eof_drop_steamcm`) are the precedent to add a `on_sidecar_eof_*` for polls (e.g. drop queued events, leave polls to the app exit). This contradicts the wording of D-08/D-14's "sidecar connect and disconnect" scenarios; flag for the planner/discuss.

### `src-tauri/src/rust_dispatch.rs` (route)

**Analog:** itself, `:20-132`. Exhaustive match, no catch-all. Each new generated `RustInvokeChannel::SteampollXxx` variant needs one one-line arm:
```rust
RustInvokeChannel::DepotJobRun => rpc_depot_job_run(args, app),
RustInvokeChannel::SteamfilesReadAcf => rpc_steamfiles_read_acf(args),
```
Pin: `src/backend/__tests__/tauriShellSource.test.ts:484-488` asserts a literal arm count and `not.toContain('_ =>')`. Update the literal for every arm added, and register `steampoll_dispatch.rs` with whatever list `readTauriShellProductionFile` combines (RESEARCH Pitfall 8). Read that helper before planning.

### `src-tauri/crates/gamelib-steamfiles/src/readers.rs` (Windows `RunningAppID`, D-13)

**Analog:** `crates/gamelib-steamfiles/src/discover.rs:120-180` (`hkcu_string_impl`, `#[cfg(windows)]` / `#[cfg(not(windows))]` pair). Copy the two-fn cfg split and the `RegGetValueW` size-query/read structure, switching `RRF_RT_REG_SZ` to `RRF_RT_REG_DWORD` and reading one `u32`:
```rust
#[cfg(not(windows))]
fn hkcu_string_impl(_subkey: &str, _value: &str) -> Option<String> { None }

#[cfg(windows)]
fn hkcu_string_impl(subkey: &str, value: &str) -> Option<String> {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    let wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
    ...
    // SAFETY: `sub` and `val` are NUL-terminated and outlive the call ...
```
`windows-sys` 0.61 with `Win32_System_Registry` + `Win32_Foundation` is already a `[target.'cfg(windows)'.dependencies]` entry of this crate (`Cargo.toml`), so no new dep. Existing semantics to preserve: `library/runningPoll.ts:14-39` returns 0 on missing value, non-zero exit, timeout or thrown error. Put a trait seam (like `discover.rs`'s `Probe`/`RealProbe` with `hkcu_string`) so the Linux/macOS CI legs still test the 0-on-missing/0-on-error mapping (RESEARCH Pitfall 9). NOTE: current `readers.rs::read_running_app_id(path)` reads `registry.vdf` only (`:253-259`); the Windows reader is a new op/fn, not an extension of that signature.

### `gamelib-steampoll/src/{install,uninstall,update,running,constants}.rs` (state machines)

**Analog / source of truth:** the TS being ported. Copy the constants verbatim from `library/pollState.ts:34-70`:
```ts
export const GAMELIB_HANDOFF_STATE_FLAGS = 1026
export const STEAM_HOLD_PROBE_MIN_INTERVAL_MS = 10_000
export const GRACE_TICKS = 20
export const MAX_TICKS = 7200
export const STEAM_REQUEST_NO_ACTIVITY_TICKS = 40
export const MANIFEST_GONE_TICKS = 10
export const STEAM_INSTALLAPP_RETRY_EVERY_TICKS = 3
export const STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS = 13
export const STEAM_UPDATE_ABANDONED_TICKS = 20
export const STALLED_TICKS_THRESHOLD = 3
export const BYTES_PER_MIB = 1024 * 1024
```
Per-poll bookkeeping to port as one struct: `ActiveInstallPoll` (`pollState.ts:75-153`): `ticks, seenDownloading, source, notifiedWaiting, lastBytesDownloaded, lastTickMs, stalledTicks, isNativeHandoff, macNativeRoute, skippedDepots, notifiedDepotSkipped, delegatedToSteamClient, delegatedSinceTick, absentTicksSinceSeen, steamHold('unprobed'|'holding'|'released'), steamPidsAtHandoff, lastSteamProbeMs, awaitingUpdate{fromBuild,targetBuild,sawPending,sawActivity,settledAtStartTicks,installAppRetry{libraryPath,attempts,inFlight}}`. Uninstall poll: `{ticks, seenUninstalling}` (`pollState.ts:209-215`).

**Tick loop shape to port** (`installPolling.ts:260-318`): `entry.ticks++`; MAX_TICKS cap (with holding-release special case, `capReleasedHold`); then `await pollInstallOnce(...)` inside try/catch that logs and returns (next tick retries); `if (!activePolls.has(appId)) return`; then the grace/no-activity/manifest-gone branches. Rust: `tokio::time::interval(3s)` with `MissedTickBehavior::Delay` so a slow tick never overlaps itself (D-10); make each machine a pure `step(&mut State, Observation) -> Vec<Effect>`, the async task only gathers observations and applies effects. At the cap, `awaitingUpdate` sends a terminal `gameStatusUpdate {appName, runner:'steam', status:'done'}` (`installPolling.ts:289-295`).

**Side-effect to state-event mapping, copy these literal payloads.** Install completion (`installPollOnce.ts:303-360`): `libraryState.library.set(appId, {...existing, is_installed:true, install:{install_path, install_size: getFileSize(Number(sizeOnDisk)), platform: installPlatformForSource(source), ...installVersionField(buildid)}})` then `steamLibraryStore.set('games', Array.from(library.values()))` then `sendFrontendMessage('pushGameToLibrary', updated)`. Uninstall completion (`uninstallPolling.ts:224-250`): library entry `{...existing, is_installed:false, install:{}}`, `pushGameToLibrary`, `gameStatusUpdate {status:'done'}`, `notify({title: existing?.title ?? '', body: i18next.t('notify.uninstalled','Game Uninstalled')})`. Survivor case (`:170-215`): notify body `i18next.t('gamelib:steam.uninstall.copySurvives', 'Removed the {{removed}} copy. A {{survivor}} copy is still installed — use Remove all copies… to remove it too.', {removed, survivor})` (namespace prefix `gamelib:`; the default-NS is `translation`).

**IMPORTANT, not covered by D-02 as written:** the TS polls READ `libraryState.library.get(appId)` (`existing`, for `title` in every notification and for the spread that builds the pushed `SteamGameInfo`) and WRITE `deps.stores.steam.steamLibraryStore` (a sidecar-owned file store). Rust does not own the library map (deferred). So the state event must be where `{...existing, is_installed, install}` is built (in the TS handler, which has `existing`), and notification titles need a source: either the start-of-poll options carry `title`, or the ack reply returns it. Decide this in plan 01; it also determines whether `pushGameToLibrary` is emitted by Rust (needs the full `SteamGameInfo`) or by the TS handler on the sidecar emitter (changes the ordering story, RESEARCH Pitfall 1). The same applies to `markSteamInstallIncomplete` (`resumeBreadcrumbs.ts:24-47`: mutates `libraryState` + `steamLibraryStore` + emits `pushGameToLibrary`), which D-06 lists as "moving" but is purely sidecar state: it should become a state event, not Rust logic.

**Update poll** (`updatePollOnce.ts:112-139`): `deps.steamSession.libraryState.library.get(appId)` and two `invalidateSteamUpdateState(deps, appId)` calls become two state-event kinds (or one `updateDone` kind); 74 D-11 rules stay exactly: bit 4 never completes alone, a build change completes, no activity ends quietly.

**Running poll** (`runningPoll.ts:1-80`): Windows `reg query ... /v RunningAppID` with regex `RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)` and 0-on-anything-wrong (`:14-39`); macOS = `<userHome>/Library/Application Support/Steam/registry.vdf` via `invokeSteamFiles(... RUST_STEAMFILES_READ_RUNNING_APP_ID, {path})` (`:50-80`; `strict` flag propagates a rejected invoke). In Rust both become direct `gamelib_steamfiles::read_running_app_id` / the new Windows fn. The TS file also has an `inFlight` re-entrancy guard (RESEARCH Pattern 2: gone by construction with one awaiting task).

**Test shape** (RESEARCH Code Examples; copy depot's dev-dep `tokio = { features = ["test-util"] }`):
```rust
#[tokio::test(start_paused = true)]
async fn grace_expires_after_20_ticks_without_manifest() { /* RecordingHost + tempfile ACF dir + tokio::time::advance */ }
```
`gamelib-depot/src/stall.rs` already has the "inject `now_ms` instead of reading a clock" idiom (`has_stalled_at(now_ms)`), which is the pattern for the `lastTickMs`/`lastSteamProbeMs` wall-clock pieces D-10 keeps.

### `gamelib-steampoll/src/acf_state.rs` (file-I/O)

**Analog:** `gamelib-steamfiles` public API (read it, do not reparse): `read_acf`, `scan_acfs`, `find_acf`, `write_app_manifest`, `AcfRecord` (fields: `appid, name, installdir, stateFlags, stateFlagsRaw, sizeOnDisk, buildid, lastOwner, bytesDownloaded, bytesToDownload, bytesStaged, bytesToStage, targetBuildId, scheduledAutoUpdate, betaKey, installedDepots[]`; mirrored in TS at `localFiles/steamFilesTypes.ts:55-79`) and `AcfReadResult {exists, parsed, readError, record}`. `gamelib-depot/src/acf.rs` is the closest existing Rust consumer of those types (it is what `gamelib-depot` already uses to finalize the 1026 record). Path-guard analog: `depot_dispatch.rs:20-40` (see above) and `crates/gamelib-steamfiles/tests/security.rs`.

### `gamelib-steampoll/src/monitor.rs` + `progress.rs` (nettop child, content_log tail)

**Analog (TS being ported):** `steamDownloadMonitor.ts:1-60` (header doc is the spec) + `steamDownloadProgress.ts` (pure maths: `applyNettopRow`, `parseNettopRow`, `parseContentLogLine`, `windowRate`, `createFlowAccumulator`, `createUpdateTracker`). Constants: `MAX_TAIL_BYTES = 256 * 1024`, `SAMPLE_RING_MS = 5000`. Port the pure maths first (deterministic, unit-testable with the existing TS test vectors in `__tests__/steamDownloadMonitor.test.ts`), then the child.

**Child process: no Rust analog.** The only watchdog is TS `childWatchdog.ts` (`buildWatchdogSpawn`), a `/bin/sh` script polling the sidecar pid. In Rust: anchor on the shell pid (`std::process::id()`), spawn with `tokio::process::Command` + `kill_on_drop(true)`, argv arrays only (no shell interpolation), no `env` (nettop reads no user profile: "Two-profile rule", header lines 12-14), kill in the exit hook (`handle_exit`), and test the SIGKILL-the-shell orphan case in smoke 1 (RESEARCH Pitfall 5). Cargo test spawns follow the fake-HOME convention (`Skill("gamelib-conventions")`): `createFakeHomeProfile()` is TS only, so Rust tests must set an isolated `HOME` explicitly; `fakeHomeIsolation.test.ts` does not cover Rust spawn sites.

### `gamelib-steampoll/src/hold.rs`, `breadcrumbs.rs` (persisted state)

**Analog (TS being ported):** `steamRestartHold.ts:1-60`: `SteamRestartHoldRecord {pids:[{pid:number, startToken:string}], recordedAt:number, macNativeRoute:boolean, skippedDepots:string[]}`; store is a `CacheStore`-shaped `get/set/delete/entries` over `deps.stores.steam.steamRestartHoldStore`; disk content is untrusted and safe-parsed (`parseRecord`: non-empty `pids`, each `pid` a positive safe integer, `startToken` non-empty string).

**RISK (not addressed in RESEARCH/CONTEXT):** these stores are sidecar `fileStore` JSON files (`src/backend/sidecar/fileStore.ts`: synchronous, in-memory + `${cwd}/${name}.json` under userData, path containment enforced). With `polls=rust` Rust must read/write that same JSON file while the sidecar's in-process store holds an in-memory copy that it rewrites on any `set`. D-16 "dual-readable" does not say who owns the file while `polls=rust`. Either (a) Rust becomes the sole writer for these two store names and the sidecar never `set`s them (needs a sidecar-side audit of every `steamRestartHoldStore`/breadcrumb access), or (b) Rust writes through a state event. Resolve in Wave 0; pin the on-disk format with a test that reads files written by the real TS store.

### `gamelib-steampoll/src/outbox.rs` (state-event queue + ack, D-05/D-08)

**Analog:** `ShellJobHost` bounded queue + writer thread (`depot_dispatch.rs:12-13, 70-147`): `sync_channel(EVENT_QUEUE_BOUND = 64)`, droppable-vs-important split (`is_droppable`), `finish()` drops the sender then joins the writer so the later response frame cannot overtake queued events. For a per-appId latest-wins map instead of a FIFO, copy the lifecycle (sender drop + join), not the channel type. Ack = `SidecarState::invoke` (see above). Make the event idempotent (appId + monotonic seq + full resulting state, not a delta) because a half-applied event may be replayed (RESEARCH Pitfall 3).

**Sidecar-side handler analog:** `src/backend/sidecar/depotHostRegistration.ts:50-120`:
```ts
export function registerDepotHostFlows(deps: {
  ipc: Pick<IpcRegistry, 'handle' | 'on'>
  depotJobs: Pick<DepotJobRegistry, 'lookupActiveDepotJob' | 'dispatchDepotJobEvent'>
}): void {
  deps.ipc.handle('depotCdnToken', async (_event: unknown, ...args: unknown[]) => {
    const req = args[0]
    const jobId = field(req, 'jobId')
    ...
    return ''
  })
  deps.ipc.on('depotJobEvent', (_event: unknown, ...args: unknown[]) => {
    const ev = args[0] as RustJobEvent | undefined
    if (!ev || typeof ev.jobId !== 'string') return
    try { deps.depotJobs.dispatchDepotJobEvent(ev) } catch (err) { logFailure('depotJobEvent', ev.jobId, err) }
  })
}
```
Copy: `ipc.handle` (not `on`) for the acked kinds, `ipc.on` for non-acked progress kinds; `field()` defensive reads; `logFailure` logs channel + appId only, never the payload; header comment states all channels are `caller: 'shell'` (`sidecarInternal.ts`) and schema-validated by `validateInbound` before the handler runs, so add the new channel(s) to those lists. "No timers, watchers or handles are created here (sidecar exit contract)." Registration call is at `src/backend/sidecar/handlers.ts:472` (`registerDepotHostFlows({...})`, import at `:104`).

### `src/common/types/sidecarTransport.ts` + `ipc/rustInvoke.ts` + generated Rust (channel plumbing)

**Analog:** the steamfiles block. Const + doc comment per channel (`sidecarTransport.ts:500-520`):
```ts
export const RUST_STEAMFILES_READ_RUNNING_APP_ID = 'steamfiles_read_running_app_id' as const
```
a grouped array (`:878-890`) `RUST_STEAMFILES_CHANNELS = [...] as const` and `export type RustSteamFilesChannel = (typeof RUST_STEAMFILES_CHANNELS)[number]`, and membership in `RUST_INVOKE_CHANNELS` (`:776`). Generated Rust side: `RustInvokeChannel::from_name` and `name()` arms plus `*Args::from_args` in `src-tauri/src/ipc_contract.rs` (header: "@generated by meta/genIpcContract.ts — DO NOT EDIT. Regenerate with: pnpm gen:ipc-contract"; `pnpm check:ipc-contract` fails CI when stale). Proposed channels (names are Claude's discretion): `steampoll_install_start`, `steampoll_install_stop`, `steampoll_install_query`, `steampoll_install_cancel_delegated`, `steampoll_uninstall_start`, `steampoll_uninstall_stop`, `steampoll_running_start/stop`, and the ACF ops moved from `acfState.ts`.

### `src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts` (TS wrapper)

**Analog:** `localFiles/rustSteamFiles.ts` (whole file, 20 lines):
```ts
export function invokeSteamFiles<C extends RustSteamFilesChannel>(
  deps: RustInvokeDeps, channel: C, args: SteamFilesArgsFor<C>
): Promise<SteamFilesResultFor<C>> {
  logDebug(`[steamfiles] rust ${channel}`, LogPrefix.Steam)
  return deps.requestRustInvoke(channel, [args] as RustInvokeArgsOf<C>) as Promise<SteamFilesResultFor<C>>
}
```
Header contract to keep: "no timers, no handles, no work at import"; a rejection propagates and each caller owns its fail-closed mapping. Types file analog: `localFiles/steamFilesTypes.ts` (mirror the Rust serde camelCase structs; `STEAMFILES_OPS` equals the crate's `OPS`, sorted, checked by a test, so do the same for any poll op list). Existing sync call sites (`isDelegatedInstallPolling`, `cancelDelegatedInstall`, `stopInstallPolling`, `stopUninstallPolling`; `installPolling.ts:475-514`) become async (63 D-09); grep callers first (`gamedetails/dispatch.kill()` is the named caller of `isDelegatedInstallPolling`, `installPolling.ts` doc).

### `library/pollsFlag.ts` (dev-only `polls` flag, D-16)

**Analog:** `library/macSteamPathFlag.ts` (whole file): a one-function env read, off the normal UI, with a header naming the todo that retires it:
```ts
export function macSteamPathEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GAMELIB_STEAM_MAC_PATH === 'on'
}
```
Copy as `pollsImpl(env): 'rust' | 'ts'` reading `GAMELIB_STEAM_POLLS`. The Phase 75 D-08 flags (`GAMELIB_STEAMFILES_TEXT`, `GAMELIB_STEAMFILES_SHORTCUTS`) were deleted at the gate and are only visible as FORBIDDEN identifiers in `steamFilesPortComplete.test.ts`, so there is no live example of a flag with a Rust-side reader. The shell-side start (boot resume, D-09) runs before the sidecar can tell Rust the flag value, so the shell must read the env var itself (`std::env::var("GAMELIB_STEAM_POLLS")`); do not pass it through the sidecar. With `polls=ts`, Rust boot resume must not start.

### `src/backend/__tests__/steamPollsPortComplete.test.ts` (delete gate)

**Analog:** `src/backend/__tests__/steamFilesPortComplete.test.ts` (copy structure whole). Pieces to reuse: `DELETED` list + `existsSync` assertions, `FORBIDDEN` identifiers scanned over `src` and `meta` with `walk()` (skips `node_modules`, `__tests__`) and `stripComments`, the self-validating "the scan can fail" test, `KEPT` fixtures/Cargo.toml, package.json check, and the anti-vacuity guard (`scanned.length >= 500`). New values: DELETED = the poll TS files named in CONTEXT `<code_context>` (`installPolling.ts`, `installPollOnce.ts`, `uninstallPolling.ts`, `updatePollOnce.ts`, `pollState.ts`, `runningPoll.ts`, `installStop.ts`, `restartHold.ts`, `resumeBreadcrumbs.ts`, `macArch.ts`, `steamDownloadMonitor.ts`, `steamDownloadProgress.ts`, `steamRestartHold.ts`; `acfState.ts`/`acfUpdateState.ts` only if no wrapper callers remain, D-12), FORBIDDEN = `GRACE_TICKS`, `MAX_TICKS`, `STEAM_REQUEST_NO_ACTIVITY_TICKS`, the `polls` flag name (`GAMELIB_STEAM_POLLS`), `reg.exe` runner call for `RunningAppID`, KEPT = the replay fixtures and `gamelib-steampoll/Cargo.toml`. Beware: the thin state-event handler and the TS wrappers legitimately use some identifiers (`markManagedBySteam`, etc.), so keep FORBIDDEN to poll-loop symbols.

### `meta/steamPollParitySweep.ts` + `80-PARITY.md` (parity harness)

**Analog:** `meta/depotParitySweep.ts`, `meta/gamelibSteamfilesCli.ts` (CLI build/launch helper), report shape from `.planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-PARITY.md`. Report skeleton to copy:
```
# Phase 80 Parity Report
Status: APPROVED (...)
## Corpus
| Category | Count |
## <sweep> 
| Category | Inputs | Equal | Explained | Unexplained |
## Divergences
### DV-80-01: <title>
- source: ...  - steam-user/TS: ...  - Rust: ...  - Steam-correct side: ...  - caller impact: ...  - accepted: yes (YYYY-MM-DD)
```
Delete gate = Unexplained 0 (63 D-07: every divergence recorded with the Steam-correct side, not silently matched). For the Rust side use a `gamelib-steampoll-cli` that mirrors `crates/gamelib-steamfiles-cli/src/main.rs` (`--list`, `--ndjson` one `{op,args}` per line to one `{ok,result|error}` line, exit 2 on op error, 64 on usage), with a recording `PollHost` printing the ordered `{frontend|notify|state|file}` stream. For the TS side the existing loop tests already inject `deps`, intervals and `notify`, so reuse their fakes (`library.installPolling.test.ts` etc.). There is no existing scenario-replay timeline format; that is new (see No Analog).

## Shared Patterns

### Tauri-free crate + thin shell dispatch (63/73/75/79)
**Source:** `steamfiles_dispatch.rs` (one-line pass-through), `depot_dispatch.rs` (host trait), `rust_dispatch.rs` (flat router).
**Apply to:** every new rustInvoke channel. Args struct validates; crate fn does the work; the shell arm is one line; nothing `tauri::*` appears in `gamelib-steampoll`.

### Results not errors, no logging of arguments
**Source:** `gamelib-depot/src/lib.rs:1-8` doc ("`Err` means bad args, an unknown op or a panic only ... Never log keys or tokens"), `gamelib-steamfiles/src/lib.rs:178-181`:
```rust
pub fn dispatch(op: &str, args: &[Value]) -> Result<Value, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_op(op, args)))
        .unwrap_or_else(|_| Err(format!("{op}:panic")))
}
```
**Apply to:** any `steampoll_*` dispatch fn (a panic must not take down the shell reader/worker); `depot_dispatch.rs:5-6` T-28-04 "nothing formats a job/argument into a log line"; log appId and counts only.

### Exhaustive generated channel enum
**Source:** `rust_dispatch.rs:13-20`. A channel without an arm fails the build; an unknown wire name returns `rustInvoke:unknown-channel:{channel}` before any arm. Apply to every new channel.

### Sidecar exit contract (TS side, binding while `polls=ts`)
**Source:** `Skill("gamelib-conventions")`; headers of `pollState.ts` (D-10 exception: interval created and `unref`'d in `installPolling.ts` beside `activePolls.set`, `installPolling.ts:431` `timer.unref?.()`) and `depotHostRegistration.ts` ("No timers, watchers or handles are created here"). The new TS state-event handler and wrappers create no timers/handles/work at import.

### `<verify>` and prettier
**Source:** CLAUDE.md convention 5. For TS/Markdown files written: `npx prettier --check <exact paths>` after `--file-info` (this `.planning` dir may be prettier-ignored; say so and omit).

### Persisted formats readable by both sides while the flag exists (79 D-10)
**Source:** `steamRestartHold.ts` record shape + safe-parse (above). Apply to `hold.rs` and `breadcrumbs.rs`; ship a golden test on a TS-written file.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `gamelib-i18n` / `locale.rs` (D-03) | utility | transform | No Rust i18n exists. Facts for the planner: the sidecar i18next init (`src/backend/sidecar/bootstrap.ts:~2660-2690`) sets `fallbackLng: 'en'`, `returnEmptyString:false`, `returnNull:false`, `ns: ['translation','gamelib']`, `defaultNS: 'translation'`, `...i18nextLanguageOptions(settings.language)` (`lng` + `supportedLngs`), and the renderer (`src/frontend/index.tsx:248`) and `nonesteamgame.ts:57` use `escapeValue: false`; whether the backend init also sets `escapeValue:false` is NOT confirmed. Locale files: `public/locales/<lang>/{translation,gamelib,gamepage,login}.json`, 49 locales. Notification keys use inline defaults (`i18next.t('notify.uninstalled','Game Uninstalled')`) and a namespace prefix (`gamelib:steam.uninstall.copySurvives`), so the Rust API must be `t(key, default, params)`. How Rust learns `settings.language`: not found; read the app config file at notify time (RESEARCH Open Question 3). |
| nettop child + watchdog in Rust (`monitor.rs`) | service | streaming (child) | Only TS `childWatchdog.ts` exists; Rust spawns of this kind (kill-on-quit, shell-pid anchor) have no analog beyond `SidecarState::shutdown_child`/`reap_dead_sidecar_tree` (`shell_state.rs`, `sidecar.rs:693-697`) which handle the sidecar, not a long-lived grandchild. |
| Scenario-replay timeline + dual TS/Rust driver | test | batch | `meta/depotParitySweep.ts`/`steamcmParitySweep.ts` compare live ops, not scripted per-tick timelines. The corpus list is in RESEARCH "How parity is proven" item 4. |

## Open Items For The Planner (found while mapping)

1. **D-08 replay is moot mid-session.** `surface_dead_sidecar` (`sidecar.rs:693-712`) restarts or quits the whole app; no surviving shell with a new sidecar. Only the pre-READY boot window needs queueing (D-09).
2. **libraryState reads and `steamLibraryStore` writes inside the polls** (see Pattern Assignments above) are not covered by D-02's list; they force the state-event schema to carry or return `title` and the built `SteamGameInfo`, and decide who emits `pushGameToLibrary`.
3. **Persisted stores owned by the sidecar `fileStore`** (`steamRestartHoldStore`, breadcrumbs): single-writer ownership while `polls=rust` must be settled.
4. **Windows `RunningAppID` read is a new fn**, not an extension of `read_running_app_id(path)`.
5. **Runtime choice**: depot-style private `OnceLock<Runtime>` vs `tauri::async_runtime`.
6. **Pin tests**: `tauriShellSource.test.ts:484-488` arm-count literal and the combined-source file list.
7. **`timeout_for`/`LONG_RUNNING_CHANNELS`** (`main.rs:187, 397-403`): give the state-event channel a 5 s bound.

## Metadata

**Analog search scope:** `src-tauri/src`, `src-tauri/crates/{gamelib-depot,gamelib-steamfiles,gamelib-steamfiles-cli}`, `src/backend/storeManagers/steam/{library,localFiles,depotRust}`, `src/backend/sidecar`, `src/backend/__tests__`, `src/common/types`, `meta/`.
**Files scanned:** about 45 (read in full or by range); not read: `installPollOnce.ts` beyond `:295-375`, `updatePollOnce.ts` beyond `:112-139`, `acfState.ts`, `macArch.ts`, `resume.ts`, `steamDownloadProgress.ts`, `childWatchdog.ts`, the 18 TS test files (the planner/executor reads each when porting).
**Pattern extraction date:** 2026-11-16
