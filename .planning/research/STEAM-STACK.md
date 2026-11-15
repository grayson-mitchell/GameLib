# Technology Stack: Steam Store Manager

**Project:** GameLib — Steam as a first-class platform
**Status:** Decision record. Moved out of `CLAUDE.md` on 2026-10-04 (quick task: CLAUDE.md
context trim) because it is a frozen research artifact, not a standing instruction, and was
costing ~2,765 tokens on every turn of every session.

> Not to be confused with `STACK.md` in this directory, which is the **Humble Bundle**
> integration stack. This file is the Steam one.

## Amended by Phase 79 (2026-11-15): the freeze is lifted

The stack below was frozen on steam-session and steam-user. Phase 79 replaced both with Rust. The
sections further down are the historical record up to Phase 78 and are kept for their reasoning;
this section is current. steam-user, steam-session, `@types/steam-user`, `lzma` and `zstddec` are
removed from `package.json` (79-42), and `steamCmPortComplete.test.ts` pins the deletion.

### Current stack

| Technology | Version / pin | Purpose | Why |
| --- | --- | --- | --- |
| steam-vent (crate, via the in-repo `gamelib-steamcm` + `gamelib-steamcm-cli`) | codeberg git rev `767481ad4eb91dd73f1c70bea6b15f8123a0a040` (resolves as 0.6.0 in the lock; 79-01) | CM session: anonymous and signed-in logon, owned apps, PICS, depot keys, request codes, key redeem | Won the 071 head-to-head. The pin is a git rev, not a crates.io release, because the fixes the spikes needed landed after 0.5.0 (spike 010 had rejected 0.5.0). Move to a crates.io release only once 0.6.0 is published with the same call shapes. `gamelib-steamcm` keeps the session in one actor behind a backend trait, so the crate can be swapped without touching callers. |
| Steam Web API `IAuthenticationService` (reqwest, in `gamelib-steamcm`) | n/a | Sign-in: QR, credentials, Steam Guard (device, email, app approval); yields a refresh token | Platform type SteamClient so the refresh token logs on to the CM. The password is encrypted with RSA PKCS#1 v1.5 as Steam requires; the `rsa` 0.9 crate is affected by RUSTSEC-2023-0071 (Marvin timing attack), which is ignored in `deny.toml` because the key is Steam's public key and we only ever encrypt, so there is no private-key operation to time. |
| reqwest | workspace | Steam Refresh (owned-apps and license assembly) and store enrichment (`appdetails`, artwork) | Replaces axios for Steam. Same public endpoints as before. |
| Mac Steam owned-apps path (bridge helper, `GetSubscribedApps`, 79-36) | n/a | Read the owned set from the running Mac Steam with no CM logon | Spike 084. Ships OFF by default: `GAMELIB_STEAM_MAC_PATH=on` opts in, because its helper makes Friends show "playing Spacewar" (todo `2026-11-15-mac-steam-path-shows-playing-spacewar`). macOS Refresh therefore uses the Rust CM path, which UAT-B item 13 verified keeps Friends signed in. |
| go-offline wrap | retired | n/a | D-09 retest verdict PASS: a Rust logon no longer signs Friends out, so no `steam://open/gooffline` wrap is needed. Only the owed-record restore is ported (`RestoreOnlyWrap` on macOS) so a record left by an older build is still paid back. |
| `gamelib-steamfiles` | in-repo (Phase 75) | Local Steam files | Unchanged. |
| `shell.openExternal("steam://rungameid/{appId}")` | built-in | Launch | Unchanged. |

rustls: steam-vent pulls rustls with the aws-lc provider while reqwest and the shell use ring, so
the ring provider is installed explicitly in `main()` before any TLS use (spike 082). Without
that, a build with steam-vent panics at the first TLS use with no provider configured.

### Why the freeze was lifted

Spikes 071-085 answered every condition the freeze rested on:

- **071a (steamroom):** VALIDATED for every item, but the license list worked only through a recording-transport workaround, and it has no long-lived client; not chosen.
- **071b (steam-client-lib):** VALIDATED for capability, but logon with GameLib's refresh token needs the account name, which GameLib does not store; not chosen.
- **071c (steam-vent):** WINNER with caveats, the caveats are the pin and the TLS provider note above.
- **072:** QR and password with app approval sign in from Rust; typed Guard codes and the QR token's own logon were untested then (the verdict was PARTIAL).
- **073:** owned-apps result from Rust matches steam-user's `getUserOwnedApps()`.
- **074:** a wrapped Rust logon keeps Friends; unwrapped controls did not flip either, for Rust or steam-user, which is what made the D-09 retest and the retirement of the wrap possible.
- **077:** a steam-user and a steam-vent session on one account collide (last logon wins, LogonSessionReplaced 34); a non-zero logonID keeps them apart, so the migration could run both.
- **080:** the Rust stack builds and runs on macOS arm64, Windows x64 (MSVC and GNU) and Linux x64; no blocking native dependency.
- **081:** three concurrent sessions on one account coexist.
- **082:** two rustls providers in one process work once the default is installed explicitly.
- **084:** the running Mac Steam can answer "what do I own" through the bridge helper.
- **085:** a steady steam-vent session held 2 h 59 m, but it does not recover from a dead socket by itself, so `gamelib-steamcm` owns the reconnect (rebuild the `Connection` with the stored refresh token, 11 s after a 365 s sleep).

