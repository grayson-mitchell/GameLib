# Phase 79: Rust CM client replacing steam-user and steam-session - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 27 new/modified (plus the delete-gate list)
**Analogs found:** 25 / 27 (2 have only spike-grade analogs, listed under "No Analog Found")

Path note: `steamFilesFlags.ts` was deleted at 75-34. Its content is recoverable with `git show e88a189e7:src/backend/storeManagers/steam/localFiles/steamFilesFlags.ts`. Quoted below.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/crates/gamelib-steamcm/Cargo.toml` | config | n/a | `src-tauri/crates/gamelib-steamfiles/Cargo.toml` (+ `gamelib-depot` for rust-version/tokio/reqwest) | role-match |
| `gamelib-steamcm/src/lib.rs` (`dispatch`, `OPS`, `CLI_ONLY_OPS`, `parse_args`, `catch_unwind`) | service (crate facade) | request-response | `gamelib-steamfiles/src/lib.rs:19-181` | exact |
| `gamelib-steamcm/src/backend.rs` + `vent.rs` (`CmBackend` trait, `SteamVentBackend`) | service | request-response + streaming | `gamelib-depot` `JobHost` trait (host seam) and spike 085 `src/main.rs:43-61` | role-match |
| `gamelib-steamcm/src/session.rs` (SessionActor, leases, idle, reconnect, retry-once) | service (actor) | event-driven | spike 085 `src/main.rs:63-153` (liveness/reconnect loop); `depot_dispatch.rs:290` cancel_all | partial |
| `gamelib-steamcm/src/anon.rs` (AnonActor) | service | request-response | `src/backend/storeManagers/steam/anonymousClient.ts:1-40` (behaviour to port) | role-match |
| `gamelib-steamcm/src/ops/{pics,owned,depot,redeem,persona}.rs` | service | request-response | spike 073 `src/main.rs:100-160` | exact (spike) |
| `gamelib-steamcm/src/webauth.rs` (QR, credentials, guard, poll) | service | request-response | spike 072 `src/main.rs:131-146` (`webapi`) + `qr_flow` 147+ | role-match |
| `gamelib-steamcm/src/wrap.rs` (only if D-09 fails) | service | event-driven | spike 072 `src/main.rs:95-129` (Rust wrap) + `macSteamOffline.ts` | role-match |
| `gamelib-steamcm/src/refresh/*` | service | batch/transform | `src/backend/storeManagers/steam/library/refresh.ts` (behaviour); spike 073 for the CM calls | partial |
| `gamelib-steamcm/src/macowned.rs` + helper `--steam-owned-apps` | service + utility (C) | request-response (subprocess) | `steamInstallApp.ts:45-98` (helper spawn); `native/steam-bridge/helper/gamelib_installapp.h`; spike 084 `probe.c:30-35,110-135` | role-match |
| `gamelib-steamcm/tests/golden.rs` + `tests/fixtures/*` | test | batch | `gamelib-steamfiles/tests/golden.rs` | exact |
| `gamelib-steamcm/tests/{session_fake,anon_fake,webauth_mock,wrap,macowned}.rs` | test | event-driven | none in repo (see No Analog); depot uses `tokio` `test-util` | partial |
| `src-tauri/crates/gamelib-steamcm-cli/{Cargo.toml,src/main.rs}` | utility (CLI) | request-response | `gamelib-steamfiles-cli/src/main.rs:1-79` | exact |
| `src-tauri/src/steamcm_dispatch.rs` | controller (shell handlers) | request-response + host callbacks | `steamfiles_dispatch.rs` (plain ops), `depot_dispatch.rs:69-221` (host-trait ops, EOF hook) | exact |
| `src-tauri/src/rust_dispatch.rs` (new arms) | route | request-response | `rust_dispatch.rs:74-92` | exact |
| `src-tauri/src/ipc_contract.rs` (enum + list entries) | config | n/a | `ipc_contract.rs:69-82,132-142` | exact |
| `src-tauri/src/main.rs` (`mod steamcm_dispatch;`, `use`, rustls install) | config | n/a | `main.rs:134-154` | exact |
| `src-tauri/src/sidecar.rs` (EOF hook call) | controller | event-driven | `sidecar.rs:661-665` | exact |
| `src/common/types/sidecarTransport.ts` (`RUST_CM_*`, `RUST_STEAMCM_CHANNELS`) | config | n/a | `sidecarTransport.ts:460-550, 780-822` | exact |
| `src/backend/sidecar/sidecarRpc.ts` (`UNBOUNDED_RUST_CHANNELS`) | config | request-response | `sidecarRpc.ts:110-116` | exact |
| `src/backend/storeManagers/steam/cm/rustSteamCm.ts`, `steamCmTypes.ts` | service (typed adapter) | request-response | `localFiles/rustSteamFiles.ts:1-23`, `steamFilesTypes.ts` | exact |
| `src/backend/storeManagers/steam/cm/steamCmFlags.ts` | config | n/a | `git show e88a189e7:.../steamFilesFlags.ts` | exact |
| `cm/SteamCmClient.ts` (interface) + `cm/RustCmClient.ts` (adapter) | service | request-response | `userTypes.ts:53-81` (the surface to narrow); `depot` structural subsets (`DepotSteamUser`) | role-match |
| `src/backend/sidecar/depotHostRegistration.ts` (modify) | controller | request-response | itself (`depotHostRegistration.ts:1-50`) | exact |
| `user.ts`, `userSignIn.ts`, `anonymousClient.ts`, `userRedeem.ts` (modify: thin calls) | service | request-response | `localFiles` call sites that Phase 75 converted (sync -> async) | role-match |
| `meta/gamelibSteamcmCli.ts`, `meta/steamcmParitySweep.ts` | utility | request-response | `meta/gamelibSteamfilesCli.ts`, `meta/depotParitySweep.ts` | exact |
| `src/backend/__tests__/steamCmChannelParity.test.ts` | test | static | `depotChannelParity.test.ts:1-70` | exact |
| `src/backend/__tests__/steamCmPortComplete.test.ts` | test | static | `steamFilesPortComplete.test.ts:1-110` | exact |
| `src-tauri/deny.toml`, `.github/workflows/rust-test.yml`, `cargoFeatures.test.ts` | config | n/a | `rust-test.yml:114-117`; `cargoFeatures.test.ts:189` | exact |

## Pattern Assignments

### `gamelib-steamcm/src/lib.rs` (crate facade)

**Analog:** `src-tauri/crates/gamelib-steamfiles/src/lib.rs`

Doc header, `OPS` sorted, `CLI_ONLY_OPS`, `deny_unknown_fields` arg structs, `parse_args` with exactly one arg, `catch_unwind` (lines 1-4, 19-36, 38-42, 75-85, 178-181):
```rust
pub const OPS: &[&str] = &[ "steamfiles_discover_root", /* ... sorted */ ];
pub const CLI_ONLY_OPS: &[&str] = &["steamfiles_discover_root", "steamfiles_shortcuts_roundtrip"];

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct LocalConfigArgs { path: String, app_id: String }

