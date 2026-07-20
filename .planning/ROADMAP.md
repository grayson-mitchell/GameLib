
# Roadmap: GameLib

## Overview

GameLib forks Heroic Games Launcher and adds Steam as a first-class platform alongside Epic, GOG, and Amazon. The roadmap follows the natural dependency chain: Steam authentication is the prerequisite for everything else, library sync requires an authenticated account, game operations require the library to exist, and branding is applied once the core feature set is complete and ready to ship.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### v0.1 — Steam Platform (Shipped 2026-06-29)

- [x] **Phase 1: Steam Authentication** - Users can add, manage, and remove Steam accounts in GameLib (completed 2026-06-27)
- [x] **Phase 2: Steam Library** - Steam games appear in the unified library with metadata and install state (completed 2026-06-28)
- [x] **Phase 3: Game Operations** - Users can launch, install, and uninstall Steam games from GameLib (completed 2026-06-28)
- [x] **Phase 4: Branding** - App is identified and distributed as GameLib, not Heroic (completed 2026-06-28)

### v0.2 — Polish & Enhancements

- [x] **Phase 5: Branding & About Polish** - GameLib presents complete, accurate identity across tray, backend logs, docs, and the release notes link (completed 2026-07-02)
- [x] **Phase 6: Library & Game Status UX** - Library grid surfaces real playtime and install size; a "Playing" badge tracks active Steam sessions (completed 2026-07-03)
- [x] **Phase 7: Game Details Enrichment** - Game details page shows supported platforms and, on macOS, an AppleGamingWiki compatibility rating (completed 2026-07-03, manual UAT pending)
- [x] **Phase 8: New Steam Surfaces** - Steam storefront is browsable in the Stores sidebar tab; Steam games appear in Console mode (completed 2026-07-03)
- [ ] **Phase 9: Quality Gate** - All v0.1 and v0.2 shipped phases pass a formal Nyquist validation pass

### v0.3 — Humble Bundle Integration

- [x] **Phase 10: Humble Auth + Adapter Scaffold** - Users can connect a Humble Bundle account from Manage Accounts with encrypted session persistence and a validated C5 API boundary (completed 2026-07-05)
- [x] **Phase 11: Library Sync + 5-State Key Model** - Full Humble key inventory synced, classified into the 5-state model, and reliably cached with fail-soft behavior (completed 2026-07-06)
- [x] **Phase 12: Ownership Dedup** - Every Humble key cross-referenced against the Steam library; redeemed Steam keys collapse onto their existing Steam library entries (completed 2026-07-06)
- [ ] **Phase 13: Keys-Waiting + Giftable-Spares Views** - Users can see claimable keys sorted by expiration urgency and surface gift links for owned-elsewhere spares
- [x] **Phase 14: Guided Claim Flow** - Users safely reveal and activate Humble Steam keys with structural protection against key waste, accidental re-reveal, and rate-limit lockout (completed 2026-07-08)
- [x] **Phase 15: Store Overlay + Expiration Alerts** - Store surfaces show Humble ownership badges; newly-expiring keys trigger OS notifications (completed 2026-07-10; re-verified 10/10 after gap closure — 15-05 CR-01 badge reachability, 15-06 WR-01/WR-02 composite dedup + i18n, follow-up WR-01 divergence fix baac4527; see 15-VERIFICATION.md)

### v0.4 — Compatibility Data

- [x] **Phase 16: CrossOver Compatibility Rating (CodeWeavers)** - The extra-info Crossover rating comes from live CodeWeavers compatibility data instead of the stale AppleGamingWiki source (completed 2026-07-10)

### v0.5 — Steam macOS Compatibility Runtime

- [x] **Phase 17: Steam on macOS via CrossOver/Wine** - Windows-only Steam games (no native Mac build) install and launch on macOS through the Windows Steam client running inside a GameLib-managed CrossOver/Wine bottle, instead of native steam:// delegation (all 16 plans executed + UAT approved 2026-07-13; completion PAUSED on code-review CR-01 data-loss BLOCKER — see 17-REVIEW.md → /gsd:plan-phase 17 --gaps) (completed 2026-07-13)
- [x] **Phase 19: CrossOver Compatibility Index (macOS)** - Every game in the library carries a CrossOver medal badge and can be filtered by it, served offline from a CI-built index of CodeWeavers' daily dump instead of a per-game live scrape (completed 2026-07-14)

### v0.6 — Aggregated Store Search

- [x] **Phase 20: Aggregated Store Search (CheapShark)** - Search a title once and see what it costs across every store, with "you already own this" badges no price-comparison site can show (completed 2026-07-15)

### v0.7 — Steam Native Install

- [x] **Phase 21: Steam Native Install (depot download)** - Steam games install through an in-process depot download GameLib owns — real progress, real errors, recovery — instead of the opaque steam://rungameid handoff; Steam adopts the install and keeps owning updates (gaps found 2026-07-16 — SNI-01 depot directory/symlink handling failed verification; hardware UAT outstanding; see 21-VERIFICATION.md); gap plan 21-17 added 2026-07-19 to close D-UAT-09 — cancelled/incomplete native install mislabeled Installed/Play; see 21-UAT.md) (completed 2026-07-16)

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

**Plans**: 14 plans (6 + 1 gap closure)

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

### Phase 18: macOS 32-bit detection, badge & CrossOver routing

