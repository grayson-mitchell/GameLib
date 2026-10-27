# Phase 54: Steam library without an authenticated CM session at launch - Research

**Researched:** 2026-10-25
**Domain:** steam-user / steam-session CM session lifecycle, Steam Web API tokens, anonymous PICS (Node sidecar, `src/backend/storeManagers/steam/`)
**Confidence:** MEDIUM overall. HIGH on the anonymous-PICS half and the call-site inventory (probed live, anonymous). **LOW-MEDIUM on the Web API half: the phase's stated mechanism does not work as written (see Finding 1).**

## Summary

The phase goal has two halves. The anonymous-CM half is solid. I ran steam-user 5.3.0 `logOn({anonymous:true})` from this machine under a fake HOME (no real account involved): logon takes about 1.6 s, `getProductInfo(..., true)` returns `common.oslist`, `config.installdir`, `config.launch` and `depots` for every public app tried (Age of Decadence, ELEX, HOARD, Dota 2, CS2, Elden Ring, Black Myth), a 700-appid bulk call returns in about 1.0 s, and `logOff()` lets the process exit by event-loop drain. The authenticated-session half is a lifecycle refactor of `user.ts` plus a refcounted acquire/release around install paths.

**The Web API half has a blocking premise error.** The phase text and the todo say to "mint an access token from the stored refresh token". GameLib's stored token is `EAuthTokenPlatformType.SteamClient` (`user.ts:734`). steam-session 1.9.4's own docs (in `node_modules/steam-session/dist/LoginSession.js`, `refreshAccessToken` and `getWebCookies` JSDoc) say that since 2025-04-30 a SteamClient refresh token cannot get an access token or web cookies unless the request is sent over an **authenticated CM session**. The maintainer confirms it is a Valve backend change (dev.doctormckay.com topic 5687). That is exactly the logon this phase removes. node-steam-session issue #56 (opened 2026-05-20, closed "not planned" 2026-07-17, no maintainer reply) shows it still fails on 1.9.4. So `refreshAccessToken()` on the stored token will not work at launch without a CM logon. Playnite avoids the problem because it uses a separate **web-browser login session** (store page `webapi_token`), not a client token.

Only `MobileApp` (and, via cookies, `WebBrowser`) refresh tokens can mint web access tokens over plain HTTPS (`WebApiTransport`, no CM). But steam-user refuses any refresh token without `aud` containing `client` (`09-logon.js:156-161`), so a MobileApp token cannot replace the SteamClient token for depot installs. Any no-CM library list therefore needs a **second credential**, or a cache-first design that accepts a stale list at launch. That is a product/UX decision (a second sign-in approval) that no CONTEXT.md settles. The planner must surface it before writing tasks.

**Primary recommendation:** Build Track A (certain): an anonymous-CM `AnonymousSteam` module for all public PICS reads, plus a refcounted `AuthenticatedSession` for installs and key redeem, with no authenticated logon on boot, game-page open, Play, or sync. Build Track B (library list) as cache-first at launch, with a Wave-0 operator spike to prove a MobileApp-token Web API path (Option B1) before committing to it. The cached list and local ACF state are already pushed by `init()`.

## Addendum 2026-10-27: spike 046, the go-offline wrap is in scope