fn parse_args<T: for<'de> Deserialize<'de>>(op: &str, args: &[Value]) -> Result<T, String> {
    let bad = || format!("{op}:bad-args");
    if args.len() != 1 { return Err(bad()); }
    serde_json::from_value(args[0].clone()).map_err(|_| bad())
}

fn run_op(op: &str, args: &[Value]) -> Result<Value, String> {
    match op {
        #[cfg(test)]
        "__panic_probe" => panic!("probe"),
        "steamfiles_read_acf" => { let a: PathArgs = parse_args(op, args)?; to_value(op, acf::read_acf(Path::new(&a.path))) }
        _ => Err(format!("unknown-op:{op}")),
    }
}

pub fn dispatch(op: &str, args: &[Value]) -> Result<Value, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_op(op, args)))
        .unwrap_or_else(|_| Err(format!("{op}:panic")))
}
```
Contract: unreadable input is a RESULT; `Err` is bad args / unknown op / panic / serialize only. For steamcm, a CM failure is a typed result (`{ok:false, eresult, kind}`), not `Err`, so TS can map EResults (Pitfall 6). Never `#[derive(Debug)]` on arg structs carrying token or password (Pitfall 10).

Differences to plan for: steamcm ops are async and stateful. The sync `dispatch` runs on a plain `thread::spawn` worker (`sidecar.rs:604`), so it `Handle::block_on`s a crate-global runtime (`OnceLock`). Cargo.toml: copy `[lints.clippy] dbg_macro/todo = "deny"` and the `[dev-dependencies] tempfile` block from `gamelib-steamfiles/Cargo.toml`; take `rust-version = "1.89"` and tokio/reqwest `rustls-no-provider` from `gamelib-depot/Cargo.toml` (not re-read here; RESEARCH "Installation" block is the template).

---

### `gamelib-steamcm/src/vent.rs` and `session.rs` (CM session, liveness, reconnect)

**Analog:** `.planning/spikes/085-steam-vent-long-lived-session/src/main.rs` (spike, not production; copy call shapes, not structure).

Logon with `CMsgClientLoggedOff` subscribed before logon (lines 43-51). In production also subscribe `CMsgClientLicenseList` first and use `login_with_refresh_token_and_logon_id` (767481a, RESEARCH Pattern 2):
```rust
async fn logon(vault: &str) -> R<(Connection, Off)> {
    let token = RefreshToken::new(v["steam-refresh-token"].as_str().ok_or("no token")?.to_string())?;
    let servers = ServerList::discover().await?;
    let unauth = UnAuthenticatedConnection::connect(&servers).await?;
    let off: Off = Box::pin(unauth.on::<CMsgClientLoggedOff>());
    let c = unauth.login_with_refresh_token(&token).await?;
    Ok((c, off))
}
```
Liveness probe, 10 s hard timeout around a single small job (lines 53-61):
```rust
let r = tokio::time::timeout(Duration::from_secs(10),
    c.job(CMsgClientPICSAccessTokenRequest { appids: vec![480], ..Default::default() })).await
    .map_err(|_| "outer timeout 10s".to_string())?;
```
Sleep detection by wall clock vs monotonic gap (lines 98-106) and backoff 5->60 s with 30 s per-attempt bound (lines 126-147):
```rust
let gap = (w - last_wall) - m.duration_since(last_mono).as_secs_f64();
if gap > 5.0 { /* GAP: treat as dead, probe/reconnect immediately */ }
match tokio::time::timeout(Duration::from_secs(30), logon(&vault)).await { /* ... */ }
backoff = (backoff * 2).min(60);
```
Tracing so steam-vent's silent failures show (lines 65-69): `tracing_subscriber::fmt().with_env_filter(EnvFilter::new("steam_vent=warn"))`. In the shell, forward warn+ to `shell_eprintln!`/`shell_diag`.

