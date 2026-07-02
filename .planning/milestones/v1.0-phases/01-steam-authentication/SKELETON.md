# Walking Skeleton — GamerLib (Steam Authentication)

**Phase:** 1
**Generated:** 2026-06-26

## Capability Proven End-to-End

A user opens GamerLib, sees a "Steam Login" tile on the Manage Accounts screen, clicks it, lands on a native `/loginweb/steam` screen that detects whether the Steam client is installed (a real main-process filesystem check via IPC), and can authenticate via QR scan or username/password/SteamGuard — after which the tile shows "Logged in as {username}" with a working "Log Out" button. This exercises the full stack: renderer route → preload IPC bridge → main-process `steam-session`/`steam-user` → encrypted token persistence → back to renderer state.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Electron 41 + React 18 + TypeScript (Heroic fork — unchanged) | Constraint in CLAUDE.md: must stay mergeable with Heroic upstream |
| Store-manager pattern | New `src/backend/storeManagers/steam/` directory mirroring `zoom/` (static `SteamUser` class, no CLI binary) | Zoom is the closest analog: token-based auth, no external binary, follows established `LibraryManager`/`Runner` registration |
| Auth library | `steam-session` 1.9.4 (QR + credentials + SteamGuard) → refresh token; `steam-user` 5.3.0 to validate token + fetch persona name | Locked in CLAUDE.md/RESEARCH.md. Pure JS, no native modules, main-process only |
| Token storage | `electron-store` (`TypeCheckedStoreBackend` `steamConfigStore`, `cwd: 'steam_store'`) + Electron `safeStorage` encryption with `'steam:v1:'` prefix | Mirrors `src/backend/steamgrid/secureKey.ts`; never store password (Steam ToS) |
| Renderer/main boundary | `steam-session`/`steam-user` imported ONLY in `src/backend/`; renderer talks via `window.api.steam*` (preload `makeHandlerInvoker`) | Prevents sandbox-escape / blocked TCP from renderer |
| Login UI | Native React form at `/loginweb/steam` (NOT BrowserView/WebView), two MUI tabs (QR + Credentials), `react-qr-code` 2.2.0 for the QR SVG | Steam OpenID gives only a SteamID64; native `steam-session` flow is cleaner. Route added BEFORE `loginweb/:runner` catch-all |
| Directory layout | `storeManagers/steam/{constants,electronStores,user,__tests__}.ts`; `frontend/screens/Login/components/SteamLogin/{index.tsx,index.scss}`; preload `api/steam.ts` | Mirrors existing per-platform layout exactly |

## Stack Touched in Phase 1

- [x] Project scaffold — already exists (Heroic fork); Phase 1 adds packages (`steam-user`, `react-qr-code`, `@types/steam-user`) and the type foundation that makes `'steam'` a first-class `Runner`
- [x] Routing — real route `/loginweb/steam` rendering the native `SteamLogin` screen (added before the `loginweb/:runner` WebView catch-all)
- [x] Backend real read AND write — `checkSteamInstalled` (filesystem read) and encrypted refresh-token persistence to `steam_store` (write)
- [x] UI interactive element wired to backend — Steam Runner tile → SteamLogin screen → `window.api.checkSteamInstalled()` / `steamStartQR()` / `steamStartCredentials()` / `logoutSteam()`
- [x] Local full-stack run — `npm run dev` (Heroic dev script) launches the app; `npm run codecheck` (`tsc --noEmit`) and `npm test` gate compilation/tests

## Out of Scope (Deferred to Later Slices)

- Steam library sync, game metadata, playtime, cover art (Phase 2)
- Game launch/install/uninstall via `steam://` protocol (Phase 3)
- GamerLib rebranding (Phase 4)
- Multi-account Steam support (single account at launch, matches GOG/Epic)
- TOTP toggle UI (one SteamGuard input handles both email + TOTP)
- Token-expiry notification (~200-day refresh token); avatar/Steam64 display in account card
- `clearCache('steam')` handler body — `SteamUser.logout()` clears its own store directly (matches Zoom)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering the architectural decisions above:

- Phase 2 (Steam Library): real `SteamLibraryManager.refresh()` using `steam-user` `getOwnedApps()` + `@node-steam/vdf` ACF parsing + axios store metadata; Steam games appear in the unified library
- Phase 3 (Game Operations): launch/install/uninstall delegated to the Steam client via `shell.openExternal('steam://...')`; Proton on Linux
- Phase 4 (Branding): rename Heroic → GamerLib in title bar, About page, package.json, electron-builder config
