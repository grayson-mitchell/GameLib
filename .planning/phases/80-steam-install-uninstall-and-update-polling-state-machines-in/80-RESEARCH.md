# Phase 80: Steam install, uninstall and update polling state machines in Rust - Research

**Researched:** 2026-11-16
**Domain:** Rust port (tokio tasks in the Tauri shell) of the Steam poll loops; Rust-to-sidecar state events; Rust i18n/notifications; parity harness
**Confidence:** MEDIUM (codebase facts verified by reading; the state-event/ack transport and the locale resolution rules need a Wave 0 spike)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01..D-16 in `80-CONTEXT.md` are locked; copy them from there verbatim when planning. Summary of the ones that shape the plan:
- D-01 Rust owns loops, timers, per-appId registries, restart hold, ACF/file work, frontend messages, notifications. TS loops are deleted, not wrapped.
- D-02/D-05/D-08 Sidecar-owned state (libraryState, gameSession, update cache, markManagedBySteam, clearForcedWindowsViaBottle, markBridgeGameUninstalled) changes only through typed state events applied by a thin TS handler. On transitions: state event, wait for ack (bounded about 5 s), then frontend emit + notification. Progress ticks never wait. Un-acked events queue per appId, latest wins, replayed on sidecar reconnect.
- D-03 Notification text is translated in Rust from `public/locales/<lang>/*.json` (en fallback, `{{var}}` interpolation, multi-namespace), delivered via the existing Rust notification service. Reusable module.
- D-04 Same channel names and payload shapes; no frontend changes.
- D-06 Download monitor (nettop + content_log), restart hold + store, resume breadcrumbs + `markSteamInstallIncomplete`, `verifyMacArchGroundTruth` all move.
- D-07 In-process tokio tasks, one per appId, in a Tauri-free crate hosted by the shell; explicit shutdown hook; Rust owns the nettop child.
- D-09 Boot resume in Rust at shell start; the poll-restart half of `resume.ts` is deleted.
- D-10 Tick model unchanged: fixed 3 s, same constants, no overlapping ticks per appId, no wall-clock conversion, no file watching.
- D-11 `bridgeInstallState.ts` stays TS except `markBridgeGameUninstalled`, which becomes a state event.
- D-12 All of `acfState.ts` and `acfUpdateState.ts` move onto `gamelib-steamfiles` (including `removeSteamInstallCopy`, `enumerateSteamInstallCopies`, `findOtherManifestsWithInstalldir`, `scanDownloadingAppIds`); path guard lives only in Rust.
- D-13 `runningPoll` moves, native `RunningAppID` registry read on Windows (no `reg.exe`), same 0-on-missing/0-on-error.
- D-14 Parity = scripted-timeline replay through TS and Rust loops with full output-stream diff, each divergence explained (63 D-07); the 18 existing TS test files are ported to cargo tests.
- D-15 Four live smokes on `pnpm tauri:dev` with real Steam (Mac handoff install, depot install + update, uninstall + quit-resume, running poll incl. the WazHack todo).
- D-16 One dev-only `polls` fallback flag (rust | ts), default rust after parity, deleted at the delete gate; persisted restart-hold and breadcrumb formats stay dual-readable while it exists; `polls=ts` still obeys the sidecar exit contract.

### Claude's Discretion
Crate placement; channel names / state-event schema / ack carriage (reuse the 73 `RustJobEvent` path where it fits); how a Tauri-free crate reaches webview + notifications (inject trait); TS-facing query surface mapping (`isDelegatedInstallPolling`, `cancelDelegatedInstall`, `stopInstallPolling`, `stopUninstallPolling`); harness location and timeline format; how Rust learns the current language.

### Deferred Ideas (OUT OF SCOPE)
Moving Steam library state (libraryState, gameSession, update cache) into Rust; Rust bridge install routing (rest of `bridgeInstallState.ts`). Reviewed-and-not-folded todos: Windows signing, blank-render, pinned libsteam_api, Friends after go-offline, x86 shim parity, optionaldlc.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped (TBD). The planner should mint phase-local IDs from D-01..D-16 and the delete gate (suggest P80-A..P80-n, mirroring `P75-G` in `steamFilesPortComplete.test.ts`).
</phase_requirements>

## Summary