Do NOT copy: the spike awaits `alive(&c).await` inside its own control loop (likely source of the 92 s stall, assumption A6). The production actor runs each command in a spawned task with `tokio::time::timeout` and keeps the control loop (idle timer, `LoggedOff` watcher, shutdown) free.

State to port from `user.ts` (names only, see RESEARCH Pattern 2): `leaseCount`, 60 s idle (`AUTH_SESSION_IDLE_GRACE_MS`, `userTypes.ts:26`), `sessionGeneration`, `abandonPendingLogon`, `wrapTail`, `shuttingDown`, `logonFailure`, `AUTH_LOGON_BOUND_MS` 35 s, `CANARY_APP_ID` 753 / `CANARY_TIMEOUT_MS` (`userTypes.ts:6-26`; `user.ts:419` calls `client.getProductInfo([CANARY_APP_ID], [], true)` under `CANARY_TIMEOUT_MS`).

Testing seam: all `steam_vent` imports live only in `vent.rs`; `session.rs` is generic over `trait CmBackend` with a `FakeBackend` and `tokio::time::pause` (`test-util` dev-dependency, as `gamelib-depot`). No repo analog for this test shape (see No Analog).

---

### `gamelib-steamcm/src/ops/*.rs` (PICS, owned, depot key, request code, redeem, persona)

**Analog:** `.planning/spikes/073-rust-owned-apps-parity/src/main.rs` (exact for owned games, licences and PICS).

Imports (lines 12-26): `steam_vent::{ConnectionTrait, ReadonlyConnection, ServerList}`, `steam_vent_proto::steammessages_clientserver::CMsgClientLicenseList`, `..._clientserver_2::{CMsgClientPurchaseResponse, CMsgClientRegisterKey}`, `..._appinfo::{CMsgClientPICSAccessTokenRequest, ...ProductInfoRequest/Response, cmsg_client_picsproduct_info_request}`, `..._player_steamclient::CPlayer_GetOwnedGames_Request`.

Owned games with GameLib's options (lines 100-117):
```rust
let owned = c.service_method(CPlayer_GetOwnedGames_Request {
    steamid: Some(u64::from(steam_id)), include_appinfo: Some(true),
    include_played_free_games: Some(true), include_free_sub: Some(false),
    skip_unvetted_apps: Some(true), ..Default::default() }).await?;
```
Package access tokens BEFORE package info, then `job_multi` for the split response (lines 124-141):
```rust
let tok: CMsgClientPICSAccessTokenResponse = c.job(CMsgClientPICSAccessTokenRequest { packageids: pkg_ids.clone(), ..Default::default() }).await?;
let ptok: BTreeMap<u32, u64> = tok.package_access_tokens.iter().map(|t| (t.packageid(), t.access_token())).collect();
// PackageInfo { packageid, access_token: ptok.get(p).unwrap_or(&0) } ...
let mut stream = std::pin::pin!(c.job_multi::<_, CMsgClientPICSProductInfoResponse>(req));
while let Some(part) = stream.next().await { let part = part?; /* ... */ }
```
Do not copy the spike's hand-rolled `bkv` (lines 33-79): use `gamelib_steamfiles::kv_bin::parse_bin` / `kv_text::parse` (RESEARCH Don't Hand-Roll; package buffer = 4-byte package-id prefix then binary KV, lines 143-157 show the prefix skip).

Result-shape rule: `getProductInfo` must return steam-user's `{apps, packages, unknownApps, unknownPackages}` with string-valued `appinfo` (all values strings, `missingToken`, `changenumber`). Budget a golden for the numeric-coercion class (75 lesson).

Idempotency: tag each op idempotent or not; `redeem` is not retried blindly after a dead connection (Pitfall 5).

---

### `gamelib-steamcm/src/webauth.rs` (Web API sign-in)

**Analog:** `.planning/spikes/072-rust-signin-refresh-token/src/main.rs:131-146` (`webapi`) and `qr_flow` at 147+.

