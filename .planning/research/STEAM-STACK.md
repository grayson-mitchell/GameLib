# Technology Stack: Steam Store Manager

**Project:** GameLib — Steam as a first-class platform
**Status:** Decision record. Moved out of `CLAUDE.md` on 2026-10-04 (quick task: CLAUDE.md
context trim) because it is a frozen research artifact, not a standing instruction, and was
costing ~2,765 tokens on every turn of every session.

> Not to be confused with `STACK.md` in this directory, which is the **Humble Bundle**
> integration stack. This file is the Steam one.

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

## Technology Stack

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