**Goal:** Detect a Steam game's macOS build architecture and route 32-bit-only mac games to CrossOver/Wine instead of a native install that fails on modern macOS (32-bit dropped in Catalina/2019), surfacing the game's OS/arch as a badge beside the game logo in the left panel.
**Requirements**: MAC32-01, MAC32-02, MAC32-03, MAC32-04
**Depends on:** Phase 17 (bottle routing / `isBottleEligible()` D-11), Phase 7 (platform data)
**Scope** (from /gsd-explore 2026-07-12 — see `.planning/notes/steam-mac-arch-detection-decisions.md`):

  1. **Arch source** *(direction-B pivot, 2026-07-12 — see 18-CONTEXT.md `<execution_update>`; original osarch/PICS approach proved dead by 18-01's appinfo dump)* — read the store-API `mac_requirements.minimum` **min-OS** off the already-fetched `appdetails` response as a pre-install hint: min-OS ≥10.15 (Catalina) ⟹ `'64'` confident; ≤10.14/unparseable/absent ⟹ `'unknown'`. NEVER assert `'32'` pre-install. (PICS `osarch` carries no mac 32/64 signal; `platforms.mac` is only a boolean.)
  2. **Hybrid correctness** — pre-install min-OS gives a `'64'`-or-`'unknown'` hint only; a post-install Mach-O check (`lipo -archs`) is the sole detector that ever asserts `'32'`, re-routing any i386-only binary to CrossOver. Missing signal is NOT assumed 32-bit (avoids Steam's documented false-32-bit-flagging trap — A Hat in Time, Metro: Last Light, etc.).
  3. **Routing** — plug into the existing `isBottleEligible()` / D-11 bottle path (32-bit becomes another reason a mac game is bottle-eligible; routes the Windows depot under CrossOver, not the mac binary).
  4. **UI** — OS logo beside the game logo in the left panel with a "32" mark on 32-bit mac builds; the "32" treatment escalated only on a macOS host.
  - **Out of scope (V1):** non-Steam stores (GOG/Epic mac arch) — the signal is Steam-specific.

**Pre-work:** todo `steam-getproductinfo-appinfo-dump.md` — runtime `getProductInfo` dump to lock the parser casing/nesting before building.
**Plans:** 6/6 plans complete

**Wave 0** — contracts + fixture capture (blocks the parser):

- [x] 18-01-PLAN.md — mac_arch contracts (GameInfo + SteamMetadataCacheEntry) + getProductInfo appinfo dump harness + captured fixtures (MAC32-01)

**Wave 1** — parser/routing + badge (parallel, no file overlap):

- [x] 18-02-PLAN.md — min-OS heuristic (parseSteamMacMinOSVersion + macArchFromMinOS off appdetails mac_requirements) + inline mac_arch derivation in fetchMetadataIfNeeded + isBottleEligible 32-bit OR-branch (MAC32-01, MAC32-02)
- [x] 18-04-PLAN.md — MacArchBadge "32" component beside the game logo, host-OS-gated warning styling (MAC32-04)

**Wave 2** — post-install ground truth (depends on 18-02; shares library.ts/games.ts):

- [x] 18-03-PLAN.md — Mach-O lipo/file ground-truth check + i386 recovery (prompt → forceUninstall → bottle re-install) (MAC32-03)

**Wave 0 (gap closure)** — CR-01 badge data-flow fix (independent, no file overlap with 18-01..04):

- [x] 18-05-PLAN.md — propagate the Mach-O mac_arch:'32' verdict from steamMetadataStore to the frontend GameInfo (verifyMacArchGroundTruth pushes to library Map + frontend; refresh() seeds mac_arch from cachedMeta) + regression test (MAC32-04 gap closure)

---

## v0.2 Phase Details

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

**Goal**: All v0.1 and v0.2 shipped phases are formally validated and any regressions are documented
**Depends on**: Phases 5, 6, 7, 8
**Requirements**: QA-01
**Success Criteria** (what must be TRUE):

  1. A recorded Nyquist validation pass exists covering all v0.1 phases (AUTH-01..05, LIB-01..04, GAME-01..04, BRAND-01)
  2. All v0.2 requirements are spot-checked as part of the validation pass
  3. Any regressions discovered during the pass are documented as issues or resolved before completion

**Plans**: TBD

## v0.3 Phase Details

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

## v0.4 Phase Details

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

## v0.5 Phase Details

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

**Plans**: 16 plans (7 base + 9 gap-closure)

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

- [x] `17-07-PLAN.md` — Full-suite gate + end-to-end macOS UAT on real CrossOver + scope-fence non-regression + 17-VALIDATION.md sign-off (MACSTEAM-01..06)

**Wave 5** *(gap closure — 2026-07-11 UAT: 2 issues diagnosed)*:

- [ ] `17-08-PLAN.md` — GAP 1 (BLOCKER): `isBottleReady()` real-readiness gate (conf + steam.exe) + mkdir redist before SteamSetup download + re-entrant `provisionBottle` + route install/launch/uninstall on real readiness (MACSTEAM-02, MACSTEAM-04)
- [ ] `17-09-PLAN.md` — GAP 2 (MAJOR): synchronous appdetails platform capture at install/launch entry (no silent native fallthrough) + `steamPlatformsCaptured` GameInfo passthrough reconciling the D-08 indicator with the routing gate (MACSTEAM-04, MACSTEAM-06) *(depends on 17-08)*
- [ ] `17-10-PLAN.md` — GAP 1 (cosmetic): `SteamBottleSetup.scss` styling the guided-setup banner (background/padding/z-index) so it is legible (MACSTEAM-02)

**Wave 6** *(gap closure — 2026-07-11 UAT retest round 2)*:

- [ ] `17-11-PLAN.md` — GAP 3 (MAJOR): install-button / status desync with in-progress bottle setup — derive the game-page Install button + status message + install-click from the SAME `useSteamBottleSetup` store the setup toast reads (new `is.settingUpBottle` single source of truth), so they reflect setup-in-progress instead of "not installed" and clicking Install during setup no longer dead-ends; unblocks UAT tests 4-7 (MACSTEAM-04, MACSTEAM-02)

**Wave 7** *(gap closure — 2026-07-11 UAT retest round 3; parallel, disjoint files)*:

- [ ] `17-12-PLAN.md` — GAP-17-PFX86-PATH (BLOCKER): bottle readiness probes only `Program Files (x86)` but the win32 CrossOver template installs Steam to `Program Files` — add a single shared both-root resolver in `bottle.ts` (probe x86 then `Program Files`), route getBottleSteamExePath/getBottleSteamappsDir/isBottleReady/provisionBottle through it so a win32 bottle self-heals to ready and the ACF scan finds manifests; unblocks UAT tests 3-5 (MACSTEAM-04, MACSTEAM-05)
- [ ] `17-13-PLAN.md` — GAP-17-STEAMWEBHELPER-HANG (MAJOR): SteamSetup's "Run Steam" left ticked launches the bottled client whose steamwebhelper self-update hangs — add guided-setup copy/i18n instructing the user to UNTICK "Run Steam" on the installer's final screen (GameLib launches Steam itself), retaining the existing hang recovery hint (MACSTEAM-02, MACSTEAM-03)

**Wave 8** *(gap closure — 2026-07-11 UAT retest round 3; two live-reconciliation defects on the install path)*:

- [ ] `17-14-PLAN.md` — GAP-17-BOTTLE-PROGRESS + GAP-17-BOTTLE-INSTALL-DONE-DESYNC (both MAJOR): the bottle ACF poller derives install percent from ACF byte counts (BytesDownloaded/BytesToDownload, staged fallback, divide-by-zero guarded) and feeds the existing progressUpdate store so the progress bar advances instead of sitting at 0%; and the game-page status derivation reflects the LIVE is_installed so the button flips "Steam installing" → "Play" and the tile stops spinning on completion WITHOUT a nav/focus round-trip. No pause/cancel UI (D-07); backend routing/DM/button-label untouched (MACSTEAM-05, MACSTEAM-04)

**Wave 9** *(gap closure — 2026-07-11 UAT session 4; BLOCKER)*:

- [ ] `17-15-PLAN.md` — GAP-17-CEF-RENDER (BLOCKER): the bottled Steam install dialog renders as a grey 0x0 bar with dead buttons because the CrossOver bottle is 32-bit (`win10` = 32-bit template; modern 64-bit Steam CEF UI cannot composite in a win32 prefix) — change the create template to `win10_64`, add a `bottleWineArch()` cxbottle.conf reader, and make `provisionBottle()` detect + delete/recreate an existing win32 bottle as win64 BEFORE its idempotent guards (preserving Steam account auth: refreshToken/isLoggedIn/userData untouched, only `provisioned` reset); update spike FINDINGS LOCKED-CLI note (MACSTEAM-02, MACSTEAM-04)

**Wave 10** *(gap closure — 2026-07-11 UAT session 5; 3 static/UX code gaps)*:

- [x] `17-16-PLAN.md` — GAP-17-PROVISIONED-FLAG-STUCK + GAP-17-CEF-RECREATE-RUNNING + focus/test-teardown (all in `bottle.ts`): (A) stop persisting `provisioned:false` in the race after the `wait:false` SteamSetup launch and reconcile `provisioned:true` lazily the first time `isBottleReady()` observes a real bottled steam.exe; (B) run a WINEPREFIX-scoped `wineserver -k` before `cxbottle --delete` in the win32→win64 recreate branch so the delete cannot abort while the bottled Steam client is running (scope-fenced to the target bottle's own prefix, never the shared GOG/Epic bottle); (C) make the macOS raise poll loop unref/cancellable so it no longer force-exits the Jest worker, plus a conservative visible-process focus improvement for the installer raiser (MACSTEAM-02, MACSTEAM-04)
- [ ] `17-17-PLAN.md` — GAP CLOSURE (code-review CR-01/WR-01/WR-02): provisionBottle rejects the shared GameLib GOG/Epic bottle name before any destructive op (data-loss guard, D-01) + remove shared-prefix toggle from Steam setup; ACF poller starts only on successful bottle-install dispatch; remove dead always-false `loggedIn` signal (MACSTEAM-02, MACSTEAM-04)

**Cross-cutting constraints:**

- Zero new npm packages (RESEARCH.md confirmed — all Wine/VDF/download primitives already exist).
- Two Steam libraries must never be conflated: native `defaultSteamPath` vs the bottle's `drive_c/Program Files (x86)/Steam/steamapps`.
- Bottle name → path/argv only through `sanitizeBottleName`; appId → bottled command only through the `/^\d+$/` numeric guard.
- The bottled Steam session is opaque (D-04) — no credential parsing/bridging.
- GAME-05 "Playing" badge parity for bottled games is explicitly out of scope (documented in 17-VALIDATION.md).

**UI hint**: yes

---

### Phase 19: CrossOver Compatibility Index (macOS)

**Goal:** Every game in the library carries a CrossOver medal badge and can be filtered by it, served offline from a small CI-built index of CodeWeavers' daily dump — instead of the per-game live HTML scrape, which cannot populate a whole library and guesses its URL from the store's title.
**Depends on:** Phase 16 (the `codeweavers` extra-info row, `CodeweaversInfo` type, and the `wikiGameInfoStore` cache it lands in)
**Requirements**: TBD (mint during /gsd-plan-phase 19)
**Scope** (from /gsd-explore 2026-07-12 — see `.planning/notes/crossover-tie-dump-findings.md`):

  1. **Source** — `https://ftp.codeweavers.com/pub/crossover/tie/crossover.tie.gz`, CodeWeavers' public daily dump of CrossOver's own app-profile DB (3 MB gz / 23.7 MB XML). Confirmed by CodeWeavers as the supported bulk path; there is no compatibility API.
  2. **Index builder in CI** — a GitHub Action pulls the dump daily, filters to `category=Games` with a Mac medal (**2,866 apps**), takes the highest-`cxversion` Mac medal per app, and publishes a **~58 KB gzipped JSON** (`{name, slug, rating, medal, cxversion, steamid?}`). One machine hits CodeWeavers' FTP instead of every install; no 24 MB XML parse on the user's machine. `fast-xml-parser@5.5.7` is already a dependency.
  3. **Medal rule (verified 6/6 against the live site, incl. a negative case)** — `rating(platform) = medal on the highest cxversion for that platform`. The index therefore reproduces today's scraped values **exactly** — a drop-in, no UI change, no two-sources-of-truth risk.
  4. **Lookup: dump-first, scrape-on-miss** — Steam games join on exact `<steamid>` (**1,620 apps**, zero ambiguity); a game absent from the index falls back to today's `getInfoFromCodeweavers()` slug scrape, cached as now. The scraper is retained as a safety net, not deleted.
  5. **UI** — medal badge on the library grid + a filter/sort by rating ("show me what actually runs on my Mac"), and a warning in the install modal for `knownnottowork` titles. Rating spread across the 2,866 is 1054/655/475/347/335 (5→1), so the filter genuinely discriminates.
  6. **Fix D-04 (Phase 16 bug — minor, not a blocker)** — `slugify()` bundles two rules with opposite verdicts. The **apostrophe drop is correct and load-bearing** (site serves `alekhines-gun`, not `alekhine-s-gun`; 118 games, all of which the `naiveSlugify` fallback gets wrong). The **roman→arabic conversion is wrong** (site serves `age-of-empires-ii` / `armored-core-vi-fires-of-rubicon` / `quake-ii`; every arabic form soft-404s; 172 games). CodeWeavers names follow each game's *official* branding — `Grand Theft Auto III` but `Grand Theft Auto 2`, `The Witcher 3`, and both `ARMA II` and `Arma 3` exist as separate apps — and store titles do too, so both sides already agree and normalizing numerals forces them apart. Cost today is a **wasted round-trip, not a lost rating**: the `naiveSlugify` retry recovers all 172. Fix: keep the apostrophe drop, delete the roman conversion, and the primary slug hits first try. Keep this *slug* function distinct from the *matching* key (Q1) — for slugs, verbatim is provably right and normalization provably wrong.
  7. **macOS only** — Windows never needs it; Linux is better served by Proton (already shows ProtonDB + Steam Deck). This also cleans up existing dead weight: `wiki_game_info.ts:61` fetches CodeWeavers on `isMac || isLinux`, but `AppleWikiInfo.tsx:49` only ever renders it on Mac — on Linux it is fetched, cached, and never displayed.

  - **Open question (may cut v1 scope):** non-Steam titles (Epic/GOG/Amazon/Humble) share no ID with the dump and must match on title string — see `.planning/research/questions.md` Q1. A false positive ("won't run" on the wrong game) is worse than a miss, so **v1 may ship Steam-AppID-only badges** with name matching deferred until hit rates are measured against a real library.
  - **Out of scope:** the dump's `<bottletemplate>` / `<flag>` / install-profile data — captured as a seed (`.planning/seeds/crossover-bottle-templates-from-tie-dump.md`), gated on whether CodeWeavers' per-game profiles apply to GameLib's bottled-Steam model.
  - **Consideration — crowd-sourced 32-bit override list (from Phase 18):** Phase 18's post-install Mach-O check (MAC32-03) produces a high-value fact CodeWeavers' dump doesn't carry — "AppID X's mac build is *actually* i386-only, despite Steam not tagging it `osarch=32`." Phase 18 caches this locally as `appId → { arch, source: 'macho' }`. This same offline-index-from-GitHub delivery pattern could serve a community `mac-arch-overrides.json` so the 32-bit verdict becomes a **pre-install** hint for all users (closes the loop back to the "curated list" data source). **Design constraints if pursued:** opt-in per submission only — never silent telemetry (a bare AppID reveals ownership); GitHub-native transport (prefilled issue / copyable JSON snippet + maintainer-reviewed PR into a repo-hosted JSON), no app-side auto-PR; human review gate mitigates poisoning (the list acts pre-install, before any local Mach-O override). Evaluate whether to fold into this phase's index infra or spin a sibling index. See `.planning/notes/steam-mac-arch-detection-decisions.md`.

**Plans:** 8/8 plans complete

Plans:

- [x] TBD (run /gsd-plan-phase 19 to break down) (completed 2026-07-14)

**UI hint**: yes

### Phase 22: Steam Game Families (multiple bottle configurations)

**Goal:** Let a user group macOS Steam games into "families" — each family backed by its own dedicated CrossOver bottle with its own Steam client, login, and Wine/CrossOver version — so games that need a different configuration can get one, instead of every macOS Steam game sharing the single Phase 17 bottle. Extends the single-bottle foundation to N bottles + a game→family assignment model.
**Depends on:** Phase 17 (dedicated Steam bottle foundation — `steam/bottle.ts`, `steamBottleConfigStore`, guided setup) and Phase 18 (bottle-eligibility routing). Independent of the Phase 20/21 lines.
**Requirements**: TBD (mint during /gsd-spec-phase 22 → /gsd-discuss-phase 22)
**Scope:** to be locked by SPEC.md (run /gsd-spec-phase 22).

  - **This is the pragmatic fallback.** The user's *preferred* long-term architecture is a Proton-style native-Steam bridge (one native client, cheap per-game prefixes, one login) — captured as `.planning/seeds/macos-steam-native-bridge-lsteamclient.md`. That is gated on a hard dependency (no macOS `lsteamclient` exists; Valve/CodeWeavers-scale work) and is explicitly NOT this phase. Phase 22 ships per-game configuration isolation now, accepting the one-time-login-per-bottle cost the bridge would eliminate. If the bridge seed ever ships, it likely supersedes much of this phase.
  - **CrossOver-only constraint:** Steam bottling is built on CrossOver's `cxbottle` lifecycle; GPTK/`toolkit` is NOT a working Steam engine (see `.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md`). Families use CrossOver.
  - **Login constraint (accepted):** each family/bottle requires its own one-time Steam login; isolated prefixes cannot share Steam auth (prefix isolation + D-04). One Steam account can only be actively playing in one family at a time; concurrent play needs distinct accounts per family.

**Plans:** 8 plans

Plans:

**Wave 1**

- [ ] 22-01-PLAN.md — Reshape SteamBottleConfig → families/assignments + thread explicit bottleName through bottle.ts primitives (D-01/D-02/D-04/D-05 primitives)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 22-02-PLAN.md — families.ts service: zero-loss migration (D-07/D-08), CRUD, resolveFamilyForApp (D-05), naming rules (D-02/D-03/D-09)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 22-03-PLAN.md — Cross-family ACF reconciliation + poller: scan all families, tag bottleName (D-06, Req 8)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 22-04-PLAN.md — Resolver-first routing in games.ts across all four bottle-eligible methods (D-05, Req 7)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 22-05-PLAN.md — Fold single-bottle IPC into the family group + wire startup migration (D-12/D-07)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 22-06-PLAN.md — Parameterize the guided-setup store/component by bottleName (D-11, Pitfall 4/5, Req 6)

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 22-07-PLAN.md — Install-time family picker + gate both install chokepoints (D-10, Req 3/7)
- [ ] 22-08-PLAN.md — "Steam Families" Settings section: create/rename/set-wine/guarded delete (D-11/D-09, Req 4/5)

**UI hint**: yes

### Phase 24: macOS native Steam bridge (out-of-process steam_api proxy)

**Goal:** Productionize the Proton-style macOS Steam bridge — run bottled Windows Steam games against ONE native macOS Steam client (one login) via an out-of-process `steam_api.dll` shim → TCP → native helper loading `libsteam_api.dylib`, instead of bottling a full Windows Steam client per bottle. This is Phase 22's preferred long-term successor; if shipped it likely supersedes much of the multi-bottle machinery (one native client, cheap per-game prefixes, one login).
**Depends on:** Phase 17 (dedicated Steam bottle foundation — `steam/bottle.ts`) and Phase 22 (per-family bottle model this replaces/simplifies). Independent of the Phase 20/21 depot-install line.
**Requirements:** R1, R2, R3, R4, R5, R6, R7 (locked in 24-SPEC.md; 7 requirements)
**De-risked by spikes 004–008** (`.claude/skills/spike-findings-gamelib/sources/`) — feasibility fully proven on GameLib's stack: every layer incl. the C++ vtable ABI (006) and a real commercial game (Avernum 4) running on the bridge via drop-in `steam_api.dll` (007). The bridge is a compatibility layer, not a DRM gate (008 — CEG enforcement is out of scope). Blueprint + working reference code: `Skill("spike-findings-gamelib")` → `references/macos-steam-bridge.md`; seed `.planning/seeds/macos-steam-native-bridge-lsteamclient.md`; todo `.planning/todos/pending/2026-07-18-productionize-macos-native-steam-bridge-out-of-process-steam.md`.
**Plans:** 2/10 plans executed

Plans:

**Wave 1** (parallel — no file overlap):

- [x] 24-01-PLAN.md — R1 vtable+flat shim generator (D-09 GameLib-authored manifest, D-10 TypeScript, __thiscall/ret N/sret) + committed generated .c/.def (D-07)
- [x] 24-02-PLAN.md — R2 native helper (dlopen libsteam_api.dylib, InitFlat-once, single AppID 480, loopback-only persistent channel) + shared wire protocol.ts
- [ ] 24-03-PLAN.md — R4 zod-validated bundled allowlist (D-01/D-02) with Avernum 4 + Hoard
- [ ] 24-04-PLAN.md — NEW CrossOver-only bridge bottle (D-08) with no SteamSetup (R6 no-steam.exe) + getBridgeBottleSettings

**Wave 2** (parallel):

- [ ] 24-05-PLAN.md — R3 objdump import scan + automatic per-bottle shim placement (needs 24-01, 24-04)
- [ ] 24-06-PLAN.md — R2/R7 shared-helper lifecycle (D-03) + ensureBridgeHelperReady readiness signal (D-06) + steamBridgeHelperPath (needs 24-02)
- [ ] 24-07-PLAN.md — R5 packaging: pinned zig download + clang helper + zig cc PE shim into public/bin/${arch}/darwin (needs 24-01, 24-02)

**Wave 3**:

- [ ] 24-08-PLAN.md — R4/R7 games.ts routing (isBridgeEligible, install/launch/uninstall bridge branches, direct-.exe launch, readiness gate, D-05 signal) (needs 24-03/04/05/06)

**Wave 4**:

- [ ] 24-09-PLAN.md — R7/D-05 frontend fallback dialog seam + D-11 on-demand provision (needs 24-08)

**Wave 5** (human-HW-gated, autonomous:false):

- [ ] 24-10-PLAN.md — R5/R6 packaged-build + Avernum 4 + Hoard playable single-player acceptance → 24-UAT.md (needs 24-07/08/09)

**UI hint**: yes

## v0.6 Phase Details

### Phase 20: Aggregated Store Search (CheapShark)

**Goal:** From a new left-sidebar entry, search a title once and see what it costs across every store — with **"you already own this on GOG/Steam/Epic/Amazon/Humble"** badges that no price-comparison website can show. Ends the "open six tabs to find the cheapest key" problem.
**Depends on:** Phase 12 (ownership dedup — supplies the title matcher). Independent of the v0.5 macOS/CrossOver line; can run in parallel.
**Requirements:** STORESEARCH-01 .. STORESEARCH-08 (minted during /gsd-discuss-phase 20 from locked D-01..D-14)
**Scope** (from /gsd-explore 2026-07-12 — see `.planning/notes/aggregated-store-search-foundations.md`; **decisions locked in `20-CONTEXT.md` supersede this scope where they differ — notably D-01 on matching and D-08 on the click destination**):

  1. **Sidebar entry** — a sibling of the existing `/discounts` "Deals" item (`SidebarLinks/index.tsx:199`). Explicitly a **top-level left-menu destination**, not a tab nested inside Deals.
  2. **Provider interface + CheapShark adapter** — CheapShark is the prototype source: public JSON, no API key, no approval. `steamAppID` on its game results is the key asset.
  3. **Owned-badge — the headline feature.** Steam-owned titles join **exactly** on `steamAppID` (no fuzzy matching). Epic/GOG/Amazon/Humble fall back to the title matcher generalized out of `src/backend/humble/dedup.ts` (`normalizeTitle` + length-sensitive `titleSimilarity` at 85% + `isDlcFalsePositiveRisk`). **Generalize that module — do not write a second matcher.** Its `humble`/`steam` parameter names are a historical artifact; the logic is store-agnostic.
  4. **Buy = handoff.** Results link out via `shell.openExternal()` to the store page; the user buys in their browser; the **next library sync picks the game up**. No payment handling, no purchase callback. This is settled, not a compromise.
  5. **USD-only disclosure.** CheapShark reports **USD only** — the UI must say so plainly. A non-US user reading unlabelled `$` figures as their own currency gets a *wrong* "cheapest" verdict, which is worse than showing no verdict.

  - **Known, consciously-accepted debt:** CheapShark's USD-only limitation means the provider interface is being designed against a source weaker than the app around it (`Discounts` already models `{ countryCode, locale, currencyCode }` correctly). The interface **will** be reshaped when IsThereAnyDeal lands. Contain USD-only inside the adapter — never leak it into shared types, IPC payloads, or the owned-badge logic. Migration cost scoped in `.planning/research/questions.md` **Q2**.
  - **Risk — false-positive owned-badges.** Telling a user they already own a game they don't talks them out of a purchase they wanted. Bias the fuzzy threshold conservative; a miss is cheaper than a wrong badge. Same asymmetry as Phase 19 (exact on Steam ID, fuzzy on everything else) — see Q1.
  - **Out of scope:** the aggregated *discovery/browse* surface (multi-provider Deals). Captured as `.planning/seeds/aggregated-discovery-multi-provider-deals.md`, deliberately gated on this phase's provider interface surviving one real consumer first.

**Plans:** 7/7 plans complete

Plans:

- [x] 20-01-PLAN.md — Lift the shared fuzzy title matcher into common/matching/titleMatch.ts; repoint dedup.ts/constants.ts (D-02)
- [x] 20-02-PLAN.md — Provider-neutral storeSearch types (explicit currencyCode, D-13) + storeID→Runner map + IPC channel contract
- [x] 20-03-PLAN.md — resolveStoreSearchBadges(): exact-Steam / fuzzy-GOG-Epic-Amazon / coexisting key-available (D-01/D-04/D-06/D-07)
- [x] 20-04-PLAN.md — CheapShark backend adapter + IPC handlers + preload (USD contained; verbatim dealID redirect, Pitfall 1)
- [x] 20-05-PLAN.md — StoreSearchRow + lazy StoreSearchBreakdown + `$X USD` formatter + external buy handoff
- [x] 20-06-PLAN.md — Container: debounce/min-3/generation-cancel hook, badge-once resolution, 3 fail-soft states, sidebar + route + i18n
- [x] 20-07-PLAN.md — Full-suite gate + live end-to-end human verification + 20-VALIDATION.md sign-off

**Wave 1** (parallel, no file overlap): 20-01, 20-02
**Wave 2** (parallel): 20-03 (needs 20-01), 20-04 (needs 20-02)
**Wave 3**: 20-05 (needs 20-02, 20-04)
**Wave 4**: 20-06 (needs 20-03, 20-04, 20-05)
**Wave 5** (checkpoint): 20-07 (needs 20-06)

**UI hint**: yes

### Phase 23: Steam full-ownership install (StateFlags=4)

**Goal:** GameLib authors a `StateFlags=4` (FullyInstalled) appmanifest that the Steam client trusts with no verify pass and no re-download — GameLib owns the complete first install (and resume), Steam does nothing until updates. Productionizes the spike-003 env-gated proof: threads the current public `buildid`, writes consistent completion bytes, and applies `EDepotFileFlag` file modes so the install is genuinely launch-ready, not just byte-correct. Falls back to Phase 21's `1026` verify-handoff only when completeness can't be proven.
**Requirements**: REQ-23-01, REQ-23-02, REQ-23-03, REQ-23-04, REQ-23-05, REQ-23-06, REQ-23-07 (minted 2026-07-17 from D-01..D-07; see `.planning/REQUIREMENTS.md` §Phase 23)
**Depends on:** Phase 21 (depot download — per-chunk sha1 gate, `depot.ts`/`manifest.ts`, the env-gated `GAMELIB_SPIKE_STATEFLAGS4` code). NOT Phase 22 (independent macOS-bottles line). Corrected 2026-07-17.
**De-risked by spike 003** (`.planning/spikes/003-stateflags4-full-ownership/`) — VALIDATED on real HW: Steam trusts a GameLib `StateFlags=4` given StateFlags=4 + `BytesToDownload==BytesDownloaded==SizeOnDisk` (non-zero) + current public buildid + correct InstalledDepots + executable file-mode bit. Supersedes the locked "StateFlags=1026, never 4" rule and reverses D-2 for first install.
**Plans:** 5 plans (3/5 executed; 23-04 awaiting D-07 hardware checkpoint; 23-05 gap plan closes the Gate 1 multi-depot progress flip-flop)

Plans:
**Wave 1**

- [x] 23-01-PLAN.md — EDepotFileFlag file-mode fidelity (ReadOnly/Hidden + Windows attrib.exe) [Wave 1, REQ-23-06]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 23-02-PLAN.md — completeness gate + buildid threading + de-gate StateFlags=4, keep 1026 fallback, no new toggle [Wave 2, REQ-23-01/02/03]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 23-03-PLAN.md — sha1-gated resume/reconciliation + startup-resume rebuild (no silent Steam-in-CrossOver auto-open) [Wave 3, REQ-23-04/05]

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 23-04-PLAN.md — D-07 real-hardware validation gate (multi-depot, hard-DRM, interrupt-resume; macOS-first) [Wave 4, REQ-23-07] — task 1/2 done (23-UAT.md authored, commit c1dc0fe6); task 2/2 blocked on human-verify checkpoint

**Wave 5** *(gap closure — blocked on Wave 4 code paths)*

- [ ] 23-05-PLAN.md — GAP: single-flight guard on installDepotDownload (one download/appId, monotonic progress) + pause/resume no-stacking + stale-1026 phantom-install guard; re-run 23-UAT.md Gate 1 [Wave 5, REQ-23-07]

### Phase 25: Steam depot download multi-host fan-out (throughput)

**Goal:** Raise Steam native-depot download throughput toward parity with the real Steam client by spreading chunk work across the multiple healthy CDN hosts Steam already returns, instead of confining nearly all traffic to one host.

**Context (from resolved debug `steam-install-slow-start`, Thread C):** With decode now clean (`err=0`, zstd fix landed in Phase 23-adjacent bundle), the remaining slowness (~1.5–2.9 MiB/s vs Steam's ~2.5× faster) is a client-side fan-out gap: `getContentServers` returns ~6 healthy hosts, but `pickHost` sends every attempt-0 to the single top-scored host and only rotates on failure — so with nothing failing, all ~32 chunk workers converge on ONE host (`avgMs~360`, `wl=17` in-flight). Fix direction: fan attempt-0 across top-N healthy hosts (weighted by health/load), preserving the failure-driven rotation and stall/abort semantics.

**Acceptance:** before/after throughput measurement on real hardware (macOS/Apple Silicon). Diagnostic: `grep "chunk-stream stats" ~/Library/Logs/gamelib/gamelib.log` — expect `hosts>1` sustained and a materially higher `downSpeedMiBs`. Must not regress decode correctness, the host-health scoring/blacklist, stall-aware retry, or cancel/abort.

**Relevant code:** `pickHost` / host-health selection in `depot.ts`, `decompress.ts`, `hostHealth`. Full detail in memory `steam-install-slow-start-outcome` and `.planning/debug/resolved/steam-install-slow-start.md`.

**Optional bundled cleanup:** excise the dormant CDN-auth phantom machinery (`cdnAuth.ts` + `usetokenauth`/`wantsCdnAuthToken` hunks entangled in `depot.ts`/`decompress.ts`) — proven-unnecessary dead code shipped dormant in the prior bundle; needs its own tsc/test pass if included.

**Requirements:** MHOST-01, MHOST-02, MHOST-03, MHOST-04 (minted 2026-07-19; see `.planning/REQUIREMENTS.md` § Phase 25 Requirements)
**Depends on:** Phase 24
**Plans:** 3/3 plans complete

Plans:
**Wave 1**

- [x] 25-01-PLAN.md — pickHost attempt-0 top-N fan-out + TOP_N_FANOUT constant + unit tests (MHOST-01/03)

**Wave 2** *(blocked on Wave 1)*

- [x] 25-02-PLAN.md — thread worker-slot through fetchChunk + both concurrency pools + integration test (MHOST-02/03)

**Wave 3** *(blocked on Wave 2 — hardware checkpoint)*

- [x] 25-03-PLAN.md — real-hardware before/after throughput measurement (checkpoint:human-verify) (MHOST-04)

---

## v0.7 Phase Details

### Phase 21: Steam Native Install (depot download)

**Goal:** Steam games install through an in-process depot download GameLib owns — with real progress, real error surfaces, and recovery — instead of the opaque `steam://rungameid` handoff that returns nothing. GameLib downloads depot content over `steam-user`'s authenticated CM connection, writes an `appmanifest_{appId}.acf` the Steam client **adopts**, and launch stays with `steam://` so DRM keeps working. This closes the "Steam is the only store with no install progress and invisible failures" gap.
**Depends on:** Phase 3 (Steam game operations — install/launch entry points, `state/InstallGameModal.ts`) and Phase 1 (Steam auth — the `steam-user` CM session this reuses). Independent of the v0.5 macOS/CrossOver line and of Phase 20.
**Requirements:** SNI-01, SNI-02, SNI-03, SNI-04, SNI-05, SNI-06, SNI-07, SNI-08 (minted 2026-07-15 from locked D-01..D-15; see `.planning/REQUIREMENTS.md` §v0.7)
**De-risked by spikes 001 + 002** (`.planning/spikes/`) — both VALIDATED against a real machine:

  1. **`.acf` adoption works** (spike 001). Steam verified a GameLib-written manifest, flipped `StateFlags` `1026` → `4` itself, downloaded **zero bytes**, and the game launched via `steam://rungameid`. The full model — GameLib writes the manifest → Steam adopts it → Steam launches — holds end to end.
  2. **In-process depot download works** (spike 002). Downloaded a full depot via `steam-user`, **171/171 files byte-identical** to Steam's own download. Pure-JS LZMA is sufficient — **no native module required** — so the C# DepotDownloader wrapper (Option B) is rejected.

**Locked decisions** (full detail + rationale in `.planning/spikes/MANIFEST.md` and `.planning/notes/steam-depot-install-architecture.md`):

  - **D-1 — Launch stays with Steam.** Depot download bypasses the download, not the DRM. Files on disk do not make a DRM-wrapped game launch; `steam://rungameid` after adoption does.
  - **D-2 — Steam owns updates; GameLib owns only the first install.** No delta-patching, no resume, no integrity repair — deliberately scoped out. Any move to "GameLib owns updates" re-opens the whole build-vs-bundle question.
  - **Write `StateFlags = 1026`, never `4`.** `1026` asks Steam to verify-and-repair; `4` asserts a byte-perfect download and ships broken installs when we're wrong.
  - **Depot selection = package-level ownership, two channels** (owned `depotids`, or a `dlcappid` whose app is owned), plus DLC-app depot enumeration (`extended.listofdlc`) and per-language filtering. Verified 11/11 against real installs. Rule in `001-acf-adoption/select.mjs`.
  - **Reimplement `steam-user`'s two broken helpers.** Its `getManifest()` truncates filenames and `downloadChunk`/`downloadFile` throw; use `getRawManifest()` + our own decrypt/decompress (~100 lines, `002-steam-user-depot-download/steam-depot.mjs`). Retry chunks across content servers (~16% fail under concurrency).
  - **64-bit IDs are strings end to end.** `@node-steam/vdf.parse()` rounds manifest GIDs past `MAX_SAFE_INTEGER` — the exact way to cause a forced re-download.

  - **Pre-work carried in from the spikes:** audit GameLib's existing `@node-steam/vdf` call sites for 64-bit exposure; confirm the launch path once against a known hard-DRM title (WazHack was not confirmed DRM-wrapped).
  - **Untested at spike scale:** large (50 GB) games, streaming to disk (spike assembled files in RAM), and resume-after-interruption UX.

**Plans:** 17/17 plans complete

Plans:
**Wave 1**

- [x] 21-01-PLAN.md — Lift spike primitives: crypto/decompress chunk pipeline + two-channel depot selection (SNI-01)
- [x] 21-02-PLAN.md — Hand-templated 1026 ACF writer, atomic, 64-bit-string-safe (SNI-02)
- [x] 21-03-PLAN.md — D-13 opt-in setting: toggle + single backend accessor (SNI-07)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 21-04-PLAN.md — depot.ts orchestrator: selection + multi-depot manifest fetch + summed real total (SNI-01/03)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 21-05-PLAN.md — depot.ts streaming download loop + path containment + SHA1 + throttled progress + cancel (SNI-01/03)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 21-06-PLAN.md — depot.ts single 1026 finalize (cancel/fail/success) + error classes + Retry reconciliation (SNI-04)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 21-07-PLAN.md — SteamGame.install()/stop() opt-in branch + seams; OFF path unchanged (SNI-07)
- [x] 21-08-PLAN.md — library.ts D-05 startup finalize-then-watch; poller-unchanged regression guard (SNI-04)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 21-09-PLAN.md — Install-location targeting: registered-library default + override picker (SNI-05)
- [x] 21-11-PLAN.md — D-15 bottle depot-download (os:'windows' into the CrossOver bottle) (SNI-08)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 21-10-PLAN.md — Guided native Steam-client install (D-10) + prompt-to-launch (D-11) (SNI-06) — code complete (2026-07-16); Task 3 human-verify deferred to 21-12 UAT

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 21-12-PLAN.md — Manual real-machine validation: adoption/hard-DRM, streaming@scale, multi-depot, bottle adoption (SNI-01/04/08)

**Wave 9** *(gap closure — verifier gaps_found 2026-07-16; disjoint files, both parallel)*

- [x] 21-13-PLAN.md — CR-01: downloadSingleFile branches on Directory/Symlink flags (real dir/symlink, containment-checked LinkTarget) + WR-02 zero-chunk error + WR-03 percent clamp + regression tests (SNI-01/04/08)
- [x] 21-14-PLAN.md — WR-01: VDF-escape name/installdir in the .acf writer + WR-04: harden sanitizeInstalldir (quotes/control/drive-relative) (SNI-02/05)

**Wave 10** *(gap closure — real-hardware UAT findings 2026-07-16; disjoint files, both parallel)*

- [x] 21-15-PLAN.md — D-UAT-03: worker_threads LZMA decompression pool (off-main-thread decode, transferable ArrayBuffers, pure-JS lzma, integrity gate preserved, inline fallback, packaged-build worker wiring) (SNI-01/03)
- [x] 21-16-PLAN.md — D-UAT-04: UX + observability batch — poll-time "Restart Steam to finish" hint, cleaner Steam status copy, depot-selection logging (SNI-03/06)

**UI hint**: yes

## Progress

**Execution Order:**
v0.1: 1 → 2 → 3 → 4 (complete)
v0.2: 5 → 6 → 7 → 8 → 9
v0.3: 10 → 11 → 12 → 13 → 14 → 15 (Phase 15 depends on Phase 12; can run in parallel with Phase 14)
v0.4: 16 (depends on Phase 7 extra-info rows; feasibility validated by spike 260710-nwb)
v0.5: 17 (depends on Phase 3 Steam ops + Phase 7 platform data; macOS-only CrossOver/Wine runtime) → 18 (depends on Phase 17 bottle routing + Phase 7 platform data)
     19 (depends on Phase 16 only — independent of 17/18, can run in parallel)
v0.6: 20 (depends on Phase 12 ownership dedup only — independent of the v0.5 macOS/CrossOver line, can run in parallel)
v0.7: 21 (depends on Phase 3 Steam ops + Phase 1 auth; de-risked by spikes 001+002 — .acf adoption + in-process depot download both VALIDATED)

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
| 17. Steam on macOS via CrossOver/Wine | 17/17 | Complete    | 2026-07-13 |
| 18. macOS 32-bit detection, badge & CrossOver routing | 6/6 | Complete    | 2026-07-13 |
| 19. CrossOver Compatibility Index (macOS) | 8/8 | Complete    | 2026-07-14 |
| 20. Aggregated Store Search (CheapShark) | 7/7 | Complete    | 2026-07-15 |

---

### Phase 26: Steam Key Redemption

**Goal:** Let a user redeem a Steam product key into their own Steam library **from inside GameLib**, without ever typing it into the Steam client. Starts with a manual entry point — paste any loose Steam key (Fanatical / GMG / physical box / gifted) → GameLib activates it via `steam-user.redeemKey()` on the already-authenticated CM session → the newly-owned game appears in the library. Then generalizes to any-store loose keys, and (as a follow-on) chains Humble reveal → redeem so revealed Steam keys land in Steam automatically.
**Status:** Surfaced by /gsd-explore 2026-07-20; registered as a phase 2026-07-20. Manual entry point is the first vertical slice (user has spare test keys to verify against).
**Depends on:** Phase 1 (Steam auth — reuses the `steam-user` CM session in `src/backend/storeManagers/steam/user.ts`) and Phase 2/12 (library ownership + `recomputeOwnership()` refresh, ownership dedup). The Humble auto-redeem increment additionally depends on Phase 14 (`doRevealKey`).
**Grounding verified 2026-07-20** (see `.planning/notes/steam-key-redemption-reveal-vs-activation.md`):

  - `steam-user@5.3.0` exposes `redeemKey(key) → { purchaseResultDetails: EPurchaseResult, packageList }` (typed at `@types/steam-user/index.d.ts:790`). Activates on the logged-in account, no client UI.
  - `steam://open/activateproduct` takes **no key argument** — the protocol handoff cannot pre-fill a key, so `redeemKey` is the only real path.
  - GameLib does **not** redeem today: no `redeemKey` in `src/`; Humble `doRevealKey` only *reveals* (Humble-side), never activates. "revealed ≠ activated."

**Key risk / open question (Q6 in `.planning/research/questions.md`):** Steam rate-limits invalid-key activations at the *account* level — the manual entry point needs guardrails (throttle, format-validate before send, surface cooldown state), not a raw passthrough. Full `EPurchaseResult` failure taxonomy to be pinned before planning.

**Increments:**

  1. **Manual entry point (first slice)** — UI to paste one Steam key → backend `redeemKey` wrapper in `user.ts` → branch on `EPurchaseResult` → on success show `packageList` name + trigger `recomputeOwnership()`. Guardrail against the invalid-key cooldown.
  2. **Any-store loose keys** — same path, generalized entry surface.
  3. **Auto-redeem revealed Humble keys** — chain reveal → redeem (Steam-platform rows only). See `.planning/seeds/humble-auto-redeem-into-steam.md`.

**Requirements:** REQ-26-01 .. REQ-26-06 (minted 2026-07-20 from SPEC.md REQ1-REQ6: entry point / backend wrapper+IPC / format validation / success outcome / non-success outcomes / store-aware-ready)
**Plans:** 5/5 plans complete

Plans:
**Wave 1**

- [x] 26-01-PLAN.md — Backend redeemKey wrapper + EPurchaseResult classifier + shared types + tests (handles reject-on-failure; 8-value enum -> 4 buckets)
- [x] 26-02-PLAN.md — Client-side format validator (light-touch pure fn, not 5-5-5) + test

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 26-03-PLAN.md — redeemSteamKey IPC three-file wiring (ipc.ts / preload / main.ts handler)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 26-04-PLAN.md — Context toggle + RedeemSteamKeyDialog modal (inline outcomes, success name, refreshLibrary, graceful View-in-library) + App mount

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 26-05-PLAN.md — Login-gated "Redeem a Steam key" sidebar item under Settings + gating test