```rust
async fn webapi<Req: Message, Rsp: Message>(method: &str, req: &Req) -> R<Rsp> {
    let body = base64::engine::general_purpose::STANDARD.encode(req.write_to_bytes()?);
    let resp = reqwest::Client::new()
        .post(format!("https://api.steampowered.com/IAuthenticationService/{method}/v1"))
        .form(&[("input_protobuf_encoded", body)]).send().await?;
    let eresult = resp.headers().get("x-eresult").and_then(|v| v.to_str().ok()).unwrap_or("?").to_string();
    let bytes = resp.bytes().await?;
    if eresult != "1" { return Err(format!("{method}: HTTP {}, x-eresult {eresult}", resp.status()).into()); }
    Ok(Rsp::parse_from_bytes(&bytes)?)
}
```
Messages: `steam_vent_proto::steammessages_auth_steamclient::{CAuthentication_BeginAuthSessionViaQR_Request/Response, CAuthentication_PollAuthSessionStatus_Request/Response, CAuthentication_DeviceDetails, EAuthTokenPlatformType}` (spike lines 33-37). Poll shape: `CAuthentication_PollAuthSessionStatus_Request { client_id, request_id, ..Default }` (spike line 177-179).

Changes for production: take the base URL as a parameter (mock-server tests); build the `reqwest::Client` once, after the explicit rustls provider install (Pitfall 3); surface the x-eresult as a typed value instead of a stringly error so `webauth` maps to `needsGuard{type}` / `waitingApproval` / `done{refreshToken,accountName,steamId}` / `error{eresult}`; credentials flow adds `GetPasswordRSAPublicKey` + `rsa` PKCS#1 v1.5 public-key encrypt and `UpdateAuthSessionWithSteamGuardCode` (no spike covers these; spike 072 used steam-vent's own `login` with `AuthConfirmationHandler` instead, lines 211-290, not the D-05 path). No-op guard store (D-08) is the spike's `GuardDataStore` impl, lines 250-255:
```rust
fn store(&mut self, _a: &str, _t: String) -> impl Future<Output = Result<(), Self::Err>> + Send { ... }
fn load(&mut self, _a: &str) -> impl Future<Output = Result<Option<String>, Self::Err>> + Send { ... }
```
(Only needed if any CM login path is ever used for sign-in; D-05 makes it moot but D-08 stays satisfied.)

TS state to keep in place: `userSignIn.ts` `startCredentialLogin` (275), `submitSteamGuardCode` (394), `pollCredentialLogin` (152), `startQRLogin` (165), `pollQRLogin` (246), and `userSignInState.ts`. Rust returns step results; TS keeps `SteamSignInState`, `finishAuth`, token store.

---

### `gamelib-steamcm/src/wrap.rs` (only if D-09 retest fails)

**Analog:** `.planning/spikes/072-rust-signin-refresh-token/src/main.rs:95-129` (Rust wrap), behaviour source `src/backend/storeManagers/steam/macSteamOffline.ts` (933 lines).

```rust
fn steam_running() -> bool {
    std::process::Command::new("pgrep").args(["-x", "steam_osx"]).output().map(|o| o.status.success()).unwrap_or(false)
}
async fn wrap_offline(s: &Shared) -> bool {
    if !steam_running() { return true; }
    let start = std::fs::metadata(connection_log()).map(|m| m.len()).unwrap_or(0);
    let _ = std::process::Command::new("open").args(["-g", "steam://open/gooffline"]).status();
    for i in 0..50 {                       // 50 x 100 ms = 5 s
        tokio::time::sleep(Duration::from_millis(100)).await;
        // read connection_log.txt past `start`, look for "user initiated logoff"
    }
    wrap_online(s);  // not seen: refuse, never a silent logon
    false
}
```
Production differences: do not call `open` from the crate. Take a host trait `open_url(&str)` implemented by the shell (the shell already has `open_external_scheme_check` and `opener().open_url`, `sidecar.rs:628-645`), keeping the crate Tauri-free; poll interval 250 ms to match `macSteamOffline.ts`; ~15 s spacing between back-to-back wrapped logons (074); owed-goonline record written through `gamelib_steamfiles::atomic`, same versioned format as `storeVersioning/macSteamOfflineOwedFile.ts`. File is deleted if D-09 passes.

---

### `gamelib-steamcm/src/macowned.rs` and helper `--steam-owned-apps`

**Analogs:** `src/backend/storeManagers/steam/steamInstallApp.ts` (out-of-process helper spawn, `HELPER_TIMEOUT_MS = 30000` at line 45, shared spawn plus last-line JSON parse at lines 89-98), `native/steam-bridge/helper/gamelib_installapp.h` (attach + function-ID decode), and `.planning/spikes/084-owned-apps-from-running-steam/probe.c`.

Constants to reuse (probe.c:30-35); resolve by function-ID high half with a uniqueness check, never a slot index:
```c
#define HI_BIsSubscribedApp 0x8d36
#define HI_GetSubscribedApps 0x8532
#define HI_GetSteamID 0xd6fc
#define HI_BLoggedOn 0x6585
// probe.c:110-114
int sGet = find_unique(HI_GetSubscribedApps), sIs = find_unique(HI_BIsSubscribedApp);
if (sGet < 0) { printf("{\"step\":\"guard\",\"ok\":false,\"why\":\"GetSubscribedApps not uniquely resolved\"}\n"); return 3; }
```
The helper emits one JSON object per step and exits non-zero on ambiguity; Rust treats any non-zero exit, timeout, unparsable last line or `GetSteamID != userData.steamId` as "fall back to CM". Two-call buffer protocol (count then fill) is mandatory (Pitfall 12; with `max=4` it still returned 1,140). Rust then runs an anonymous PICS lookup for `common.type`, keeps `type == game`, intersects demos.