The re-proposal rule still stands for the alternatives below: read the reason before reopening one.

### Historical record

Everything below this heading up to the Phase 75 note describes the stack as frozen before
Phase 79. Rows naming steam-user or steam-session are retired and replaced by the table above.

## Reopened by Phase 54 (2026-10-27)

Any authenticated steam-user CM logon for the account signs the Mac Steam Friends list out, or
locks it Offline until Mac Steam restarts (debug `friends-signout-steam-user`; the `chat_mode`,
`logonID` and `setPersona` variants were ruled out). So steam-user is now used **anonymously**
(`logOn({ anonymous: true })`) for public PICS reads (platform capture, install location, bridge
launch target); `public_only` apps degrade to cached/fallback data. It is authenticated only
through one gated, refcounted entry point (`SteamUser.acquireAuthenticated`) for an explicit
Refresh, sign-in, key redeem and depot installs. On macOS every authenticated logon runs inside
the go-offline wrap (`steam://open/gooffline`, wait for the user-initiated LogOff in
`connection_log.txt`, log on, `steam://open/goonline`; spikes 046a-c) with `autoRelogin: false`,
and falls back to a guided Go Offline dialog when the LogOff is not seen. Launch shows the cached
library and opens no authenticated session. The rows below are amended accordingly.

## Technology Stack (historical, pre-Phase 79)

## Decision Summary

## Recommended Stack

### Authentication

| Technology        | Version | Purpose                               | Why                                                                                                                                                                                                |
| ----------------- | ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| steam-session     | 1.9.4   | Obtain Steam refresh token            | Handles all auth flows: credentials+SteamGuard, QR-code via mobile app, TOTP. Pure JS (no native modules). Last published July 2025 by DoctorMcKay. steam-user already depends on it transitively. |
| steam-user        | 5.3.0   | Connect to Steam CM network           | Core library protocol client. CM sessions: anonymous for public PICS reads, authenticated (refresh token) only on demand (Phase 54). Exposes `ownershipCached` + `getUserOwnedApps()`. Pure JS (all deps are JS or WASM — no node-gyp). Last published December 2025.       |
| electron-store    | 8.2.0   | Persist refresh token                 | Already in project. Follow existing `configStore` pattern from gog/user.ts. Store token encrypted via Electron `safeStorage`.                                                                      |
| @types/steam-user | 5.1.1   | TypeScript definitions for steam-user | DefinitelyTyped, last published December 2025. Covers steam-user v5.x API.                                                                                                                         |

### Library Data

| Technology      | Version | Purpose                        | Why                                                                                                                                                                                                     |
| --------------- | ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| steam-user      | 5.3.0   | Fetch owned game list          | `getUserOwnedApps(steamID, { includePlayedFreeGames: true })`, fetched only on an explicit Refresh or sign-in (Phase 54). Works for private profiles because we are authenticated as the user.                                         |
| @node-steam/vdf | 2.2.0   | Read local Steam installation  | Already in project. Parse `libraryfolders.vdf` to find all Steam library paths. Parse `appmanifest_{appId}.acf` files to determine install status, install path, and install size. No network required. |
| axios           | 1.13.5  | Steam store metadata + artwork | Already in project. `https://store.steampowered.com/api/appdetails?appids={id}` (public, no auth) for game description, tags, genres. CDN artwork (`header.jpg`, `capsule_616x353.jpg`) is public.      |

### Game Launching

| Technology                      | Version                    | Purpose            | Why                                                                                                                                                                                         |
| ------------------------------- | -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron `shell.openExternal()` | built-in (Electron 41.1.1) | Launch Steam games | `steam://rungameid/{appId}` works on Windows, macOS, Linux. Honors per-game launch options set in Steam. Requires Steam client installed — a valid assumption for this launcher's audience. |

### Supporting Libraries (no new installs required)

| Library               | Already Present | Role in Steam Manager                                       |
| --------------------- | --------------- | ----------------------------------------------------------- |
| @node-steam/vdf       | Yes (^2.2.0)    | Parse Steam VDF config files (library paths, app manifests) |
| electron-store        | Yes (^8.2.0)    | Persist refresh token, cache library data                   |
| axios                 | Yes (^1.13.5)   | Game metadata from Steam store API, artwork URLs            |
| steam-shortcut-editor | Yes (^3.1.3)    | Exists for "add to Steam" — not used in store manager       |

## Installation

# Runtime dependency

# Type definitions (devDependency)

## Alternatives Rejected

