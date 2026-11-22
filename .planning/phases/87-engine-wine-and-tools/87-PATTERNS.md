# Phase 87: Engine, Wine and tools - Pattern Map

**Mapped:** 2026-11-23
**Files analyzed:** 34 new/modified file groups
**Analogs found:** 31 / 34 (all analog paths verified git-tracked; none is a `.gsd/capabilities` mirror)

Primary analog for everything Rust is the Phase 86 `gamelib-info` crate (+ `-cli`, `info_dispatch.rs`, TS `src/backend/info/*` shims, `infoShimSchedule.test.ts`, `infoPortComplete.test.ts`). Secondary: `gamelib-steamcm/src/macowned.rs` (spawn), `gamelib-safety/src/remove.rs` (delete), `gamelib-testutil` (FakeHome), `gamelib-store` (version gate / ordered JSON).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src-tauri/crates/gamelib-engine/Cargo.toml` | config | n/a | `gamelib-info/Cargo.toml` | exact |
| `gamelib-engine/src/lib.rs` (dispatch, OPS, guarded, dispatch_sync) | service/dispatch | request-response | `gamelib-info/src/lib.rs` | exact |
| `gamelib-engine/src/ctx.rs` (EngineCtx) | config/ctx | DI | `gamelib-info/src/ctx.rs` | exact |
| `gamelib-engine/src/fetch.rs` (Fetch + Replay) | service | streaming + replay | `gamelib-info/src/http.rs` | role-match |
| `gamelib-engine/src/{decision,crossover,bottles,fallback,state,launch}/**` | service | CRUD / event-driven / file-I/O | `gamelib-info/src/{recent,overrides,anticheat}.rs` (store + file + events); TS owners in `src/backend/engine/*` | role-match |
| `gamelib-engine/src/bottles/{marker,gate}.rs` | model/file | file-I/O (byte-compat) | `gamelib-store` `json::Obj`, `version_gate`; TS `stores/bottleVersionGate.ts` + `engine/engineSwitch.ts` | role-match |
| `gamelib-engine/src/bottles` remove / prune / sweep | service | destructive file-I/O | `gamelib-safety/src/remove.rs` (`check_removal`, `remove_tree`) | exact |
| `gamelib-engine/src/crossover/{demo_status,run_tool}.rs`, `launch/watch.rs` (spawns) | service | request-response (spawn) | `gamelib-steamcm/src/macowned.rs:165-183` + `gamelib-proc/src/spawn.rs:88` | exact |
| `gamelib-engine/src/launch/dialogs.rs`, `state/publish.rs`, `fallback/progress.rs` | service | pub-sub (emitter) | `gamelib-core/src/emitter.rs` + `info_dispatch.rs` `TrayRecentSink` | role-match |
| `gamelib-engine-cli/**` | cli | request-response | `gamelib-info-cli/src/main.rs` (+ Cargo.toml) | exact |
| `gamelib-wine/**` (Cargo, lib, ctx) | service | request-response | `gamelib-info` (same) | exact |
| `gamelib-wine/src/wine_cmd/**`, `discovery/**` (OQ1/OQ2, D-22) | service | request-response (spawn) | no Rust analog; TS `commandRunner`, `launcher.ts` env builders, `utils/compatibility_layers.ts` | partial |
| `gamelib-wine/src/tools/**`, `winetricks/**` | service | batch / queue / spawn | TS owners `tools/index.ts`, `winetricksQueue.ts`; Rust: `gamelib-steampoll` (queue + events) | partial |
| `gamelib-wine/src/manager/**`, `runtimes.rs` | service | streaming download | `gamelib-info/src/anticheat.rs` download + `gamelib-depot` reqwest `stream` | role-match |
| `gamelib-wine-cli/**` | cli | request-response | `gamelib-info-cli` | exact |
| `src-tauri/src/engine_dispatch.rs`, `wine_dispatch.rs` | shell glue | request-response + native arms | `src-tauri/src/info_dispatch.rs` | exact |
| `src-tauri/src/rust_dispatch.rs` (`RustInvokeChannel::Engine*`/`Wine*` arms) | route | request-response | `rust_dispatch.rs:170-183` Info arms | exact |
| `src-tauri/src/native_router.rs` (slice `engine`/`wine`) | route | request-response | `native_router.rs:348-352,437-445` (`INFO_SLICE`) | exact |
| `src/common/types/ipc/nativeChannels.json` (+ regenerated IPC snapshot) | config | schema | `info` slice entries (`removeRecent`, lines ~365-445) | exact |
| `src/common/types/sidecarTransport.ts` `RUST_ENGINE_*`/`RUST_WINE_*` consts, `ipc/rustInvoke.ts` | config | schema | `RUST_INFO_RECENT_ADD` (sidecarTransport.ts:936, 1371, 1501; rustInvoke.ts:70) | exact |
| `src/backend/engine/*.ts` shims (bridge-used: bottlePrimitives twin, engineSwitch/Decision/State/runTool/launchDeadline shims) | shim | request-response | `src/backend/info/recentGames.ts` (all 28 lines) | exact |
| `src/backend/engine/bottlePaths.ts` pure twin + `engineSelectionView` (D-24) | utility | sync pure + write-through | `src/common/runnerCapabilities.json` pattern (shared vectors); TS `bottlePrimitives.ts:30-60` | role-match |
| `src/backend/sidecar/engineWineResolvers.ts` (D-23) | resolver | request-response | `src/backend/info/{anticheat,wiki}.ts` resolvers (D-24 shape) | role-match |
| `src/backend/__tests__/engineShimSchedule.test.ts` | test | gate | `infoShimSchedule.test.ts` | exact |
| `src/backend/__tests__/engineWinePortComplete.test.ts` | test | gate | `infoPortComplete.test.ts` (`runSlice`) | exact |
| `src/backend/testUtils/*` (reuse; add engine call finders if needed) | utility | scan | `testUtils/infoPortGate.ts`, `censusFloor.ts` | exact |
| TS golden recorders (engine/bottles/tools/wine) | test | record | `GAMELIB_WRITE_INFO_GOLDEN` (infoPortComplete:1019), `GAMELIB_WRITE_STORE_GOLDEN` (`stores/__tests__/storePolicyVectors.test.ts:36`) | role-match |
| `gamelib-engine/tests/golden_*.rs` + `tests/fixtures/golden/<slice>/{cases.json,MANIFEST.json,expected/<case>/}` | test | replay | `gamelib-info/tests/golden_umu.rs`, `tests/wiki_golden/mod.rs`, `tests/fixtures/golden/anticheat/**` | exact |
| Cross-language vectors (`bottlePaths` twin, `engineSelectionView`) | test | vector | `gamelib-info/tests/regex_vectors.rs`, `storePolicyVectors.test.ts` | role-match |
| Registration: root `src-tauri/Cargo.toml`, `cargoFeatures.test.ts` `EXPECTED_LOCKFILE_CRATE_NAMES`, `.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts`, `crates/README.md` | config | n/a | Phase 86 `gamelib-info` registration (grep `gamelib-info` in each) | exact |
| `82-STATE-OWNERSHIP.md` amendment (D-05) | doc | n/a | 86 D-04/D-27 amendment in same file | exact |
| `sidecar/engineFlowRegistration.ts`, `wineToolsFlowRegistration.ts`, `runnerMiscFlowRegistration.ts` (trim) | deletion | n/a | 86 deletions gated by `infoPortComplete` `deleted` lists | exact |
| Live-gate UAT file (87-UAT / HUMAN-UAT) | doc | n/a | `59-HUMAN-UAT.md`, 61 HUMAN-UAT (CONTEXT canonical refs) | exact |

## Pattern Assignments

### `gamelib-engine/src/lib.rs` and `gamelib-wine/src/lib.rs` (dispatch)

**Analog:** `src-tauri/crates/gamelib-info/src/lib.rs`

Copy wholesale (lines 40-143, 162-177, 228-237): sorted `OPS`, `dispatch` -> `route` -> `guarded`, strict `decode`, `catch_unwind`-in-poll, crate-owned 2-worker runtime, `dispatch_sync` that answers `<op>:wrong-thread` inside a runtime.

```rust
pub async fn dispatch(op: &str, args: &[Value], ctx: &InfoCtx) -> Result<Value, String> {
    let Some(name) = OPS.iter().copied().find(|o| *o == op) else {
        return Err(format!("unknown op: {op}"));
    };
    guarded(name, ctx, route(name, args, ctx)).await
}
fn decode<T: serde::de::DeserializeOwned>(op: &str, args: &[Value]) -> Result<T, String> {
    let [arg] = args else { return Err(format!("{op}:bad-args")); };
    serde_json::from_value(arg.clone()).map_err(|_| format!("{op}:bad-args"))
}
pub async fn guarded<F>(op: &str, ctx: &InfoCtx, work: F) -> Result<Value, String> {
    let _registrant = ctx.shutdown.register("info");   // use "engine" / "wine"
    let token = ctx.shutdown.token();
    ...
    tokio::select! { biased; _ = token.cancelled() => Err(format!("{op}:shutdown")), done = &mut work => ... }
}
```
Op names: `engine_*` / `wine_*` (info used `info_*`). Arg structs `#[serde(deny_unknown_fields, rename_all = "camelCase")]` (D-14). Long-lived work (deadline timer, winetricks queue, fallback download) must hold its own `shutdown.register("engine-<what>")` for its real lifetime, as `spawn_sgdb_migration` does (lib.rs:196-226) with a bound constant.

### `Cargo.toml` for the four new crates

**Analog:** `gamelib-info/Cargo.toml`, `gamelib-info-cli/Cargo.toml`

Tauri-free, comment every dependency with its reason, `[features] testing = []`, dev-dep self-reference with `testing`, `gamelib-testutil` + `tempfile` dev-deps, `[lints.clippy] dbg_macro = "deny", todo = "deny"`. Pins to copy: `tokio = { version = "1", features = ["rt-multi-thread","macros","time","sync"] }` (add `process`, `fs`, `io-util` as needed), `reqwest = { version = "0.13", default-features = false, features = ["rustls-no-provider", "stream"] }` (depot enables `stream`: `gamelib-depot/Cargo.toml:26`), `sha2 = "0.10"`, `regex = { version = "1", default-features = false, features = ["std","perf"] }` (spell `\s`, `\d` explicitly, 86 Pitfall 4). `gamelib-wine` may depend on `gamelib-engine` paths; `gamelib-engine` never on `gamelib-wine`. CLI: `gamelib-<x>-cli = { gamelib-<x> = { path, features = ["testing"] } }`.

### `gamelib-engine/src/ctx.rs` (EngineCtx) and `gamelib-wine/src/ctx.rs`

**Analog:** `gamelib-info/src/ctx.rs:1-80`

```rust
pub enum Platform { Mac, Linux, Windows }           // injected, crate never asks the OS
pub struct InfoPaths { app_folder, user_data, temp, public_dir }
pub trait InfoLog: Send + Sync { fn line(&self, text: &str); } // no URLs/keys in a line
pub struct InfoCtx {
    pub host: Arc<StoreHost>, pub clock: Arc<dyn Clock>, pub platform: Platform,
    pub paths: InfoPaths, pub shutdown: Shutdown, pub http: Arc<dyn Http>, ...
    pub log: Option<Arc<dyn InfoLog>>,
}
```
Engine adds: `proc`/spawn seam, `emitter: Arc<dyn FrontendEmitter>`, notify/dialog/display-ack/raise-window sinks (`Option`, no-op in `-cli`), `dxvk: Arc<dyn DxvkInstaller>` (D-25a; trait owned in gamelib-engine, implemented in gamelib-wine, injected by the shell), `i18n` Catalog. No env reads; `userHome`, toolsPath (`<appFolder>/tools`), platform arrive in ctx.

### Spawns (wine, wineserver, CrossOver probes, winetricks, tar, ps, plutil)

**Analog:** `gamelib-steamcm/src/macowned.rs:165-183`, `gamelib-proc/src/spawn.rs:88-107`

```rust
cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
let (child, _guard) = gamelib_proc::spawn::spawn_helper_tokio(&mut cmd, "mac-owned")
    .map_err(|_| FallbackReason::HelperFailed)?;
let out = match tokio::time::timeout(bound, child.wait_with_output()).await {
    Err(_) => return Err(FallbackReason::Timeout),   // drop => kill_on_drop
    Ok(Err(_)) => ...
```
Use `spawn_helper_tokio` with a `&'static str` label for every Helper (probes, tar, winetricks, DXVK steps, `callTool`, `runWineCommandForGame` per D-25c). Move the `HelperGuard` into the same future as the child. A launched game's wine/wineserver tree uses `gamelib_proc::spawn::spawn_game(cmd, Some(log))` (line ~110: setsid, null stdio, never registered) and is the only `Game` class. Note `gamelib_core::process::ProcessRunner` is only `run(program, argv, timeout)` + `spawn_streaming` (no env, cwd, stdin, abort): research says a richer `ProcSpec` (env, replace_env, cwd, stdin, abort, max_buffer) is needed and belongs in `gamelib-engine/src/spec.rs`, built on `spawn_helper_tokio`. Do not extend `gamelib-core`'s trait without checking its other implementers. No `PR_SET_PDEATHSIG`, no hand-rolled kill. Spawn tests use `gamelib_testutil::FakeHome` env (`ENV_KEYS`, testutil lib.rs:13); `demoStatus` is the one named real-profile arm (D-18).

### Destructive deletes (bottle removal, engine prune/sweep, wine-manager remove, runtime dir)

**Analog:** `gamelib-safety/src/remove.rs:374-421` (`check_removal(&Request, CaseMode) -> Reply`, `remove_tree(&Request, CaseMode) -> RemoveReply`)

`remove_tree` re-checks every target, deletes nothing unless overall verdict `Yes`, never follows links (`delete_location`). Pass an explicit trust root per call (CrossOver Bottles root; `<toolsPath>/steam-engines`; `<toolsPath>/wine`), never `fs::remove_dir_all`. "Unknown" refuses (D-19). Read `gamelib-safety/src/remove.rs` `Request`/`Target` field definitions and `crates/README.md` section 2b before writing the request builders. Research flags several unguarded `rmSync` in the TS: a parity port must still guard them (FND-02), recorded as a deliberate hardening, not a golden diff.

### On-disk byte-compatible state (marker, `.gamelib-pin.json`, `cxbottle.conf`, stores)

**Analogs:** `gamelib-store::json::Obj` (`Obj::insert_js`, `to_compact_bytes`; used in `gamelib-info-cli/src/main.rs` import `gamelib_store::json::to_compact_bytes`), `gamelib_store::version_gate::version_gate`, `src/backend/stores/bottleVersionGate.ts:1-40` (chains `ENGINE_MARKER_CHAIN = 'engine/gamelib-engine-marker'`, states absent/ok/unreadable/newer; writes refused on `newer` and on an unprimed path).

Rust calls `version_gate` in process before every marker write (no rustInvoke round trip). Marker key order: `kind, id, wineserverBin, [dxvk], version`; compact JSON; mode 0644; tmp `.gamelib-engine.json.tmp-<pid>` then rename. Use `Obj`, never `serde_json::Value`, for byte-compared output. Notices (`steam_engine_notices`) and `wine-downloader-info` go through `ctx.host` (StoreHost) via a `CacheView`-style helper: copy `gamelib-info/src/cache_view.rs` (stores `__timestamp.<key>` semantics). The bottle "ledger" is in-memory only (research): a `Mutex<HashMap<..>>` in ctx, not a file.

### Fetch / downloads (fallback engine, wine-manager releases, runtimes)

**Analog:** `gamelib-info/src/http.rs` (trait `Http`, `ReqwestHttp`, `Replay`, `install_crypto_provider`, `axios_query`); `gamelib-info/src/anticheat.rs` download slice (hash compare, events); `gamelib-depot` for `reqwest` `stream` and `futures-util`.

Create `Fetch` with a `Replay` that pins every request to its recorded twin and fails on unmatched/leftover exchanges (info-cli `--replay`). Anti-patterns: `.without_url()` before logging a `reqwest::Error`; no query via `reqwest::query()`. Progress: emit through `ctx.emitter.emit("gameStatusUpdate", vec![json!({"appName","runner","status":"engine-download","context":"downloading:<n>"})])` etc. exactly as `pinnedEngineProgress.ts` (D-10); goldens pin the sequence, tolerate frequency.

### `gamelib-engine-cli` and `gamelib-wine-cli`

**Analog:** `gamelib-info-cli/src/main.rs:1-70`

Same subcommands: `ops`, `op <name> <json-args> --user-data <dir> [--replay <case-dir>] [--now-ms <ms>]`; `FixedClock(u64)` implementing `Clock`; exit 64 usage, exit 2 bad input/op error; build ctx with `SystemClock`/`FixedClock`, `Shutdown`, `StoreHost`, fake-HOME only (CLI never reads the real profile; sinks are `None`). Add `--ndjson` only if the research recommendation is kept. No live `drift` subcommand needed unless the planner wants a GitHub/lutris shape check.

### `src-tauri/src/engine_dispatch.rs`, `wine_dispatch.rs`

**Analog:** `src-tauri/src/info_dispatch.rs` (header 1-60, `recent_add_with` ~234-250)

```rust
static INFO_CTX: OnceLock<Arc<InfoCtx>> = OnceLock::new();
pub(crate) fn info_ctx() -> Option<&'static Arc<InfoCtx>> { INFO_CTX.get() }
pub(crate) fn rpc_info_recent_add(args: &[Value]) -> Result<Value, String> {
    recent_add_with(installed("info_recent_add")?, args)   // "<op>:not-ready" before install
}
// inside: InfoRecentAddArgs::from_args(args)?; gamelib_info::dispatch_sync("info_recent_add", args, ctx)
```
One `Arc<EngineCtx>` built in `run_setup` after StoreHost opens, using `SystemClock`, `gamelib_core::shutdown::global()`, the shell's `FrontendEmitter` (copy `TrayRecentSink`'s shape for the notify/dialog/raise-window sinks; tests inject closures so no `AppHandle` is needed). Nothing spawns or waits at build time. Engine-state boot step moves to a bounded Rust boot task (copy `spawn_sgdb_migration` + a `*_BOUND` constant). Never format an argument into a log line or error (T-28-04/T-86-15). Include a `-> not-ready` unit test like info_dispatch.rs:1212-1236.

### `rust_dispatch.rs`, `native_router.rs`, `ipc_contract.rs`, `nativeChannels.json`

**Analogs:** `rust_dispatch.rs:170-183` (`RustInvokeChannel::InfoRecentAdd => rpc_info_recent_add(args)`), `native_router.rs:348-352,437-445`, `ipc_contract.rs:149`, `nativeChannels.json` ~365-445.

Native channels (research table: `listEngineOptions`, `getDefaultEngine`, `getPerGameBottleName`, `dismissEngineNotice`, `installWineVersion`, `refreshWineVersionInfo`, `removeWineVersion`, `getAlternativeWine`, `wine.isValidVersion`, `isRuntimeInstalled`, `downloadRuntime`, `winetricksQueueState`, `winetricksCancelRemaining`) get `"kind": "invoke"`, `"slice": "engine"|"wine"`, typed `args`, `returns`, and `valid`/`invalid` vectors:
```json
"removeRecent": { "kind": "invoke", "slice": "info",
  "args": [{ "name": "appName", "type": "string", "maxLength": 1024, "maxLengthUnit": "utf16" }],
  "returns": "void", "valid": [["abc"]], "invalid": [[], [1], ["a","b"], [""]] }
```
Registration in router: `invoke.insert("removeRecent", info_dispatch::remove_recent);`. After editing, run `pnpm gen:ipc-contract` and `pnpm check:ipc-contract`; zod entries in `src/common/types/ipc/{engine,wineTools,runnerMisc}.ts` for native channels are deleted with the TS registration (D-14). Resolver channels (`getEngineState`, `winetricksApply/Available/Installed`, `toggleDXVK/NVAPI/VKD3D`, `runWineCommand`, `runWineCommandForGame`, `callTool`) keep zod entries and reach Rust through `rustInvoke` consts.

### TS shims for bridge/launcher callers

**Analog:** `src/backend/info/recentGames.ts` (all)

```ts
import { RUST_INFO_RECENT_ADD } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
export async function addRecentGame(deps: RustInvokeDeps, game: Pick<GameInfo,'app_name'|'title'|'runner'>): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_RECENT_ADD, [
    { appName: game.app_name, title: game.title, runner: game.runner }
  ])
}
```
Body = exactly one returned typed `requestRustInvoke` call whose arguments derive only from parameters (D-06 shape rule enforced by `checkShimShape`). Add `RUST_ENGINE_*` consts to `sidecarTransport.ts` (three places per `RUST_INFO_RECENT_ADD`: def ~936, two lists ~1371, ~1501) and import in `common/types/ipc/rustInvoke.ts:70`. Per-symbol shape decisions (sync twin vs async shim vs view) are in RESEARCH "Sync call-site count"; the twin/view survivors are D-24. `AbortSignal` for `RunTool` cannot cross rustInvoke: shim registers a cancel id and calls `engine_run_tool_cancel` on abort.

### D-23 resolvers: `src/backend/sidecar/engineWineResolvers.ts`

**Analog:** resolvers in `src/backend/info/{wiki,anticheat}.ts` (D-24 of 86). Shape: `const` declarations whose names equal the schedule row's `inputs` (e.g. merged `GameSettings`), then exactly one returned typed `requestRustInvoke`. Registered with the existing `ipc.handle` pattern used by `engineFlowRegistration.ts`/`wineToolsFlowRegistration.ts`, which are deleted; each resolver is a schedule row `deletedBy: 98`.

### `engineShimSchedule.test.ts`

**Analog:** `src/backend/__tests__/infoShimSchedule.test.ts:1-140`

Reuse `checkShimShape`, `findExportedFunctions`, `findImporters`, `findRustInfoCalls`, `walkStripped` from `backend/testUtils/infoPortGate` (these are keyed to the `RUST_INFO_` prefix; parametrize or add `findRustCalls(prefix)` rather than copying the file; "names no slice of its own" is its stated design). Row:
```ts
{ name: 'addRecentGame', file: 'src/backend/info/recentGames.ts', shape: 'shim',
  channel: 'RUST_INFO_RECENT_ADD', callers: [...], deletedBy: 90 }
```
`deletedBy` is an integer 87..99 (here 88, 92, 95, 96, 97, 98). Both-direction equality with the discovered set; planted-violation self-tests; `BACKEND_FILES_FLOOR = 400` with `assertAtOrAboveFloor`. Rows needed: each shim, each D-23 resolver (98), the `bottlePaths` twin and `engineSelectionView` (96), `wine_releases_info_ready` shim.

### `engineWinePortComplete.test.ts`

**Analog:** `src/backend/__tests__/infoPortComplete.test.ts` (`SliceSpec`, `runSlice`, lines 1-120)

`SliceSpec { deleted, kept, forbiddenIdentifiers, identifierRoot, flag, manifestSlice, channelsFloor, storeRowKeys }`. One `describe('<name>PortComplete', () => runSlice(SPEC))` per sub-slice (engine decision+fallback+launch, bottles+ledger+switch, wine downloads, tools; D-06). Flag string `GAMELIB_ENGINE` must appear nowhere under `src/` or `src-tauri/src` (D-06). `manifestSlice: 'engine'|'wine'` asserts no TS `ipc.handle`/`ipc.on` for native channels. `deleted` lists include `sidecar/engineFlowRegistration.ts`, `sidecar/wineToolsFlowRegistration.ts`. Never lower a floor to go green. Other templates: `depotPortComplete`, `storeHostPortComplete`.

### Goldens: TS recorder and Rust replay

**TS recorder analog:** `GAMELIB_WRITE_INFO_GOLDEN` handling (`infoPortComplete.test.ts:~1019`), `GAMELIB_WRITE_STORE_GOLDEN=1` in `stores/__tests__/storePolicyVectors.test.ts:16-36`; fixtures redaction test `src/backend/info/__tests__/fixtureRedaction.test.ts`. Use `GAMELIB_WRITE_ENGINE_GOLDEN=1`. Spawn traces are new: wrap the TS `ProcessRunner.run`/`spawnAsync` seam. Filesystem trees on a TS `createFakeHomeProfile()` (`src/backend/testUtils/fakeHomeProfile.ts`).

**Rust replay analog:** `gamelib-info/tests/golden_umu.rs:1-40` and `tests/wiki_golden/mod.rs` (`ORACLE_NOW`, `golden_dir()`, `read_json`, `check_manifest(cases, manifest, FLOOR, &expected_folders)`, fixed clock, request tap, tree compare). Layout `tests/fixtures/golden/<slice>/{cases.json, MANIFEST.json, expected/<case>/{result.json,events.json,after/**}}`. Each suite: `const FLOOR`, a test that the committed MANIFEST is at or above FLOOR, one expected folder per case, and "an empty case list fails" (Phase 82 D-05). Every case injects `platform` and a `FakeHome` so the three-OS CI legs replay macOS logic. Copy `gamelib-info/tests/golden_*.rs` shape per sub-slice floors from RESEARCH (decision ~80, bottles ~70, tools ~35, winetricks ~60, ...). `wine/` goldens are committed first (D-08).

### Rust ports of TS incident tests

Port behaviourally (drop source-text gates): `engineSwitch.test.ts` (`legacyBottleUntouched`, sibling-safe removal), `dxvkInstallRemove`, `engineDecision.test.ts` inconclusive pre-flight, `gameProcessWatch` match forms, `winetricksApplyGuard`, `winetricksOutputClassifier`. Put as `#[cfg(test)]` or `tests/*.rs` in the owning crate, using `gamelib_testutil::FakeHome`.

### Cross-language vectors (D-24 twin)

**Analogs:** `gamelib-info/tests/regex_vectors.rs` (shared vectors Rust-side), `stores/__tests__/storePolicyVectors.test.ts` (Jest consumer of a shared vector file), `src/common/runnerCapabilities.json` (one shared data file read by both languages; replicate for `src/common/enginePins.json`, read in Rust by `include_str!`). Put one `bottlePathVectors.json` that Jest (`getBottleDir`, `sanitizeBottleName`, `isBottleProvisioned`, `buildFallbackGameSettings`) and a Rust test both load. Twin source: `bottlePrimitives.ts:30-60`:
```ts
export function getBottleDir(paths, bottleName) {
  return join(paths.userHome, 'Library/Application Support/CrossOver/Bottles', bottleName)
}
// sanitizeBottleName: trim; null on '' or any of '/', '\\', '..', '\0'
```

## Shared Patterns

### Results, not errors
**Source:** `gamelib-info/src/lib.rs:68-70`. `Err` only for unknown op, bad args, missing collaborator, shutdown, wrong thread, panic. Domain failures are `Ok` values with a kind/reason, matching the TS return shapes (`{status:'error'}`, `{kind:'refused'}`).

### Shutdown contract (Rust)
**Source:** `gamelib-info/src/lib.rs:127-143, 196-226`; `gamelib-proc`. `gamelib_core::shutdown::global()` Registrant for in-flight work, token raced in `select!`, exit work within `ExitBudget::DEFAULT`, bounded boot work. Load `Skill("gamelib-conventions")` before planning.

### Fake-HOME isolation
**Source:** `gamelib-testutil/src/lib.rs:13-40` (`ENV_KEYS`, `FakeHome::new(prefix)`, 0700); TS `testUtils/fakeHomeProfile.ts` `createFakeHomeProfile()`. Any `src/` or `meta/` child spawn uses it (fakeHomeIsolation gate). `demoStatus` real-profile arm named and justified.

### Strict schema, camelCase
**Source:** `InfoRecentAddArgs::from_args` in `info_dispatch.rs` (generated args struct) plus crate-level `decode`. `deny_unknown_fields`, no sidecar fallback (D-14).

### Registration checklist for new crates
**Source:** Phase 86 `gamelib-info` entries: `src-tauri/Cargo.toml` members and path deps, `src/backend/__tests__/cargoFeatures.test.ts` `EXPECTED_LOCKFILE_CRATE_NAMES`, `.github/workflows/rust-test.yml` `-p`, `meta/__tests__/rustTestWorkflow.test.ts`, `src-tauri/crates/README.md` recipe sections 1, 8. Grep `gamelib-info` in each to find the exact lines.

### Plan verify blocks
Per CLAUDE.md: `npx prettier --check <exact paths>`, after `--file-info` confirms the paths are not ignored (Rust and JSON fixtures may be ignored; say so and omit).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `gamelib-wine/src/wine_cmd/**` (env builders `setupEnvVars`/`setupWineEnvVars`, `validWine`, `runWineCommand`) | service | spawn + env build | No Rust wine/env code exists; port from TS `launcher.ts` env builders and `commandRunner.ts` (D-22). Use macowned.rs spawn pattern. |
| `gamelib-wine/src/discovery/**` | service | file/PATH scan | Nothing in Rust; port `utils/compatibility_layers.ts` (673 lines), default wine from PATH (D-25b). Nearest Rust is `gamelib-steamfiles` for macOS path probing style only. |
| `engineSelectionView` write-through (TS) | utility | sync in-memory mirror | No existing write-through view; needs the ownership amendment (D-24) and cross-language vectors. |
| Rust-to-TS deadline callback (`engine_deadline_fired`) | event | pub-sub | Closest precedents are depot `ShellJobHost.emit` and steampoll wake events (`crates/README.md` section 10, `gamelib-steampoll/src/events.rs`); per-key callback map is new. |
| Streaming-with-cancel spawn (`ProcSpec` with abort and max_buffer) | utility | spawn | `ProcessRunner` lacks env/cwd/stdin/abort; define in gamelib-engine (see Spawns). |

## Metadata

**Analog search scope:** `src-tauri/crates/*`, `src-tauri/src/*_dispatch.rs` and router, `src/backend/{info,engine,stores,testUtils,__tests__}`, `src/common/types/ipc`.
**Files read:** about 14 (lib.rs, ctx.rs, info-cli main, info_dispatch header, spawn.rs, remove.rs, macowned.rs excerpt, schedule and port-complete tests, infoPortGate header, recentGames.ts, bottleVersionGate.ts, bottlePrimitives.ts, golden_umu.rs, wiki_golden/mod.rs).
**Tracked-source gate:** `git ls-files` confirmed for the engine, tools, wine TS owners and the infoShimSchedule/infoPortComplete tests and the gamelib-info fixtures; all other analogs are under tracked `src-tauri/` and `src/`.
**Pattern extraction date:** 2026-11-23
