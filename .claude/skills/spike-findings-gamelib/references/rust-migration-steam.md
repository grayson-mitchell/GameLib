# Rust migration of the Steam stack (depot pipeline, delta updates and CM client)

The Node sidecar exists because the backend is Node and Tauri has no JavaScript runtime. The
migration moves it to Rust piece by piece (Phase 63 scanners → Phase 73 depot pipeline → Phase 75
local file formats → a later CM-client slice). This reference covers what the spikes proved about
the two Steam-heavy slices: the **depot download pipeline** (067a–c, now Phase 73's
`gamelib-depot`) and the **CM client** that replaces `steam-user`/`steam-session` (071–074), plus
running the two clients side by side during the migration (077) and the combined stack on Windows
and Linux (080).

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
- **Give the sidecar's steam-user client a non-zero, per-install `logonID` before any
  authenticated Rust CM session runs beside it.** Steam identifies a session by (account, public
  IP, `obfuscated_private_ip`). steam-user sends 0 by default (as `user.ts:885` does) and steam-vent
  hard-codes 0, so the two kick each other with `LogonSessionReplaced` (34), the later logon
  winning, in either order. A distinct `logonID` on either side keeps both alive. Two authenticated
  *Rust* sessions would need a steam-vent patch, so share one session instead. *(077)*
- **Subscribe to `CMsgClientLoggedOff` for the whole life of a Rust session.** After a kick, every
  call fails fast with "Trying to work with closed connection", which doesn't say why; the
  reason (34 replaced vs a network drop) arrives only on that message. *(077)*
- **The Rust Steam stack is cross-platform as-is.** steam-vent + `gamelib-depot` build and run
  unchanged on Windows x64 (MSVC and GNU) and Linux x64; no NASM, cmake or OpenSSL needed, and
  binaries link only OS libraries. *(080)*
- **Install one rustls crypto provider explicitly at shell start.** steam-vent brings aws-lc-sys
  into `src-tauri` (none today) and calls `aws_lc_rs::default_provider().install_default()` on
  every CM connect, which beats `gamelib-depot`'s `ring` install (`fetch.rs:91-94`, which tolerates
  losing). Otherwise the active provider depends on whether a CM connect or a CDN fetch runs first.
  Staying ring-only means patching steam-vent (no default features; provider passed in). *(080)*
- **Keep the macOS go-offline wrap** around every authenticated CM logon; it works unchanged from
  Rust. Its premise needs re-testing: see Constraints. *(074)*
