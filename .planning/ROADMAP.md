
# Roadmap: GameLib

## Overview

GameLib forks Heroic Games Launcher and adds Steam as a first-class platform alongside Epic, GOG, and Amazon. The roadmap follows the natural dependency chain: Steam authentication is the prerequisite for everything else, library sync requires an authenticated account, game operations require the library to exist, and branding is applied once the core feature set is complete and ready to ship.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### v1.0 — Steam Platform (Shipped 2026-06-29)

- [x] **Phase 1: Steam Authentication** - Users can add, manage, and remove Steam accounts in GameLib (completed 2026-06-27)
- [x] **Phase 2: Steam Library** - Steam games appear in the unified library with metadata and install state (completed 2026-06-28)
- [x] **Phase 3: Game Operations** - Users can launch, install, and uninstall Steam games from GameLib (completed 2026-06-28)
- [x] **Phase 4: Branding** - App is identified and distributed as GameLib, not Heroic (completed 2026-06-28)

### v1.1 — Polish & Enhancements

- [x] **Phase 5: Branding & About Polish** - GameLib presents complete, accurate identity across tray, backend logs, docs, and the release notes link (completed 2026-07-02)
- [x] **Phase 6: Library & Game Status UX** - Library grid surfaces real playtime and install size; a "Playing" badge tracks active Steam sessions (completed 2026-07-03)
- [x] **Phase 7: Game Details Enrichment** - Game details page shows supported platforms and, on macOS, an AppleGamingWiki compatibility rating (completed 2026-07-03, manual UAT pending)
- [x] **Phase 8: New Steam Surfaces** - Steam storefront is browsable in the Stores sidebar tab; Steam games appear in Console mode (completed 2026-07-03)
- [ ] **Phase 9: Quality Gate** - All v1.0 and v1.1 shipped phases pass a formal Nyquist validation pass

## Phase Details

