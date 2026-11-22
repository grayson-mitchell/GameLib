# Phase 86: Pure leaf services - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 22 new or modified file groups
**Analogs found:** 19 / 22 (all paths below verified with `git ls-files`; none is a gitignored mirror)

Caveat: Phase 85's `StoreHost`, `storeMirrorSchedule` and `gamelib_store::host` are NOT shipped yet
(`gamelib-store/src` has atomic, backup, dotpath, engine, envelope, json, migrate, ops, schema, table
only; `git ls-files | grep MirrorSchedule` is empty). Per D-29, plan 1 re-reads the shipped host API.
The analogs below are for crate shape, dispatch, oracle and delete-gate, not for host calls.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src-tauri/crates/gamelib-info/{Cargo.toml,src/lib.rs,src/dispatch}` | service crate | request-response | `src-tauri/crates/gamelib-steampoll/{Cargo.toml,src/dispatch.rs}` | exact |
| `gamelib-info/src/{http,cache_view,secrets,ctx}.rs` (injected seams) | utility | request-response + CRUD | `gamelib-steampoll/src/{host,effects,testing}.rs` (trait + Recording fake); `gamelib-core/src/{clock,emitter}.rs` | role-match |
| `gamelib-info/src/{wiki,umu,crossover,itad,discounts,steamgrid}` | service | request-response (HTTP + cache) | `src-tauri/src/log_upload.rs` (reqwest client) + `gamelib-steamcm` facade | partial |
| `gamelib-info/src/{recent,overrides}.rs` | service | CRUD over StoreHost | `gamelib-store/src/{ops,json}.rs` | role-match |
| `gamelib-info/src/anticheat.rs` | service | file-I/O + HTTP | `src/backend/anticheat/utils.ts` (the TS being ported) | exact (source) |
| `gamelib-info/tests/{golden_*,requests_*,roundtrip_*}.rs`, `tests/fixtures/**` | test | batch golden replay | `gamelib-store/tests/{golden,corpus}.rs` + `gamelib-log/tests/fixtures/golden/{cases.json,expected/}` | exact |
| `src-tauri/crates/gamelib-info-cli/{src/main.rs,tests/cli.rs}` | cli | request-response | `gamelib-store-cli/src/main.rs`, `gamelib-steampoll-cli/{src/main.rs,tests/cli.rs}` | exact |
| `src-tauri/src/info_dispatch.rs` (rustInvoke arms + native handlers + InfoCtx) | controller | request-response | `src-tauri/src/steamcm_dispatch.rs`, `src-tauri/src/log_dispatch.rs` | exact |
| `src-tauri/src/{rust_dispatch.rs,ipc_contract.rs,native_router.rs}` (register) | route | request-response | the `steampoll_*` arms (`rust_dispatch.rs:98-132`, `ipc_contract.rs:390,516`); `native_router.rs:253-311` | exact |
| `src/common/types/ipc/nativeChannels.json` + `rustInvoke.ts` entries | config/schema | request-response | `logError` / `getLogContent` entries (`nativeChannels.json:3-60`) | exact |
| `src-tauri/src/{tray/recent.rs,sidecar.rs}` (D-08: delete sniff, emit from Rust) | controller | event-driven | in place: `sidecar.rs:475-515`, `tray/recent.rs:260,431`, `tray.rs:142` | exact (modify) |
| Rust `SecretSource` impl + dev vault + SGDB migration (shell) | service | CRUD | `src-tauri/src/keyring_dispatch.rs`; TS `sidecar/devSecretVault.ts`, `steamgrid/secretStore.ts` | role-match |
| `src-tauri/build.rs` + `release-tauri.yml` (baked ITAD key) | config | build | none in Rust; TS `meta/esbuildWorkerBundleShared.ts:85` | no analog |
| TS shims / resolvers (`launcher.ts`, `launchDispatch.ts`, `sideload/games.ts`, gog/nile/legendary, `nonesteamgame.ts`, gamedetails) | service | request-response | `src/backend/host/{appState,notifications}.ts` (typed `requestRustInvoke` call); `host/rustInvokeDeps.ts` | role-match |
| `src/backend/info/__tests__/infoOracle.test.ts` + recorder | test | batch | `src/backend/stores/__tests__/storeOracle.test.ts` | exact |
| `src/backend/__tests__/infoPortComplete.test.ts` | test | gate | `src/backend/__tests__/loggerPortComplete.test.ts` | exact |
| `src/backend/__tests__/infoShimSchedule.test.ts` | test | gate | 85's `storeMirrorSchedule` (not yet shipped); fall back to `loggerPortComplete` shape | partial |
| `src/backend/testUtils/censusFloor.ts` usage in goldens | utility | guard | `src/backend/testUtils/censusFloor.ts` (reuse as is) | exact |
| Registration checklist: workspace `Cargo.toml`, `.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts`, `src/backend/__tests__/cargoFeatures.test.ts`, `src-tauri/crates/README.md` | config | n/a | the 84-02 / 85-06 additions; `85-PATTERNS.md` | exact |
| Deleted TS: `wiki_game_info/`, `crossover_index/`, `storeSearch/`, `discounts/`, `anticheat/utils.ts`, `recent_games/`, `game_overrides/`, `steamgrid/`, `images_cache.ts`, registrations in `sidecar/enrichmentFlowRegistration.ts` | delete | n/a | `loggerPortComplete.test.ts` DELETED list | exact |
| `.planning/phases/82-.../82-STATE-OWNERSHIP.md` amendment (D-04, D-27) | doc | n/a | prior amendments in that file | role-match |
| `86-HUMAN-UAT.md` | doc | n/a | other `*-UAT.md` (CLAUDE.md UAT row shape) | role-match |
| quirk todos in `.planning/todos/pending/` | doc | n/a | any existing pending todo; add `severity:`, `platform:`, `ready:` by hand | role-match |

## Pattern Assignments

### `gamelib-info` crate scaffold (service crate, request-response)

**Analog:** `src-tauri/crates/gamelib-steampoll/Cargo.toml` and `src/dispatch.rs`.

**Cargo.toml shape** (steampoll Cargo.toml, whole file ~50 lines): `edition = "2021"`, `rust-version = "1.77.2"`, `publish = false`, `[lib] path = "src/lib.rs"`, path deps on `gamelib-core` (add `gamelib-store`), `tokio`, `serde`, `serde_json`; a `testing` feature for the fake host; and:
```toml
[features]
testing = []
[dev-dependencies]
gamelib-info = { path = ".", features = ["testing"] }
tempfile = "3"
[lints.clippy]
dbg_macro = "deny"
todo = "deny"
```
Do not add `keyring` or `tauri` (D-19; validation row `cargo tree -p gamelib-info | grep -c keyring` == 0). `md-5 = "0.10"` is the only new crate; also add `reqwest` copying the shell's `default-features = false, features = ["rustls-no-provider"]` from `src-tauri/Cargo.toml:80`.

**Dispatch contract** (`gamelib-steampoll/src/dispatch.rs:1-60`): module doc states "every op takes one JSON object (camelCase, `deny_unknown_fields`) and answers a camelCase JSON value; `Err` is only a bad-args, unknown op, missing facade, wrong thread or panic (`{op}:panic`)". Copy: a sorted `pub const OPS: &[&str]`, `fn parse<T: DeserializeOwned>` per-op args structs with `#[serde(deny_unknown_fields, rename_all = "camelCase")]`, `catch_unwind`, and the `{op}:wrong-thread` answer for async ops that `block_on` (the shell calls `dispatch` on a worker thread, never inside a tokio runtime).

**Injected seams:** copy the trait + recording-fake split from `gamelib-steampoll` (`src/host.rs`, `src/testing.rs`, gated by the `testing` feature) for `Http` (`ReqwestHttp` and `Replay`), `Clock` (from `gamelib-core/src/clock.rs`), `Emitter` (`gamelib-core/src/emitter.rs`), `SecretSource`.

**reqwest client** (`src-tauri/src/log_upload.rs:89-100`): lazily built via `OnceLock`, after the rustls provider is installed:
```rust
reqwest::Client::builder()
    .redirect(reqwest::redirect::Policy::none())
    .timeout(REQUEST_TIMEOUT)
    .build()
    .map_err(|e| e.to_string())
```
Bounded body read: `read_capped` (`log_upload.rs:104-`) is the model for the response-size cap. Map every `reqwest::Error` through `.without_url()` (ITAD key is in the query).

### `gamelib-info` golden / replay tests (test, batch)

**Analog:** `gamelib-store/tests/golden.rs` and `corpus.rs`; fixture layout `gamelib-log/tests/fixtures/golden/{cases.json,entries.json,NOTES.md,expected/<case-id>/...}`.

Excerpt (`gamelib-store/tests/golden.rs:1-50`): `Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden")`, a sorted recursive `walk`, and `recorded_files()` that reads `outcomes.json` and asserts the produced set equals the recorded set (so a missing or extra file fails). Copy the "recorded set equals produced set" assertion, and add the 82 D-05 vacuous-pass guards (manifest count floor plus an empty-input test that must fail). Use `gamelib-testutil` `FakeHome` (`gamelib-testutil/src/lib.rs`) for scratch dirs, never the real profile.

Fixture dirs per research: `tests/fixtures/recorded/<slice>/<case>/{request.json,response.*}`, `golden/<slice>/*.json`, `state/<slice>/*`.

### `gamelib-info-cli` (cli, request-response)

**Analog:** `gamelib-store-cli/src/main.rs` (289 lines) and `gamelib-steampoll-cli/{src/main.rs,tests/cli.rs}`.

Copy: module doc listing each subcommand, `const USAGE`, `fn usage() -> !` exiting 64, exit 2 for bad input, and "never touches the Keychain (the crate has no keyring dependency)". The D-12 `drift` subcommand (live endpoints) is opt-in and must not run in `cargo test` by default (or is `#[ignore]`). `tests/cli.rs` runs the binary in `FakeHome`.

### `src-tauri/src/info_dispatch.rs` (controller, request-response)

**Analog:** `src-tauri/src/steamcm_dispatch.rs` (rustInvoke) and `src-tauri/src/log_dispatch.rs` (native channels).

**rustInvoke arm** (`steamcm_dispatch.rs:1-30`): validate with the generated `*Args::from_args(args)?`, then pass straight to the crate; handlers run on the `rustInvoke` worker thread, so the sync facade may block:
```rust
pub(crate) fn rpc_steamcm_depot_key(args: &[Value]) -> Result<Value, String> {
    SteamcmDepotKeyArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_depot_key", args)
}
```
Register in `rust_dispatch.rs` (`RustInvokeChannel::SteampollStatus => rpc_steampoll_status(args)`, line 132) and in `ipc_contract.rs` (name<->enum, lines 390 and 516). T-28-04 rule: never format a token or key into a log line.

**Native channel** (`log_dispatch.rs:1-70`; registry at `native_router.rs:94-99,280-311`): `InvokeHandler = fn(Arc<NativeCtx>, Vec<Value>) -> NativeFuture`; `invoke.insert("getLogContent", log_dispatch::get_log_content)`; validators return a fixed category literal as `Err` ("bad-arity", "bad-shape"), never the renderer string; build errors with `invalid_args(channel, paths, codes)` (`native_router.rs:427`). Module doc line "D-07 (Phase 83): the Rust shapes are the schema authority, pinned by the valid and invalid vectors in `nativeChannels.json`" applies to every info channel.

**Schema entry** (`nativeChannels.json:3-30`): `kind` (`invoke` or `send`), `slice` (use `"info"`), `args[{name,type,strict}]`, `returns`, `valid[]`, `invalid[]`. Regenerate the IPC snapshot (`pnpm check:ipc-contract`), and delete the matching zod keys in `src/common/types/ipc/enrichment.ts` (lines 48-85) and `appShell.ts:98`.

### Recent games (service, CRUD) and D-08 tray emit

**Analog (behaviour to port):** `src/backend/recent_games/recent_games.ts` (whole file, 85 lines). Pin these exactly:
```ts
const updatedList = games.filter((a) => a.appName && a.appName !== game.app_name)
updatedList.unshift({ appName: game.app_name, title: game.title, runner: game.runner })
```
Key order `appName, title, runner`; the filter drops entries with a falsy `appName`; `removeRecentGame` only writes when `games.length`; the list is stored under `games.recent` in `store/config.json` and is unbounded. Wrap the read-modify-write in a `Mutex` (Pitfall 7).

**Tray (modify in place):** delete the frame sniff at `src-tauri/src/sidecar.rs:475-515` (`if channel == RECENT_GAMES_CHANGED_CHANNEL {...}` calling `tray_recent_games_from_value` then `app.run_on_main_thread(move || update_tray_recent_games(&tray_app, games))`). Move that same call into the Rust `RecentSink` impl in `info_dispatch.rs`, emitting through `FrontendEmitter`. Seed read `tray/recent.rs:431 load_recent_games_from_disk` must go through the host after `open_all` (Pitfall 8). Update `tauriShellSource.test.ts`.

### Anticheat (service, file-I/O + HTTP)

**Port source:** `src/backend/anticheat/utils.ts:1-101`. Pins: `anticheatDataPath = <appFolder>/areweanticheatyet.json`; Windows returns early/null; MD5 hex of the local file compared to `latestFileHash`; the two URLs (Mac: `raw.githubusercontent.com/Heroic-Games-Launcher/MacAnticheatData/main/games.json`, else `Starz0r/AreWeAntiCheatYet/HEAD/games.json`) fetched as raw text (no JSON parse) and written as received; lookup `info.storeIds.epic?.namespace.toLowerCase().includes(appNamespace)`; read failure returns null. Per D-28 split into `anticheat_status` and `anticheat_download`; TS keeps `runOnceWhenOnline` (D-07). Note the TS `find` returns `undefined` on no match (quirk, todo per D-03).

### TS shims and resolvers (service, request-response)

**Analog:** `src/backend/host/appState.ts:77,107,147` and `notifications.ts:34` (typed `requestRustInvoke(CHANNEL, args)` calls) with `src/backend/host/rustInvokeDeps.ts`:
```ts
export interface RustInvokeDeps { requestRustInvoke: RequestRustInvoke }
```
Shims take `RustInvokeDeps` (Pitfall 9: the four sync override shims become async, with `await` added at `gamedetails/dispatch.ts:113` and `gamedetails/overrides.ts:93-94`). A shim body is exactly one typed call; a resolver (D-24: `getCrossoverIndex`, `getGogDiscounts` with token) gathers named TS-only inputs then makes exactly one typed call.

### Oracle harness (test, batch)

**Analog:** `src/backend/stores/__tests__/storeOracle.test.ts:1-60`. Copy: header comment explaining compare vs write mode, `GAMELIB_WRITE_STORE_GOLDEN=1` -> use `GAMELIB_WRITE_INFO_GOLDEN=1`, `cases.json` hand-authored and never rewritten, "no expected byte of an oracle case is ever typed by hand", temp `userData` via `mkdtempSync(join(tmpdir(), ...))`, produced file set compared to `outcomes.json`. Add axios adapter capture set before importing slice modules (research Pattern 3) and run under `TZ=UTC` with a pinned clock. Wrap counts in `assertAtOrAboveFloor`.

### Delete gate (test, gate)

**Analog:** `src/backend/__tests__/loggerPortComplete.test.ts` (378 lines; excerpts at 1-90). Copy: `ROOT = join(__dirname,'..','..','..')`, `DELETED[]`, `GOLDEN` path constant and `KEPT[]` (golden dirs must survive), `FORBIDDEN_IDENTIFIERS[]`, the rollback-flag string check (`GAMELIB_<SLICE>` must not exist, D-13), all scans over `stripSourceComments` text (`backend/testUtils/stripSourceComments`), a walk floor via `assertAtOrAboveFloor('...', n, floor)` and self-tests that each scan can fail. One `describe` per slice. Extend with the D-06 rule: a shim or resolver body contains only the typed call. Siblings for style: `steamPollsPortComplete.test.ts`, `depotPortComplete.test.ts`, `nativeSeamPortComplete.test.ts`. The images_cache slice is deleted outright (D-22), so its entry is a pure DELETED row (`src/backend/images_cache.ts` plus the `imageFetches` slot in `appRuntime.ts`).

### Secrets (service, CRUD)

**Analogs:** `src-tauri/src/keyring_dispatch.rs` (slot allowlist via `keyring_account(slot)`, lines ~102-231; slots `steamgrid-api-key`, `itad-api-key`), TS `src/backend/sidecar/devSecretVault.ts` (vault, slots `steamGridDbApiKey`, `itadApiKey`; gate `GAMELIB_DEV_SECRET_VAULT === '1'`, refused when packaged) and `src/backend/steamgrid/secretStore.ts` (the `GlobalConfig.steamGridDbApiKey` plaintext migration with read-back proof). Rust: a `SecretSource` trait lives in `gamelib-info`, its keyring impl in the shell; semantics to copy: trim on set, empty clears, ITAD session `rejected` flag, non-string rejected.

## Shared Patterns

### Shutdown contract (every Rust task or timer)
**Source:** `Skill("gamelib-conventions")` and `gamelib_core::shutdown::global()` (`gamelib-core/src/shutdown.rs`).
**Apply to:** any in-flight HTTP in `gamelib-info` and shell wiring. Hold a Registrant for exactly the lifetime of the work, `tokio::select!` against `token()`, bound boot work, no child spawn (D-20).

### Byte-exact JSON through the store
**Source:** `gamelib-store/src/json.rs` (`Obj::insert_js`, `js_number_text`), `ops.rs`, `dotpath.rs`.
**Apply to:** cache views, recent, overrides. Never use `serde_json::Value` for anything byte-compared.

### Fixture vacuous-pass guards
**Source:** `src/backend/testUtils/censusFloor.ts` (`assertAtOrAboveFloor(label, scanned, floor)`; floor must be a positive integer). **Apply to:** every golden, schedule and delete gate; add an empty-input test that must fail.

### Crate registration checklist
**Source:** `.planning/phases/85-store-host-config-and-versioned-migrations/85-PATTERNS.md` (84-02 / 85-06 additions). Add both crates to `src-tauri/Cargo.toml` members and path deps; `.github/workflows/rust-test.yml` (`-p gamelib-info -p gamelib-info-cli`, plus step name); `meta/__tests__/rustTestWorkflow.test.ts`; `EXPECTED_LOCKFILE_CRATE_NAMES` in `src/backend/__tests__/cargoFeatures.test.ts` (new crate `md-5`); `src-tauri/crates/README.md`.

### Quirk todos and verify blocks
**Source:** CLAUDE.md Conventions. Each D-03 quirk todo carries `severity:`, `platform:`, `ready:` bare, lowercase, in that order. Each task `<verify>` runs `npx prettier --check` over exact paths after `--file-info` (`.planning/**` is ignored: say so); Rust uses `cargo fmt --check`, `cargo clippy -p gamelib-info --all-targets -- -D warnings`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `Http` trait with `Replay` impl pinning requests | utility | request-response | No Rust crate has an HTTP replay seam; closest idea is steampoll's `testing.rs` recording host and `log_upload.rs`'s localhost stand-in. Use the research Code Example. |
| `CacheView` (TS `CacheStore` TTL, `__timestamp.<key>`, `invalidateCheck`) over StoreHost | utility | CRUD | `StoreHost` unshipped (85-09); behaviour source is `src/backend/cache.ts` and `__tests__/cache.test.ts`. |
| `build.rs` + `option_env!("ITAD_API_KEY")` bake | config | build | No existing shell `option_env!` bake; TS analog is `meta/esbuildWorkerBundleShared.ts:85` and `.github/workflows/release-tauri.yml:337-348`. |
| `infoShimSchedule.test.ts` | test | gate | 85's `storeMirrorSchedule` is not on disk yet; model on `loggerPortComplete.test.ts` and re-check after 85 ships (D-29). |

## Metadata

**Analog search scope:** `src-tauri/crates/*`, `src-tauri/src/*dispatch.rs`, `native_router.rs`, `sidecar.rs`, `tray/`, `src/backend/{__tests__,stores/__tests__,testUtils,host,anticheat,recent_games,steamgrid,sidecar}`, `src/common/types/ipc/`.
**Files scanned:** about 45 (targeted reads; the large dispatch files read by header and registration lines only).
**Pattern extraction date:** 2026-11-22
