# Roadmap: GamerLib

## Overview

GamerLib forks Heroic Games Launcher and adds Steam as a first-class platform alongside Epic, GOG, and Amazon. The roadmap follows the natural dependency chain: Steam authentication is the prerequisite for everything else, library sync requires an authenticated account, game operations require the library to exist, and branding is applied once the core feature set is complete and ready to ship.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Steam Authentication** - Users can add, manage, and remove Steam accounts in GamerLib (completed 2026-06-27)
- [x] **Phase 2: Steam Library** - Steam games appear in the unified library with metadata and install state (completed 2026-06-28)
- [x] **Phase 3: Game Operations** - Users can launch, install, and uninstall Steam games from GamerLib (completed 2026-06-28)
- [ ] **Phase 4: Branding** - App is identified and distributed as GamerLib, not Heroic

## Phase Details

### Phase 1: Steam Authentication
**Goal**: Users can add, manage, and remove Steam accounts inside GamerLib
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. User can add a Steam account via QR code scan from the Steam mobile app
  2. User can add a Steam account via username/password/SteamGuard code
  3. Steam accounts appear in the existing Manage Accounts screen alongside Epic, GOG, and Amazon accounts
  4. User can remove a Steam account from GamerLib
  5. GamerLib shows an actionable prompt when Steam client is not installed
**Plans**: 3 (01-01, 01-02, 01-03)

**Wave 1** — Type + dependency foundation:
- `01-01-PLAN.md` — Install packages; add `'steam'` to Runner union, StoreStructure, IPC types, log constants; register stub LibraryManager/Game. Gate: `npm run codecheck`.

**Wave 2** *(blocked on Wave 1 completion)*:
- `01-02-PLAN.md` — SteamUser backend: encrypted token storage, QR auth flow, credential+SteamGuard flow, Steam client detection, IPC handlers + preload bridge. Gate: unit tests (`npm test -- --testPathPattern=steam/user`).

**Wave 3** *(blocked on Wave 1 + 2 completion)*:
- `01-03-PLAN.md` — Frontend: GlobalState/ContextProvider steam wiring, `/loginweb/steam` route (before WebView catch-all), Steam Runner tile, full SteamLogin screen (all 11 UI states). Gate: `npm run codecheck`.

**Cross-cutting constraints:**
- `steam-user` and `steam-session` must only run in main process — no renderer imports.
- All CSS uses semantic tokens from `_colors.scss` / `_spacing.scss` — no hard-coded hex or px.
- `/loginweb/steam` route MUST precede `loginweb/:runner` catch-all in App.tsx.

**UI hint**: yes

### Phase 2: Steam Library
**Goal**: Users can browse their full Steam library alongside Epic, GOG, and Amazon games
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: LIB-01, LIB-02, LIB-03, LIB-04
**Success Criteria** (what must be TRUE):
  1. Steam games appear in the main library view mixed with Epic, GOG, and Amazon games
  2. Each Steam game shows whether it is installed or not installed (read from ACF manifests)
  3. Each Steam game displays total playtime in hours
  4. Each Steam game shows cover art, title, description, and genres
**Plans**: 6 plans

**Wave 0** — Foundation + test scaffolds:
- [ ] `02-01-PLAN.md` — SteamUser.getClient() accessor, CacheStores (library/metadata/sync), ExtraInfo.steamPlaytimeMinutes, library.test.ts + games.test.ts RED scaffolds. Gate: `npm run codecheck` + steam tests green.

**Wave 1** *(blocked on Wave 0)*:
- [ ] `02-02-PLAN.md` — Backend library sync: refresh() via getUserOwnedApps, ACF install detection, init() cache-then-sync, offline fallback, shared state.ts. Gate: `npm test -- --testPathPattern=steam/library`.

**Wave 2** *(blocked on Wave 1)*:
- [ ] `02-03-PLAN.md` — Backend lazy metadata: SteamGame.getGameInfo + fetchMetadataIfNeeded (appdetails API, CDN art, pendingFetches dedup), library delegation. Gate: `npm test -- --testPathPattern=steam/games`.

**Wave 3** *(blocked on Wave 2)*:
- [ ] `02-04-PLAN.md` — Frontend data integration: handleGamePush steam case, background-sync steamLogin, Library/index.tsx 5 gaps, steamCategories. Gate: `npm run codecheck`.

