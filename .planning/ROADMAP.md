
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

### v1.2 — Humble Bundle Integration

- [x] **Phase 10: Humble Auth + Adapter Scaffold** - Users can connect a Humble Bundle account from Manage Accounts with encrypted session persistence and a validated C5 API boundary (completed 2026-07-05)
- [x] **Phase 11: Library Sync + 5-State Key Model** - Full Humble key inventory synced, classified into the 5-state model, and reliably cached with fail-soft behavior (completed 2026-07-06)
- [x] **Phase 12: Ownership Dedup** - Every Humble key cross-referenced against the Steam library; redeemed Steam keys collapse onto their existing Steam library entries (completed 2026-07-06)
- [ ] **Phase 13: Keys-Waiting + Giftable-Spares Views** - Users can see claimable keys sorted by expiration urgency and surface gift links for owned-elsewhere spares
- [x] **Phase 14: Guided Claim Flow** - Users safely reveal and activate Humble Steam keys with structural protection against key waste, accidental re-reveal, and rate-limit lockout (completed 2026-07-08)
- [x] **Phase 15: Store Overlay + Expiration Alerts** - Store surfaces show Humble ownership badges; newly-expiring keys trigger OS notifications (completed 2026-07-10; re-verified 10/10 after gap closure — 15-05 CR-01 badge reachability, 15-06 WR-01/WR-02 composite dedup + i18n, follow-up WR-01 divergence fix baac4527; see 15-VERIFICATION.md)

### v1.3 — Compatibility Data

- [x] **Phase 16: CrossOver Compatibility Rating (CodeWeavers)** - The extra-info Crossover rating comes from live CodeWeavers compatibility data instead of the stale AppleGamingWiki source (completed 2026-07-10)

### v1.4 — Steam macOS Compatibility Runtime

- [ ] **Phase 17: Steam on macOS via CrossOver/Wine** - Windows-only Steam games (no native Mac build) install and launch on macOS through the Windows Steam client running inside a GameLib-managed CrossOver/Wine bottle, instead of native steam:// delegation

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
**Plans**: 7 plans (6 + 1 gap closure)

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
**Plans**: 6 plans

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
**Plans**: 7 plans (6 + 1 gap closure) (2 shipped + 4 gap-closure from UAT)
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
**Plans:** 4/4 plans complete

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
- [x] 08.1-04-PLAN.md — LIB-09 'only'-mode empty-state messaging + active 'only' button CSS (LIB-09)

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

## v1.2 Phase Details

### Phase 10: Humble Auth + Adapter Scaffold
**Goal**: Users can connect a Humble Bundle account from Manage Accounts with encrypted session persistence; the C5 adapter boundary is in place and empirically validated against the live Humble API before any feature work proceeds
**Depends on**: Phase 4
**Requirements**: HACCT-01, HACCT-02, HACCT-03
**Success Criteria** (what must be TRUE):
  1. User can log in to Humble Bundle via an in-app browser window (email/password + Humble Guard emailed code) from Manage Accounts — reCAPTCHA and Humble Guard are completed in the browser with no app-side CAPTCHA logic required
  2. The Humble session persists encrypted across app restarts; no re-login is required until the session expires (~2-3 day TTL)
  3. When the session expires, a non-disruptive reconnect prompt appears without hiding or breaking the cached library view
  4. User can disconnect their Humble account and remove all session data from the app
  5. On Linux without a system keyring, the app warns about reduced encryption rather than storing the session cookie silently in plaintext
**Plans**: 6 plans (replan after 10-05 parked: login surface moved from popup BrowserWindow to the embedded WebView; validation gate criteria revised)
- [x] 10-01-PLAN.md — Backend foundation: humble types/contracts, constants, config store, C5 adapter + adapter tests
- [x] 10-02-PLAN.md — HumbleUser auth service: cookie encryption, health check, reconnect, disconnect + tests
- [x] 10-03-PLAN.md — IPC channels + ipc_handler + preload bridge + main.ts registration
- [x] 10-04-PLAN.md — Frontend: humble context slice, Manage Accounts tile (connected/expired/disconnected), i18n
- [x] 10-05-PLAN.md — Re-point login to the embedded /loginweb/humble WebView (persist:humble, gamekeys acceptance D-16, best-effort identity, retire popup/HumbleConnect)
- [x] 10-06-PLAN.md — Live validation gate: identity-advisory D-13, ses.fetch D-14 fallback, real-account UAT, 10-VALIDATION.md
**UI hint**: yes

