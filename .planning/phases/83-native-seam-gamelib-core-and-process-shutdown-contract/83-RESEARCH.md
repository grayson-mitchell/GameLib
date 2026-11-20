# Phase 83: Native seam, gamelib-core and process/shutdown contract - Research

**Researched:** 2026-11-20
**Domain:** Rust/Tauri shell internals: renderer IPC routing, trait-injected core crate, child-process lifetime (kill-tree, reaper, Job Object), bounded shutdown
**Confidence:** MEDIUM-HIGH (code facts HIGH; macOS reaper and Windows breakaway composition are design proposals that this phase's own harness must prove, so MEDIUM)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Proof channels (criteria 1, 2, 4)**
- **D-01:** The router is proven with **two channels**: `openExternalUrl` (send-kind, renderer-controlled URL; Rust already holds the scheme allow-list `OPEN_EXTERNAL_ALLOWED_SCHEMES` and `open_external_scheme_check` in `src-tauri/src/relay_commands.rs`) and `getHeroicVersion` (invoke-kind, no args; `src/backend/sidecar/appShellFlowRegistration.ts:386`). Both router kinds get proven. The other four URL openers (`openLoginPage`, `openKofiPage`, `openWinePrefixFAQ`, `openSidInfoPage`) stay on the sidecar. Delete only what these two channels alone used, such as their registrations, their `channelSchemas.ts` entries and any shim with no remaining caller. Shared TS (`openPolicy.ts`'s `assertOpenableExternalUrl`, which `externalLinkClicks.ts` and other registrations also use) stays until its last caller goes.
- **D-02:** **Send ordering is FIFO per native slice.** Each slice's native sends go through one ordered queue (not a free thread pool, and never on the main thread; cf. the `SidecarSendQueue` freeze history). **No ordering is guaranteed across the native/sidecar boundary.** The research spike must check that no current renderer flow depends on cross-channel send order. Any flow it finds becomes a named constraint on the slice that moves those channels.
- **D-03:** **Rejections look the same as today.** An unknown channel, or malformed or extra args on a native channel, returns the same `[GAMELIB_IPC_INVALID_CHANNEL]` marker and the same error-string shape as `relay_channel_verdict`, so the renderer can't tell a native rejection from a relay rejection. Sends stay fire-and-forget and their rejections are logged (channel name only, never args, T-34.6-16-02).

**Fallback, ownership and the schema gate (criteria 1, 2)**
- **D-04:** **The fallback is routing-only.** "Sidecar as fallback" means only that channels the native router doesn't own keep relaying. A native-owned channel **never** falls back to the sidecar: no flag-driven and no error-driven fallback. A native handler error goes to the renderer. Ownership is static and checked by the one-owner test. — **Reversibility:** costly — adding a runtime fallback later means keeping TS registrations alive per channel, which contradicts deleting each slice's TS in the same phase.
- **D-05:** Ship the **`*PortComplete` gate template** now and use it on the proof channels. It fails if a slice's TS registrations, schemas or flag survive. **Don't build a `GAMELIB_<SLICE>` flag helper yet.** The first slice that needs a rollback window builds it, and that slice's plan names the window.
- **D-06:** **The IPC schema diff gate checks a committed generated snapshot.** The snapshot lists every renderer channel with its kind (invoke/send), its owner (native/sidecar) and its argument schema. CI fails when the live tree drifts from the committed snapshot. Reviewing a change means regenerating and committing the snapshot, so it shows in the diff (same pattern as `pnpm check:ipc-contract`). The gate gets the Phase 82 D-05 vacuous-pass guards: a floor on the scanned count, plus a deliberate empty or truncated-input test.
- **D-07:** **For a native channel, the Rust serde struct is the schema authority.** `#[serde(deny_unknown_fields, rename_all = "camelCase")]` arg structs validate before use. The channel's zod entry in `src/common/types/ipc/channelSchemas.ts` is deleted along with its TS registration. The snapshot records the Rust shape. There's no TS-to-Rust schema generator.

**What counts as an orphan (criterion 3)**
- **D-08:** **A launched game's whole tree survives** a GameLib quit or kill: the game process, its wine/wineserver, the bridge's steam_api helper serving it, and its launch wrapper. **Everything else GameLib spawned is a helper and must die.** That includes the sidecar, nettop, the mac-owned helper, legendary/gogdl/nile/comet, wine tools (winetricks etc.), and depot or download work.
- **D-09:** **Downloads and installs in progress are helpers.** They are killed on quit or kill. A graceful quit keeps today's bounded cancel and finalize (the depot finalize that writes the 1026 record) before the kill. Resume-after-quit stays Phase 93's job. No new quit prompt is added; the existing "pending operations" confirm (`RouteQuit` → sidecar `handleExit()`) is unchanged.
- **D-10:** **Sidecar-spawned helpers are covered now, not slice by slice.** Criterion 3 is unconditional, so the proof includes TS-spawned children. Research must confirm how launched games relate to the sidecar's process group today. `src/backend/process/runner.ts` says tracked children are deliberately **not** detached so the shell's process-group reap covers them, and `openDetached` (macOS `open -g`) is the only detached spawn. So D-08 may require game launches to be spawned outside the sidecar tree, or at least proven to be. Check whether the current group reap already kills running games on quit; if it does, that is a recorded behaviour change.
- **D-11:** **The bar for macOS after SIGKILL:** no helper survives a SIGKILL of the parent, launched games excepted, and an automated test proves it. **Research and the spike pick the mechanism.** Candidates are a reaper/watchdog process holding a pipe to the app (e.g. the GameLib binary re-exec'd in reaper mode), a per-child parent-watch wrapper, and a pidfile sweep at the next boot. A boot-time sweep alone doesn't meet the bar, because orphans would live until the next launch. Linux uses `PR_SET_PDEATHSIG` and/or a subreaper; Windows uses kill-on-close Job Objects (`create_kill_on_close_job` already exists for the sidecar in `main.rs`).

**Quit drain and proof (criterion 3)**
- **D-12:** **One app-wide exit deadline of about 5 s total.** Every `Shutdown` registrant shares it: depot finalize, the steamcm owed-record restore and logoff, steampoll stop, and the child grace period. Past the deadline, the remaining children are kill-treed and the app exits. A log line names what was still running (counts and names only, no job detail). This replaces the per-subsystem waits in `handle_exit` (`src-tauri/src/main.rs:755`).
- **D-13:** **Proof is the CI harness plus one live macOS check.** An automated harness on the existing windows/macos/ubuntu CI matrix spawns a stand-in parent with real helper children and a stand-in "game" tree, then (a) quits it gracefully and (b) SIGKILLs it. It asserts that the helpers are gone and the game tree survives. One **live macOS gate** runs on the real app: Force Quit during a download while a game is running, then a `ps` check. The live gate is authored before coding (v0.11 rule). The 80 nettop orphan was found live, which is why the live leg exists.
- **D-14:** **The Rust Shutdown convention is added now.** Add a CLAUDE.md Conventions row plus `gamelib-conventions` skill text: every Rust task, timer and child registers with the `Shutdown` token and spawns through `gamelib-proc`, and boot work is bounded. The sidecar exit-contract row stays until Phase 99 retires it. CLAUDE.md regions are hand-maintained, so edit them directly; do not run `generate-claude-md`.

### Claude's Discretion
- `gamelib-core`'s module layout and exact trait shapes, within the research ruling (core holds traits and composition-root types; `gamelib-proc` is the implementation crate; domain crates depend on core, never on each other except by trait).
- Whether `gamelib-safety` is re-homed into `gamelib-core` in this phase. Phase 82 D-07 built its API to allow that without changing it.
- Hoisting `Clock` and `ProcessRunner` from `gamelib-steampoll` (`crates/gamelib-steampoll/src/host.rs`) into core. Steampoll then depends on core.
- Where the native router's handler table and generated `NATIVE_*_CHANNELS` sets live, and how they extend `meta/genIpcContract.ts` / `ipc_contract.rs`.
- The snapshot file's format and location.

### Deferred Ideas (OUT OF SCOPE)
- `GAMELIB_<SLICE>=rust|ts` flag helper: deferred to the first slice whose plan names a rollback window (D-05).
- "Download in progress, quit anyway?" prompt: not added (D-09). The existing pending-operations confirm stays.
- Moving the other four URL openers native: they go with a later app-shell slice.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-03 | Rust can serve a renderer channel natively with the sidecar as fallback; each channel has exactly one owner, and renderer arguments are validated in Rust (the Phase 72 trust boundary is kept) | Native router design (Architecture Patterns 1-3), rejection-shape finding (Findings F3: two markers, not one), manifest + generator + snapshot + one-owner test (Pattern 3), the two proof channels' exact deletable TS (Findings F4), census/gate changes (Findings F5) |
| FND-04 | Quitting or killing GameLib leaves no orphaned helper processes on macOS, Windows or Linux (launched games excepted) | Process-lifetime audit (Findings F1), per-OS mechanism choice (Pattern 5: unix reaper, Windows Job Object), single shutdown deadline (Pattern 6), harness (Validation Architecture), the D-08 scope decision (Open Question 1) |
</phase_requirements>

## Summary

The router half is small and well bounded. `relay_commands.rs` already has the one choke point (`relay_channel_verdict`, then `state.invoke` / queue enqueue); a native lookup slots in right after the verdict. Every renderer call, invoke or send, enters Rust through `sidecar_invoke` / `sidecar_send`, so no transport change is needed. Three findings change how the CONTEXT decisions must be implemented: (1) the rejection shape for **malformed args** today is **not** `[GAMELIB_IPC_INVALID_CHANNEL]`, it is `[GAMELIB_IPC_INVALID_ARGS] {json}` (typed into `IpcValidationError` by the preload); the INVALID_CHANNEL marker is only for names off the allow-list. To honour D-03's intent ("the renderer can't tell") native invokes must emit INVALID_ARGS for bad args. (2) `channelSchemas.ts` is also the generator input for `RENDERER_CHANNELS` and the type source for `window.api.*`; deleting a native channel's zod entry (D-07) removes it from the Rust allow-list and from the renderer types unless the generator and a typing-only declaration are extended in the same plan. (3) The existing census/coverage gates (`ipcDomainCensus`, `flowRegistrationCensus`, `ipcSchemaCoverage`) and several TS source-text gates over `main.rs` / `shell_state.rs` pin counts and shapes the phase will change, so they must be updated in the same commits.

The process half has one decision that needs the user. Today **every** child the sidecar spawns, games included, is non-detached, so it is in the sidecar's process group (unix) or the shell's kill-on-close Job (Windows, no breakaway flag), and a quit or logout kills running games on all three OSes on purpose (`sidecar.rs` says "Sidecar-launched games dying on quit is by design"). D-08 reverses that. A Rust-side substrate (`gamelib-proc` with a `Game` spawn class that the reaper and the Job exclude) is fully provable in this phase with a stand-in game tree; making **real TS-launched games** survive additionally needs the TS runner to spawn them detached with file-backed stdio on unix, and on Windows a Job-flag change that is unproven. Research recommends proving the mechanism now and adopting it for real games in the launch slice (Phase 88, which moves launching into Rust), recording the interim status quo. That softens D-08/D-10 for TS-spawned games, so it is Open Question 1 and needs confirmation before planning.

For macOS SIGKILL the recommended mechanism is one **reaper process**: the GameLib binary re-exec'd in `--gamelib-reaper` mode, started first thing in `main()`, holding a control pipe from the app. EOF on that pipe (or kqueue `NOTE_EXIT` on the parent) means the app died, and the reaper kills the registered groups and pids. The same reaper serves Linux (where `PR_SET_PDEATHSIG` is per-thread and not inherited, so it cannot cover the sidecar's children). Windows keeps a Job Object, generalised from the sidecar-only job. The single ~5 s deadline is a `Shutdown` token whose registrants are guards (the depot `JobDone` condvar pattern), draining concurrently, then a kill-tree stage inside the same budget; this replaces a serial worst case of about 17 s (5 + 5 + 5 + 2).

**Primary recommendation:** Build `gamelib-core` (traits only, a pure hoist of `Clock`/`ProcessRunner` plus `Paths`, `FrontendEmitter`, `Shutdown`) and `gamelib-proc` (tokio runner, kill-tree, unix reaper, Windows Job, harness stand-ins), put a native router behind `relay_commands.rs` driven by one JSON channel manifest that feeds the generator, the schema snapshot and per-channel negative vectors, and prove FND-04 with the three-OS stand-in harness plus the live macOS Force Quit gate authored first.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Renderer call entry, allow-list verdict | Rust shell (`relay_commands.rs`) | Preload (`tauriTransport.ts`) | Already the single choke point; preload only forwards |
| Native channel ownership and arg validation | Rust shell (`native_router.rs`) | Channel manifest (JSON, generator input) | Phase 72 trust boundary must hold in Rust once the sidecar is skipped (D-07) |
| Renderer typing of native channels | `src/common/types/ipc/` typing-only declaration | Preload invokers | `window.api.*` types derive from the ipc type unions; zod entry is deleted |
| App version string | Rust shell (`app.package_info()` / `CARGO_PKG_VERSION`) | Release stamping | Sidecar's value is `package.json`; must be gated equal |
| URL open (OS handoff) | Rust shell (opener plugin on a worker) | OS | Windows `open_url` can block on a dialog; must not run on the FIFO worker thread or main thread |
| Child spawn, kill-tree, group/Job | `gamelib-proc` (crate) | Shell composition root | Tauri-free, testable on 3 OSes |
| Parent-death reaping (unix) | Reaper process (`gamelib-proc::reaper`, re-exec'd GameLib binary) | Shell `main()` dispatch | Only mechanism that works after SIGKILL on macOS and covers grandchildren |
| Parent-death reaping (Windows) | Job Object (`gamelib-proc::job`) | Kernel | Kernel closes the handle when the shell dies |
| Exit deadline and registrants | `gamelib-core::Shutdown` | `handle_exit` in `main.rs` | One budget shared by depot, steamcm, steampoll, children |
| Game-tree survival (D-08) | `gamelib-proc` `SpawnClass::Game` (Rust-spawned) | TS runner (interim, see Open Question 1) | Games are spawned by the sidecar today |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gamelib-core` (new, in-repo crate) | 0.1.0 | Traits and composition-root types: `Clock`, `ProcessRunner`, `FrontendEmitter`, `Paths`/`Platform`, `Shutdown` | Research ruling 6: core holds traits, implementation crates depend on it [VERIFIED: .planning/research/v0.11/SUMMARY.md, ruling 6] |
| `gamelib-proc` (new, in-repo crate) | 0.1.0 | tokio runner, kill-tree, unix reaper, Windows Job, harness stand-ins | Research ruling 2 [VERIFIED: SUMMARY.md ruling 2] |
| tokio | 1.54.1 (locked) | `process`, `sync`, `time`, `io-util`, `rt` | Already the runtime in steampoll/steamcm/depot [VERIFIED: src-tauri/Cargo.lock:5706-5707] |
| tokio-util | 0.7.18 (locked) | `CancellationToken` (runtime-agnostic, usable across the three private runtimes) | Already used by steampoll and depot [VERIFIED: Cargo.lock:5771-5772] |
| libc | 0.2.186 (locked) | `kill`, `setsid`/`process_group`, `kqueue`/`kevent`, `pipe` | Already a unix dependency of the shell [VERIFIED: Cargo.lock:2825-2826] |
| windows-sys | 0.61.2 (locked) | Job Objects (`Win32_System_JobObjects`), `Win32_System_Threading`, `Win32_Foundation` | 0.61.2 is locked and used by steampoll/steamfiles/depot; shell still uses 0.60.2 for the existing job code [VERIFIED: Cargo.lock windows-sys versions 0.45.0, 0.52.0, 0.59.0, 0.60.2, 0.61.2] |
| serde / serde_json | locked | Arg structs, manifest, snapshot | Already everywhere |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tempfile + `gamelib-testutil::FakeHome` | locked | Harness spawn isolation (convention 2) | Every harness spawn |
| Node (`node` on PATH) | v22.23.4 here; present on all CI legs (`install-deps`) | Stand-in "sidecar" for the Windows libuv-job leg | Harness leg that mimics the real runner's `child_process` semantics |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written unsafe in `gamelib-proc` | `process-wrap`, `command-group` crates | Neither solves macOS SIGKILL; each adds a `Cargo.lock` name and supply-chain review (`EXPECTED_LOCKFILE_CRATE_NAMES`), project stance is "cap new crates". Existence not verified this session [ASSUMED] |
| Re-exec'd reaper | Per-child `/bin/sh` parent-poll wrapper (existing `WATCHDOG_SH`) | 1 s polling, one extra process per child, intrusive on every spawn site, kills only one level of descendants; keep it for nettop only |
| Re-exec'd reaper | `fork()` first thing in `main()` | No exec, but fork-without-exec on macOS needs a libc-only child and is harder to test as a separate binary; not chosen |
| Reaper on Linux | `PR_SET_PDEATHSIG` | Triggers on the creating **thread**'s exit and is cleared in forked children, so it cannot cover grandchildren (see Pitfall 4) |
| `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` only | plus `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK` | Needed only for the Windows half of D-08 for TS-spawned games; unproven (Open Question 1, Assumption A6) |

**Installation:** no external packages. Add two workspace members and path dependencies:
```toml
# src-tauri/Cargo.toml [workspace] members += "crates/gamelib-core", "crates/gamelib-proc"
# crates/gamelib-proc/Cargo.toml (sketch)
[dependencies]
gamelib-core = { path = "../gamelib-core" }
tokio = { version = "1", features = ["rt-multi-thread", "sync", "time", "process", "macros", "io-util"] }
tokio-util = "0.7"
[target.'cfg(unix)'.dependencies]
libc = "0.2.186"
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.61", features = ["Win32_Foundation", "Win32_System_Threading", "Win32_System_JobObjects"] }
[features]
harness = []   # stand-in parent bin; self dev-dependency turns it on for `cargo test -p gamelib-proc`
```
Cargo.lock gains exactly two names, `gamelib-core` and `gamelib-proc`, so `EXPECTED_LOCKFILE_CRATE_NAMES` in `src/backend/__tests__/cargoFeatures.test.ts` gets those two in the same commit (the list currently has `gamelib-depot ... gamelib-safety ... gamelib-testutil`, alphabetical) [VERIFIED: cargoFeatures.test.ts:191-219].

**Version verification:** versions above are read from `src-tauri/Cargo.lock`, not training data. `gsd-tools query package-legitimacy check --ecosystem crates libc tokio tokio-util windows-sys serde serde_json tempfile` returned OK for all seven (downloads 19M to 41M per week, source repos present) [VERIFIED: gsd-tools package-legitimacy, 2026-11-20].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| libc | crates.io | since 2015 | 39.3M/wk | github.com/rust-lang/libc | OK | Approved (already locked) |
| tokio | crates.io | since 2016 | 24.9M/wk | github.com/tokio-rs/tokio | OK | Approved (already locked) |
| tokio-util | crates.io | since 2018 | 19.4M/wk | github.com/tokio-rs/tokio | OK | Approved (already locked) |
| windows-sys | crates.io | established | 41.5M/wk | github.com/microsoft/windows-rs | OK | Approved (0.61.2 already locked) |
| serde, serde_json, tempfile | crates.io | established | 20M to 35M/wk | official repos | OK | Approved (already locked) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
No new external crate is recommended. `process-wrap` / `command-group` were considered and not chosen (see Alternatives).

## Architecture Patterns

### System Architecture Diagram

```
renderer window.api.*  (src/preload/ipc.ts -> tauriTransport.ts)
   | tauriInvoke('sidecar_invoke' | 'sidecar_send')            (unchanged names)
   v
relay_commands.rs
   1. relay_channel_verdict(channel)      -> Err("[GAMELIB_IPC_INVALID_CHANNEL] channel not allowed: <echo>")
   2. NEW native_router.lookup(channel)
        |-- hit, send  -> validate args (serde struct) -> reject: log channel name, return Ok(()) (dropped, as sidecar does)
        |                             -> enqueue on the slice's ONE FIFO worker (never main thread)
        |                                  worker -> handler (openExternalUrl: spawn opener thread, do not block FIFO)
        |-- hit, invoke-> validate args -> reject: Err("[GAMELIB_IPC_INVALID_ARGS] {json}")
        |                             -> handler on async runtime -> Ok(Value) | Err(String)     (never falls back, D-04)
        '-- miss        -> existing relay: SidecarSendQueue / SidecarState::invoke -> sidecar stdin
   v
sidecar (Node SEA)  -- owns every channel the router does not

Process lifetime (parallel to the above):
 main() ----> [argv has --gamelib-reaper?] --yes--> gamelib_proc::reaper::run()   (unix only; never touches Tauri)
   |no
   |-- unix: spawn reaper FIRST (own pgrp, ignores INT/HUP/TERM), control pipe app->reaper
   |-- windows: process-wide Job (KILL_ON_JOB_CLOSE); helpers assigned, games not
   |-- spawn sidecar (own pgid on unix) -> ChildSet.adopt(group) -> reaper "+ group <pgid> <start>"
   |-- Rust helpers via gamelib-proc runner: SpawnClass::Helper -> ChildSet + reaper registration
   |                                         SpawnClass::Game   -> own session/pgrp, NOT in Job, NOT registered
   '-- RunEvent::Exit -> handle_exit -> Shutdown::begin(5 s)
          stage 1 (concurrent, shared deadline): depot cancel+finalize | steamcm logoff+restore | steampoll stop
          stage 2 (inside the same budget): ChildSet.terminate -> grace -> kill-tree (SIGKILL / TerminateJobObject)
          stage 3: reaper "disarm", wake-lock release, socket cleanup, log "still running: <names, counts>"
 SIGKILL / crash of the app:  pipe EOF -> reaper TERM->KILL registered groups (macOS/Linux) | Job handle closes (Windows)
```

### Recommended Project Structure
```
src-tauri/
├── src/native_router.rs            # table, validate, slice queues, ownership helpers (glue, no logic)
├── src/native_handlers.rs          # open_external_url, get_heroic_version (thin; NativeHost trait for tests)
├── src/relay_commands.rs           # + router lookup after relay_channel_verdict
└── crates/
    ├── gamelib-core/src/{lib,paths,emitter,clock,process,shutdown}.rs     # traits + types only
    └── gamelib-proc/
        ├── src/{lib,runner,kill_tree,child_set,reaper,job,proto}.rs
        ├── src/bin/standin.rs      # harness stand-in parent / helper / game (required-features = ["harness"])
        └── tests/orphans.rs        # graceful + SIGKILL legs, three OSes
src/common/types/ipc/
├── nativeChannels.json             # THE manifest: name, kind, slice, args description, valid/invalid vectors
├── native.ts                       # typing-only NativeSync / NativeAsync (no zod)
└── ipcSchemaSnapshot.json          # generated: every renderer channel, kind, owner, args
meta/genIpcContract.ts              # + NATIVE_*_CHANNELS, RENDERER_CHANNELS union, snapshot, --check for both
```

### Pattern 1: Native router seam (FND-03)
**What:** Insert one lookup after the allow-list verdict; ownership is static; native errors go to the renderer.
**When to use:** every native channel, now and in later slices.
**Key facts (read this session):**
- Allow-list check today: `relay_channel_verdict` returns `Err(format!("{IPC_INVALID_CHANNEL_MARKER} channel not allowed: {}", echo_channel(channel)))` and `echo_channel` cuts to 64 chars and replaces non-printable-ASCII with `?` [VERIFIED: src-tauri/src/relay_commands.rs:26-35, 6-22].
- `sidecar_invoke` is `async` and runs `state.invoke` in `spawn_blocking`; `sidecar_send` is a non-async command, so it runs on the **main thread** and only enqueues (`queue.0.send(req)`) [VERIFIED: relay_commands.rs:39-50, 128-158].
- Add `app: AppHandle` and `router: State<'_, Arc<NativeRouter>>` parameters; a native hit must not need the sidecar to be ready.
**Example:**
```rust
// Source: sketch over relay_commands.rs; names are proposals, constants are verbatim from the repo
#[tauri::command]
pub(crate) fn sidecar_send(
    channel: String, args: Vec<Value>,
    state: State<'_, Arc<SidecarState>>, queue: State<'_, SidecarSendQueue>,
    router: State<'_, Arc<NativeRouter>>,
) -> Result<(), String> {
    if let Err(e) = relay_channel_verdict(&channel) {
        shell_eprintln!("[shell] relay rejected send: {}", echo_channel(&channel));
        return Err(e);
    }
    if let Some(entry) = router.lookup(&channel, Kind::Send) {
        return entry.submit_send(args);   // validate; on bad args log channel name only and return Ok(())
    }
    /* existing SidecarRpcRequest + queue.0.send(req) path, unchanged */
}
```

### Pattern 2: Rejection shapes the renderer sees today (F3 detail)
Three distinct outcomes exist; native must reproduce the same one per case.
| Case | Today | Native must |
|------|-------|-------------|
| Name not on allow-list (invoke or send) | Rust `Err("[GAMELIB_IPC_INVALID_CHANNEL] channel not allowed: <echo>")`; for send, `tauriTransport.send` catches and calls `window.api.logError` (recursion guard on `logError`) | Unchanged: the verdict still runs first |
| Malformed args, invoke | sidecar `{ok:false, error: "[GAMELIB_IPC_INVALID_ARGS] " + JSON.stringify({code:"IPC_INVALID_ARGS", channel, paths, codes})`; preload `IpcValidationError.fromRejection` turns it into a typed error; `bootErrorSurface` classifies it `invalid-args` (warn, keep going) | Emit the same marker and JSON tail from Rust |
| Malformed args, send | sidecar `dispatchSend` logs and drops; renderer sees nothing | Log channel name only (T-34.6-16-02), return `Ok(())`, drop |
| Handler runtime error, invoke | sidecar `error.message` string | Plain `Err(String)` |
**Verbatim:** `IPC_INVALID_ARGS_MARKER = '[GAMELIB_IPC_INVALID_ARGS]'`; `formatIpcInvalidArgsError(p) { return `${IPC_INVALID_ARGS_MARKER} ${JSON.stringify(p)}` }`; payload `{ code: typeof IPC_INVALID_ARGS; channel: string; paths: string[]; codes: string[] }` [VERIFIED: src/common/types/sidecarTransport.ts:1271, 1281-1291]. `classifyBootError` maps text containing `[GAMELIB_IPC_INVALID_CHANNEL]` to `'invalid-channel'` and `[GAMELIB_IPC_INVALID_ARGS]` to `'invalid-args'`, and anything unmarked to `'fatal'` which paints over a pre-mount page [VERIFIED: src/frontend/bootErrorSurface.ts:43-70]. So a native boot-time rejection with any other shape is user-visible as a blank-page error. Codes/paths use the zod vocabulary (`invalid_type`, `too_big`, `unrecognized_keys`, `no_schema`, path `(args)` or the index); a small Rust `invalid_args(channel, issues)` helper must sanitise paths exactly as `sanitisePath` does (alphanumerics, `_`, `-`, 64 chars) and never include values or key names (D-10 of Phase 67) [VERIFIED: src/backend/sidecar/ipcValidation.ts:35-70].

### Pattern 3: One manifest drives generator, snapshot, owner test and negative tests (D-06/D-07)
**What:** `src/common/types/ipc/nativeChannels.json` declares each native channel: `{ kind, slice, args: [{name, type, maxLength?}], valid: [[...]], invalid: [[...]] }`. The Rust serde struct stays the runtime authority (D-07); the JSON is the reviewable description, and a Rust test binds them: every `valid` vector must deserialize, every `invalid` vector must be rejected, and a channel with an empty `invalid` list fails the test (that is the "negative test per migrated channel" made structural, with a vacuous-pass guard). Precedent for a shared JSON read by both TS tests and Rust tests: `src/common/__fixtures__/openPolicyCases.json` is `include_str!`'d in `shell_open.rs` [VERIFIED: shell_open.rs:119].
**Generator extension (`meta/genIpcContract.ts`, 669 lines):**
- Today `renderIpcContract` builds `RENDERER_CHANNELS` from `channelSchemas` entries with `caller === 'renderer'` and kind `invoke|send`, sorted, consumed through `binary_search` [VERIFIED: genIpcContract.ts:529-543, 574-578; ipc_contract.rs:520, 766]. Deleting a native channel's zod entry would drop it from that list and `relay_channel_verdict` would then reject it. So the generator must **union** the manifest names into `RENDERER_CHANNELS` (keep it sorted) and emit `NATIVE_INVOKE_CHANNELS` / `NATIVE_SEND_CHANNELS` (sorted, same `binary_search` helper).
- The same run writes `ipcSchemaSnapshot.json` (channel, kind, owner, args: zod `toJSONSchema(io:'input')` for sidecar channels, the manifest description for native) and `--check` compares both outputs. Pre-commit's `ipc_contract_touched` filter already matches `src/common/types/ipc/*` and `meta/genIpcContract.ts`, and CI's step is the existing `pnpm check:ipc-contract`, so no new workflow step is needed [VERIFIED: .husky/pre-commit:42-47, codecheck.yml:29-30].
- Vacuous-pass guards (82 D-05): floor on snapshot channel count (243 renderer channels today, measured by script from `RENDERER_CHANNELS`), plus a deliberate empty-input and truncated-input test in the generator's jest suite.
**One-owner test (all three parts are needed):**
1. Rust: router table keys == `NATIVE_INVOKE_CHANNELS` ∪ `NATIVE_SEND_CHANNELS` exactly; each is in `RENDERER_CHANNELS`; kinds match.
2. TS census: no channel in the manifest is registered by any `deps.ipc.handle/on` call under `src/backend/**` and none has a `channelSchemas` entry (two-owner check).
3. Zero-owner check for the sidecar side: today 13 renderer channels have no literal registration (`devSweepEpicCookieDomain`, `getSignInProbeOutcomes`, the six `*CommandStub`s, `sidecar:store-fetch`, `sidecar:store-set-checked`, `storeDelete`, `storeNew`, `storeSet`), measured by a scratch scan; they are served by non-registry routes. The test must carry that list as an exact named ledger rather than assert "every channel is registered" [VERIFIED: scratchpad scan, 243 channels, 13 zero, 1 multi (`quit`, `i18nFallback.ts` and `appShellFlowRegistration.ts`)].

### Pattern 4: FIFO per slice, and what is and is not ordered
- Today `invoke` writes its frame from a `spawn_blocking` thread (`SidecarState::invoke` -> `write_frame`) while `send` frames go through the single `SidecarSendQueue` writer thread; both take the same stdin mutex. So **there is no ordering between a `send` and a later `invoke` today**, only among sends [VERIFIED: shell_state.rs:206-236; relay_commands.rs:44-50, 150, 162-184]. Native must not promise more: sends of one slice are FIFO; invokes run on the async runtime; nothing is ordered across kinds or across slices.
- Clone `spawn_send_writer`'s generic-writer shape (a `Fn(&Job)` closure over an `mpsc` receiver, `#[cfg(test)]` over a fake) for the slice queue and copy its two tests (enqueue does not block on a stuck handler; a failed job does not stop later jobs) [VERIFIED: relay_commands.rs:164-184, 386-437].
- Head-of-line risk: `open_url` can block on Windows behind an OS dialog ("no app handles steam://"), which is why the sidecar's frame handler opens on a worker thread and why a past UAT showed invoke responses parked behind it for 60 s [VERIFIED: sidecar.rs:626-640 comment D-UAT-19]. The `openExternalUrl` handler must therefore hand the URL to a short-lived opener thread and return, so FIFO order is of *dispatch*, matching today's behaviour. Do not run `open_url` on the slice worker.
- Spike result for D-02: the only renderer flows involving `openExternalUrl` issue either one call or two calls of the same channel back to back (`DialogHandler` `vcRuntimeDownload` opens the x86 then x64 installers, both `openExternalUrl`, then a renderer-local dialog), which FIFO preserves; `getHeroicVersion` callers (`HeroicVersion`, `AboutDialog`, `ChangelogModal`, `reportProblem`) chain through `.then`/`await`, so ordering comes from the awaited reply, e.g. `getHeroicVersion().then(...)` followed by `clearCache` [VERIFIED: grep of src/frontend, DialogHandler/index.tsx:38-50, HeroicVersion/index.tsx:69-75]. No cross-channel dependency exists for the two proof channels. Later slices must record their own order table; a slice plan should name "channels it moves that a renderer flow sequences with sends still on the sidecar".

### Pattern 5: Process lifetime mechanism per OS (D-11)
**Unix (macOS and Linux): one reaper process.**
- `main()` dispatches `--gamelib-reaper` before `install_panic_hook`, the single-instance guard and everything else (`fn main` is at `main.rs:1697`; the argv is read right after the panic hook and crypto provider). The reaper is `gamelib_proc::reaper::run()`: libc only, no Tauri, no AppKit, no allocation-heavy work.
- The app spawns it first with `Command::new(current_exe()).arg("--gamelib-reaper").stdin(Stdio::piped())` and `process_group(0)` (own pgrp so a terminal Ctrl-C or group signal does not take it with the app). Std marks the parent's pipe end close-on-exec, so no later child inherits it; EOF therefore means the app died. A reaper that cannot start is logged (`[shell] reaper unavailable`) and startup continues; the harness and live gate assert the line is absent.
- Protocol (line based, over the control pipe): `+ pid|pgid <id> <starttime> <label>` register, `- <id>` unregister, `disarm` (graceful quit). On EOF without `disarm`: for each registered entry verify the start time (macOS `proc_pidinfo`/sysctl, Linux `/proc/<pid>/stat` field 22) when the leader still exists, then `kill(-pgid, SIGTERM)`, poll up to the same ~2 s grace the shell uses today, then `SIGKILL`; exit. A group outlives its leader while any member remains, so the sidecar's pgid still reaches its children after the sidecar itself exited on stdin EOF (an existing test proves this: `kill_process_group_reaps_members_after_leader_exits`) [VERIFIED: sidecar.rs:876-895].
- Secondary trigger on macOS: `kevent(EVFILT_PROC, NOTE_EXIT)` on the parent pid next to the pipe read, so a leaked write end (fd inherited by a fork-without-exec child) cannot defeat it [ASSUMED: kqueue semantics from training knowledge; verify in the harness on `macos-latest`].
- Recommended: Linux uses the same reaper. `PR_SET_PDEATHSIG` may be set additionally on the sidecar and direct Rust helpers, but only from a long-lived thread (the setup/main thread or a tokio worker, never `spawn_blocking`).
**Windows: Job Object.** Generalise `create_kill_on_close_job` (sidecar.rs:259) from "the sidecar's job" into a process-wide `gamelib_proc::Job` that every `Helper`-class child is assigned to. Existing facts: flag set is only `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, "No breakaway flag is set (neither `BREAKAWAY_OK` nor `SILENT_BREAKAWAY_OK`), so children cannot escape the job", and "the kernel also closes the handle if the shell itself crashes, so this reaps on crash too" [VERIFIED: src-tauri/src/sidecar.rs:244-250]. A `Game`-class child is simply never assigned (the shell is not itself in the job), so a Rust-spawned game survives. The shell's `windows-sys` is 0.60.2 with `Win32_System_JobObjects`; the new crate uses 0.61.2 like its siblings, then the shell drops its own job code.
**Codesign / notarization / LaunchServices for the re-exec'd reaper (macOS).** Re-exec'ing the same Mach-O adds no new signed artefact, so there is nothing new to sign or notarize, and the hardened-runtime entitlements are those of the app. It is launched by `posix_spawn` from the app, not through LaunchServices, and never touches AppKit, so it should not get a Dock icon or a Cmd-Tab entry, but it will show in Activity Monitor and `ps` under the app's executable name [ASSUMED: LaunchServices/Dock behaviour of a non-AppKit re-exec; the live macOS gate must check Dock, Force Quit window and `ps`]. Known residual: `killall <exe-name>` matches both processes at once and can kill the reaper in the same instant (document, accept). Do not use a separate bundled reaper binary: it would need `externalBin` handling, its own signing and a size cost for no benefit.

### Pattern 6: One shutdown deadline (D-12)
**Today's exit path (all read this session):** `handle_exit` runs: depot `cancel_all_and_wait(EXIT_FINALIZE_WAIT)`, then `steamcm_exit_shutdown()`, then `steampoll_exit_shutdown()`, then `SidecarState::shutdown_child()`, then `wake_lock_release_all()`, then socket removal [VERIFIED: main.rs:755-789]. Constants: `EXIT_FINALIZE_WAIT: Duration = Duration::from_secs(5)` (depot_dispatch.rs:15, also used by steampoll), `STEAMCM_SHUTDOWN_BOUND: Duration = Duration::from_secs(5)` (steamcm_dispatch.rs:12), and the sidecar grace `Instant::now() + Duration::from_millis(2000)` (shell_state.rs:146). Serial worst case is therefore about 17 s, which is longer than a logout will wait [ASSUMED: OS logout kill timing]. Routed quits first run the TS `handleExit` (confirm, `teardownAll`, `killAllTracked`, `releaseSteam`, `deletePresence`, then `app_exit`) *before* `RunEvent::Exit`, so the Rust deadline starts at `handle_exit`, not at the user's click [VERIFIED: quitHandler.ts, terminate_veto.rs:58-95].
**Design:** `gamelib_core::Shutdown` = a `CancellationToken` plus a registry of guards. `register(name) -> Registrant` (drop = done, any thread, any runtime); `begin(total: Duration) -> Report { still_running: Vec<&'static str> }` cancels the token and blocks on a condvar until all guards drop or the deadline (the `JobDone::wait_until` pattern from `gamelib-depot/src/registry.rs` [VERIFIED: registry.rs:10-42]). Stages inside one budget: (1) drain, concurrent: depot cancel and finalize, steamcm logoff and owed-record restore, steampoll stop and monitor kill; (2) children: `ChildSet::terminate_all` at `min(drain done, deadline - child_grace)`, then kill-tree; (3) `reaper.disarm()`, wake-lock release, socket cleanup. Suggested constants: `TOTAL = 5 s`, `CHILD_GRACE = 1.5 s` so drain gets up to 3.5 s; confirm the depot finalize fits (Open Question 3). The existing "steamcm logoff before the sidecar dies" intent is kept because stage 2 starts after stage 1 or at the reserve. The final log line names counts and registrant names only (reuses today's `depot jobs still running at exit deadline: {n}` style).
`handle_exit` stays the single caller, and `SidecarState::shutdown_child` shrinks to a registered child set member; keep `begin_shutdown()` (the EOF flag) at `ExitRequested` as is [VERIFIED: main.rs:1825-1837].

### Pattern 7: gamelib-core and gamelib-proc shape (Claude's Discretion, recommended)
**gamelib-core** (no tokio runtime of its own, no Tauri):
- `clock.rs`: `trait Clock { fn now_ms(&self) -> u64 }` hoisted as is (steampoll `host.rs:60`), plus `SystemClock`.
- `process.rs`: `trait ProcessRunner { run(&self, program, argv, timeout) -> BoxFuture<RunOutput>; spawn_streaming(&self, program, argv) -> io::Result<StreamingChild> }`, `RunOutput`, `StreamingChild`, `BoxFuture`: a **pure move** from `crates/gamelib-steampoll/src/host.rs` [VERIFIED: host.rs:44-63]; steampoll re-exports (`pub use gamelib_core::...`) so its ~120 references (tests, CLI, fakes) compile unchanged. Add `SpawnClass` and a `spawn(spec)` method only after the move compiles, additive and defaulted.
- `emitter.rs`: `trait FrontendEmitter { fn emit(&self, channel: &str, args: Vec<Value>) }`, extracted from `PollHost::emit_frontend`, whose real body emits `FRONTEND_MESSAGE_EVENT` with `FrontendMessagePayload { channel, args }` [VERIFIED: steampoll_dispatch.rs:385-394]. `PollHost: FrontendEmitter` can wait; the recording fake stays in steampoll's `testing` feature for now.
- `paths.rs`: `Platform` plus the pure `resolve(platform, home, env)` currently in `SidecarProfile::resolve` (user_data, config path, store paths) [VERIFIED: steampoll profile.rs:60-100]; `SidecarProfile` keeps `language()` / `default_steam_path()` (they read `config.json`) as a thin wrapper.
- `shutdown.rs`: `Shutdown`, `Registrant`, `Report` (Pattern 6).
**gamelib-proc:** `TokioRunner` (moved from steampoll `runtime.rs`, it keeps `kill_on_drop(true)`, null stdin, argv-only [VERIFIED: runtime.rs:48-56, 70-76]), `SpawnClass { Helper, Game }`, `ChildSet` (adopt a std `Child` or group; `terminate_all(grace)`; `kill_all()`), `kill_tree` (unix group signalling with the existing `pgid <= 1` refusal, Windows `TerminateJobObject`), `reaper`, `job`, `proto`, and the harness stand-ins.
**gamelib-safety re-home: recommend NOT in this phase.** It is a pure leaf with its own CI step ("run first so an earlier red crate cannot mask them", 82 D-18), Phase 82 is still executing (plan 6 of 16) and its crate is under active change, and nothing in 83 needs `Paths` and safety together. Leave it a separate crate; `crates/README.md` section 2b wording ("after Phase 83 re-homes ... into `gamelib-core`") must be amended to say it is deferred [VERIFIED: README.md section 2b; rust-test.yml first `-p` step].

### Anti-Patterns to Avoid
- **Native handler on the main thread:** non-async Tauri commands run on the main thread; the 2026-10-05 freeze came from a blocking write there [VERIFIED: relay_commands.rs:119-126 doc].
- **A fallback flag or error-driven fallback for a native channel** (D-04). The sidecar's `validateInbound` fails closed with `no_schema` for a channel with no zod entry, which is a useful second guard if a native channel were ever relayed by mistake [VERIFIED: ipcValidation.ts:56-69].
- **`PR_SET_PDEATHSIG` as the Linux mechanism:** see Pitfall 4.
- **Piping a surviving game's stdout/stderr to a process that dies:** a closed pipe can raise SIGPIPE in the game (Pitfall 5).
- **Joining Windows test paths with `join("a/b")`** (Rust tests must pass on Windows).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-runtime cancellation | A bespoke flag type | `tokio_util::sync::CancellationToken` | Works across the three private runtimes (steampoll, steamcm, depot) |
| Wait-until-all-done | Polling loops | The `Mutex<bool>` + `Condvar::wait_timeout` pattern in `gamelib-depot/src/registry.rs` `JobDone` | Already proven, runs on the main thread at exit |
| Fake HOME for spawns | A hand-rolled `env` literal | `gamelib_testutil::FakeHome::new` + `apply` | Convention 2; 0700 root, eight variables |
| Group kill with safety refusal | New raw `libc::kill(-pgid)` call sites | The existing `kill_process_group` (refuses `pgid <= 1`) moved into `gamelib-proc` | `kill(-1)` is "every process the user owns" |
| Windows Job creation | New FFI | Move `create_kill_on_close_job` from `sidecar.rs:259` | Tested failure fallbacks already logged |
| Scheme allow-list for `openExternalUrl` | A second copy | `open_external_scheme_check` and `OPEN_EXTERNAL_ALLOWED_SCHEMES` | `shell_open.rs` tests it against the shared `openPolicyCases.json` |
| IPC marker strings | New literals | The generated `IPC_INVALID_CHANNEL_MARKER` and a Rust mirror of `IPC_INVALID_ARGS_MARKER` emitted by the generator | Literals drifted before; `bootErrorSurface.ts` mirrors them by hand |

**Key insight:** every piece this phase needs already exists in this repo in a narrower form (send queue, group kill, Job Object, condvar wait, fake HOME, `openPolicyCases.json`). The work is hoisting and unifying them behind traits so later slices stop re-solving them, not inventing mechanisms.

## Findings (answers to the priority questions)

### F1. D-10: do launched games die on quit today? Yes, on all three OSes, by design
All backend spawns go through the TS runner (`runner.ts` is "the only file allowed to import child_process"; the only other `child_process` mention is a comment in `helperRegistry.ts:62`). Its header states: "tracked children are killable by PID, never by name (Phase 72 D-13), and are NOT detached so the Rust shell's process-group reap still covers them", and "`openDetached` is the only detached spawn" [VERIFIED: src/backend/process/runner.ts:13-14, 11-12]. The sidecar itself is put in its own group with `cmd.process_group(0);` [VERIFIED: sidecar.rs:215]. Trace per launch path:

| Launch path | Spawn site | Tracked / group | Dies on graceful quit | Dies on SIGKILL of shell |
|-------------|-----------|-----------------|----------------------|--------------------------|
| Wine / CrossOver game (also bridged games) | `commandRunner.ts:373` `runner.run`, `track: { runner: 'wine', key: ... }`, `timeout: { none: true, ... }` | sidecar group; killable by PID | Yes: confirm then `killAllTracked()` ("Includes tracked Wine children (games)"), then group SIGTERM, 2 s, SIGKILL (`shutdown_child`) | unix: no reaper exists, the sidecar exits on stdin EOF and its non-detached children are reparented (survive unless they exit on a closed pipe) [ASSUMED, not measured]. Windows: Job closes, games die |
| Store CLI launches (legendary, gogdl, nile) | `commandRunner.ts:532` `runner.run`, `track: { runner: runnerProps.name, ... }` | sidecar group | Yes (same) | same as above |
| Launch-script hook | `commandRunner.ts:732` | sidecar group | Yes | same |
| macOS native Steam game, direct | `steam/directLaunch/launchWithoutSteam.ts:85` `track: { runner: STEAM_DIRECT_TRACK_RUNNER, ... }` | sidecar group | Yes | same |
| Bridge steam_api helper serving a bridged game | `bridge/helperSpawn.ts:298` `spawnLongLived`, teardown `registry.stop(appId)` | sidecar group; `teardownAll()` at quit | Yes (teardown, then group) | same; whether the helper exits on closed stdio is not known [ASSUMED] |
| `steam://rungameid` via Steam | `host/openExternal.ts` (`openDetached` `open -g` on macOS for `steam:` with `activate:false`) | Not our tree: Steam launches the game | No (the game is Steam's child) | No |
| wineserver | forked by wine, not spawned by us | likely own session after the last client exits [ASSUMED] | follows its clients | follows its clients |

Windows: the job has no breakaway flag, "Sidecar-launched games dying on quit is by design (parity with Unix)" [VERIFIED: sidecar.rs:249-250]. The confirm dialog copy also says "Quitting GameLib ends any multiplayer session it is hosting" (`box.quit.bridgeHosting`) [VERIFIED: quitHandler.ts]. **So D-08 is a behaviour change on every OS for sidecar-spawned games**, and `quitHandler.killAllTracked()` plus that copy would be wrong once a game is allowed to survive. See Open Question 1 for the recommended scoping.

SIGKILL today (unix): nothing in the shell reaps the sidecar group (the `RunEvent::Exit` path never runs); the sidecar exits by stdin EOF (Force Quit measured: sidecar logged the stdin-closed line and exited, no orphan, after quick 261110-9w2) [CITED: .planning/todos/completed/2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md], but its children are not killed by anything. Rust-spawned long-lived helpers: only the macOS nettop chain (`/bin/sh` watchdog polling the shell pid every second, `kill_on_drop`) [VERIFIED: gamelib-steampoll/src/monitor.rs:34-50]; the mac-owned helper is short-lived with `kill_on_drop(true)` and a timeout [VERIFIED: gamelib-steamcm/src/macowned.rs:162-172]; Linux wake lock is `systemd-inhibit ... cat` with a piped stdin, so EOF ends it (already SIGKILL-safe) [VERIFIED: wake_lock/linux.rs:1-33].

### F2. Router spike (ordering, interleave): see Pattern 4. Result summary
Send frames are FIFO per queue; invoke and send are not ordered against each other today; no renderer flow for the two proof channels depends on cross-channel order. Recommended test set: FIFO order from N enqueues, non-blocking enqueue behind a stuck handler, failed job does not stop the queue, native-send-while-sidecar-send interleave preserves each queue's own order.

### F3. Rejection shapes: see Pattern 2. D-03 needs a refinement
D-03 says malformed args should return `[GAMELIB_IPC_INVALID_CHANNEL]`. Verified fact: today only an off-allow-list name returns that marker; malformed args on a sidecar invoke return `[GAMELIB_IPC_INVALID_ARGS] {json}` and malformed args on a send are silently dropped and logged. Matching "same as today" therefore means INVALID_ARGS for bad args on a native invoke and drop-and-log for a native send. This is a wording correction to implement, not a new decision, but flag it in the plan.

### F4. The two proof channels: exactly what is deletable
`openExternalUrl` (send): sidecar registration `shellFilesFlowRegistration.ts:156-166`; zod `openExternalUrl: z.tuple([urlArg()])` in `ipc/shellFiles.ts:15`; `urlArg()` = string, `.max(8192)`, `URL.canParse` [VERIFIED: schemaTypes.ts:81-86]; preload `misc.ts:28` `makeListenerCaller('openExternalUrl')` (stays); tests: `shellFilesFlows.test.ts` lines 349-420 and the `openExternalUrl: 'send'` map at ~783, `ipcSchemas/shellFiles.test.ts:14`; `flowRegistrationCensus` EXPECTED `shellFilesFlowRegistration.ts: { invoke: 3, send: 11 }` becomes send 10 and the docstring counts ("Registers 14 of this slice's 22", "Registers this module's 14 ... (3 invoke + 11 send)") must change because Gate 2 re-derives them. The sidecar-side `host/openExternal.ts` stays (used by the four remaining openers, `openWebviewPage`, Steam launches). `assertOpenableExternalUrl` **stays**: `appShellFlowRegistration.ts:473` (`openWebviewPage`) still imports it, as does `openPolicy.ts`'s mirror-parity test; only `shellFilesFlowRegistration.ts:89` drops its import of that symbol (it still imports `classifyFolderTarget`). The comment in `src/frontend/helpers/externalLinkClicks.ts` that says the sidecar's `assertOpenableExternalUrl` "stays the enforcing check" becomes stale and should say the Rust router is. Rust side: the existing `open_external` Tauri command (a fourth app-defined command, registered in `generate_handler!`) is not called by the renderer (no `'open_external'` call site found in `src`), and the sidecar's `openExternal` frame arm in `sidecar.rs` stays for the other openers; leave both, and record the `open_external` command as a deletion candidate for Phase 98 (Open Question 5).
`getHeroicVersion` (invoke): registration `appShellFlowRegistration.ts:386` (`async () => deps.appInfo.version`); zod `getHeroicVersion: noArgs` in `ipc/appShell.ts:65` and its return type at `:74`; test `appShellFlows.test.ts:493`, `ipcSchemas/appShell.test.ts:54`; `AppShellFlowDeps.appInfo` (`:346`) becomes unused by this module and is removable with its `handlers.ts` plumbing (`appInfo: services.appInfo` appears in eight deps blocks; only the app-shell one goes); `flowRegistrationCensus` `appShellFlowRegistration.ts: { invoke: 7, send: 13 }` becomes invoke 6 and the docstring (`Registers the 20 sidecar-routed app-shell channels (7 invoke + 13 send)`) changes. **Stays:** `utils/systeminfo/heroicVersion.ts` and its use in `getSystemInfo` (a different function that happens to share the name, reads `package.json`), `host/appInfo.ts` (`resolveAppInfo`, used elsewhere).
**Where the version comes from in Rust:** the sidecar's answer is `pkgJson.version` from `package.json` (`resolveAppInfo`, "npm_package_version is UNSET in the packaged SEA sidecar binary") [VERIFIED: host/appInfo.ts]. Three files carry the same string today, `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, all `0.8.0`, and no test found asserts they match [VERIFIED: greps; tauriConf.test.ts has no package.json version check]. Use `env!("CARGO_PKG_VERSION")` behind a pure `fn app_version() -> &'static str` (testable without an `AppHandle`) and add a gate test that the three files agree. Whether release tooling stamps only `tauri.conf.json` is not verified (Assumption A8).
**Type declaration for the renderer:** the zod entries are also the type source (`ShellFilesSync = SendFns<typeof shellFilesSyncArgs>`, `AppShellAsync`, composed in `ipc/index.ts`). Add a typing-only `native.ts` declaring `NativeSync { openExternalUrl: (url: string) => void }` and `NativeAsync { getHeroicVersion: () => string }`, named in the `index.ts` intersections so census (c) stays green, and gate that its keys equal the manifest. `meta/knip-baseline.txt` lines for `Misc.getHeroicVersion` / `Misc.openExternalUrl` do not change (the preload exports stay).

### F5. Census and gate changes required
- `ipcDomainCensus.test.ts`: pins `expect(total).toBe(295)`, `DECLARATIONS_FLOOR = 284`, `FILES_FLOOR = 22`, `expect(files.length).toBe(22)`, and a 67-entry `NO_REGISTRATION_OWNER` ledger computed as "declared but not registered" [VERIFIED: ipcDomainCensus.test.ts]. Declaring the two channels in `native.ts` keeps the total at 295, but the computed owner-less set would then include them. Teach (d) that manifest-owned channels are excluded and listed separately. **These numbers are as of today; Phase 82 plans 02/06/10/15 edit these censuses, so re-measure at planning time.**
- `flowRegistrationCensus.test.ts`: EXPECTED counts and Gate 2 docstring counts (above).
- `ipcSchemaCoverage.test.ts`: "Every registered or declared IPC channel has a schema ... no exemption list"; a declared-but-no-zod native channel would fail it. Add "covered by manifest" as the second accepted source, and keep the no-exemption-list property by deriving it from the manifest, not a hand list.
- TS source-text gates over Rust that pin shapes this phase changes: `sidecarShutdownFlagSource.test.ts` (shutdown_child sets the flag before any kill; skips the group signal once reaped), `quitTeardownWiring.test.ts` C4 (`shutdown_child` reaps the group: SIGTERM, bounded grace, SIGKILL, wait), `tauriShellSource.test.ts` lines ~1269-1286 ("shutdown_child() has exactly one call site in the whole file"), ~5258 ("steampoll_exit_shutdown runs before shutdown_child in handle_exit"), and the pins around `.setup(move |app|` ordering (REQ-46-08, comment at main.rs:1847). Folding `handle_exit` into `Shutdown` rewrites these in the same commit; do not leave them to fail in CI.
- New `nativeSeamPortComplete.test.ts` (the `*PortComplete` template, D-05): asserts for each manifest channel that no `deps.ipc.handle/on` registration, no `channelSchemas` entry and no `GAMELIB_` flag text survive, that the walk saw at least a floor of files, and that the intended survivors (`openPolicy.ts` `assertOpenableExternalUrl`, `heroicVersion.ts`) still exist. Model: `scannerPortComplete.test.ts` and `depotPortComplete.test.ts` [VERIFIED: README.md section 7].

### F6. D-12 participants: see Pattern 6.
Also: steamcm and steampoll block on their own runtimes (`gamelib_steampoll::runtime::handle().block_on(...)`), depot uses std threads and a global registry; all three can wait concurrently from separate `std::thread::scope` threads or register guards that `begin` waits on.

## Common Pitfalls

### Pitfall 1: Dropping a native channel from the allow-list by deleting its zod entry
**What goes wrong:** `RENDERER_CHANNELS` is generated from `channelSchemas`; delete the entry and `relay_channel_verdict` rejects the channel before the router sees it.
**How to avoid:** generator unions manifest names into `RENDERER_CHANNELS` in the same plan that deletes the entry; a Rust test asserts every router key is in `RENDERER_CHANNELS`.
**Warning signs:** `[GAMELIB_IPC_INVALID_CHANNEL] channel not allowed: openExternalUrl` in a manual click test.

### Pitfall 2: Boot-time native rejection with an unmarked error paints the whole page
**What goes wrong:** `classifyBootError` treats unmarked text as `fatal`.
**How to avoid:** all native rejections carry INVALID_ARGS or INVALID_CHANNEL; a Rust test asserts the prefix for every negative vector.

### Pitfall 3: `open_url` blocks the FIFO worker
**What goes wrong:** On Windows the OS can show a modal dialog; every later `openExternalUrl` queues behind it.
**How to avoid:** handler spawns the opener thread and returns (Pattern 4). A test with a handler that blocks proves later jobs still dispatch.

### Pitfall 4: `PR_SET_PDEATHSIG` looks like the Linux answer and is not
**What goes wrong:** the man page says "The 'parent' in this case is considered to be the thread that created this process", and "The parent-death signal setting is cleared for the child of a fork(2)" [CITED: man7.org PR_SET_PDEATHSIG(2const)]. Setting it from a tokio `spawn_blocking` thread kills the child when that pooled thread retires, and it never covers grandchildren such as everything the sidecar spawns.
**How to avoid:** unix reaper is the mechanism; PDEATHSIG only as an extra, from long-lived threads.

### Pitfall 5: Surviving game tree attached to a dying pipe
**What goes wrong:** a game whose stdout/stderr is a pipe to the sidecar can take SIGPIPE when the sidecar dies. Wine ignoring SIGPIPE and native macOS games not ignoring it are both [ASSUMED].
**How to avoid:** `SpawnClass::Game` redirects stdio to a file or null, never a pipe to the app; the harness's game stand-in writes to stdout continuously after the parent dies and must stay alive.

### Pitfall 6: Reaper killed by the same event, or killing a recycled pid
**What goes wrong:** terminal Ctrl-C or a process-group signal reaches the reaper along with the app; or a registered pid exited long ago and was recycled before the app died.
**How to avoid:** reaper in its own pgrp and ignoring INT/HUP/TERM; app unregisters on child exit and sends `disarm` on graceful quit; registration records process start time and the reaper verifies it before signalling when the leader still exists; a group with no members yields ESRCH and is skipped.

### Pitfall 7: A harness that passes because the processes were already zombies
**What goes wrong:** `kill(pid, 0)` succeeds for a zombie on macOS and Linux; orphans reparented to a non-reaping pid 1 stay zombies and look alive (or look dead when they are not).
**How to avoid:** `is_alive` = exists and state not `Z` (`/proc/<pid>/stat` on Linux, `ps -o stat=` on macOS, `GetExitCodeProcess == STILL_ACTIVE` on Windows). The harness must also prove it can see a live orphan: a negative control leg that **disables** the reaper and asserts the helper survives, so the assertion cannot pass vacuously.

### Pitfall 8: Source-text gates fail after the exit refactor
See Findings F5. Update them in the same commits.

### Pitfall 9: Windows path and Job behaviour differences in tests
Tests join segments one at a time. The Windows leg must create the Job itself the way the shell does; runner VMs can already be inside an outer job, which nests on Windows 8+ but is worth logging when assignment fails.

## Code Examples

### Rust-side INVALID_ARGS error (matches `formatIpcInvalidArgsError`)
```rust
// Source: mirrors src/common/types/sidecarTransport.ts:1271-1291 and ipcValidation.ts sanitisePath
const IPC_INVALID_ARGS_MARKER: &str = "[GAMELIB_IPC_INVALID_ARGS]"; // emit from the generator, do not hand-copy
pub(crate) fn invalid_args(channel: &str, paths: &[&str], codes: &[&str]) -> String {
    let payload = serde_json::json!({
        "code": "IPC_INVALID_ARGS",
        "channel": echo_channel(channel),     // same 64-char printable-ASCII cut as the relay
        "paths": paths, "codes": codes,        // already sanitised: [A-Za-z0-9_-], "(args)", "0"
    });
    format!("{IPC_INVALID_ARGS_MARKER} {payload}")
}
```

### Arg struct for the two proof channels
```rust
// Source: D-07; schema parity with z.tuple([urlArg()]) and noArgs (shellFiles.ts:15, appShell.ts:65)
// openExternalUrl is positional: args == [url]; from_value on a tuple rejects extra elements.
#[derive(serde::Deserialize)]
struct OpenExternalUrlArgs(String);             // one positional string; len <= 8192 checked after
fn parse_open_external_url(args: &[Value]) -> Result<String, String> {
    let (url,): (String,) = serde_json::from_value(Value::Array(args.to_vec()))
        .map_err(|_| invalid_args("openExternalUrl", &["(args)"], &["invalid_type"]))?;
    if url.len() > 8192 || url::Url::parse(&url).is_err() {          // URL.canParse parity: confirm `url` crate is already a locked dep
        return Err(invalid_args("openExternalUrl", &["0"], &["too_big"]));
    }
    open_external_scheme_check(&url).map_err(|_| /* scheme: log name only, return Ok(()) for send */ ...)?;
    Ok(url)
}
// getHeroicVersion: args must be empty -> (): serde_json::from_value::<[Value; 0]>
```
(`url` 2.5.8 is already in `src-tauri/Cargo.lock` as a transitive dependency [VERIFIED: Cargo.lock:6128-6129], so declaring it directly adds no lockfile name. Add a parity vector set (valid and invalid URLs) to the manifest so any WHATWG divergence from `URL.canParse` is visible; the scheme check stays the enforcing control.)

### Shutdown guard pattern
```rust
// Source: pattern from gamelib-depot/src/registry.rs JobDone (VERIFIED), applied to gamelib-core
pub struct Shutdown { token: CancellationToken, state: Arc<(Mutex<Vec<&'static str>>, Condvar)> }
pub struct Registrant { name: &'static str, state: Arc<(Mutex<Vec<&'static str>>, Condvar)> }
impl Drop for Registrant { fn drop(&mut self) { /* remove name, notify_all */ } }
impl Shutdown {
    pub fn begin(&self, total: Duration) -> Vec<&'static str> {
        self.token.cancel();
        let deadline = Instant::now() + total;
        /* wait_timeout loop until empty or deadline; return remaining names */
    }
}
```

### Windows job flags (existing, verbatim)
```rust
// Source: src-tauri/src/sidecar.rs:281
info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sidecar is the front door for every renderer call | Native router first, sidecar relays the rest | This phase | A native channel works with no sidecar |
| zod in the sidecar validates args | serde structs + manifest vectors validate in Rust | This phase | Phase 72 trust boundary re-homed per channel |
| Group SIGTERM then SIGKILL of the sidecar only | Reaper (unix) / process-wide Job (Windows) / `ChildSet` kill-tree | This phase | SIGKILL of the shell no longer leaves helpers |
| Serial per-subsystem waits (about 17 s worst case) | One `Shutdown` budget (about 5 s) | This phase | Bounded exit |
| Per-child `sh` parent-poll watchdog (nettop) | Reaper registration; watchdog kept for the Steam-pid coupling | This phase | One mechanism for helpers |

**Deprecated/outdated:** `SidecarState::shutdown_child`'s bespoke group logic and `handle_exit`'s serial order, replaced by `ChildSet` and `Shutdown`; the `crates/README.md` text that says safety is re-homed in 83.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | wineserver daemonises into its own session after the last client exits | Findings F1 | Game-tree harness stand-in under-models Wine; live gate must observe `ps` for wineserver |
| A2 | Wine ignores SIGPIPE; native macOS games may not | Pitfall 5 | If wrong, file-backed stdio is unnecessary overhead; if reversed, games die on app death |
| A3 | A re-exec'd GameLib binary in reaper mode shows no Dock icon / Cmd-Tab entry and is not registered with LaunchServices | Pattern 5 | A second Dock icon or Force Quit entry; live macOS gate item |
| A4 | `kevent(EVFILT_PROC, NOTE_EXIT)` on a non-child parent pid works as the secondary trigger | Pattern 5 | Only the pipe EOF trigger remains; acceptable, harness decides |
| A5 | OS logout/shutdown waits roughly 5 s before force-killing apps | Pattern 6 | Deadline could be shorter or longer; D-12 fixes about 5 s regardless |
| A6 | `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK` on the shell's job lets a Node `detached:true` child survive while libuv's own kill-on-close job still reaps non-detached helpers (libuv comment: non-detached children are assigned to its global job "so windows will kill it when the parent process dies") | Open Question 1 | Windows half of D-08 for TS-spawned games not achievable without Rust spawning; only the Node harness leg can settle it |
| A7 | The bridge helper does not exit by itself when the sidecar's pipes close | Findings F1 | Changes what "today on SIGKILL" means for bridged games |
| A8 | Release tooling stamps the version from `src-tauri/tauri.conf.json` | Findings F4 | `getHeroicVersion` could diverge from `package.json`; the three-file equality gate covers it |
| A9 | The depot finalize (1026 record) completes inside about 3.5 s in practice | Pattern 6 | Truncated finalize on quit; needs live log evidence (`depot jobs still running at exit deadline`) |
| A10 | `url` 2.5.8 is locked (verified in Cargo.lock:6128-6129) but only transitively; declaring it a direct dependency of the shell adds no lockfile name, though WHATWG parity with `URL.canParse` for exotic inputs is not tested | Code Examples | A URL that `URL.canParse` accepts but `url::Url::parse` rejects (or the reverse) changes accept/reject behaviour for odd inputs; the scheme check remains the enforcing control |
| A11 | GitHub `ubuntu-latest` and `macos-latest` runners reap orphans via init/launchd so zombies are transient | Pitfall 7 | Harness liveness helper treats `Z` as dead regardless |

**All claims tagged `[ASSUMED]` need user or spike confirmation before they become locked decisions; A3, A6 and the D-08 scoping are the ones a plan must not paper over.**

## Open Questions

1. **D-08 / D-10 scope for TS-spawned games (needs user confirmation before planning).**
   - What we know: every sidecar-spawned game is in the sidecar's group (unix) or the no-breakaway Job (Windows) and dies on quit by design; the quit handler explicitly `killAllTracked()`s them; there is no mechanism in the Rust shell that can make a game survive while its parent is the sidecar.
   - What's unclear: whether D-08 means real TS-launched games must survive in this phase. Unix could do it with a TS `survivesQuit` runner class (`detached: true`, stdio to the game's log file or null, skipped by `killAllTracked`, excluded from the reaper group, and a quit-copy review); Windows cannot without a Job-flag change that only the Node harness leg can validate (A6) or Rust-side spawning.
   - Recommendation: Option B. In Phase 83 build and prove `SpawnClass::Game` plus the reaper/Job exclusion with the stand-in game tree on three OSes, leave the TS runner's game spawns alone, and have the launch port (Phase 88) and the Steam bridge slices (95-97) adopt `SpawnClass::Game`. Record the interim status quo (games die on quit; on unix SIGKILL the reaper now also kills the sidecar group including TS-spawned games, where they previously survived by accident). Option A (TS survivor class now) is viable on unix only and spends TS churn that is deleted within the milestone. Needs a yes or no.
2. **Reaper scope for `Game`-class vs sidecar-group games.** If Option B is accepted, state in the plan that criterion 3's "launched games excepted" is met for Rust-spawned games and that TS-spawned games share the helpers' fate, so the live gate's "game survives" step uses a Rust-spawned stand-in or a game launched through Steam (`steam://`), not a Wine game.
3. **Depot finalize timing under a shared 5 s budget (A9).** Collect `depot jobs still running at exit deadline` evidence from recent `gamelib.log` files; if finalize regularly needs more than about 3.5 s, either raise `TOTAL` for the drain stage only or run the child grace concurrently with drain.
4. **Normalising the TS quit copy.** `box.quit.bridgeHosting` says quitting ends a hosted multiplayer session. Nothing changes in 83 under Option B; under Option A it becomes untrue.
5. **The unused `open_external` Tauri command.** Not called by the renderer and a second webview-reachable open path. Deletion would touch `capabilities/default.json` prose and a `main.rs` source-text test (`open_external_command_body_calls_the_scheme_check_before_opening`). Defer to Phase 98 unless the planner wants it now.
6. **`URL.canParse` parity (A10).** `url` is locked transitively; decide whether to declare it directly or to keep the Rust check to scheme allow-list plus length and rely on the manifest vectors.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| rustc / cargo | all Rust work | yes | 1.99.1 (2026-10-13) | none needed |
| Node | Node stand-in leg, jest, generator | yes | v22.23.4 | harness leg skips locally only, panics when `CI` is set (same convention as link tests) |
| pnpm | `pnpm check:ipc-contract`, jest | yes | 10.28.0 | none |
| macOS arm64 host | live Force Quit gate | yes (`Darwin arm64`) | n/a | none |
| Windows and Linux hosts | local reproduction | no | n/a | CI matrix legs (`windows-latest`, `macos-latest`, `ubuntu-latest`) are the proof; Windows/Linux live sessions are batched, not per-phase |
| graphify | codebase orientation | yes | graph.json present | n/a |

**Missing dependencies with no fallback:** none. **Missing with fallback:** local Windows/Linux, covered by CI.
Note `rust-test.yml` builds the real SEA sidecar (`pnpm build:sidecar-sea`) in the same job; the harness does not need it.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `cargo test` (Rust 1.99.1) for crates and shell; jest 29.7 for gates and generator |
| Config file | `src-tauri/Cargo.toml` workspace; `jest` projects (Meta, Backend, Preload, Frontend); `.github/workflows/rust-test.yml` |
| Quick run command | `cd src-tauri && cargo test -p gamelib-core -p gamelib-proc` |
| Full suite command | `cd src-tauri && cargo test --bin gamelib-shell && cargo test -p gamelib-core -p gamelib-proc -p gamelib-steampoll ...` plus `pnpm check:ipc-contract` and `pnpm jest --selectProjects Backend --runTestsByPath <census files>` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-03 | Router table == generated native sets == `RENDERER_CHANNELS` subset; no channel with two owners; zero-owner ledger exact | unit (Rust) + census (jest) | `cargo test --bin gamelib-shell native_router` ; `pnpm jest --runTestsByPath src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` | no, Wave 0 |
| FND-03 | Each native channel has at least one `invalid` vector and every vector behaves (negative test per channel) | unit (Rust, data-driven from the manifest) | `cargo test --bin gamelib-shell native_manifest_vectors` | no, Wave 0 |
| FND-03 | Native rejection text starts with INVALID_ARGS / INVALID_CHANNEL marker; send rejection logs name only | unit | `cargo test --bin gamelib-shell native_rejection_shape` | no, Wave 0 |
| FND-03 | Schema snapshot is fresh; floor + empty + truncated inputs fail | generator jest + CI step | `pnpm check:ipc-contract` ; `pnpm jest meta/__tests__/genIpcContract*` | partial (generator suite exists) |
| FND-03 | Slice queue FIFO, non-blocking enqueue, survives a failed job, opener does not block the queue | unit | `cargo test --bin gamelib-shell native_send_queue` | no, Wave 0 |
| FND-03 | Proof-channel TS deleted (`*PortComplete`) | jest source gate | `pnpm jest --runTestsByPath src/backend/__tests__/nativeSeamPortComplete.test.ts` | no, Wave 0 |
| FND-04 | Graceful quit: helpers gone, game tree alive (unix, Windows) | integration (stand-in parent) | `cargo test -p gamelib-proc --test orphans graceful` | no, Wave 0 |
| FND-04 | SIGKILL of parent: helpers + grandchildren gone, game alive; negative control with the reaper disabled leaves the helper alive | integration | `cargo test -p gamelib-proc --test orphans sigkill` | no, Wave 0 |
| FND-04 | Node stand-in sidecar: non-detached children die, detached child per A6 | integration (skips locally if no node; panics on CI) | `cargo test -p gamelib-proc --test orphans node_standin` | no, Wave 0 |
| FND-04 | `Shutdown::begin` returns by the deadline and names stragglers | unit | `cargo test -p gamelib-core shutdown` | no, Wave 0 |
| FND-04 | Steampoll still green after the hoist | unit | `cargo test -p gamelib-steampoll -p gamelib-steampoll-cli` | yes |
| FND-04 | Live macOS: Force Quit during a download with a game running, then `ps` | live gate (authored first, run by a different plan) | UAT item, see below | no, authored in Wave 0 |

### Harness design (D-13)
- `gamelib-proc/src/bin/standin.rs` (`required-features = ["harness"]`, enabled by a self dev-dependency, mirroring steampoll's `testing` trick): modes `parent`, `idle`, `tree`, `game`. `parent` spawns the reaper first (unix, via `gamelib_proc::reaper`), then via `gamelib-proc`: two helpers, one helper with a grandchild, one `Game`-class tree (a process plus grandchild that keeps writing to stdout), and prints a JSON manifest of pids; reads stdin for `quit` (runs `Shutdown::begin(5 s)` and exits).
- `tests/orphans.rs`: spawn `parent` with `FakeHome::apply` (never a hand-rolled env literal; fakeHomeIsolation convention 2 and Pitfall 11 of the v0.11 research), read the manifest, run leg (a) `quit` or (b) `Child::kill()` (SIGKILL on unix, TerminateProcess on Windows), then poll `is_alive` for up to 15 s every 100 ms: helpers and grandchildren must be dead, game tree alive; a drop guard kills the game tree and leaked pids so CI never accumulates strays. Negative control: reaper disabled via a harness flag, helper must still be alive after SIGKILL (proves the probe can see orphans).
- Windows leg creates the Job in the stand-in exactly as the shell will (same `gamelib_proc::Job`); Node leg runs a `node -e` stand-in sidecar that spawns non-detached and detached children to pin the libuv behaviour (A6) on the real runner semantics.
- Link-style rule: when a precondition cannot be created (e.g. node missing), panic if `CI` is set, skip only locally.
- Timing: no sleeps without a poll; bounded by `deadline`, no flake-prone fixed waits.

### Live macOS gate (authored in Wave 0, run by a different plan, per the live-gate-contract-authoring standard)
Items, each with expected log/ps evidence: (1) Start `pnpm tauri:dev` (never `tauri:dev:run`), start a Steam download (Rust pipeline) and launch a game via `steam://` or a Rust-spawned stand-in; (2) record `ps -axo pid,ppid,pgid,comm` for sidecar, nettop chain, reaper, helpers; (3) Force Quit the app (Cmd-Opt-Esc or `kill -9 <shell pid>`); (4) within 5 s `ps` shows none of: sidecar, nettop, reaper, comet, legendary/gogdl/nile, wine tools; the game process (and its wineserver, if Wine-launched) is still present; (5) no second Dock icon or Force Quit entry for the reaper while running; (6) `[shell] reaper unavailable` absent from the diag log. Apply the seven defect-class tests (Structural Reachability Review) before publishing; the 80 nettop orphan (T-80-16) is the canonical failure it re-runs [CITED: 80-HUMAN-UAT.md item 1, T-80-16].

### Sampling Rate
- **Per task commit:** `cargo test -p gamelib-core -p gamelib-proc` (crate work) or the touched jest census file; `npx prettier --check` on exactly the paths written (convention 5), checking `--file-info` first.
- **Per wave merge:** `cargo test --bin gamelib-shell`, all `-p` crates, `pnpm check:ipc-contract`, `pnpm codecheck`.
- **Phase gate:** three-leg `rust-test.yml` green, then the live macOS gate, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Live macOS gate contract written (before any code) and the Structural Reachability Review recorded
- [ ] `crates/gamelib-core` and `crates/gamelib-proc` skeletons, workspace members, `EXPECTED_LOCKFILE_CRATE_NAMES` +2, `rust-test.yml` `-p` entries (give the orphan harness its own early step, "run first so an earlier red crate cannot mask it", as Phase 82 D-18 did)
- [ ] `src/common/types/ipc/nativeChannels.json`, `native.ts`, generator extension with floor and empty/truncated tests
- [ ] `nativeSeamPortComplete.test.ts` skeleton and census updates (re-measure after Phase 82 lands)
- [ ] `crates/README.md` section additions (core/proc recipe, reaper, `Shutdown`), section 2b amendment, CLAUDE.md Conventions row and `gamelib-conventions` skill section (D-14; the skill's description and the "Five conventions" wording need updating)

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json`, so this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a (no auth surface touched) |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | Allow-list verdict first (`RENDERER_CHANNELS`), static single owner per channel, capabilities unchanged (`default.json` grants no new command; native channels ride the existing four relay commands) |
| V5 Input Validation | yes | serde `deny_unknown_fields` arg structs, manifest negative vectors, `open_external_scheme_check` scheme allow-list, 8192-byte URL bound; error strings never echo values |
| V6 Cryptography | no | n/a |
| V7 Error handling and logging | yes | Channel name only in logs (T-34.6-16-02), `echo_channel` truncation (T-67-61), counts and names only in the shutdown line (D-12) |
| V12 Files and resources / process | yes | argv-only spawns, no shell, `pgid <= 1` refusal, reaper verifies start time before signalling, 0700 fake-home in tests |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile renderer or remote content calls a native channel with a `file:` / `javascript:` / `smb:` URL | Tampering / Elevation | `open_external_scheme_check` before any opener call; shared `openPolicyCases.json` cases; allow-list is exact (five schemes plus one exact `x-apple.systempreferences` URL) |
| Extra or malformed args slip past a deleted zod schema | Tampering | serde struct with `deny_unknown_fields`; each manifest channel must carry an `invalid` vector |
| Native rejection leaks argument values into logs or errors | Information disclosure | channel name only; INVALID_ARGS payload carries sanitised paths and codes, never values or key names |
| Reaper signals a recycled pid or group | Elevation / DoS | start-time check at registration and before kill; `pgid <= 1` refusal; unregister on child exit; `disarm` on graceful quit |
| A second webview-reachable open path (`open_external` command) | Elevation | unchanged scheme allow-list; record it as a deletion candidate (Open Question 5) |
| Orphaned helper holds an authenticated session | Information disclosure | reaper / Job kill on SIGKILL; stdin-EOF release in the sidecar stays until Phase 99 |

## Project Constraints (from CLAUDE.md)

- GameLib is an independent project; do not raise deviation from upstream Heroic as a concern.
- Hand-maintained CLAUDE.md regions: edit directly for D-14; **never run `generate-claude-md`**.
- Conventions to honour in this phase's plans: todo frontmatter `severity:`/`platform:`/`ready:` for any new `.planning/todos/pending/` file; spawn child processes in `src/` or `meta/` only via `createFakeHomeProfile()` (Rust tests via `gamelib_testutil::FakeHome`), isolated by default plus a named real-profile arm where a defect only arms under a populated profile; sidecar timers/watchers/sockets `unref()` and no unbounded boot work (the sidecar exit-contract row stays until Phase 99); UAT items `### N.` at column 0 with inline `expected:` and `result:` opening with a status word; every task `<verify>` runs `npx prettier --check` over the exact written paths (check `--file-info` first, omit when every path is prettier-ignored).
- Say `/gsd-execute-phase` with a hyphen; dev launch is `pnpm tauri:dev` (never `tauri:dev:run`); `tauri dev` does not rebuild the sidecar (rebuild before live-testing backend changes, `pnpm build:sidecar`).
- Rust tests must pass on Windows: join path segments one at a time; never panic out of `did_finish_launching` on a setup error (the reaper-spawn failure must log and continue).
- GSD commit commands sweep dirty `.planning`; use `--files` to scope.
- Orient with `graphify query`; do not read `graphify-out/GRAPH_REPORT.md` or `graph.json`. Run `graphify update .` after code changes.
- Edits to the repo outside a GSD workflow are not allowed; this research writes only the RESEARCH.md.

## Sources

### Primary (HIGH confidence, read this session)
- `src-tauri/src/relay_commands.rs`, `shell_state.rs`, `sidecar.rs` (lines 195-313, 600-660, 840-910), `main.rs` (754-789, 1697-1842), `shell_open.rs`, `steampoll_dispatch.rs`, `steamcm_dispatch.rs`, `depot_dispatch.rs:15`, `ipc_contract.rs` (header, 14-19, 520, 766)
- `src-tauri/crates/gamelib-steampoll/src/{host,runtime,monitor,profile}.rs`, `gamelib-depot/src/registry.rs`, `gamelib-steamcm/src/macowned.rs`, `gamelib-testutil/src/lib.rs`, `crates/README.md`, `src-tauri/Cargo.toml` / `Cargo.lock`, `src-tauri/src/wake_lock/linux.rs`
- `src/backend/process/{runner,registry,README}`, `quitHandler.ts`, `commandRunner.ts`, `host/{openExternal,appInfo}.ts`, `sidecar/{shellFilesFlowRegistration,appShellFlowRegistration,openPolicy,sidecarRpc,ipcValidation}.ts`, `common/types/sidecarTransport.ts`, `common/types/ipc/{channelSchemas,schemaTypes,shellFiles,appShell}.ts`, `preload/{tauriTransport,ipc,ipcValidationError}.ts`, `frontend/bootErrorSurface.ts`, `meta/genIpcContract.ts`
- Census tests: `ipcDomainCensus.test.ts`, `flowRegistrationCensus.test.ts`, `ipcSchemaCoverage.test.ts`; `.husky/pre-commit`, `.github/workflows/{rust-test,codecheck}.yml`
- `.planning/research/v0.11/{SUMMARY,ARCHITECTURE,PITFALLS,STACK}.md`; `.claude/skills/gamelib-conventions/SKILL.md`; completed todos on nettop and sidecar orphans
- libuv `src/win/process.c` (job and breakaway comments, fetched) [CITED: github.com/libuv/libuv/blob/v1.x/src/win/process.c]
- man7.org `PR_SET_PDEATHSIG(2const)` [CITED: man7.org/linux/man-pages/man2/PR_SET_PDEATHSIG.2const.html]
- `gsd-tools query package-legitimacy check` (crates), scratchpad scan of `RENDERER_CHANNELS` vs registrations

### Secondary (MEDIUM confidence)
- v0.11 research documents (milestone-level design, not code-verified per claim)

### Tertiary (LOW confidence, flagged in the Assumptions Log)
- Wine/macOS signal and session behaviour, LaunchServices behaviour of a re-exec'd process, kqueue `NOTE_EXIT` on a non-child pid, OS logout timing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new external crates, versions read from the lockfile
- Architecture (router, generator, census): HIGH, read directly from code and tests
- Process mechanism: MEDIUM, design proposals whose key claims (reaper kills in time, Dock invisibility, Windows breakaway) the harness and live gate must prove
- Pitfalls: HIGH for repo-derived ones, MEDIUM for Wine/SIGPIPE items

**Research date:** 2026-11-20
**Valid until:** 2026-12-04 (14 days; Phase 82 is actively changing the census numbers and `rust-test.yml`, so re-measure counts at planning time)