**Wave 4** *(blocked on Wave 3)*:
- [ ] `02-05-PLAN.md` — Frontend UI: steam-logo.svg + StoreLogos, GameCard playtime + skeleton, getSteamSyncedAt IPC, LibraryHeader sync spinner + stale indicator + manual refresh, i18n. Gate: `npm run codecheck`.

**Wave 5** *(blocked on Wave 3 + 4)*:
- [ ] `02-06-PLAN.md` — Manual QA checkpoint: LIB-01..04 verified on a real Steam account. Gate: human sign-off.

**Cross-cutting constraints:**
- `steam-user` / `steam-session` / `axios` Steam calls stay in main process only — renderer receives data via IPC.
- Use `getUserOwnedApps()` (not `getOwnedApps()` / PICS cache) for ownership + playtime.
- ACF install check uses `(StateFlags & 4) !== 0` bitmask, never equality.
- All new CSS uses semantic tokens from `_colors.scss` / `_spacing.scss`; all strings via `t()`.
- Zero new npm packages.

**UI hint**: yes

### Phase 3: Game Operations
**Goal**: Users can launch, install, and uninstall Steam games from within GamerLib
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: GAME-01, GAME-02, GAME-03, GAME-04
**Success Criteria** (what must be TRUE):
  1. User can launch an installed Steam game from GamerLib (Steam client opens the game via steam://rungameid)
  2. User can install a Steam game from GamerLib (Steam client handles the download via steam://install)
  3. User can uninstall a Steam game from GamerLib (via steam://uninstall)
  4. Windows-only Steam games on Linux launch via Steam Proton, not Heroic's Wine layer
**Plans**: 4 plans

**Wave 1** — Launch slice:
- [ ] `03-01-PLAN.md` — SteamGame.launch() fires steam://rungameid + hand-off toast + numeric appId guard; supporting getSettings/getExtraInfo/isGameAvailable/stop so GamePage and launchEventCallback work. isNative() stays true (GAME-04). Gate: `npm test -- --testPathPattern=steam/games` + codecheck. (GAME-01, GAME-04)

**Wave 2** *(blocked on Wave 1 — shares games.ts)*:
- [ ] `03-02-PLAN.md` — SteamGame.install()/uninstall()/forceUninstall() via steam://install|uninstall (no GamerLib confirm, D-05); SteamLibraryManager.refreshInstallState() ACF diff; BrowserWindow 'focus' listener wiring + LibraryManager interface. Gate: steam/games + steam/library tests + codecheck. (GAME-02, GAME-03)

**Wave 3** *(blocked on Wave 2)*:
- [ ] `03-03-PLAN.md` — Frontend clean action surface: hide Settings/Move/Change/Verify/Force-Update for steam (D-04); install bypasses location modal; uninstall bypasses GamerLib confirm (D-05); human end-to-end verification on a real Steam account. Gate: codecheck + human sign-off. (GAME-02, GAME-03)

**Wave 4** *(blocked on Wave 2/3 — install in-progress UX, D-07)*:
- [ ] `03-04-PLAN.md` — Steam install in-progress UX: backend ACF poller after steam://install (spinner 'Steam installing', no percentage, no pause/cancel), flips badge to installed on StateFlags & 4 + stops; startup resume; focus reconciliation stays as backstop (reverses D-01 to D-07). Gate: steam/library + steam/games tests + codecheck + human sign-off. (GAME-02)

**Cross-cutting constraints:**
- All `steam://` URLs constructed through a single numeric-appId guard (`buildSteamProtocolUrl`, `/^\d+$/`) — never interpolate unvalidated appId.
- `SteamGame.isNative()` must remain `true` so launchEventCallback skips Heroic's Wine branch (GAME-04 satisfied by absence).
- No background polling — install-state reconciliation is BrowserWindow `'focus'`-driven only (D-01).
- No GamerLib install-location or uninstall-confirm modals for Steam — delegate to Steam's own dialogs (D-04/D-05).
- Zero new npm packages.

**UI hint**: yes

### Phase 4: Branding
**Goal**: App is identified and distributed as GamerLib, not Heroic
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: BRAND-01
**Success Criteria** (what must be TRUE):
  1. Title bar displays "GamerLib" instead of "Heroic"
  2. About page reflects the GamerLib name
  3. Package metadata (package.json and electron-builder config) correctly identifies the app as GamerLib
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Steam Authentication | 3/3 | Complete   | 2026-06-27 |
| 2. Steam Library | 6/6 | Complete   | 2026-06-28 |
| 3. Game Operations | 4/4 | Complete   | 2026-06-28 |
| 4. Branding | 0/TBD | Not started | - |