This addendum supersedes the parts of this research that accept a Friends sign-out on authenticated
work (Finding 5's "accepted by the phase", A7, Open Question 4, UAT item 4). The Web API half
(Track B) was already dropped on 2026-10-26; see the debug session's "Follow-up 2026-10-26".
Sources: `.planning/spikes/046a-steam-url-offline-toggle/`, `046b-wrap-around-logon/`,
`046c-reconnect-reflip/` and the debug session's "Verdict 2026-10-27".

### Finding 10: GameLib can drive Mac Steam offline/online around its logon

- **Mechanism:** `shell.openExternal('steam://open/gooffline')` and
  `('steam://open/goonline')`. These are undocumented verbs in `steamui.dylib`'s native
  `steam://open/` table; Valve's own JS uses `steam://open/goonline`. LogOff lands in ≤0.25 s
  with the same `not auto reconnecting due to user initiated logoff` line as the menu's Go
  Offline. Logon completes ≈1.3-1.5 s after `goonline`, on the same `steam_osx` process, with
  no dialog and no permission prompt. Both verbs are no-ops when Steam is already in that state
  (0 log lines). [VERIFIED: 046a, n=4]
- **The wrap keeps Friends clean:** `gooffline` → GameLib cold logon (971 ms) → `goonline` 2 s
  later. GameLib's 385-game fetch completed across Mac Steam rejoining, with no disconnect or
  relog, and Friends stayed signed in with status changeable. [VERIFIED: 046b, operator, n=1
  automated + n=2 manual on 2026-10-26]
- **Reconnects flip (expected, not live):** `steam-user`'s `autoRelogin` defaults to `true`
  (`resources/default_options.js:27`), and `user.ts:615` doesn't override it. On a non-fatal
  drop, `_handleLogOff` (`09-logon.js:631-686`) calls `logOn(true)` after a 1 s backoff, a full
  `CMsgClientLogon`. The canary's `client.relog()` (`user.ts:287`) takes the same path.
  [VERIFIED: source; flip ASSUMED by mechanism, 046c]
- **Untested:** a running Mac Steam game during `gooffline` (Settings → Internet refuses then
  with `#UserManagement_OfflineMode_MustCloseGames`; the URL path is unknown), and Windows/Linux
  Steam (verbs probably shared, Friends behaviour unmeasured). Wrap on macOS only.

### Pattern 3: the wrap inside the authenticated entry point

The wrap lives inside `acquireAuthenticated` (Pattern 2), around the first acquire's cold
connect, so the refcount and the source gate cover it for free:

```typescript
// Sketch: macOS only; the other platforms call connect() directly
async function withMacSteamOffline<T>(connect: () => Promise<T>): Promise<T> {
  const state = readMacSteamCmState()        // last [State, …] in connection_log.txt; null if Steam not running
  if (state !== 'Logged On') return connect() // not running or already offline: no toggle, no goonline
  const logOff = watchConnectionLog(/user initiated logoff/, 5000) // offset taken BEFORE firing
  await shell.openExternal('steam://open/gooffline')
  if (!(await logOff)) throw new GuidedOfflineRequired() // UI shows the guided "Go Offline" step
  try {
    return await connect()
  } finally {
    await shell.openExternal('steam://open/goonline') // only reached when the wrap took Steam offline
  }
}
```

- The evidence gate is mandatory: a blind `gooffline` is indistinguishable from a no-op when
  Steam refuses (a running game?) or a Steam update renames the verb.
- **Own every logon:** construct the client with `autoRelogin: false`. Treat `disconnected` as
  session ended (null `this.client`, release waiters). The canary's stale-socket path re-enters
  `acquireAuthenticated` instead of calling `relog()`. A mid-install drop then costs a fresh
  wrapped logon rather than a silent flip.
- The session may stay open after `goonline` (046b), so the idle grace in Pattern 2 is
  unaffected.
- `connection_log.txt` lives at `~/Library/Application Support/Steam/logs/`. Read from a byte
  offset taken before firing; the lines carry a trailing CR.
- Sidecar exit contract: the log watcher's poll timer is `unref?.()`'d and bounded (5 s).
- Pitfall: never fire `goonline` when the user had Steam offline on purpose.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Owned-games list | API / Backend (Node sidecar) | Database / Storage (`steamLibraryStore` cache) | Network call plus merge with on-disk ACF state; renderer only receives `pushGameToLibrary` |
| Public PICS reads (platform, installdir, launch exe) | API / Backend (anonymous CM) | Database / Storage (`steamMetadataStore`) | Public data; no user identity needed |
| Depot install auth (licenses, depot keys, manifests) | API / Backend (authenticated CM, scoped) | — | Ownership is package-level and needs the user's logon |
| Refresh-token storage | Rust shell keyring via `TokenStore` seam | — | Existing `tokenStore.ts` seam; a second slot needs a Rust allow-list change |
| Friends-list protection (the user-visible goal) | API / Backend session policy | Native Steam client (observed) | Owned entirely by whether GameLib opens an authenticated CM logon |
| Sign-in (QR / credentials) | API / Backend (`steam-session`) | Renderer (QR / guard UI) | Unchanged except the persona-name logon (Finding 8) |

## User Constraints

No CONTEXT.md exists for this phase (the user chose to continue without discuss-phase). The phase goal in ROADMAP/STATE and the source todo are the only constraints:

- Launching GameLib must not sign the Mac Steam Friends list out.
- Owned-games list moves off the CM; public PICS reads move to an anonymous CM session; an authenticated session opens only for depot installs and closes afterwards.
- Reopens the frozen `.planning/research/STEAM-STACK.md`; it **must be updated with the reason** (Section "STEAM-STACK.md update" below).
- Phase treated as backend-only (no UI-SPEC). **Caveat:** Option B1 below adds a sign-in step, which is UI. If the user picks B1, the backend-only assumption is false.

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped (TBD). Derived success criteria for the planner to use as IDs:

| ID | Description | Research Support |
|----|-------------|------------------|
| P54-SC1 | A launch of a signed-in GameLib issues zero authenticated CM logons (no `logOn({refreshToken})`) on boot, sync, game-page open, Play and bridge launch-target resolve | Inventory (Finding 2); source-gate and runtime tests (Validation Architecture) |
| P54-SC2 | The owned-games list still renders at launch with the same fields (`appid`, `name`, `playtime_forever`, `rtime_last_played`) | Findings 1, 3, 9 |
| P54-SC3 | Platform capture, game-page metadata, installdir and bridge launch target read PICS over an anonymous CM session | Finding 4 (probed live) |
| P54-SC4 | Depot installs, shared-redist installs, prescreen and key redeem open an authenticated session on demand and close it after (refcount plus idle grace) | Finding 5 |
| P54-SC5 | Operator live gate on the Mac: Friends stays signed in across GameLib launch, library sync and a Play | Validation Architecture, manual UAT |
| P54-SC6 | `STEAM-STACK.md` and `CLAUDE.md` Steam stack summary updated with the reason | STEAM-STACK.md update section |
| P54-SC7 | Sidecar exit contract holds (`smoke:sidecar` green; every new timer `unref`'d; no unbounded boot work) | Pitfalls 5, 6 |
</phase_requirements>

## Standard Stack

No new packages. Everything below is already installed. [VERIFIED: node_modules package.json]

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| steam-user | 5.3.0 | Anonymous CM session for PICS; scoped authenticated session for installs | Already the frozen stack. `logOn({anonymous:true})` verified live |
| steam-session | 1.9.4 | Sign-in; `refreshAccessToken()` for MobileApp-type tokens (Option B1) | Already the frozen stack |
| axios | 1.20.0 | `IPlayerService/GetOwnedGames` with `access_token` (Option B1) | Already used for store metadata. Must be given a `timeout` (exit contract) |
| @node-steam/vdf | 2.2.0 | Unchanged | Unchanged |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Second MobileApp refresh token (B1) | Cache-first, authenticated refresh only on explicit user Refresh (B2) | B2 needs no new credential or UI but the list is stale until the user presses Refresh, and that Refresh signs Friends out |
| Second MobileApp refresh token (B1) | WebBrowser-type token plus `webapi_token` from store page (Playnite model, B3) | Needs cookie plus store-page scrape; more moving parts; same second-sign-in cost |
| Web API | Anonymous CM `getUserOwnedApps(ownSteamID)` | Works only for public "game details" profiles; probed anonymous call to another account returned `AccessDenied (15)`. Not reliable as primary |

**Installation:** none. **Version verification:** `node -p "require('./node_modules/steam-user/package.json').version"` returned 5.3.0; steam-session 1.9.4; axios 1.20.0; `@node-steam/vdf` 2.2.0 (all run in this repo, 2026-10-25).

## Package Legitimacy Audit

No external packages are added by this phase. All packages are existing, frozen-stack dependencies already in `package.json`. slopcheck not run (nothing to check). **Packages removed:** none. **Packages flagged [SUS]:** none.

## Findings

### Finding 1 (BLOCKER for the Web API half): a SteamClient refresh token cannot mint an access token without an authenticated CM
- `LoginSession.refreshAccessToken()` JSDoc: "As of 2025-04-30, this method works only for MobileApp. Using WebBrowser will fail with AccessDenied, and using SteamClient will fail with the same if not sent over an authenticated CM session (as done by node-steam-user)." `getWebCookies()` JSDoc says the same. [VERIFIED: node_modules/steam-session/dist/LoginSession.js lines ~640-660, ~760-795]
- Maintainer: a backend change; the request now needs a connection that has sent `CMsgClientLogon`; look at steam-user. [CITED: dev.doctormckay.com/topic/5687-refreshaccesstoken-not-working-on-eauthtokenplatformtypesteamclient/]
- Issue #56 on node-steam-session (steam-session 1.9.4, opened 2026-05-20, closed 2026-07-17 as "not planned"): `getWebCookies()` AccessDenied, `finalizelogin` HTTP AccessDenied (15), `GenerateAccessTokenForApp` over CM got no response. No workaround documented. [CITED: github.com/DoctorMcKay/node-steam-session/issues/56]
- Transport detail: SteamClient-type `LoginSession` uses `WebSocketCMTransport` (unauthenticated CM websocket); every other type uses `WebApiTransport` (HTTPS `api.steampowered.com`, no CM at all). [VERIFIED: LoginSession.js lines 73-82]
- `GenerateAccessTokenForApp` itself is `IAuthenticationService` (`AuthenticationClient.js:205`), `renewal_type` None unless `renewRefreshToken()` is used. For a MobileApp token this is a plain HTTPS call: it creates no CM logon and cannot touch Friends. [VERIFIED: AuthenticationClient.js]
- steam-user cannot log on with a MobileApp token: it rejects any refresh token whose `aud` lacks `client` (`09-logon.js:156-161`). Token audiences: SteamClient = web+client, WebBrowser = web, MobileApp = web+mobile. [VERIFIED: 09-logon.js; CITED: steam-session README]
- Not empirically re-tested against the operator's real token (no autonomous logon on the real account). Treat as documented-but-unverified-locally and put it in the Wave-0 spike.
- Lifetime: refresh tokens about 200 days [CITED: steam-user docs, via search summary]; access tokens about 1 day [ASSUMED: single forum report]. Read `exp` from the JWT rather than assuming; refresh when under about 5 min remain; keep access tokens in memory only.

**Consequence:** "Web API owned-games with an access token from the stored refresh token" is only feasible with one of:
- **B1 (recommended if the user accepts a one-time extra sign-in step):** at sign-in, additionally run a `new LoginSession(EAuthTokenPlatformType.MobileApp)` QR / credentials flow to obtain a second refresh token, store it, and mint access tokens from it at launch over HTTPS. Existing users have no such token and need a one-time "upgrade" prompt; until they complete it, behave as B2. Storage cost: a second keyring slot means a Rust change (the allow-list `keyring_account()` in `src-tauri/src/main.rs:1759-1832` only knows `steam-refresh-token`) and another Keychain item (measured 48.9 s and 291 s Keychain reads on this repo's slot; see `main.rs:1770`). Alternatively pack both tokens into the one existing slot as a JSON blob (no Rust change; readers must tolerate the legacy bare-JWT value).
- **B2 (no new credential):** at launch show the cached library (already pushed by `init()`); open the authenticated session only for sign-in, explicit user Refresh and installs. The Web API half is dropped. Honest cost: new purchases do not appear until Refresh, and Refresh signs Friends out.
- **B3:** WebBrowser-type token plus web cookies plus `store.steampowered.com` `webapi_token` scrape (what Playnite does through a webview). Not recommended: heavier than B1 for the same second-credential cost.

### Finding 2: Inventory of every authenticated-client use in `src/` (file:line)
Only ONE `logOn` call exists: `user.ts:663` `client.logOn({ refreshToken })`, inside `connectSteamUserClient` (`user.ts:580`), `new SteamUserLib({ enablePicsCache: false })` at `user.ts:589`. It is reached from three callers: `ensureConnected` (`user.ts:367`), `finishAuth` (`user.ts:567`, credentials and guard-code flows) and the QR `authenticated` handler (`user.ts:768`). [VERIFIED: grep]

| # | Site (file:line) | What it does | Needs auth? | Phase 54 disposition |
|---|------------------|--------------|-------------|----------------------|
| 1 | `library.ts:926-1001` `refresh()`: `ensureConnected()` (958), `getUserOwnedApps(client.steamID,{includePlayedFreeGames:true})` (995). Triggered at boot via `init()` -> `runOnceWhenOnline(() => this.refresh())` (`library.ts:862-863`) | Owned list + playtime | Needs the user's identity (private profile) | Replace with Web API (B1) or cache-first (B2). **This is the launch logon** |
| 2 | `library.ts:1043` `captureOwnedAppPlatforms(client as PlatformCapturePicsClient, appIds)`; `platformCapture.ts:257,348` `getProductInfo(scoped, [], true)` | Bulk `common.oslist` for owned apps | No (public). Caveat Finding 4 | Anonymous client |
| 3 | `games.ts:1004-1016` `getExtraInfo()`: fire-and-forget `SteamUser.ensureConnected()` on first game-page open | Only exists to unlock keyring and connect | Does nothing a page needs | Remove the connect; keep `noteSteamAuthTrigger('game-page')` only if still needed for the keyring gate |
| 4 | `installLocation.ts:236-310` `fetchInstalldir`: `getClient()` / `ensureConnected()` (245-271), `getProductInfo` (289) | `config.installdir` for the install target | No for most apps (Finding 4 caveat) | Anonymous client; on `public_only` miss fall back to authenticated if an install session is open (this runs inside an install) |
| 5 | `bridge/launchTarget.ts:89-190` `resolveBridgeLaunchExe`: `getClient()` / `ensureConnected()` (100-114), `getProductInfo` (132). Callers `games.ts:1651` (post-install shim), `2874` (Play), `3577` (uninstall) | `config.launch` Windows exe | No (public), same caveat | Anonymous client |
| 6 | `depot.ts:403` `getDepotClient()`; `depot.ts:763-` `buildDepotPlan` (`ensureConnected` 774; `fetchAppInfo` 562, `getOwnedSets` 527-540 via `client.licenses`, `fetchDlcInfos` 587, `getDepotDecryptionKey` 692, `getRawManifest`) | Install plan, ownership, keys, manifests | **Yes** (licenses, depot keys). Code comment `depot.ts:521-525` already says anonymous cannot supply ownership | Keep authenticated, inside the scoped session |
| 7 | `depot.ts:513` `ensureConnected()` in `withPlanBuildRetry`; `depot.ts:1280` `downloadSharedRedistDepots` `ensureConnected()` (caller `bridge/sharedRedistInstall.ts:364`); `depot.ts:1024` `prescreenBridgeDepots` -> `buildDepotPlan` (caller `games.ts:1243`); `depot.ts:4155` `downloadSteamDepots` (caller `games.ts:2213`); `library.ts:406` resume path -> `buildDepotPlan` (caller `resumeInterruptedSteamInstall`, only from `games.ts:1116` on an install click) | Install-time plan building | Yes | All inside the scoped authenticated session |
| 8 | `depot.ts:3768` `SteamUser.getClient()?.steamID?.getSteamID64()` for manifest `LastOwner` | Needs the SteamID64 only | No: needs the ID, not a live client | Read from `configStore userData.steamId` (or the refresh-token JWT `sub`); the session may already be closed by finalize time |
| 9 | `depot/cdnAuth.ts`, `depot/appinfoOrder.ts`, `depot/reconcile.ts`, `depot/decompress.ts` | Authenticated-client helpers used by the depot path | Yes | Unchanged; make sure they receive the scoped session client |
| 10 | `user.ts:1022` `redeemKey()` -> `ensureConnected()` | Key redeem | Yes | Scoped session (user action; Friends sign-out acceptable) |
| 11 | `user.ts:237-473` `ensureConnected()` (canary `getProductInfo(753)` at 251; `relog()` at 283) | The connect/health machinery | — | Becomes the authenticated-session implementation; no caller outside the allow-list may reach it |
| 12 | `user.ts:567` `finishAuth` and `user.ts:768` QR handler: `connectSteamUserClient(refreshToken)` then `getPersonas` (628) | **Sign-in-time** logon only to read the persona name | No (see Finding 8) | Replace; otherwise Friends signs out at every sign-in |
| 13 | `user.ts:495` `logout()` `client.logOff()` | Teardown | — | Also close the anonymous client |

Other `src/` hits for `steam-user` are tests, type shims or comments only (`depotErrors.ts`, `withTimeout.ts`). `src/backend/platform/index.ts` and `src/backend/sidecar/__tests__/skeletonFlows.test.ts` mention the package but open no session. [VERIFIED: grep over src and meta]

Note: `library.ts` uses `getUserOwnedApps`, not `getOwnedApps()` as `STEAM-STACK.md` says. Same underlying service call.

### Finding 3: `IPlayerService/GetOwnedGames` request shape and parity
- steam-user's `getUserOwnedApps` sends the service method `Player.GetOwnedGames#1` with `steamid`, `include_appinfo` (default true), `include_played_free_games`, `appids_filter`, `include_free_sub` (default false), `skip_unvetted_apps` (default true). [VERIFIED: node_modules/steam-user/components/friends.js:835-880; proto `steammessages_player.steamclient.proto:47-56`]
- Web equivalent: `GET https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?access_token=<jwt>&steamid=<id64>&include_appinfo=true&include_played_free_games=true&include_free_sub=false&skip_unvetted_apps=true&format=json`. Playnite sends `format=json`, `access_token`, `steamid`, `include_appinfo`, `include_played_free_games`, `include_free_sub`, `language`, with retry settings 5 attempts / 5 s / HTTP 429 ("Steam sometimes returns 429 even without recent requests"). [CITED: github.com/JosefNemec/PlayniteExtensions SteamLibrary/Services/PlayerService.cs]
- `access_token` is accepted by regular published Web API methods (steam-session README, observed 2023-04-24); Playnite's web path uses it for this exact method. [CITED: steam-session README; Playnite] Not confirmed against a MobileApp-type token for this account: **Wave-0 spike**.
- Parity: it is the same server-side service, so the set is identical. No family-shared games (neither path returned them), no tools/unvetted apps (both skip), free-to-play only if played (`include_played_free_games`), and `include_free_sub` stays false. The thing that changes is the **payload shape**: steam-user rewrites `img_icon_url` into a full `steamcdn-a.akamaihd.net/...jpg` URL; the Web API returns the raw hash. `library.ts` does not read `img_icon_url` in the hydration loop (only `name`, `appid`, `playtime_forever`, `rtime_last_played` at lines ~1153-1226), so the type at `library.ts:986-993` can drop it. JSON 64-bit values arrive as strings in some APIs; `appid` here is a number.
- Empty library: `games` is absent when the count is 0. Handle `response.games ?? []`.
- Keep the existing offline fallback: on any error push the cached list (the code at `library.ts:1001-1013`).

### Finding 4: anonymous PICS (probed live, 2026-10-25, steam-user 5.3.0, fake HOME, no real account)
- `new SteamUser({enablePicsCache:false, dataDirectory:<tmp>}).logOn({anonymous:true})`: `loggedOn` in 1.6 s; `steamID.type === 10` (AnonUser). Process exits cleanly by event-loop drain after `logOff()`.
- `getProductInfo([753,230070,411300,63000,570,730,1245620,2358720], [], true)`: all returned with `missingToken:false`; `oslist` present for all but app 753 (Steam client app has no `common.oslist`); `config.installdir` present; `config.launch` present; `depots` present.
- Bulk: 700 ids (10..7000 step 10) -> 466 returned, 234 unknown (no such app), 50 `missingToken:true` even after steam-user's token round, in about 1.0 s total.
- **Caveat that matters:** the 50 `missingToken` apps come back as `appinfo = {appid, public_only, [common]}` only: 26 had a name, 4 had `oslist`, and none had `config`/`depots`. Anonymous PICS therefore gives a *public subset* for apps whose full data is gated by a license token (older Valve titles and similar). Today's authenticated path uses license `access_token`s (`apps.js:215-224`, `inclTokens`). Effects: platform capture writes nothing for such apps (already fail-soft per D-05); `fetchInstalldir` and `resolveBridgeLaunchExe` return `undefined` (already benign: `app_<appid>` fallback / "no launch exe"). The planner must make these a *known degraded case*, not a regression, and must not weaken the existing 34.14 pending-row and Install-disable behaviour.
- `getProductInfo` with `inclTokens=true` works anonymously (the `getProductAccessToken` round-trip succeeded for public apps). `client.licenses` is empty anonymously, so `getOwnedSets` cannot run there.
- Anonymous `getPersonas` timed out (probe) and anonymous `getUserOwnedApps` for another account returned `AccessDenied (15)`: do not rely on either.
- Friends effect of an anonymous session: **not tested** (needs the operator's Mac Steam). The anonymous account is not the user's account, so it should not touch their Friends; Playnite keeps `LogOnAnonymous` as its only CM logon. [ASSUMED] -> UAT item.
- Session cost to design around: anonymous connect is about 1.6 s cold. Reuse one shared anonymous client (single in-flight connect promise, same dedupe idea as `connectingPromise`), keep it for a short idle window, then `logOff()`.

### Finding 5: depot installs and the authenticated session
- Needs the user's logon: `client.licenses` (package-level ownership, `depot.ts:527-540`, `select.ts` ownership selection), `getDepotDecryptionKey` (`depot.ts:692`), manifest request codes / `getRawManifest`, and CDN auth (`depot/cdnAuth.ts`). All are exercised per install by `buildDepotPlan` and `downloadDepotFiles`. Anonymous logon can fetch only free/public depots; do not route owned-game installs there. [VERIFIED: code comments `depot.ts:521-525`; CITED: spike 001/002 in `spike-findings-gamelib`]
- Design: add to `user.ts` `SteamUser.acquireAuthenticated(reason): Promise<release>` (refcounted). First acquire does what `ensureConnected()` does today (keyring read, cold connect, verdict reporting); last release schedules `logOff()` after an idle grace (about 30-60 s so prescreen -> install -> shim resolve -> shared-redist does not thrash; timer `unref`'d). Keep `ensureConnected()` private/internal.
- Hold the acquisition for the whole install: `runNativeDepotDownload` (`games.ts:2213`) through finalize, `prescreenBridgeDepots`, `downloadSharedRedistDepots`, `resumeInterruptedSteamInstall`. Release in `finally`. Concurrent installs share one session via the refcount. `AbortSignal` cancel must still release.
- **Superseded 2026-10-27 (Finding 10):** the install's logon runs inside the go-offline wrap, so a sign-out is no longer accepted. Original text: Friends sign-out during an install is accepted by the phase. **Unknown, measure in UAT:** whether Friends recovers by itself after `logOff()` (the todo says untested; the debug session says the user can sign back in by hand). Do not promise recovery in any user-facing copy.
- `ensureConnected` internals (canary, `relog`, `credentialsMissing` verdict reporting via `applySignInVerdict`) are reusable as-is inside the authenticated path.

### Finding 6: how the keyring gate interacts
`authTrigger.ts` defers the keyring read at boot unless a deliberate trigger fired; Phase 49 `'boot-probe'` unlocked it for signed-in accounts. Anonymous PICS needs no token, so it needs no keyring read and no trigger. Under B1 the Web API path still needs the stored MobileApp token (a keyring read), so it stays behind the same gate. Under B2 launch does no keyring read for sync at all.

### Finding 7: Playnite reference (what it actually does)
Owned list: Web API `GetOwnedGames` with a web access token from `webapi_token` on `store.steampowered.com` obtained through an offscreen webview session (`SteamStoreService.GetAccessTokenAsync`), with an API-key path for "private account" mode, plus `dynamicstore/userdata` (`rgOwnedApps`) as a fallback, and family sharing / parental on top. Its only CM logon is anonymous. [CITED: PlayniteExtensions SteamServiceAggregator.cs, SteamStoreService.cs, PlayerService.cs] This confirms the web token comes from a **web** session, not a client refresh token.

### Finding 8: sign-in also logs on
`finishAuth` and the QR handler both call `connectSteamUserClient(refreshToken)` just to read a persona name (`user.ts:567, 768`), so every sign-in also signs Friends out. Not "launch", but the same defect and trivially removable: derive `steamId` from the token JWT `sub` (steam-session exposes `session.steamID`, `session.accountName`), and take the display name from `session.accountName` or the public profile XML (`steamcommunity.com/profiles/<id>?xml=1` shows the nickname even for private profiles [ASSUMED]). Recommend including it; flag it to the user as a small scope extension. `userData.steamId` is already persisted and is what Finding 2 row 8 reuses.

### Finding 9: cache-first launch behaviour already exists
`init()` pushes the persisted library and ACF install state to the frontend before any sync (`library.ts` init, comment at ~line 1060 "init() pushing the persisted list"). So B2 changes `refresh()` gating, not first-paint behaviour. `refresh()` has five exit paths with a tri-state `steamSyncStatus` contract (34.15 D-07): any new path (for example `reason: 'needs-refresh'`) must keep it to exactly one emit per exit and follow the existing vocabulary discipline.

## Architecture Patterns

### System Architecture Diagram

```
GameLib launch (sidecar boot)
   |
   +--> library.init(): push cached library + ACF state ----------------> renderer (first paint, no network)
   |
   +--> refresh() [runOnceWhenOnline, bounded]
   |        |
   |        +-- B1: keyring read (gated) -> MobileApp refresh token
   |        |        -> LoginSession(MobileApp).refreshAccessToken()  --HTTPS-->  IAuthenticationService (no CM)
   |        |        -> axios GET IPlayerService/GetOwnedGames?access_token  --HTTPS--> api.steampowered.com
   |        |        -> owned list --> merge ACF --> pushGameToLibrary
   |        +-- B2/no web token: keep cached list, emit steamSyncStatus idle/failed(reason)
   |        |
   |        +--> AnonymousSteam.getClient() --anon CM--> PICS bulk (platform capture) --> steamMetadataStore
   |
Game page open / Play / bridge launch-target / installdir lookup
   +--> AnonymousSteam.getProductInfo()  (shared anon client, idle close)   [no keyring, no user identity]

User clicks Install / Redeem key / Resume
   +--> SteamUser.acquireAuthenticated(reason)   --keyring--> authenticated CM logon (Friends signs out, accepted)
            -> buildDepotPlan (licenses, PICS w/ license tokens) -> depot keys -> manifests -> CDN chunks -> finalize ACF
            -> release() ; idle grace ; logOff()
```

### Recommended Project Structure
```
src/backend/storeManagers/steam/
├── user.ts                  # auth state, sign-in; acquireAuthenticated()/release (wraps today's ensureConnected)
├── anonymousClient.ts       # NEW: shared anonymous steam-user client, getProductInfo wrapper, idle close
├── webApiToken.ts           # NEW (B1 only): access-token mint + in-memory cache keyed by exp
├── ownedGamesWebApi.ts      # NEW (B1 only): axios GetOwnedGames + retry + redaction
└── __tests__/               # anonymousClient.test.ts, authSessionPolicy.test.ts (source gate), ownedGamesWebApi.test.ts
```

### Pattern 1: shared anonymous client with single in-flight connect
**What:** module-level `clientPromise`; `getAnonymousClient()` returns it or starts one bounded connect (use `withTimeout`, about 15 s); on connect failure `logOff()` the instance so steam-user's reconnect timers cannot keep the loop alive; idle timer `setTimeout(...).unref?.()` closes it.
**When:** every PICS read that is public.
**Example (verified shape, probe script):**
```typescript
// Source: live probe 2026-10-25 against steam-user 5.3.0
const client = new SteamUserLib({ enablePicsCache: false })
client.logOn({ anonymous: true })           // no refreshToken, no accountName
await once(client, 'loggedOn')              // ~1.6 s cold
const { apps } = await client.getProductInfo(ids, [], true) // inclTokens works anonymously
client.logOff()                             // process then drains and exits
```

### Pattern 2: refcounted authenticated session
```typescript
// Sketch: acquire in the install entry points, release in finally
const release = await SteamUser.acquireAuthenticated('user-install')
try { /* buildDepotPlan ... downloadDepotFiles ... finalize */ } finally { release() }
```
`release` is idempotent; the last release arms an `unref`'d idle timer that calls `client.logOff()` and nulls `this.client` (so `getLogonFailure` etc. stay coherent).

### Anti-Patterns to Avoid
- **Keeping `ensureConnected()` callable from launch paths.** Rows 1, 3, 4, 5 each did exactly this; one forgotten call re-creates the defect. Enforce with a source gate (Validation Architecture).
- **Falling back to an authenticated logon on a Web API error at launch.** That silently reintroduces the Friends flip. Fall back to the cached list.
- **Routing owned-game installs through the anonymous client** to "save the logon". Ownership and depot keys fail.
- **Re-proposing a logon-message tweak.** `chat_mode` 0, distinct `logonID`, `setPersona` Online/Invisible were each live-tested and still flip (debug session). Untested and speculative only: `clientOS`/web `ui_mode` logon variants. Do not spend phase time there.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anonymous CM connection, framing, reconnect | A raw CM websocket client | `steam-user` `logOn({anonymous:true})` | Verified working; CM discovery, heartbeats, PICS token round-trips already handled |
| Access-token minting | Custom `IAuthenticationService` protobuf calls | `LoginSession.refreshAccessToken()` (MobileApp) | Already implemented; `WebApiTransport` over HTTPS |
| JWT expiry check | Heavy JWT library | Decode the payload `exp` (base64url JSON) | Token only needs expiry; steam-session's `decodeJwt` is internal, a 5-line decode is enough |
| 429/transient retry | Ad-hoc loops | One small bounded retry helper (3-5 tries, backoff) following Playnite's settings | Steam returns spurious 429s (Playnite comment) |
| Session lifetime | Per-call logon/logoff | Refcount plus idle grace | Prescreen -> install -> shim resolve -> redist would reconnect 3-4 times |

## Runtime State Inventory

This is a behaviour change, not a rename. The state-bearing items that matter:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `steamLibraryStore 'games'` (cached owned list), `steamMetadataStore` (platform capture), `configStore userData/isLoggedIn/credentialsMissing`, keyring slot `steam-refresh-token` (Rust allow-list `src-tauri/src/main.rs:1759`) | Reuse as-is. B1 adds a second token (new slot or JSON blob): code edit plus migration for existing signed-in users (they have no second token) |
| Live service config | None; no external service stores GameLib config | None |
| OS-registered state | None | None |
| Secrets/env vars | Refresh token only. Under B1 a second refresh token. Access tokens must not be persisted or logged | Redaction rule (Security Domain) |
| Build artifacts | `sidecar.js` is bundled; per memory `tauri dev does not rebuild the sidecar` | After any backend change, restart dev and check `sidecar.js` mtime before live gates, or the UAT measures the old build |

## Common Pitfalls

### Pitfall 1: assuming `refreshAccessToken()` works on the stored token
**What goes wrong:** returns `AccessDenied` (15) or hangs; the library silently never syncs.
**Why:** Finding 1. **Avoid:** Wave-0 spike first; do not write Web API tasks until it passes. **Warning:** `EResult AccessDenied` from `generateAccessTokenForApp`.

### Pitfall 2: a leftover authenticated call defeating the goal
**What goes wrong:** one path (game page, Play, launch exe, canary) still logs on; Friends drops again.
**How to avoid:** source-gate test over `src/` (comment-stripped, like `fakeHomeIsolation.test.ts`) asserting `logOn(` with `refreshToken` appears only in `user.ts`, and `ensureConnected`/`acquireAuthenticated` is referenced only from a named allow-list (depot, redeem, install entry points). Plus a runtime log line per logon (`[Steam] CM logon mode=anonymous|authenticated reason=...`) for UAT.

### Pitfall 3: anonymous PICS returns `public_only` stubs
**What goes wrong:** installdir/launch exe/oslist missing for gated apps; Play on a bridge title can no longer resolve the exe.
**How to avoid:** at install time (authenticated session is open) persist what is needed; `resolveBridgeLaunchExe` on Play should prefer the already-placed shim/ACF `installdir` and only ask PICS to fill gaps. Keep the existing `undefined` handling. Test with a `public_only` fixture.

### Pitfall 4: access_token leaks into `gamelib.log`
**What goes wrong:** axios errors carry `config.url` (the query string holds `access_token`) and the repo logs error objects (`logError(['...', err])`).
**How to avoid:** catch, log only `status`/`code`/message, never the error object or URL. Unit-test that a thrown axios error is not logged with the token. The existing code already treats the raw redeem key and tokens as never-logged; same discipline.

### Pitfall 5: sidecar exit contract
**What goes wrong:** an anonymous client, its idle timer, or steam-user reconnect timers hold the loop open past stdin EOF; `smoke:sidecar` only catches total failure to exit, not slow exit.
**How to avoid:** `unref?.()` every timer (spelling `.unref?.()` because jest fake timers); `logOff()` the client on connect failure/timeout; axios gets `timeout`; nothing issues unbounded work at boot; `logout()` closes anonymous and authenticated clients. The probe exited cleanly after `logOff()`, so the library itself is fine. [CITED: gamelib-conventions, sidecar exit contract]

### Pitfall 6: boot-time network is in-flight work
The anonymous connect plus bulk PICS plus Web API call all run from `refresh()` at boot. Each must be bounded (`STEAM_PICS_BULK_TIMEOUT_MS`, a connect timeout, axios `timeout`) because in-flight requests are referenced handles that `unref()` cannot fix.

### Pitfall 7: `LastOwner` and other reads of `client.steamID` after the session closes
`depot.ts:3768` reads the live client. With a scoped session, finalize can run after release. Read the persisted `userData.steamId`/JWT `sub` instead. (If it silently becomes `"0"` the ACF manifest `LastOwner` is wrong.)

### Pitfall 8: `credentialsMissing` verdicts and the epoch fence
`ensureConnected` reports `healthy`/`expired` via `applySignInVerdict`. If launch no longer connects, the "stored token is dead" signal only appears at the next install/Refresh. Under B1 a Web API token mint failing with `Expired`/`AccessDenied` can feed the same `reportLogonVerdict` path (keep it fenced and write-if-changed).

## Code Examples

### Source gate test (shape, modelled on `src/backend/__tests__/fakeHomeIsolation.test.ts`)
```typescript
// Walk src/, strip comments (testUtils/stripSourceComments), assert:
//  - /logOn\(\s*\{[^}]*refreshToken/ appears only in storeManagers/steam/user.ts
//  - /SteamUser\.(ensureConnected|acquireAuthenticated)\(/ appears only in ALLOWLIST files
//  - anti-vacuity floor: user.ts and depot.ts must be among the scanned files
```

### Logon-mode unit test (spy)
```typescript
// user.test.ts already mocks 'steam-user' with MockSteamUserLib (logOn: jest.fn()).
// Launch scenario: init() + refresh() + getExtraInfo() + resolveBridgeLaunchExe(appId)
// expect(logOnMock).toHaveBeenCalledTimes(1)  // the anonymous one
// expect(logOnMock).toHaveBeenCalledWith({ anonymous: true })
// expect(logOnMock).not.toHaveBeenCalledWith(expect.objectContaining({ refreshToken: expect.anything() }))
// Install scenario: acquireAuthenticated -> exactly one refreshToken logOn; release -> logOff after grace (fake timers)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SteamClient refresh token -> `refreshAccessToken` / `getWebCookies` over plain transport | Works only over an authenticated CM session; MobileApp/WebBrowser tokens needed for no-CM minting | 2025-04-30 (Valve backend change) | The no-CM Web API path needs a second credential |
| `getOwnedApps()` after `ownershipCached` | `getUserOwnedApps(steamID, opts)` (what the code already uses) | earlier phases | `STEAM-STACK.md` is out of date on the method name |

**Deprecated/outdated:** the `STEAM-STACK.md` rows "Steam Web API alone: DO NOT USE as primary" and "steam-user fetch owned game list" (superseded by this phase for launch).

## STEAM-STACK.md update (required by the phase)
Edit `.planning/research/STEAM-STACK.md` (and the short "Technology Stack (Steam)" paragraph in `CLAUDE.md`, which says steam-user "reaches the CM network and calls `getOwnedApps()`"):
- Add a dated "Reopened by Phase 54" note: any authenticated steam-user CM logon signs the Mac Steam Friends list out (debug `friends-signout-steam-user`, 2026-10-25; `chat_mode`, `logonID`, `setPersona` variants ruled out), so steam-user is used **anonymously** for public PICS and **authenticated only for installs and key redeem**.
- Amend the Library Data row and the "Steam Web API alone" rejected row: the Web API is now the launch-time list source **with a user access token** (not an API key), conditional on the Finding 1 outcome, with the SteamClient-token limitation recorded.
- Record Finding 1 as the reason a second credential (or cache-first) is needed. `steamworks.js`, `greenworks`, `electron-steam-openid`, partner OAuth stay rejected.
- The `prettier` rule: `.planning` and `.claude` are prettier-ignored; `CLAUDE.md` is not. Run `npx prettier --file-info` first, then `--check` only on `CLAUDE.md` if edited.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | An anonymous CM session does not affect the user's Mac Steam Friends | Finding 4 | If it does, the whole Track A premise fails. UAT item 1 resolves it |
| A2 | MobileApp refresh token + `refreshAccessToken` + `GetOwnedGames?access_token` returns the same set as `getUserOwnedApps` for a private profile | Findings 1, 3 | B1 not viable; fall back to B2. Wave-0 spike resolves it |
| A3 | Access tokens live about 1 day | Finding 1 | Only affects cache TTL; code reads `exp` instead |
| A4 | Public profile XML exposes the nickname for private profiles | Finding 8 | Use `session.accountName` as the display name |
| A5 | A second `LoginSession` can be approved with one extra QR scan / guard code (no repeat restriction) | Finding 1 | Sign-in UX cost higher than estimated |
| A6 | `skip_unvetted_apps` defaults to true on the Web API as it does in the proto | Finding 3 | Pass it explicitly (`true`) to keep parity either way |
| A7 | Friends may or may not recover by itself after `logOff()` | Finding 5 | Moot (2026-10-27): the debug session ruled out recovery short of a restart, and the go-offline wrap (Finding 10) prevents the flip |

## Open Questions (RESOLVED)

1. **How does the library list get a token? (user decision)**
   - Known: the SteamClient token cannot mint one without a CM logon (documented, 2025-04-30, still open in 2026).
   - Unclear: whether the user accepts a second sign-in approval (B1), or prefers cache-first with auth only on explicit Refresh (B2).
   - Recommendation: ask the user. If B1, the phase is no longer backend-only (sign-in UI gains a step) and Rust keyring work is possible. If no answer is available, plan B2 as the guaranteed-deliverable base and add B1 behind the Wave-0 spike result.
   - **RESOLVED (2026-10-27):** Track B (Web API) is dropped per ROADMAP and the 2026-10-27 addendum. The design is cache-first at launch with an authenticated fetch only on explicit Refresh, sign-in and installs, wrapped in the go-offline toggle (plans 54-03, 54-04).
2. **Does the phase scope include the sign-in-time persona logon (Finding 8)?** Recommend yes; small, same defect.
   - **RESOLVED (2026-10-27):** yes. Sign-in still logs on (ROADMAP allows it) but only through the wrapped, refcounted lease; the steamId comes from `LoginSession.steamID` (plan 54-03).
3. **Does startup auto-refresh need to exist at all under B2?** If launch never syncs, a stale list persists until the user presses Refresh. Consider a "last synced N days ago" note (UI, out of backend-only scope).
   - **RESOLVED (2026-10-27):** no automatic sync logon. Launch shows the cached library and reconciles local install state only; the owned list is fetched on explicit Refresh or sign-in (plan 54-04).
4. **Does Friends recover after `logOff()`?** **RESOLVED** 2026-10-27: no (debug session); prevented instead by the go-offline wrap (Finding 10).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | sidecar tests, probes | yes | v22.23.4 | — |
| Network to Steam CM | anonymous probes, live gate | yes (probed 2026-10-25) | — | Offline: existing cached-library fallback |
| jest | unit tests | yes | ^29.7.0 | — |
| Operator's Mac Steam + real account | Wave-0 spike, UAT | operator only | — | Cannot be automated; use `checkpoint:human-verify` |
| `ctx7`/Context7 | docs | not used | — | Official docs and `node_modules` source used instead |

**Missing, no fallback:** the real-account live gate (by design, operator-run).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest ^29.7.0 + ts-jest, projects `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta` (`jest.config.js`) |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js` |
| Quick run command | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts src/backend/storeManagers/steam/__tests__/library.test.ts` |
| Full suite command | `pnpm test:ci` (plus `pnpm codecheck`, `pnpm lint`, `pnpm smoke:sidecar`, `pnpm planning-gates`) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P54-SC1 | No `refreshToken` logon from launch paths | unit (spy on mocked steam-user `logOn`) | `npx jest .../user.test.ts -t "launch"` | extend `user.test.ts` |
| P54-SC1 | `logOn(refreshToken)` / `ensureConnected` callable only from allow-list | source gate | `npx jest src/backend/__tests__/steamAuthSessionPolicy.test.ts` | Wave 0 |
| P54-SC2 | Owned-list mapping parity, empty `games`, 429 retry, redaction (B1) | unit | `npx jest .../ownedGamesWebApi.test.ts` | Wave 0 (B1) |
| P54-SC2 | Cached list shown, one `steamSyncStatus` emit per exit path | unit | `npx jest .../library.test.ts` | extend |
| P54-SC3 | Anonymous client: single in-flight connect, timeout -> `logOff`, idle close, `public_only` handling | unit | `npx jest .../anonymousClient.test.ts` | Wave 0 |
| P54-SC3 | `platformCapture`/`installLocation`/`launchTarget` use the anonymous client | unit | existing `platformCapture.test.ts`, `installLocation.test.ts` | extend |
| P54-SC4 | Refcount: concurrent acquires share one logon; last release -> `logOff` after grace; abort releases | unit (fake timers) | `npx jest .../authSessionLifecycle.test.ts` | Wave 0 |
| P54-SC4 | `LastOwner` uses persisted SteamID, not live client | unit | `npx jest .../depot.finalize.test.ts` | extend |
| P54-SC7 | Sidecar exits on stdin EOF | smoke | `pnpm smoke:sidecar` | exists |
| P54-SC5 | Mac Friends stays signed in | manual UAT | operator | Wave 0 (UAT doc) |

Anti-vacuity floors for the source gate follow `fakeHomeIsolation.test.ts` (`MIN_FILES_SCANNED`, helper file must be among scanned files). Use `stripSourceComments`.

### Manual UAT (operator, Mac, real account)
Rebuild the sidecar first (memory: `tauri dev` does not rebuild it; check `sidecar.js` mtime). Follow `live-gate-contract-authoring.md` (append-and-archive logs, capture `gamelib.log` before it rotates). Use `### N.` headings at column 0, inline `expected:`, `result: pending`.
1. Mac Steam running, Friends signed in and status changeable. Launch GameLib signed in. Wait 90 s. expected: Friends still signed in and status changeable; `gamelib.log` shows no `mode=authenticated` logon and no `SteamUser.loggedOn` for the account.
2. Library renders (cached or fresh) and a Play on an installed title works with Friends still signed in.
3. Open a game page and trigger a platform capture. expected: Friends unchanged; log shows `mode=anonymous`.
4. With Mac Steam online, start an install, then separately press Refresh. expected: Mac Steam `connection_log.txt` shows a user-initiated `LogOff()` before each authenticated logon and a completed logon after it; Friends stays signed in with status changeable; after the install and the grace window `gamelib.log` shows `logOff`. Also: with Mac Steam set offline by hand, Refresh logs on and leaves Steam offline.
5. (B1 only) sign-in with the second approval; library count equals the previous `getUserOwnedApps` count.

### Wave 0 Gaps
- [ ] `src/backend/__tests__/steamAuthSessionPolicy.test.ts` — source gate (P54-SC1)
- [ ] `src/backend/storeManagers/steam/__tests__/anonymousClient.test.ts` (P54-SC3)
- [ ] `src/backend/storeManagers/steam/__tests__/authSessionLifecycle.test.ts` (P54-SC4)
- [ ] `ownedGamesWebApi.test.ts` and `webApiToken.test.ts` (B1 only)
- [ ] `src/backend/storeManagers/steam/__tests__/macSteamOfflineWrap.test.ts`: already offline (no toggle), LogOff seen, LogOff not seen (guided fallback, no logon), logon throws (`goonline` still fires), non-macOS passthrough, `autoRelogin: false` on the constructed client (ROADMAP success criterion 6)
- [ ] `54-UAT.md` with the five items above
- [ ] **Operator spike `checkpoint:human-verify`:** (a) on the stored SteamClient token run `LoginSession(SteamClient).refreshAccessToken()` and record the EResult (expects AccessDenied); (b) sign in once with a `MobileApp` `LoginSession`, `refreshAccessToken()`, call `GetOwnedGames` with `access_token`, compare `game_count` to the current sync's count. Do this with a throwaway script under a fake HOME (`createFakeHomeProfile()` if it spawns anything), with token values redacted from any capture.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | steam-session; second refresh token (B1) handled exactly like the first |
| V3 Session Management | yes | Short-lived access token in memory only; refresh token only via the `TokenStore` seam |
| V4 Access Control | yes | Authenticated session only for deliberate user actions (install, redeem) |
| V5 Input Validation | yes | Keep `NUMERIC_APP_ID` guards; validate Web API JSON shape before use |
| V6 Cryptography | no | No new crypto; never hand-roll JWT validation (decode `exp` only, do not trust claims for auth) |
| V7 Logging | yes | Never log access tokens, refresh tokens, or URLs containing `access_token` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Access token in query string leaked via logged axios error | Information disclosure | Catch and log status/code only; redaction test |
| Access token persisted to disk or `configStore` | Information disclosure | Memory-only cache; persist only refresh tokens, via the keyring seam |
| Second token stored in plaintext `configStore` on the sidecar | Information disclosure | Keyring slot or the existing slot; never `configStore` (tokenStore.ts D-06/D-11 note) |
| Orphan authenticated session after crash holding the account | DoS / persistence | Idle-close timer `unref`'d; `logout()` closes both clients; Rust `shutdown_child` is the backstop |
| Real-HOME scratch run leaks session data | Information disclosure | `createFakeHomeProfile()` for any spawned probe; dispose and shred captures |

## Sources

### Primary (HIGH confidence)
- Installed source (read and run): `node_modules/steam-session/dist/LoginSession.js` (JSDoc and transport selection), `AuthenticationClient.js:205` (`generateAccessTokenForApp`), `node_modules/steam-user/components/09-logon.js` (logOn details, `aud` check, anonymous branch), `apps.js` (`getProductInfo`, token round), `friends.js:835` (`getUserOwnedApps`), `protobufs/steammessages_player.steamclient.proto:47-81`
- Live anonymous steam-user probe, 2026-10-25 (scratch under the session scratchpad, fake HOME)
- Repo code: `user.ts`, `library.ts`, `depot.ts`, `platformCapture.ts`, `installLocation.ts`, `bridge/launchTarget.ts`, `games.ts`, `authTrigger.ts`, `tokenStore.ts`
- `.planning/debug/friends-signout-steam-user.md`, `.planning/todos/pending/2026-10-24-friends-sign-out-steam-user-logon.md`, `.planning/research/STEAM-STACK.md`
- `.claude/skills/gamelib-conventions`, `.claude/skills/spike-findings-gamelib`

### Secondary (MEDIUM confidence)
- https://dev.doctormckay.com/topic/5687-refreshaccesstoken-not-working-on-eauthtokenplatformtypesteamclient/ — maintainer on the 2025-04-30 backend change
- https://github.com/DoctorMcKay/node-steam-session/issues/56 — 1.9.4 still failing, May-July 2026
- https://github.com/DoctorMcKay/node-steam-session (README) — token audiences, `access_token` usage
- https://github.com/JosefNemec/PlayniteExtensions (SteamLibrary `PlayerService.cs`, `SteamStoreService.cs`, `SteamServiceAggregator.cs`) — request shape, web token source

### Tertiary (LOW confidence)
- Access-token lifetime (about 1 day) from a single forum report; profile-XML nickname behaviour for private profiles

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; versions read from the repo
- Architecture (anonymous PICS, session lifecycle): HIGH — probed live and matched against code
- Web API token path: LOW-MEDIUM — documented blocker plus unverified workaround (needs the operator spike)
- Pitfalls: MEDIUM-HIGH — code-derived

**Research date:** 2026-10-25
**Valid until:** 7 days for the token-minting question (Valve backend behaviour changes without notice); 30 days for the rest
