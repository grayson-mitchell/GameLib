# Rust migration of the Steam stack (depot pipeline and CM client)

The Node sidecar exists because the backend is Node and Tauri has no JavaScript runtime. The
migration moves it to Rust piece by piece (Phase 63 scanners → Phase 73 depot pipeline → Phase 75
local file formats → a later CM-client slice). This reference covers what the spikes proved about
the two Steam-heavy slices: the **depot download pipeline** (067a–c, now Phase 73's
`gamelib-depot`) and the **CM client** that replaces `steam-user`/`steam-session` (071–074).

## Requirements

**Depot pipeline (067a–c):**

- A Rust depot pipeline must be justified on CPU, memory or code removal, **not speed**. On the
  operator's connection the Node pipeline is network-bound at ~18 MiB/s with decode at 3 ms per
  chunk. Phase 73's stated reason is retiring the sidecar. *(067a)*
- Do not raise `TARGET_INFLIGHT_CHUNKS` above 32 on current evidence: 96 gave no gain and 57
  timeouts. *(067a)*
- Rust decode needs `--cfg aes_armv8` and a non-default `flate2` backend (`zlib-rs`); the defaults
  are 20× (AES) and ~2.5× (deflate) slower than Node's C paths. Prefer `xz2` (C liblzma) over
  `lzma-rs` (~30% slower). *(067b)*

**CM client (071–074):**

- **Use a Rust crate for the CM half only.** The CDN half (manifest fetch, chunks, decrypt,
  decompress, write) is Phase 73's `gamelib-depot`. A crate's own content pipeline is duplicate,
  not an asset. *(071c)*
- **The CM client must have a message pump:** replies routed by `jobid_target`, every other
  message delivered to subscribers, heartbeats, safe concurrent calls. A request/response client
  silently drops the license list and would drop `LoggedOff`/kicks. *(071a)*
- **Refresh-token logon must not require an account name.** GameLib stores only the token and
  SteamID64, and existing users must not have to sign in again. Take the SteamID from the JWT
  `sub`; leave `account_name` unset. *(071a, 071c; 071b refused with an empty name)*
- **Do QR sign-in over the Steam Web API** (`IAuthenticationService` over HTTPS), not the CM. It
  needs no crate patch and no user logon (so no go-offline wrap). Handle the ~22 s challenge
  rotation. *(072)*
- **Fetch package access tokens before PICS package info**, or token-gated packages come back
  without their app IDs (939 vs 1,144 on the same account). *(073)*
- **Do not depend on CDN auth tokens:** `GetCDNAuthToken` fails for steam-user and steamroom
  alike on current hosts, and Phase 73's pipeline runs without them. *(071a)*
- **Keep the macOS go-offline wrap** around every authenticated CM logon; it works unchanged from
  Rust. Its premise needs re-testing: see Constraints. *(074)*

## How to Build It

### Choose the CM crate: steam-vent (codeberg main), steamroom as fallback

| | steamroom | steam-client-lib | **steam-vent** (main `a9e8164`) |
|---|---|---|---|
| Pump / heartbeat / concurrent calls | ✗ none | ✓ + reconnect | ✓ (reconnect not checked) |
| Logon with existing token, no account name | ✓ (raw logon) | ✗ InvalidPassword | ✓ |
| License list | dropped by `login()` | event | typed subscription |
| PICS / depot key / request code / CDN hosts | ✓ typed | ✓ via ~50 lines of markers | ✓ generic typed calls |
| Multi-part PICS | ✓ | ✗ | ✓ `job_multi` |
| QR helper | ✓ | ✗ | ✗ (use the Web API) |
| New native deps vs `src-tauri` | none | openssl-sys (Linux) | aws-lc-sys |
| Protobuf runtime | prost (= shell) | rust-protobuf | rust-protobuf |

steam-vent: pin the git `rev` until 0.6.0 ships, and fix the anonymous-logon regression (below).

### Logon with GameLib's existing token, without missing the license list

```rust
let servers = ServerList::discover().await?;
let unauth = UnAuthenticatedConnection::connect(&servers).await?;
// subscribe BEFORE logon: the license list arrives in the same burst as the logon response
let mut licenses = Box::pin(unauth.on::<CMsgClientLicenseList>());
let token = RefreshToken::new(stored_refresh_token)?;      // steam-session SteamClient token
let conn = unauth.login_with_refresh_token(&token).await?;  // sends no account_name
let list = tokio::time::timeout(Duration::from_secs(10), licenses.next()).await?;
```

Everything else the sidecar takes from steam-user is a generic typed call on `conn`:

```rust
// PICS (job_multi handles response_pending splits)
let tok: CMsgClientPICSAccessTokenResponse = conn.job(CMsgClientPICSAccessTokenRequest { appids, packageids, ..Default::default() }).await?;
let parts = conn.job_multi::<_, CMsgClientPICSProductInfoResponse>(product_info_request);
// depot inputs for gamelib-depot's DepotRef / HostRef
let key: CMsgClientGetDepotDecryptionKeyResponse = conn.job(CMsgClientGetDepotDecryptionKey { depot_id, app_id, ..Default::default() }).await?;
let code = conn.service_method(CContentServerDirectory_GetManifestRequestCode_Request { app_id, depot_id, manifest_id, app_branch: Some("public".into()), ..Default::default() }).await?;
let cdn = conn.service_method(CContentServerDirectory_GetServersForSteamPipe_Request { cell_id: Some(0), max_servers: Some(20), ..Default::default() }).await?;
// ownership (library/refresh.ts options)
let owned = conn.service_method(CPlayer_GetOwnedGames_Request { steamid, include_appinfo: Some(true), include_played_free_games: Some(true), include_free_sub: Some(false), skip_unvetted_apps: Some(true), ..Default::default() }).await?;
// redeem
let r: CMsgClientPurchaseResponse = conn.job(CMsgClientRegisterKey { key: Some(k), ..Default::default() }).await?;
```