---

### `gamelib-steamcm/src/refresh/*`

**Analog (behaviour to port, not a code pattern to copy):** `src/backend/storeManagers/steam/library/refresh.ts` (702 lines), `licensedDemos.ts`, `platformCapture.ts`, `metacriticCapture.ts`, `gameMetadata.ts`, `gameRequirements.ts`. Order of operations is documented in RESEARCH "Refresh boundary (D-12)". Rust owns network + pure computation; TS keeps stores, `libraryState`, frontend pushes, install-state merge and bridge backfill (Open Question 1; planner should confirm boundary with operator). Use `NUMERIC_ID` guard before any URL (T-06-01/T-21-05) and size-capped strict parse of store bodies (T-2-02).

---

### `src-tauri/crates/gamelib-steamcm-cli/src/main.rs`

**Analog:** `src-tauri/crates/gamelib-steamfiles-cli/src/main.rs` (exact; 79 lines). Copy whole, replace `gamelib_steamfiles` with `gamelib_steamcm`. Key shape: `--list` prints sorted deduped `OPS` + `CLI_ONLY_OPS`; `--ndjson` one `{"op","args"}` per line returns `{ok,result|error}`; `<op> <json>` result exit 0, error exit 2, usage exit 64:
```rust
const USAGE: &str = "usage: gamelib-steamfiles-cli --list | --ndjson | <op> <json-object>";
match gamelib_steamfiles::dispatch(op, std::slice::from_ref(args)) {
    Ok(result) => json!({"ok": true, "result": result}),
    Err(error) => json!({"ok": false, "error": error}),
}
```
Note: any op that needs a live session cannot be a one-shot CLI call; the CLI covers the stateless ops (goldens, webauth against a base URL, PICS decoding). Say so in the CLI header. Add a `steamcm-cli:build` script beside `steamfiles-cli:build` in `package.json`.

---

### `src-tauri/src/steamcm_dispatch.rs`

**Analogs:** `steamfiles_dispatch.rs:1-54` for plain ops; `depot_dispatch.rs:69-221, 285-293` for host-trait ops and the EOF hook.

Plain handler shape (validate through the generated Args struct, then pass through):
```rust
pub(crate) fn rpc_steamfiles_read_acf(args: &[Value]) -> Result<Value, String> {
    SteamfilesReadAcfArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_read_acf", args)
}
```
Host-trait shape (copy for `ShellCmHost { open_url, log }`): `ShellJobHost` holds `Arc<SidecarState>`, implements the crate trait, and calls back to Node over `self.state.invoke(channel, vec![json])` (`depot_dispatch.rs:149-161`). The wrap's `open_url` should instead call `app.opener().open_url` behind `open_external_scheme_check` on a worker thread (D-UAT-19, `sidecar.rs:628-645`).

EOF hook (copy exactly; call at `sidecar.rs:661-665` next to `on_sidecar_eof_cancel_jobs()`):
```rust
/// Sidecar stdout ended: no response can arrive and no event consumer exists ... Logs the count only.
pub(crate) fn on_sidecar_eof_cancel_jobs() {
    let n = gamelib_depot::registry::cancel_all();
    shell_diag(&format!("depot jobs cancelled on sidecar EOF: {n}"));
}
```
New `on_sidecar_eof_drop_leases()`: drop every lease, log off, pay owed goonline within a bounded wait (Pitfall 1). Same on `RunEvent::Exit`; model the exit-wait on `EXIT_FINALIZE_WAIT` (`depot_dispatch.rs:15`).

Header comment convention (line 6-7): "Nothing here formats a job, event, token or argument into a log line (T-28-04)". Keep it.

Registration: `mod steamcm_dispatch;` and `use steamcm_dispatch::*;` in `main.rs` beside lines 135-136 and 154. Add `steamcm_dispatch.rs` to the production-source lists in `sidecar.rs` tests at ~2034 and ~2081 (they enumerate `steamfiles_dispatch.rs`; grep found it twice, so a new file must be added or the source-scan tests miss it).

---

### `src-tauri/src/rust_dispatch.rs` and `ipc_contract.rs` (channel arms)

**Analog:** `rust_dispatch.rs:74-92`: one exhaustive `match ch` arm per generated enum variant, no catch-all, so a missing arm is a compile error.
```rust
RustInvokeChannel::SteamfilesReadAcf => rpc_steamfiles_read_acf(args),
RustInvokeChannel::DepotJobRun => rpc_depot_job_run(args, app),
```
`ipc_contract.rs`: add each variant in the enum (lines 69-82 pattern: `DepotJobCancel`, `SteamfilesFindAcf`, ...) and in the all-channels list (lines 132-142). The generated `*Args::from_args` structs come from this contract (grep found `SteamfilesReadAcfArgs` only in `ipc_contract.rs` and `steamfiles_dispatch.rs`), so each new channel needs its arg schema declared there.