### Phase 11: Library Sync + 5-State Key Model
**Goal**: A connected Humble account's full key inventory is synced into GameLib, classified into exactly one of five states, and reliably available even when the Humble API is unreachable
**Depends on**: Phase 10
**Requirements**: HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04
**Success Criteria** (what must be TRUE):
  1. After connecting a Humble account, all order keys appear in GameLib classified as exactly one of UNPICKED / UNREVEALED / REVEALED / REDEEMED / UNREDEEMABLE
  2. A key revealed through the launcher retains its REVEALED classification across app restarts and re-syncs (write-ahead flag persisted to disk before the reveal API call, not held in React state)
  3. A key that gains a retroactive expiration between syncs is reclassified UNREDEEMABLE on the next sync — no manual refresh required
  4. If a Humble sync fails, the previously cached library is displayed with a clear "couldn't refresh" indicator rather than a blank or error state
**Plans**: 5 plans

**Wave 1** — Type + classification foundation:
- [ ] `11-01-PLAN.md` — Types (HumbleKey/HumbleKeyState/cache-entry/sync-state) + IPC types, three-store split (library/sync/revealed), constants, pure 5-state `classify.ts` + tests, tightened OrderDetailSchema (HSYNC-01/02/03)

**Wave 2** *(blocked on 11-01)*:
- [ ] `11-02-PLAN.md` — `library.ts` sync orchestration (skip-terminal partition, bounded concurrency pool, per-order commit, fail-soft, cooldown) + `disconnect()` store-survival split + tests (HSYNC-01/02/03/04)

**Wave 3** *(blocked on 11-02)*:
- [ ] `11-03-PLAN.md` — `humble:*` sync IPC handlers + preload bridge + frontend `humble` context slice (keys/syncedAt/syncError/syncing) + startup/login sync triggers (HSYNC-01/04)

**Wave 4** *(blocked on 11-03)*:
- [ ] `11-04-PLAN.md` — Read-only Humble Keys page (state-grouped list, freshness indicator, fail-soft banner, 5-state badges) + route + sidebar entry + i18n (HSYNC-01/04)

**Wave 5** *(blocked on 11-04 — checkpoint)*:
- [ ] `11-05-PLAN.md` — Fill 11-VALIDATION.md from the executed test map + real-account UAT + live [ASSUMED] resolution (A1/A3) (HSYNC-01/02/03/04)

### Phase 12: Ownership Dedup
**Goal**: Every Humble key is cross-referenced against the Steam library so already-owned games are identified before any user action, and Humble Steam keys already redeemed appear on their existing Steam entry rather than as duplicates
**Depends on**: Phase 11
**Requirements**: HDEDUP-01, HDEDUP-02
**Success Criteria** (what must be TRUE):
  1. A Humble Steam key for a game already in the Steam library is marked owned_elsewhere and does not appear as a claimable key in "Keys waiting"
  2. A Humble Steam key already redeemed into Steam appears as an annotation on the existing Steam library entry rather than as a separate Humble entry
  3. Ownership matching uses AppID as the primary key (exact match via `steam_app_id`) with an 85%+ fuzzy-name fallback — DLC titles do not false-positive match their base game entries
**Plans**: 5 plans (5 waves — inherently linear dependency chain: types → matcher → wiring → IPC → UI)
- [x] 12-01-PLAN.md — HumbleKey type + constants (classifier v3, fuzzy threshold) + steam_app_id capture in classify (HDEDUP-01, HDEDUP-02)
- [x] 12-02-PLAN.md — Pure dedup.ts matcher (exact-AppID-final + fuzzy-85%+DLC-guard) behind fastest-levenshtein legitimacy gate (HDEDUP-01)
- [x] 12-03-PLAN.md — Override store + disconnect exemption + library.ts recompute wiring, backfill, keep-last-known connectivity gate (HDEDUP-01, HDEDUP-02)
- [x] 12-04-PLAN.md — Override IPC channels + server-side fuzzy validation + main.ts Steam-refresh recompute trigger (HDEDUP-01)
- [x] 12-05-PLAN.md — Owned badge + fuzzy-only override on Keys page + redeemed-only Humble-origin annotation on Steam GamePage + human-verify (HDEDUP-01, HDEDUP-02)