This is a port of about 2,770 lines of TS poll logic (plus about 1,000 lines of helpers: download monitor and progress maths, restart hold, breadcrumbs, mac arch, resume) into a new Tauri-free crate, hosted by the shell the same way `gamelib-depot` is. The shell already has everything the pattern needs: a flat `rustInvoke` router (`src-tauri/src/rust_dispatch.rs`, exhaustive match over a generated `RustInvokeChannel` enum, so every new channel is a compile error until wired), a `*_dispatch.rs` file per domain, a `JobHost` trait injected into `gamelib-depot` (`depot_dispatch.rs`), tokio already in the dependency tree (1.54.1), `app.emit(FRONTEND_MESSAGE_EVENT, FrontendMessagePayload{channel,args})` for webview messages, and a Rust-to-sidecar blocking request path (`SidecarState::invoke`, `shell_state.rs`, 60 s default timeout, `LONG_RUNNING_CHANNELS` exempt). `gamelib-steamfiles` already has `read_acf`, `scan_acfs`, `find_acf`, `read_running_app_id` (with a `windows-sys` registry dependency already declared), and `write_app_manifest`.

The new work has three genuinely hard parts, none of them the tick arithmetic: (1) the state-event/ack transport between Rust and a TS handler, including queue-and-replay across sidecar death/reconnect (D-05/D-08); (2) Rust-side i18n that reproduces i18next key resolution across namespaces and per-call default strings (D-03); (3) proving parity of side-effect streams, including ordering between sidecar-emitted and Rust-emitted frontend messages. The tick logic itself is mechanical and has 18 TS test files (10,732 lines) to port.

**Primary recommendation:** Create a new crate `src-tauri/crates/gamelib-steampoll` (Tauri-free, `tokio` + `gamelib-steamfiles`), with a single `PollHost` trait (`emit_frontend`, `notify(key, params)`, `state_event(ev) -> ack future`, `now`, `process spawn` for nettop/`ps`/Steam probes, `fs`). Drive it from a synchronous-clock-free design: every loop takes an injectable clock/`tokio::time::pause` so the same scripted timelines run in `cargo test` and the harness. Build the state-event channel first (Wave 0 spike) because every later plan depends on its shape.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Poll loops, tick counters, per-appId registries | Rust shell (tokio task, `gamelib-steampoll`) | - | D-01/D-07 |
| ACF read/write/scan/path guard | Rust (`gamelib-steamfiles`) | TS thin `rustInvoke` wrappers for remaining callers | D-12 |
| Running-app probe (registry.vdf / `HKCU\...\RunningAppID`) | Rust | - | D-13 |
| Download monitor (nettop child, content_log tail) | Rust | - | D-06/D-07 |
| Restart hold + breadcrumbs persistence | Rust | TS reads/writes same file formats during `polls=ts` window | D-06/D-16 |
| libraryState / gameSession / update cache / managed-by-steam / forced-via-bottle / bridge-uninstalled | Node sidecar (unchanged) | Rust emits typed events | D-02, deferred move |
| Frontend messages (27 call sites) | Rust (`app.emit`) | sidecar still emits all non-poll messages | D-04 |
| Notifications + locale text | Rust (`notification_show` path + new locale module) | - | D-03 |
| Poll start/cancel/query API | TS call sites keep signatures, forward over `rustInvoke` | - | D-09 / integration points |
| Boot resume | Rust at shell start | TS handler receives queued events when sidecar connects | D-09 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tokio | 1.54.1 (already in lockfile via gamelib-depot) [VERIFIED: `cargo tree -i tokio`] | one task per appId, `time::interval`, `process::Command` for nettop, `time::pause` for tests | Already the runtime used by `gamelib-depot` and `gamelib-steamcm` |
| gamelib-steamfiles | in-repo | ACF read/scan/find, registry.vdf RunningAppID, ACF write | Phase 75; D-12 |
| serde / serde_json | 1 | State-event + frontend payload shapes | Already everywhere |
| windows-sys | 0.61 (already a dep of gamelib-steamfiles, features Win32_System_Registry, Win32_Foundation) [VERIFIED: Cargo.toml] | native `RunningAppID` read (D-13) | Already in tree; no new crate |
| tempfile (dev) | 3 | ACF scenario dirs in tests | Used by steamfiles tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tokio `test-util` | 1 | `start_paused`, `advance` to run 7200-tick scenarios instantly | All loop tests (gamelib-depot already enables it as dev-dep) |
| tokio-util `CancellationToken` | 0.7 (in lockfile via depot) | per-appId stop + app-quit shutdown hook | Stop/cancel/shutdown |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New crate `gamelib-steampoll` | module in `gamelib-steamfiles` | Rejected: steamfiles is deliberately IO-format-only, no tokio. A new crate keeps the 63 pattern and keeps steamfiles synchronous. Recommend new crate. |
| Hand-written i18next-style loader | an i18n crate (e.g. rust-i18n, fluent) | Those use their own key/format models; locales are i18next JSON (`{{var}}`, namespaces, possibly plural suffixes). A small purpose-built loader is smaller and exact. See Don't Hand-Roll note. [ASSUMED: no crate reads i18next JSON natively; not searched] |