---

### TS channels: `sidecarTransport.ts`, `sidecarRpc.ts`

**Analog:** `src/common/types/sidecarTransport.ts` constants at 424-451 (`RUST_DEPOT_*`) and 460-550 (`RUST_STEAMFILES_*`), allowlist at 780-793, group tuple at 809-822:
```ts
export const RUST_STEAMFILES_READ_ACF = 'steamfiles_read_acf' as const
export const RUST_STEAMFILES_CHANNELS = [ RUST_STEAMFILES_FIND_ACF, /* ... */ ] as const
export type RustSteamFilesChannel = (typeof RUST_STEAMFILES_CHANNELS)[number]
```
Add `RUST_CM_*` per op, add each to `RUST_INVOKE_CHANNELS`, add `RUST_STEAMCM_CHANNELS` and `RustSteamCmChannel`.

`sidecarRpc.ts:110-116`: long calls must be listed or the generic `RUST_INVOKE_TIMEOUT_MS` (60 s) kills them:
```ts
const UNBOUNDED_RUST_CHANNELS: readonly string[] = [
  RUST_DIALOG_OPEN, RUST_DIALOG_MESSAGE, RUST_DIALOG_SAVE, RUST_DEPOT_JOB_RUN, RUST_DEPOT_FINALIZE
]
```
Add: acquire (up to 35 s logon + wrap + settle), refresh collect, sign-in poll, any lease-held wait.

---

### `cm/rustSteamCm.ts` and `steamCmTypes.ts`

**Analog:** `src/backend/storeManagers/steam/localFiles/rustSteamFiles.ts` (23 lines, copy whole):
```ts
export function invokeSteamFiles<C extends RustSteamFilesChannel>(
  deps: RustInvokeDeps, channel: C, args: SteamFilesArgsFor<C>
): Promise<SteamFilesResultFor<C>> {
  logDebug(`[steamfiles] rust ${channel}`, LogPrefix.Steam)
  return deps.requestRustInvoke(channel, [args] as RustInvokeArgsOf<C>) as Promise<SteamFilesResultFor<C>>
}
```
Keep the debug proof line naming the Rust path (live-gate evidence), the header "Exit contract: no timers, no handles, no work at import", and per-channel `ArgsFor<C>` / `ResultFor<C>` maps as in `steamFilesTypes.ts`. Log channel only, never args (token, password).

---

### `cm/steamCmFlags.ts`

**Analog:** `git show e88a189e7:src/backend/storeManagers/steam/localFiles/steamFilesFlags.ts` (entire file):
```ts
export type SteamFilesImpl = 'rust' | 'ts'
export const STEAMFILES_TEXT_DEFAULT: SteamFilesImpl = 'rust'
function pick(raw: string | undefined, fallback: SteamFilesImpl) {
  return raw === 'rust' || raw === 'ts' ? raw : fallback
}
export function steamFilesTextImpl(env: NodeJS.ProcessEnv = process.env): SteamFilesImpl {
  return pick(env.GAMELIB_STEAMFILES_TEXT, STEAMFILES_TEXT_DEFAULT)
}
```
Two flags per D-18: `GAMELIB_STEAMCM_SIGNIN` and `GAMELIB_STEAMCM_CM`. Env-only, pure, unknown value falls back silently; `*_DEFAULT` starts `ts`, flipped in a dedicated commit after approved parity (`e88a189e7` shape: "flipped to rust by plan N after PARITY.md APPROVED"). Jest pins `ts` through `src/backend/jest.setupContainment.ts` (75-25) and the pin is removed at the delete gate (75-34, commit `74738eab2`). Test shell: model on `localFiles/__tests__/steamFilesFlags.test.ts` from `2076d6431` (37 lines).

---

### `cm/SteamCmClient.ts` and `RustCmClient.ts` (the `cm=ts` seam)

**Analog:** `userTypes.ts:53-81` (`AuthenticatedLease.client` is `InstanceType<typeof SteamUserLib>`) plus the structural subsets already in the repo: `DepotSteamUser`, `PlatformCapturePicsClient`, `LicensedDemosPicsClient`, and `AnonymousPicsClient` (`anonymousClient.ts:30-40`):
```ts
interface AnonymousPicsClient {
  getProductInfo(apps: number[], packages: number[], inclTokens?: boolean): Promise<{
    apps?: Record<number, { appinfo?: unknown; missingToken?: boolean }>
    unknownApps?: number[]
  }>
}
```
Define the narrow interface from the methods production actually calls (RESEARCH Pattern 4): `steamID`, `licenses`, `getProductInfo`, `getDepotDecryptionKey`, `getManifestRequestCode`, `getContentServers`, `getUserOwnedApps`, `getPersonas`, `redeemKey`, abort. Both a cast steam-user and `RustCmClient` (one `rustInvoke` per method, lease id in args) satisfy it. Decide `_send` / `cdnAuth.ts` (Open Question 5) before writing the interface.