**Wave 1:** 12-01 · **Wave 2:** 12-02 · **Wave 3:** 12-03 · **Wave 4:** 12-04 · **Wave 5:** 12-05

### Phase 13: Keys-Waiting + Giftable-Spares Views
**Goal**: Users can see at a glance which Humble keys are available to claim and which can be gifted, sorted by expiration urgency; these views must exist before the claim flow since the C2 guard routes to Giftable Spares
**Depends on**: Phase 12
**Requirements**: HVIEW-01, HVIEW-02
**Success Criteria** (what must be TRUE):
  1. A "Keys waiting" view lists all unowned, unredeemed Humble keys with keys expiring soonest at the top
  2. Keys expiring within 30 days display an expiration urgency badge showing the time remaining
  3. A "Giftable spares" view lists owned-elsewhere, UNREVEALED keys and allows copying the Humble gift link with one click, with an irreversibility warning
**Plans**: 5 plans
  - [x] 13-01-PLAN.md — Pure view helpers: selectKeysWaiting/selectGiftableSpares + urgency tier/countdown (HVIEW-01, HVIEW-02)
  - [x] 13-02-PLAN.md — Backend gift-open persistence: humbleGiftedAtStore + disconnect carve-out + validated IPC (HVIEW-02)
  - [x] 13-03-PLAN.md — Tab router refactor + Keys-waiting view + UrgencyBadge + All-keys verbatim move (HVIEW-01)
  - [x] 13-04-PLAN.md — Giftable-spares view + confirm-gated "Gift on Humble" deep-link + gifted annotation (HVIEW-02)
  - [x] 13-05-PLAN.md — Human-verify checkpoint: routing, urgency badges, gift dialog, All-keys no-regression (HVIEW-01, HVIEW-02)

**Wave 1** (parallel — zero file overlap): 13-01, 13-02
**Wave 2** (blocked on 13-01): 13-03
**Wave 3** (blocked on 13-01/02/03): 13-04
**Wave 4** (blocked on 13-03/04 — checkpoint): 13-05
**UI hint**: yes

### Phase 14: Guided Claim Flow
**Goal**: Users can safely reveal and activate Humble Steam keys with structural protection against key waste, accidental re-reveal, and Steam activation rate-limit lockout
**Depends on**: Phase 13
**Requirements**: HCLAIM-01, HCLAIM-02, HCLAIM-03, HCLAIM-04, HCLAIM-05
**Success Criteria** (what must be TRUE):
  1. Revealing a key requires explicit per-key user confirmation with a clear irreversibility warning — no auto-reveal and no "reveal all" option exists anywhere in the UI
  2. Attempting to reveal a key for an already-owned game intercepts the action and routes to the Giftable Spares view instead of proceeding (C2 hard block, not an advisory)
  3. After reveal, the key is copied to clipboard and the browser opens store.steampowered.com/account/registerkey?key= pre-filled; a "Mark as redeemed" button records activation completion
  4. Every reveal and redeem action is recorded in a local audit log with key identity, timestamp, and outcome — the audit record is written before the reveal API call
  5. Non-Steam Humble keys (Epic, GOG, Ubisoft, etc.) show a "Redeem on {platform}" link-out with a copy-key button — no one-click activation is offered
**Plans**: 6 plans

Plans:
- [x] 14-01-PLAN.md — Foundation: reveal/redeem types + IPC signatures, classifier-version bump, 3 composite-keyed disconnect-surviving stores, WR-01 dedup fix
- [x] 14-02-PLAN.md — Adapter revealKey() write call + keyindex schema, classify local-redeemed tier + keyindex side-channel, csrf_cookie capture
- [x] 14-03-PLAN.md — library reveal/mark/undo orchestration (write-ahead audit, C2 hard block, D-78 rollback, cache-patch) + IPC handlers + preload invokers
- [x] 14-04-PLAN.md — HumbleClaimWizard modal component (warning → reveal → key + open Steam / redeem link-out → mark redeemed) + tests
- [x] 14-05-PLAN.md — HumbleKeyRow claimAction + Keys-waiting wizard mount + Spares WR-04 undo-override + i18n
- [x] 14-06-PLAN.md — Live reveal-endpoint validation checkpoint (disposable key) + full-suite gate + 14-VALIDATION.md
- [x] 14-07-PLAN.md — Gap closure (UAT test 2 CR-01 + test 3 WR-02): realign classifier so server redeemed_key_val = REVEALED and REDEEMED is a local-only, always-undoable overlay; delete the locallyRedeemedPending / WR-02 keep-visible / server_confirmed_ack machinery; classifier version 4→5
- [x] 14-08-PLAN.md — Gap closure (UAT test 8 sync churn + 2 side-findings): carry ownership overlay at commit time (kills Keys-waiting fill-then-empty churn + closes T-14-03 C2 mid-sync window) and add a single-sourced server-terminal freeze predicate (restores D-24 freeze for REVEALED(no-expiry) orders, cutting standing Humble re-fetch/WAF exposure); classifier version 5→6

