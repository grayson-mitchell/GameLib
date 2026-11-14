# Phase 79: Rust CM client replacing steam-user and steam-session - Research

**Researched:** 2026-11-14
**Domain:** Rust migration of the Steam CM/auth stack (steam-vent, Steam Web API sign-in), macOS Mac Steam integration, Tauri shell + Node sidecar boundary
**Confidence:** MEDIUM-HIGH. The CM calls, sign-in shape and migration pattern are well evidenced by spikes 071-085 and Phases 63/73/75. Two inputs are open by design: spike 085 Run C (D-01 and probe tuning), and the D-12 boundary for "all of Refresh" (see Open Questions 1 and 2).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward (not re-asked)**
- **Phase 63/73/75 pattern:**
  - a Tauri-free crate in the `src-tauri/` Cargo workspace, called in-process over `rustInvoke`, with TypeScript signatures unchanged (they turn async where they were sync, 63 D-09);
  - a CLI binary for headless tools, and `createFakeHomeProfile()` for any spawn from `src/` or `meta/`;
  - a parity harness;
  - the delete gate (sweep with zero unexplained diffs, a live macOS `pnpm tauri:dev` smoke, and `cargo test` green on all three CI legs), then delete the TypeScript clients and both npm packages inside this phase.
- **CM crate:** steam-vent from codeberg main, with the git `rev` pinned until 0.6.0 ships. At `a9e8164` it needs the one-line anonymous-logon fix from 080's `vendor.sh`.
- **Refresh-token logon sends no account name.** The SteamID comes from the JWT `sub` (071a/c).
- **Subscriptions:** subscribe to `CMsgClientLicenseList` before logon, and to `CMsgClientLoggedOff` for the whole life of each session (077).
- **Package access tokens come before PICS package info** (073: 939 vs 1,144 app IDs).
- **No dependency on CDN auth tokens** (071a).
- **One explicit rustls provider install at shell start**, in `main()` before `tauri::Builder` (082). Ring vs aws-lc is the planner's choice.
- **QR sign-in runs over the Steam Web API** (`IAuthenticationService`, platform `SteamClient`), and handles the ~22 s challenge rotation (072).