**Installation:** no new external packages recommended. Everything is in-repo or already in `Cargo.lock`. If the planner adds a crate (e.g. `winreg`, a nettop helper), run the Package Legitimacy gate first; prefer the existing `windows-sys`.

**Version verification:** `cargo 1.99.1` is installed; tokio 1.54.1 confirmed in the dependency tree (above).

## Package Legitimacy Audit

No new external packages are recommended. All dependencies are already in `src-tauri/Cargo.lock`. slopcheck not run (nothing to check).

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 TS call sites (gameInstall, gameInstallDepot, updateNative, gameUninstall,
 steamProcesses.createRunningPoll, resume.ts)
        | rustInvoke('steampoll_start_install' | '..._stop' | '..._query' | ...)   (signatures unchanged, now async)
        v
 src-tauri/src/steampoll_dispatch.rs  (Args structs, validate, thin arms)
        |
        v
 gamelib-steampoll (Tauri-free)                           <-- shell boot: resume_from_breadcrumbs()
   Registry { installs: Map<appId,Task>, uninstalls, running }
   per-appId tokio task:  every 3 s  ->  tick()
        tick: read ACF (gamelib-steamfiles) -> step state machine -> Effects
        helpers: DownloadMonitor(nettop child + content_log tail), RestartHold(store),
                 Breadcrumbs, MacArch
        Effects  -------------------------------+----------------------+------------------+
                                                 |                      |                  |
                                   host.emit_frontend(chan,args)  host.notify(key,params)  host.state_event(ev)
                                                 |                      |                  |
                                  app.emit(FRONTEND_MESSAGE_EVENT)   locale module ->   Outbox (per-appId, latest wins)
                                                                     notification_show     |  write 'steamPollState' frame
                                                                                           v
                                                                         Node sidecar thin handler ---> libraryState,
                                                                         gameSession, markManagedBySteam, ...
                                                                                           | ack
   transition order (D-05):  state_event --await ack (<=5 s, else log+continue)--> emit_frontend --> notify
   progress ticks: emit_frontend only, never wait.
   sidecar down: Outbox keeps latest per appId; replay on reconnect (ready sentinel).
```

### Recommended Project Structure
```
src-tauri/crates/gamelib-steampoll/
  src/lib.rs            # public API: Registry, PollHost trait, Effect/StateEvent types
  src/constants.rs      # GRACE_TICKS, MAX_TICKS, ... (ported verbatim from pollState.ts)
  src/install.rs        # installPolling + installPollOnce state machine
  src/uninstall.rs
  src/update.rs         # updatePollOnce (74 D-11)
  src/running.rs        # runningPoll + claims/drain
  src/acf_state.rs      # acfState + acfUpdateState on gamelib-steamfiles
  src/monitor.rs, progress.rs   # nettop + content_log + liveProgress maths
  src/hold.rs, breadcrumbs.rs, mac_arch.rs
  src/locale.rs         # (or a separate reusable crate, see below)
  src/outbox.rs         # state-event queue + ack
  tests/                # ported TS tests + scenario replay