| Option                                                         | Verdict               | Reason                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| steamworks.js v0.4.0                                           | DO NOT USE            | Requires `steamworks.init(AppId)` — your app must be a game published on Steam with a Valve-assigned AppId. This is an SDK for game developers, not for launchers. Also a native Rust/NAPI module requiring Electron rebuild. Last published August 2024.                                                       |
| greenworks v0.1.0                                              | DO NOT USE            | Abandoned. Last npm publish June 2022. Requires you to download the Steamworks SDK binary separately and place it in the project. Same AppId restriction as steamworks.js. This repo is archived.                                                                                                               |
| electron-steam-openid v1.2.0                                   | DO NOT USE            | Last published June 2022, unmaintained. Steam OpenID only yields a SteamID64 — it does not give you any credentials usable for library access. You'd still need a Steam Web API key, and that only works for public profiles.                                                                                   |
| Steam OAuth (partner.steamgames.com/doc/webapi_overview/oauth) | DO NOT USE            | Requires contacting Valve to obtain a Client ID. Scoped to specific AppIds. Intended for games/apps published through Valve, not third-party launchers.                                                                                                                                                         |
| Steam Web API alone (IPlayerService/GetOwnedGames)             | DO NOT USE as primary | Fails silently for private Steam profiles unless the API key is linked to the same SteamID being queried. Would require every user to register an API key at steamcommunity.com/dev/apikey, adding friction. Valid as a fallback for users who prefer it (Playnite model), but steam-user is better as primary. Phase 54 re-checked it as a launch-time source using a user access token instead of an API key and it stays rejected: since 2025-04-30 a SteamClient refresh token cannot mint an access token without an authenticated CM session (steam-session 1.9.4 JSDoc; node-steam-session issue #56), so it would need a second MobileApp credential. |
| steamroom (crate) | NOT CHOSEN | Spike 071a: the license list needed a recording-transport workaround and it has no long-lived client (pump, heartbeat, reconnect); steam-vent won the 071c head-to-head. |
| steam-client-lib / SteamHelper-rs (crate `steam_client` 0.2.1) | NOT CHOSEN | Spike 071b: logon with GameLib's existing refresh token needs the account name, which GameLib does not store; steam-vent won the 071c head-to-head. |
| Browser-based Steam login (follow GOG/Epic pattern)            | SKIP                  | Steam's OpenID only returns SteamID64, not a session token usable for library API calls. Heroic's GOG/Epic patterns use OAuth tokens from the browser; Steam OpenID does not provide this. steam-session's QR/credential flow is cleaner and more powerful.                                                     |

## Architecture Fit

## Confidence Assessment

| Area                             | Confidence | Basis                                                                                                                                                       |
| -------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| steam-user as core library       | HIGH       | npm-verified v5.3.0 (Dec 2025), active maintenance (DoctorMcKay), Node >=14, no native modules confirmed by reviewing full dep tree                         |
| steam-session for auth           | HIGH       | npm-verified v1.9.4 (July 2025), QR/credentials/SteamGuard flows confirmed in GitHub README                                                                 |
| `getUserOwnedApps()` API             | MEDIUM     | Method exists and is documented, but PICS cache population time for large libraries is a known open issue (#144 on GitHub) — needs timeout/caching strategy |
| steam:// protocol for launching  | HIGH       | Valve-documented browser protocol, widely used by existing launchers, cross-platform                                                                        |
| @node-steam/vdf for local data   | HIGH       | Already in project and working for existing features                                                                                                        |
| steamworks.js rejection          | HIGH       | Verified from their own README: `steamworks.init(480)` takes an AppId; not usable without Steam store listing                                               |
| Steam Web API privacy limitation | HIGH       | Confirmed by multiple sources including Playnite docs and Steam community discussions                                                                       |

## Sources

- npm registry: [steam-user](https://www.npmjs.com/package/steam-user), [steam-session](https://www.npmjs.com/package/steam-session), [steamworks.js](https://www.npmjs.com/package/steamworks.js), [@types/steam-user](https://www.npmjs.com/package/@types/steam-user)
- [node-steam-user GitHub README](https://github.com/DoctorMcKay/node-steam-user)
- [node-steam-session GitHub README](https://github.com/DoctorMcKay/node-steam-session)
- [steamworks.js GitHub README](https://github.com/ceifa/steamworks.js) — confirmed AppId requirement
- [Steam Web API privacy documentation](https://developer.valvesoftware.com/wiki/Steam_Web_API)
- [Steam OAuth documentation](https://partner.steamgames.com/doc/webapi_overview/oauth) — confirmed partner-only
- [IPlayerService/GetOwnedGames](https://partner.steamgames.com/doc/webapi/iplayerservice)
- [Playnite Steam integration source](https://github.com/JosefNemec/Playnite) — reference for two-path approach (browser login vs API key)
- [Steam browser protocol (Valve DevWiki)](https://developer.valvesoftware.com/wiki/Steam_browser_protocol)
- [node-steam-user issue #144: getOwnedApps performance](https://github.com/DoctorMcKay/node-steam-user/issues/144)

---

**2026-11-14 note:** Phase 75 replaced `@node-steam/vdf` (and `steam-shortcut-editor`, which this record lists as used only for add-to-Steam) with the in-repo `gamelib-steamfiles` crate. Both npm packages are removed; the rows above are the historical decision record.