**Wave 1:** 14-01 · **Wave 2:** 14-02 · **Wave 3:** 14-03 · **Wave 4:** 14-04 · **Wave 5:** 14-05 · **Wave 6:** 14-06 (checkpoint) · **Wave 1 (gap closure):** 14-07 · **Wave 1 (gap closure):** 14-08
**UI hint**: yes

### Phase 15: Store Overlay + Expiration Alerts
**Goal**: Store browsing surfaces show Humble ownership context as additive badges and users are alerted when keys gain new expiration deadlines detected on sync
**Depends on**: Phase 12
**Requirements**: HSTORE-01, HSTORE-03
**Success Criteria** (what must be TRUE):
  1. With a connected Humble account, each title on store surfaces shows an ownership badge: Owned, Unclaimed-key-available, or New
  2. An "expiring soon" surface lists keys nearing expiration sorted by urgency
  3. When a previously non-expiring key gains an expiration on sync, an OS notification alerts the user — the notification does not repeat on subsequent syncs for the same key
**Plans**: 6 plans (4 original + 2 gap closure)
  - [x] 15-01-PLAN.md — Store overlay ownership badges on Discounts (exact-match pure helper + DiscountCard pill) (HSTORE-01)
  - [x] 15-02-PLAN.md — Notification foundation: default-ON Settings toggle + disconnect-exempt notified-state store (HSTORE-03)
  - [x] 15-03-PLAN.md — Expiration-transition detection + digest OS notification + runSync hook (dedup + first-sync baseline) (HSTORE-03)
  - [x] 15-04-PLAN.md — Pinned "Expiring soon" section on Keys-waiting (pure partition helper + static section) (HSTORE-03)
  - [x] 15-05-PLAN.md — [gap closure] Fix CR-01: make 'Key available' badge reachable via shared buildDiscountBadgeMaps helper + integration test (HSTORE-01)
  - [x] 15-06-PLAN.md — [gap closure] Fix WR-01 (composite gamekey:machineName dedup + legacy backfill) + WR-02 (register humble.notification.* i18n keys) (HSTORE-03)

**Wave 1** (parallel — zero code-file overlap): 15-01, 15-02, 15-04
**Wave 2** (blocked on 15-02 — reads notified-state store + notify setting): 15-03
**UI hint**: yes

## v1.3 Phase Details

### Phase 16: CrossOver Compatibility Rating (CodeWeavers)

**Goal**: The extra-info panel's "Crossover rating" row is populated from live CodeWeavers CrossOver compatibility data (replacing the stale AppleGamingWiki source added in quick task 260710-l27), fetched on-demand and cached, with a graceful "no compatibility data" state for genuine misses.
**Depends on**: Phase 7 (extra-info compatibility rows), spike 260710-nwb (feasibility validated)
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. For a title with a real CodeWeavers listing, the extra-info Crossover rating row shows the CodeWeavers aggregateRating (value + count) instead of the AppleGamingWiki value
  2. Lookups are on-demand and cached — no bulk crawl of the ~22,350-app directory; requests use a desktop browser User-Agent
  3. Genuine misses render a graceful "no compatibility data available" state, not an error or a false rating
**Locked constraints** (from validated spike 260710-nwb — see `spike/crossover-compat-FINDINGS.md`):
  - Hit/miss detected by CONTENT (presence of a parseable `VideoGame` JSON-LD node), NOT HTTP status — every response is 200; misses are soft-404 pages titled "404 Not Found"
  - Slugify drops apostrophes entirely (`baldurs-gate-3`) and normalizes roman numerals to Arabic digits (`modern-warfare-2`); consider a secondary fallback slug on a primary miss. Spike match rate 66.7% naive / ~83.3% with these fixes
  - Respect CodeWeavers' content signal (`use=reference, ai-train=no`): on-demand reference-style lookups + polite caching with a desktop browser UA — not a bulk harvest