- **Bridge-game updates are a chunk-level delta in `gamelib-depot` (`DepotRef.fromManifest`).**
  File-level reconcile (today's SHA-1 gate pointed at the new manifest) barely beats a full
  download on Unreal titles: Manor Lords 6.7 vs 7.0 GB, chunk-level **0.9 GB**; Abiotic Factor
  2.2 vs 2.3 GB, chunk-level 0.44 GB. (076)
- **Never overwrite or delete an old file before every new file is built.** Reuse is mostly
  moved within a file and can be cross-file (3.7 GB on Manor Lords). Build temps, verify
  `sha_content`, rename, then delete removed files. (076)
- **SHA-1 every reused chunk from local bytes;** a rejected chunk becomes a CDN chunk. The shim
  and game-written files drift from the manifest. (076)
- **Hand the shim over when an update changes a shimmed `steam_api*.dll`:** new genuine DLL →
  `.gamelib-orig`, then re-place the shim and rewrite `gamelib_bridge.cfg`. Otherwise leave it
  alone. (076)

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

### Run beside the sidecar during the migration (077)

```ts
// user.ts: any non-zero u32, generated once per install and persisted (not per logon)
client.logOn({ refreshToken, logonID: installLogonId })
```

steam-vent has no setter; `obfuscated_private_ip` is `set_v4(0)` in `session.rs` `login()` and
`anonymous()`. Anonymous sessions never collide (each gets its own anonymous SteamID), so the
sidecar's always-on anonymous client and a Rust anonymous session are safe together. Mac Steam
sends its real private IP and is never kicked by either.

```rust
// Watch for kicks for the session's whole life, not just at logon.
let mut logged_off = Box::pin(unauth.on::<CMsgClientLoggedOff>());   // before logon
let conn = unauth.login_with_refresh_token(&token).await?;
tokio::spawn(async move {
    if let Some(Ok(m)) = logged_off.next().await { /* m.eresult(): 34 = replaced → drop session, don't retry-loop */ }
});
```

### Build for Windows and Linux (080)

- Nothing platform-specific is needed. The proven chain (`sources/080-rust-steam-stack-win-linux/
  src/main.rs`) is logon → licenses → PICS public GID → depot key → request code → CDN hosts →
  `gamelib_depot::dispatch("depot_manifest_summary", …)`. Drop the CM tokio runtime before
  calling `dispatch`, which `block_on`s its own runtime.
- **aws-lc-sys on MSVC needs no NASM:** aws-lc-rs enables aws-lc-sys's `prebuilt-nasm` feature by
  default, so with NASM absent it uses the shipped objects (proven with NASM hidden on
  windows-latest). `AWS_LC_SYS_PREBUILT_NASM=1` is not required. windows-latest has NASM anyway
  (Strawberry Perl).
- Cold CI builds with `-vv` and no cache: ~6 min on windows-latest MSVC, ~2–2.5 min on Ubuntu.
  Linux binaries need the build host's glibc (2.38 from ubuntu-24.04, 2.34 from 22.04).
- **steam-vent main's anonymous logon:** `send_logon` demands a token (`NoToken`). The one-line
  fix (`sources/080-rust-steam-stack-win-linux/vendor.sh`) substitutes a placeholder JWT that
  passes steam-vent's own check (`iss` `steam`, valid SteamID `sub`) and is never sent. Anonymous
  then gets depot keys for anonymous-licensed apps (TF2 Dedicated Server 232250; Steamworks SDK
  Redist 1007 → depot 1004), which makes a secret-free CI probe possible.

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

### Delta updates for bridge installs (076)

Fills the reserved `DepotRef.fromManifest` slot (`delta_unsupported` in Phase 73). Proven on APFS
clones of Mining Mechs and Manor Lords with production's own `parse_manifest` and
`container::decode_chunk` (`sources/076-bridge-delta-update/, sources/077-dual-cm-session-coexistence/,
sources/080-rust-steam-stack-win-linux/src/bin/apply.rs`):

1. **Manifests.** Old = the install's GID from the ACF (`InstalledDepots`, read as a string);
   new = PICS public branch. Request codes were still issued for all six install-time GIDs
   (2–8 weeks old), but cache the installed manifest in `ManifestStore` at install time and
   exempt it from `KEEP_GIDS` pruning while installed.
2. **Work set** = new-manifest files (not dirs or symlinks) whose `sha_content` differs from the
   old entry, or which are new. Unchanged files are never touched, so a shim on an unchanged DLL
   survives. Match paths with `normalize_depot_path`.
3. **Plan.** Index old-manifest chunks `sha → [(old file, offset, cb_original)]`. For each
   work-set chunk, read the candidate bytes with `read_exact_at` and SHA-1 them; the first match
   is a local source, otherwise the chunk goes on the CDN list. Manor Lords: 12.4 GB of
   candidates read and hashed in 8.1 s.
4. **Fetch** only the CDN list through the existing `Fetcher` (2,178 chunks / 915.6 MiB in 50 s).
5. **Build** each work file as `<path>.<tmp>`: `set_len(size)`, write every chunk at its offset
   (local bytes, or `decode_chunk` for CDN bodies), `sync_all`, verify `sha_content`. Any failure
   deletes the temps and leaves the old tree intact.
6. **Commit:** rename every temp over its target, then delete files the new manifest dropped
   (old-manifest-owned paths only; GameLib's `.gamelib-orig`, `gamelib_bridge.cfg`, dxvk caches
   and logs aren't owned, so they survive). Then apply file modes, rewrite the ACF (`buildid`,
   `InstalledDepots` GIDs) and redo the GID-keyed follow-ups (shim, redist ledger, DRM verdicts).
7. **Resume:** interrupted before commit means the old tree is intact. Interrupted during
   commit means each file is whole-old or whole-new, and today's SHA-1 reconcile against the
   new manifest finishes it.

Results: Mining Mechs 48/49 and Manor Lords 111/112 match the new manifest (misses: an untouched
shim, a game-modified `.ini` the update doesn't change, correctly left alone). Manor Lords ran
about 83 s end to end against ~6.5 min for a full download.

| Game (076) | full | file-level | chunk-level |
|---|---|---|---|
| Mining Mechs | 110 MiB | 18.8 MiB | 5.7 MiB |
| Core Keeper | 547 MiB | 65 MiB | 34 MiB |
| Hell Clock | 1,468 MiB | 496 MiB | 435 MiB |
| The Planet Crafter | 3,581 MiB | 514 MiB | 97 MiB |
| Abiotic Factor | 2,288 MiB | 2,220 MiB | 444 MiB |
| Manor Lords | 7,011 MiB | 6,710 MiB | 916 MiB |

## What to Avoid

- **steamroom's `login()` and the high-level `TokenLogin` as-is.** `login()` returns at the logon
  response and discards the license list (485 licenses), and its receiver channel is never fed.
  `TokenLogin` requires an account name. Workaround in 071a: wrap the WebSocket transport in
  `RecordingTransport` and parse the recorded frames.
- **steam-client-lib with GameLib's stored tokens:** it always sets `account_name` (sealed
  `Account` trait), and an empty name is refused (`InvalidPassword`). It also pulls
  reqwest 0.11 + native-tls (OpenSSL) through bot extras.
- **steam-vent main's anonymous logon:** `send_logon` parses `access_token` and fails with
  `NoToken` when it's absent, so every anonymous logon fails at `a9e8164`. Released 0.5.0 works;
  080's `vendor.sh` holds a one-line fix for `a9e8164`.
- **Two authenticated sessions on one account with the same `logonID`** (steam-user's default 0
  vs steam-vent's hard-coded 0). The later logon kicks the earlier with 34. Production already
  treats 34 as not-a-credential-problem (`user.ts:536`), so the kick shows as a dropped session,
  failing whatever was in flight. (077)
- **Relying on whichever TLS provider installs first.** `install_default()` is first-wins, and
  both crates call it. (080)
- **Reading a GNU cross-build as proof for MSVC.** On `windows-gnu`, aws-lc-sys assembles with
  mingw and never consults NASM; MSVC build scripts take a different path. (080)
- **QR over steam-vent's CM connection:** its unauthenticated service call is `pub(crate)`.
- **Package info without access tokens** (939 vs 1,144 app IDs).
- **Back-to-back wrapped logons without a gap:** the second wrap refuses (correctly) while Mac
  Steam is still reconnecting from the previous `goonline`; allow ~15 s or share one session.
- **Patching files in place during a delta.** Moved and cross-file reuse means an in-place
  write destroys chunks that later files still need. (076)
- **Trusting a local file because the old manifest lists it.** Verify each reused chunk. (076)
- **Budgeting disk by download size.** The temp-file build needs free space for the total size
  of the changed files (~13 GB for Manor Lords), not the 0.9 GB download. (076)
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
  Steam Guard codes (email and mobile), the QR token's own logon, a real key redeem, Windows on
  ARM64 and Linux aarch64, and a signed-in run on real Windows/Linux (signed in under Wine only).
- **Cross-platform (080):** CI run 42667918251, windows-latest MSVC ×3 (NASM present / hidden /
  prebuilt) + ubuntu-22.04/24.04, anonymous runs on 232250 and 1007: all PASS in 1.8–3.9 s. Windows
  GNU ran signed in under Wine-Staging 11.20 (Rosetta) with results identical to macOS (485
  licenses, 198 files / 3.2 GB manifest).
- **Session coexistence (077):** n=1 account, one public IP; the same-NAT, two-machine case is
  inferred from the identity rule, not tested.
- **Depot decode numbers (067b):** Civ V mix 177 MiB/s single thread both; Rust 5.8 vs Node 9.3
  cpu-s/GiB (~8% of ~1 core system-wide). Node's pure-JS LZMA fallback is a 6× cliff.
- **067c was not run:** its trigger (memory inherent to Node) wasn't met; the 2.75 GB RSS was the
  decode-worker bundle, fixed in Node (`b8f015a08`, `db95a4373`).

## Origin

Synthesized from spikes: 067a, 067b, 067c, 071a, 071b, 071c, 072, 073, 074, 076, 077, 080 (with 010, 002,
070 as prior art).
Source files available in: sources/067a-node-pipeline-stage-profile/, sources/067b-chunk-decode-bench/,
sources/067c-rust-depot-job/, sources/071a-cm-crate-steamroom/, sources/071b-cm-crate-steam-client-lib/,
sources/071c-cm-crate-steam-vent/, sources/072-rust-signin-refresh-token/,
sources/073-rust-owned-apps-parity/, sources/074-rust-logon-friends-wrap/,
sources/076-bridge-delta-update/