**Session lifetime and ownership**
- **D-01 (Claude's discretion):** lease-and-idle-close vs an app-lifetime signed-in session. Today's model: lease on demand, concurrent acquires share one logon, close `AUTH_SESSION_IDLE_GRACE_MS` (60 s) after the last release. Decide in planning using 085's final results. Default lean: keep lease + idle close. On macOS, D-14 removes the signed-in logon from Refresh entirely, so a long-held session buys little.
- **D-02: Mid-lease death means detect, reconnect, and retry once.** GameLib owns liveness, because steam-vent's heartbeat and read-loop failures never reach the caller (085). On a failed or timed-out call: probe, rebuild the connection (new `ServerList` pick + refresh-token logon, with backoff), then retry the failed call once. `LoggedOff` eresult 34 (session replaced) means stop and drop the session, with no retry loop.
- **D-03: Rust owns the whole session.** The crate owns the connection, liveness, reconnect, lease counting, idle close and ordering against the go-offline wrap. `user.ts`'s `acquireAuthenticated` / `acquireOpenAuthenticated` / `ensureConnected` / `releaseForShutdown` surface becomes thin calls into Rust with the same signatures. The guarantees today's `user.ts` makes carry over: "never log off a caller mid-download"; shutdown release abandons a logon in flight, then pays any goonline owed; no logon lands after sign-out.
- **D-04: The anonymous client is a separate Rust anonymous session with idle close.** It keeps today's behaviour: one shared session, a 15 s connect bound, and a 60 s idle close counted from the last in-flight read (54-REVIEW WR-09). It never shares the signed-in session.

**Sign-in and tokens**
- **D-05: Credentials + Steam Guard also run over the Web API, like QR.** Today's `steam-session` path, ported: `GetPasswordRSAPublicKey` -> RSA-encrypt -> `BeginAuthSessionViaCredentials` -> `UpdateAuthSessionWithSteamGuardCode` -> poll for completion or app approval. No CM logon at sign-in, and one HTTPS auth module for both flows. EResults are mapped onto today's UI states. (Deciding factors: keeps sign-in off the CM and out of the wrap, avoids `logonID` collisions during the fallback window, keeps one flow shape, and steam-vent's CM login is not verified to hand back a `SteamClient` refresh token.)
- **D-06: After sign-in, keep today's one wrapped logon to read the persona name**, through the normal session path, bounded at 5 s. If it fails, show the account name (`finishAuth` / `resolveSignInProfile` behaviour). The token is stored before that logon, as today.
- **D-07: Refresh-token continuity is parity: reuse the token, no renewal.** The Rust logon uses the stored steam-session token unchanged. The live gate must show an existing signed-in user staying signed in with no new sign-in. An expired or refused token goes down today's credential-refusal -> `credentialsMissing` path.
- **D-08: No Steam Guard machine tokens are persisted** (parity). Use a no-op guard-data store.

**macOS go-offline wrap**
- **D-09: Retest in this phase, then decide.** Add a live gate item: GameLib's full Refresh sequence run unwrapped against a freshly started Mac Steam, watching whether Friends stays signed in. The Friends UI is operator-confirmed; 081 measured only `BLoggedOn`. Pass: delete the wrap in this phase. Fail: keep it. Schedule the retest early, so the D-10 port is skipped if the wrap goes. D-14 removes Refresh's signed-in logon on macOS whenever Mac Steam is running. The retest must cover the CM fallback Refresh path, which still logs on.
- **D-10: While the wrap exists, it is ported to Rust.** `steam://open/gooffline` / `goonline`, the `connection_log.txt` LogOff watch, the 5 s guided-offline refusal (`GuidedOfflineRequiredError` semantics: "never a silent logon"), and the owed-goonline record with its boot and shutdown cover all move. The owed record's on-disk format stays readable by both sides during the fallback window. It is currently versioned by the Phase 68 store engine.
- **D-11: Reconnects go through the wrap.** A D-02 reconnect is a cold logon with Mac Steam back online, so it is wrapped. If the wrap refuses, the retried call fails with today's guided-offline error. It respects the ~15 s spacing between back-to-back wrapped logons (074).

**Scope edges**
- **D-12: All of the library Refresh moves to Rust.** That is not just the CM calls: the orchestration, the HTTP store metadata/artwork enrichment (today axios via `gameMetadata.ts` and friends), `licensedDemos`, and metacritic capture. This reverses Phase 75 D-02's deferral. reqwest replaces axios for Steam Refresh only. Other stores' axios use is untouched. Rust returns the finished library to the existing TS call site.
- **D-13: One phase, in sequence.** Plan order: 1. CM crate, session and sign-in; 2. the Rust Refresh on the CM path; 3. the Mac Steam owned-apps path on top; 4. the delete gate. No thin intermediate Refresh that gets rewritten later.
- **D-14: The Mac Steam owned-apps path is primary on macOS, with CM as fallback** (folded todo, spike 084). Use it when Mac Steam is running, `BLoggedOn` holds, and `GetSteamID` equals the stored `userData.steamId`. Refresh takes `GetSubscribedApps`: call twice (count, then a buffer of that size); resolve slots by function ID with a uniqueness check, never a hard-coded index; filter by PICS `common.type == game`, with names and types from an anonymous PICS lookup. Free-to-play titles the account holds appear, as they do in Steam's own library. Demos are intersected with Steam's set, which fixes the two demos Steam hides. Any guard failure or account mismatch falls back to the CM path. Windows and Linux always use CM.
- **D-15: The Mac Steam read runs out of process.** It runs in the existing bridge helper (`native/steam-bridge/helper/`, as 084 did) or a small sibling binary, never by loading `steamclient.dylib` into the Tauri process. A crash or bad slot resolution falls back to CM.
- **D-16: Refresh parity compares the finished library on the CM path.** TS vs Rust Refresh on the operator's account, diffing the final library: app IDs, names, art URLs, metacritic, demos and playtime. Each divergence is explained and recorded (63 D-07: the old code is not assumed correct). The Mac Steam path is checked separately against 084's set, because it is meant to differ (F2P, hidden demos).
- **D-17: The install/uninstall/update polling state machines stay in TypeScript.** They use no CM and become a later slice.
- **D-18: Two dev/advanced-only fallback flags,** hidden from the normal UI and deleted at the delete gate (75 D-08 shape): `sign-in`: Web API QR + credentials; `cm`: every CM call, anonymous and signed-in, plus Refresh. Each defaults to `rust` once its own parity passes, and either can be held on `ts` alone. While `cm=ts` is possible, steam-user's `logOn` gets a non-zero per-install `logonID`, generated once and persisted, so a Rust and a TS session never kick each other with 34 (077/081). Production sets none today.

**Amendments this phase must make**
- `.planning/research/STEAM-STACK.md`: replace the frozen `steam-user` / `steam-session` entries with steam-vent (pinned rev), Web-API sign-in and the reqwest Refresh. Record why the freeze was lifted (071-085).
- `CLAUDE.md` "Technology Stack (Steam)" short version must follow the amendment.

### Claude's Discretion
- D-01: session model (lease + idle close vs app-lifetime), informed by 085 Run C.
- Crate placement (new crate, e.g. `gamelib-steamcm`, or folded into an existing one), CLI binary shape, channel names and JSON result shapes. Result shapes mirror today's TS types.
- The liveness probe (085 used a PICS access-token job for app 480, 10 s timeout), reconnect backoff (085: 5->60 s), and how the 92 s unexplained stall in 085 Run A is bounded.
- The rustls provider (ring vs aws-lc).
- How the Rust session's async runtime coexists with `gamelib-depot`'s own `block_on` (080: drop the CM runtime before `dispatch`).
- Whether Jest tests for TS callers mock the async boundary or spawn the real CLI.

### Deferred Ideas (OUT OF SCOPE)
- Refresh-token renewal before the ~200-day expiry: a new capability, and today's behaviour is re-sign-in.
- Persisting Steam Guard machine tokens.
- Moving the install/uninstall/update polling state machines to Rust: the next sidecar-retirement slice.
- Excluding free-to-play titles from the Mac Steam path (084 found no local signal; it would need a per-app lookup).
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped in ROADMAP (TBD). Coverage is derived from CONTEXT.md decisions. Proposed IDs for the planner to use in plan frontmatter:

| ID | Description | Research Support |
|----|-------------|------------------|
| P79-SESSION | D-01..D-04: Rust-owned signed-in and anonymous sessions, lease, idle close, liveness, reconnect | "Session model and liveness" section, 085 evidence table, session actor pattern |
| P79-SIGNIN | D-05..D-08: Web API QR + credentials + Steam Guard, persona logon, token continuity | "Web API sign-in" pattern, EResult mapping, Pitfalls 6-8 |
| P79-WRAP | D-09..D-11: wrap retest, then Rust port or deletion | "Wrap decision path", skill-vs-CONTEXT discrepancy (Open Question 6) |
| P79-REFRESH | D-12, D-16: Refresh in Rust, parity sweep | "Refresh boundary" (Open Question 1), Don't Hand-Roll |
| P79-MACOWNED | D-14, D-15: Mac Steam owned-apps path | helper reuse (`gamelib_installapp.h`), guard list |
| P79-FLAGS | D-17, D-18: TS polling stays, two env flags, persisted logonID | flag mechanics copied from Phase 75 |
| P79-DELETE | Delete gate, STEAM-STACK.md and CLAUDE.md amendments | Delete-gate checklist incl. `lzma`, `zstddec`, patches |
</phase_requirements>

## Summary

Phase 79 is the largest of the Node-to-Rust slices: it replaces about 3,000 lines of session/sign-in/wrap TypeScript (`user.ts` 930, `macSteamOffline.ts` 933, `userSignIn.ts` 435, `anonymousClient.ts` 276, `depot/planModel.ts` 204, `userRedeem.ts` 139, `userSignInState.ts` 84) plus the Refresh path (`refresh.ts` 702, `licensedDemos.ts`, `platformCapture.ts`, `metacriticCapture.ts`, `gameMetadata.ts`, `gameRequirements.ts`) and deletes two npm packages. The migration recipe (Tauri-free crate, `rustInvoke` channels, CLI, goldens plus a local sweep, env-only fallback flags, a `*PortComplete` deletion test) is proven three times and is copied unchanged. What is new here is that, unlike scanners, depot and file readers, **the CM session is long-lived, stateful and handed to callers as a raw object**. That drives the main design points below.

Four findings change the plan versus the CONTEXT as written. (1) Upstream steam-vent main has moved: `767481a` (2026-11-12) adds the anonymous-logon fix, `login_with_refresh_token_and_logon_id` and `Send` login futures, so the vendor patch in 080's `vendor.sh` is no longer needed and the pin should move off `a9e8164`. (2) Production callers use the **raw steam-user client** (`client.getProductInfo` x25, `getDepotDecryptionKey` x15, `getManifestRequestCode` x10, `licenses`, `steamID`, `getContentServers`, `redeemKey`, `getPersonas`, `getUserOwnedApps`, `_send` for CDN tokens), so "same signatures" for `acquireAuthenticated` cannot hold unless the lease's `client` becomes a narrow TypeScript interface that both steam-user and a Rust-backed adapter satisfy. (3) D-12's "all of Refresh" is not one function: the HTTP enrichment is lazy per game (`fetchMetadataIfNeeded`, called from game pages) and mutates TS-owned stores, in-memory library state and frontend messages; the boundary needs an explicit decision (Open Question 1). (4) Adding steam-vent brings `rsa 0.9.x` into `src-tauri`, which the `cargo-deny` advisory job will flag (RUSTSEC-2023-0071) unless an ignore with a justification is added.

On D-01, the 085 evidence supports **lease + idle close**, with GameLib-owned reconnect inside a lease. steam-vent never notices a dead socket (Run A: `dead_at_end=true` after 25 min); recovery by a fresh discover + connect + logon works in 0.8-1.4 s (Run B). Under lease + idle close no periodic probe is needed: probe only on a failed or timed-out call, plus a wall-clock gap detector to skip the 10 s first-call-after-wake timeout. Run C (3 h, started 22:47 NZDT, still empty at research time) will mainly settle whether a quiet steady-network hold survives hours without server-side kicks, and how often the probe false-positives. That matters most for the one place lease sessions are long: a multi-hour depot download holding a lease.

**Primary recommendation:** Keep D-13's single phase but plan it as six waves (about 30-36 plans, as 75 had 35): scaffold + early live gates; CM core and Web API sign-in in Rust; shell channels and a TS `SteamCmClient` adapter; Refresh and its parity; the Mac Steam path; the delete gate. Pin steam-vent to `767481a` or later (verify it compiles against the 080/085 spike code in plan 1), put the session actor behind a backend trait so lease/liveness/reconnect/wrap ordering are `cargo test`-able with no network, and treat the `SteamCmClient` interface as the seam that keeps `cm=ts` possible.

## Architectural Responsibility Map

This is a desktop app: tiers are Renderer (React), Tauri shell (Rust, `src-tauri/src`), Node sidecar (`src/backend`), Rust workspace crates, and external systems.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CM connection, logon, liveness, reconnect, lease counting, idle close | Rust crate `gamelib-steamcm` | Shell (EOF/exit hook) | D-03. The crate owns state; the shell tells it the sidecar died or the app is exiting |
| Anonymous public-data session | Rust crate | — | D-04, separate from the signed-in session |
| PICS, depot key, request code, CDN hosts, owned games, licences, redeem | Rust crate (typed ops) | TS adapter (shape mapping) | Generic typed steam-vent calls, results mirror steam-user's shapes |
| QR / credentials / Steam Guard sign-in | Rust crate (HTTPS to `api.steampowered.com`) | TS (sign-in state machine, UI polling) | D-05; TS keeps `SteamSignInState`, `finishAuth`, token store, probe outcomes |
| Refresh token storage | TS `tokenStore.ts` + shell keyring | — | Stays the token's home; token passed per acquire, never logged |
| Mac go-offline wrap (while it exists) | Rust crate | Shell (opens `steam://` URLs) | D-10; crate takes an "open URL" host trait like `JobHost` |
| Mac Steam owned-apps read | Out-of-process helper (`native/steam-bridge/helper`) | Rust crate spawns it | D-15, never in-process |
| Refresh orchestration and HTTP enrichment | Rust crate (fetch + compute) | TS (stores, frontend pushes, install-state merge) | D-12 with the boundary caveat in Open Question 1 |
| Persistent stores (`steamLibraryStore`, `steamMetadataStore`, `configStore`) | TS sidecar | — | Stores are sidecar-owned (Phase 68 engine); Rust returns data |
| Install/uninstall/update polling | TS | — | D-17 |
| Depot downloads | `gamelib-depot` (unchanged) | Shell `ShellJobHost` | Its host trait can call the CM crate directly instead of Node (optional, see Pattern 5) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| steam-vent | git `https://codeberg.org/steam-vent/steam-vent`, **rev `767481ad4eb91dd73f1c70bea6b15f8123a0a040`** (main, 2026-11-12; Cargo.toml says 0.6.0 unreleased, crates.io max is 0.5.0) | CM connection, logon, typed jobs, `on::<T>()` subscriptions | Locked by CONTEXT; 071c winner. [VERIFIED: `git ls-remote` + diff `a9e8164..main`] Newer than CONTEXT's `a9e8164`: adds `login_with_refresh_token_and_logon_id`, anonymous logon fix (`f7aa052`), `Send` login futures |
| steam-vent-proto | 0.5.2 | Generated protobuf messages (`CMsgClientPICS*`, `CAuthentication_*`, `CContentServerDirectory_*`, `CPlayer_GetOwnedGames`) | What the spikes used; `CAuthentication_*` messages are in `steam-vent-proto-steam` `steammessages_auth.steamclient.proto` [VERIFIED: local registry source] |
| tokio | 1.53 (already in `src-tauri/Cargo.lock`) | Runtime for the CM actor | steam-vent requires it; depot already uses it |
| reqwest | 0.13 (lock has 0.13.4; crates.io max 0.13.5) | Web API sign-in, Refresh HTTP enrichment | Already in tree for depot with `rustls-no-provider`; steam-vent also pulls reqwest 0.13 |
| gamelib-steamfiles | path | Text VDF (`kv_text::parse`) and binary KV (`kv_bin::parse_bin`) for PICS app/package buffers | Existing Rust parser; do not add `keyvalues-parser` (080 used it only in a spike) |
| serde / serde_json | 1 | `dispatch(op, args)` JSON contract | Crate contract from `src-tauri/crates/README.md` section 2 |
| rustls | 0.23 (lock 0.23.46) with explicit provider | One explicit install in `main()` | 082. Recommended provider: **ring** (see TLS provider note) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| rsa | 0.9.x (transitive via steam-vent, 0.9.10) | RSA-encrypt the password for `GetPasswordRSAPublicKey` flow (PKCS#1 v1.5 public-key encrypt) | D-05 credentials; reuse steam-vent's version to avoid two copies. crates.io max is 0.10.0 |
| base64 | 0.22 | `input_protobuf_encoded` | Web API request encoding |
| futures-util | 0.3 | `StreamExt` over `on::<>()` streams | Already in depot |
| tracing + subscriber | 0.1 / 0.3 | steam-vent logs heartbeat and read-loop errors only via `tracing` | Install a subscriber that forwards warn+ to the shell log, or the failures 085 found stay invisible |
| wiremock (dev) | 0.6.5 | Local fake `api.steampowered.com` for sign-in tests | Optional; a hand-rolled `tokio` TCP listener also works. Needs the checkpoint below |
| tempfile (dev) | 3 | Fixtures | Same as sibling crates |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| steam-vent | steamroom, steam-client-lib | Rejected by 071 (see skill table). Fallback only if steam-vent fails a gate |
| ring provider | aws-lc-rs | aws-lc-sys compiles in either way (080). ring keeps today's proven provider for CDN and updater; 082 shows both stacks work on either. aws-lc adds post-quantum key exchange only |
| Direct rsa 0.10 for password encryption | rsa 0.9.10 (steam-vent's) | 0.10 is the patched line for RUSTSEC-2023-0071, but steam-vent still pins 0.9.10, so the advisory fires regardless |
| `notify` crate for `connection_log.txt` | 250 ms poll (as `macSteamOffline.ts`) | Poll is the proven behaviour; a watcher adds a dependency and a handle |

**Installation (new crate `src-tauri/crates/gamelib-steamcm/Cargo.toml`):**
```toml
[package]
name = "gamelib-steamcm"
version = "0.1.0"
edition = "2021"
rust-version = "1.89"   # steam-vent needs 1.88, edition 2024 deps; same exception as gamelib-depot
publish = false

[dependencies]
gamelib-steamfiles = { path = "../gamelib-steamfiles" }
steam-vent = { git = "https://codeberg.org/steam-vent/steam-vent", rev = "767481ad4eb91dd73f1c70bea6b15f8123a0a040" }
steam-vent-proto = "0.5.2"
tokio = { version = "1", features = ["rt-multi-thread", "sync", "time", "macros"] }
futures-util = "0.3"
reqwest = { version = "0.13", default-features = false, features = ["rustls-no-provider", "json"] }
rsa = "0.9"
base64 = "0.22"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```
Adding the crate changes `Cargo.lock`: update `EXPECTED_LOCKFILE_CRATE_NAMES` in `src/backend/__tests__/cargoFeatures.test.ts` in the same commit (README section 1), and add `-p gamelib-steamcm -p gamelib-steamcm-cli` to the explicit `cargo test` line in `.github/workflows/rust-test.yml` (workspace crates are not default members, README section 8).

**Version verification:** `git ls-remote https://codeberg.org/steam-vent/steam-vent HEAD` returned `767481ad...` on 2026-11-14; no `v0.6.0` tag exists (latest tag `v0.5.0`). crates.io: steam-vent-proto 0.5.2 (created 2021-06, 19.4k downloads), steam-vent 0.5.0, rsa 0.10.0, reqwest 0.13.5, tokio 1.54.1, wiremock 0.6.5. [VERIFIED: crates.io API, codeberg]

**TLS provider note.** Recommend **ring**: `rustls::crypto::ring::default_provider().install_default()` in `main()` before `tauri::Builder`. Rationale: the live-verified depot downloads (73 UAT) and the updater already run on ring; spike 082 `depot-then-vent` shows steam-vent's CM TLS and a fresh CM connect work on ring [VERIFIED: 082 README]. This is a recommendation; aws-lc is equally correct per 082.

## Package Legitimacy Audit

slopcheck could not be installed: the `pip install slopcheck` attempt was refused by the permission classifier and was not retried. Per protocol, every package that is **new to `src-tauri/Cargo.lock`** is therefore `[ASSUMED]` and must be gated behind a `checkpoint:human-verify` before its first install. Registry facts below came from the crates.io API (read-only) and are real, but registry existence alone does not confer `[VERIFIED]`.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| steam-vent (git rev) | codeberg git (crates.io 0.5.0) | 3 yrs | 12.5k total (crates.io) | codeberg.org/steam-vent/steam-vent | unavailable | `[ASSUMED]` — already proven in 8 spikes and the operator's CONTEXT lock; planner adds checkpoint for the rev bump |
| steam-vent-proto | crates.io | 5 yrs | 19.4k total | codeberg.org/steam-vent/proto | unavailable | `[ASSUMED]` — checkpoint |
| rsa | crates.io | 8 yrs | 272M | github.com/RustCrypto/RSA | unavailable | `[ASSUMED]` — transitive of steam-vent; RUSTSEC-2023-0071 applies (see Pitfall 9) |
| wiremock (dev only) | crates.io | 6 yrs | 105M | github.com/LukeMathWalker/wiremock-rs | unavailable | `[ASSUMED]` — optional; skip if a hand-rolled listener is used |
| tokio, reqwest, serde, serde_json, futures-util, rustls | crates.io | — | — | — | n/a | Approved: already in `src-tauri/Cargo.lock` and used by `gamelib-depot` |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck did not run).
**Packages flagged [SUS]:** none known. No Node packages are installed by this phase; two are removed (`steam-user`, `steam-session`).

## Architecture Patterns

### System Architecture Diagram

```
Renderer (React)
   | IPC (unchanged channels: steamStartQR, steamPollQR, steamStartCredentials, steamSubmitGuard,
   |       refresh, redeem, install...)
   v
Node sidecar (src/backend)  -- TS policy: tokenStore, SteamSignInState, authTrigger grants,
   |                            stores, frontend pushes, install-state merge, polling (D-17)
   |  user.ts acquire*()  -> returns SteamCmClient (interface) + release()
   |     cm=rust: RustCmClient adapter                cm=ts: steam-user adapter (until delete gate)
   |  rustInvoke  cm_* / signin_* / refresh_* channels (UNBOUNDED list for long ones)
   v
Tauri shell (src-tauri/src)  -- sidecar.rs dispatch_rust_channel -> one thread::spawn per call
   |   + steamcm_dispatch.rs (new): ShellCmHost { open_url, log } ; EOF/exit hook
   v
gamelib-steamcm (Tauri-free)
   |  dispatch(op,args) -> Result<Value,String>
   |
   |  +-- global runtime (OnceLock, multi-thread) -----------------------------+
   |  |  SessionActor (signed-in)       AnonActor                    WebAuth   |
   |  |   lease count, idle timer        shared, 15 s connect,       HTTPS to  |
   |  |   generation, shutdown           60 s idle-from-last-read    api.steam |
   |  |   liveness+reconnect+retry-once                              powered   |
   |  |   LoggedOff watcher (34=stop)                                           |
   |  |   MacWrap (go-offline, log watch, owed record) -- cfg macOS             |
   |  |   Backend trait: SteamVentBackend | FakeBackend (tests)                 |
   |  +-------------------------------------------------------------------------+
   |        | WebSocket (TLS) to CM            | HTTPS
   v        v                                  v
 Steam CM network                         api.steampowered.com, store.steampowered.com
   ^
   | Refresh (D-12): owned apps -> demos -> platform/metacritic capture (anonymous PICS)
   |   -> appdetails enrichment (reqwest)  ==> typed results to TS
   |
 macOS only (D-14/15): crate spawns bridge helper --steam-owned-apps (out of process)
   -> GetSteamID/BLoggedOn guard -> GetSubscribedApps -> anonymous PICS types -> else CM fallback

gamelib-depot (unchanged) -- ShellJobHost.cdn_token / manifest_request_code
   today: rustInvoke -> Node (job.tokenCache, refreshRequestCode) -> steam-user
   after: Node -> Rust CM (Pattern 5), or direct Rust-to-Rust
```

### Recommended Project Structure
```
src-tauri/crates/gamelib-steamcm/
  src/lib.rs            # dispatch(op,args), OPS, CLI_ONLY_OPS, catch_unwind (copy gamelib-steamfiles/src/lib.rs)
  src/backend.rs        # trait CmBackend {connect_authed, connect_anon, job..., subscribe...}
  src/vent.rs           # SteamVentBackend (only file importing steam_vent)
  src/session.rs        # SessionActor: leases, idle, generation, reconnect, retry-once, shutdown
  src/anon.rs           # AnonActor
  src/ops/              # pics.rs owned.rs depot.rs redeem.rs persona.rs (JSON shapes mirror TS)
  src/webauth.rs        # IAuthenticationService over reqwest: qr, credentials, guard, poll
  src/wrap.rs           # go-offline wrap (cfg-gated; the file is deleted if D-09 passes)
  src/refresh/          # orchestration, enrichment, demos, captures (Wave 3)
  src/macowned.rs       # helper spawn + parse (Wave 4)
  tests/                # fixtures/, golden.rs, session_fake.rs, webauth_mock.rs
src-tauri/crates/gamelib-steamcm-cli/   # <op> <json>, --list, --ndjson (copy gamelib-scan-cli)
src-tauri/src/steamcm_dispatch.rs       # ShellCmHost + rpc_* handlers + EOF hook (model: depot_dispatch.rs)
src/backend/storeManagers/steam/cm/     # rustSteamCm.ts (typed invoke), steamCmTypes.ts, steamCmFlags.ts,
                                        #   RustCmClient.ts (adapter), SteamCmClient.ts (interface)
meta/gamelibSteamcmCli.ts               # spawn helper with createFakeHomeProfile (model: meta/gamelibSteamfilesCli.ts)
```

### Pattern 1: The migration recipe, with the exact files to copy
**What:** Phase 75 is the closest model (stateless ops + flags + parity + gate); Phase 73 is the model for anything long-running or calling back to Node.
**Copy list:**
- Crate contract: `src-tauri/crates/gamelib-steamfiles/src/lib.rs` (`dispatch`, `OPS`, `CLI_ONLY_OPS`, `parse_args` with `deny_unknown_fields`, `catch_unwind`), and `src-tauri/crates/README.md` sections 1-8.
- CLI: `src-tauri/crates/gamelib-steamfiles-cli` (`Cargo.toml`, `src/main.rs`), `meta/gamelibSteamfilesCli.ts` (spawn with `createFakeHomeProfile({ prefix })`), and a `steamcm-cli:build` script beside `steamfiles-cli:build` in `package.json`.
- Channels: a `RUST_CM_*` const per op in `src/common/types/sidecarTransport.ts` plus entries in `RUST_INVOKE_CHANNELS` (near lines 460-550, 734-800); one `"op" => {` arm each in `dispatch_rust_channel` (`src-tauri/src/sidecar.rs`); a static parity test in the style of `src/backend/__tests__/depotChannelParity.test.ts` (OPS == constants == match arms). Shell handlers live in a new `src-tauri/src/steamcm_dispatch.rs` (model: `steamfiles_dispatch.rs` for plain ops, `depot_dispatch.rs` for host-trait ops).
- Long calls: add to `UNBOUNDED_RUST_CHANNELS` in `src/backend/sidecar/sidecarRpc.ts:110`, otherwise the generic `RUST_INVOKE_TIMEOUT_MS` (60 s) kills them. Acquire (up to `AUTH_LOGON_BOUND_MS` 35 s + wrap + settle), Refresh and any download-duration lease wait belong there.
- Typed TS helper and types: `src/backend/storeManagers/steam/localFiles/{rustSteamFiles.ts, steamFilesTypes.ts}` (commit `2076d6431` is the clean reference, with a debug proof log line naming the Rust path for live-gate evidence).
- Flags: `localFiles/steamFilesFlags.ts` pattern (env-only, pure, unknown value falls back silently, `*_DEFAULT` const flipped by one commit, e.g. `e88a189e7`). Names: `GAMELIB_STEAMCM_CM=rust|ts` and `GAMELIB_STEAMCM_SIGNIN=rust|ts`. Env-only, no AppSettings, matching README section 5 and D-18 "hidden". Jest pins `ts` during transition via `src/backend/jest.setupContainment.ts` (75-25) and removes it at deletion (75-34).
- Parity: two tiers (README section 6). Tier 1 goldens committed under `gamelib-steamcm/tests/fixtures/` (`expected.json`, `invocations.json`, `rust-results.json`); Jest replays recorded Rust results so Jest needs no cargo (75 lesson). Tier 2 local sweep `meta/steamcmParitySweep.ts` + `pnpm steamcm-parity-sweep` (model `meta/depotParitySweep.ts`), redacted output, exit 0/1/3, zero inputs must fail. Parity record `79-PARITY.md` (shape: `75-PARITY.md`: corpus table, sweep table, divergence table with Steam-correct side, operator accept).
- Delete gate: `src/backend/__tests__/steamCmPortComplete.test.ts`, modelled on `steamFilesPortComplete.test.ts` (DELETED paths, FORBIDDEN strings, KEPT fixtures, anti-vacuity file-count check, package.json and pnpm-lock check).
- CI: `.github/workflows/rust-test.yml` line ~117, add `-p gamelib-steamcm -p gamelib-steamcm-cli`; clippy runs `--workspace` with a shrink-only ratchet (`meta/clippyRatchet.cjs`), so new warnings fail.
- MSRV: set `rust-version = "1.89"` on both new crates (the `gamelib-depot` exception, README section 1) and say so in the plan.

### Pattern 2: Session actor behind a backend trait
**What:** One long-lived task owns the signed-in session. Callers send commands over an mpsc channel and get oneshot replies. All steam-vent types live behind `trait CmBackend`, so lease counting, idle close, generation fencing, reconnect/retry-once, 34-handling and wrap ordering are unit-tested with a `FakeBackend` (injectable clock via `tokio::time::pause`, as depot's `test-util` dev-dependency does). steam-vent has no mock transport; without this seam the whole session layer is testable only live.
**State to carry over from `user.ts`:** `leaseCount`, `idleTimer` (60 s), `sessionGeneration` (no logon lands after sign-out), `abandonPendingLogon`, `wrapTail` (serialised wraps, ~15 s spacing between back-to-back wrapped logons, 074), `shuttingDown`, `logonFailure` (`getLogonFailure()` is read by Refresh to name a rejection), `guidedInstallTargets`, `connectingPromise` (concurrent acquires share one logon), `AUTH_LOGON_BOUND_MS` 35 s, `CANARY` (app 753, 5 s).
**Example (shape, not final code):**
```rust
// Source: spikes 077/081/085 call sketches in rust-migration-steam.md; 085 src/main.rs
async fn connect(token: &RefreshToken, logon_id: u32) -> Result<(Connection, LoggedOffStream, LicenseList), CmError> {
    let servers = ServerList::discover().await?;                       // fresh pick each time
    let unauth = UnAuthenticatedConnection::connect(&servers).await?;
    let mut licenses = Box::pin(unauth.on::<CMsgClientLicenseList>()); // BEFORE logon
    let logged_off = Box::pin(unauth.on::<CMsgClientLoggedOff>());     // whole session life
    let conn = unauth.login_with_refresh_token_and_logon_id(token, logon_id).await?; // 767481a API
    let list = tokio::time::timeout(Duration::from_secs(10), licenses.next()).await?;
    Ok((conn, logged_off, list))
}
```
`logon_id`: steam-vent now accepts one; D-18 still requires the non-zero `logonID` on the **steam-user** side while `cm=ts` exists. Using a non-zero id on the Rust side instead would work equally (same-ID logons replace each other) but D-18 is locked and 077/081 validated the steam-user side. Pass 0 from Rust.

### Pattern 3: Liveness, reconnect and retry-once (D-02)
- No periodic probe under lease + idle close. A command fails or times out -> `probe` (cheap job) -> if dead, rebuild with backoff -> retry the command **once**. A command that already mutated server state (redeem) must not be blindly retried; see Pitfall 5.
- `LoggedOff` eresult 34 -> drop the session, fail the pending command with a "replaced" cause, **no retry**. Any other `LoggedOff` -> treat as dead and reconnect. Keep `isCredentialRefusal` semantics: only EResults 5, 15, 26, 27, 63 latch `credentialsMissing` (`userTypes.ts` `CREDENTIAL_REFUSAL_*`).
- Map steam-vent errors: `LoginError::InvalidCredentials` -> 5; `LoginError::Unknown(e)` -> `e` (15, 26, 27, 63 arrive here because only 5 and a few account/limit codes get special variants); `LoginError::AccessToken(RefreshTokenError::Expired)` -> 27 (steam-vent checks `token.expired()` client-side before sending); `NetworkError::Timeout/EOF/Ws/IO` -> transient. `LoginError` is `#[non_exhaustive]`: keep a wildcard arm. [VERIFIED: steam-vent `session.rs`]
- Wake detection: compare wall clock to a monotonic clock in the actor's tick (085 `GAP` logic) and treat a large gap as "dead", skipping the 10 s first-call timeout. A wake notification from the shell (`wake_lock.rs` exists) is an alternative.
- Bound the 92 s Run A stall: never `await` a CM call inside the actor's control loop. Run every command in a spawned task with a hard `tokio::time::timeout`, and keep the control loop (idle timer, LoggedOff watcher, shutdown) free. The cause of the stall was not identified in 085 (no `GAP` line); the likeliest reading is the loop was blocked in an un-timed await while offline, but that is a hypothesis.

### Pattern 4: `SteamCmClient` interface so `cm=ts` stays possible (D-03, D-18)
**What:** Today `AuthenticatedLease.client` is `InstanceType<typeof SteamUser>` (`userTypes.ts:53-81`) and ~15 files call methods on it. Define in TS the exact subset production calls: `steamID`, `licenses`, `getProductInfo(apps, packages, inclTokens)`, `getDepotDecryptionKey`, `getManifestRequestCode`, `getContentServers`, `getUserOwnedApps`, `getPersonas`, `redeemKey`, `logOff`-for-abort. Both the steam-user client (cast) and `RustCmClient` (each method one `rustInvoke` with the lease id) satisfy it. This keeps `DepotSteamUser`, `PlatformCapturePicsClient` and `LicensedDemosPicsClient` (already structural subsets) working, and gives the planner one place to enforce parity on result shapes.
**Result-shape risk:** steam-user `getProductInfo` returns `{apps, packages, unknownApps, unknownPackages}` with `appinfo` parsed by `kvparser` (all values strings, not coerced) and tokens fetched internally. The Rust op must reproduce that, including `missingToken` and `changenumber`. This is exactly the 75 `numeric-coercion` class of divergence; budget a golden for it.
**`_send` / CDN tokens:** `depot/cdnAuth.ts` (753 lines) uses `client._send`, a steam-user-private API, to fetch CDN tokens; 071a says `GetCDNAuthToken` fails on current hosts and the pipeline runs without tokens. Decide before planning (Open Question 5): either the `depotCdnToken` handler returns `''` and `cdnAuth.ts` is deleted, or it stays behind `cm=ts` only.

### Pattern 5: Feed `gamelib-depot` from the Rust session
Today the Rust depot job calls Node (`depotCdnToken`, `depotManifestRequestCode` in `src/backend/sidecar/depotHostRegistration.ts`) which calls steam-user. After this phase the minimum change is Node -> `cm_manifest_request_code` over rustInvoke (two hops, zero depot-crate change). The better end state is `ShellJobHost.manifest_request_code` calling the CM crate directly with the install's lease id carried in the job request. Constraint: the depot crate calls host methods from `tokio::task::spawn_blocking` threads (`fetch.rs:420`), which are legal places to `Handle::block_on` the CM runtime, but **not** legal from inside a depot async task. 080's "drop the CM runtime before `dispatch`" came from a single-process spike; in the shell the CM runtime is global and long-lived, and `dispatch` runs on a plain `thread::spawn` thread (`sidecar.rs:604`), so no runtime nests. Do not call `block_on` on any thread that is already inside either runtime.

### Pattern 6: Web API sign-in (D-05)
`POST https://api.steampowered.com/IAuthenticationService/<Method>/v1` with form field `input_protobuf_encoded` = base64 of the request message; response body is the protobuf; `x-eresult: 1` is success (072) [CITED: rust-migration-steam.md]. Methods: `GetPasswordRSAPublicKey` (GET-style query, unauthenticated), `BeginAuthSessionViaCredentials`, `UpdateAuthSessionWithSteamGuardCode`, `BeginAuthSessionViaQR`, `PollAuthSessionStatus`. Platform `SteamClient`. QR: poll at the returned `interval`; on `new_client_id` swap and redraw from `new_challenge_url` (~22 s rotation). Messages come from `steam-vent-proto-steam` (`CAuthentication_*`, generated by rust-protobuf). Make the base URL a parameter so tests point at a local mock.
Port the state mapping from `userSignIn.ts` (`startCredentialLogin` line 275, `submitSteamGuardCode` 394, `pollCredentialLogin` 152, `startQRLogin` 165, `pollQRLogin` 246) and keep `SteamSignInState` in TS: Rust returns step results (`needsGuard{type}`, `waitingApproval`, `done{refreshToken, accountName, steamId}`, `error{eresult}`), TS keeps the polling UI contract and `finishAuth`.

### Pattern 7: Wrap decision path (D-09/D-10)
Run the retest in Wave 0 against today's TS code (use `.planning/spikes/075-friends-flip-full-refresh/arm-b-nowrap.patch`, the one-line real-app bypass), on a freshly started Mac Steam, with the operator reading the Friends UI. If it passes, the plan list drops `wrap.rs` entirely (the saved cost is about 930 TS lines of port plus the owed-record dual format). If it fails, port. Then repeat once against the Rust CM fallback Refresh at the Wave 3 end, because D-09 requires the CM fallback path to be covered. See Open Question 6 for a conflict with the skill reference.

### Anti-Patterns to Avoid
- **Loading `steamclient.dylib` in the Tauri process** (D-15). Use the helper subprocess.
- **A thin intermediate Refresh** (D-13). Wave 3 builds the final shape once.
- **Holding the steam-vent `Connection` in a `Mutex` shared across `thread::spawn` dispatch threads.** Use the actor and channels.
- **Setting `SSLKEYLOGFILE`.** steam-vent's websocket transport installs `KeyLogFile`, which writes TLS secrets if the variable is set (085 research). Assert it is unset when a session starts.
- **Relying on whichever rustls provider installs first** (082).
- **Re-proposing steamroom/steam-client-lib or QR over CM** (skill "What to Avoid").

## Session model and liveness: options for D-01 with 085 evidence

| Evidence | Run A (no reconnect) | Run B (reconnect on) | Run C (3 h, started 22:47 NZDT 2026-11-14) |
|---|---|---|---|
| Network drop | Timeouts from 20:22:15; `AddrNotAvailable` at 20:25:14; then `BrokenPipe` on every job and heartbeat; `dead_at_end=true` | `Timeout` 20:40:32; discovery failed while offline (5/10/20/40 s backoff); **RECOVERED 76 s dead, logon 1.4 s** | not available |
| Sleep/wake | not run | `GAP` 365 s; first call after wake timed out after 10 s; **reconnect 0.8 s** | not available |
| steam-vent signal | none: no `KICKED`, `LoggedOff` stream silent, errors only in `tracing` | same | not available |
| Unexplained | 92 s check gap (20:23:00 -> 20:24:32) with no `GAP` line | — | not available |

[VERIFIED: `.planning/spikes/085-steam-vent-long-lived-session/runs/*.log`, read 2026-11-14]

**Options**
- **A. Lease + idle close (60 s), reconnect inside a lease. Recommended.** Matches today's behaviour and the guarantees D-03 carries. Most sessions live seconds to a couple of minutes; a stale socket can only bite a call made while the session is already open, and D-02's probe-then-reconnect-then-retry-once covers it. No periodic probe, no boot-time wrapped logon, no sleep/wake bookkeeping outside an active lease. The exception is a depot download: the request-code and CDN-token calls during a multi-hour install hold the lease (or re-acquire it), so reconnect-in-lease is required, not optional.
- **B. App-lifetime signed-in session.** Needs a periodic probe forever, sleep/wake handling while idle, a wrapped logon at app boot on macOS (conflicts with today's "deferred refresh at startup, no CM logon" and with D-14's goal of not logging on), and a permanent session for the Friends-flip hazard to act on. Run C cannot make this attractive; it can only show whether it is survivable.

**What Run C settles (without waiting for it):** whether a quiet 3 h hold on a steady network sees server-side kicks, `LoggedOff` codes other than 34, heartbeat errors, or probe false positives. It bears on (1) how long a download-length lease can be trusted without a probe, and (2) the probe interval if one is added inside long leases. Decision rule to write into the plan: if Run C is clean, a lease needs no periodic probe and reconnect happens on a failed call only; if it shows drops or false positives, add a probe every 60-120 s only while `leaseCount > 0` **and** a long job is registered.

**Probe tuning (open until Run C):**
- Probe job: PICS access-token request for app 480 (85) or `getProductInfo(753)` (today's canary). Both are single small jobs; keep the 085 job for evidence continuity, or 753 for parity with `CANARY_APP_ID`. Pick one and use it for both the live gate and the unit-test fake.
- Timeout: 085 validated 10 s. Today's canary uses 5 s. Healthy round trips are 0.3-0.4 s. Since the probe only runs after a failure, use 10 s (validated) for the post-failure probe unless Run C shows false positives under it. Use wake detection to skip the probe entirely after sleep.
- Backoff: 085's 5 -> 10 -> 20 -> 40 -> 60 s with a 30 s per-attempt bound worked. Add jitter and a cap on total attempts per command (retry-once applies to the command, not the reconnect).
- A discovery failure while offline is immediate (`Failed send discovery request`), so backoff, not the attempt timeout, bounds the wait.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CM framing, heartbeat, job routing, `job_multi` for split PICS | Own protocol client | steam-vent | 071: request/response clients drop the licence list and `LoggedOff` |
| Reconnect | "autoRelogin" | GameLib-owned rebuild (Pattern 3) | steam-vent has no reconnect API; steam-user autoRelogin was deliberately off since 046c |
| Text VDF / binary KV for PICS buffers | `keyvalues-parser` or a new parser | `gamelib-steamfiles::{kv_text, kv_bin}` | One parser in the repo (75 D-06). Package buffers are a 4-byte package-id prefix plus binary KV (reader in `sources/073-rust-owned-apps-parity/src/main.rs`) |
| Steam Guard / auth protobufs | Hand-written protobuf | `steam-vent-proto-steam` `CAuthentication_*` | Already generated |
| RSA password encrypt | Custom RSA | `rsa` crate (PKCS#1 v1.5, modulus/exponent from `GetPasswordRSAPublicKey`) | Never hand-roll crypto |
| Mac Steam client interface attach and slot resolution | New dlopen/vtable code | Extend `native/steam-bridge/helper/gamelib_installapp.h` (`CLIENTENGINE_INTERFACE_VERSION005`, function-ID decode, uniqueness check) with a `--steam-owned-apps` subcommand; spike 084's `probe.c` has the `GetSubscribedApps`, `GetSteamID`, `BLoggedOn` decode | Already solves the hard part; same out-of-process pattern as `steamInstallApp.ts` |
| Atomic write of the owed record | Ad hoc write | `gamelib_steamfiles::atomic` | Already hardened (symlink-through, unique temp names, 75 review fixes) |
| `steam://` URL opening from the crate | Direct `open` call in the crate | Host trait implemented by the shell | Keeps the crate Tauri-free and testable; the shell already has the scheme allow-list (`open_external_scheme_check`) |
| Persona name | Web scraping | `CMsgClientRequestFriendData` + `CMsgClientPersonaState` over the session | `getPersonas` parity; unvalidated in steam-vent (Open Question 4) |

**Key insight:** the heavy part of this phase is not protocol work (steam-vent and the spikes cover it) but preserving the *behavioural guarantees* around the session (no logoff mid-download, no logon after sign-out, never a silent logon on macOS, serialised wraps) while changing language and process. Test those against a fake backend, not live.

## Runtime State Inventory

This replaces libraries and moves state ownership; it is a migration phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Refresh token in keyring / dev vault via `tokenStore.ts` (steam-session `SteamClient` JWT); `configStore` keys `isLoggedIn`, `userData{username,steamId}`, `credentialsMissing`; `steamMetadataStore`, `steamLibraryStore` (games), `steamSyncStore.syncedAt`. `mac-steam-offline-owed.json` in `paths.appFolder`, versioned by `storeVersioning/macSteamOfflineOwedFile.ts` | Token and stores: **none**, formats unchanged (D-07). Owed record: Rust must read and write the same versioned format while both sides can run (code edit, not a migration). New persisted per-install `logonID` for steam-user (D-18): new `configStore` key, generated once |
| Live service config | None. No Steam-side configuration is keyed on GameLib strings | None, verified by grep of the Steam managers |
| OS-registered state | None for this phase. The go-offline URL scheme is Steam's own | None |
| Secrets / env vars | `GAMELIB_DEV_SECRET_VAULT` (dev launch), new `GAMELIB_STEAMCM_CM` / `_SIGNIN` flags (env only), `SSLKEYLOGFILE` must stay unset | Add flags; add an unset assertion |
| Build artifacts / installed packages | `steam-user`, `steam-session`, `@types/steam-user` in `package.json` (lines 147-148, 171); `lzma` and `zstddec` (kept by 73-21 only because steam-user imports them, `package.json` 130/150); `patches/lzma.patch`, `patches/steam-user.patch` and their `pnpm-workspace.yaml` `patchedDependencies` entries (lines 15-16); `meta/buildSidecarSea.ts`, `meta/sidecarSeaFsShim.ts`, `meta/esbuildWorkerBundleShared.ts` and their tests reference lzma/zstddec/steam-user. steam-user may leave cache files in its default data directory | All removed at the delete gate; `pnpm-lock.yaml` regenerated; leftover steam-user cache files are harmless (`[ASSUMED]`, not located) |

## Common Pitfalls

### Pitfall 1: Lease handles leak when the sidecar dies
**What goes wrong:** Rust holds a lease count for a sidecar that crashed or was killed; idle close never fires and a Friends/wrap state is left owed.
**Why:** The session now outlives the Node process that owned the lease. Phase 73 hit the same class and solved it with `cancel_all()` on sidecar stdout EOF (`depot_dispatch.rs::on_sidecar_eof_cancel_jobs`).
**How to avoid:** An EOF hook that drops every lease, logs the session off, and pays the owed goonline within a bounded wait; the same on `RunEvent::Exit`. This replaces `releaseForShutdown` + `stdinEofRelease.ts` for the session; TS must still stop referencing handles so the exit contract holds.
**Warning signs:** `leaseCount` non-zero after the sidecar restarts; Mac Steam stays "Offline" after a dev-restart.

### Pitfall 2: Runtime nesting panics
**What goes wrong:** `block_on` inside a runtime thread panics; `blocking_recv` in async context panics.
**How to avoid:** One global runtime in the crate. Sync `dispatch` entry runs on a plain `thread::spawn` worker (`sidecar.rs`), so `handle.block_on` is fine there. Depot host callbacks arrive from `spawn_blocking` (also fine). Never call into the CM facade from an async task on either runtime; use a channel and `.await`.

### Pitfall 3: Adding steam-vent changes the TLS provider situation
**What goes wrong:** With steam-vent in the build, rustls has both providers and a `rustls-no-provider` reqwest client built before any install **panics** (082). The new Web API client in this phase is exactly the "next piece of Rust networking" 082 warned about.
**How to avoid:** Install the provider in `main()` before `tauri::Builder`; add a test that builds a bare reqwest client after the install. `[VERIFIED: 082 README]`

### Pitfall 4: Same-account sessions kick each other (`LogonSessionReplaced` 34)
**What goes wrong:** steam-user and steam-vent both default `logonID` 0; the later logon kicks the earlier (077).
**How to avoid:** D-18's persisted non-zero `logonID` on the steam-user client while `cm=ts` exists. Anonymous sessions never collide. After deletion the property is moot. Treat 34 as terminal for the session, never as a credential problem (`user.ts:536` semantics).

### Pitfall 5: Retry-once on non-idempotent calls
**What goes wrong:** D-02 retries the failed call once. `redeemKey` (`CMsgClientRegisterKey`) may have succeeded server-side when the socket died; a retry can report "already owned/duplicate" and look like a failure. Depot key and request-code calls are idempotent.
**How to avoid:** Mark each op idempotent or not in the crate; for redeem, after a dead connection re-acquire and surface the ambiguity, or verify by licence list, rather than blindly resending. Typed real-key redeem is untested anywhere (skill Constraints); the live gate item exists only if the operator has a key.

### Pitfall 6: steam-vent's logon error shape loses EResults
**What goes wrong:** `From<EResult> for LoginError` collapses several codes (5, account-disabled family -> `InvalidCredentials`) and keeps others as `Unknown(e)`. Mapping by variant name alone misclassifies a refused token.
**How to avoid:** Translate to the numeric EResult first, then apply `CREDENTIAL_REFUSAL_ERESULTS` (5, 15, 26, 27, 63). Golden-test the table. Expired JWT is detected client-side as `RefreshTokenError::Expired`; map it to 27.

### Pitfall 7: Persona lookup is unvalidated in steam-vent
`resolveSignInProfile` uses `getPersonas` (a friend-data request plus persona-state message, not a plain job). No spike exercised it in steam-vent. D-06 keeps it, with a 5 s bound and the account-name fallback, so a failure is non-fatal, but it must be validated in Wave 1 rather than discovered at the live gate.

### Pitfall 8: Typed Steam Guard codes and the guard-type matrix are untested
Skill Constraints lists typed email/mobile codes as untested. The Web API path (D-05) adds `UpdateAuthSessionWithSteamGuardCode` and `allowed_confirmations` handling (device code, email code, device confirmation, email confirmation). Cover each in the wiremock tier and put one live typed-code item in the UAT. Preserve today's states from `userSignIn.ts`: waiting/done/error plus the cred settle callbacks.

### Pitfall 9: cargo-deny will fail on `rsa`
**What goes wrong:** `.github/workflows/audit.yml` runs `EmbarkStudios/cargo-deny-action` with advisories enabled; steam-vent depends on `rsa 0.9.10` (not currently in `src-tauri/Cargo.lock`), which RUSTSEC-2023-0071 (Marvin attack) covers; the advisory lists `>=0.10.0` as patched [CITED: rustsec.org/advisories/RUSTSEC-2023-0071.html, severity Medium 5.9]. steam-vent pins 0.9.10 so it cannot be bumped from here.
**How to avoid:** Add an `ignore` entry in `src-tauri/deny.toml` with a reason: only public-key encryption is used (no private-key decrypt), so the timing attack surface is absent. Run `cargo deny check advisories` in plan 1 (cargo-deny is not installed locally; CI-only), because other new transitive crates (`another-steam-totp`, `steam-machine-id`, `directories`, `rand 0.10`) may have findings too. `[ASSUMED]` that these are the only ones.

### Pitfall 10: Secrets in the rustInvoke path
The refresh token and password cross the sidecar-shell pipe as arguments. Keep them out of any log: do not log rustInvoke args, never `Debug`-print request structs (`#[derive(Debug)]` on arg structs with secrets is a footgun), and reuse the T-28-04 convention from `depotHostRegistration.ts` (log channel + id only). Zeroize the password after encrypt where practical.

### Pitfall 11: `tauri dev` does not rebuild the sidecar, and fresh worktrees need build prep
From project memory: restart dev before live-testing backend changes; launch with `pnpm tauri:dev` (never `tauri:dev:run`, which skips the dev-vault flag and re-prompts the Keychain); a new worktree needs `build:sidecar-sea` + `vite build` first. Put these in the UAT contract.

### Pitfall 12: Mac Steam path edge cases
Offline Mode, signed-out and not-running states were not measured in 084 (the guards return `pipe`/`user` failures, but the real values were not observed). Treat any non-success helper result, any non-zero exit, a timeout, or an account mismatch as "fall back to CM". Resolve slots by function ID with a uniqueness check and make the helper exit non-zero on ambiguity. The two-call buffer protocol (count then fill) is mandatory: with `max = 4` it still returned 1,140.

### Pitfall 13: Sidecar exit contract on the TS side
The TS wrappers must create no timers or handles that survive stdin EOF; in-flight rustInvoke Promises are not handles, but anything polling (QR poll timers, `QR_LOGIN_TIMEOUT_MS`) must be unref'd or cleared. `stdinEofRelease.ts` currently releases steam-user handles; it loses that entry only after the delete gate (while `cm=ts` is selectable it must keep it).

## Refresh boundary (D-12): what actually moves

`refresh.ts` (702 lines) does, in order: grant check -> acquire lease (or open lease) -> `getUserOwnedApps` -> `fetchLicensedDemos` -> anonymous-client platform capture (`platformCapture.ts`) with held-client fallback -> `captureOwnedAppMetacritic` -> `buildInstalledMap` / bottle / bridge maps (**already Rust-backed readers from Phase 75**, called from TS) -> `backfillBridgeLaunchTargets` (uses the client) -> merge into `SteamGameInfo` using `steamMetadataStore` (cached art/platform/metacritic), breadcrumbs, `isBridgeAuthoritativeForInstallState`, schema strip -> `libraryState.library.set`, `sendFrontendMessage('pushGameToLibrary')`, `steamLibraryStore.set`.
The axios enrichment (`gameMetadata.ts` `fetchMetadataIfNeeded`, `gameRequirements.ts`) is **not in `refresh()`**: it runs lazily per game from the game page, with a dedup set (`pendingFetches`), a concurrency slot limiter, `steamMetadataSyncing` messages and store writes.
**Recommended boundary (needs operator confirmation, Open Question 1):** Rust owns everything that is network or pure computation: the owned/demo/captured data fetch (`cm_refresh_collect`), the appdetails and requirements HTTP + parsing (`steam_store_appdetails` returning parsed fields), and the Mac Steam path. TS keeps stores, in-memory library state, frontend pushes, install-state merge and bridge backfill. "Rust returns the finished library" is then read as "Rust returns the complete resolved data for the library; TS assembles and persists", which keeps D-16's comparison valid (final library diffed) and avoids a second store implementation. Moving store writes into Rust would mean porting the Phase 68 store engine, which no decision authorises.

## Proposed wave and plan split

D-13 locks one phase. Size is comparable to 75 (35 plans, 20 waves), so plan for roughly 30-36 plans and keep each independently verifiable. Proposed shape (planner refines):

| Wave | Plans | Content | Gate |
|------|-------|---------|------|
| 0 | 3 | Scaffold crates, deps, lockfile names test, CI `-p` legs, `deny.toml` rsa ignore, provider install in `main()`, compile check of steam-vent `767481a` against the 080/085 spike calls. **D-09 retest** (TS Refresh unwrapped, operator reads Friends). **D-01 decision record** after Run C. Persist the `logonID` + steam-user option (D-18) | cargo test + deny green; wrap fate known |
| 1 | 6-7 | `CmBackend` trait + `SteamVentBackend`; session actor (leases, idle, generation, reconnect, 34, shutdown) with fake-backend tests; anonymous actor; typed ops (PICS tokens-then-info, package KV, owned games, depot key, request code, CDN hosts, persona, redeem); Web API module (QR, credentials, guard, poll) with mock-server tests; CLI + `meta` spawn helper; Tier 1 goldens | `cargo test -p gamelib-steamcm` green on 3 legs |
| 2 | 6-7 | Channels + shell dispatch + EOF/exit hook + parity test; `SteamCmClient` interface and `RustCmClient`; flags; `user.ts` acquire surface over Rust; `userSignIn.ts` over Rust; depot callers and `depotHostRegistration`; wrap port **only if D-09 failed**; Tier 2 sweep of CM ops (licences 1,144, owned 390, PICS, depot key SHA) | CM parity, flag `cm`/`sign-in` flipped by operator approval |
| 3 | 5-6 | Rust Refresh collect + licensed demos + platform/metacritic capture + appdetails/requirements via reqwest; TS call-site changes; D-16 parity sweep and `79-PARITY.md`; second wrap-retest on the CM fallback path | Refresh parity approved |
| 4 | 3-4 | Helper `--steam-owned-apps`; `macowned.rs` guards and fallback; separate comparison against 084's set | Mac path UAT |
| 5 | 4-5 | Live UAT (items below), flip defaults, delete TS + packages + patches + flags + oracle, `steamCmPortComplete.test.ts`, STEAM-STACK.md and CLAUDE.md amendments, crates README section 12, close the folded todo | Delete gate |

**Split option (operator's call, not a recommendation to override D-13):** Wave 4 (Mac Steam owned-apps path) is the only slice with no steam-user deletion dependency, so it could be peeled off as a follow-on phase if scheduling pressure appears. Everything else is coupled: steam-user cannot be deleted until sign-in, session, depot callers and Refresh have all moved.

## Code Examples

### Credential-refusal mapping (golden-test this)
```rust
// Source: steam-vent session.rs (LoginError, From<EResult>), CONTEXT CREDENTIAL_REFUSAL_*; verified against a9e8164 source
fn eresult_of(e: &ConnectionError) -> Option<i32> {
    match e {
        ConnectionError::LoginError(LoginError::InvalidCredentials) => Some(5),
        ConnectionError::LoginError(LoginError::Unknown(r)) => Some(*r as i32),
        ConnectionError::LoginError(LoginError::AccessToken(RefreshTokenError::Expired)) => Some(27),
        _ => None, // network/timeouts: transient, never latch credentialsMissing
    }
}
const CREDENTIAL_REFUSAL: [i32; 5] = [5, 15, 26, 27, 63];
```

### Mac Steam owned-apps guard order (D-14)
```text
helper --steam-owned-apps:
  attach (CLIENTENGINE_INTERFACE_VERSION005 -> pipe -> global user -> IClientUser)
  BLoggedOn == 1 ?            else exit "not-logged-on"  -> CM fallback
  GetSteamID == stored id ?   else exit "account-mismatch" -> CM fallback
  resolve GetSubscribedApps by function-ID high half 0x8532, require exactly one slot
  n = call(NULL,0); buf[n]; call(buf,n)   // two-call protocol
Rust: PICS (anonymous) common.type for each id -> keep type==game; demos = licensed demos ∩ Steam set
```
Function-ID high halves (this build, 084): `BLoggedOn` 0x6585, `GetSteamID` 0xd6fc, `BIsSubscribedApp` 0x8d36, `GetSubscribedApps` 0x8532. Resolve by ID at runtime, never by slot index (12 new slots on this build). [CITED: 084 README]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| steam-vent `a9e8164` + vendored anon patch | steam-vent `767481a`: anon fix, `login_with_refresh_token_and_logon_id`, `Send` login futures upstream | 2026-11-11/12 | No vendor step; planner can drop 080's `vendor.sh` from the plan |
| steam-user / steam-session (Node) | steam-vent + Web API sign-in + reqwest | this phase | Removes two packages, `lzma`, `zstddec`, two patches |
| `GetOwnedGames` via CM only | Mac: `GetSubscribedApps` from running Steam, CM fallback | 084 | No logon, no wrap on the primary Mac path |
| "Wrap is mandatory" | "Wrap is insurance" (074/075), retest pending | 2026-11-09 | D-09 may delete it |

**Deprecated/outdated:** steam-vent `a9e8164` pin and `vendor.sh` anon patch (upstream fixed); steamroom/steam-client-lib as fallbacks (kept only as contingency).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | slopcheck could not run; all new packages unverified by it | Package Legitimacy Audit | Planner must gate installs with human-verify (already stated) |
| A2 | steam-vent `767481a` compiles against the 080/085 spike call sites unchanged (not compiled in this session) | Standard Stack | Plan 1 must prove it; fallback is `a9e8164` + vendor patch |
| A3 | `rsa`/RUSTSEC-2023-0071 is the only new cargo-deny finding from steam-vent's tree | Pitfall 9 | Extra ignores or crate swaps in Wave 0 |
| A4 | Wake detection by wall-vs-monotonic gap is sufficient (no shell wake notification needed) | Pattern 3 | One extra shell hook if gap detection misfires |
| A5 | steam-user's leftover cache files are harmless on disk | Runtime State Inventory | Minor cleanup task |
| A6 | The 92 s Run A stall came from an un-timed await in the spike loop | Pattern 3 | The bound may not cover the real cause; keep the loop free of awaits regardless |
| A7 | Recommending ring over aws-lc as provider | Standard Stack | Either is valid per 082; low risk |
| A8 | "Rust returns the finished library" means data, not store writes (Open Question 1) | Refresh boundary | If the operator wants stores in Rust, the phase grows by the Phase 68 store engine |

## Open Questions

1. **What does D-12 "Rust returns the finished library to the existing TS call site" mean for stores and frontend pushes?**
   - Known: `refresh()` writes `steamLibraryStore`, `steamMetadataStore`, `steamSyncStore`, in-memory `libraryState`, and pushes to the renderer; enrichment is lazy per game, not in `refresh()`.
   - Unclear: whether the operator expects the HTTP enrichment moved as a callable op (recommended) or Refresh to absorb the lazy per-game fetch.
   - Recommendation: confirm the boundary in "Refresh boundary" before planning Wave 3.
2. **Run C results (D-01, probe interval/timeout).** Log is at `.planning/spikes/085-steam-vent-long-lived-session/runs/c-long-hold.log`, ends about 23:47 NZDT. Plan with Option A and the decision rule above; revise only if Run C shows kicks or false positives.
3. **steam-vent pin.** Move to `767481a`? It changes CONTEXT's stated rev. Needs operator ack; the plan-1 compile check de-risks it. Optionally set the Rust-side logon id instead of the steam-user one (D-18 stays as locked).
4. **Persona fetch over steam-vent** (D-06) is unvalidated; a short spike inside Wave 1 should settle it.
5. **CDN tokens.** Does production ever get a non-empty token from `CdnAuthTokenCache`? Check `gamelib.log` before deciding to delete `cdnAuth.ts` and return `''` from the Rust host.
6. **D-10 vs the skill reference.** `mac-steam-client-integration.md` says to log on *unwrapped* when Mac Steam does not log off within 5 s (075 showed an unwrapped full Refresh safe on 2026-11-09); D-10 locks the 5 s *refusal* with the guided step. D-09's retest resolves it: if the retest passes the wrap is deleted and the conflict is moot; if it fails, D-10 stands.
7. **Where does the persisted per-install `logonID` live?** A new `configStore` key is the simplest; the plan must state it.
8. **Jest strategy** (Claude's discretion): recommended is Phase 75's: mock the async boundary and replay recorded Rust results (`rust-results.json`), so Jest needs no cargo; spawn the real CLI only in `meta/` sweeps.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| rustc / cargo | all crates | yes | 1.99.1 | — |
| Node + pnpm | sidecar, Jest | yes (repo toolchain) | per repo | — |
| Network to Steam CM / api.steampowered.com / codeberg | live gates, sweeps | yes (operator network; goes off only for the reconnect action) | — | Tier 1 goldens and fake backend for CI |
| Running, signed-in Mac Steam | D-09 retest, D-14 path | operator machine | — | CM path |
| cargo-deny | advisory check | no (CI only, `audit.yml`) | — | Run in CI; read advisories manually |
| slopcheck | package audit | no (install refused) | — | `[ASSUMED]` tags + human-verify checkpoint |
| Windows and Linux hosts | CI legs | CI only | — | build + `cargo test` on the three legs (as 73/75) |

**Missing with no fallback:** none blocking. Windows/Linux behaviour is verified by CI, not live, as in 73/75.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `cargo test` (Rust crates) + Jest 29 (TS callers, parity replay, delete gate) |
| Config file | `src-tauri/Cargo.toml` workspace; `jest.config.js` at repo root |
| Quick run command | `cd src-tauri && cargo test -p gamelib-steamcm -p gamelib-steamcm-cli` |
| Full suite command | `cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli -p gamelib-steamfiles -p gamelib-steamfiles-cli -p gamelib-steamcm -p gamelib-steamcm-cli && cd .. && pnpm test:ci` (touched files: `pnpm jest <path>`) |
| Type/lint gates | `pnpm tsc`, `pnpm lint:src`, `cd src-tauri && cargo clippy --workspace` (shrink-only ratchet), `pnpm find-deadcode`, `pnpm planning-gates` |

### Phase Requirements -> Test Map
| Req / Decision | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| D-01/D-03 lease, idle close, generation, shutdown ordering | concurrent acquires share one logon; close 60 s after last release; no logon after sign-out; never log off mid-lease; shutdown pays owed goonline | unit (fake backend, paused clock) | `cargo test -p gamelib-steamcm --test session_fake` | no, Wave 0/1 |
| D-02 reconnect | dead call -> probe -> rebuild -> retry once; 34 stops with no retry; backoff 5->60 | unit (fake backend) | same | no, Wave 1 |
| D-04 anonymous | shared, 15 s connect bound, 60 s idle from last in-flight read | unit | `cargo test -p gamelib-steamcm --test anon_fake` | no, Wave 1 |
| D-05 Web API | QR rotation, credentials, guard types, poll states, EResult -> UI state | unit with mock HTTP server | `cargo test -p gamelib-steamcm --test webauth_mock` | no, Wave 1 |
| D-06/D-07/D-08 | persona fallback at 5 s; token reused; refusal -> `credentialsMissing`; no-op guard store | unit + Jest (`credentialsMissing.test.ts` style) | `pnpm jest src/backend/storeManagers/steam/__tests__/credentialsMissing.test.ts` | exists, to adapt |
| PICS / depot key / request code / owned / redeem shapes | JSON shapes equal steam-user's; tokens before package info; numeric vs string parity | golden (Tier 1) | `cargo test -p gamelib-steamcm --test golden` + `pnpm jest .../steamcmGolden.test.ts` | no, Wave 1 |
| D-09/D-10/D-11 wrap | 5 s refusal, owed record format round-trip, 15 s spacing, reconnect wrapped | unit (fake clock + fake log file) | `cargo test -p gamelib-steamcm --test wrap` (only if wrap kept) | no |
| D-12/D-16 Refresh | final library equals TS on the CM path | Tier 2 sweep (local, operator account) | `pnpm steamcm-parity-sweep` | no, Wave 3 |
| D-14/D-15 | guard order, fallback on mismatch/ambiguity/crash | unit (helper stub) + live | `cargo test -p gamelib-steamcm --test macowned` | no, Wave 4 |
| D-18 flags | default values, env override, jest pin | Jest | `pnpm jest .../steamCmFlags.test.ts` | no |
| Channel parity | OPS == constants == match arms | Jest static | `pnpm jest src/backend/__tests__/steamCmChannelParity.test.ts` | no (model `depotChannelParity.test.ts`) |
| Delete gate | TS files, flags, packages, patches gone; goldens kept; no vacuity | Jest | `pnpm jest src/backend/__tests__/steamCmPortComplete.test.ts` | no, last plan |
| Sidecar contract | no handle survives stdin EOF | existing | `pnpm smoke:exit-check`, `pnpm smoke:sidecar` | exists |
| Lease policy | production callers use the lease API | existing | `pnpm jest src/backend/__tests__/steamAuthSessionPolicy.test.ts` | exists, to adapt |

**Live-only (manual, UAT contract; each item names the log line proving the Rust path ran):** existing signed-in user stays signed in with no new sign-in (D-07); QR and credentials + typed Steam Guard sign-in (D-05); unwrapped full-Refresh Friends retest, TS arm in Wave 0 and CM-fallback arm in Wave 3 (D-09); mid-lease reconnect after network off/on and after sleep (D-02/D-11); Mac Steam path Refresh plus fallback on account mismatch (D-14); a real key redeem if the operator has a key. Authored by one plan, run by another (README section 7). Network goes off only for the action; operator needs it to talk to Claude. Launch with `pnpm tauri:dev`.

### Sampling Rate
- **Per task commit:** `cargo test -p gamelib-steamcm` plus the touched Jest file
- **Per wave merge:** full suite command, `cargo clippy --workspace`, `pnpm tsc`
- **Phase gate:** full suite green on all three CI legs, sweeps clean with divergences accepted, live UAT passed, then `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src-tauri/crates/gamelib-steamcm{,-cli}` scaffolds, `-p` entries in `rust-test.yml`, `EXPECTED_LOCKFILE_CRATE_NAMES` update
- [ ] `FakeBackend`, a paused-clock test harness and a mock HTTP server helper
- [ ] `src-tauri/deny.toml` rsa ignore (or the real fix if one appears)
- [ ] `steamCmChannelParity.test.ts` and `steamCmFlags.test.ts` shells
- [ ] `meta/gamelibSteamcmCli.ts` with `createFakeHomeProfile()`
- [ ] Each `<verify>` block: `npx prettier --check` over the exact written paths, scoped, after `--file-info` (project convention); omit with a note if every path is prettier-ignored

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Steam Web API sign-in over HTTPS; password RSA-encrypted with Steam's key; never logged; token store unchanged |
| V3 Session Management | yes | Refresh token only in keyring/dev vault; lease/generation fencing; sign-out drops sessions and fences late logons |
| V4 Access Control | partial | Steam account scoping by SteamID from JWT `sub`; Mac Steam path requires `GetSteamID == userData.steamId` |
| V5 Input Validation | yes | `#[serde(deny_unknown_fields)]` arg structs; numeric `appId` guard (`NUMERIC_ID`) before any URL; HTTP response size/time bounds |
| V6 Cryptography | yes | `rsa` crate public-key encrypt only; rustls provider explicit; no custom crypto; `SSLKEYLOGFILE` unset |
| V7 Error/Logging | yes | No token/password/key/request-code in logs; error reasons from a fixed allow-list (T-74-85 convention) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leakage through logs/Debug | Information disclosure | Never log rustInvoke args; no `Debug` on secret-bearing structs; log channel + id only |
| TLS secret export via `SSLKEYLOGFILE` | Information disclosure | Assert unset at session start; shell never sets it |
| Forged `rustInvoke` / `openExternal` frames on the shared stdout pipe | Spoofing/Tampering | Keep the existing scheme allow-list; new handlers validate every arg |
| Mac helper tampering or bad slot resolution | Tampering/DoS | Out-of-process; exit non-zero on ambiguity; any failure falls back to CM; bounded timeout (30 s as `HELPER_TIMEOUT_MS`) |
| Session replacement DoS (34) | Denial of service | Treat as terminal, no retry loop; `logonID` separation during `cm=ts` |
| Marvin timing attack on `rsa` 0.9 | Information disclosure | Not reachable (public-key encrypt only); documented `deny.toml` ignore |
| Untrusted HTTP bodies (store appdetails) | Tampering | Strict parse, size cap, plain-text-only description handling (T-2-02 convention carried over) |
| Path traversal via appId into URLs | Tampering | `NUMERIC_ID` check before URL construction (existing T-06-01/T-21-05) |

## Project Constraints (from CLAUDE.md)

- Tech stack is React + TypeScript on a Rust/Tauri shell; GameLib is independent: do not raise deviation from upstream Heroic as a concern.
- The Steam stack record in `.planning/research/STEAM-STACK.md` is frozen until this phase amends it; CLAUDE.md "Technology Stack (Steam)" must be updated with it (explicit phase requirement).
- Conventions (load `Skill("gamelib-conventions")`): todo files carry `severity:`/`platform:`/`ready:` (relevant when closing the folded todo); spawns from `src/` or `meta/` use `createFakeHomeProfile()` (the `meta/gamelibSteamcmCli.ts` spawn helper); sidecar timers/watchers/sockets/child handles are `unref()`ed and leave no unbounded in-flight work at boot (QR poll timers, any TS wrapper); UAT items use `### N.` at column 0, `expected:` inline, `result:` opening with a status word; each task `<verify>` runs `npx prettier --check` over exact written paths (check `--file-info` first, scoped, never `.`).
- Use `graphify query` for orientation; never read `GRAPH_REPORT.md` or `graph.json` whole.
- GSD commands use a hyphen (`/gsd-execute-phase`).
- Project memory: `pnpm tauri:dev` for live runs; restart dev after sidecar changes; bottled Steam is a narrow fallback (not a reroute); "bridge verified" is strict (not relevant here beyond not weakening it); `gsd-sdk commit` sweeps dirty `.planning`, so use `git add <file>` + `git commit`; `new-milestone` `phases.clear` can delete live phase dirs.
- Prior phases' TS code must follow existing patterns: TypeScript signatures unchanged, async where they were sync (63 D-09).

## Sources

### Primary (HIGH confidence)
- `.planning/phases/79-.../79-CONTEXT.md`, `79-DISCUSSION-LOG.md` (locked decisions)
- `.claude/skills/spike-findings-gamelib/references/rust-migration-steam.md` (CM requirements, call sketches, avoid/constraints)
- `.claude/skills/spike-findings-gamelib/references/mac-steam-client-integration.md` (wrap, 075 retest evidence)
- `.planning/spikes/085-steam-vent-long-lived-session/` (README, `src/main.rs`, `runs/a-*.log`, `runs/b-*.log`; `runs/c-long-hold.log` has only the start/logon/first-liveness lines at 22:47 NZDT)
- `.planning/spikes/082-one-process-tls-providers/README.md`, `084-owned-apps-from-running-steam/README.md`, `081-three-session-coexistence/README.md`
- steam-vent source: `~/.cargo/git/checkouts/steam-vent-61322ccb74a9548f/a9e8164/` (`session.rs`, `auth/mod.rs`) and a bare clone of codeberg main (`git diff a9e8164 main`, CHANGELOG, `Cargo.toml`)
- `src-tauri/crates/README.md` (recipe, sections 1-11), `src-tauri/crates/gamelib-steamfiles/**`, `src-tauri/src/depot_dispatch.rs`, `src-tauri/src/sidecar.rs`, `src/backend/sidecar/depotHostRegistration.ts`, `sidecarRpc.ts`
- Repo code read: `steam/user.ts` (surface), `userTypes.ts`, `userSignIn.ts`, `userSignInState.ts`, `macSteamOffline.ts` (header/deps), `library/refresh.ts`, `gameMetadata.ts`, `anonymousClient.ts`, `depot/planModel.ts`
- Git history for the Phase 75 flag and gate mechanics: commits `2076d6431`, `e88a189e7`, `74738eab2`, `351d4874a`
- crates.io API (versions, downloads, repositories) and `git ls-remote` for codeberg

### Secondary (MEDIUM confidence)
- rustsec.org RUSTSEC-2023-0071 (patched `>=0.10.0`, Medium 5.9), fetched 2026-11-14

### Tertiary (LOW confidence)
- None load-bearing. The cause of 085's 92 s stall (A6) and steam-user leftover files (A5) are untested hypotheses.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH. steam-vent and the call shapes are proven by spikes; the newer `767481a` pin is verified by diff but not compiled.
- Architecture: MEDIUM-HIGH. The recipe is proven three times; the session actor, `SteamCmClient` seam and Refresh boundary are design recommendations built on read code.
- Pitfalls: MEDIUM-HIGH. Most come from spikes and repo history; Pitfalls 5, 7, 8 and 9 flag untested or CI-only items.

**Research date:** 2026-11-14
**Valid until:** 7 days for D-01 and probe tuning (Run C ends tonight); 30 days for the rest. Re-check upstream steam-vent HEAD at plan time.