**Open questions for planning**:
  - Does the separate Wine rating row (also from 260710-l27) stay on AppleGamingWiki, move to a new source, or is it out of scope?
  - For Steam games the AppID is known — is an AppID-based lookup more reliable than title-slug, and does CodeWeavers expose one?
**Plans**: 3 plans
- [x] 16-01-PLAN.md — CodeWeavers backend lookup service (slugify + JSON-LD parse + soft-404 detection + cacheable-miss contract) + CodeweaversInfo/WikiInfo types
- [x] 16-02-PLAN.md — Wire getInfoFromCodeweavers into getWikiGameInfo (Mac+Linux gate, self-heal, cache)
- [x] 16-03-PLAN.md — Numeric CrossOver rating row + graceful miss state + applegamingwiki decoupling + i18n

## v1.4 Phase Details

### Phase 17: Steam on macOS via CrossOver/Wine
**Goal**: Windows-only Steam games (no native Mac build) install and launch on macOS through the Windows Steam client running inside a GameLib-managed CrossOver/Wine bottle, instead of the native steam:// delegation
**Depends on**: Phase 3 (Steam Game Operations), Phase 7 (is_mac_native platform data)
**Requirements**: MACSTEAM-01, MACSTEAM-02, MACSTEAM-03, MACSTEAM-04, MACSTEAM-05, MACSTEAM-06 (minted during /gsd:plan-phase 17)
**Locked architecture decision** (from discussion 2026-07-10):
  - Run the **Windows Steam client inside a CrossOver/Wine bottle**; install & launch Windows-only games *through* that bottled Steam client so Steam DRM/runtime requirements are satisfied. Reuse GameLib's existing bottle plumbing (`WineSelector`, `CrossoverBottle.tsx`).
  - Do NOT wine-run individual game `.exe`s directly (rejected: only works for DRM-free games, breaks anything needing the Steam runtime).
**Scope notes:**
  - **Reverses Phase 3 GAME-04 for macOS non-native games:** `SteamGame.isNative()` must become per-OS (return `is_mac_native`) instead of hardcoded `true`; the frontend install short-circuit in `state/InstallGameModal.ts:35` must stop firing `steam://install` directly for non-mac-native games on macOS and route them through the bottle flow.
  - **Linux is unchanged** — Windows-only Steam games on Linux continue to delegate to Steam Proton (Phase 3 GAME-04 stays intact there). This phase is macOS-specific.
**Success Criteria** (what must be TRUE):
  1. On macOS, a confirmed Windows-only Steam game (no Mac build) installs and launches through a dedicated GameLib-managed CrossOver/Wine bottle running the Windows Steam client
  2. First Install/Play on such a game with no bottle yet triggers a guided setup + consent flow (bottle create, engine choice, SteamSetup click-through, one-time bottled login) — never a failing native steam://install
  3. `SteamGame.isNative()` is per-OS and confirmed-not-native-gated (platformsCaptured && !is_mac_native) — a not-yet-synced game is NOT force-bottled (D-11)
  4. A bottle-installed game's badge reads from the bottle's own steamapps ACF as a Windows install
  5. The game page shows a "runs via the Windows Steam bottle" indicator
  6. Native-Mac Steam, Windows, Linux (Proton), and GOG/Epic shared-bottle behavior are all unchanged
**Plans**: 7 plans

**Wave 0** — Resolve the one genuine unknown before provisioning:
- [ ] `17-01-PLAN.md` — Spike: confirm the `cxbottle --create` mechanism (Assumption A1) on a real CrossOver install; lock CLI-or-GUI-fallback (MACSTEAM-02) *(checkpoint)*

**Wave 1** — Bottle foundation:
- [ ] `17-02-PLAN.md` — constants, dedicated `steamBottleConfigStore`, `bottle.ts` paths/guards/settings + tests (MACSTEAM-02, MACSTEAM-05)

**Wave 2** *(parallel — no file overlap)*:
- [ ] `17-03-PLAN.md` — `library.ts` bottle-aware ACF scan, Windows-for-bottle platform, source-parameterized pollers + refreshInstallState (MACSTEAM-05)
- [ ] `17-04-PLAN.md` — `bottle.ts` provisioning (create + SteamSetup) + tellBottledSteamTo{Install,Launch,Uninstall} + bottle IPC/preload/main (MACSTEAM-02, MACSTEAM-03, MACSTEAM-04)