PICS appinfo buffers are text VDF (`keyvalues-parser`); package buffers are binary KV with a
4-byte package-id prefix (a ~60-line reader in `sources/073-rust-owned-apps-parity/src/main.rs`).

### QR sign-in over the Web API

`POST https://api.steampowered.com/IAuthenticationService/{BeginAuthSessionViaQR|PollAuthSessionStatus}/v1`
with form field `input_protobuf_encoded` = base64 of the request message; the response body is
the protobuf, and `x-eresult: 1` means success. Use platform `SteamClient` (as `userSignIn.ts`
does) so the token's `aud` includes `client`. Poll at the returned `interval`; on
`new_client_id` swap the client ID and redraw the QR from `new_challenge_url`. The success
response carries `refresh_token` and `account_name`. See `sources/072-rust-signin-refresh-token`.

### Password + Steam Guard

steam-vent `UnAuthenticatedConnection::login(account, password, guard_store, handler, &ClientInfo)`
with a custom `AuthConfirmationHandler` that waits for a typed code **and** lets steam-vent
accept app approval in parallel (it polls the auth session itself). Use a no-op
`GuardDataStore` unless GameLib wants machine tokens persisted. This call ends in a CM user
logon, so it runs inside the go-offline wrap on macOS.

### Feed gamelib-depot

The CM half produces exactly `DepotRef { depotId, manifestId, requestCode, key (hex), ownerAppId }`
and `HostRef[]` from `GetServersForSteamPipe`; pass `tokens: {}`. Proven end-to-end in 071a:
steamroom-supplied inputs → `gamelib-depot-cli summarize` decrypted the real manifest (198
files, 3.2 GB).

## What to Avoid

- **steamroom's `login()` and the high-level `TokenLogin` as-is.** `login()` returns at the logon
  response and discards the license list (485 licenses), and its receiver channel is never fed.
  `TokenLogin` requires an account name. Workaround in 071a: wrap the WebSocket transport in
  `RecordingTransport` and parse the recorded frames.
- **steam-client-lib with GameLib's stored tokens:** it always sets `account_name` (sealed
  `Account` trait), and an empty name is refused (`InvalidPassword`). It also pulls
  reqwest 0.11 + native-tls (OpenSSL) through bot extras.
- **steam-vent main's anonymous logon:** `send_logon` parses `access_token` and fails with
  `NoToken` when it's absent, so every anonymous logon fails at `a9e8164`. Released 0.5.0 works.
- **QR over steam-vent's CM connection:** its unauthenticated service call is `pub(crate)`.
- **Package info without access tokens** (939 vs 1,144 app IDs).
- **Back-to-back wrapped logons without a gap:** the second wrap refuses (correctly) while Mac
  Steam is still reconnecting from the previous `goonline`; allow ~15 s or share one session.
- **Re-running the depot speed question.** It is network-bound (067a); a Rust pipeline can't be
  faster on the operator's connection.

## Constraints

- **Parity proven on the operator's account:** anonymous PICS (4 apps, all manifest GIDs), depot
  key (SHA-1 identical across steam-user and all three crates), request code, CDN host count,
  `GetOwnedGames` 390 = 390 (IDs, names, playtime, last played), license app IDs 1,144 = 1,144.
- **Round-trip latency:** steamroom ~0.25 s (WebSocket), steam-vent ~0.3–0.4 s, steam-client-lib
  ~0.55 s (TCP, likely Nagle: no `set_nodelay`).
- **steam-vent's logon shape** is fixed: `client_os_type` 203, `chat_mode` 2, empty machine name,
  protocol 65580.
- **Friends sign-out premise (074):** inside the wrap, a Rust logon keeps Mac Steam's Friends
  signed in, with both sessions alive for 2 minutes. But on 2026-11-09 a *bare* unwrapped logon
  (Rust **or** GameLib's steam-user logon, held 60 s) also left Friends signed in. Either Steam
  changed since late October or the trigger is GameLib's post-logon refresh work. Keep the wrap
  until GameLib's full refresh sequence is retested unwrapped on a fresh Mac Steam.
- **Untested:** Family Sharing licenses, a PICS answer actually split across messages, typed
  Steam Guard codes (email and mobile), the QR token's own logon, a real key redeem, and Windows
  and Linux builds (inferred low-risk for steamroom from shared deps only).
- **Depot decode numbers (067b):** Civ V mix 177 MiB/s single thread both; Rust 5.8 vs Node 9.3
  cpu-s/GiB (~8% of ~1 core system-wide). Node's pure-JS LZMA fallback is a 6× cliff.
- **067c was not run:** its trigger (memory inherent to Node) wasn't met; the 2.75 GB RSS was the
  decode-worker bundle, fixed in Node (`b8f015a08`, `db95a4373`).

## Origin

Synthesized from spikes: 067a, 067b, 067c, 071a, 071b, 071c, 072, 073, 074 (with 010, 002 as
prior art).
Source files available in: sources/067a-node-pipeline-stage-profile/, sources/067b-chunk-decode-bench/,
sources/067c-rust-depot-job/, sources/071a-cm-crate-steamroom/, sources/071b-cm-crate-steam-client-lib/,
sources/071c-cm-crate-steam-vent/, sources/072-rust-signin-refresh-token/,
sources/073-rust-owned-apps-parity/, sources/074-rust-logon-friends-wrap/
