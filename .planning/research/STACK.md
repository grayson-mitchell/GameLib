# Technology Stack: Steam Integration

**Project:** GamerLib — Steam store manager for Heroic fork
**Researched:** 2026-06-26
**Overall confidence:** HIGH (all versions npm-verified; architecture confirmed against live package metadata and DoctorMcKay's GitHub)

---

## Decision Summary

The right stack is **steam-session + steam-user** for authentication and library access — not the
Steamworks SDK wrapper ecosystem. The distinction is critical: steamworks.js and greenworks are
tools for game developers who publish on Steam (they require an AppId). GamerLib is a launcher
acting as a user agent — it needs the Steam *client* protocol, not the game *developer* SDK.

steam-user communicates with Steam's CM (Connection Manager) servers exactly as the Steam client
does. It authenticates as the user, respects no profile-privacy restrictions, and returns the
full owned-games list. This is the only viable path to a complete library for users with private
Steam profiles.

---

## Recommended Stack

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| steam-session | 1.9.4 | Obtain Steam refresh token | Handles all auth flows: credentials+SteamGuard, QR-code via mobile app, TOTP. Pure JS (no native modules). Last published July 2025 by DoctorMcKay. steam-user already depends on it transitively. |
| steam-user | 5.3.0 | Connect to Steam CM network | Core library protocol client. Authenticates with refresh token, exposes `ownershipCached` + `getOwnedApps()`. Pure JS (all deps are JS or WASM — no node-gyp). Last published December 2025. |
| electron-store | 8.2.0 | Persist refresh token | Already in project. Follow existing `configStore` pattern from gog/user.ts. Store token encrypted via Electron `safeStorage`. |
| @types/steam-user | 5.1.1 | TypeScript definitions for steam-user | DefinitelyTyped, last published December 2025. Covers steam-user v5.x API. |

**Auth flow that maps to the existing Heroic `SteamUser` class pattern:**

```
User enters credentials in React UI (or clicks "QR Code" button)
  → IPC call to main process SteamUser.login()
  → steam-session.startWithCredentials() or .startWithQR()
  → If SteamGuard needed: emit event to renderer, show code-entry form
  → Steam Guard code submitted → session.submitSteamGuardCode()
  → On success: save refreshToken to electron-store via safeStorage
  → steam-user.logOn({ refreshToken }) persists authenticated session
```

QR-code flow is preferable UX: steam-session emits a `qrCodeData` URL which renders as an
`<img>` in React — no BrowserWindow, no Electron webview, no browser session management.
This is cleaner than the GOG/Epic patterns (which open BrowserWindows and capture redirect codes).

**No BrowserWindow is needed for Steam auth.** This diverges intentionally from the GOG/Epic
pattern — those stores use browser-based OAuth because they provide no programmatic auth.
Steam exposes a client protocol directly.

---

### Library Data

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| steam-user | 5.3.0 | Fetch owned game list | After `ownershipCached` event fires, call `getOwnedApps()` → returns `number[]` of AppIDs. Works for private profiles because we are authenticated as the user. |
| @node-steam/vdf | 2.2.0 | Read local Steam installation | Already in project. Parse `libraryfolders.vdf` to find all Steam library paths. Parse `appmanifest_{appId}.acf` files to determine install status, install path, and install size. No network required. |
| axios | 1.13.5 | Steam store metadata + artwork | Already in project. `https://store.steampowered.com/api/appdetails?appids={id}` (public, no auth) for game description, tags, genres. CDN artwork (`header.jpg`, `capsule_616x353.jpg`) is public. |

**Library population strategy:**

```
On login → steam-user ownershipCached event:
  → getOwnedApps() → [appId, appId, ...]           // full owned list (network)
  → @node-steam/vdf scan libraryfolders.vdf         // installed status (local disk)
  → axios store.steampowered.com/api/appdetails     // metadata (public REST, batched)
  → Steam CDN for artwork                           // public URLs, no auth
```

`getOwnedApps()` requires `enablePicsCache: true` in the SteamUser constructor. The PICS cache
loads asynchronously after `loggedOn` — wait for `ownershipCached` before calling it. Known
behavior: for large libraries (1000+ games), PICS population takes 10–30 seconds on first
connection. Cache it in electron-store after first load.

---

### Game Launching

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Electron `shell.openExternal()` | built-in (Electron 41.1.1) | Launch Steam games | `steam://rungameid/{appId}` works on Windows, macOS, Linux. Honors per-game launch options set in Steam. Requires Steam client installed — a valid assumption for this launcher's audience. |

**Use `steam://rungameid/{appId}`, not `steam://run/{appId}`.**

`steam://run/{appId}` ignores the user's configured launch options in Steam. `steam://rungameid`
uses the same launch codepath as clicking "Play" in the Steam client.

For games that need launch options passed programmatically (future use), the command-line
approach is `steam -applaunch {appId}` on Windows/Linux. macOS has no equivalent; the
`steam://` protocol handler is the only cross-platform approach.

---

### Supporting Libraries (no new installs required)

| Library | Already Present | Role in Steam Manager |
|---------|-----------------|----------------------|
| @node-steam/vdf | Yes (^2.2.0) | Parse Steam VDF config files (library paths, app manifests) |
| electron-store | Yes (^8.2.0) | Persist refresh token, cache library data |
| axios | Yes (^1.13.5) | Game metadata from Steam store API, artwork URLs |
| steam-shortcut-editor | Yes (^3.1.3) | Exists for "add to Steam" — not used in store manager |

Only **two new packages** are needed: `steam-user` and `@types/steam-user` (steam-session is a
transitive dep of steam-user so it installs automatically).

---

## Installation

```bash
# Runtime dependency
npm install steam-user

# Type definitions (devDependency)
npm install -D @types/steam-user
```

steam-session is pulled in automatically as a dependency of steam-user (v1.8.0+). No native
modules are introduced — the entire steam-user/steam-session dependency tree is pure
JavaScript and WebAssembly (zstddec uses WASM for Zstandard decompression; no node-gyp).

---

## Alternatives Rejected

| Option | Verdict | Reason |
|--------|---------|--------|
| steamworks.js v0.4.0 | DO NOT USE | Requires `steamworks.init(AppId)` — your app must be a game published on Steam with a Valve-assigned AppId. This is an SDK for game developers, not for launchers. Also a native Rust/NAPI module requiring Electron rebuild. Last published August 2024. |
| greenworks v0.1.0 | DO NOT USE | Abandoned. Last npm publish June 2022. Requires you to download the Steamworks SDK binary separately and place it in the project. Same AppId restriction as steamworks.js. This repo is archived. |
| electron-steam-openid v1.2.0 | DO NOT USE | Last published June 2022, unmaintained. Steam OpenID only yields a SteamID64 — it does not give you any credentials usable for library access. You'd still need a Steam Web API key, and that only works for public profiles. |
| Steam OAuth (partner.steamgames.com/doc/webapi_overview/oauth) | DO NOT USE | Requires contacting Valve to obtain a Client ID. Scoped to specific AppIds. Intended for games/apps published through Valve, not third-party launchers. |
| Steam Web API alone (IPlayerService/GetOwnedGames) | DO NOT USE as primary | Fails silently for private Steam profiles unless the API key is linked to the same SteamID being queried. Would require every user to register an API key at steamcommunity.com/dev/apikey, adding friction. Valid as a fallback for users who prefer it (Playnite model), but steam-user is better as primary. |
| Browser-based Steam login (follow GOG/Epic pattern) | SKIP | Steam's OpenID only returns SteamID64, not a session token usable for library API calls. Heroic's GOG/Epic patterns use OAuth tokens from the browser; Steam OpenID does not provide this. steam-session's QR/credential flow is cleaner and more powerful. |

---

## Architecture Fit

The Steam store manager follows the existing pattern in `src/backend/storeManagers/`:

```
src/backend/storeManagers/steam/
  user.ts        ← SteamUser class (mirrors GOGUser/LegendaryUser)
  library.ts     ← SteamLibraryManager (implements LibraryManager interface)
  constants.ts   ← configStore, log prefix, file paths
  electronStores.ts ← electron-store instance for Steam credentials/cache
```

`steam-user` must run in the **main process only** (it opens TCP/WebSocket connections to Steam
CM servers). The renderer never imports it directly. IPC channels bridge auth status and library
data to the React frontend, consistent with how gog and legendary are wired.

The `libraryManagerMap` in `src/backend/storeManagers/index.ts` gains a `steam` key:

```typescript
import SteamLibraryManager from 'backend/storeManagers/steam/library'
export const libraryManagerMap = {
  // ...existing...
  steam: new SteamLibraryManager()
} satisfies Record<Runner, LibraryManager>
```

The `Runner` type in `common/types` needs `'steam'` added to its union.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| steam-user as core library | HIGH | npm-verified v5.3.0 (Dec 2025), active maintenance (DoctorMcKay), Node >=14, no native modules confirmed by reviewing full dep tree |
| steam-session for auth | HIGH | npm-verified v1.9.4 (July 2025), QR/credentials/SteamGuard flows confirmed in GitHub README |
| `getOwnedApps()` API | MEDIUM | Method exists and is documented, but PICS cache population time for large libraries is a known open issue (#144 on GitHub) — needs timeout/caching strategy |
| steam:// protocol for launching | HIGH | Valve-documented browser protocol, widely used by existing launchers, cross-platform |
| @node-steam/vdf for local data | HIGH | Already in project and working for existing features |
| steamworks.js rejection | HIGH | Verified from their own README: `steamworks.init(480)` takes an AppId; not usable without Steam store listing |
| Steam Web API privacy limitation | HIGH | Confirmed by multiple sources including Playnite docs and Steam community discussions |

---

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
- [node-steam-user issue #144: getOwnedApps() performance](https://github.com/DoctorMcKay/node-steam-user/issues/144)