---

### `depotHostRegistration.ts` (modify)

**Analog:** itself, `src/backend/sidecar/depotHostRegistration.ts:1-50`. Keep: `caller: 'shell'` channels, validate with `validateInbound`, log channel + jobId only, error reason is the error name only (a message may echo a URL carrying a token), no timers or handles. Minimum change: `depotManifestRequestCode` handler calls the CM channel over rustInvoke instead of steam-user. Preserve the reply union that `depot_dispatch.rs:182-206` (`reply_to_code`) consumes: string, `null`, `{eresult: 40}`, `{unavailable: reason}`.

---

### `meta/gamelibSteamcmCli.ts` and `meta/steamcmParitySweep.ts`

**Analogs:** `meta/gamelibSteamfilesCli.ts`; `meta/depotParitySweep.ts`.

Spawn helper (lines 1-60): argv-form `spawnSync`, never a shell; fresh `createFakeHomeProfile({ prefix: 'gamelib-steamcm-' })` per call; `resolveSteamfilesCliPath` uses `CARGO_TARGET_DIR || join(cwd,'src-tauri','target')` then `debug/<name>[.exe]`; no `cargo build` from inside the fake HOME, the package.json `*-cli:build` prefix builds it; `assertSteamfilesCliPresent` throws the "Build it with: cargo build -p ... --manifest-path src-tauri/Cargo.toml" message. Conventions require a justified real-profile arm only if a defect arms under a populated profile; the sweep reads the operator's real token (via vault), so state that arm explicitly. Sweep output redacted; exit 0/1/3; zero inputs must fail.

---

### `steamCmChannelParity.test.ts`

**Analog:** `src/backend/__tests__/depotChannelParity.test.ts:1-70`. Static reads only. Extract `pub const OPS` from the crate `lib.rs` with `extractConst`, compare to the constant tuple, assert every channel is in `RUST_INVOKE_CHANNELS`, assert exactly one shell arm per op (via `readTauriShellProductionSource()`), `snakeToPascal` to map to the enum variant. Keep the anti-vacuity case (`expect(OPS).toHaveLength(n)` plus extractor throws on a missing name).

---

### `steamCmPortComplete.test.ts` (delete gate)

**Analog:** `src/backend/__tests__/steamFilesPortComplete.test.ts:1-110`. Structure: `DELETED` paths (`existsSync` false), `FORBIDDEN` strings scanned over `src` and `meta` with `stripComments`, `KEPT` fixtures, `SELF` excluded, anti-vacuity case proving the comment-stripper can fail, `package.json` dependency check. Phase 79 content per RESEARCH Runtime State Inventory: DELETED = `user.ts` client wiring, `macSteamOffline.ts` (if wrap went), `userSignIn.ts` steam-session code, `anonymousClient.ts`, `depot/cdnAuth.ts` (if decided), `steamCmFlags.ts`, `patches/lzma.patch`, `patches/steam-user.patch`; FORBIDDEN = `'steam-user'`, `'steam-session'`, `GAMELIB_STEAMCM_CM`, `GAMELIB_STEAMCM_SIGNIN`, lzma/zstddec imports; KEPT = `gamelib-steamcm/tests/fixtures/{expected,invocations,rust-results}.json`, both crate Cargo.toml files, `meta/gamelibSteamcmCli.ts`; package.json check drops `steam-user`, `steam-session`, `@types/steam-user`, `lzma`, `zstddec` (package.json lines 130/147/148/150/171) and the `pnpm-workspace.yaml` `patchedDependencies` lines 15-16.

---

### `gamelib-steamcm/tests/golden.rs`

**Analog:** `src-tauri/crates/gamelib-steamfiles/tests/golden.rs:1-50`. `include_str!` of `fixtures/invocations.json` and `expected.json`; `recorded_results` replays each invocation through `dispatch` and compares to committed `rust-results.json`, rewritten with an env flag (`GAMELIB_WRITE_STEAMFILES_RUST=1` there; use `GAMELIB_WRITE_STEAMCM_RUST=1`); `${FIXTURES}` token substitution through `with_root`. Jest replays `rust-results.json` so Jest needs no cargo (75 lesson). Goldens must carry recorded CM responses (PICS buffers, licence list, owned games) since CM calls cannot run in CI; the live path is covered by the Tier 2 sweep.

---

### CI and lockfile (config)

- `.github/workflows/rust-test.yml:117` is the explicit line to extend: `cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli -p gamelib-steamfiles -p gamelib-steamfiles-cli` add `-p gamelib-steamcm -p gamelib-steamcm-cli`; also update the comment at line 70 (g) and the step name at 114.
- `src/backend/__tests__/cargoFeatures.test.ts:189` `EXPECTED_LOCKFILE_CRATE_NAMES`: regenerate from `src-tauri/Cargo.lock` as the file header (lines 162-164) says, in the same commit as the crate add.
- `src-tauri/deny.toml`: add the RUSTSEC-2023-0071 ignore with the public-key-only justification (Pitfall 9); run `cargo deny check advisories` in plan 1 (CI-only locally).
- `src-tauri/src/main.rs`: explicit rustls provider install before `tauri::Builder` (082); no analog in repo today, so use RESEARCH TLS provider note (`rustls::crypto::ring::default_provider().install_default()`), add a test building a bare reqwest client after install.

