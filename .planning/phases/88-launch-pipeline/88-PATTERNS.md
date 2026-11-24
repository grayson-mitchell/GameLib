# Phase 88: Launch pipeline - Pattern Map

**Mapped:** 2026-11-24
**Files analyzed:** 22 (new/modified file groups; crate internals follow RESEARCH "Recommended Project Structure", names are discretion)
**Analogs found:** 20 / 22 (two partial, see "No Analog Found")

All analog paths below were verified present via `git ls-files` (tracked source). None are `.gsd/capabilities` mirrors.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/crates/gamelib-launch/` (builders, runner, game, funnel) + `Cargo.toml` | service crate | request-response + event-driven | `src-tauri/crates/gamelib-wine/` (`Cargo.toml`, `src/wine_cmd/{env,command,prefix}.rs`) | exact (same layering rule, extends it) |
| `src-tauri/crates/gamelib-knownfix/` | service crate | file-I/O + CRUD + network fetch | `src-tauri/crates/gamelib-wine/src/runtimes.rs`, `.../tools/dxvk.rs` (fetch + archive + guarded replace) | role-match |
| `gamelib-launch/src/funnel/hooks.rs` (`ManagerHooks`) | trait/seam | request-response (Rust asks TS) | `gamelib-engine/src/launch/step.rs` `StepDeps` trait + `CtxStepDeps` | role-match |
| `gamelib-launch/src/game/spawn.rs`, `registry.rs`, `kill.rs`, `record.rs`, `readopt.rs` | service | event-driven / file-I/O | `gamelib-proc/src/spawn.rs` (`spawn_game`), `probe.rs`, `kill_tree.rs`, `gamelib-engine/src/launch/watch.rs` | role-match |
| `gamelib-proc` extensions (Windows game job, Windows `start_time`, game tree kill) | utility | event-driven | `gamelib-proc/src/{job,probe,kill_tree}.rs` | exact (same files) |
| `gamelib-launch/src/runner/call_runner.rs` (streaming) | service | streaming | `gamelib-proc/src/spec.rs` `SpecProcRunner` + `gamelib-wine/src/wine_cmd/command.rs` | exact |
| `gamelib-info/src/sysinfo/` (GPU, pci_ids caches) | service | request-response | `gamelib-info` (86 leaf crate) | role-match |
| `gamelib-launch-cli/` (+ `gamelib-knownfix-cli`) | cli | request-response | `src-tauri/crates/gamelib-wine-cli/src/main.rs` | exact |
| `src-tauri/src/launch_dispatch.rs` | shell glue | request-response, boot task | `src-tauri/src/wine_dispatch.rs` (+ `engine_dispatch.rs`) | exact |
| `src-tauri/src/main.rs` edits (`LONG_RUNNING_CHANNELS`, install call) | config | n/a | `main.rs:211` list | exact |
| `src/backend/sidecar/sidecarRpc.ts` edit (`UNBOUNDED_RUST_CHANNELS`) | config | n/a | `sidecarRpc.ts:228` | exact |
| `src/common/types/sidecarTransport.ts` (new `RUST_LAUNCH_*` consts) | config | n/a | `RUST_WINE_RUNTIME_DOWNLOAD` (`:1074`, list `:1760`) | exact |
| `src-tauri/src/ipc_contract.rs` (generated `RustInvokeChannel` arms) | generated | n/a | `"wine_runtime_download"` arms (`:548`, `:742`, `:3348`) | exact (regenerate) |
| TS shims (`src/backend/launchrust/*.ts`: launcher members, `callRunner`, known-fix) | shim | request-response / streaming | `src/backend/enginewine/runtimes.ts` | exact |
| `src/backend/__tests__/launchShimSchedule.test.ts` (or rows added to `engineWineShimSchedule.test.ts`) | test | n/a | `src/backend/__tests__/engineWineShimSchedule.test.ts` | exact |
| `src/backend/__tests__/launchPortComplete.test.ts` | test (delete gate) | n/a | `src/backend/__tests__/engineWinePortComplete.test.ts` | exact |
| `src/backend/testUtils/launchOracle/` (recorder, pairwise generator) | test util | batch/transform | `src/backend/testUtils/engineWineOracle/{harness,spawnTrace,treeSnapshot}.ts` | exact |
| `src/backend/launcher/__tests__/oracle/launch*.oracle.test.ts` | test | transform | `src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts` | exact |
| `gamelib-launch/tests/golden_*.rs`, `incidents_*.rs`, `stub_game.rs` | test | transform / spawn | `gamelib-wine/tests/golden_wine_core.rs`, `dxvk_incidents.rs` | exact |
| `gamelib-proc/src/bin/standin.rs` + `tests/orphans.rs` (extend for game kill / readopt) | test harness | event-driven | same files | exact |
| `.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts`, `src/backend/__tests__/cargoFeatures.test.ts` (`EXPECTED_LOCKFILE_CRATE_NAMES`), `src-tauri/Cargo.toml` workspace | config | n/a | the 87 `gamelib-wine` / `-wine-cli` entries in each | exact |
| `88-HUMAN-UAT.md`, amendment to `82-STATE-OWNERSHIP.md` | doc | n/a | `87-HUMAN-UAT.md` (item shape per CLAUDE.md UAT rule) | role-match |

## Pattern Assignments

### New crate `gamelib-launch` (service, request-response + event-driven)

**Analog:** `src-tauri/crates/gamelib-wine/Cargo.toml` (lines 1-30) and `gamelib-wine/src/wine_cmd/command.rs`

**Cargo layering to copy** (`gamelib-wine/Cargo.toml:14-30`):
```toml
# May depend on `gamelib-engine`; `gamelib-engine` never depends on this crate (D-04).
gamelib-engine = { path = "../gamelib-engine" }
gamelib-core = { path = "../gamelib-core" }
gamelib-store = { path = "../gamelib-store" }
gamelib-proc = { path = "../gamelib-proc" }       # Every child process goes through gamelib-proc
gamelib-safety = { path = "../gamelib-safety" }   # guarded deletes
gamelib-i18n = { path = "../gamelib-i18n" }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "time", "sync", "process", "fs", "io-util"] }
tokio-util = "0.7"
```
`gamelib-launch` depends on `gamelib-wine` and `gamelib-engine` (one-way), no `tauri`, no `keyring`, no environment reads. Add `gamelib-log`, `gamelib-info`, `gamelib-knownfix`. Dev-dependency `gamelib-testutil` for `FakeHome`. New deps only from the locked set (shlex becomes direct; flate2, sha2, libc, windows-sys already locked).

**Extend, never re-port (87 D-22).** The funnel calls these in-process (RESEARCH "The 87 API 88 calls in-process"): `gamelib_engine::launch::step::select_engine_for_launch(ctx, deps, &SelectArgs) -> SelectReply` (`step.rs:410`), `end_engine_launch` (`:904`), and `gamelib_wine::wine_cmd::{env::{setup_env_vars, build_wine_env_vars}, command::run_wine_command, prefix::verify_wine_prefix, valid::valid_wine}`. The `command.rs` header states the launch variant is 88's ("A launched game's wine is not spawned here (Phase 88)").

**Context pattern** (from `golden_wine_core.rs:11-29` imports, the shape of every replay test):
```rust
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
```
Construct a `LaunchCtx` the way `WineCtx::new(Arc<EngineCtx>, runtime_path)` does (see `wine_dispatch.rs install`, below): a thin context holding the engine ctx plus the launch tables (single-flight, running-game registry), so tests substitute `ScriptedSpecRunner` for the spawn seam.

**Log rule** (`gamelib-engine/src/sinks.rs:28-29`, via RESEARCH): a log line is fixed text; never a URL, query, header, token or profile path. gamelib.log is uploaded publicly. Per-game log lines (the `Game Settings:` JSON etc.) go through `gamelib-log` `LogTarget::Game { app_name, runner, kind }` (`gamelib-core/src/paths.rs:170-179`, `gamelib-log/src/writer.rs:94-98`), a different sink from gamelib.log.

---

### `gamelib-launch/src/funnel/hooks.rs` `ManagerHooks` (D-26) (seam, request-response)

**Analog:** `gamelib-engine/src/launch/step.rs` `StepDeps` trait with production `CtxStepDeps` (`step.rs` around `:410`, `select_engine_for_launch(ctx, deps: &dyn StepDeps, args)`), and the test double `gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner}`.

Copy: a `dyn` trait of exactly the manager-owned calls (RESEARCH Pattern 1: `facts`, `launch`, `sync_saves`, `update_gog_playtime`, `set_presence`/`clear_presence`, `persist_bottle_wine_version`, `force_uninstall`, `get_settings`, settings write-back), a production impl in the shell that calls `SidecarState::invoke("<launch hook channel>", [op, args])`, and a fake for funnel tests.

**Transport facts the planner must honour (all in `src-tauri/src/main.rs`):**
- Rust->sidecar invoke is bounded by `timeout_for(channel)`; the `launch` hook spans a whole play session, so its channel goes in `LONG_RUNNING_CHANNELS` (`main.rs:211`). Run the blocked invoke on a dedicated thread.
- On sidecar EOF `drain_pending_invokes` fails every pending invoke with `sidecar closed before responding` (`main.rs:380-405`). The funnel parked in `hooks.launch` then gets an error while the Game-class child lives: hand it to the same exit watch re-adoption uses (RESEARCH Pattern 1), not a launch failure.
- Single-flight check precedes the first await (WR-03; TS at `launcher.ts:507-510`).
- The channel set test `src/backend/__tests__/longRunningChannels.test.ts` (`EXPECTED_LONG_RUNNING_CHANNELS`, line 44) and the `main.rs` loop test (`for channel in LONG_RUNNING_CHANNELS`, `main.rs:3177`) must both be updated with the new hook channel.

---

### `gamelib-launch/src/game/*` Game-class spawn, registry, kill, record, re-adoption (event-driven, file-I/O)

**Analog:** `src-tauri/crates/gamelib-proc/src/spawn.rs`

**Core Game-spawn pattern** (`spawn.rs:109-143`, the only allowed Game spawn):
```rust
pub fn spawn_game(mut cmd: Command, log: Option<&Path>) -> std::io::Result<Child> {
    cmd.stdin(Stdio::null());
    match log {
        Some(path) => {
            let out = std::fs::OpenOptions::new().create(true).append(true).open(path)?;
            let err = out.try_clone()?;
            cmd.stdout(Stdio::from(out)).stderr(Stdio::from(err));
        }
        None => { cmd.stdout(Stdio::null()).stderr(Stdio::null()); }
    }
    #[cfg(unix)] { /* pre_exec: libc::setsid() */ }
    cmd.spawn()
}
```
Use `log = Some(private capture file)` (D-29): `<launches>/<runner>-<appName>.out`, mode 0600. Rust tails it into the per-game log (`Entry::Raw`), the `onOutput` frames, and the bounded buffer for the legendary login-failure classifier. Never add a pipe variant to `gamelib-proc` (Pitfall 5).

**Helper spawn** (non-launch runner commands, scripts, probes, window raiser; `spawn.rs:~70-95`): `spawn_helper_tokio(&mut tokio::process::Command, label)` returns `(Child, HelperGuard)`; move the guard into the same task as the child. Or go through `SpecProcRunner` (below).

**Probe/kill primitives to extend** (liveness `gamelib_proc::probe::{is_alive, start_time}`, `kill_tree::{terminate_group, kill_process_group}`): D-08 matches records by pid AND start time. RESEARCH gaps for 88 to fill in `gamelib-proc`: Windows `start_time`, an explicit Game-tree kill on Windows, a Game job that is not kill-on-close, kill of a re-adopted game on unix by pgid. Add these next to `job.rs`, `probe.rs`, `kill_tree.rs`, not in `gamelib-launch`.

**Shutdown contract** (CLAUDE.md Rust spawns rule; example in `engine` ctx): hold a `gamelib_core::shutdown::global()` Registrant for the in-flight exit watch, exit work inside `ExitBudget::DEFAULT`, bound boot work for the re-adoption task, never `PR_SET_PDEATHSIG`, no hand-rolled kill.

**Test harness to extend:** `gamelib-proc/src/bin/standin.rs` (modes `parent|idle|tree|spec-tree|game|game-child|lines`, first statement `reaper::dispatch_if_requested()`) and `gamelib-proc/tests/orphans.rs`:
```rust
const POLL: Duration = Duration::from_millis(100);
const LIMIT: Duration = Duration::from_secs(15);
fn wait_until(what: &str, mut pred: impl FnMut() -> bool) { /* poll to deadline, assert */ }
struct Strays(Vec<u32>);   // Drop kills surviving game pids so CI never accumulates strays
```
Add a stand-in mode for "game that survives parent SIGKILL then is re-adopted/killed explicitly" and assert with `probe::is_alive` from the outside (independent of the code under test). Never sleep a fixed time.

---

### `gamelib-launch/src/runner/call_runner.rs` streaming runner (streaming)

**Analog:** `gamelib-proc/src/spec.rs` (`SpecProcRunner`, header lines 1-12 and `run` at 36-): one seam for every spawn (env, cwd, stdin text, capture cap, timeout, cancel token, per-line `on_line` sink), `spawn_helper_tokio` inside, `POST_EXIT_DRAIN`, `REAP_LIMIT`, `MAX_LINE`. Runner commands (install/update/list/auth) are Helper through `SpecProcRunner` with `on_line`; launches are Game through `spawn_game`.

Also copy from `gamelib-wine/src/wine_cmd/command.rs` the existing `run_wine_command` spec building, then close the three `deltas.json` entries (`chunked-output-and-log-writers`, `command-parts-not-mutated`, `track-and-resolve-on` in `gamelib-wine/tests/fixtures/golden/wine_command/deltas.json`).

**Ordering fact:** chunk frames and the invoke reply share the sidecar stdin pipe under one lock (`shell_state.rs` `write_raw`/`write_frame`), so write every `runnerOutput` frame before the reply; test with a transcript replay (D-14).

---

### `src-tauri/src/launch_dispatch.rs` (shell glue; request-response + boot task)

**Analog:** `src-tauri/src/wine_dispatch.rs` (2577 lines; read the header 1-70 and the three patterns below, do not load whole file)

**Header/imports pattern** (`wine_dispatch.rs:16-33`):
```rust
use super::*;
use std::sync::atomic::{AtomicBool, Ordering};
use gamelib_wine::ctx::WineCtx;
```
**One context set once, ready/not-ready answers** (`:35-62`):
```rust
static WINE_CTX: OnceLock<Arc<WineCtx>> = OnceLock::new();
pub(crate) fn wine_ctx() -> Option<&'static Arc<WineCtx>> { WINE_CTX.get() }
pub(crate) fn install(public_dir: Option<PathBuf>) {
    let Some(engine) = engine_dispatch::engine_ctx() else { return; };   // no home => every op not-ready
    let _ = WINE_CTX.set(Arc::new(WineCtx::new(Arc::clone(engine), runtime_path) ...));
}
```
Call `launch_dispatch::install()` in `run_setup` right after `wine_dispatch::install` (the 87 comment says `run_setup` builds engine then wine). An op before install answers `<channel>: not-ready` (`:1315-1316` test shape).

**Native channel handler** (`:149-157`):
```rust
pub(crate) fn download_runtime(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    runtime_channel("downloadRuntime", "wine_runtime_download", "<fixed failure literal>", args)
}
```
**rustInvoke arm** (`:836-842`): decode first with the generated serde args type (`WineRuntimeDownloadArgs::from_args(args)?`), then `rpc_wine_op(wine_ctx(), "<op>", args)`. A rejection is a fixed literal that never echoes input (T-87-17, T-87-65).

D-19: no fallback; the serde struct is the schema, the zod entry is deleted with the TS registration, regenerate the IPC snapshot / `ipc_contract.rs` (`"wine_runtime_download" => Some(RustInvokeChannel::WineRuntimeDownload)` at `:548`, reverse at `:742`, args decode `:3348`). Also add the new dispatch file to the file lists in `main.rs` tests (`"wine_dispatch.rs"` at `:2479`, `include_str!("wine_dispatch.rs")` at `:2543`).

---

### Channel registration (config)

**`LONG_RUNNING_CHANNELS`** (`src-tauri/src/main.rs:211`), each entry carries an inline rationale comment; membership is "MEASURED, not reasoned" per the doc comment. Add the manager-hook `launch` channel and the TS-facing `launch_run` entry with a comment. Update `src/backend/__tests__/longRunningChannels.test.ts` `EXPECTED_LONG_RUNNING_CHANNELS` in the same commit.

**`UNBOUNDED_RUST_CHANNELS`** (`src/backend/sidecar/sidecarRpc.ts:228`), array of `RUST_*` constants:
```ts
const UNBOUNDED_RUST_CHANNELS: readonly string[] = [
  RUST_DIALOG_OPEN, ..., RUST_DEPOT_JOB_RUN, ...,  // add RUST_LAUNCH_RUN, RUST_RUNNER_CALL, ...
```
Precedent: `depot_job_run`, `engine_fallback_ensure` (the doc comment above the array numbers each addition: "Seventeenth (Phase 87, 87-56a)..."; add "Eighteenth (Phase 88)"). `RUST_RUNNER_CALL` for every streaming runner call and launch joins it. Pinned by `src/backend/__tests__/dialogOptionForwarding.test.ts`.

**Transport constants** (`src/common/types/sidecarTransport.ts:1061-1074`, list `:1760`):
```ts
export const RUST_WINE_RUNTIME_DOWNLOAD = 'wine_runtime_download' as const
```
Add `RUST_LAUNCH_*` the same way and into the list at `:1760`.

**`EXPECTED_LOCKFILE_CRATE_NAMES`** (`src/backend/__tests__/cargoFeatures.test.ts:206`, comment `:162-180`, alphabetical string array at `:234` holds `"gamelib-wine", "gamelib-wine-cli"`). Add `gamelib-launch`, `gamelib-launch-cli`, `gamelib-knownfix`, `gamelib-knownfix-cli` in sorted position; the comment documents that only workspace crates are added when every dependency is already locked (match that: `cargo tree` shows no new third-party crate).

**Workspace + CI:** `src-tauri/Cargo.toml` (`gamelib-wine = { path = ... }` at `:28`; workspace members `:499-500` `"crates/gamelib-wine", "crates/gamelib-wine-cli"`); `.github/workflows/rust-test.yml:132-135` (explicit `-p` list, workspace crates are not default members; step name lists crates); mirror assertions in `meta/__tests__/rustTestWorkflow.test.ts` (`:68` regex for each `-p`, `:162` "multi-crate step tests ...", `:196-197` exact step-name strings, `:230-237` negative self-test). The step name is asserted verbatim, so edit workflow and test together. Follow `src-tauri/crates/README.md` section 8 (CI) and section 7 (verification and deletion).

---

### `gamelib-launch-cli` / `gamelib-knownfix-cli` (cli, request-response)

**Analog:** `src-tauri/crates/gamelib-wine-cli/src/main.rs` (150 lines) with `tests/cli.rs`.

Copy: the module header contract (`ops` prints op names; `op <name> <json-args> --user-data <dir> [--home <dir>] [--replay <case-dir>] [--now-ms <ms>]` runs one op via `dispatch_sync` on a context rooted in `<dir>`; exit 64 usage, exit 2 bad input; never reads the real profile; no `keyring`), the `usage()`/`bad()`/`flag()` helpers (`main.rs:31-50`), `FixedClock`, `Replay` fetch from `gamelib_engine::fetch`.

---

### TS shims (shim, request-response + streaming)

**Analog:** `src/backend/enginewine/runtimes.ts` (whole file, 38 lines)

```ts
import { RUST_WINE_RUNTIME_DOWNLOAD } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

export async function downloadRuntime(deps: RustInvokeDeps, name: RuntimeName): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_RUNTIME_DOWNLOAD, [name])
}
```
Rule: each shim body is one returned typed `requestRustInvoke` call whose arguments come from the shim's parameters (86 shape rule, `checkShimShape` in `src/backend/testUtils/infoPortGate.ts`). Make `setupEnvVars`, `setupWrapperEnvVars`, `setupWrappers`, `getKnownFixesEnvVariables` and `verifyWinePrefix` async shims (RESEARCH Pattern 2: every call site is already in an async function; object-spread sites become `...(await shim(...))`). If a resolver gathering TS-only inputs is needed, it is `const` declarations plus exactly one returned typed call, living beside `src/backend/sidecar/engineWineResolvers.ts` (D-23 shape).

Streaming runner shim: keep `commandRunner`'s TS signatures; `onOutput` via a `streamId` -> callback map fed by an `ipc.on` listener for ordered `runnerOutput` frames; `onSpawn(child)`/`child.kill()` via a `spawned` frame and a `runner_kill(spawnId)` op (RESEARCH Pattern 3). No precedent shim streams per-line output to TS; closest event-to-TS precedent is the `kind: "send"` frame (`engineSelectionChanged`) and `invoke_until` (depot poll host).

**Sync twin** for the five known-fix readers called synchronously by Steam code (87 D-24 shape): a synchronous TS copy pinned to Rust by shared vectors, schedule row of kind `twin` naming its `vectors` test file, `deletedBy` 89/97.

---

### `src/backend/__tests__/launchShimSchedule.test.ts` (or new rows in `engineWineShimSchedule.test.ts`)

**Analog:** `src/backend/__tests__/engineWineShimSchedule.test.ts` (1624 lines; header `1-80`, row interface `66-80`)

```ts
interface ScheduleRow extends ShimRow {
  name: string; file: string
  channel?: string          // shims/resolvers: the RUST_* constant its one typed call sends
  vectors?: string          // twins/views: test file that pins it to Rust; must import `file`
  wiring?: readonly string[]
  callers: readonly string[]  // repo-relative non-test files importing `file`
  deletedBy: number         // 87..99
}
const CHANNEL_PREFIXES = ['RUST_ENGINE_', 'RUST_WINE_'] as const   // add 'RUST_LAUNCH_', 'RUST_RUNNER_', 'RUST_KNOWNFIX_'
```
Discovery runs both directions (by file and name); floors via `assertAtOrAboveFloor` (`BACKEND_FILES_FLOOR = 400`; never lower); planted-violation self-tests keep every detector non-vacuous (82 D-05). Each `Launcher`-member shim row: `deletedBy` 91 or 92; manager-hook channel rows: 92; bridge known-fix shims: 97; `dispatchSteamLaunch` single-flight join shim: 90.

**Wave-0 task (RESEARCH):** the 13 existing `deletedBy: 88` rows must be re-read and each either deleted in the same commit as its last caller or re-scheduled: `isRuntimeInstalled`/`downloadRuntime` (launcher-only: delete), `installWineVersion`/`listWineReleases`/`wineReleasesInfoReady` (`utils.ts downloadDefaultWine`: ported in 88 per D-28), `validWine` (`utils.ts checkWineBeforeLaunch`: ported per D-28), `armEngineLaunchDeadline` (moves into the Rust funnel), `dxvkInstallRemove`/`winetricksInstallVerbs`/`winetricksListInstalled` (stale: the bridge `bridgeKnownFixes.ts` still imports them; re-schedule to 97), and twins `setupEnvVars`, `setupWineEnvVars` (`launcher.ts`), `createCommandRunner` (`commandRunner.ts`) deleted with their files. Importer lists (`LAUNCHER_IMPORTERS`, `ENGINE_TWIN_IMPORTERS`, lines 83-110) shrink in the same commit.

---

### `src/backend/__tests__/launchPortComplete.test.ts` (delete gate)

**Analog:** `src/backend/__tests__/engineWinePortComplete.test.ts` (header `1-60`); others: `infoPortComplete`, `loggerPortComplete` (root model, 82 D-05).

Copy: per-sub-slice `describe('<name>PortComplete', () => runSlice(SPEC))` built on `runSlice` from `backend/testUtils/portSliceGate` (`flagWalk, rustWalk, tsWalk, BACKEND_FILES_FLOOR, RUST_FILES_FLOOR, SCANNED_FILES_FLOOR`), `findExportedValues, findRustCalls, walkStripped, REPO_ROOT` from `infoPortGate`. Each describe fails if a deleted TS file returns, a deleted identifier appears in non-test code, a TS `ipc.handle`/`ipc.on` registers one of the slice's native channels, or a rollback flag appears. Add each sub-slice's describe RED first (files still exist), then delete TS and watch it go green; never lower a floor or widen an allow-list. D-18: forbid `GAMELIB_LAUNCH` (as `FORBIDDEN_FLAGS` at line 52 does for `GAMELIB_ENGINE`/`GAMELIB_WINE`), `noRollbackFlag` describe for the whole phase. End with a `launchSurvivors` describe comparing the survivor table to the schedule both ways (the `engineWineSurvivors` shape).

Sub-slices (RESEARCH ordering, discretion): knownfix, builders, commandRunner, funnel+single-flight, systeminfo, utils rows.

---

### `src/backend/testUtils/launchOracle/` and `*.oracle.test.ts` (golden recorder, D-11..D-14)

**Analog:** `src/backend/testUtils/engineWineOracle/harness.ts` (432 lines, header `1-62`), `spawnTrace.ts`, `treeSnapshot.ts`, `recorder.ts`; driver `src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts` (1019 lines, header `1-60`).

**Harness exports to import** (`wineCore.oracle.test.ts:38-57`):
```ts
import {
  assertManifest, expandPlaceholders, expectEmptyCasesToFail, loadCases, mockPlatform,
  normalisePaths, syncManifest, withEngineOracleProfile, writeOrCompareGolden,
  type EngineOracleProfile, type OraclePlatform, type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import { fixturesRoot, engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
```
**Fixture layout** (`harness.ts:14-26`): `golden/<slice>/{cases.json (hand-authored), deltas.json (hand-authored), MANIFEST.json {count,floor}, expected/<case>/{result,events,requests,spawns,tree}.json}`; placeholders `<HOME> <USERDATA> <APPFOLDER> <TOOLS> <TMP>` normalised so a Rust replay on any OS substitutes its own `FakeHome`; `<USERDATA>` and `<APPFOLDER>` deliberately differ. Modes: `GAMELIB_WRITE_ENGINE_GOLDEN=1` writes goldens FROM TS; default compares offline; goldens are never hand-typed or recorded from Rust. 88 reuses this harness (it is deleted with the 87 twins' vector test in the LAST plan, per `harness.ts` header). Extend `OraclePlatform` handling for D-13 (platform and probes injected: Linux gamescope/mangohud/gamemode/Proton/umu/Flatpak; Windows quoting, `.bat/.cmd`).

**D-12:** run with `process.env` replaced by `createFakeHomeProfile()` (`src/backend/testUtils/fakeHomeProfile.ts`) plus fixed `PATH`/`LANG`/`USER`; golden stores the full resulting env. **Two-profile rule (D-22):** harness spawns nothing itself; a case needing a real binary takes `createRealRunner()` (isolated by default); name any real-profile arm in a comment.

**Pairwise generator (new, in-repo, ~60 lines with a coverage assertion; no npm package):** no analog; see No Analog Found. Place beside the recorder and give it a floor and a self-test that plants a missing pair.

---

### `gamelib-launch/tests/golden_*.rs` and `incidents_*.rs` (Rust replay tests)

**Analog:** `src-tauri/crates/gamelib-wine/tests/golden_wine_core.rs` (1162 lines, header `1-67`), `dxvk_incidents.rs`, `golden_winetricks.rs`.

**Floor-per-replay pattern** (`golden_wine_core.rs:36-66`):
```rust
/// `wine_command` holds 16 cases.
const COMMAND_FLOOR: usize = 16;
fn fixtures() -> PathBuf { Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures") }
fn read_json(path: &Path) -> Value { serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}"))).unwrap_or_else(|e| panic!("{path:?}: {e}")) }
fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor { return Err(format!("{what}: scanned {count}, below the floor of {floor}")); }
    Ok(())
}
```
The floor lives in the Rust file next to the replay, so editing JSON alone cannot lower it; an empty list fails. `#[cfg(unix)] use gamelib_proc::spec::SpecProcRunner;` for real-spawn arms, `ScriptedSpecRunner` for scripted traces. Read `deltas.json` per case for documented Rust-side differences (D-19 of 87; a golden diff never mixes port with fix, 88 D-20). Redaction vectors (`getRunnerCallWithoutCredentials`: eight exact-element flags, PowerShell `-ArgumentList` branch, env diff) port from the TS tests as vectors; shlex parity gets its own vectors (RESEARCH assumption A2). Incident tests per D-15: `launcher_launchSingleFlight`, commandRunner abort/redaction, `knownFix*` layering/registry/overlay archive+install, `gamescopeCommand` help-probe forms. Windows replay must watch todo `2026-11-21-gamelib-log-golden-fails-on-windows-path-separator`.

**Stub-game smoke (`stub_game.rs`, D-16, 3-OS CI):** launch a stub binary through the real Rust launch op; use the `standin.rs` approach (a binary from the same crate with modes) so one test covers native-shaped launch, single-flight join, and quit-kill. Isolation via `gamelib_testutil::FakeHome`.

---

### `gamelib-knownfix` (service, file-I/O + network)

**Analog:** `gamelib-wine/src/runtimes.rs` and `tools/dxvk.rs` (archive fetch, sha256 pin, guarded replace) with the `gamelib_engine::fetch::{Fetch, ReqwestFetch, Replay}` seam (`fetch.rs:214-231`) and `gamelib-safety` for overlay removal; golden `golden_runtimes.rs`/`golden_dxvk.rs`/`golden_dxmt.rs` in `gamelib-wine/tests/` as replay shapes (recorded exchanges via `GAMELIB_EW_ORACLE=record`, `recorded/<slice>/<case>/exchanges.json`). Overlay archive: own strict ustar reader/writer over `flate2` + `sha2`, deterministic bytes; on-disk overlay state and fetched-fixes cache byte-compatible (87 D-07 shape; D-03).

---

### `gamelib-info/src/sysinfo/` (GPU info and pci_ids caches, moved here by 87 D-05)

**Analog:** the existing `gamelib-info` crate (86 leaf; already holds caches and `reqwest`) and its CLI `gamelib-info-cli` (`src/main.rs`, `src/drift.rs`, `tests/cli.rs`). Plan 1 of the info port reads the crate's op and golden layout before adding ops.

---

## Shared Patterns

### Spawns (every Rust spawn)
**Source:** `gamelib-proc/src/spawn.rs`, `spec.rs`
**Apply to:** all launch, runner, script, probe, window-raiser and kill code. `SpawnClass::Game` only for the game via `spawn_game`; everything else `SpawnClass::Helper` (`spawn_helper_tokio` or `SpecProcRunner`). A `Registrant` from `gamelib_core::shutdown::global()` for in-flight work; exit work inside `ExitBudget::DEFAULT`; bound boot work. Load `Skill("gamelib-conventions")` before planning (CLAUDE.md Conventions table).

### Fake-HOME isolation (two-profile rule)
**Source:** `src/backend/testUtils/fakeHomeProfile.ts` (TS) and `gamelib_testutil::FakeHome` (Rust)
**Apply to:** every test and harness that spawns or touches paths (never a hand-rolled `env` literal in `src/` or `meta/`; `fakeHomeIsolation.test.ts` enforces in-repo TS spawn sites). Name and justify any real-profile arm (pre/post scripts' HOME, per-game log location).

### Vacuous-pass guards (82 D-05)
**Source:** `src/backend/testUtils/censusFloor.ts` `assertAtOrAboveFloor`; `check_floor` in `golden_wine_core.rs`; planted-violation self-tests at the bottom of `engineWinePortComplete.test.ts`.
**Apply to:** every golden manifest, every gate walk, every schedule discovery. Never lower a floor.

### Native channel contract (83 D-04/D-06/D-07, 88 D-19)
**Source:** `wine_dispatch.rs` + `ipc_contract.rs` + `sidecarTransport.ts`
**Apply to:** every new channel: serde struct is the schema, zod entry deleted with TS registration, IPC snapshot regenerated, fixed-literal rejections that never echo input, `not-ready` before `install`, no sidecar fallback.

### No rollback flag (87 D-06, 88 D-18)
**Source:** `FORBIDDEN_FLAGS` and `noRollbackFlag` in `engineWinePortComplete.test.ts`. Forbid `GAMELIB_LAUNCH` under `src/` and `src-tauri/src` from the first commit.

### Todo triage frontmatter (D-20, D-29 resume todo, the SIGKILL todo update)
**Source:** CLAUDE.md Conventions row 1: every file created in `.planning/todos/pending/` carries `severity:`, `platform:`, `ready:` bare, lowercase, in that order; `pnpm planning-gates` checks. The `/gsd-add-todo` template omits them.

### `<verify>` and UAT shape
`npx prettier --check` over exact written paths after `--file-info` (`.planning`, `public/locales/`, `.claude`, `graphify-out` are ignored: omit the check there). `88-HUMAN-UAT.md` items: `### N.` heading at column 0, `expected:` inline, `result:` opening with a bare or bracketed status word; model the four D-17 items on `87-HUMAN-UAT.md`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| pairwise generator + coverage assertion (`launchOracle`) | test util | transform | No pairwise/combinatorial generator exists in the repo; write it in-repo (RESEARCH rejected an npm dependency), with a floor and a planted-gap self-test |
| streaming-output shim (`runnerOutput` frames -> `onOutput`) | shim | streaming | No existing TS shim consumes a per-line stream from a Rust op; closest are the `kind:"send"` frame (`engineSelectionChanged`) and `invoke_until`, see RESEARCH Pattern 3. Needs a plan-time spike |
| capture-file tailer + re-adoption record/boot matcher | service | file-I/O + event-driven | `spawn_game` and `probe` exist but nothing tails a file or persists a pid+start-time record; new design per RESEARCH Pattern 4, D-08 |
| `ManagerHooks` sidecar impl (Rust-initiated long TS invoke) | seam | request-response | `SidecarState::invoke` and `LONG_RUNNING_CHANNELS` exist, but no existing Rust->TS hook spans a whole play session; RESEARCH flags it a costly checkpoint (D-26) |

## Metadata

**Analog search scope:** `src-tauri/crates/{gamelib-wine,gamelib-wine-cli,gamelib-engine,gamelib-proc}`, `src-tauri/src/{wine_dispatch,engine_dispatch,relay_commands,main}.rs`, `src/backend/{enginewine,testUtils,__tests__,wine/__tests__/oracle}`, `src/backend/sidecar/sidecarRpc.ts`, `src/common/types/sidecarTransport.ts`, `.github/workflows/rust-test.yml`, `meta/__tests__`.
**Files scanned:** about 30 read in part (large files by targeted ranges); `git ls-files` used for tracked-source verification.
**Notes:** Prerequisites before coding per RESEARCH: 87-61 (shell `EngineLog`), 87-63 (offline gate fix, edits `launcher.ts`), 87-64 (env.rs), 87-65. Line numbers in `launcher.ts` differ from CONTEXT (87 edited it; now ~1733 lines).
**Pattern extraction date:** 2026-11-24