**Wave 3** *(parallel — backend games vs frontend)*:
- [ ] `17-05-PLAN.md` — `games.ts` per-OS isNative() (D-11) + bottle routing of install/launch/uninstall + Pitfall-5 guard (MACSTEAM-01, MACSTEAM-04)
- [ ] `17-06-PLAN.md` — Frontend: InstallGameModal guided-setup routing + SteamBottleSetup consent/login UI + D-08 indicator + i18n (MACSTEAM-04, MACSTEAM-06)

**Wave 4** *(checkpoint)*:
- [ ] `17-07-PLAN.md` — Full-suite gate + end-to-end macOS UAT on real CrossOver + scope-fence non-regression + 17-VALIDATION.md sign-off (MACSTEAM-01..06)

**Wave 5** *(gap closure — 2026-07-11 UAT: 2 issues diagnosed)*:
- [ ] `17-08-PLAN.md` — GAP 1 (BLOCKER): `isBottleReady()` real-readiness gate (conf + steam.exe) + mkdir redist before SteamSetup download + re-entrant `provisionBottle` + route install/launch/uninstall on real readiness (MACSTEAM-02, MACSTEAM-04)
- [ ] `17-09-PLAN.md` — GAP 2 (MAJOR): synchronous appdetails platform capture at install/launch entry (no silent native fallthrough) + `steamPlatformsCaptured` GameInfo passthrough reconciling the D-08 indicator with the routing gate (MACSTEAM-04, MACSTEAM-06) *(depends on 17-08)*
- [ ] `17-10-PLAN.md` — GAP 1 (cosmetic): `SteamBottleSetup.scss` styling the guided-setup banner (background/padding/z-index) so it is legible (MACSTEAM-02)

**Wave 6** *(gap closure — 2026-07-11 UAT retest round 2)*:
- [ ] `17-11-PLAN.md` — GAP 3 (MAJOR): install-button / status desync with in-progress bottle setup — derive the game-page Install button + status message + install-click from the SAME `useSteamBottleSetup` store the setup toast reads (new `is.settingUpBottle` single source of truth), so they reflect setup-in-progress instead of "not installed" and clicking Install during setup no longer dead-ends; unblocks UAT tests 4-7 (MACSTEAM-04, MACSTEAM-02)

**Cross-cutting constraints:**
- Zero new npm packages (RESEARCH.md confirmed — all Wine/VDF/download primitives already exist).
- Two Steam libraries must never be conflated: native `defaultSteamPath` vs the bottle's `drive_c/Program Files (x86)/Steam/steamapps`.
- Bottle name → path/argv only through `sanitizeBottleName`; appId → bottled command only through the `/^\d+$/` numeric guard.
- The bottled Steam session is opaque (D-04) — no credential parsing/bridging.
- GAME-05 "Playing" badge parity for bottled games is explicitly out of scope (documented in 17-VALIDATION.md).

**UI hint**: yes

## Progress

**Execution Order:**
v1.0: 1 → 2 → 3 → 4 (complete)
v1.1: 5 → 6 → 7 → 8 → 9
v1.2: 10 → 11 → 12 → 13 → 14 → 15 (Phase 15 depends on Phase 12; can run in parallel with Phase 14)
v1.3: 16 (depends on Phase 7 extra-info rows; feasibility validated by spike 260710-nwb)
v1.4: 17 (depends on Phase 3 Steam ops + Phase 7 platform data; macOS-only CrossOver/Wine runtime)

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
| 10. Humble Auth + Adapter Scaffold | 6/6 | Complete    | 2026-07-05 |
| 11. Library Sync + 5-State Key Model | 5/5 | Complete    | 2026-07-06 |
| 12. Ownership Dedup | 5/5 | Complete    | 2026-07-06 |
| 13. Keys-Waiting + Giftable-Spares Views | 5/5 | Gaps found | - |
| 14. Guided Claim Flow | 8/8 | Complete   | 2026-07-09 |
| 15. Store Overlay + Expiration Alerts | 6/6 | Complete    | 2026-07-10 |
| 16. CrossOver Compatibility Rating (CodeWeavers) | 3/3 | Complete    | 2026-07-10 |
| 17. Steam on macOS via CrossOver/Wine | 9/10 | In Progress|  |