## Shared Patterns

### Sidecar-shell call path
**Source:** `sidecar.rs:590-615`, `rust_dispatch.rs:11-30`
**Apply to:** every `cm_*` / `signin_*` / `refresh_*` op
Each rustInvoke frame runs on its own `thread::spawn`, so `dispatch` may block; the router resolves the wire name via `RustInvokeChannel::from_name` and an exhaustive `match`:
```rust
thread::spawn(move || {
    let result = dispatch_rust_channel(&channel, &args, &worker_app);
    let response = match result {
        Ok(v) => serde_json::json!({ "id": id, "ok": true, "result": v }),
        Err(e) => serde_json::json!({ "id": id, "ok": false, "error": e }),
    };
    let _ = worker_state.write_raw(&response);
});
```
Never `block_on` from a thread already inside the CM runtime or a depot async task (Pitfall 2); depot host callbacks come from `spawn_blocking` threads and are safe.

### Secret hygiene
**Source:** `depot_dispatch.rs:6-7` (T-28-04 / T-73-46), `depotHostRegistration.ts:20-23` (T-73-41)
**Apply to:** all steamcm Rust and TS files
Log channel name and ids only; never args, results, tokens, passwords, request codes; no `Debug` derive on secret-bearing structs; assert `SSLKEYLOGFILE` unset at session start.

### Sidecar exit contract
**Source:** `rustSteamFiles.ts:7`, `anonymousClient.ts:11-16`, `CLAUDE.md` Conventions
**Apply to:** all new TS wrappers
No timers/handles/work at import; every timer `unref()`d or on the boot clock; in-flight rustInvoke Promises are not handles; QR poll timers must be unref'd or cleared. `stdinEofRelease.ts` keeps its steam-user entry until the delete gate.

### Spawn isolation
**Source:** `meta/gamelibSteamfilesCli.ts` header
**Apply to:** `meta/gamelibSteamcmCli.ts`, the Mac helper spawn tests
`createFakeHomeProfile()`, never a hand-rolled `env` literal.

### Flag-then-delete lifecycle
**Source:** commits `2076d6431` (add), `e88a189e7` (flip default), `74738eab2` (delete + remove Jest pin)
**Apply to:** `cm` and `sign-in` flags, and the per-install `logonID` (new `configStore` key, steam-user `logOn` option while `cm=ts` exists, D-18).

### Prettier verify
**Source:** `CLAUDE.md` rule 5
**Apply to:** every task `<verify>`: `npx prettier --check` over exact paths, after `--file-info`; omit with a note if all paths are prettier-ignored.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `gamelib-steamcm/src/session.rs` (long-lived stateful actor) | service | event-driven | No production Rust in the repo holds a long-lived network session. Use spike 085 call shapes and RESEARCH Patterns 2-3; `depot` registry (`cancel_all`) is only a partial lifecycle analog. |
| `gamelib-steamcm/tests/session_fake.rs`, `anon_fake.rs` | test | event-driven | No fake-backend or paused-clock session tests exist. Closest: `gamelib-depot` uses tokio `test-util`; build the `FakeBackend` per RESEARCH Pattern 2. |
| `gamelib-steamcm/tests/webauth_mock.rs` | test | request-response | No local mock HTTP server exists in the Rust crates. wiremock (needs the human-verify checkpoint) or a hand-rolled `tokio` TCP listener. |
| rustls provider install in `main()` | config | n/a | Not present today; only spike 082 README. Include the post-install bare-reqwest test. |
| credentials flow (`GetPasswordRSAPublicKey` + RSA encrypt + guard code) | service | request-response | Spike 072 did credentials through steam-vent's CM `login`, not the Web API; only the QR half of `webapi()` is a direct analog. Port behaviour from `userSignIn.ts` plus the `steam-session` source. |
| `gamelib-steamcm/src/refresh/*` HTTP enrichment | service | batch | No Rust reqwest code against store.steampowered.com exists; `gamelib-depot` uses reqwest for CDN only (`rustls-no-provider`). Port from `gameMetadata.ts`. |

## Metadata

**Analog search scope:** `src-tauri/crates/*`, `src-tauri/src/*dispatch*.rs`, `sidecar.rs`, `rust_dispatch.rs`, `ipc_contract.rs`, `src/backend/storeManagers/steam/{localFiles,*.ts}`, `src/backend/sidecar`, `src/common/types/sidecarTransport.ts`, `src/backend/__tests__`, `meta/`, `.planning/spikes/{072,073,084,085}`, git history for the deleted flags file.
**Files scanned:** about 30 (read or excerpted); graphify was not run (hook advisory noted; direct reads of exact files named in the task).
**Pattern extraction date:** 2026-11-14