src-tauri/crates/gamelib-steampoll-cli/   # optional: replay-timeline runner for the TS-vs-Rust harness (mirrors steamfiles-cli)
src-tauri/src/steampoll_dispatch.rs        # shell glue + ShellPollHost
```
Place `locale.rs` in its own small module that the shell and later slices can use (D-03 "reusable"); a separate crate `gamelib-i18n` is cleaner than a module inside steampoll.

### Pattern 1: Host trait injected by the shell (follows `gamelib-depot`'s `JobHost`)
**What:** The crate calls `host.emit_frontend`, `host.notify`, `host.state_event`; the shell implements it over `AppHandle` and `SidecarState`. Tests implement it with a recording fake that is also the parity-stream recorder.
**When to use:** all effects. No `tauri` type appears in the crate.
**Source:** `src-tauri/src/depot_dispatch.rs` (`ShellJobHost`, bounded event queue, droppable progress).

### Pattern 2: Effects as data, one `tick(&mut State, Observation) -> Vec<Effect>` per machine
Make each machine a pure step function over (poll state, observation of ACF/files/monitor/running value, tick count) returning effects. The async task only gathers observations and applies effects. This is what makes scenario replay and the ported unit tests deterministic, and it removes the overlap hazard (`inFlight` guard in `runningPoll.ts`): one task awaiting its own tick cannot overlap itself (D-10) provided it uses `interval` with `MissedTickBehavior::Delay`.

### Pattern 3: State event + ack
State event frame Rust -> sidecar, response -> Rust, as a request/response pair. Existing machinery: `SidecarState::invoke` (blocking, 60 s default, writes an `invoke` frame; sidecar side must register a handler). It blocks a thread, so call it inside `tokio::task::spawn_blocking` with an outer `tokio::time::timeout(5s)`; note the pending entry stays until the 60 s `INVOKE_TIMEOUT` unless the channel is given a shorter bound. Recommended: add the new channel with its own 5 s bound in `timeout_for` rather than relying on the outer timeout, so the pending table does not accumulate (see Pitfall 3). The depot path (`depotJobEvent` as `send` frames, `cdn_token` as invoke) shows both shapes already in use. [VERIFIED: read of `shell_state.rs`, `main.rs:161,397`, `depot_dispatch.rs`, `sidecar/depotHostRegistration.ts`]

### Anti-Patterns to Avoid
- **Per-tick Rust -> TS callbacks** (explicitly excluded by D-06). State events fire on transitions only.
- **Wall-clock conversion of tick limits** (D-10). Keep integer tick counters; derive time only where TS already did (`STEAM_HOLD_PROBE_MIN_INTERVAL_MS`, `lastTickMs` speed maths).
- **Calling `SidecarState::invoke` on a tokio worker thread** (it blocks on an mpsc `recv`). Use `spawn_blocking`.
- **Porting the TS code as ground truth.** 63 D-07: record each divergence.
- **Hand-rolled ACF path guards duplicated on both sides** (D-12: Rust only).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ACF/VDF read, scan, find, write | new parser | `gamelib-steamfiles` (`read_acf`, `scan_acfs`, `find_acf`, `write_app_manifest`) | Phase 75, byte-parity proven |
| `RunningAppID` on macOS | new parser | `read_running_app_id` | Already Rust |
| `RunningAppID` on Windows | `reg.exe` spawn | `windows-sys` `RegGetValueW`/`RegOpenKeyExW` in `gamelib-steamfiles` (extend `readers.rs`, keeps one place for OS registry) | D-13; dep already present |
| Notification delivery | new OS bridge | existing `notification_show` path (`macos_notifications::deliver` / plugin builder) | quick 261023-vkv behaviours (UserNotifications auth, completion timeout) are subtle |
| Rust -> webview message | new event name | `FRONTEND_MESSAGE_EVENT` + `FrontendMessagePayload{channel,args}` | D-04, same payload shape; frontend untouched |
| Job-style progress queue | new queue | bounded `sync_channel` with droppable progress, as in `ShellJobHost` | Same overflow policy |
| Test time | real sleeps | `tokio::time::pause` / `advance` | 7200-tick scenarios in ms |
| Process spawn in tests | hand-rolled env | `createFakeHomeProfile()` (TS) / fake-HOME in cargo CLI tests | CLAUDE.md convention |

**Key insight:** the logic is small; the risk is in effects and ordering, so invest in the host trait and recorder, not in cleverness inside the loops.

## Runtime State Inventory

This is a migration of ownership (TS -> Rust) of running state, so the inventory applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Restart-hold store (`steamRestartHold.ts`, persisted) and resume breadcrumbs (`resumeBreadcrumbs.ts`) written by TS today; ACF files themselves | Rust reads/writes the same on-disk formats (D-16 dual-readable). Plan a format-pinning test using real files written by TS. No data migration. [ASSUMED: exact file paths and shapes not yet read; planner must read `steamRestartHold.ts` and `resumeBreadcrumbs.ts`] |
| Live service config | None for polls. Steam client itself holds the real download state | None |
| OS-registered state | nettop child + `/bin/sh` watchdog (`childWatchdog.ts`) anchored on the sidecar pid | Replace anchor with the shell pid / Rust-owned kill-on-quit (D-07); verify teardown on SIGKILL of the shell in smoke 1 |
| Secrets/env vars | None | None |
| Build artifacts | `gen`-erated `RustInvokeChannel` enum and TS channel constants (`common/types/sidecarTransport`) | Regenerate after adding channels; the exhaustive match will fail compile until arms exist |

## Common Pitfalls

### Pitfall 1: Ordering across two emitters
**What goes wrong:** Sidecar still emits frontend messages (e.g. `gameStatusUpdate` from install code paths) while Rust now emits poll-driven ones; the sidecar -> webview path goes through the shell reader (`sidecar.rs` re-emit) while Rust emits directly. Relative order of a sidecar message and a Rust message is no longer a single stream.
**Why:** Two writers where there was one.
**How to avoid:** Keep D-05 (state event, ack, then emit) for transitions; in the harness compare the merged stream with sidecar-side emits modelled as scripted inputs. Document any message pair whose relative order can now differ (e.g. a TS-side `gameStatusUpdate` immediately followed by a Rust `installing` progress tick).
**Warning signs:** Game page flickers between statuses on handoff.

### Pitfall 2: Locale resolution differs from i18next
**What goes wrong:** TS calls look like `i18next.t('notify.install.finished', 'Installation Finished')`: key plus an inline default; the default is used when the key is missing. A Rust loader that only reads JSON will show raw keys for any key absent from a locale.
**How to avoid:** Port each call's inline default into Rust as the fallback; resolve en-then-default; support namespace prefix (`ns:key` and `nsSeparator`/`keySeparator` settings from the app's i18n init config) and `{{var}}` interpolation. Check the real init options (defaultNS, nsSeparator, keySeparator, fallbackLng, interpolation.escapeValue) in `src/backend/` i18n setup and `src/frontend` copy before coding; I did not find them in this session (grep for `defaultNS` in the two obvious paths returned nothing). Parity test: for every (key, params) the polls emit, render in all 49 locales via i18next in Node and via Rust and diff the strings (this is the D-14 "key + params + rendered text" requirement).
**Warning signs:** Notification shows `notify.install.finished`; interpolation leaves `{{title}}`; HTML-escaped `&` in titles (i18next `escapeValue` default is true; match whatever the TS config sets).

### Pitfall 3: Ack path leaks or stalls
**What goes wrong:** Blocking `invoke` on a tokio worker starves other polls; timeouts leave pending-table entries and "abandoned invoke" diagnostics (the 60 s bound, `record_abandoned`); with no sidecar connected `write_frame` errors immediately (fine) or the process is mid-restart.
**How to avoid:** `spawn_blocking` + a dedicated short-bound channel; define behaviour for "frame written but sidecar dies before ack" (drain wakes waiters with Err via `drain_pending_invokes`: treat as un-acked -> queue). Make handler **idempotent** (event carries appId + monotonic seq + full resulting state, not a delta) so replay after a half-applied event is safe.
**Warning signs:** `invoke_abandoned` shell diagnostics for the new channel; stuck "installing" badge after sidecar restart.

### Pitfall 4: Sidecar connect detection and replay
**What goes wrong:** Rust must know "sidecar is connected" to start replay (D-08) and "boot resume before sidecar ready" (D-09). The READY sentinel exists (`READY_SENTINEL` in `ipc_contract.rs`) but the sidecar can restart without the shell restarting (`surface_dead_sidecar` currently triggers `restart()` on unexpected EOF, per `sidecar.rs:693-705`, so a sidecar death may in practice restart the whole app; verify before designing a reconnect protocol that can never run).
**How to avoid:** Read `surface_dead_sidecar` first. If the shell always restarts on sidecar death, D-08's replay is only needed for the boot-resume window (events produced before first READY), which is simpler. Planner: spike this in Wave 0.

### Pitfall 5: Nettop child lifetime
**What goes wrong:** Today the `/bin/sh` watchdog polls the *sidecar* pid, and `shutdown_child` SIGTERMs the sidecar process group. In Rust the parent is the shell: killing the shell with SIGKILL orphans the pty/nettop unless a watchdog anchors on the shell pid. Windows/Linux: none (nettop is macOS only; guards return `undefined`).
**How to avoid:** Keep a watchdog script (anchor = shell pid, the existing `buildWatchdogSpawn` logic ported), plus kill in the shutdown hook; use `kill_on_drop` for the tokio `Command`. Fake-HOME rule: spawn with no `env`, as today ("nettop reads no user profile"; there is no real-profile arm), and test spawn sites accordingly (`fakeHomeIsolation.test.ts` only covers in-repo TS spawn sites; Rust test spawns should follow the same idea).

### Pitfall 6: `MAX_TICKS` and timers in tests
`MAX_TICKS=7200` x 3 s: use paused tokio time. Keep `GRACE_TICKS` etc. exported as one `constants.rs` and assert equality with the TS values in the replay harness (read TS source or import constants) until TS is deleted.

### Pitfall 7: Sidecar exit contract for `polls=ts`
While the fallback exists the TS loops must still follow the contract; do not alter timer creation in TS. When flag = rust the TS timers must never be created (check the six start sites do not start both).

### Pitfall 8: Source-pin tests
`src/backend/__tests__/tauriShellSource.test.ts` pins shell source (and the Phase 71 note says helper modules excluded from the "combined shell source" must still be visible to pins). New `steampoll_dispatch.rs` must be registered with whatever list that test uses. [CITED: file exists in repo; contents not read in detail]

### Pitfall 9: Platform legs
`cargo test` must stay green on all three CI legs (D-15). `nettop`, `registry.vdf`, Windows registry code are `cfg`-gated; the pure state machine and the fake-host tests must compile and run everywhere; Windows registry read needs a `cfg(windows)` test (or a trait seam with a fake) so Linux/Mac legs still cover its semantics (0 on missing/error).

## Code Examples

### Host trait sketch
```rust
// Source: pattern from src-tauri/crates/gamelib-depot (JobHost) -- shape is a recommendation, not existing code
#[async_trait::async_trait] // or return BoxFuture; avoid a new dep by using Pin<Box<dyn Future>>
pub trait PollHost: Send + Sync + 'static {
    fn emit_frontend(&self, channel: &str, args: Vec<serde_json::Value>);
    fn notify(&self, key: &str, default: &str, params: &serde_json::Value); // locale module renders inside the host
    /// Resolves true when the sidecar acked; false on timeout/no sidecar (event stays queued).
    fn state_event(&self, ev: StateEvent) -> BoxFuture<'static, bool>;
}
```
(Avoid `async_trait` unless already in the lockfile; use boxed futures.)

### Deterministic loop test
```rust
#[tokio::test(start_paused = true)]
async fn grace_expires_after_20_ticks_without_manifest() {
    let host = RecordingHost::default();
    let dir = tempfile::tempdir().unwrap();
    start_install(&host, "1234", opts(dir.path()));
    tokio::time::advance(Duration::from_secs(3 * 20)).await;
    assert!(host.registry_empty("1234"));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TS interval loops, sidecar-pid watchdog | tokio tasks in shell, shell-owned children | this phase | no polls in Node; sidecar exit contract applies only to `polls=ts` |
| `reg.exe` spawn for RunningAppID | native registry read | this phase (D-13) | one fewer child per probe on Windows |
| Sidecar emits all frontend messages | Rust emits poll messages directly | this phase (D-04) | two emitters, see Pitfall 1 |

**Deprecated/outdated:** the TS files in scope after the delete gate; `deps.steamInstallRuntime.polls/uninstallPolls/restartHold` and `deps.steamProcesses.downloadMonitor` registries.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No Rust crate reads i18next JSON natively, so a purpose-built loader is right | Standard Stack | Wasted effort; low |
| A2 | Restart-hold and breadcrumb files have simple JSON shapes the Rust side can share | Runtime State Inventory | Dual-readability work larger than expected |
| A3 | `surface_dead_sidecar` restarts the whole shell on sidecar death, which would make mid-session reconnect replay (D-08) mostly moot | Pitfall 4 | Replay design needed after all; verify first |
| A4 | The sidecar can register a new inbound `invoke`/`send` handler for state events the same way `depotHostRegistration.ts` does | Pattern 3 | Transport rework |
| A5 | i18next init options (defaultNS, separators, escapeValue) were not read | Pitfall 2 | Wrong rendered text; resolve in Wave 0 |
| A6 | Existing `FrontendMessagePayload` is the exact shape the webview listener expects for messages the sidecar relays (`sidecar.rs:570`) | Architecture | Emit shape mismatch |

## Open Questions

1. **What does the sidecar do on its own death, and what is "reconnect"?**
   - Known: `surface_dead_sidecar` runs on unexpected EOF and calls restart; `on_sidecar_eof` is silent only during intentional shutdown.
   - Unclear: whether there is any path where the shell survives and a new sidecar starts.
   - Recommendation: Wave 0 reads `sidecar.rs:679-720`; size the queue/replay design accordingly (D-08 must still be implemented for the pre-READY window at least).
2. **Ack channel shape (`send` + correlated reply vs Rust-initiated `invoke`).**
   - Recommendation: Rust-initiated `invoke` with a per-channel 5 s bound in `timeout_for`, handler registered via the depot host registration idiom.
3. **How Rust learns the language.** Recommendation: read the `language` key from the app config file at notify time (cheap, always current) rather than pass-in-at-start; listen to the existing `languageChanged` hook if one exists for the tray. Verify the config key name.
4. **Where `STEAM_UPDATE`/update-detection caches are invalidated today** (`invalidateSteamUpdateState` x2): confirm each becomes one state event kind.
5. **`isDelegatedInstallPolling` and friends are sync today.** They become async `rustInvoke` (63 D-09); list every caller and check none sits in a sync-only context (a sync React/Node path would need restructuring). Planner should grep callers.
6. **Windows live smoke (D-15 item 4):** the operator machine is macOS; Windows verification is CI + a manual UAT item. Flag as human-needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| cargo/rustc | crate build + tests | yes | cargo 1.99.1 | - |
| Node/pnpm + jest | TS parity + remaining TS tests | yes (repo toolchain; not probed individually) | - | - |
| Real Steam client (Mac) | D-15 smokes | operator-owned, not probed | - | smokes are human-verify checkpoints |
| `nettop` (macOS built-in) | download monitor | yes on this Mac (darwin) [ASSUMED present, system tool] | - | monitor returns undefined, falls back to ACF progress (existing behaviour) |
| Windows machine | RunningAppID native read smoke | no (not on this host) | - | CI leg + human UAT |

**Missing dependencies with no fallback:** none blocking research. Windows live gate needs a human.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | cargo test (Rust, tokio test-util) for the crate and shell glue; Jest (existing, `pnpm test`) for TS handler, TS wrappers and the parity harness |
| Config file | `src-tauri/Cargo.toml` workspace; `jest.config.*` at repo root (existing) |
| Quick run command | `cargo test -p gamelib-steampoll --manifest-path src-tauri/Cargo.toml` and `pnpm jest src/backend/storeManagers/steam/__tests__/library.installPolling.test.ts` (per touched file) |
| Full suite command | `cargo test --manifest-path src-tauri/Cargo.toml --workspace` and `pnpm test:ci` |

### How parity is proven (D-14)
1. **Timeline format:** JSON scenario files: per tick `{acf: <text|absent>, files: {...}, monitor: {...}, running: n, sidecar: up|down}` plus start options (source, isNativeHandoff, delegatedToSteamClient, macNativeRoute, skippedDepots). Stored beside fixtures like `gamelib-steamfiles/tests/fixtures`.
2. **Two drivers, one recorder:** the TS driver runs the real TS loops with fake deps and a fake clock (existing tests already inject `deps`, intervals and notify; reuse them); the Rust driver runs `gamelib-steampoll` with a recording `PollHost` under paused time (optionally through a `gamelib-steampoll-cli replay` binary invoked from Jest, like `steamfiles-cli`).
3. **Output stream:** ordered list of `{frontend: channel+args} | {notify: key+params+rendered text} | {state: event} | {file: path+op}`. Diff exactly; every diff row is explained in `80-PARITY.md` (63 D-07; use the `63-PARITY.md`/`79-PARITY.md` table shape: inputs/equal/explained/unexplained, divergence entries DV-80-nn with Steam-correct side and `accepted: yes (date)`). Delete gate requires unexplained = 0.
4. **Corpus:** one scenario per branch: grace expiry, max ticks, manifest-gone (10 ticks), no-activity (40 ticks, signed-out Mac revert notice), native-handoff upgrade of an existing poll (incl. source retarget resetting baselines but keeping `ticks`), restart-hold release (`adoptedBySteamClient`), steam-paused (3 stalled ticks), InstallApp retry cadence (every 3 ticks, max 13), update: bit 4 alone never completes / build-change completes / abandoned after 20 settled ticks / quiet end, uninstall (0x800, bit 4 cleared, manifest gone), running poll (one Playing, one Done, claims + 20 s drain), sidecar down mid-install (queue, latest wins, replay), ack timeout (5 s then emit anyway).
5. **Locale parity:** render every notification key/params in all 49 locales through Node i18next and the Rust module.
6. **Ported tests:** 18 existing TS files ported to cargo tests so coverage survives deletion: `library.{acfState,installPollOnce,installPolling,macArch,restartHold,resume,resumeBreadcrumbs,runningPoll,uninstallPolling,updatePollOnce}`, `macArchKnownFix`, `macArchKnownFixRouting`, `runningFromFolder`, `steamDownloadMonitor`, `steamRestartHold`, `updateDetection.acf`, `acfInstalldir`, `acfInstalledDepots` (about 10.7 k lines total; budget accordingly; not all of it is poll logic, e.g. `acfInstalldir`/`acfInstalledDepots` may be steamfiles-covered already).
7. **Delete gate test:** add `src/backend/__tests__/steamPollsPortComplete.test.ts` modelled on `steamFilesPortComplete.test.ts` (DELETED file list, FORBIDDEN identifiers, incl. the `polls` flag name, KEPT fixtures).

### Phase Requirements -> Test Map
| Req (suggested) | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| P80-install | tick constants, grace/max/manifest-gone/no-activity, handoff upgrade, hold release | cargo unit + replay | `cargo test -p gamelib-steampoll install` | Wave 0 |
| P80-update | D-11 rules | cargo unit + replay | `cargo test -p gamelib-steampoll update` | Wave 0 |
| P80-uninstall | uninstall completion paths + bridge-uninstalled event | cargo unit | `cargo test -p gamelib-steampoll uninstall` | Wave 0 |
| P80-running | exactly one Playing/Done, claims, drain, registry read semantics | cargo unit (+cfg(windows)) | `cargo test -p gamelib-steampoll running` | Wave 0 |
| P80-events | state-event ack ordering, timeout, queue latest-wins, replay | cargo (fake host) + Jest handler test | `cargo test -p gamelib-steampoll outbox`, `pnpm jest <handler test>` | Wave 0 |
| P80-locale | key resolution, defaults, interpolation, 49 locales | cargo + Jest cross-check | `cargo test -p gamelib-i18n` | Wave 0 |
| P80-acf | acfState/acfUpdateState/path guard | cargo (security-style tests like `steamfiles/tests/security.rs`) | `cargo test -p gamelib-steampoll acf_state` | Wave 0 |
| P80-parity | TS vs Rust stream equal | Jest harness | `pnpm jest <steamPollParity test>` | Wave 0 |
| P80-gate | TS deleted, flag gone | Jest source pin | `pnpm jest steamPollsPortComplete` | Wave 0 |
| P80-live | four smokes | manual (`pnpm tauri:dev`) | human-verify checkpoints | n/a |

### Sampling Rate
- **Per task commit:** the crate's `cargo test -p` for the touched module plus the one Jest file changed; `npx prettier --check` over the exact paths written (scoped, not `.`; `--file-info` first) per the `<verify>` convention.
- **Per wave merge:** full `cargo test --workspace` + `pnpm test:ci`.
- **Phase gate:** full suites green, parity report 0 unexplained, four smokes done, three CI legs green, then delete.

### Wave 0 Gaps
- [ ] `gamelib-steampoll` crate skeleton + workspace member + `PollHost` recording fake
- [ ] State-event transport spike (channel in `RustInvokeChannel`/generated TS, sidecar handler registration, per-channel timeout, queue)
- [ ] Locale loader spike reading real `public/locales` (read i18n init options first)
- [ ] Scenario/timeline format + TS driver harness
- [ ] Decision on `gamelib-steampoll-cli` for Jest-driven replay
- [ ] Source-pin registration (`tauriShellSource.test.ts`)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3 Authentication, Session | no | - |
| V4 Access Control | yes (filesystem scope) | path guard in Rust only (D-12): absolute, no `.`/`..` segments, `steamapps` ancestor, as `guard_install_root` in `depot_dispatch.rs`; apply to `removeSteamInstallCopy` (it deletes directories) |
| V5 Input Validation | yes | generated `*Args::from_args` validation for every new rustInvoke channel (appId numeric, source enum) |
| V6 Cryptography | no | - |
| V7 Logging | yes | log no tokens/paths with user names beyond what TS logged; follow T-28-04 "nothing formats a job/argument into a log line" idiom |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal / symlink escape in `removeSteamInstallCopy` and installdir resolution | Tampering | canonical-path check against the steamapps root before remove; refuse symlinks; port the existing TS guard and add tests like `steamfiles/tests/security.rs` |
| Renderer/sidecar-supplied appId used in paths | Tampering | numeric validation (`is_numeric`) before any path join |
| Command injection via nettop/ps/watchdog spawn | Tampering/EoP | argv arrays, no shell string interpolation of ids; the sh watchdog gets pids only |
| Unbounded state-event queue | DoS | per-appId latest-wins (bounded by design), cap on appIds |
| Notification text injection from locale files | Spoofing | locale files are shipped assets; do not interpolate untrusted ACF content into notification strings without escaping (match existing TS behaviour) |

## Sources

### Primary (HIGH confidence, read in session)
- `.planning/phases/80-.../80-CONTEXT.md` (all decisions)
- `src-tauri/Cargo.toml`, `src-tauri/src/{rust_dispatch,steamfiles_dispatch,depot_dispatch,notification_show,shell_state,main,sidecar}.rs` (router shape, host pattern, invoke semantics, emit payload)
- `src-tauri/crates/gamelib-steamfiles/{Cargo.toml,src/acf.rs,library.rs,readers.rs}` (public API)
- `src/backend/storeManagers/steam/library/{pollState,installPolling,installStop,runningPoll}.ts`, `steamDownloadMonitor.ts` (constants, upgrade semantics, exit-contract notes)
- `.planning/phases/79-.../79-PARITY.md` (parity report format), `src/backend/__tests__/steamFilesPortComplete.test.ts` (delete-gate pattern), `cargo tree -i tokio`
- Repo `CLAUDE.md` and conventions index

### Secondary (MEDIUM)
- Phase 63/75/79 CONTEXT and PARITY artifacts (via CONTEXT references; 63/75 PARITY not re-read in full)

### Tertiary (LOW)
- Not read in this session: `installPollOnce.ts`, `uninstallPolling.ts`, `updatePollOnce.ts` bodies, `acfState.ts`, `restartHold.ts`, `steamRestartHold.ts`, `resumeBreadcrumbs.ts`, `macArch.ts`, i18n init options, `surface_dead_sidecar` full body, the 18 test files. The planner (or Wave 0) must read each before writing its port plan; per-file port plans should list every constant, branch and effect as it reads.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (all in-repo/in-lockfile)
- Architecture: MEDIUM (host-trait pattern verified; state-event transport and reconnect semantics unverified)
- Pitfalls: MEDIUM (derived from reading shell transport and TS comments; not all machine bodies read)

**Research date:** 2026-11-16
**Valid until:** 2026-12-16 (codebase-internal; stable unless Phase 79 follow-ups change `SidecarState`)