### Phase 1: Steam Authentication
**Goal**: Users can add, manage, and remove Steam accounts inside GameLib
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. User can add a Steam account via QR code scan from the Steam mobile app
  2. User can add a Steam account via username/password/SteamGuard code
  3. Steam accounts appear in the existing Manage Accounts screen alongside Epic, GOG, and Amazon accounts
  4. User can remove a Steam account from GameLib
  5. GameLib shows an actionable prompt when Steam client is not installed
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
**Goal**: Users can launch, install, and uninstall Steam games from within GameLib
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: GAME-01, GAME-02, GAME-03, GAME-04
**Success Criteria** (what must be TRUE):
  1. User can launch an installed Steam game from GameLib (Steam client opens the game via steam://rungameid)
  2. User can install a Steam game from GameLib (Steam client handles the download via steam://install)
  3. User can uninstall a Steam game from GameLib (via steam://uninstall)
  4. Windows-only Steam games on Linux launch via Steam Proton, not Heroic's Wine layer
**Plans**: 4 plans

**Wave 1** — Launch slice:
- [ ] `03-01-PLAN.md` — SteamGame.launch() fires steam://rungameid + hand-off toast + numeric appId guard; supporting getSettings/getExtraInfo/isGameAvailable/stop so GamePage and launchEventCallback work. isNative() stays true (GAME-04). Gate: `npm test -- --testPathPattern=steam/games` + codecheck. (GAME-01, GAME-04)

**Wave 2** *(blocked on Wave 1 — shares games.ts)*:
- [ ] `03-02-PLAN.md` — SteamGame.install()/uninstall()/forceUninstall() via steam://install|uninstall (no GameLib confirm, D-05); SteamLibraryManager.refreshInstallState() ACF diff; BrowserWindow 'focus' listener wiring + LibraryManager interface. Gate: steam/games + steam/library tests + codecheck. (GAME-02, GAME-03)

**Wave 3** *(blocked on Wave 2)*:
- [ ] `03-03-PLAN.md` — Frontend clean action surface: hide Settings/Move/Change/Verify/Force-Update for steam (D-04); install bypasses location modal; uninstall bypasses GameLib confirm (D-05); human end-to-end verification on a real Steam account. Gate: codecheck + human sign-off. (GAME-02, GAME-03)

**Wave 4** *(blocked on Wave 2/3 — install in-progress UX, D-07)*:
- [ ] `03-04-PLAN.md` — Steam install in-progress UX: backend ACF poller after steam://install (spinner 'Steam installing', no percentage, no pause/cancel), flips badge to installed on StateFlags & 4 + stops; startup resume; focus reconciliation stays as backstop (reverses D-01 to D-07). Gate: steam/library + steam/games tests + codecheck + human sign-off. (GAME-02)

**Cross-cutting constraints:**
- All `steam://` URLs constructed through a single numeric-appId guard (`buildSteamProtocolUrl`, `/^\d+$/`) — never interpolate unvalidated appId.
- `SteamGame.isNative()` must remain `true` so launchEventCallback skips Heroic's Wine branch (GAME-04 satisfied by absence).
- No background polling — install-state reconciliation is BrowserWindow `'focus'`-driven only (D-01).
- No GameLib install-location or uninstall-confirm modals for Steam — delegate to Steam's own dialogs (D-04/D-05).
- Zero new npm packages.

**UI hint**: yes

### Phase 4: Branding
**Goal**: App is identified and distributed as GameLib, not Heroic
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: BRAND-01
**Success Criteria** (what must be TRUE):
  1. Title bar displays "GameLib" instead of "Heroic"
  2. About page reflects the GameLib name
  3. Package metadata (package.json and electron-builder config) correctly identifies the app as GameLib
**Plans**: 2 plans

**Wave 1** — Identity rename slice:
- [x] `04-01-PLAN.md` — Failing GameLib identity smoke script (RED) → targeted rename of 7 locations (package.json name/author/description, electron-builder appId + Linux Name, translation.json sidebar/About values, React fallbacks, APP_DISPLAY_NAME constant + clipboard text) → assert already-correct surfaces intact (GREEN). Gate: `node scripts/verify-branding.cjs` + `npm run codecheck`. (BRAND-01)

**Wave 2** *(blocked on Wave 1 — live-app verification)*:
- [x] `04-02-PLAN.md` — Human-verify checkpoint: title bar, sidebar version label, About page label, and Copy-to-clipboard text all read "GameLib" in the running app. Gate: human sign-off. (BRAND-01)

**Cross-cutting constraints:**
- Targeted rename only (D-04) — do NOT sweep the ~82 files containing "Heroic".
- Do NOT change the `heroic://` protocol scheme (main.ts / protocol.ts / electron-builder protocols block) — functional deep-link handler.
- Do NOT change `paths.ts` `appFolder = join(configFolder, 'heroic')` — stores user game configs, independent of appId.
- Change i18n string VALUES only, never KEY paths (breaks 50+ locale files).
- `package.json` `name` must be lowercase `gamelib`; capitalized "GameLib" lives in productName + i18n.
- Zero new npm packages.

**UI hint**: yes

---

## v1.1 Phase Details

### Phase 5: Branding & About Polish
**Goal**: GameLib presents complete, accurate identity across tray tooltip, backend logs, documentation, and the in-app release notes link
**Depends on**: Phase 4
**Requirements**: BRAND-02, BRAND-03, BRAND-04, APP-01
**Success Criteria** (what must be TRUE):
  1. The macOS menu-bar (tray) tooltip reads "GameLib" instead of "Heroic"
  2. Backend log output and dialog strings use "GameLib" where they previously showed "Heroic"
  3. The README accurately documents GameLib as a fork of Heroic with Steam support and includes build/install steps
  4. Clicking the version number in the app opens a GameLib release notes view describing what changed, with a link to the corresponding upstream Heroic release
**Plans**: 4 plans
  - [x] 05-01-PLAN.md — utils.ts rebrand + bundled changelog + update-check suppression + tray tooltip + Discord presence (APP-01, BRAND-02, BRAND-03)
  - [x] 05-02-PLAN.md — remaining backend dialog/error strings + filesystem path constants clean cutover (BRAND-03)
  - [x] 05-03-PLAN.md — README accuracy/fork-clarity pass + VS Code launch-config rename (BRAND-04)
  - [x] 05-04-PLAN.md — extend verify-branding.cjs with Phase 5 Section 5 gate (BRAND-02, BRAND-03, APP-01)
**UI hint**: yes

### Phase 6: Library & Game Status UX
**Goal**: Library grid and download manager surface accurate, real-time data — real install size in the DM queue, and a "Playing" badge during active Steam sessions (LIB-05 playtime met via existing details page, D-01)
**Depends on**: Phase 4
**Requirements**: LIB-05, LIB-06, GAME-05
**Success Criteria** (what must be TRUE):
  1. Steam playtime is visible on the game details page (LIB-05 met via existing TimeContainer per D-01; grid-tile display descoped)
  2. The download-manager queue shows the real install size for Steam games instead of "?? MB"
  3. While a Steam game is actively running, the game shows a "Playing" status badge in the library
**Plans**: 2 plans

**Wave 1** — two independent slices (no file overlap, run in parallel):
- [ ] `06-01-PLAN.md` — LIB-06 install size: getSteamInstallSize/parse helpers (store appdetails), DM runner-gate, DownloadManagerItem render fix. (LIB-06; LIB-05 met-via-existing)
- [ ] `06-02-PLAN.md` — GAME-05 Playing badge: per-platform RunningAppID readers + ~5s poller, lifecycle wiring, GameCard Stop-button hide (D-08). (GAME-05)
**UI hint**: yes

### Phase 7: Game Details Enrichment
**Goal**: The game details page shows supported platforms and, on macOS, a compatibility rating from AppleGamingWiki for Mac-supported games
**Depends on**: Phase 4
**Requirements**: DETAIL-01, DETAIL-02
**Success Criteria** (what must be TRUE):
  1. The game details page shows which platforms a game supports (Windows, macOS, Linux)
  2. On macOS, Windows-only Steam games (no native Mac build) show an AppleGamingWiki CrossOver/Wine compatibility rating overlaid on the game art — measuring how well the Windows game runs on macOS via a translation layer (design corrected during Phase 7 UAT, superseding D-13; gate = `darwin && !is_mac_native`)
  3. The compatibility overlay only appears on macOS and only for games WITHOUT a native Mac build (Mac-native games run natively and need no translation-layer rating)
**Plans**: 1 gap-closure plan (07-02)
- [ ] `07-02-PLAN.md` — Fix Steam platform data: self-healing supported-platform re-fetch (GAP 1), host-derived installed platform (GAP 2), icon spacing (GAP 3)
**UI hint**: yes

### Phase 8: New Steam Surfaces
**Goal**: Steam content is accessible in the Stores sidebar tab and Steam games are available in Console mode
**Depends on**: Phase 4
**Requirements**: STORE-01, CONSOLE-01
**Success Criteria** (what must be TRUE):
  1. A Steam tab appears in the sidebar Stores section alongside the existing Epic and GOG store tabs
  2. The Steam store tab lets the user browse the Steam storefront from within GameLib (browse-only; purchasing remains in Steam's own flow)
  3. Steam games appear in Console mode
  4. A Steam game can be launched from Console mode
**Plans**: 6 plans (2 shipped + 4 gap-closure from UAT)
  - [x] 08-01-PLAN.md — Steam storefront tab (STORE-01)
  - [x] 08-02-PLAN.md — Steam in Console mode + launch/install handoff (CONSOLE-01)
  - [x] 08-03-PLAN.md — Gap A+C: GameLib-branded fallback art + greyed variant + broken-art onError fallback
  - [x] 08-04-PLAN.md — Gap B: filter delisted Steam games from Console + block activation
  - [x] 08-05-PLAN.md — Gap D: Console launch overlay dismisses on window blur (not fixed 1500ms)
  - [x] 08-06-PLAN.md — Gap F: Deals "Hide Owned" accounts for all stores (not GOG only)
**UI hint**: yes

### Phase 08.1: Steam Delisted Games & Library Filters (INSERTED)

**Goal:** Delisted / no-longer-available Steam games are handled correctly in the Library, and the library availability filters work and gain "only-show" modes.
**Requirements**: LIB-07, LIB-08, LIB-09 (new — from Phase 8 UAT)
**Depends on:** Phase 8 (Gap B added the Steam `is_delisted` signal this phase consumes)
**Plans:** 3/4 plans executed

**Scope (from Phase 8 UAT 2026-07-04):**
- **LIB-07** — Wire Steam's delisted signal (`is_delisted`, from appdetails `success:false`, added in Phase 8 Gap B) into the frontend `isGameAvailable` / `nonAvailableGames` path so the existing "show non-available games" Library filter actually works for Steam. Reconcile with Steam's current install-state-based `isGameAvailable()` so "non-available" means *delisted*, not merely *not-installed*.
- **LIB-08** — A delisted game renders a greyed **"Game no longer available"** placeholder and its **install option is disabled** (no `steam://install` handoff that can't succeed).
- **LIB-09** — Add **"only show hidden"** and **"only show non-available games"** filter modes (today `showHidden` / `showNonAvailable` are additive-only; there is no "only" mode).

**Notes:**
- Spans frontend Library filters (`screens/Library/index.tsx`, `components/UI/LibraryFilters`, `LibraryContext`) + Steam backend availability (`storeManagers/steam`) + placeholder UI/messaging.
- Delisted games are already excluded from Console (Gap B); this phase is the **Library** treatment.

Plans:
- [x] 08.1-01-PLAN.md — Backend `isGameAvailable()` delisted guard + tests + REQUIREMENTS.md traceability (LIB-07)
- [x] 08.1-02-PLAN.md — LIB-08 GameCard delisted tile (badge, greyed art, install hidden) + 3 i18n keys (LIB-08)
- [x] 08.1-03-PLAN.md — LIB-09 tri-state filter migration core + LIB-07 frontend is_delisted non-available check (LIB-07, LIB-09)
- [ ] 08.1-04-PLAN.md — LIB-09 'only'-mode empty-state messaging + active 'only' button CSS (LIB-09)

**Wave 1** (parallel — zero file overlap): 08.1-01, 08.1-02, 08.1-03
**Wave 2** (blocked on 08.1-02 + 08.1-03): 08.1-04

### Phase 9: Quality Gate
**Goal**: All v1.0 and v1.1 shipped phases are formally validated and any regressions are documented
**Depends on**: Phases 5, 6, 7, 8
**Requirements**: QA-01
**Success Criteria** (what must be TRUE):
  1. A recorded Nyquist validation pass exists covering all v1.0 phases (AUTH-01..05, LIB-01..04, GAME-01..04, BRAND-01)
  2. All v1.1 requirements are spot-checked as part of the validation pass
  3. Any regressions discovered during the pass are documented as issues or resolved before completion
**Plans**: TBD

## Progress

**Execution Order:**
v1.0: 1 → 2 → 3 → 4 (complete)
v1.1: 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Steam Authentication | 3/3 | Complete   | 2026-06-27 |
| 2. Steam Library | 6/6 | Complete   | 2026-06-28 |
| 3. Game Operations | 4/4 | Complete   | 2026-06-28 |
| 4. Branding | 2/2 | Complete   | 2026-06-28 |
| 5. Branding & About Polish | 4/4 | Complete   | 2026-07-02 |
| 6. Library & Game Status UX | 2/2 | Complete   | 2026-07-03 |
| 7. Game Details Enrichment | 0/? | Not started | - |
| 8. New Steam Surfaces | 6/6 | Complete   | 2026-07-03 |
| 9. Quality Gate | 0/? | Not started | - |
