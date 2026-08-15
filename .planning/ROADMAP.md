
# Roadmap: GameLib

## Overview

GameLib forks Heroic Games Launcher and adds Steam as a first-class platform alongside Epic, GOG, and Amazon. The roadmap follows the natural dependency chain: Steam authentication is the prerequisite for everything else, library sync requires an authenticated account, game operations require the library to exist, and branding is applied once the core feature set is complete and ready to ship.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

**v0.1 — Steam Platform (Shipped 2026-06-29)**

- [x] **Phase 1: Steam Authentication** - Users can add, manage, and remove Steam accounts in GameLib (completed 2026-06-27)
- [x] **Phase 2: Steam Library** - Steam games appear in the unified library with metadata and install state (completed 2026-06-28)
- [x] **Phase 3: Game Operations** - Users can launch, install, and uninstall Steam games from GameLib (completed 2026-06-28)
- [x] **Phase 4: Branding** - App is identified and distributed as GameLib, not Heroic (completed 2026-06-28)

**v0.2 — Polish & Enhancements**

- [x] **Phase 5: Branding & About Polish** - GameLib presents complete, accurate identity across tray, backend logs, docs, and the release notes link (completed 2026-07-02)
- [x] **Phase 6: Library & Game Status UX** - Library grid surfaces real playtime and install size; a "Playing" badge tracks active Steam sessions (completed 2026-07-03)
- [x] **Phase 7: Game Details Enrichment** - Game details page shows supported platforms and, on macOS, an AppleGamingWiki compatibility rating (completed 2026-07-03, manual UAT pending)
- [x] **Phase 8: New Steam Surfaces** - Steam storefront is browsable in the Stores sidebar tab; Steam games appear in Console mode (completed 2026-07-03)
- [ ] **Phase 9: Quality Gate** - All v0.1 and v0.2 shipped phases pass a formal Nyquist validation pass (no directory — never started)

**v0.3 — Humble Bundle Integration**

- [x] **Phase 10: Humble Auth + Adapter Scaffold** - Users can connect a Humble Bundle account from Manage Accounts with encrypted session persistence and a validated C5 API boundary (completed 2026-07-05)
- [x] **Phase 11: Library Sync + 5-State Key Model** - Full Humble key inventory synced, classified into the 5-state model, and reliably cached with fail-soft behavior (completed 2026-07-06)
- [x] **Phase 12: Ownership Dedup** - Every Humble key cross-referenced against the Steam library; redeemed Steam keys collapse onto their existing Steam library entries (completed 2026-07-06)
- [x] **Phase 13: Keys-Waiting + Giftable-Spares Views** - Users can see claimable keys sorted by expiration urgency and surface gift links for owned-elsewhere spares (5/5 plans executed 2026-07-08; recorded "Gaps found" in the prior progress table — verify gap-closure status against 13-*/13-VALIDATION.md before treating as clean)
- [x] **Phase 14: Guided Claim Flow** - Users safely reveal and activate Humble Steam keys with structural protection against key waste, accidental re-reveal, and rate-limit lockout (completed 2026-07-09)
- [x] **Phase 15: Store Overlay + Expiration Alerts** - Store surfaces show Humble ownership badges; newly-expiring keys trigger OS notifications (completed 2026-07-10; re-verified 10/10 after gap closure — 15-05 CR-01 badge reachability, 15-06 WR-01/WR-02 composite dedup + i18n, follow-up WR-01 divergence fix baac4527; see 15-VERIFICATION.md)

**v0.4 — Compatibility Data**

- [x] **Phase 16: CrossOver Compatibility Rating (CodeWeavers)** - The extra-info Crossover rating comes from live CodeWeavers compatibility data instead of the stale AppleGamingWiki source (completed 2026-07-10)

**v0.5 — Steam macOS Compatibility Runtime**

- [x] **Phase 17: Steam on macOS via CrossOver/Wine** - Windows-only Steam games (no native Mac build) install and launch on macOS through the Windows Steam client running inside a GameLib-managed CrossOver/Wine bottle, instead of native steam:// delegation (all 17 plans executed + UAT approved; completion PAUSED on code-review CR-01 data-loss BLOCKER, closed by gap plan 17-17) (completed 2026-07-13)
- [x] **Phase 18: macOS 32-bit detection, badge & CrossOver routing** - Detects a Steam game's macOS build architecture and routes 32-bit-only mac games to CrossOver/Wine instead of a native install, with an OS/arch badge beside the game logo (completed 2026-07-13, UAT 5/5)
- [x] **Phase 19: CrossOver Compatibility Index (macOS)** - Every game in the library carries a CrossOver medal badge and can be filtered by it, served offline from a CI-built index of CodeWeavers' daily dump instead of a per-game live scrape (completed 2026-07-14)

**v0.6 — Aggregated Store Search**

- [x] **Phase 20: Aggregated Store Search (CheapShark)** - Search a title once and see what it costs across every store, with "you already own this" badges no price-comparison site can show (completed 2026-07-15)

**v0.7 — Steam Native Install**

- [x] **Phase 21: Steam Native Install (depot download)** - Steam games install through an in-process depot download GameLib owns — real progress, real errors, recovery — instead of the opaque steam://rungameid handoff; Steam adopts the install and keeps owning updates (17/17 plans, code-review clean, secure-phase 41/41 threats_open:0; hardware UAT items deferred) (completed 2026-07-20)
- [ ] **Phase 23: Steam full-ownership install (StateFlags=4)** - GameLib authors a StateFlags=4 (FullyInstalled) manifest so Steam does zero verify/download work on first install (in progress — 6/10 plans executed [23-01,02,03,04,05,06]; 23-04's SUMMARY written retroactively 2026-08-14, its Task 2 closed via the "failures documented for gap closure" branch; gaps G-23-01/G-23-02 open — native install applies no execute bits, KCD2 Blocked-depot-key aborts whole install; Gate 2 CONDITIONAL PASS only after a manual `chmod +x`; Gate 3 not yet run; REQ-23-07 stays open; see 23-TRACE.md)
- [x] **Phase 24: macOS native Steam bridge (out-of-process steam_api proxy)** - Out-of-process steam_api shim so bottled Windows-only Steam games run against ONE native macOS Steam client instead of a bottled Windows Steam client per bottle (16/17 plans — 24-10, the human-HW packaged-build acceptance checkpoint, has no SUMMARY.md; Gates 0/1/2/3 PASS on real hardware per 24-UAT.md and gap cycles 24-11..24-17 closed the shim-overwrite/install-poll/launch/sync clusters; Gate 4 (Hoard) explicitly out of scope — bridge proxies only ISteamUser + ISteamFriends; superseded/parked the multi-bottle-families phase, see `## Parked / Superseded Phases`)
- [x] **Phase 25: Steam depot download multi-host fan-out (throughput)** - Raises native-depot download throughput toward Steam-client parity by fanning chunk attempts across multiple healthy CDN hosts instead of one (completed + hardware-verified 2026-07-19: hosts=3, ~10 MiB/s vs 1.5–2.9 MiB/s baseline)
- [x] **Phase 26: Steam Key Redemption** - Users can redeem a loose Steam product key into their own Steam library from inside GameLib via steam-user's redeemKey(), without ever opening the Steam client (completed 2026-07-20)

**v0.8 — Tauri Shell** (walking-skeleton spike; STATE.md's `milestone:` frontmatter has not yet been advanced past v0.7 as of 2026-07-21 — see note under Phase 27)

- [x] **Phase 27: Tauri Shell Walking Skeleton** - Rust/Tauri v2 shell + stdio JSON-RPC sidecar + renderer bridge proven end-to-end against the real Steam store-manager code (read flow + launch flow), with a SEAM.md ported-vs-stubbed boundary for the incremental port (completed 2026-07-21, 5/5 plans)
- [x] **Phase 28: Tauri keyring (real safeStorage)** - Swap the plaintext-passthrough stub for spike 011's `keyring` crate path so the sidecar stores its token in the real OS Keychain (keyring-native, not OSCrypt-compatible — see D-01; does NOT unblock Phase 27 UAT 2/3 — see D-03). **Must land before any token-writing channel is wired** (shared store — the stub would silently sign the user out of the real app) (completed 2026-07-22)
- [x] **Phase 29: Tauri store layer** - Grow the sidecar store past the two skeleton stores to cover the ~18 files routing through `electron_store.ts`, so later slices have config to read (completed 2026-07-22)
- [x] **Phase 30: IPC re-plumb slice 1 (install/uninstall/update-check)** - First user-facing domain slice of the ~217 unported endpoints, following SEAM.md's incremental-port checklist (completed 2026-07-22)
- [x] **Phase 31: IPC re-plumb slice 2 (settings/config)** - Settings/config cluster plus the Tauri `dialog` plugin surface those flows need (3 plans executed 2026-07-23; verification gaps_found — gap plan 31-04 added to close CR-01 dialog auto-confirm blocker + WR-01 path-traversal, de-wiring showMessageBox to a safe resolved sentinel ({response:-1}, never rejects) with real multi-button behavior deferred to Phase 33) (completed 2026-07-23)
- [x] **Phase 32: IPC re-plumb slice 3 (downloads/queue)** - Download-manager/queue cluster; exercises the push-notification path at real volume (completed 2026-07-23)
- [x] **Phase 33: Tauri lifecycle cluster** - Real behavior for the 44-file `app`/`dialog`/window/`Notification`/tray/protocol/updater cluster; scope the `session`/`powerSaveBlocker` parity gaps explicitly (completed 2026-07-23)
- [x] **Phase 34: Tauri packaging (Windows/Linux)** — COMPLETE 2026-07-25. Cross-platform builds, signing, notarization, and an auto-update feed pointed at the GameLib fork — 17/17 plans executed (gap cycle 3 all closed: 34-16 closed GAP-A, the macOS codesign-on-empty-secret blocker from live run 30084918812; 34-17 closed GAP-B's code half, pnpm verify:updater-key; 34-18 closed GAP-B's human half via Branch B — regenerated + re-enrolled matched updater keypair, new key id 9A02F7E0C9FC04C7). **Live tag-push gate PASSED (REQ-34-09): run [30123449346](https://github.com/grayson-mitchell/GameLib/actions/runs/30123449346) on commit 006a900a — all 4 legs green, draft+prerelease release with all artifacts + latest.json, macOS+Windows signing gracefully skipped, arm64 SEA sidecar ran Node-free.** Secure-phase DONE (34-SECURITY.md, 42/42 threats closed, threats_open: 0). One build-blocking merge slip fixed en route (paths.ts missing `resolve` import, commit 006a900a).
- [ ] **Phase 35: Electron cutover** - Remove the Electron build; the one phase that intentionally breaks the additive/reversible invariant, so it runs last

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

- [x] `07-02-PLAN.md` — Fix Steam platform data: self-healing supported-platform re-fetch (GAP 1), host-derived installed platform (GAP 2), icon spacing (GAP 3)

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

**Plans**: TBD — no directory under `.planning/phases/`; never started

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

- [x] `11-01-PLAN.md` — Types (HumbleKey/HumbleKeyState/cache-entry/sync-state) + IPC types, three-store split (library/sync/revealed), constants, pure 5-state `classify.ts` + tests, tightened OrderDetailSchema (HSYNC-01/02/03)

**Wave 2** *(blocked on 11-01)*:

- [x] `11-02-PLAN.md` — `library.ts` sync orchestration (skip-terminal partition, bounded concurrency pool, per-order commit, fail-soft, cooldown) + `disconnect()` store-survival split + tests (HSYNC-01/02/03/04)

**Wave 3** *(blocked on 11-02)*:

- [x] `11-03-PLAN.md` — `humble:*` sync IPC handlers + preload bridge + frontend `humble` context slice (keys/syncedAt/syncError/syncing) + startup/login sync triggers (HSYNC-01/04)

**Wave 4** *(blocked on 11-03)*:

- [x] `11-04-PLAN.md` — Read-only Humble Keys page (state-grouped list, freshness indicator, fail-soft banner, 5-state badges) + route + sidebar entry + i18n (HSYNC-01/04)

**Wave 5** *(blocked on 11-04 — checkpoint)*:

- [x] `11-05-PLAN.md` — Fill 11-VALIDATION.md from the executed test map + real-account UAT + live [ASSUMED] resolution (A1/A3) (HSYNC-01/02/03/04)

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

**Plans**: 8 plans

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

**Plans**: 17 plans (7 base + 10 gap-closure)

**Wave 0** — Resolve the one genuine unknown before provisioning:

- [x] `17-01-PLAN.md` — Spike: confirm the `cxbottle --create` mechanism (Assumption A1) on a real CrossOver install; lock CLI-or-GUI-fallback (MACSTEAM-02) *(checkpoint)*

**Wave 1** — Bottle foundation:

- [x] `17-02-PLAN.md` — constants, dedicated `steamBottleConfigStore`, `bottle.ts` paths/guards/settings + tests (MACSTEAM-02, MACSTEAM-05)

**Wave 2** *(parallel — no file overlap)*:

- [x] `17-03-PLAN.md` — `library.ts` bottle-aware ACF scan, Windows-for-bottle platform, source-parameterized pollers + refreshInstallState (MACSTEAM-05)
- [x] `17-04-PLAN.md` — `bottle.ts` provisioning (create + SteamSetup) + tellBottledSteamTo{Install,Launch,Uninstall} + bottle IPC/preload/main (MACSTEAM-02, MACSTEAM-03, MACSTEAM-04)

**Wave 3** *(parallel — backend games vs frontend)*:

- [x] `17-05-PLAN.md` — `games.ts` per-OS isNative() (D-11) + bottle routing of install/launch/uninstall + Pitfall-5 guard (MACSTEAM-01, MACSTEAM-04)
- [x] `17-06-PLAN.md` — Frontend: InstallGameModal guided-setup routing + SteamBottleSetup consent/login UI + D-08 indicator + i18n (MACSTEAM-04, MACSTEAM-06)

**Wave 4** *(checkpoint)*:

- [x] `17-07-PLAN.md` — Full-suite gate + end-to-end macOS UAT on real CrossOver + scope-fence non-regression + 17-VALIDATION.md sign-off (MACSTEAM-01..06)

**Wave 5** *(gap closure — 2026-07-11 UAT: 2 issues diagnosed)*:

- [x] `17-08-PLAN.md` — GAP 1 (BLOCKER): `isBottleReady()` real-readiness gate (conf + steam.exe) + mkdir redist before SteamSetup download + re-entrant `provisionBottle` + route install/launch/uninstall on real readiness (MACSTEAM-02, MACSTEAM-04)
- [x] `17-09-PLAN.md` — GAP 2 (MAJOR): synchronous appdetails platform capture at install/launch entry (no silent native fallthrough) + `steamPlatformsCaptured` GameInfo passthrough reconciling the D-08 indicator with the routing gate (MACSTEAM-04, MACSTEAM-06) *(depends on 17-08)*
- [x] `17-10-PLAN.md` — GAP 1 (cosmetic): `SteamBottleSetup.scss` styling the guided-setup banner (background/padding/z-index) so it is legible (MACSTEAM-02)

**Wave 6** *(gap closure — 2026-07-11 UAT retest round 2)*:

- [x] `17-11-PLAN.md` — GAP 3 (MAJOR): install-button / status desync with in-progress bottle setup — derive the game-page Install button + status message + install-click from the SAME `useSteamBottleSetup` store the setup toast reads (new `is.settingUpBottle` single source of truth), so they reflect setup-in-progress instead of "not installed" and clicking Install during setup no longer dead-ends; unblocks UAT tests 4-7 (MACSTEAM-04, MACSTEAM-02)

**Wave 7** *(gap closure — 2026-07-11 UAT retest round 3; parallel, disjoint files)*:

- [x] `17-12-PLAN.md` — GAP-17-PFX86-PATH (BLOCKER): bottle readiness probes only `Program Files (x86)` but the win32 CrossOver template installs Steam to `Program Files` — add a single shared both-root resolver in `bottle.ts` (probe x86 then `Program Files`), route getBottleSteamExePath/getBottleSteamappsDir/isBottleReady/provisionBottle through it so a win32 bottle self-heals to ready and the ACF scan finds manifests; unblocks UAT tests 3-5 (MACSTEAM-04, MACSTEAM-05)
- [x] `17-13-PLAN.md` — GAP-17-STEAMWEBHELPER-HANG (MAJOR): SteamSetup's "Run Steam" left ticked launches the bottled client whose steamwebhelper self-update hangs — add guided-setup copy/i18n instructing the user to UNTICK "Run Steam" on the installer's final screen (GameLib launches Steam itself), retaining the existing hang recovery hint (MACSTEAM-02, MACSTEAM-03)

**Wave 8** *(gap closure — 2026-07-11 UAT retest round 3; two live-reconciliation defects on the install path)*:

- [x] `17-14-PLAN.md` — GAP-17-BOTTLE-PROGRESS + GAP-17-BOTTLE-INSTALL-DONE-DESYNC (both MAJOR): the bottle ACF poller derives install percent from ACF byte counts (BytesDownloaded/BytesToDownload, staged fallback, divide-by-zero guarded) and feeds the existing progressUpdate store so the progress bar advances instead of sitting at 0%; and the game-page status derivation reflects the LIVE is_installed so the button flips "Steam installing" → "Play" and the tile stops spinning on completion WITHOUT a nav/focus round-trip. No pause/cancel UI (D-07); backend routing/DM/button-label untouched (MACSTEAM-05, MACSTEAM-04)

**Wave 9** *(gap closure — 2026-07-11 UAT session 4; BLOCKER)*:

- [x] `17-15-PLAN.md` — GAP-17-CEF-RENDER (BLOCKER): the bottled Steam install dialog renders as a grey 0x0 bar with dead buttons because the CrossOver bottle is 32-bit (`win10` = 32-bit template; modern 64-bit Steam CEF UI cannot composite in a win32 prefix) — change the create template to `win10_64`, add a `bottleWineArch()` cxbottle.conf reader, and make `provisionBottle()` detect + delete/recreate an existing win32 bottle as win64 BEFORE its idempotent guards (preserving Steam account auth: refreshToken/isLoggedIn/userData untouched, only `provisioned` reset); update spike FINDINGS LOCKED-CLI note (MACSTEAM-02, MACSTEAM-04)

**Wave 10** *(gap closure — 2026-07-11 UAT session 5; 3 static/UX code gaps)*:

- [x] `17-16-PLAN.md` — GAP-17-PROVISIONED-FLAG-STUCK + GAP-17-CEF-RECREATE-RUNNING + focus/test-teardown (all in `bottle.ts`): (A) stop persisting `provisioned:false` in the race after the `wait:false` SteamSetup launch and reconcile `provisioned:true` lazily the first time `isBottleReady()` observes a real bottled steam.exe; (B) run a WINEPREFIX-scoped `wineserver -k` before `cxbottle --delete` in the win32→win64 recreate branch so the delete cannot abort while the bottled Steam client is running (scope-fenced to the target bottle's own prefix, never the shared GOG/Epic bottle); (C) make the macOS raise poll loop unref/cancellable so it no longer force-exits the Jest worker, plus a conservative visible-process focus improvement for the installer raiser (MACSTEAM-02, MACSTEAM-04)
- [x] `17-17-PLAN.md` — GAP CLOSURE (code-review CR-01/WR-01/WR-02): provisionBottle rejects the shared GameLib GOG/Epic bottle name before any destructive op (data-loss guard, D-01) + remove shared-prefix toggle from Steam setup; ACF poller starts only on successful bottle-install dispatch; remove dead always-false `loggedIn` signal (MACSTEAM-02, MACSTEAM-04)

**Cross-cutting constraints:**

- Zero new npm packages (RESEARCH.md confirmed — all Wine/VDF/download primitives already exist).
- Two Steam libraries must never be conflated: native `defaultSteamPath` vs the bottle's `drive_c/Program Files (x86)/Steam/steamapps`.
- Bottle name → path/argv only through `sanitizeBottleName`; appId → bottled command only through the `/^\d+$/` numeric guard.
- The bottled Steam session is opaque (D-04) — no credential parsing/bridging.
- GAME-05 "Playing" badge parity for bottled games is explicitly out of scope (documented in 17-VALIDATION.md).

**UI hint**: yes

---

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
  - **D-2 — Steam owns updates; GameLib owns only the first install.** No delta-patching, no resume, no integrity repair — deliberately scoped out. Any move to "GameLib owns updates" re-opens the whole build-vs-bundle question. **(Reversed for macOS-native-install scope by Phase 23's D-2 reversal — see below.)**
  - **Write `StateFlags = 1026`, never `4`.** `1026` asks Steam to verify-and-repair; `4` asserts a byte-perfect download and ships broken installs when we're wrong. **(Superseded for the full-ownership path by Phase 23's spike-003-validated StateFlags=4 write — Phase 21's own OFF-path/1026 fallback is unchanged.)**
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

**Wave 11** *(gap closure — 2026-07-19, closes D-UAT-09)*

- [x] 21-17-PLAN.md — Cancelled/incomplete native install was mislabeled Installed/Play — see 21-UAT.md

**UI hint**: yes

**Post-phase status (2026-07-20):** code-review clean, secure-phase 41/41 threats_open:0. Hardware UAT (7 native-install items) DEFERRED to Windows post-production; D-UAT-10 bottled-launch deferred as tracked macOS debt (see memory `phase-21-gaps-found`).

### Phase 23: Steam full-ownership install (StateFlags=4)

**Goal:** GameLib authors a `StateFlags=4` (FullyInstalled) appmanifest that the Steam client trusts with no verify pass and no re-download — GameLib owns the complete first install (and resume), Steam does nothing until updates. Productionizes the spike-003 env-gated proof: threads the current public `buildid`, writes consistent completion bytes, and applies `EDepotFileFlag` file modes so the install is genuinely launch-ready, not just byte-correct. Falls back to Phase 21's `1026` verify-handoff only when completeness can't be proven. **Reverses Phase 21's D-2** ("Steam owns first install") for the full-ownership path.
**Requirements**: REQ-23-01, REQ-23-02, REQ-23-03, REQ-23-04, REQ-23-05, REQ-23-06, REQ-23-07 (minted 2026-07-17 from D-01..D-07; see `.planning/REQUIREMENTS.md` §Phase 23)
**Depends on:** Phase 21 (depot download — per-chunk sha1 gate, `depot.ts`/`manifest.ts`, the env-gated `GAMELIB_SPIKE_STATEFLAGS4` code). NOT the parked macOS-bottles line (independent). Corrected 2026-07-17.
**De-risked by spike 003** (`.planning/spikes/003-stateflags4-full-ownership/`) — VALIDATED on real HW: Steam trusts a GameLib `StateFlags=4` given StateFlags=4 + `BytesToDownload==BytesDownloaded==SizeOnDisk` (non-zero) + current public buildid + correct InstalledDepots + executable file-mode bit. Supersedes the locked "StateFlags=1026, never 4" rule.
**Plans:** 10 plans — **5/10 executed on disk** (23-01, 23-02, 23-03, 23-05, 23-06 have SUMMARY.md; 23-04, 23-07, 23-08, 23-09, 23-10 do not)

Plans:
**Wave 1**

- [x] 23-01-PLAN.md — EDepotFileFlag file-mode fidelity (ReadOnly/Hidden + Windows attrib.exe) [Wave 1, REQ-23-06]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 23-02-PLAN.md — completeness gate + buildid threading + de-gate StateFlags=4, keep 1026 fallback, no new toggle [Wave 2, REQ-23-01/02/03]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 23-03-PLAN.md — sha1-gated resume/reconciliation + startup-resume rebuild (no silent Steam-in-CrossOver auto-open) [Wave 3, REQ-23-04/05]

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 23-04-PLAN.md — D-07 real-hardware validation gate (multi-depot, hard-DRM, interrupt-resume; macOS-first) [Wave 4, REQ-23-07] — task 1/2 done (23-UAT.md authored, commit c1dc0fe6); task 2/2 blocked on human-verify checkpoint. No SUMMARY.md.

**Wave 5** *(gap closure — blocked on Wave 4 code paths)*

- [x] 23-05-PLAN.md — GAP: single-flight guard on installDepotDownload (one download/appId, monotonic progress) + pause/resume no-stacking + stale-1026 phantom-install guard; re-run 23-UAT.md Gate 1 [Wave 5, REQ-23-07]

**Wave 6** *(trace-before-fix, 2026-07-21 — user-locked ordering)*

- [x] 23-06-PLAN.md — G-23-02 (0/18,809 HUMANKIND files landed +x): permanent `steam-flags-census` log instrumentation (plan-build/download-entry/download-complete + per-invocation chmod counters) + 23-TRACE.md H1-H5 hypothesis matrix from offline forensic evidence — trace-only, no fix yet

**Wave 7** *(not started — gated on 23-06's trace verdict)*

- [ ] 23-07-PLAN.md — Live-run recording (clean Gate 1 census; Gate 1/2 reference installs HUMANKIND/Cyberpunk 2077 have degraded on disk since their UAT recordings — a fresh install is likely needed). No PLAN body executed, no SUMMARY.md.
- [ ] 23-08-PLAN.md — The gated fix for G-23-02 (execute-bit application), per 23-06/23-07's verdict. No SUMMARY.md.
- [ ] 23-09-PLAN.md — Not started. No SUMMARY.md.
- [ ] 23-10-PLAN.md — Not started. No SUMMARY.md.

**Open gaps (2026-07-21):** G-23-01 (KCD2 `Blocked`-depot-key aborts whole install), G-23-02 (native install applies no execute bits — Gate 2 only CONDITIONAL PASS after a manual `chmod +x`). Gate 3 not yet run. REQ-23-07 stays open until Gate 2 re-runs clean and Gate 3 passes (`/gsd-verify-work 23`).

### Phase 24: macOS native Steam bridge (out-of-process steam_api proxy)

**Goal:** Productionize the Proton-style macOS Steam bridge — run bottled Windows Steam games against ONE native macOS Steam client (one login) via an out-of-process `steam_api.dll` shim → TCP → native helper loading `libsteam_api.dylib`, instead of bottling a full Windows Steam client per bottle. This is the parked Steam-Game-Families phase's preferred long-term successor; it superseded and PARKED that phase's multi-bottle machinery (one native client, cheap per-game prefixes, one login) — see `## Parked / Superseded Phases` below.
**Depends on:** Phase 17 (dedicated Steam bottle foundation — `steam/bottle.ts`) and supersedes the parked per-family bottle model (see `## Parked / Superseded Phases`). Independent of the Phase 20/21 depot-install line.
**Requirements:** R1, R2, R3, R4, R5, R6, R7 (locked in 24-SPEC.md; 7 requirements; retroactively recorded as REQ-24-01..07 in REQUIREMENTS.md)
**De-risked by spikes 004–008** (`.claude/skills/spike-findings-gamelib/sources/`) — feasibility fully proven on GameLib's stack: every layer incl. the C++ vtable ABI (006) and a real commercial game (Avernum 4) running on the bridge via drop-in `steam_api.dll` (007). The bridge is a compatibility layer, not a DRM gate (008 — CEG enforcement is out of scope). Blueprint + working reference code: `Skill("spike-findings-gamelib")` → `references/macos-steam-bridge.md`; seed `.planning/seeds/macos-steam-native-bridge-lsteamclient.md`; todo `.planning/todos/pending/2026-07-18-productionize-macos-native-steam-bridge-out-of-process-steam.md`.
**Plans:** 17 plans — **16/17 executed on disk** (only 24-10 lacks a SUMMARY.md)

Plans:

**Wave 1** (parallel — no file overlap):

- [x] 24-01-PLAN.md — R1 vtable+flat shim generator (D-09 GameLib-authored manifest, D-10 TypeScript, __thiscall/ret N/sret) + committed generated .c/.def (D-07)
- [x] 24-02-PLAN.md — R2 native helper (dlopen libsteam_api.dylib, InitFlat-once, single AppID 480, loopback-only persistent channel) + shared wire protocol.ts
- [x] 24-03-PLAN.md — R4 zod-validated bundled allowlist (D-01/D-02) with Avernum 4 + Hoard
- [x] 24-04-PLAN.md — NEW CrossOver-only bridge bottle (D-08) with no SteamSetup (R6 no-steam.exe) + getBridgeBottleSettings

**Wave 2** (parallel):

- [x] 24-05-PLAN.md — R3 objdump import scan + automatic per-bottle shim placement (needs 24-01, 24-04)
- [x] 24-06-PLAN.md — R2/R7 shared-helper lifecycle (D-03) + ensureBridgeHelperReady readiness signal (D-06) + steamBridgeHelperPath (needs 24-02)
- [x] 24-07-PLAN.md — R5 packaging: pinned zig download + clang helper + zig cc PE shim into public/bin/${arch}/darwin (needs 24-01, 24-02)

**Wave 3**:

- [x] 24-08-PLAN.md — R4/R7 games.ts routing (isBridgeEligible, install/launch/uninstall bridge branches, direct-.exe launch, readiness gate, D-05 signal) (needs 24-03/04/05/06)

**Wave 4**:

- [x] 24-09-PLAN.md — R7/D-05 frontend fallback dialog seam + D-11 on-demand provision (needs 24-08)

**Wave 5** (human-HW-gated, autonomous:false):

- [x] 24-10-PLAN.md — R5/R6 packaged-build + Avernum 4 + Hoard playable single-player acceptance → 24-UAT.md (needs 24-07/08/09). No SUMMARY.md — hardware acceptance recorded directly in 24-UAT.md instead (Gates 0/1/2/3 PASS; Gate 4/Hoard out of scope).

**Wave 6** (gap closure — real-hardware UAT findings, 2026-07-21; closes D-UAT-24-04):

- [x] 24-11-PLAN.md — Byte-identity guard (size then sha256) in `placeShimForGame` replacing pure `existsSync` guard, which always short-circuited because the game's depot-shipped `steam_api.dll` is already present at shimPath by the time the placer runs

**Wave 7** (gap closure — bridge bottle Acf source parity):

- [x] 24-12-PLAN.md — `getBridgeBottleSteamappsRoot()` (dedicated function mirroring `getBottleSteamappsRoot()`) — bridge-bottle AcfSource gap closure

**Wave 8** (gap closure — games.ts bridge-integration cluster, closes D-UAT-24-02/03/05):

- [x] 24-13-PLAN.md — installBridgeGame polls the bridge bottle (not the unrelated Phase 17 bottle, D-UAT-24-05); clearBridgeFailedThisSession un-poisons a session-sticky bridge failure on successful reinstall (D-UAT-24-03); launchBridgeGame verifies the resolved exe exists + bridge bottle ready before firing runWineCommand (D-UAT-24-02)

**Wave 9** (gap closure — UAT frontmatter re-pointing):

- [x] 24-14-PLAN.md — Gates 2-4 in 24-UAT.md re-pointed from BLOCKED to PENDING retest with per-fix verification hooks citing 24-11/12/13

**Wave 10** (gap closure — closes D-UAT-24-06):

- [x] 24-15-PLAN.md — Bridge LAUNCH must use CrossOver wine, not GPTK (GPTK is wine64-only and ABORTS 32-bit exes); `getBridgeBottleSettings()` resolves CrossOver wine via a sibling of `CXBOTTLE_BIN`

**Wave 11** (gap closure — closes D-UAT-24-07):

- [x] 24-16-PLAN.md — `refresh()`/`refreshInstallState()` consult `buildBridgeInstalledMap()` (native > Phase 17 bottle > bridge precedence) so a bridge-installed game's badge survives periodic sync/focus reconciliation

**Wave 12** (gap closure — D-UAT-24-02 core, bridge-authoritative install-state):

- [x] 24-17-PLAN.md — `isBridgeAuthoritativeForInstallState()` excludes the transient `bridgeFailedThisSession` from library-level eligibility, so a single recoverable session failure never permanently flips `is_installed`

**UI hint**: yes

**Post-phase status (2026-07-21):** Gates 0/1/2/3 PASS on real hardware. Gate 4 (Hoard) explicitly out of scope — the bridge proxies only ISteamUser + ISteamFriends (see memory `steam-bridge-interface-coverage`; 6 more proxies — Utils/Apps/UserStats/RemoteStorage/Matchmaking/Networking — deferred to a future milestone). Remaining: human retest of the Avernum 5 launch on the rebuilt .app.

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

- [x] 25-03-PLAN.md — real-hardware before/after throughput measurement (checkpoint:human-verify) (MHOST-04) — hosts=3, ~10 MiB/s vs 1.5–2.9 MiB/s baseline, 2026-07-19

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

## v0.8 Phase Details

### Phase 27: Tauri Shell Walking Skeleton

**Goal:** Prove the Tauri v2 (Rust shell + Rust seam + Node sidecar) rearchitecture end-to-end against GameLib's real code, per the Idea C feasibility spike (memory `spike-tauri-rearchitecture`, spikes 009-012): a Rust shell renders the existing React frontend, a headless Node sidecar runs the real Steam store-manager backend over a stdio JSON-RPC transport, and the renderer's `window.api` surface is re-pointed onto that transport instead of Electron's contextBridge — while the existing Electron build stays completely untouched.
**Depends on:** Existing Steam store-manager backend code (Phase 1-26 lineage) and the spike-009..012 findings.
**Requirements:** REQ-27-01 .. REQ-27-06 (minted 2026-07-20 from this goal + spike blueprint)
**Note on milestone numbering:** This phase is filed here as v0.8 because it is a distinct architectural spike, not additional Steam-native-install scope. `STATE.md`'s `milestone:` frontmatter still reads `v0.7` as of 2026-07-21 (has not yet been advanced) — since `roadmap.analyze` resolves the active milestone strictly from that field, this v0.8 section is **not** part of the machine-resolved active slice until STATE.md is updated. Phase 27 is complete regardless.
**Plans:** 5 plans (planned 2026-07-20) — 5/5 executed

**Wave 1** — scaffold + transport contract (interface-first):

- [x] `27-01-PLAN.md` — Tauri v2 Rust shell scaffold + `sidecarTransport.ts` contract + build/dev scripts (`tauri:dev`, `build:sidecar`) + tauri-plugin-opener; Electron build untouched. Package-legitimacy checkpoint for Tauri npm/crates. (REQ-27-01, REQ-27-06)

**Wave 2** — sidecar + renderer bridge (parallel, zero file overlap):

- [x] `27-02-PLAN.md` — Sidecar bootstrap: pathShim + minimal file-backed store + electron-module stub installed before backend import; stdio JSON-RPC server; READY signal; headless-boot test. (REQ-27-02)
- [x] `27-03-PLAN.md` — Renderer bridge: attach `window.api` + 6 globals to the Tauri webview (guard `preload/index.ts` under `isTauri()` since contextBridge is Electron-only); re-point the 3 preload factories + the synchronous store-snapshot bridge (the 4th primitive) onto Tauri; hydrate snapshot before React mounts; headless contract test (0 electron symbols, 379 call-sites untouched). (REQ-27-03)

**Wave 3** — the two E2E flows:

- [x] `27-04-PLAN.md` — Wire only the 2–4 flow channels through the sidecar against the REAL store-manager code: read flow (`refreshLibrary` → steam-user → `pushGameToLibrary`) + action flow (`launch` → `shell.openExternal(steam://rungameid)` → Rust opener); integration test. (REQ-27-04, REQ-27-05)

**Wave 4** — live run + seam doc (checkpoint):

- [x] `27-05-PLAN.md` — `SEAM.md` ported-vs-stubbed boundary + incremental-port checklist; human-verify the native macOS dev build (window renders real UI, sidecar-populated Steam library, steam:// launch fires, Electron `npm start` still works). (REQ-27-06)

**UI hint**: yes

---

### Phase 28: Tauri keyring — real `safeStorage` via the `keyring` crate

**Goal:** Replace the walking skeleton's plaintext-passthrough `safeStorage` stub with spike 011's proven `keyring` crate path (`apple-native` feature, byte-identical round-trip), so the sidecar persists and retrieves the Steam refresh token in the real OS Keychain and can never corrupt the Electron build's session.
**Scope corrections (from 28-CONTEXT.md, supersede the original entry):** (a) **D-01** — storage is **keyring-native**, NOT OSCrypt-compatible; Electron's `safeStorage` keeps only a master password in the Keychain and writes Chromium OSCrypt `v10` ciphertext into `configStore`, so "the same ciphertext the Electron build does" would require hand-rolling OSCrypt and is explicitly rejected. (b) **D-03** — this phase does **NOT** unblock Phase 27 UAT steps 2/3; those defer to whichever phase ports the login channel. There is no user-visible change this phase.
**Depends on:** Phase 27 (`electronStub.ts` seam, `src-tauri/src/main.rs` command pattern) and spike 011.
**Requirements:** REQ-28-01, REQ-28-02, REQ-28-03, REQ-28-04, REQ-28-05, REQ-28-06, REQ-28-07
**Ordering constraint (load-bearing, not a preference):** This phase MUST land before any channel that WRITES a token is wired. The sidecar and Electron share one store by design (`pathShim` resolves `userData` to the same folder), so under the current stub `encryptToken()` writes `TOKEN_PREFIX` + plaintext, Electron then fails to Keychain-decrypt it and silently signs the user out of the real app. See `27-.../SEAM.md` §2.
**Plans:** 6/6 plans complete

Plans:
**Wave 1**

- [x] 28-01-PLAN.md — Transport contract + sidecar-side `rustInvoke` request/response channel (wave 1)
- [x] 28-02-PLAN.md — Rust: `keyring` crate + `dispatch_rust_channel` + reader-branch fix for dropped frames (wave 1)
- [x] 28-03-PLAN.md — `TokenStore` seam; Electron path moved verbatim, `user.ts` routed through it (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 28-04-PLAN.md — `SidecarKeyringTokenStore` + honest `safeStorage` stub + bootstrap wiring (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 28-05-PLAN.md — Electron-untouched byte-comparison proof + by-construction source gates (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 28-06-PLAN.md — Self-check scaffolding, hardware verification checkpoint, `28-PROOF.md` + SEAM.md update, scaffolding removal (wave 4)

---

### Phase 29: Tauri store layer — generalize the sidecar store beyond the two skeleton stores

**Goal:** Grow `fileStore.ts` / the `sidecar:store-snapshot` handler from the two stores Phase 27's read path needed (`configStore`, `steamConfigStore`) into a real store layer covering the ~18 files that route through `electron_store.ts`, so later IPC slices have config to read instead of each one extending the snapshot ad hoc. Decide here between a fuller `fileStore.ts` and a Tauri/Rust-side store — SEAM.md flags the full swap as its own phase-sized unit, not a shim.
**Depends on:** Phase 28 (secret-bearing store values must round-trip through the real keyring first).
**Requirements:** REQ-29-01, REQ-29-02, REQ-29-03, REQ-29-04, REQ-29-05, REQ-29-06, REQ-29-07 (minted 2026-07-22 during `/gsd-plan-phase 29` from 29-CONTEXT.md D-01..D-15)
**Plans:** 7/7 plans complete

Plans:

**Wave 1**

- [x] 29-01-PLAN.md — fileStore.ts fidelity: path-keyed shared cell (D-14), options.defaults, atomic persist (D-10), D-07 comment
- [x] 29-02-PLAN.md — extract the 3 heavy store declarations into thin modules (D-15) + name-keyed store registry
- [x] 29-03-PLAN.md — storePolicy.ts fail-closed allow-list (D-08), declared boot/lazy tiers (D-09/D-13), channel constants (D-12)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 29-04-PLAN.md — sidecar read path: storeRegistration.ts, generalized boot-set snapshot, lazy per-store fetch, walk-every-store coverage test
- [x] 29-05-PLAN.md — renderer bridge: tiered snapshot, D-04 lazy-miss marker + self-heal, storeChanged patching, allow-list on the Tauri path only

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 29-06-PLAN.md — sidecar write path: real storeSet/storeDelete/storeNew behind one choke point (D-05) + per-key change events (D-06) + Phase 28 D-04 guard

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 29-07-PLAN.md — SEAM.md re-baseline (checklist step 5), accepted-constraints record (D-07/D-01), phase gate + both-builds live check

---

### Phase 30: Tauri IPC re-plumb slice 1 — install, uninstall, update-check

**Goal:** Port the first user-facing domain slice of the ~217 unported IPC endpoints onto the sidecar, following SEAM.md's incremental-port checklist: a curated `<domain>FlowRegistration.ts` importing only the real backend code the flow needs, real behavior in `electronStub.ts` bound to real Tauri commands for any newly-required Electron API, and the slice proven E2E in the Tauri build. Install/uninstall/update-check is the natural next slice — it reuses the skeleton's own read + action pattern and is the highest user-facing value per endpoint.
**Depends on:** Phase 29 (store layer), Phase 27 (`steamFlowRegistration.ts` pattern).
**Requirements:** REQ-30-01, REQ-30-02, REQ-30-03, REQ-30-04, REQ-30-05, REQ-30-06, REQ-30-07, REQ-30-08, REQ-30-09
**Plans:** 7/7 plans complete

Plans:

**Wave 1**

- [x] 30-01-PLAN.md — Port the Steam QR login channels onto the sidecar (D-01 ordering prerequisite) [wave 1]
- [x] 30-03-PLAN.md — Real openDialog via a new dialog_open rustInvoke channel; logged notify() no-op [wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 30-02-PLAN.md — install/uninstall/updateGame/checkGameUpdates/listSteamLibraryTargets on the sidecar, native depot branch [wave 2]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 30-04-PLAN.md — SEAM.md update, enumerated ported-channel list, deferred UAT item, both-builds smoke [wave 3]

**Gap closure** *(post-UAT live-retest defects)*

- [x] 30-07-PLAN.md — Bound the pre-download steam-user PICS/getContentServers awaits (withTimeout) + runNativeDepotDownload pre-download-phase watchdog so a never-settling getProductInfo on a stale Tauri sidecar CM socket converts to a terminal {status:'error'}; closes G-30-02 (install badge hangs forever) [gap]

---

### Phase 31: Tauri IPC re-plumb slice 2 — settings and config

**Goal:** Port the settings/config endpoint cluster onto the sidecar, including the `dialog` API surface those flows depend on (Tauri `dialog` plugin — 9 files per spike 009's touch-count). Second of three mechanical re-plumb slices.
**Depends on:** Phase 30 (slice-1 pattern proven at volume), Phase 29 (store layer).
**Requirements:** REQ-31-01..07 (7 total — minted 2026-07-23 from 31-CONTEXT.md D-01..D-05)
**Plans:** 4/4 plans complete

Plans:

**Wave 1**

- [x] 31-01-PLAN.md — Settings write path (setSetting/writeConfig) + six confirmed generic reads registered on the sidecar [wave 1]
- [x] 31-02-PLAN.md — Real async dialog members (showMessageBox/showErrorBox/showSaveDialog) via rustInvoke + D-04 shell/clipboard logged no-ops [wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 31-03-PLAN.md — 31-PORTED-CHANNELS.md + SEAM.md section 1/3 reconciliation + D-02 accepted-divergence constraint [wave 2]

**Gap closure (from 31-VERIFICATION.md CR-01 + WR-01)**

- [x] 31-04-PLAN.md — De-wire showMessageBox to a safe resolved sentinel ({response:-1}, never rejects) (CR-01, no destructive auto-confirm) + path-containment guard on per-game config write (WR-01) + SEAM.md/31-PORTED-CHANNELS.md/REQ-31-03 correction; real multi-button dialog deferred to Phase 33 [wave 1]

---

### Phase 32: Tauri IPC re-plumb slice 3 — downloads and queue

**Goal:** Port the download-manager/queue endpoint cluster onto the sidecar — the progress-notification-heavy slice, which exercises the `frontendMessage` → `frontend_message` push path at real volume rather than the single `pushGameToLibrary` case the skeleton proved. Third of three mechanical re-plumb slices.
**Depends on:** Phase 30 (install flow — the queue's producer).
**Requirements:** REQ-32-01..08 (minted 2026-07-23 during `/gsd-plan-phase 32` from 32-CONTEXT.md D-01..D-06)
**Plans:** 3/3 plans complete

Plans:

**Wave 1**

- [x] 32-01-PLAN.md — Port the five queue-management channels as the new curated `downloadQueueFlowRegistration.ts` (send/invoke transport-kind split), prove `progressUpdate`/`changedDMQueueInformation` ride the generic relay, suppress D-05 boot auto-resume

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 32-02-PLAN.md — Re-route `install`/`updateGame` through `addToQueue()`, retiring the Phase 30 D-05a direct bypass (resolve `Promise<void>`)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 32-03-PLAN.md — Declare `32-PORTED-CHANNELS.md` (incl. `changedDMQueueInformation`, D-04 pause caveat, D-05 deferral) + `32-HUMAN-UAT.md` (doubly-gated G-30-01/G-30-02) + SEAM §3→§1 move

---

### Phase 33: Tauri lifecycle cluster — app, dialog, window, notifications, tray, protocol

**Goal:** Give real Tauri behavior to the 44-file lifecycle cluster that the skeleton left stubbed or no-op: `app` lifecycle beyond `getPath`/`getName` (26 files), full `BrowserWindow`/window management (7), the remaining `shell` methods (`showItemInFolder`/`trashItem`/`openPath`, 5), `nativeImage` (4), `Notification` (3), plus tray, protocol registration, and the updater hooks. `session` and `powerSaveBlocker` are the two soft spots spike 011 flagged with no full Tauri v2 parity — scope them explicitly (resolve, shim, or accept) rather than discovering them at cutover.
**Depends on:** Phases 30–32 (the endpoint surface those clusters serve must exist first).
**Requirements:** REQ-33-01, REQ-33-02, REQ-33-03, REQ-33-04, REQ-33-05, REQ-33-06, REQ-33-07, REQ-33-08, REQ-33-09, REQ-33-10, REQ-33-11
**Plans:** 6/6 plans complete

**Parked-in from Phase 30 — G-30-02 (Tauri Steam install-spinner hang):** clicking Install on a
Steam title under `npm run tauri:dev` hangs the "installing" badge forever. Phase 30's 30-07 fix
bounded every pre-download CM await (unit-proven, 1004 tests) but the live retest 2026-07-23 STILL
hangs — the real trigger is on a path the pre-download `withTimeout` wrapping does not reach. Parked
here by user directive 2026-07-23. Start from `.planning/debug/steam-install-spinner-hangs-tauri-live-g3002.md`
("PARKED → Phase 33" section: check install branch native-vs-bottle, awaits before
`resolveSteamInstallTarget`, and add a sidecar handler-level `await install()` watchdog as the robust
belt-and-suspenders fix). Blocks the Phase 30 Install→Uninstall E2E (Test 4).

**Carried in from Phase 32 code review (32-REVIEW.md, all latent on the not-yet-shipped Tauri build)
— fold into the G-30-02 install work above:**

- **WR-01** — retiring the Phase 30 D-05a bypass (32-02) means a genuine Steam install *error* no
  longer force-clears the "installing" badge or shows a failure dialog: the shared
  `installQueueElement` force-clear condition (`downloadmanager/utils.ts:139`,
  `runner !== 'steam' || deferredToSetup || wasAborted`) excludes plain `status === 'error'`.
  Currently unreachable (G-30-02 blocks any Tauri install from progressing) and untested. NOTE: a
  "fix" here means deciding whether to keep strict Electron parity (no special error handling) or
  restore the bypass's richer error surface — a design call, not a mechanical patch. Verifier
  recommends resolving it together with the G-30-02 install-error path.

- **WR-02** — dropping the non-steam-runner guard for "full Electron parity" (32-02) also dropped
  Electron `ipc_handler.ts`'s Legendary/Epic DLC fan-out loop, so a sidecar Epic install with
  `installDlcs` populated silently drops the DLCs. Port the fan-out or re-scope the parity claim.

- **WR-03** — no test drives an `error`/`abort` resolution through the real `install`/`updateGame`
  invoke channels (the coverage gap that let WR-01 ship). Add when the error path is next touched.

Plans:

**Wave 1**

- [x] 33-01-PLAN.md — G-30-02 install-error terminal surface: extend `installQueueElement` finally-guard to clear the badge on Steam `status==='error'` (WR-01/D-10) + failure dialog (D-03) + `.install()` watchdog (D-01b); WR-02 non-Steam DLC guard (D-11); error-path regression test (WR-03/D-12)
- [x] 33-02-PLAN.md — G-30-02 CM-socket revalidation: `ensureConnected` canary + `client.relog()` (D-02) + surgical PICS-bound gap-audit (D-01a)
- [x] 33-03-PLAN.md — `dialog.showMessageBox` real multi-button (D-06) with fail-safe-to-decline `cancelId` (D-07); retrofit `askForceUninstall`/`promptI386Recovery`

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 33-04-PLAN.md — cheap-wins cluster: `Notification` + `shell` methods + `app` lifecycle real (D-05); `session`/`powerSaveBlocker` logged no-ops (D-08/D-09)
- [x] 33-05-PLAN.md — D-13 live-hardware-proof checkpoint for the G-30-02 install-hang fix (`npm run tauri:dev`)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 33-06-PLAN.md — `33-PORTED-CHANNELS.md` + SEAM §1/§3 update; WR-02 re-scope declaration (checklist step 5/6, D-09)

---

### Phase 34: Tauri packaging — Windows and Linux builds, signing, auto-update

**Goal:** Extend the macOS-only dev build to real Windows and Linux Tauri packaging with code signing, notarization, and an auto-update feed — explicitly deferred by 27-CONTEXT. Note the auto-update feed must point at the GameLib fork, not Heroic upstream (the failure mode quick task 260720-q5n fixed for the Electron build).
**Depends on:** Phase 33 (an app that runs before an app that ships).
**Requirements:** REQ-34-01, REQ-34-02, REQ-34-03, REQ-34-04, REQ-34-05, REQ-34-06, REQ-34-07, REQ-34-08, REQ-34-09
**Plans:** 17 plans — **17/17 executed on disk**; gap cycle 3 (34-16..34-18) opened 2026-07-24 to close the two BLOCKERs the first real live run (`actions/runs/30084918812`) found: GAP-A macOS legs hard-failing codesign with no cert secrets enrolled (**CLOSED by 34-16**), and GAP-B a mismatched updater key/password pair (**code half CLOSED by 34-17**; **human half CLOSED by 34-18** via Branch B — keypair regenerated and both secrets re-enrolled as a matched pair, committed pubkey synced to new key id 9A02F7E0C9FC04C7). All code work done; the only remaining item is 34-07's user-deferred live tag-push gate

Plans:

**Wave 1**

- [x] 34-01-PLAN.md — Wave-0 config-shape test scaffolds (tauriConf/cargoFeatures/releaseWorkflow/buildSidecarSea)
- [x] 34-03-PLAN.md — Generate the minisign updater keypair (public key committed later; private key → GitHub secrets)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 34-02-PLAN.md — Packaging foundation: keyring Win/Linux features + updater/shell crates + Node SEA sidecar build script

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 34-05-PLAN.md — Tauri shell productionization: bundle.active + nsis/appimage/dmg + externalBin sidecar + updater feed (fork, not Heroic)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 34-06-PLAN.md — CI release pipeline: 3-OS tauri-action matrix, graceful-skip signing, draft+prerelease on v* tag

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 34-07-PLAN.md — Live phase-close gate: real v* tag push proves all-platform draft+prerelease + Node-free sidecar (Manual-Only) — **DEFERRED by user 2026-07-24**; see 34-07-SUMMARY.md for full repro steps to resume

**Wave 6** *(gap closure — closes `34-REVIEW.md` CR-01, CR-02, WR-01, WR-03; all three run in parallel, no file overlap)*

- [x] 34-08-PLAN.md — CR-01 build script: target-triple override (`GAMELIB_SIDECAR_TARGET_TRIPLE`) + checksum-verified official Node base binary for cross-arch + `lipo -archs` arch gate
- [x] 34-09-PLAN.md — CR-02: generate/commit `src-tauri/icons/icon.ico`, wire into `bundle.icon`, guard every icon path in `tauriConf.test.ts`
- [x] 34-10-PLAN.md — WR-01 + WR-03: gate the dev-sidecar path to debug builds only; kill + reap the sidecar on `RunEvent::Exit`; new comment-stripped `main.rs` source-shape suite

**Wave 7** *(blocked on 34-08)*

- [x] 34-11-PLAN.md — CR-01 CI half (per-leg `sidecar_triple` → SEA build) + WR-02 (`cert.pfx` removed in a `finally`, false "in-memory only" comment corrected) + record WR-04/IN-01 as deferred debt

> **Out of scope for this gap cycle (user decision GAP-D-01):** review findings **WR-04**
> (`security.csp: null` + `withGlobalTauri` + broad `opener:default`) and **IN-01**
> (`sidecarSeaFsShim.ts` loose `system.pem` match) are deferred as tracked debt — recorded in
> the phase's `deferred-items.md` by 34-11, not implemented.

**Wave 8** *(gap cycle 2 — closes `34-VERIFICATION.md` failed truths #4, #5, #6, #9 and PARTIAL truth #7; 34-12 and 34-13 have zero `files_modified` overlap and run in parallel)*

- [x] 34-12-PLAN.md — GAP-1: add the missing renderer build (`pnpm exec electron-vite build`), macOS `build-steam-bridge`, and `gh release download crossover-index` steps ahead of `tauri-action`; correct the header comment that asserted unproven pipeline behavior as fact
- [x] 34-13-PLAN.md — GAP-2: resolve `esbuild`/`postject` as CLI modules run through `process.execPath` instead of extensionless `node_modules/.bin` shims, so the `windows-latest` leg can build the SEA sidecar (also closes WR-10 for postject: the tested command is now the executed command)

**Wave 9** *(blocked on 34-12 — 34-15 shares `release-tauri.yml` + `releaseWorkflow.test.ts` with it, 34-14 cross-reads the same workflow; 34-14 and 34-15 have no mutual overlap and run in parallel)*

- [x] 34-14-PLAN.md — GAP-3: repoint `plugins.updater.endpoints` at the fixed-tag asset URL `/releases/download/updater/latest.json` and add a `release: published`-triggered `promote-updater-feed.yml` that copies `latest.json` there byte-for-byte — keeps D-09's `prerelease: true` + draft human gate intact
- [x] 34-15-PLAN.md — GAP-4: require BOTH `WINDOWS_CERTIFICATE` and `WINDOWS_CERT_THUMBPRINT` before enabling Windows signing (warn-and-skip otherwise, restoring D-04); narrow the cert-import gate so no unusable `.pfx` hits disk; emit secret-derived `$GITHUB_OUTPUT` via a randomised heredoc delimiter

> **Locked constraint honored by 34-14:** D-09 forecloses the "just drop `prerelease: true`"
> remedy for the dead updater feed (it encodes the Phase 19 `prerelease-not-Latest` lesson).
> The feed moves to a stable non-`/latest/` asset location instead.
>
> **Still out of scope (unchanged):** 34-07's deferred live `v*` tag-push gate (REQ-34-09 — these
> four plans are its *prerequisite*, they do not re-own it), WR-04, and IN-01.

**Wave 10** *(gap cycle 3 — closes `34-HUMAN-UAT.md`'s two BLOCKER gaps from live run 30084918812; strictly sequential, all three touch `release-tauri.yml`)*

- [x] 34-16-PLAN.md — GAP-A: make the six `APPLE_*` signing/notarization env vars UNSET rather than defined-and-empty when the secrets are absent (job-level `env:` → a gated step writing `$GITHUB_ENV`), restoring D-04 on macOS; replaces the two decorative warning-string assertions with executed-path tests that read the resolved env
- [x] 34-17-PLAN.md — GAP-B code half: new `pnpm verify:updater-key` (`meta/updaterSigningKey.ts`) signs a probe file with the real Tauri signer and compares the signature's minisign key id against the committed `plugins.updater.pubkey`, wired as a workflow preflight after `install-deps` — turns a ~13-minute post-bundle failure into a fast named one
- [x] 34-18-PLAN.md — GAP-B human half: re-enrolled `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as a matched pair (Branch B — keypair regenerated after the original pair proved unrecoverable; root cause: Enter pressed through the hidden `read -rs PW` prompt at 34-03 setup); both secrets enrolled 1s apart, committed pubkey synced to the new key id `9A02F7E0C9FC04C7` (was `ECC69C7849AA1AA7`), commit `caa15b75`

> **Still out of scope (gap cycle 3):** the live `v*` tag-push gate itself stays owned by 34-07 —
> these three plans are its prerequisite and deliberately do not re-own it. Everything the live
> run positively proved (renderer build, Windows SEA sidecar, macOS bridge shims, the prune step,
> the whole Windows signing surface) is a hard do-not-touch constraint in all three plans.

---

### Phase 34.13: Steam install-time wine/bottle form (GOG parity) (INSERTED)

**Goal:** A Steam install offers a one-click quick install by default, targeting Steam's primary library, with an explicit "Install with options…" path — reachable via a caret or context-menu item — that opens GameLib's install modal for platform selection and wine/bottle choice. This gives Steam more control than GOG's always-modal default, not parity with it, while a bottle install still degrades safely into the options path when quick install's local checks fail.

**Requirements**: none minted — coverage is tracked against the `D-NN` decisions in `34.13-CONTEXT.md` (D-01…D-28, with **D-13 RETIRED** by D-26; verified by the blocking decision-coverage gate)
**Depends on:** Phase 34
**Must run BEFORE:** Phase 35 (Electron cutover) — 35 intentionally runs last
**Plans:** 14 plans (01-03, 05-15; 04 is a permanent gap), 8 waves

**⚠ Title is superseded (D-28).** The "(GOG parity)" framing in the heading above no longer describes the phase — D-28 states the phase *overshoots* GOG parity rather than reaching it. The heading is left unchanged deliberately: the phase directory slug (`34.13-steam-install-time-wine-bottle-form-gog-parity`) is derived from it, and renaming one without the other desyncs phase lookup. Rename both together or neither.

**Scope decision (user, 2026-08-14) — ⚠ AMENDED 2026-08-15 by D-21..D-28:** the original model auto-opened the form for **bottle-requiring games by default**, plus an **opt-in setting** to always show it. **D-22 retires the auto-open triggers** (the user is the trigger) and **D-26 cuts the always-show setting entirely**. What survives: native macOS Steam games still install without a prompt by default, so locked decision **D-09** (zero-friction Steam install for 0/1 library) is preserved rather than reversed — now via D-23's quick-install path.

**Amendment (user, 2026-08-15) — quick-install split-button model (D-21..D-28):** the install control becomes a **split button** (primary = quick install, caret = "Install with options…"). Quick install always targets Steam's primary library (D-23) and degrades into the options dialog when that library is missing or full (D-24). The options dialog opens **instantly**, carrying eligibility loading state in the wine section (D-25). Quick install is **Steam-only** this phase (D-28). Full rationale and the per-plan impact table: `34.13-CONTEXT.md` §"Amendments — quick-install model".

**Reported symptom:** "Steam does not open [the] form on install on games requiring bottle (like GOG does)."

**Root cause (traced 2026-08-14, pre-planning):**
- `src/frontend/state/InstallGameModal.ts:71` — `openInstallGameModal` short-circuits **unconditionally** for `runner === 'steam' && action === 'install'`, calling `startSteamInstall` → `installSteamGame`, which hardcodes `platformToInstall: 'Windows'` and passes no wine version, prefix, or bottle. The modal is never rendered for Steam, so `WineSelector` never runs.
- The bottle is not skipped — it is chosen *for* the user. `SteamGame.install()` (`games.ts:418`) consults `isBottleEligible()` and routes eligible games through the bottle silently, using `getSteamBottleSettings()` defaults.

**Known blockers to design around:**
1. `SteamLibraryManager.getInstallInfo()` (`library.ts:771-782`) is a stub returning `undefined`. This is *why* the short-circuit exists — its own comment notes the modal would loop forever on "Geting download size…" (`DownloadDialog/index.tsx:618`). Naively deleting the short-circuit hangs the dialog. Candidate fix: feed it `buildDepotPlan`'s `totalBytes`, which Phases 21/23 already compute. Note `buildDepotPlan` needs a Steam CM connection + PICS, so cost/latency is a real design input.
2. `isBottleEligible()` is a **private** method on `SteamGame` (`games.ts:1328`) and is **not exposed over IPC**, so the frontend cannot branch on it today.

**Already-built pieces to reuse (do not rebuild):**
- `WineSelector` already carries a Steam-aware CrossOver branch — the `knownnottowork` advisory gated on `runner === 'steam' && showBottle` (`WineSelector/index.tsx:126`). It was written for this and is currently unreachable.
- Backend bottle API is complete: `provisionBottle`, `getSteamBottleSettings`, `persistBottleWineVersion`, `bottleWineArch`, `isBottleProvisioned`, `isBottleReady` (`storeManagers/steam/bottle.ts`).

**Do not conflate:** `SteamBottleSetup` (frontend state + toast) is a **post-install** guided surface from Phase 17 (D-07), opened only by the backend's `steamBottleSetupRequired` push. It is not the install-time form this phase delivers.

Plans: **14 plans, 8 waves** *(re-planned 2026-08-15 for D-21..D-29. `34.13-04` is **DELETED** by D-26 and its number is a **permanent gap** — nothing was renumbered, because plans cross-reference each other by number. `34.13-15` was added for scope the amendment left unowned.)*

**Wave 1**
- [x] 34.13-01 — Shared contracts (`types.ts`, `electronStores.ts`) [D-17, D-26]

**Wave 2** *(blocked on Wave 1)*
- [x] 34.13-02 — Steam backend read-side: `is_windows_native` capture + `checkBottleEligibility()` [D-07, D-09, D-17]
- [x] 34.13-03 — `WineSelector` Steam props + pure `engineFilter.ts` [D-05, D-16]
- [x] 34.13-05 — Pure **section-gating** module — the trigger predicate is GONE [D-03, D-11, D-18, D-19, D-20, D-22, D-26]
- [x] 34.13-08 — **Split button + real install routing** across every entry point [D-21, D-23, D-24, D-27, D-28]

**Wave 3** *(blocked on Wave 2)*
- [x] 34.13-06 — `SteamGame.install()` honors the Windows-via-bottle override [D-17]
- [x] 34.13-07 — IPC surface, dual-registered (`isSteamBottleEligible`, `persistBottleWineVersion`) [D-09, D-14, D-15]
- [x] 34.13-15 — **`GameCard` menu Item + `GameSubMenu` entry + Console Mode D-24 check** [D-24, D-27, D-28, D-29]

**Wave 4** *(blocked on Wave 3)*
- [x] 34.13-09 — D-15 handoff: the guided setup READS the persisted choice [D-15]
- [x] 34.13-14 — Persist the D-17 forced verdict so the install is durable [D-17, closes T-34.13-06-06]

**Wave 5** — [x] 34.13-10 — The `SteamDialog` sibling component + D-24 notice + Q6 notice [D-01, D-02, D-06, D-08, D-14, D-20, D-24]
**Wave 6** — [x] 34.13-12 — `InstallModal` fifth branch + platform-row rework [D-01, D-03, D-05, D-16, D-17, D-18, D-19]
**Wave 7** — [x] 34.13-11 — **D-25 in-dialog eligibility loading state** (inverts the retired D-12 contract) [D-25, D-11, D-06]
**Wave 8** — [ ] 34.13-13 — Localisation catalog (11 keys) + blocking manual UAT gate (**36 items**, both runtimes) [D-06, D-20]

**Cross-cutting constraints:**
- **D-13 is RETIRED** (D-26). No always-show setting is built; `settings`/`help.alwaysShowSteamInstallForm` are banned identifiers.
- **D-22 retired every auto-open trigger** — nothing computes whether the dialog opens; the user is the trigger.
- **D-25 inverts D-12**: the dialog opens instantly and the loading state lives *inside* it. A half-rendered dialog is CORRECT. Origin-control busy state is a violation.
- New IPC must be registered on **both** Electron `main.ts` and the Tauri sidecar, and typed through the preload seam.
- Every new user-facing string needs a `gamelib:` key; `pnpm lint-translations:gamelib` must stay green.

### Phase 34.14: Steam platform-row depot signal — distinguish 'no Windows build' from 'metadata not captured' (INSERTED)

**Goal:** On macOS, the Steam "Install with options…" dialog stops silently withholding the Windows/wine option from games that have a Windows build. The install-modal gating layer learns the difference between *"this game has no Windows depot"* and *"we have not fetched the depot signal yet"*, and renders the second as a pending platform row rather than as a settled macOS-only verdict.

**Requirements**: none minted yet — scope is carried by the verified mechanism below and by 34.13's `D-NN` decisions it must not break (notably D-02, D-17, D-19, D-23, D-25)
**Depends on:** Phase 34.13
**Must run BEFORE:** Phase 35 (Electron cutover)
**Plans:** 2/5 plans executed

**Why this exists — a review finding that was mis-specified.** 34.13's code review filed **B-WR-06** (re-raise of B-WR-09) as a cosmetic gap: *"a reachable macOS gating combination renders one disabled control and nothing else"*, remedied by a 9th UI-SPEC row plus new copy. Investigation on 2026-08-16 confirmed the **symptom** and falsified the **cause**. B-WR-06 should be marked **superseded by 34.14**, not fixed as filed — shipping its copy would assert something false. Same failure shape as D-9o0-01 the same day: correct observation, wrong mechanism.

**Verified mechanism (each link checked against HEAD, not inferred):**
1. `hasSteamWindowsDepot` (`InstallModal/steamPlatformRow.ts:54`) is `gameInfo?.is_windows_native === true` — deliberately default-deny; `steamPlatformRow.ts:42` explicitly rejects the `!== false` form.
2. `is_windows_native` is written **only** after a successful Steam `appdetails` fetch (`storeManagers/steam/games.ts:647`), stamped `platformsCaptured: true`. `getGameInfo()` (`games.ts:525-545`) returns the *uncaptured* value immediately and fires `fetchMetadataIfNeeded()` fire-and-forget.
3. An uncaptured game therefore routes to `platformRow: 'readonly-macos'` (`steamSectionGating.ts:190-194`), which drops the Windows entry from the picker (`steamPlatformRow.ts:103`). The option is **withheld**, not merely unexplained.
4. The dialog **cannot recover while open.** `InstallGameWrapper` (`InstallModal/index.tsx:642-655`) subscribes to the store reactively, but `gameInfo` has exactly three writers — `openSteamInstallOptions` (`InstallGameModal.ts:293`), `openInstallGameModal` (`:326`), `closeInstallGameModal` (`:336`) — and is written **only at open time**. A fetch landing mid-dialog is never seen; the user must close and reopen, with nothing on screen saying so. Offline or a failed `appdetails` call makes it persist.

**Operator domain constraint (locked).** Mac-only Steam games are effectively a null set — essentially every macOS Steam game also ships a Windows build, ported or dual-developed. So `readonly-macos` is in practice a **synonym for "metadata not loaded yet"**, and any copy asserting *"this game only has a macOS build"* would read as false nearly every time it rendered.

**Scope:**
- (a) Thread the already-existing `platformsCaptured` signal into the install-modal gating input so "no Windows build" and "not yet captured" stop collapsing into one boolean. Precedent already in-repo: `AppleWikiInfo.tsx:67` gates on `steamPlatformsCaptured === true` for this same reason.
- (b) Render the not-captured case as a **pending** platform row, reusing the D-25 eligibility-pending pattern this dialog already has — not as macOS-only.
- (c) Consider letting the open dialog's `gameInfo` snapshot refresh when the fetch lands. Weigh carefully: `closeInstallGameModal`'s own comment records that stale cross-game state has already bitten this store once.
- (d) Deliberately write **no** new content-light copy for a genuinely mac-only game. Per the domain constraint that branch is near-dead; a sentence for it would be dead weight that reads as false whenever it appeared.

**Affected route:** Steam **"Install with options…" only.** Per D-23 plain Install short-circuits to quick install (`openInstallGameModal:321-324`); the options dialog is reached only via `openSteamInstallOptions`.

**Needs a UAT gate** — this is a functional gap in 34.13's headline feature, not a review nit. The cold-cache window is not reproducible on demand from a warm library, so the gate must specify how to force an uncaptured state.

Plans:
- [x] 34.14-01-PLAN.md — Wave 1. Widen `SteamBottleEligibilityVerdict` with two required booleans and populate them in the ONE shared IPC handler body (D-02/D-03). DONE 2026-08-16 (34.14-01-SUMMARY.md).
- [x] 34.14-02-PLAN.md — Wave 1. The pure gating fix: `'pending'` row mode, the D-03 read-order seam, `resolveDepotAvailability` (D-04 fail-open + D-05 seed/resolve), matrix expanded 96/8 rows → 144/10 with a Row 9/10 RED proof against unmodified HEAD.
- [ ] 34.14-03-PLAN.md — Wave 2. Carry the depot pair through `EligibilityState`/`useSteamBottleEligibility`; correct the first stale "genuinely synchronous" doc-comment.
- [ ] 34.14-04-PLAN.md — Wave 3. Wire the composition root; correct the second stale doc-comment; lock the wiring with a new source gate and three source-derived known-bads.
- [ ] 34.14-05-PLAN.md — Wave 4. Full-suite reconciliation + shipped-gate census + the BLOCKING D-08 UAT gate (both runtimes x network up/blocked).

### Phase 34.1: Tauri IPC re-plumb slice 4 — app shell and window chrome (INSERTED)

**Goal:** Port the **app shell and window chrome** IPC cluster (**33 channels** — `callTool` reassigned to Phase 34.5 by D-14) onto the Tauri build: window state and controls (minimize/maximize/unmaximize/close/fullscreen/frameless), zoom factor, title-bar overlay, tray colour, About window, language switching, custom themes/CSS, app version + changelog + releases, connectivity signal, gamepad input, and quit/lock/unlock. Establishes a **third port kind** — `renderer-side (Tauri JS)` — for window chrome (D-01/D-02), and is the **first slice to modify `src/backend/main.ts`** (D-07 body extraction), so the additive/reversible invariant becomes BEHAVIORAL rather than textual: `npm start` and `pnpm tauri:dev` must both still work.
**Requirements:** REQ-34.1-01, REQ-34.1-02, REQ-34.1-03, REQ-34.1-04, REQ-34.1-05, REQ-34.1-06, REQ-34.1-07, REQ-34.1-08, REQ-34.1-09, REQ-34.1-10, REQ-34.1-11, REQ-34.1-12
**Depends on:** Phase 34 (independent of the other slice-4..8 phases — these may run in any order or in parallel)
**Plans:** 15 total (8 original + 7 gap cycle 1) — 15/15 executed on disk

**2026-08-13 — gap cycle 1 opened. The phase did NOT close.** `34.1-VERIFICATION.md` scored 12/12
truths statically and stayed `status: human_needed`; two live UAT sessions (2026-07-25 and
2026-08-13) then produced **four `status: failed` findings**, none of which any automated test
caught. G1: `WindowControls/index.scss:2` still declares `grid-area: content`, an area Phase 34.10
moved BELOW the new navbar row — a REGRESSION of an item that passed on 2026-07-25, with nothing
turning red (`appShellLayout.test.ts:171` is non-vacuous, correctly written, green, and guards a
collision that can no longer occur). G2: the frameless toggle's own copy claims "(requires
restart)" and an experimental-feature dialog gates it — both falsified by the test that passes.
G3: `public/icon-dark.png` and `icon-light.png` are byte-identical, so `tray_set_icon` succeeds and
installs a pixel-identical image (a DATA defect predating this phase by ~a month; the Electron path
has the identical no-op, so parity is intact and the shared data is wrong). G4: **D-06 is REVERSED**
— `.setDecorations(false)` is not the Tauri translation of Electron's `titleBarStyle: 'hidden'`, so
macOS silently lost its traffic lights; macOS now adopts an overlaid titlebar with native traffic
lights and `--traffic-light-inset` 0px→78px.

**Planning found a false constraint before it reached the operator.** Revision 1 was BLOCKED by the
plan-checker: the plans asserted Tauri v2 exposes no runtime `titleBarStyle` setter and therefore
that `settings.framelessWindow` must go permanently decoration-inert on macOS. `setTitleBarStyle`
exists in the installed `@tauri-apps/api` 2.11.1. Corrected — `framelessWindow` stays functional on
macOS (ON → `overlay`, OFF → `visible`, native lights in both states) and the `tauri.conf.json`
creation value is `"Visible"`, not `"Overlay"`, so the default user gets no startup flip (UAT test 3
non-regression). Same failure class as D-06 itself, one level up: D-06 missed a real constraint,
this invented one.

Plans:

- [x] 34.1-01-PLAN.md — D-04 capability grants (12 explicit window/webview commands, `core:window:default` composition verified) + D-14 IPC-PORT-INVENTORY correction (34.1: 34→33, 34.5: 55→56)
- [x] 34.1-02-PLAN.md — D-07/D-08 handler-body extraction into Electron-free `src/backend/appshell/*`, `main.ts` reduced to one-line delegations
- [x] 34.1-03-PLAN.md — D-01/D-02 ten window-chrome channels renderer-side via Tauri JS + D-05/D-06 frameless runtime (pre-paint `setDecorations`, on-toggle re-apply, working drag region)
- [x] 34.1-04-PLAN.md — D-03/D-09 curated sidecar `appShellFlowRegistration.ts` for the 18 sidecar-routed channels + D-13 logged no-ops + a genuinely new import-graph gate
- [x] 34.1-05-PLAN.md — D-10 `gamepadAction` re-implemented renderer-side (geometric directional focus replacing Chromium spatial navigation)
- [x] 34.1-06-PLAN.md — D-11 real bounded Tauri tray (`tray-icon` feature, `TrayIcon` at setup, one new `tray_set_icon` Rust arm driving `changeTrayColor`)
- [x] 34.1-07-PLAN.md — D-12 `createNewWindow`/`showAboutWindow` as real `WebviewWindow`s with a fail-closed child-window capability boundary + static `about.html`
- [x] 34.1-08-PLAN.md — D-02/D-15 `34.1-PORTED-CHANNELS.md` declared list (third port kind + honest unobserved sign-off), `34.1-HUMAN-UAT.md`, SEAM.md §3→§1 move

**Gap cycle 1** (planned 2026-08-13, 7 plans / 4 waves — waves: 1 → {09, 10, 12, 13}, 2 → {11}, 3 → {14}, 4 → {15}):

- [x] 34.1-09-PLAN.md — close G1: re-anchor `WindowControls` off the sidebar-era `grid-area: content` onto the navbar row, complete the `grid-area: content` consumer census (4 found, 2 dead ones pruned), and add a gate asserting the PREMISE — the row index recomputed from `.App`'s own `grid-template-areas` — rather than a consequence that a future grid rewrite can silently invalidate again
- [x] 34.1-10-PLAN.md — close G4's mechanism half: `"titleBarStyle": "Visible"` as the creation-time default on the `main` window, `core:window:allow-set-title-bar-style` granted as the thirteenth explicit D-04 identifier (12→13 pinned in all three places at once: capability prose, `capabilitiesDefault.test.ts`, REQ-34.1-02), and `applyFramelessDecorations` driving `setTitleBarStyle` on macOS instead of `setDecorations` — one mechanism, not two
- [x] 34.1-11-PLAN.md — close G4's frontend half: `--traffic-light-inset` 0px→**78px** scoped to a new `.macOverlayTitlebar` hook (`darwin && isFrameless` — the reserve clears lights drawn OVER the webview, which only happens in `'overlay'`), `WindowControls` hidden **unconditionally** on macOS (the lights exist in both states, so GameLib's buttons are always redundant), `shellTokens.test.ts` **RETUNED, not deleted**
- [x] 34.1-12-PLAN.md — close G2: drop the "Experimental feature ahead" dialog and the false "(requires restart)" claim. The string moves to the fork-owned `gamelib` namespace — `meta/i18nCatalogChurnGuard.ts` forbids ANY write to `translation.json`, not just hand-edits, so the briefed fix was impossible as written; `keepRemoved: true` leaves the retired keys in place and they become the gate's non-vacuity specimen
- [x] 34.1-13-PLAN.md — close G3 **on macOS only, via a route the plan did not anticipate.** The planned fix (regenerate `icon-light*.png` as an RGB inversion, flip the three `it.failing` gates to `it`, add a semantic-ordering gate) was executed as commit `49e891f58` and then **REJECTED at the human checkpoint**: the artwork is a full-colour magenta gamer-cat over a starburst, so inverting RGB produced a full-colour *green* cat — equally illegible at 22px. The mean-luminance-delta gate was non-vacuous and correctly computed **and guarded nothing**, because brightness is not the property menu-bar legibility depends on. The todo had said verbatim "do not auto-invert branded artwork"; it also named the real fix, "consider a template image". Adopted instead: `public/icon-tray-template.png`, a monochrome AppKit template (solid black RGB, glyph carried in alpha) hue-segmented from `icon-dark.png`, embedded as `TRAY_ICON_TEMPLATE` and applied via `set_icon_with_as_template` (atomic — separate `set_icon` + `set_icon_as_template` calls flicker), `cfg(target_os = "macos")`-gated with a decode-failure fallback to the colour variant. **`darkTrayIcon` is now vestigial on macOS by design.** **Windows/Linux still carry the original defect** — `icon-dark.png`/`icon-light.png` remain byte-identical at all three scales — so the three `it.failing` gates were deliberately KEPT failing as live tripwires rather than flipped. `autonomous: false` — the blocking artwork design pass is what caught this
- [x] 34.1-14-PLAN.md — live macOS gate across `midnightMirage` / `gruvbox_dark` / `dracula`, tray re-run, and the eight separately-numbered titlebar observations L2–L9 that plan 10 could not settle statically (runtime effect ON/OFF, both transition visuals, overlaid tab clearance, startup-flip non-regression in both toggle states, unfocused drag + title overdraw). Split at the branch boundary on purpose — this phase's UAT test 5 recorded a "pass" twice while the branch it was written to cover went unexercised. `autonomous: false`. **RAN 2026-08-14: 28/28 observations PASS (0 FAIL)** across Sections A/B/C/D plus all eight L2-L9 items; Section C determined PATH A / option A1 (keep-functional, no further code) for the frameless-toggle-on-macOS decision. One non-blocking UX finding ticketed as two todos (commit `3be0730ef`).
- [x] 34.1-15-PLAN.md — write plan 14's results back into the ledger honouring **both** silent `audit-uat` failure modes (`status` stays `human_needed`, or the phase yields zero items and vanishes; resolved items are MOVED to `human_verification_resolved`, never annotated in place), and reconcile ROADMAP / REQUIREMENTS / STATE. Carried-forward items (gamepad, child windows, Electron parity re-run **before Phase 35 removes the Electron build**, sub-1200px DPI branch, Windows/Linux `WindowControls` placement) are ledgered with concrete greppable blockers, not category words. **RAN 2026-08-14:** closed gaps G2 and G4 in full, G3 on macOS only (Windows/Linux tray-asset remainder re-scoped, not closed), left G1 open (static fix landed, never live-confirmed on Windows/Linux), opened G5 (non-blocking fullscreen traffic-light reserve defect). `gsd-sdk query audit-uat` confirmed 34.1 reports a truthful, non-empty 7-item open list. `34.1-VERIFICATION.md` stays `status: human_needed` by design — the phase does NOT close; seven items remain genuinely open (Windows/Linux `WindowControls` placement, the sub-1200px DPI branch, the Windows/Linux tray-asset defect, a residual macOS tray dark-appearance observation, gamepad, child windows, and the owed Electron-parity re-run).

**Gap cycle 1 note (2026-08-14):** this cycle was driven entirely by three **live UAT sessions**
(2026-07-25, 2026-08-13, 2026-08-14), not by static/automated verification — every one of G1-G5
was a finding no jest suite caught. `34.1-VERIFICATION.md` remains `status: human_needed` BY
DESIGN even after this cycle closes: gaps existing (or being closed) does not change that field,
and switching it to `gaps_found` would make the phase vanish from `gsd-sdk query audit-uat`
entirely (verified live on this project, 2026-08-13). Seven items stay open across two
`.planning` ledgers (`34.1-HUMAN-UAT.md`'s `## Gaps` block, `34.1-VERIFICATION.md`'s
`human_verification`), each carrying a concrete, greppable `blocked_by` rather than a category
word — four are genuine hardware/asset gaps (a Windows or Linux machine, a sub-1200px-wide
display, a game controller, distinct Windows/Linux tray artwork), one is a residual visual sweep
(macOS tray dark-appearance), one is a scheduling debt (the Electron-parity re-run, owed before
Phase 35 removes the Electron build), and child windows' security-relevant claim stays
unweakened and unconfirmed live.

### Phase 34.2: Tauri IPC re-plumb slice 5 — game details, settings and overrides (INSERTED)

**Goal:** Port the **game details, settings and overrides** IPC cluster (26 channels): per-game info/settings/overrides, SDL selection, launch options, install-path changes, version pinning, repair/kill, and the enrichment surfaces (wiki game info, anticheat status, known fixes, CrossOver index, store search, recent games). Additive and reversible — the Electron build keeps working unchanged.
**Requirements:** REQ-34.2-01, REQ-34.2-02, REQ-34.2-03, REQ-34.2-04, REQ-34.2-05, REQ-34.2-06, REQ-34.2-07, REQ-34.2-08, REQ-34.2-09, REQ-34.2-10, REQ-34.2-11, REQ-34.2-12, REQ-34.2-13, REQ-34.2-14
**Depends on:** Phase 34 (independent of the other slice-4..8 phases — these may run in any order or in parallel)
**Plans:** 30/30 plans complete

Plans:

- [x] 34.2-01-PLAN.md — D-02/D-07 the two sidecar bootstrap wirings (i18next init, `fetchLastestReleases()` + the re-homed `releasesInfoReady` anticheat listener) with NON-MOCKED proof
- [x] 34.2-02-PLAN.md — D-03 extraction of the 19 `main.ts` handler bodies into Electron-free `src/backend/gamedetails/{dispatch,overrides}.ts`, `main.ts` reduced to one-line delegations
- [x] 34.2-03-PLAN.md — D-05/D-06 extraction of `readKnownFixes` out of `launcher.ts` and `buildCrossoverRatingMap` out of `crossover_index/ipc_handler.ts` (D-16 three-state contract preserved)
- [x] 34.2-04-PLAN.md — curated `gameDetailsFlowRegistration.ts` for the 15 invoke-kind per-game channels + the import-graph/delegation-shape gate
- [x] 34.2-05-PLAN.md — the 3 send-kind channels (`setGameMetadataOverride`/`changeGameVersionPinnedStatus`/`addNewApp`) with POSITIVE-side-effect proof, never absence-of-marker
- [x] 34.2-06-PLAN.md — curated `enrichmentFlowRegistration.ts` for the 8 enrichment channels + D-10 `LONG_RUNNING_CHANNELS` (`getCrossoverIndex` in; `getWikiGameInfo` measured first)
- [x] 34.2-07-PLAN.md — D-11 closure: `34.2-PORTED-CHANNELS.md` (26 channels + 3 declaration riders + the honest sign-off naming D-02/D-07), `34.2-HUMAN-UAT.md`, SEAM.md §3→§1 (headline tally 61→87 wired/re-routed total)

**Gap cycle 1** *(planned 2026-07-25 — `34.2-VERIFICATION.md` returned `gaps_found`, 11/14: REQ-34.2-03, -07 and -12 failed, plus the blocker-severity CR-03 anti-pattern)*

Wave 1 *(no `files_modified` overlap — all five may run in parallel)*

- [x] 34.2-08-PLAN.md — gap #1 / CR-01: add `repair` + `readConfig` to `LONG_RUNNING_CHANNELS`, update the exact-set pin, catch the repair rejection at `onRepairYesClick`
- [x] 34.2-09-PLAN.md — gap #2 / CR-02: `.catch()` the anticheat download inside the listener body + a log-only `unhandledRejection` guard, proven by a rejecting-download survival test
- [x] 34.2-10-PLAN.md — CR-03 (blocker) + WR-08: redirect both destructive suites through a `pathShim` mock with a `resolve`+`relative` containment tripwire; re-arm the `online_monitor` mock
- [x] 34.2-11-PLAN.md — gap #3 / WR-02: replace the false transitive-electron-freedom claim with the true invariant + a committed, growth-only electron-reach ledger
- [x] 34.2-12-PLAN.md — WR-01 + WR-04: replace the tautological HEAD-comparison gates with sha256 + semantic pins, and the vacuous i18next assertion with a real translation

Wave 2 *(blocked on Wave 1 — shares `enrichmentFlowRegistration.ts` with 34.2-11)*

- [x] 34.2-13-PLAN.md — WR-09: extract `storeSearch/handlers.ts` so the Phase 20 D-14 rethrow contract has one implementation, gated against re-inlining

Wave 3 *(blocked on Waves 1–2 — documents their outcome)*

- [x] 34.2-14-PLAN.md — bring `34.2-PORTED-CHANNELS.md` current for the whole gap cycle, including what remains open

**Gap cycle 2** *(planned 2026-07-26 — the re-verification returned `gaps_found` again: all 14 requirement-level truths pass, but gap cycle 1's own closure code introduced 3 NEW blockers)*

Wave 1 *(no `files_modified` overlap — all three may run in parallel)*

- [x] 34.2-15-PLAN.md — CR-02 regression: move `String(reason)` inside the guard's own try with a hardcoded fallback, proven by three hostile-reason cases (null prototype, throwing `toString`, throwing `Symbol.toPrimitive`)
- [x] 34.2-16-PLAN.md — CR-01 sidecar half: curated `loggerFlowRegistration.ts` registering `logError` (a slice-6 channel ported early, declared in both ledgers), proven by a positive log-file side effect over the real transport
- [x] 34.2-17-PLAN.md — CR-01 renderer half: extract `reportRepairFailure` (console.error + logError + ERROR dialog) and reduce `onRepairYesClick`'s catch to a delegation, unit-tested directly

Wave 2 *(blocked on Wave 1 — shares `sidecarRejectionGuard.test.ts` with 34.2-15 and gates 34.2-16's new suite)*

- [x] 34.2-18-PLAN.md — CR-03 + WR-01: apply the `pathShim`/`logger-paths` containment kit to `sidecarRejectionGuard.test.ts`, extend every tripwire to the log path, and prove containment with an env-simulating test plus a declared-list gate

**Gap cycle 3** *(planned 2026-07-26 — the THIRD verification returned `gaps_found`: all 14 requirement-level truths still pass, but gap cycle 2's own closure work introduced 1 new BLOCKER — `testContainment.test.ts` declared an 11-suite containment hole as accepted debt, and `bootstrap.test.ts` was reproduced LIVE 3x destroying the developer's real `~/Library/Logs/GameLib/gamelib.log` — plus 3 warnings)*

Wave 1 *(no `files_modified` overlap — all four may run in parallel; 34.2-19 is the proven-data-loss fix and does not depend on the gate work)*

- [x] 34.2-19-PLAN.md — BLOCKER: make test containment STRUCTURAL via a backend-project `setupFiles` entry (`jest.setupContainment.ts`) instead of a per-suite kit that rotted, proven by a mock-free suite + a live `stat` before/after on the real log file
- [x] 34.2-20-PLAN.md — WR-02 + IN-05: catch the `logError` listener's floating promise AT THE CALL SITE with a stderr diagnostic, proven by asserting the ABSENCE of `processGuards.ts`'s generic absorption text
- [x] 34.2-21-PLAN.md — WR-03: defensively stringify `repairFailure.ts`'s `unknown` error so the ERROR dialog is unconditional, proven by `Object.create(null)` / throwing-`toString` / throwing-`Symbol.toPrimitive` cases that fail against today's code
- [x] 34.2-22-PLAN.md — carried-forward warning: a Rust `#[cfg(test)]` module proving `timeout_for()` actually consults `LONG_RUNNING_CHANNELS` (fails under BOTH the unconditional-`Some` and unconditional-`None` mutation), pinned from the jest side because CI runs no cargo step

Wave 2 *(blocked on Wave 1 — reads `loggerFlows.test.ts` and gates the new `setupFiles` entry)*

- [x] 34.2-23-PLAN.md — WR-01 + WR-04 + WR-07 + WR-08: move the anti-claim gate to RAW source, correct the mislabelled load-bearing mock, scope the platform mutation to its own tests, and replace the 11-suite debt list with a `readdirSync`-derived set-equality tripwire over all 25 suites

Wave 3 *(blocked on Waves 1–2 — documents their outcome)*

- [x] 34.2-24-PLAN.md — REQ-34.2-13 currency: gap cycle 3 reconciliation in `34.2-PORTED-CHANNELS.md`, reasoned deferrals for WR-05/WR-06/IN-01/IN-03/IN-06 in `deferred-items.md`, VALIDATION rows, plus a committed `currency-gate.py` that turns staleness into a non-zero exit

**Gap cycle 4** *(planned 2026-07-26 — the cycle-3 CODE REVIEW (`34.2-REVIEW-GAP-CYCLE-3.md`, 2 critical / 12 warnings) empirically DISPROVED two of gap cycle 3's three claims. `34.2-VERIFICATION.md` on disk is STALE (cycle 2's round); the review is the authoritative gap source. Meta-finding this cycle answers: each of the last three cycles fixed its named gap and introduced a new one, and in each case the cycle's own new tests were structurally incapable of detecting the shortfall — so every plan here writes its proof FIRST and records the RED observed against the then-current code.)*

Wave 1 *(no `files_modified` overlap — all four may run in parallel)*

- [x] 34.2-25-PLAN.md — CR-02 (BLOCKER) + WR-07/WR-09/WR-10/WR-11/WR-12: containment is specifier-dependent (`jest.mock('os')` leaves `node:os.homedir()` returning the real `$HOME`, measured live; `userInfo().homedir` unredirected). Dual-specifier factory, `mkdtempSync`+`chmodSync 0o700` root, a `setupFiles`-time precondition that ABORTS rather than detects, and a portable anti-vacuity check anchored on the per-run root
- [x] 34.2-26-PLAN.md — CR-01 (BLOCKER) + WR-03/WR-10: the WR-02 `.catch` guard is INERT (`logger/index.ts:25-27` block-body arrows return `undefined`, so `Promise.resolve(undefined).catch` can never fire) and its four tests only pass because they `jest.spyOn` a promise shape that never occurs at runtime. Adds a promise-returning `logErrorSettled`, guards the sync-throw path, and replaces the fabricated proof with a stub-free `ENOTDIR` one
- [x] 34.2-27-PLAN.md — WR-06 + WR-03: `repairFailure.ts` swallows a missing `window.api.logError` in an empty catch — the exact silent-void class this phase exists to close — and signal 3's `t`/`showDialogModal` are unguarded contrary to the docstring's T-34.2-53 claim
- [x] 34.2-28-PLAN.md — WR-04 + WR-08: the Rust-test presence gate counts `timeout_for` in COMMENTS (a zero-assertion module satisfies it), and `loadMainRsCode()`'s `//` stripper will truncate a future `"steam://…"` literal

Wave 2 *(blocked on Wave 1 — asserts on 34.2-25's containment shape and classifies 34.2-26's new suite)*

- [x] 34.2-29-PLAN.md — WR-01 + WR-02 + WR-05 + CR-02 secondary + WR-10: Block D's HOME gate self-satisfies from a docblock and never gates the mock the module itself calls load-bearing; Block C's self-tests emit two misleading noise failures the moment the real gate fires; `jest.config.js`'s backend-only scope claim becomes an enforced cross-project gate

Wave 3 *(blocked on Waves 1–2 — documents their outcome)*

- [x] 34.2-30-PLAN.md — REQ-34.2-13 currency: gap cycle 4 reconciliation in `34.2-PORTED-CHANNELS.md` naming all 14 findings with evidence (incl. the three places the remedy diverged from the review's literal prescription), `currency-gate.py` extended with cycle-4 constants and a newest-section-last ordering rule, VALIDATION rows, and `D4-DEF-01`/`D4-DEF-02` reasoned deferrals

Cross-cutting constraints:

- `npx tsc --noEmit` and `cd src-tauri && cargo check --quiet` stay clean
- Backend suite baseline is 108/109 suites, 2237/2238 tests (measured 2026-07-26 during re-verification; was 105/106 · 2211/2212 before gap cycle 1) — the sole failure (`rustInvokeChannel.test.ts`) is pre-existing since Phase 34.1 and explicitly out of scope
- Additive and reversible: the Electron build keeps working unchanged (REQ-34.2-14)
- `npx prettier --check` on every file this cycle touches must exit 0 — newly load-bearing since gap cycle 3 regressed two production files from clean to dirty and `.github/workflows/lint.yml:19` runs `pnpm prettier`
- Proof standard (gap cycle 4): every new test states how it goes RED against the then-current code, no proof may stub the function under test, and every corrected gate carries a self-test proving it rejects the input it previously accepted

### Phase 34.3: Tauri IPC re-plumb slice 6 — shell, files, logs and diagnostics (INSERTED)

**Goal:** Port the **shell, files, logs and diagnostics** IPC cluster (**29 channels** — corrected from "30" at plan time; `IPC-PORT-INVENTORY.md` §"Phase 34.3 — Slice 6" and 34.3-CONTEXT.md both say 29): external-link and folder/file reveal handlers, path/disk-space/clipboard utilities, the `logger/ipc_handler.ts` cluster, log upload and management, system-info copy, and the cache-clear/reset diagnostics. Additive and reversible — the Electron build keeps working unchanged.
**Requirements:** REQ-34.3-01, REQ-34.3-02, REQ-34.3-03, REQ-34.3-04, REQ-34.3-05, REQ-34.3-06, REQ-34.3-07, REQ-34.3-08, REQ-34.3-09, REQ-34.3-10, REQ-34.3-11, REQ-34.3-12, REQ-34.3-13
**Depends on:** Phase 34 (independent of the other slice-4..8 phases — these may run in any order or in parallel)
**Plans:** 9/9 plans complete

Plans:

- [x] 34.3-01-PLAN.md — REQ-34.3-01/02: new `shellFilesFlowRegistration.ts` registering the 14 `main.ts` link/reveal openers + the 4 filesystem/diagnostics channels, wired into `handlers.ts`, with `shellFilesFlows.test.ts` (wave 1)
- [x] 34.3-02-PLAN.md — REQ-34.3-05/06: `clearCache` (dialog + `refreshLibrary` push), `clearAchievementCache`, and `resetHeroic` added to the same module at parity, `utils.ts` untouched (wave 2)
- [x] 34.3-03-PLAN.md — REQ-34.3-03/06/08: `tauri-plugin-clipboard-manager` + 2 new `dispatch_rust_channel` arms called Rust-side with ZERO capability grant, 2 pure helpers with hand-RED-proved `#[cfg(test)]` tests, the 2 transport constants, and D-05's verified-no-fix comment (wave 1)
- [x] 34.3-04-PLAN.md — REQ-34.3-09: `logInfoSettled` + the 5 logger/upload channels in `loggerFlowRegistration.ts` via curated imports, `deleteUploadedLogFile`'s both-builds deadness declared (wave 1)
- [x] 34.3-05-PLAN.md — REQ-34.3-04/07: real `electronStub.clipboard.writeText` forwarding with log-only failure, documented-dead sync `readText`, and the `relaunchInFlight` guard on `app.quit`/`app.exit` (wave 2)
- [x] 34.3-06-PLAN.md — REQ-34.3-03/04: new `clipboardFlowRegistration.ts` for the 3 clipboard channels, read path awaiting Rust directly per D-04 (wave 3)
- [x] 34.3-07-PLAN.md — REQ-34.3-08/10: `electronReachLedger.test.ts` entry points + baseline regenerated by running the tooling, and the block-comment-safe `main.rs` source-existence gate (wave 4)
- [x] 34.3-08-PLAN.md — REQ-34.3-12: `34.3-PORTED-CHANNELS.md` (29 rows + every rider), a self-tested doc-shape gate, SEAM.md §3→§1, and the 2 out-of-scope todos filed (wave 5)
- [x] 34.3-09-PLAN.md — REQ-34.3-11: the BLOCKING 5-item live gate — items 1/2/3/5 under `tauri:dev`, item 4 on a PACKAGED build (wave 6)

Cross-cutting constraints:

- Every registration's `send`-vs-`handle` kind is cross-checked against `main.ts`/`logger/ipc_handler.ts` — a mismatch fails 100% silently
- Curated imports only: never side-effect-import `logger/ipc_handler.ts` or `utils/ipc_handler.ts`; `logError` must NOT be registered a second time
- Zero `clipboard-manager:*` capability grants; zero `state.shutdown_child()` added to `app_relaunch` (both settled by research)
- `npx tsc --noEmit`, `cd src-tauri && cargo check --quiet`, `cargo test`, and `npx prettier --check` on touched files all stay clean
- Additive and reversible BEHAVIORALLY: `npm start` and `pnpm tauri:dev` both work after every plan; `electronUntouched.test.ts` not weakened (REQ-34.3-13)

### Phase 34.4: Tauri IPC re-plumb slice 7 — Steam completion and Humble (INSERTED)

**Goal:** Port the **remaining Steam surface plus the portable half of the Humble integration** (**31 channels** — was 38; see the re-scoping below): Steam credential/SteamGuard/TOTP login, sign-out, bottle provisioning, client setup, key redemption and private-branch passwords — closing SEAM.md deferred item 5 (D-02) — together with 16 of the 22 Humble channels from phases 10-15. Also: an honest "not available on this build" login surface (**D-04**), a fail-fast `electronStub.net.request` (**D-06**), and a **blocking 5-item live gate** (**D-08**). Additive and reversible — the Electron build keeps working unchanged.
**Requirements:** REQ-34.4-01..16
**Depends on:** Phase 34 (independent of the other slice-4..8 phases — these may run in any order or in parallel)
**Plans:** 10/10 plans complete (5 waves) — **PHASE COMPLETE 2026-07-27**. Blocking live gate
PASSED 5/5 (`34.4-LIVE-GATE.md`) — item 2 (`logoutSteam`) FAILED on attempt 1 and was fixed
in-phase. Verification passed 16/16; code review 0 critical / 3 warning / 2 info, WR-01 fixed
(`1afef0345`). **Secure-phase 34.4 not yet run.** Open: WR-02/WR-03 (runner-name display +
i18n interpolation in `WebviewUnavailablePanel.tsx`), and two unrun confirmatory Electron
checks (bottle-pair parity; Electron sign-out sanity, since the item-2 fix changed Electron's
logout path too).

Re-scoped by `34.4-CONTEXT.md` on 2026-07-27: **38 → 31.** `isLoggedIn` → Phase 34.5 (**D-03**; it is `LegendaryUser.isLoggedIn()` — Epic, filed here only because the inventory grouped by file, same as 34.1 D-14's `callTool` move). The 6 Humble browser-auth channels → **Phase 34.4.1** (**D-01/D-02**; the `<webview>` + `session.fromPartition` seam is cross-cutting and 34.5 needs it too). `IPC-PORT-INVENTORY.md` updated to match.

Planning also corrected two RESEARCH.md claims against source: `settingsFlowRegistration.ts` and `steamAuthFlowRegistration.ts` are **not** already `electronReachLedger.test.ts` entry points (plan 09 adds them), and RESEARCH Open Question 1 is resolved — neither `main.rs` sidecar spawn path passes an env var, but `node:sea`'s `isSea()` is a genuine Node-only packaged signal (the packaged sidecar is a SEA binary), so `humbleRunValidation`'s `isPackaged` divergence can be resolved rather than only declared.

Plans:

- [x] 34.4-01-PLAN.md — Steam credential/SteamGuard trio + session/identity trio incl. `logoutSteam` as a send (wave 1)
- [x] 34.4-02-PLAN.md — Bottle trio, client-setup pair, `redeemSteamKey`/`getSteamInstallSize` (wave 2)
- [x] 34.4-03-PLAN.md — The two **GOG** private-branch password channels via `libraryManagerMap` (wave 1)
- [x] 34.4-04-PLAN.md — New `humbleFlowRegistration.ts` + `handlers.ts` wiring + 10 clean Humble channels (wave 1)
- [x] 34.4-05-PLAN.md — Ownership overrides, corrected `humbleRecordGiftLinkOpened` handle, `humbleDisconnect` send (D-05), `humbleRunValidation` guard (wave 2)
- [x] 34.4-06-PLAN.md — Fail-fast `electronStub.net.request` (D-06) (wave 1)
- [x] 34.4-07-PLAN.md — Honest "not available on this build" login panel (D-04) (wave 1)
- [x] 34.4-08-PLAN.md — Reach-ledger extension (regenerated, measured 4 new edges — 1 more than the plan's own 3-edge prediction) + structural additive/reversible sweep (wave 3)
- [x] 34.4-09-PLAN.md — `34.4-PORTED-CHANNELS.md` + self-tested gate script + SEAM.md §3→§1 (wave 4)
- [x] 34.4-10-PLAN.md — Blocking 5-item live gate under `tauri:dev` (D-08/D-09/D-10) — PASS 5/5, item 2 failed attempt 1 and was fixed in-phase (wave 5)

### Phase 34.4.1: Tauri embedded-browser login seam (INSERTED)

**Goal:** Replace the **Electron-only embedded-browser login path** — the single
`<webview partition="persist:…">` in `src/frontend/screens/WebView/index.tsx:488-503` (corrected
2026-07-27 by 34.4.1-RESEARCH.md — the `:467` this entry previously carried predated 34.4's
`WebviewUnavailablePanel` addition, which shifted the element down ~21 lines) plus
`session.fromPartition()` cookie capture — with something that works under Tauri, and port the
**6 browser-auth channels** carved out of Phase 34.4 by its **D-01/D-02**: `humbleStartLogin`,
`humbleReconnect`, `humbleStopLogin`, `humbleLoginNavigated`, `humbleGetLoginUserAgent`,
`humbleRevealKey`. The seam is **not Humble-specific** — the same element serves Epic, GOG and
Amazon, which is why this runs **before Phase 34.5** rather than after: 34.5's three logins
depend on it. Additive and reversible — the Electron build keeps working unchanged.
**Requirements**: REQ-34.4.1-01, REQ-34.4.1-02, REQ-34.4.1-03, REQ-34.4.1-04, REQ-34.4.1-05, REQ-34.4.1-06, REQ-34.4.1-07, REQ-34.4.1-08, REQ-34.4.1-09, REQ-34.4.1-10, REQ-34.4.1-11, REQ-34.4.1-12, REQ-34.4.1-13, REQ-34.4.1-GAP-01, REQ-34.4.1-GAP-02, REQ-34.4.1-GAP-03, REQ-34.4.1-GAP-04, REQ-34.4.1-GAP-05, REQ-34.4.1-GAP-06, REQ-34.4.1-GAP-07, REQ-34.4.1-GAP-08, REQ-34.4.1-GAP-09, REQ-34.4.1-GAP-10, REQ-34.4.1-GAP-11, REQ-34.4.1-GAP-12, REQ-34.4.1-GAP-13

**Status:** ✅ **COMPLETE 2026-07-31** — 29 plans across 2 gap cycles, closed by a **4/4 PASS** on the
third blocking live gate (`34.4.1-LIVE-GATE-RERUN-3.md`). The gate ran three times: FAIL 2/4
(2026-07-30) → FAIL 3/4 (2026-07-31) → **PASS 4/4** (2026-07-31). **The test suite was fully green
for all three runs** (3279/3279, then 3387/3387) while F-1 and both of F-6's defects were live —
every blocking defect in this phase was found by a human driving the UI, none by automation.
**Carried out, not closed:** the cookie clear's **domain-scoping is UNTESTED** (`REQ-34.4.1-GAP-05`'s
rider — the gate contract's own precondition 6 struck the planted non-Humble cookie, making a
required PASS condition unsatisfiable on a single-origin jar; the next cycle must unstrike it), Epic
logout is **expected-fixed-by-construction but UNOBSERVED** (→ Phase 34.5), and **F-9 remains open
and unassigned**. Ten findings filed in `deferred-items.md` as `D-29-01`..`D-29-10`.
**Depends on:** Phase 34.4 (which defers these channels and seeds this phase's research)
**Blocks:** Phase 34.5 (Epic/GOG/Amazon logins use the identical seam)
**Plans:** 28/29 plans executed

**Seeded by `34.4-CONTEXT.md` D-07 — read it before researching.** Candidates: a dedicated
Tauri `WebviewWindow` on the login origin with cookies read via Tauri's own webview cookie API;
the system browser with a loopback or paste handoff; an iframe in the main webview. Landmines:
CSP/`X-Frame-Options` likely kills the iframe; 34.3 **D-02** (the `"windows": ["main"]`
capability grants are shared with untrusted remote content); **unverified** that Tauri's webview
cookie API exists at our version or reaches the platform cookie jar (34.3 **D-05**'s lesson —
verify empirically first). For `humbleRevealKey`: rounds 1–6 of the `humble-reveal-key-fails`
debug session **falsified** cookie/header fidelity as sufficient — the blocker is axios's
TLS/HTTP fingerprint, so reqwest and `tauri-plugin-http` are expected to fail identically; and
Tauri's webview is **WKWebView on macOS, WebKitGTK on Linux, WebView2/Chromium only on
Windows**, so macOS is the platform furthest from the stack that currently works.
Also carries: `humbleDisconnect` must be revisited here to clear the new browser context
(Phase 34.4 **D-05**).

Plans:

- [x] 34.4.1-01-PLAN.md — Rust login-window arms (open/cookies/nav-events/close/clear) + channel consts + cargo tests + the blocking gate contract (wave 1)
- [x] 34.4.1-02-PLAN.md — Dual-build login seam + curated registration of all 6 channels + humbleLoginFlows transport-shape test + A4 off-main-thread smoke checkpoint (wave 2, non-autonomous)
- [x] 34.4.1-03-PLAN.md — watchForLogin drives the seam: liveness discriminator, on_page_load relay, csrf capture (wave 3)
- [x] 34.4.1-04-PLAN.md — humbleRevealKey in-webview POST: hidden on-demand window, escaped script, cancelled-navigation exfil (wave 3)
- [x] 34.4.1-05-PLAN.md — D-06 branch split: login panel vs reworded store/wiki panel + OAuth declared-blocked surface (wave 3)
- [x] 34.4.1-09-PLAN.md — Wire the 4 OAuth runners to the seam: per-runner redirect capture (all four shapes), oauthCaptureLogin channel, UNPORTED_CHANNEL_MARKER surfaced as declared-blocked (wave 4)
- [x] 34.4.1-06-PLAN.md — Domain-scoped humbleDisconnect clear + reach-ledger regeneration + both Discretion sweeps (wave 5)
- [x] 34.4.1-07-PLAN.md — 34.4.1-PORTED-CHANNELS.md + SEAM §3→§1 + self-tested gate script (wave 6)
- [x] 34.4.1-08-PLAN.md — Blocking 4-item live gate under tauri:dev, results recorded, falsified statements struck (wave 7, non-autonomous) — **RAN 2026-07-30, VERDICT FAIL 2/4**; 8 findings, 2 blocking (F-1 plaintext session, F-6 disconnect does not disconnect)

**GAP CYCLE (planned 2026-07-30 from `34.4.1-LIVE-GATE.md` § Verdict + D-GAP-01/D-GAP-02).**
Ordering is binding: **sweep → F-1 → the rest → re-run the gate.** F-1 and F-6 share one root
shape — an Electron capability silently dropped at the Tauri seam, invisible to a green
3279/3279 suite — so the sweep runs first, with all secret-storage callers known before the
keyring slot design is fixed.

- [x] 34.4.1-10-PLAN.md — SWEEP: mechanical two-axis seam-parity audit + a regression guard that FAILS when the two branches diverge again (wave 1)
- [x] 34.4.1-11-PLAN.md — F-1a: compile-time keyring slot ALLOWLIST, all four arms slot-aware, T-28-03 preserved, Steam token untouched (wave 2)
- [x] 34.4.1-12-PLAN.md — F-1 (seam): dual-build Humble secret-store seam + async accessors, Electron behavior byte-identical (wave 3)
- [x] 34.4.1-13-PLAN.md — **F-1 CLOSED (code)**: keyring-backed Humble store + verified-readback plaintext migration + disconnect clears the slots (wave 4)
- [x] 34.4.1-14-PLAN.md — F-1b (steamgrid): settle reachability by measurement, then migrate or declare with evidence (wave 5)
- [x] 34.4.1-15-PLAN.md — F-6a: NEW origin-scoped storage-clear capability in Rust + seam method (wave 5)
- [x] 34.4.1-16-PLAN.md — **F-6 CLOSED (code)**: wire storage clear into Humble disconnect AND Legendary logout, parity guard upgraded to enforced (wave 6)
- [x] 34.4.1-17-PLAN.md — F-5 + F-8: disconnect jar census makes domain scope observable; reveal transport label derived, not hardcoded (wave 7)
- [x] 34.4.1-18-PLAN.md — F-2 + F-4 + F-3: state-change poll logging, sized/centered/raised login window (no title, WR-07), named identity endpoint (wave 8)
- [x] 34.4.1-19-PLAN.md — Declare the gap cycle in PORTED-CHANNELS + mint REQ-34.4.1-GAP-01..06; every item-3-gated update stays gated (wave 9)
- [x] 34.4.1-20-PLAN.md — **BLOCKING live gate RE-RUN**: items 1+3 in full, 2+4 for regression; gated record updates applied only on the measured result (wave 10, non-autonomous) — **RAN 2026-07-31, VERDICT FAIL 3/4** (items 1/2/4 PASS, item 3 FAIL); F-1 CLOSED live-proven; F-6 diagnosis incomplete (cookie delete silently doesn't delete); WR-07 FAIL; F-9/F-10 open

**GAP CYCLE 2 (planned 2026-07-31 from `34.4.1-LIVE-GATE-RERUN.md` § Verdict +
`34.4.1-RESEARCH-GAP-CYCLE-2.md`).** F-6's root cause is now source-verified as TWO compounding,
independent defects (Defect A: the census read arm's argument order is backwards; Defect B,
blocking: `delete_cookie()`'s WebKit completion handler fires unconditionally regardless of
whether anything matched). Ordering is binding: **spike-first → Defect A → Defect B → WR-07/F-4 →
F-10 ∥ F-9 ∥ housekeeping → sweeps → THIRD blocking live gate.**

- [x] 34.4.1-21-PLAN.md — Declare gap cycle 2 (REQ-34.4.1-GAP-07..12, ROADMAP, STATE) + spike the F-6 fix's own API (`with_webview` synchrony, thread identity, both cookie_domain_matches directions, delete/retry experiment) before it is built (wave 1, non-autonomous) — **DONE 2026-07-31**: `34.4.1-SPIKE-016-FINDINGS.md` live-hardware-verified — A2 holds (main thread, no hop needed), Q1 answered (closure runs synchronously inline), Defect A proven live and total (clear-direction matches 33/33, all cookies — worse than research's original framing), retry flat 31/31/31 (identity mismatch, not timing). RECOMMENDATION: WKWebsiteDataStore rewrite in plan 23, but **plan 22 must land first** or a working delete wipes the whole shared jar (Epic/GOG included).
- [x] 34.4.1-22-PLAN.md — Defect A: give the disconnect census its own correctly-directed cookie match (wave 2)
- [x] 34.4.1-23-PLAN.md — Defect B (BLOCKING): replace `delete_cookie()`'s reconstruct-and-delete path with `WKWebsiteDataStore.fetchDataRecords`/`removeData(for:)` via `with_webview()`, domain-scoped by `displayName` (wave 3)
- [x] 34.4.1-24-PLAN.md — WR-07 (login window title) + F-4 (one-shot raise/focus, observed not assumed) (wave 4)
- [x] 34.4.1-25-PLAN.md — F-10: Manage Accounts `/login` route blank on first navigation (wave 5)
- [x] 34.4.1-26-PLAN.md — F-9: `keyring_get` bounded-timeout classified error, closing the silent 60s RPC-budget consumption (wave 5)
- [x] 34.4.1-27-PLAN.md — Housekeeping: `queryLocalFonts` guard, Steam artwork percent-encoding, mint REQ-34.4.1-GAP-13 (wave 5)
- [x] 34.4.1-28-PLAN.md — Sweeps: `seam-parity-sweep.py` staleness (S-07/S-10/S-11), regression guard re-verification (wave 6)
- [x] 34.4.1-29-PLAN.md — **THIRD BLOCKING live gate**: full 4-item re-run, owns the GATED `IPC-PORT-INVENTORY.md`/`34.4.1-PORTED-CHANNELS.md` updates via plan 19's 13-row checklist (wave 7, non-autonomous) — **DONE 2026-07-31: VERDICT 4/4 PASS.** F-6 CLOSED live-proven (census 34/34/0 with the reported count agreeing with an independent re-read, and a genuinely fresh re-login: 68 `session_expired` rejections over 6m17s vs run 2's 3s and zero poll lines). WR-07, F-4, F-10 and GAP-13 also closed. Gated set applied. **NOT closed:** domain-scoping is UNTESTED (the contract's own precondition 6 struck the planted cookie, making a required PASS condition unsatisfiable on a single-origin jar), Epic logout is unobserved (→ 34.5), F-9 stays open. 10 findings filed in `deferred-items.md`.

### Phase 34.4.2: macOS login-window UX — modal child-window attachment + in-field autofill affordance (INSERTED)

**Status:** ⛔ BLOCKED — gap cycle 5 live gate FAILED 0/5 on 2026-08-06, no launch scorable; F-34.4.2-19 is fixed and live-confirmed but the gate has not been re-run. Full banner below.

**Goal (ORIGINAL 2026-08-04, PARTIALLY STRUCK 2026-08-05 by plan 16 per this block's own Status —
see the corrected goal immediately below):** Ship the two spike-validated (019–022, 2026-08-04)
login-window UX behaviors onto the 34.4.1 login seam on macOS. ~~**(1) Modal attachment (spike
021):** the login `WebviewWindow` attaches to the main window as an AppKit **child window** —
un-losable, with typing, paste and system autofill all still working — and is **re-raised after
the parent restores from the Dock**. Sheets are explicitly rejected: a sheet blocks the window
holding any cancel control, and a store's login page has none.~~ ~~**(2) In-field autofill
affordance (spikes 020/022):** an in-field key glyph that posts a **synthesized right-click** to
pop the real system context menu with the AutoFill → Passwords item in it (L2, screenshot-proven,
public API only), with Cmd+V paste kept working as the fallback.~~ **No credential store is
built** — inline Password AutoFill and save-prompts are platform-blocked in both login surfaces on
HTTP and real HTTPS, and the AutoFill panel can never be opened directly (the menu item is injected
at menu-display time and absent from the NSMenu). Verification can run offline against the
spike-019 local OAuth DummyStore harness (port 17940, PKCE + replay enforcement + `/events` oracle)
where a live store login isn't required.

**Corrected goal (2026-08-05, plan 16):** Ship the two login-window UX behaviors this phase
actually shipped, both superseding the struck-through text above. **(1) Modal attachment is
SHEET presentation, not child-window attachment** (operator's binding design decision,
2026-08-04, `34.4.2-LIVE-GATE.md`): the login `WebviewWindow` is presented as an AppKit **sheet**
(`beginSheet:completionHandler:`/`endSheet:`) on the main window — un-losable, with typing, paste
and (per the D-A deletion below) Cmd+V/Edit▸Paste as the sole credential-entry route — with an
explicit, always-reachable "Cancel sign-in" strip plus a bare-Esc backstop, both live-proven
across gate runs 2 and 3. **Sheets are NOT rejected — they are the shipped mechanism.** **(2) The
in-field autofill affordance is DELETED, not shipped** (operator decision D-A, 2026-08-05, plan
13): the synthesized-right-click glyph is gone in full — gate run 2's own measurement
(F-34.4.2-09) found it surfaced the real AutoFill menu but never filled the field, falsifying
spike 022's Recommendation #4. **Cmd+V and Edit ▸ Paste are the sole credential-entry route.**
**Requirements**: REQ-34.4.2-01, REQ-34.4.2-02, REQ-34.4.2-03, REQ-34.4.2-04, REQ-34.4.2-05, REQ-34.4.2-06, REQ-34.4.2-07, REQ-34.4.2-08, REQ-34.4.2-09, REQ-34.4.2-10 (minted by plan 34.4.2-01; the ID rows themselves land in `REQUIREMENTS.md` when that plan executes. **REQ-34.4.2-10 is the Epic descope**, minted so the exclusion is machine-enforceable rather than a comment; 01/04/06 were narrowed from "both login surfaces" to the Tauri-managed surface. No ID was deleted or renumbered.)
**Depends on:** Phase 34.4.1 (the login-window seam these behaviors attach to — COMPLETE)
**Plans:** 25/25 plans executed — recounted from the phase directory 2026-08-06 (25 `*-PLAN.md`, 25 `*-SUMMARY.md`). **All plans are complete; the PHASE is not** — plan 24's blocking live gate measured FAIL 0/5, so D-08's no-partial-pass rule keeps 34.4.2 open. Next: `/gsd-debug` (F-34.4.2-19).
a genuine full gate PASS has never been achieved in this phase's six-gate history — plan 20's own
run FAILED, 1/6 — so the phase does not close. **Gap cycle 5 EXECUTING 2026-08-06 (plans 21-25, 4
waves, 2/5 executed — plan 21 added Tests 6/7 + a coverage map to the standing Structural
Reachability Review reference; plan 22 pinned F-34.4.2-17's UI-level reachability mechanism as
falsifiable source-text gates, D-G1 layer b, correcting the "disables/clears the other login
buttons" characterisation to navigation-unmounts-the-screen), scoped against RERUN-4's three
measured CONTRACT defects (F-34.4.2-15/-16/-17) plus the two owed review tests, under binding
operator decisions D-G1/D-G2/D-G3:**

Plans:

- [x] 34.4.2-21-PLAN.md — add Tests 6 (pre-existing external-state reachability) and 7 (UI-level
  reachability) to the standing Structural Reachability Review reference, with a measured-defect
  coverage map

- [x] 34.4.2-22-PLAN.md — pin the frontend behaviour that makes item 5's gate scenario unperformable
  (D-G1 layer b), so withdrawing that item leaves T-34.4.2-39/-41 with a watchdog

- [x] 34.4.2-23-PLAN.md — author `34.4.2-LIVE-GATE-RERUN-5.md` (five items; item 5 WITHDRAWN per
  D-G1) with a seven-test review, single-instance capture assertions, and D-G2's unscored
  preparatory disconnect; record D-G1/D-G2/D-G3 and the explicit F-34.4.2-10 deferral

- [x] 34.4.2-24-PLAN.md — RUN the gate on real macOS hardware (blocking operator checkpoint) and
  propagate the measured verdict, whatever it is

- [ ] 34.4.2-25-PLAN.md — bring the two-cycles-stale `34.4.2-VERIFICATION.md` current and cross-check
  every ledger against the measured verdict

**Status: GAP CYCLE 4 LIVE GATE RAN 2026-08-06 — FAIL, 1/6 (item 6(b) the sole PASS, its first-ever
measured result in this phase's history) — PHASE STILL DOES NOT CLOSE.** `34.4.2-20-PLAN.md`'s
blocking gate ran in full against `34.4.2-LIVE-GATE-RERUN-4.md`, the sixth blocking-gate contract,
implementing the dual-sink evidence-capture standard for the first time. **Item 6(b) (the Epic
absence check) PASSED** — the first genuine measured result for it across this phase's entire
six-gate history, achieved by running it alone, first, in its own dedicated launch before anything
else could foreclose it. Every other item recorded a non-PASS this run, each for a distinct,
honestly-stated reason: **item 1 FAIL (incomplete)** — sub-check (e) unmeasurable because a
pre-existing Humble session left no empty password field to type into; **item 2 FAIL** — operator
reported both dismissal routes working, but the item's own required session-transcript evidence is
entirely absent from every surviving sink; **item 3 NOT ATTEMPTED (incomplete)** — its dedicated
`GAMELIB_AUTOFILL_GLYPH=0` relaunch never ran, the session ended after launch 2; **item 4 BLOCKED /
NOT ATTEMPTED** and **item 6(a) NOT ATTEMPTED** — neither launch 4 nor launch 5 was ever reached;
**item 5 UNREACHABLE** — its own scenario cannot be driven from the UI at all (the frontend
disables the other login buttons while one login is in flight). Three of these are themselves
**NEW contract defects**, not diagnosed app bugs: **F-34.4.2-15 (F-A)**, a capture-integrity gap —
a concurrent second `gamelib-shell` instance split the `[shell]` evidence sink mid-session while
`gamelib.log` stayed shared, so an apparently-healthy transcript can mask an unmeasured item;
**F-34.4.2-16 (F-B)** — item 4's premise is invalidated by a pre-existing WKWebView Humble session
the contract has no step to clear before item 4 begins; **F-34.4.2-17 (F-C)** — item 5's scenario
is UI-unreachable by construction, a gap in the Structural Reachability Review's own Test 2. A
fourth, process-only finding, **F-34.4.2-18 (F-D)**, records a preflight hygiene gap (no check for
a pre-existing `gamelib-shell` instance; a stale one forced launch 1 to be aborted and re-run).
D-08's no-partial-pass rule applies unchanged: **the phase does not close on 1/6.** New threat
**T-34.4.2-44** minted (Repudiation, the capture-integrity gap itself). T-34.4.2-39/-41's own live
discharge path (item 5) is now known structurally blocked, not merely unattempted — a stronger
finding than a repeated NOT ATTEMPTED. Next step: `/gsd-plan-phase 34.4.2 --gaps` (gap cycle 5),
scoped first against fixing F-34.4.2-15/-16/-17 (F-A/F-B/F-C) — each a known, named contract defect
with a stated fix direction, not an undiagnosed mystery, so `/gsd-plan-phase 34.4.2 --gaps` is the
correct next command, not `/gsd-debug`. Full record: `34.4.2-LIVE-GATE-RERUN-4.md` (item sections,
Findings, ITEM VERDICT SUMMARY), `34.4.2-PLATFORM-SCOPE.md` §5's eleventh update,
`deferred-items.md`'s Plan 20 section, `34.4.2-20-SUMMARY.md`.

**Status: GAP CYCLE 5 LIVE GATE RAN 2026-08-06 — FAIL, 0/5, NO LAUNCH SCORABLE — PHASE STILL DOES
NOT CLOSE.** `34.4.2-24-PLAN.md`'s blocking gate ran against `34.4.2-LIVE-GATE-RERUN-5.md`, the
seventh blocking-gate contract and the first whose five items were all structurally reachable
(item 5 WITHDRAWN per D-G1). **Every scored item — 6(b), 1, 2, 3, 4, 6(a) — is recorded NOT
ATTEMPTED**, and no launch in the session produced a scorable measurement of any item. (**Corrected
2026-08-06 by plan 25's cross-check:** an earlier wording here claimed no launch ordinal was ever
assigned — true of segment 1's delimiter only; segment 2's delimiter correctly carries ordinal 1.
The correction changes the stated reason, not any item's scoring.) Segment 1 contained two Humble
login-window attempts and nothing else — **no Epic window was ever built** (zero
`pristine WKWebView built for` occurrences) and no GOG control window either, so item 6(b)'s
Epic-first ordering was not held; that segment was ABORTED by operator decision and nothing from
it is cited. Segment 2 entered the D-G2 preparatory sequence's branch (a): the WKWebView carried a
live Humble session and auto-authenticated, but **the sequence's own required positive observable —
a rendered, empty login form — was NEVER produced.** With the sheet held open (`sheet_presented=true`,
`attached=true`, no cancel line), the Humble cookie watcher emitted nothing and
`humble_store/config.json` never left its pre-session 2-byte state at its original mtime, so
`configStore.set('isLoggedIn', true)` never ran, the Runner disconnect control never rendered, and
no route to either a login form or the disconnect control exists from the shipped UI.

**The run's blocking finding is F-34.4.2-19 (NEW, OPEN, BLOCKING, UNDIAGNOSED): the D-G2 branch-(a)
resolution — reasoned correctly from source at authoring, never previously verified live — is
FALSIFIED on hardware.** It blocks items 1(e), 3(a) and 4 on the login-form premise for the THIRD
consecutive run (the F-34.4.2-16 defect class), and now additionally blocks item 6(a), which is
NOT ATTEMPTED for the third consecutive run and remains the undischarged live proof of
F-34.4.2-12's source fix. A second, independent contract defect **F-34.4.2-20 (NEW)** was found:
item 6(b)'s `main.rs:3698` required literal carries no window-label field, so its label-attributed
PASS bar cannot be satisfied by that literal as written — a Test 4 gap, with a candidate eighth
Structural Reachability Review test class named ("label-attribution completeness").
**T-34.4.2-42's scorecard is measured at 2 this run** (against a measurable clause expecting zero
now that the review has seven tests). **No wedge occurred anywhere this session — explicitly NOT an
F-34.4.2-12 regression**, and no `sample` was required. T-34.4.2-43 does NOT discharge (item 6(a)
never ran); T-34.4.2-44 does NOT discharge (no scored launch existed to hold the single-instance
assertion); T-34.4.2-32 does NOT discharge (item 6(b) never measured); T-34.4.2-39/-41 do not
discharge under any outcome per D-G1. F-34.4.2-10's taking condition is NOT met — it stays OPEN and
deferred. D-08's no-partial-pass rule applies unchanged: **the phase does not close on 0/5**, and
exactly zero requirement boxes moved.

**Next step: `/gsd-debug`** — unlike gap cycle 5's own three contract defects (F-A/F-B/F-C, all now
fixed), F-34.4.2-19 is an undiagnosed app-level defect, so `/gsd-plan-phase 34.4.2 --gaps` is NOT
the correct next command. Full record: `34.4.2-LIVE-GATE-RERUN-5.md` (Preparatory sequence
"Measured outcome", Aborted segments, Findings, T-34.4.2-42 scorecard, ITEM VERDICT SUMMARY),
`34.4.2-PLATFORM-SCOPE.md` §5's thirteenth update, `deferred-items.md`'s Plan 24 section,
`34.4.2-24-SUMMARY.md`.

**Gap cycle 5 PLANNED 2026-08-06 — plans 21-25, plans 21-24 EXECUTED.** Scoped against the three
CONTRACT defects RERUN-4 measured, not against app bugs. Three binding operator decisions govern it:
**D-G1** — item 5 is WITHDRAWN from the live gate (its scenario is unperformable against the shipped
frontend), with its reasoning recorded in place and its coverage preserved by plan 14's
mutation-proven unit test plus a new frontend pin; T-34.4.2-39/-41's basis is restated honestly as
unit-proven + UI-pinned, **never live-discharged**. **D-G2** — an UNSCORED preparatory disconnect runs
before the measured sequence to clear the WKWebView cookie jar, confirmed by a RENDERED LOGIN FORM
rather than by an emptied `humble_store/config.json`; this is what makes items 1(e), 3(a) and 4
measurable at all, and it is NOT item 6(a), whose own before/after filesystem proof stays intact.
**D-G3** — every item is re-measured, nothing inherited (item 6(b)'s RERUN-4 PASS is historical
record), and item 6(b) now gets the in-session positive control RERUN-4's own caveat recorded as
missing. The next contract (`34.4.2-LIVE-GATE-RERUN-5.md`) carries **five** scored items and is the
first to implement the exactly-one-`gamelib-shell`-instance capture-integrity assertion that plan 20
added to the standing reference. **F-34.4.2-10** (the bounded-timeout debt in `clearHumbleStorage`)
is explicitly DEFERRED again this cycle with stated reasons and a named taking-condition — it is
instrumented by a record-only sub-check on item 6(a) rather than fixed blind against a code path that
has never been reached live. Next step: `/gsd-execute-phase 34.4.2`.

> --- historical: gap cycle 3's own gate-run-3 status banner follows, preserved as the record of
> that earlier-in-the-cycle run, now itself superseded by the completed gate-run-4 above ---
>
> **⛔ [SUPERSEDED] Status: GAP CYCLE 3 LIVE GATE RAN 2026-08-05 — FAIL, 5/6 (item 6 the sole FAIL, a NEW blocking
> defect) — PHASE STILL DOES NOT CLOSE.** `34.4.2-16-PLAN.md`'s blocking gate ran in full against
> `34.4.2-LIVE-GATE-RERUN-3.md`, the fresh six-item contract rebuilt around Plans 13/14's changes
> (D-A's autofill-glyph deletion; the single-flight login guard). **Items 1-5 all PASSED live** —
> items 1/2/4 RE-measured against changed source rather than inherited, and items 3/5 measured for
> the FIRST time ever in this phase's history (the entire reason gap cycle 3 exists). **Item 6
> FAILED**, a NEW blocking defect: clicking Humble's disconnect/logout control produced a hard,
> unbounded macOS main-thread wedge (spinning-wait cursor, unresponsive to all input); the operator
> had to force-kill the app. This is **F-34.4.2-12**, an escalation of gate run 2's own
> F-34.4.2-10 (a bounded, non-fatal storage-wipe timeout) to an unbounded, fatal hang — no root
> cause is asserted; three candidate layers are recorded without preferring any. Item 6(b) (Epic's
> required absences) was consequently **NOT ATTEMPTED**. D-08's no-partial-pass rule applies
> unchanged: **the phase does not close on 5/6.** A SEPARATE process finding, **F-34.4.2-11**, also
> surfaced this run: the gate contract's own mandatory `tee` evidence capture (no `-a`) truncates on
> every relaunch, and item 3(c) separately mandates a relaunch — the two requirements are
> individually reachable (so plan 15's Structural Reachability Review could not catch their
> interaction) but mutually destructive in combination, so items 3 and 5's own decisive machine
> evidence did not survive to this document; both items are recorded PASS on the operator's verbatim
> word alone, honestly marked as lacking transcript corroboration rather than fabricated. New threat
> **T-34.4.2-43** minted (Denial of service, OPEN, BLOCKING). Next step: `/gsd-plan-phase 34.4.2
> --gaps` (gap cycle 4), scoped against F-34.4.2-12 (BLOCKING) and F-34.4.2-11 (non-blocking, owed
> before items 3/5 are ever re-measured again). Full record: `34.4.2-LIVE-GATE-RERUN-3.md` (items
> 1-6, Findings section), `34.4.2-PLATFORM-SCOPE.md` §5's ninth update, `34.4.2-16-SUMMARY.md`.
>
> --- historical: gap cycle 3's own gate-run-2 status banner follows, preserved as the record of
> that earlier-in-the-cycle run, now itself superseded by the completed gate-run-3 above ---
>
> **⛔ [SUPERSEDED] Status: GAP CYCLE 2 LIVE GATE RAN 2026-08-05 — FAIL, 5/6 (item 3 the sole
> FAIL) — PHASE STILL DOES NOT CLOSE.** `34.4.2-12-PLAN.md`'s blocking gate ran in full against
> `34.4.2-LIVE-GATE-RERUN-2.md` for the first time in this phase's history — every one of the six
> items reached a measured result. **Items 1, 2, 4, 5 and 6 all PASSED live**, the first passing
> results this phase has ever recorded, including the first-ever live measurement of
> F-34.4.2-01's post-restore interactivity claim (item 1e) after five gate runs. **Item 3 (the
> glyph and the AutoFill menu) FAILED**: the synthesized-right-click poster fires correctly (WR-07
> branch 5/5, correct `INPUT`/`password` element targeting) and the real system menu pops with
> `AutoFill ›` present, but selecting a seeded Passwords entry never fills the field. The decisive
> discriminator — an identical REAL right-click, same sheet/field/entry, DOES fill — isolates the
> failure to the synthesized-event path itself, ruling out the sheet, Humble's page, and the
> platform. **New finding F-34.4.2-09**: this falsifies spike 022's own Recommendation #4
> (`login-window-ux-macos.md`), whose evidence only ever showed the menu appearing, never that a
> fill succeeds. D-08's no-partial-pass rule applies unchanged: **the phase does not close on
> 5/6.** Four more new findings this run (F-34.4.2-06 nile/Amazon spawn-delay perf tax,
> pre-existing not a regression; F-34.4.2-07 a pre-presentation window letting a second login flow
> queue behind the first, minting new threat T-34.4.2-39 origin-confusion; F-34.4.2-08 the
> autofill glyph rendering as tofu via a `fromCharCode`/`fromCodePoint` BMP-truncation bug, fix
> identified but deliberately deferred; F-34.4.2-10 Humble disconnect's storage-wipe timing out,
> non-fatal but incomplete). Also recorded: a four-instance contract-authoring-defect pattern (the
> https-only shell gate structurally forbidding two DummyStore-dependent sub-checks and one
> precondition; a concurrency-framing item that was structurally impossible against a sheet's own
> blocking semantics; an item-2 log-line requirement naming an OAuth-only subsystem Humble cannot
> emit). Next step: `/gsd-plan-phase 34.4.2 --gaps` (gap cycle 3), scoped against F-34.4.2-09 and
> T-34.4.2-39. Full record: `34.4.2-LIVE-GATE-RERUN-2.md` (items 1-6, IN-RUN FINDINGS section),
> `34.4.2-PLATFORM-SCOPE.md` §5's fifth update, `34.4.2-12-SUMMARY.md`.

> --- historical: gap cycle 2's own status banner follows, preserved as the record of that
> earlier-in-the-cycle run, now itself superseded by the completed run above ---
>
> **⛔ [SUPERSEDED] Status: SHEET-DESIGN LIVE GATE RE-RUN FAILED 2026-08-04 (0/6, items 2-6 NOT
> ATTEMPTED) — PHASE STILL DOES NOT CLOSE.** `34.4.2-10-PLAN.md`'s blocking gate ran on real macOS
> hardware against the rewritten sheet-design contract (`34.4.2-LIVE-GATE-RERUN.md`). Item 1 (sheet
> presentation and minimize/restore survival) FAILED with a NEW symptom, not the first gate's: the
> presented login window was an ordinary titled macOS window with standard traffic-light buttons
> and blank white content — **neither an AppKit sheet nor an attachment of any kind** — and could
> be ordered behind the main window (F-34.4.2-03). This is not the F-34.4.2-01/-02
> unresponsive-child-window defect recurring; it is a different, undiagnosed failure in a mechanism
> that, per plans 07-08's own source-level proof, should have presented a sheet. The operator
> stopped at item 1 — items 2-6 (dismissability, the glyph/AutoFill menu, Cmd+V, kill-switch
> efficacy, hidden-window/Epic non-interference) are NOT ATTEMPTED, not passed and not failed.
> D-08's no-partial-pass rule applies unchanged: **the phase does not close on this result.** A
> debug arc outside any plan's own execution subsequently closed F-34.4.2-03/-04/-05 and plan 11
> closed five review findings before plan 12's run above. Full record:
> `34.4.2-LIVE-GATE-RERUN.md` (finding F-34.4.2-03), `34.4.2-PLATFORM-SCOPE.md` §5's third update.

> --- historical: the first gate's own status banner follows, preserved as the record of that run,
> now itself superseded by the rerun above ---
>
> **⛔ [SUPERSEDED] Status: LIVE GATE FAILED 2026-08-04 (0/6, items 3-6 NOT ATTEMPTED) — PHASE DOES
> NOT CLOSE.** `34.4.2-06-PLAN.md`'s blocking gate ran on real macOS hardware. Item 1 (child-window
> attachment) surfaced a NEW blocking defect: the login window becomes unresponsive (cannot close,
> password field will not accept input) after the main window minimizes and restores from the
> Dock. Item 2 (dismissability) consequently also FAILED against that same broken window. The
> operator stopped the session there — items 3-6 (the glyph/AutoFill menu, Cmd+V, kill-switch
> efficacy, hidden-window/Epic non-interference) are NOT ATTEMPTED, not passed and not failed.
> D-08's no-partial-pass rule applies: **the phase does not close on this result.** This led to the
> sheet-switch gap cycle (plans 07-10) whose own rerun is recorded above. Full record:
> `34.4.2-LIVE-GATE.md` (findings F-34.4.2-01/-02).

**Binding design decision (2026-08-04, operator, supersedes this block's own "Locked, do not
re-litigate" sheet-rejection clause below):** login-window presentation switches from AppKit
child-window attachment to SHEET presentation, with a mandated explicit close affordance as the
sole required addition. This is the gap cycle's fix direction — the child-window unresponsiveness
is routed around, not debugged. The sheet-rejection reasoning below was correct about the sheet's
own known weakness (no self-dismissal) but did not anticipate child-window attachment's own live
defect; the mandated close affordance addresses the sheet's weakness directly. Recorded in full in
`34.4.2-LIVE-GATE.md`'s "Binding Design Decision" section and `.planning/STATE.md`'s Decisions.

**No CONTEXT.md, no RESEARCH.md, no PATTERNS.md, no UI-SPEC.md** — all four skipped by explicit
developer decision. Spikes 019/020/021/022 (validated 2026-08-04) ARE the research and locked the
design; `.claude/skills/spike-findings-gamelib/references/login-window-ux-macos.md` is the
authoritative design source, with `oauth-login-test-harness.md` (the spike-019 DummyStore fixture,
port 17940) as the offline verification fixture and `tauri-login-webview-cookies.md` describing the
34.4.1 seam these behaviors attach to. Glyph visual styling is executor discretion.

**SCOPE — Epic is OUT (locked user decision, 2026-08-04).** Epic is implemented **LAST**, after all
other accounts/runners are ported and proven. Epic has been problematic — the parked deterministic
pre-auth 403 (anti-bot), the zero-injection constraint the pristine `WKWebView` surface exists
specifically to satisfy, and the standing hCaptcha/UA constraint — and the user wants it left alone
until those are resolved. **No code path in this phase may attach to, inject into, resolve, or
exercise the pristine Epic login window** (`open_pristine_epic_login_window` + `EpicPristineNavDelegate`);
both must be byte-unchanged, enforced by REQ-34.4.2-10 and the `PHASE_34_4_2_NEW_SYMBOLS` source
guard. This phase targets the **Tauri-managed `WebviewWindow`** surface only: Humble plus the
GOG/Amazon OAuth runners. The Rust architecture stays Epic-*ready* — the attach/detach pair, glyph
builder, pure parser and right-click poster are all runner-agnostic, so **Epic's follow-up phase adds
call sites plus a `get_window` fallback, not a redesign.** Recorded in
`34.4.2-PLATFORM-SCOPE.md` § EPIC-DEFERRED and the phase-local `deferred-items.md`.

**Locked, do not re-litigate (ORIGINAL, PARTIALLY SUPERSEDED 2026-08-04 — see the Status block
above):** AppKit `addChildWindow:ordered:` attachment (never Tauri's builder
`.parent()`, which cannot cover the pristine `WKWebView` shell or re-attach at runtime); sheets
REJECTED (a sheet blocks the very window that would hold a cancel control, and a store login page has
none — spike 021's operator could not dismiss one at all); NO credential store (inline Password
AutoFill and save-prompts are platform-blocked on loopback HTTP *and* real HTTPS);
the affordance is an in-field key glyph posting a **synthesized right-click** (L2, public API only) —
opening the AutoFill panel directly is platform-IMPOSSIBLE (macOS injects the menu item at
menu-display time; it is absent from the NSMenu object graph even while the screen shows it), so no
plan may attempt it; Cmd+V paste must keep working in both surfaces.

Plans:

- [x] 34.4.2-01-PLAN.md — Mint REQ-34.4.2-01..10 + Tauri-managed `NSWindow`/`WKWebView` handle resolvers + the EPIC-UNTOUCHED source guard (`PHASE_34_4_2_NEW_SYMBOLS`) (wave 1)
- [x] 34.4.2-02-PLAN.md — AppKit child-window attach/detach on the Tauri-managed surface + deminiaturize re-raise; permanent anti-sheet / anti-`.parent()` / anti-focus-re-raise negatives (wave 2)
- [x] 34.4.2-03-PLAN.md — In-field glyph script + path-discriminated cancelled-navigation request channel on the Tauri-managed surface (no `WKUserScript`, no Cargo change); retightens the `on_navigation` negative rather than deleting it (wave 3)
- [x] 34.4.2-04-PLAN.md — Synthesized `RightMouseDown`/`RightMouseUp` poster: webview-bounds coordinate flip, out-of-bounds refusal, server-side debounce, single call site (wave 4)
- [x] 34.4.2-05-PLAN.md — DummyStore-never-ships containment guard + `34.4.2-PLATFORM-SCOPE.md` (per-symbol Windows/Linux declaration, EPIC-DEFERRED record, Electron-unchanged evidence) + phase `deferred-items.md` + the 6-item gate contract with `verdict: null` (wave 5)
- [x] 34.4.2-06-PLAN.md — **BLOCKING live gate** on real macOS hardware; records the measured verdict and propagates it (wave 6, non-autonomous) — **RAN 2026-08-04, VERDICT FAIL 0/6** (item 1 child-window attachment FAIL: unresponsive login window after minimize/restore, F-34.4.2-01; item 2 dismissability FAIL: cannot close in that state, F-34.4.2-02; items 3-6 NOT ATTEMPTED, gate aborted). Operator's binding design decision: switch to sheet presentation with a mandated close affordance, superseding child-window attachment. See `34.4.2-LIVE-GATE.md` and `34.4.2-06-SUMMARY.md`. **Phase 34.4.2 DOES NOT CLOSE** — gap cycle required, `/gsd-plan-phase 34.4.2 --gaps`.

**Cross-cutting constraints:**

- The phase closes only on a genuine 6/6; anything less routes to another gap cycle

**Gap cycle (planned 2026-08-04, implementing the BINDING sheet decision — 4 plans, 4 waves):**

- [x] 34.4.2-07-PLAN.md — Replace AppKit child-window attachment with SHEET presentation (`beginSheet:`/`endSheet:`), re-home the poster's authorization gate onto `PRESENTED_LOGIN_SHEETS`, retire the deminiaturize re-raise observer, invert the superseded anti-sheet negatives, restate REQ-34.4.2-01/-02/-03 (wave 1)
- [x] 34.4.2-08-PLAN.md — The mandated explicit close affordance, via two independent routes: a non-kill-switchable in-page "Cancel sign-in" strip on a `/login-cancel` sentinel, and a page-independent bare-Esc monitor scoped to presented sheets; both end the sheet then close the window, preserving `status=cancelled reason=window-closed` (wave 2)
- [x] 34.4.2-09-PLAN.md — Rewritten six-item blocking gate contract `34.4.2-LIVE-GATE-RERUN.md` (`verdict: null`): items 1/2 restated in sheet semantics with a mandatory post-minimize/restore INTERACTIVITY sub-check, items 3-6 carried over intact; platform-scope + threat roll-up updated (T-34.4.2-33/-34/-35); premature requirement checkmarks corrected (wave 3)
- [x] 34.4.2-10-PLAN.md — **BLOCKING live gate re-run** on real macOS hardware; records the measured verdict and propagates it (wave 4, non-autonomous) — **RAN 2026-08-04, VERDICT FAIL 0/6** (item 1 sheet presentation FAIL: presented window was an ordinary titled macOS window, blank content, neither sheet nor attachment, could go behind the main window, F-34.4.2-03; items 2-6 NOT ATTEMPTED, gate aborted at item 1). See `34.4.2-LIVE-GATE-RERUN.md` and `34.4.2-10-SUMMARY.md`. **Phase 34.4.2 STILL DOES NOT CLOSE** — a second gap cycle is required, `/gsd-plan-phase 34.4.2 --gaps`.

**Gap-cycle scope note (plans 07-10, closed):** the fix direction was the presentation switch, per the binding decision — no plan diagnosed or repaired F-34.4.2-01's root cause inside the child-window mechanism, because that mechanism was removed. Plan 07 alone would have shipped a sheet the user cannot dismiss (T-34.4.2-33); plan 08 was a hard prerequisite and no gate ran between them. Epic remained byte-untouched throughout (REQ-34.4.2-10). **This gap cycle's own fix did not produce a working sheet at gate time (F-34.4.2-03) — the next gap cycle must diagnose why**, starting from the candidate layers F-34.4.2-03 names (stale/mismatched binary despite the preflight's own passing symbol check; a runtime path not reaching `present_login_window_as_sheet`; something specific to the surface tested) without preferring any one of them in advance.

**Gap cycle 2 (planned 2026-08-04, after the debug arc closed F-34.4.2-03/-04/-05 — 2 plans, 2 waves):**

**The sheet ATTACHES. Live-proven, not inferred.** A `/gsd-debug` session closed the whole
F-34.4.2-03/-04/-05 arc across three rounds on real macOS hardware: `751521663` (CR-01 — the
sheet-candidate window is built `.visible(false)` so `beginSheet:` performs the reveal; CR-02 — the
`attachedSheet()`/`isSheet()` read-back, with `PRESENTED_LOGIN_SHEETS` registration and the
`sheet_presented=` line emitted ONLY on confirmed attachment, plus a visible-fallback), `56d4986f8`
(F-34.4.2-04 — timed `eprintln!` diagnostics plus a 15s `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT` race
so the fallback is guaranteed to run), and `8b2fdb315` (F-34.4.2-05, the terminal root cause —
`parent.beginSheet_completionHandler(child, None)` **wedges the OS main thread forever** when
invoked in the same run-loop turn as a just-created WKWebView-backed `NSWindow`; fixed by deferring
that one call 250ms via `dispatch2::DispatchQueue::main().after()`, nested INSIDE the existing
`run_on_main_thread` closure so Test 6's single-call-site guard still holds). The operator's own
round-3 run logged `deferred beginSheet closure entered (deferred_elapsed=260.328417ms)` →
`beginSheet dispatch call returned` → `read-back attached=true` — a falsifiable signal produced by
CR-02's own read-back, not a repeat of CR-02's original unfalsifiable "the dispatch didn't time out".
**CR-01/CR-02 must not be re-fixed, and the sheet-vs-child-window decision must not be
re-litigated** (child windows are permanently off the table).

**What that does NOT close, and what this cycle is therefore for:** item 1's un-losability,
cannot-be-ordered-behind-parent and survives-minimize/restore-**and-stays-INTERACTIVE** sub-checks
are all still UNMEASURED, and gate **items 2, 3, 4, 5 and 6 have never been attempted in any of the
four gate runs to date.** That — not the sheet mechanism — is this cycle's real gap. The debug arc
also landed as raw commits with no phase plan documenting them and no propagation into
REQUIREMENTS/PLATFORM-SCOPE/ROADMAP/STATE; that bookkeeping debt is in scope here.

- [x] 34.4.2-11-PLAN.md — Fix the five `34.4.2-REVIEW.md` findings that sit directly on the paths gate items 2/3/5 must traverse (WR-07 the poster no longer re-orders a presented sheet; WR-03 top-frame-only cancel strip; WR-04 retry listener + MutationObserver registered before anything that can throw; WR-01 a failed `endSheet:` hop re-registers the label so both cancel routes stay reachable; IN-02 no advertised keyboard activation the strip cannot deliver), propagate the debug arc's bookkeeping, and author the fresh contract `34.4.2-LIVE-GATE-RERUN-2.md` (`verdict: null`). **Forbidden from running any gate item or writing any verdict.** (wave 1)
- [x] 34.4.2-12-PLAN.md — **BLOCKING live gate re-run** on real macOS hardware against `34.4.2-LIVE-GATE-RERUN-2.md`; sole writer of `verdict`/`run_date`/`items_passed`, filled from a measured run and never from expectation (T-34.4.2-25). Mandatory evidence capture: `npm run tauri:dev 2>&1 | tee /tmp/gamelib-dev.log` — `gamelib.log` carries no `[shell]`-prefixed Rust lines, which is what made rounds 2/3 of the debug arc diagnosable. (wave 2, non-autonomous) — **RAN 2026-08-05, VERDICT FAIL 5/6** (items 1, 2, 4, 5, 6 PASS — first-ever passing results this phase, including item 1e's first-ever live measurement of F-34.4.2-01's post-restore claim; item 3 FAIL — the synthesized-right-click poster pops the real AutoFill menu correctly but the field never fills, F-34.4.2-09, falsifying spike 022's Recommendation #4). New findings F-34.4.2-06..10, new threat T-34.4.2-39, and a four-instance contract-authoring-defect pattern also recorded. See `34.4.2-LIVE-GATE-RERUN-2.md` and `34.4.2-12-SUMMARY.md`. **Phase 34.4.2 STILL DOES NOT CLOSE** — gap cycle 3 required, `/gsd-plan-phase 34.4.2 --gaps`.

**Gap-cycle-2 scope note:** findings WR-02, WR-05, WR-06, WR-08, IN-01, IN-03 and IN-04 are
deliberately OUT of scope and are recorded in `deferred-items.md`, not fixed — this cycle is scoped
to the five findings that can block or corrupt items 2/3/5. Epic stays byte-untouched throughout
(REQ-34.4.2-10, `PHASE_34_4_2_NEW_SYMBOLS` guard); Epic's own login UX is deferred until every other
runner is proven. No new REQ ID is minted: this cycle closes REQ-34.4.2-01/-02/-03/-06 (live PASS)
and REQ-34.4.2-10 (live-reconfirmed); it does NOT close REQ-34.4.2-04/-05/-09 — item 3's genuine
measured FAIL means those requirements' live claims remain unproven, routing to gap cycle 3.

**Gap cycle 3 (planned 2026-08-05, after gate run 2 measured item 3 a genuine FAIL — 4 plans, 4 waves):**

**Binding operator decision D-A (2026-08-05): the in-field autofill glyph is DROPPED and its code is
DELETED — not disabled, not kept behind the kill switch, and no alternative synthesis approach is to
be attempted.** Gate run 2 measured the mechanism end to end on real hardware: the synthesized
right-click fires 5/5, correctly skips `makeKeyAndOrderFront` under the WR-07 sheet branch, targets
the correct element (`hit_tag=Some("INPUT")`, `hit_type=Some("password")`) and pops the real system
menu with `AutoFill ›` present — **and the field never fills**, while an identical REAL right-click in
the same sheet, same field, same seeded entry does. That discriminator rules out the sheet context,
Humble's page and the platform. **F-34.4.2-09** records the consequence: spike 022's own
Recommendation #4 — the premise the whole affordance was built on — is falsified, because its evidence
only ever showed the menu APPEARING and never measured whether selecting an entry writes to the field.
**Cmd+V and Edit ▸ Paste become the sole credential-entry route.** F-34.4.2-08 (the glyph rendering as
tofu via `String.fromCharCode`/`fromCodePoint` BMP truncation) is consequently MOOT and must NOT be
fixed — deleting the code supersedes it. REQ-34.4.2-04/-05 are rewritten so the ABSENCE is the
verifiable claim; no REQ ID is added, deleted or renumbered.

**Also in scope: T-34.4.2-39, which has been OPEN with no discharging item since it was minted
mid-gate.** The ~7-8s nile/Amazon CLI-helper spawn delay (F-34.4.2-06, the pre-existing PyInstaller
onefile tax, NOT a 34.4.2 regression) leaves the main window interactive pre-presentation, so a second
login flow can be initiated and AppKit queues its `beginSheet:` behind the first — surfacing it on the
first's dismissal rather than at its own request time. Concrete failure mode: typing one store's
password into another store's just-arrived sheet.

**Process change this cycle: contract authoring is treated as a defect surface.** Gate run 2 produced
FOUR independent structural impossibilities in its own contract, every one found during execution
rather than review (the DummyStore https-only shell gate at `main.rs:926` forbidding two sub-checks
and one precondition; item 6(a)'s concurrency framing against a sheet's own parent-blocking
semantics; item 2's `status=cancelled reason=window-closed` being an OAuth-runner-only signal Humble
structurally cannot emit). Plan 15 adds a **Structural Reachability Review** as a first-class
deliverable, and plan 16 measures whether it worked.

**Unchanged and not re-litigated:** D-B the cancel strip stays intact (separate mechanism, no kill
switch, live-PASSED); D-C sheet presentation is permanent and child-window attachment is off the table
forever (CR-01/CR-02 and the 250ms `SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY` deferral must not be
re-fixed); D-D Epic stays byte-untouched; D-E author/runner separation — the plan shipping code never
writes a verdict; D-F no-partial-pass — the phase closes only on a genuine 6/6.

- [x] 34.4.2-13-PLAN.md — Execute D-A: delete the in-field autofill mechanism from `src-tauri/src/main.rs` in full (glyph script, parser, sentinel arm, poster, event synthesizer, debounce, coordinate helpers, the orphaned `login_window_wk_webview`, and the `GAMELIB_AUTOFILL_GLYPH` kill switch), make the deletion machine-enforceable via a mutation-proven `PHASE_34_4_2_REMOVED_AUTOFILL_SYMBOLS` absence guard, relocate T-34.4.2-20's permanent credential-selector negatives so they survive the removal of the blocks hosting them, and rewrite REQ-34.4.2-04/-05 to the corrected scope (boxes stay `[ ]`). Retires T-34.4.2-15 as moot and T-34.4.2-10/-11/-12/-14/-16/-17/-18/-19/-21/-36 by deletion; mints T-34.4.2-40. (wave 1)
- [x] 34.4.2-14-PLAN.md — Close T-34.4.2-39: a `#[cfg(target_os = "macos")]` single-flight guard refusing a second VISIBLE login window at the shell entry point while another is pending or presented, so AppKit is never asked to queue a second sheet. Hidden reveal/clear windows and Epic are structurally exempt; the latch clears on all three resolution paths and expires on a TTL derived from the existing 15s watchdog so it can never become a lock-out of its own (new threat T-34.4.2-41). The residual pre-`humble_login_open` interval is documented, not overclaimed. (wave 2)
- [x] 34.4.2-15-PLAN.md — Correct the falsified project-knowledge artifact `login-window-ux-macos.md` (Recommendation #4 FALSIFIED at the point of use, Recommendation #1/§1/§2 SUPERSEDED, a Current-status block above both), fold gate run 2's orphaned findings (F-34.4.2-06..10, T-34.4.2-39, the contract-authoring-defect pattern) into `deferred-items.md`, author `34.4.2-LIVE-GATE-RERUN-3.md` (`verdict: null`, six items — item 3 becomes an ABSENCE check absorbing the retired kill-switch item, item 5 is new for T-34.4.2-39, and the four prior PASSes are RE-MEASURED not inherited), and run a **Structural Reachability Review** over every item and precondition before any live run. **Forbidden from running any gate item or writing any verdict.** (wave 3)
- [x] 34.4.2-16-PLAN.md — **BLOCKING live gate re-run** on real macOS hardware against `34.4.2-LIVE-GATE-RERUN-3.md`; sole writer of `verdict`/`run_date`/`items_passed`, filled from a measured run and never from expectation (T-34.4.2-25). Bidirectional preflight symbol check (current literals present AND deleted literals absent — a surviving `post_autofill_right_click` means the binary predates plan 13 and the run must not start); no DummyStore harness is started (the https-only gate makes it unreachable); mandatory evidence capture `npm run tauri:dev 2>&1 | tee /tmp/gamelib-dev.log`. Also corrects this phase's stale ROADMAP Goal text and records D-A in STATE.md's Decisions. (wave 4, non-autonomous) — **RAN 2026-08-05, VERDICT FAIL, items_passed 5/6** (items 1-5 PASS — items 1/2/4 RE-measured against Plans 13/14's changed source, items 3/5 measured live for the FIRST time ever this phase; item 6 FAIL — a NEW blocking main-thread wedge on Humble disconnect, F-34.4.2-12, escalating F-34.4.2-10, item 6(b) Epic consequently NOT ATTEMPTED). New threat T-34.4.2-43 minted (DoS, OPEN, BLOCKING). Also surfaced F-34.4.2-11: the contract's own mandatory `tee` truncation collides with item 3(c)'s mandatory relaunch — items 3/5 PASS on the operator's word alone, with NO surviving transcript corroboration, honestly recorded rather than fabricated (a fifth contract-authoring-defect instance, the first that is an interaction defect plan 15's per-item Structural Reachability Review could not have caught). See `34.4.2-LIVE-GATE-RERUN-3.md` and `34.4.2-16-SUMMARY.md`. **Phase 34.4.2 STILL DOES NOT CLOSE** — gap cycle 4 required, `/gsd-plan-phase 34.4.2 --gaps`.

**Gap cycle 4 (planned 2026-08-06, after `/gsd-debug` diagnosed and fixed F-34.4.2-12 — 4 plans, 4 waves):**

**F-34.4.2-12 is CLOSED, and the VERIFICATION.md gap that named it is STALE.** A `/gsd-debug`
session took a live `sample` of the hung process: 4185/4185 samples in one identical frame chain,
naming a **reentrancy self-deadlock on tao's `EventLoopHandler` handler mutex** — wry's blocking
`WebviewWindow::cookies()` reentrantly pumps `NSRunLoop::mainRunLoop()` from inside
`handle_user_message`, itself inside `with_callback` which already holds tao's handler `Mutex`; a
CoreAnimation flush drives tao's redraw path into relocking the mutex it owns. Candidates (a) and
(b) from the gate document are **FALSIFIED**; (c) is SUBSUMED, not eliminated. **A timeout cannot
fix this** — the block sits below where any Tauri-side receive timeout lives. Fixed in `6bad86227`
by the async `WKHTTPCookieStore.getAllCookies(completionHandler:)` pattern, live-verified across
four independent channels. `34.4.2-VERIFICATION.md`'s gap 1 therefore asks for a discriminator and
a timeout that are both already known to be wrong answers, and plan 18 corrects it in place.

Two further contract-authoring defects are in scope: **F-34.4.2-11** (the mandatory truncating
`tee` colliding with a mandatory mid-run relaunch — items 3 and 5 PASSED on the operator's word
alone) and **F-34.4.2-14** (three required lines demanded of the terminal transcript when they are
sidecar `logInfo` output landing in `gamelib.log`, which itself rotates on every launch). Both are
fixed by a dual-sink append-and-archive capture standard, and the Structural Reachability Review
gains a **fifth defect-class test whose unit of review is the requirement PAIR** — the class that
structurally could not be caught by four per-requirement tests.

- [x] 34.4.2-17-PLAN.md — Port `humble_login_cookies` (the `watchForLogin()` poll direction, the debug session's own recorded residual) onto the async `WKHTTPCookieStore` pattern, macOS-gated, non-macOS byte-unchanged (D-09); make the F-34.4.2-12 regression pin **shape-robust** across all three cookie-reading arms — substring detection with comment skipping, a minimum found-count, and a split-line self-test — replacing the two literal call-site prefixes that would have missed the `window` / `.cookies()` form already present at `main.rs:4237-4238` (wave 1)
- [x] 34.4.2-18-PLAN.md — Correct `34.4.2-VERIFICATION.md`'s gap-1 record in place (two `missing:` bullets marked CLOSED with `6bad86227`, candidates (a)/(b) FALSIFIED, (c) SUBSUMED, the timeout shape called wrong); give F-34.4.2-11/-12/-13/-14 and T-34.4.2-43 honest ledger dispositions; and write the **standing** `references/live-gate-contract-authoring.md` — five defect-class tests (Test 3 gains a SINK clause, Test 5 takes the requirement PAIR as its unit) plus the dual-sink evidence-capture standard, indexed in `SKILL.md` so it applies to every future gate contract (wave 2)
- [x] 34.4.2-19-PLAN.md — Author `34.4.2-LIVE-GATE-RERUN-4.md` (`verdict: null`), **all six items re-measured, none inherited** (D-F1); every required literal annotated with the sink that actually carries it; item **6(b) ordered FIRST in its own launch** so a 6(a) regression cannot foreclose it a sixth time; item 6(a) carrying dual-channel evidence (the `gamelib.log` census line plus the `humble_store/config.json` filesystem proof); the five-test Structural Reachability Review run and recorded BEFORE any live run. **Forbidden from running any item** (D-E) (wave 3)
- [x] 34.4.2-20-PLAN.md — **BLOCKING live gate** on real macOS hardware against `34.4.2-LIVE-GATE-RERUN-4.md`; sole writer of `verdict`/`run_date`/`items_passed`; dual-sink per-launch capture with delimiters and `gamelib.log` archiving; a `sample` capture mandated before any force-kill; requirement boxes tick **if and only if** the verdict is a genuine 6/6 (D-08), enforced mechanically by the task's own verify command (wave 4, non-autonomous) — **RAN 2026-08-06, VERDICT FAIL, items_passed 1/6** (item 6(b) the sole PASS, its first-ever measured result this phase; items 1/2 FAIL, item 3 NOT ATTEMPTED, item 4/6(a) never reached, item 5 UNREACHABLE by contract defect). New findings F-34.4.2-15..18 (F-A/F-B/F-C/F-D), new threat T-34.4.2-44. See `34.4.2-LIVE-GATE-RERUN-4.md` and `34.4.2-20-SUMMARY.md`. **Phase 34.4.2 STILL DOES NOT CLOSE** — gap cycle 5 required, `/gsd-plan-phase 34.4.2 --gaps`.

**Gap cycle 4 outcome (plan 20 RAN, 2026-08-06): FAIL, 1/6, item 6(b) the sole PASS — a genuine
6/6 was NOT achieved, so gap cycle 4 does NOT close the phase.** Item 6(b) (the Epic absence check)
finally earned a measured result — PASS — after being foreclosed by something upstream in all five
prior gate runs; the reordering fix (running it alone, first, in its own launch) worked exactly as
designed. Every other item recorded a non-PASS, but for reasons this run itself distinguishes
sharply from the previous cycle's undiagnosed main-thread wedge: **three of the five non-passes are
themselves contract defects**, not diagnosed app bugs — F-34.4.2-15/F-A (a concurrent second
`gamelib-shell` instance split the `[shell]` evidence sink mid-session), F-34.4.2-16/F-B (item 4's
premise is invalidated by a pre-existing WKWebView Humble session the contract never clears), and
F-34.4.2-17/F-C (item 5's scenario cannot be driven from the UI at all, a gap in the Structural
Reachability Review's own Test 2). Items 1 and 2 recorded incomplete/evidence-gap FAILs directly
attributable to F-A/F-B, not to a live-confirmed regression of either mechanism. **Gap cycle 5 is
required**, `/gsd-plan-phase 34.4.2 --gaps`, scoped against:

- **F-34.4.2-15/F-A:** add an exactly-one-`gamelib-shell`-instance assertion to the dual-sink
  evidence-capture standard, checked and recorded at both launch and teardown.

- **F-34.4.2-16/F-B:** add a WKWebView Humble cookie-jar-clearing step (not just an app-side store
  check) before item 4 begins, so a carried-over session cannot invalidate its premise again.

- **F-34.4.2-17/F-C:** item 5 as written can never PASS from the UI — rewrite it to drive the
  refusal below the UI, restate it as a structural/unit-level assertion, or withdraw it as already
  covered by Plan 14's own mutation-proven guard test.

- **F-34.4.2-18/F-D:** add a pre-existing-`gamelib-shell`-instance preflight check alongside the
  existing DummyStore port check.
No new REQ ID was minted, deleted, or renumbered by gap cycle 4's own run; REQ-34.4.2-01/-02/-03/-04/
-05/-06/-09 all carry a dated note recording this run's result, with no box changed, per D-08's
no-partial-pass rule.

**Gap-cycle-3 scope note:** WR-02, WR-05, WR-08, IN-01, IN-03 and IN-04 stay deferred and unfixed.
WR-06 (the poster's debounce-eviction fairness) and the standing plan-09 finding (the glyph's un-gated
cross-platform injection) are both retired by plan 13's deletion rather than fixed — an inert
unlabelled key icon on Windows/Linux was owed work for three plans, and the fix that landed was
deleting the icon everywhere. No new REQ ID is minted; REQ-34.4.2-04/-05 are rewritten in place with
the removal as their verifiable claim, and every box stays `[ ]` until plan 16 records a measured
result.

**Gap cycle 3 outcome (plan 16 RAN, 2026-08-05): FAIL, 5/6, item 6 the sole FAIL — a genuine 6/6
was NOT achieved, so gap cycle 3 does NOT close the phase.** Items 1-5 all PASSED (items 3/5 for
the first time ever, items 1/2/4 re-measured against changed source); item 6 FAILED on a NEW
blocking defect (F-34.4.2-12, a hard main-thread wedge on Humble disconnect, force-kill required)
that item 6(a) newly discovered — item 6(b) (Epic) was consequently NOT ATTEMPTED. **Gap cycle 4
is required**, `/gsd-plan-phase 34.4.2 --gaps`, scoped against:

- **F-34.4.2-12 (BLOCKING):** the Humble disconnect main-thread wedge. No root cause is asserted;
  three candidate layers are recorded in `34.4.2-LIVE-GATE-RERUN-3.md`'s own findings section and
  `deferred-items.md` (plan 13's shared `.on_navigation(` closure edit; plan 14's single-flight
  latch's hidden-window interaction, unconfirmed live; the pre-existing F-34.4.2-10 exfil-channel
  wait) — a discriminator test is owed before any fix is attempted, per this phase's own standing
  lesson against shipping correlation as cause.

- **F-34.4.2-11 (non-blocking, but owed before items 3/5 are ever re-measured again):** the gate
  contract's own evidence-capture instruction (mandatory `tee` without `-a`) is mutually
  destructive with item 3(c)'s mandatory relaunch — a fifth contract-authoring-defect instance,
  and the first that is an interaction between two individually-reachable requirements rather than
  a single unreachable one. The next contract-authoring plan should fix the evidence-capture
  instruction itself (append `-a`, or use a per-launch uniquely-named log file) before item 6 (and,
  if still needed, items 3/5) are re-run.

- **Item 6(b) (Epic) remains unattempted** across every gate run to date except gate run 2 — a
  fresh attempt is owed once item 6(a)'s wedge is fixed and the run can reach it.
No new REQ ID was minted, deleted, or renumbered by gap cycle 3's own run; REQ-34.4.2-04/-05/-09
all stay `[ ]` per D-08's no-partial-pass rule — item 3's own PASS does not tick 04/05 while item
6 FAILs elsewhere in the same contract.

### Phase 34.5: Tauri IPC re-plumb slice 8 — non-Steam runners, Wine and shortcuts (INSERTED)

**Goal:** Port the **inherited non-Steam runner surface** (**57 channels** — the largest slice): Epic/GOG/Amazon/Zoom auth, sign-out, saves sync and CLI versions; the EOS overlay cluster; Wine version/runtime management and tooling (DXVK, VKD3D, winetricks); desktop shortcuts, add-to-Steam and SteamGridDB artwork. Carried across rather than dropped per the Phase 35 discussion — the keep/drop call is deliberately deferred to this phase own discuss-phase. Additive and reversible — the Electron build keeps working unchanged.

> Count corrected 2026-07-29: this line read **55** and was stale by two reassignments already recorded elsewhere — `callTool` (34.1 **D-14**, 55→56) and `isLoggedIn` (34.4 **D-03**, 56→57). `IPC-PORT-INVENTORY.md` § "Phase 34.5" was already correct at 57; its channel list was counted directly to confirm (57 entries, 57 unique, no duplicates). The inventory remains authoritative for the work-list.

**Requirements:** REQ-34.5-01..13 (minted 2026-07-29 during `/gsd-plan-phase 34.5`; **38 channels ported, not 57** — Zoom's 3 dropped permanently per D-02, 16 deferred to a newly-required Phase 34.6 per D-03/D-05)
**Depends on:** Phase 34, **and Phase 34.4.1** (the login seam — see the correction note below). Independent of slices 34.1/34.2/34.3, which may run in any order or in parallel.

> Dependency corrected 2026-07-29: this line previously read "independent of the other slice-4..8 phases — these may run in any order or in parallel", which **contradicted three other statements in the record** and predated 34.4.1's insertion. Phase 34.4.1's own block states "**Blocks:** Phase 34.5 (Epic/GOG/Amazon logins use the identical seam)"; its Goal states it "runs **before Phase 34.5** rather than after: 34.5's three logins depend on it"; and `IPC-PORT-INVENTORY.md` states "**This phase runs BEFORE Phase 34.5**". 34.4.1 was inserted *specifically* because the `<webview>`/`session.fromPartition` seam is cross-cutting and 34.5 needs it (34.4 **D-01/D-02**).
>
> **What this dependency does and does not block.** The seam itself is BUILT and unit-proven — 8 of 9 of 34.4.1's plans are executed, the runner-agnostic child-window mechanism is deliberately Humble-agnostic, and 34.4.1-09 already **wired** all four OAuth runners via the new `oauthCaptureLogin` channel with a declared-blocked UI surface naming each runner's unported channel. So 34.5 may be **discussed and planned now**. What is still outstanding is 34.4.1's *live proof* (plan 08's blocking 4-item gate, plus item 3(b) already recorded BLOCKED-UNOBSERVABLE and headed for a gap cycle). 34.5 must not **ship** a real OAuth credential path on a seam whose live gate never ran.
>
> **Inherited obligation, not a note — `T-34.4.1-44b`.** nile and zoom capture via a **host-free param match** inherited from the Electron original. This is harmless in 34.4.1 only because the captured value is handed to a channel that rejects. **34.5 MUST host-anchor both before it mints a real credential.** Also inherited: navigation observation (NOT the cookie read) is the actual seam surface, and 34.4.1 RESEARCH Open Question 1 — in-app `on_navigation` cancellation timing — remains unobserved.
**Plans:** 53/60 plans executed (48 of 48 pre-cycle-7 in-scope; 9 gap-cycle-7 plans 34.5-52..60 added 2026-08-13, 5 executed — 34.5-52, 34.5-53, 34.5-54, 34.5-55, 34.5-57; 3 halted/superseded — see below; **34.5-59 BLOCKED pending `F-34.5-G6-22`, per `34.5-CYCLE7-REVIEW.md`'s `halt_gate: true`**)
44 `*-SUMMARY.md`). **34.5-29/30/31 are HALTED and SUPERSEDED, not pending** — as of 2026-08-13 each
carries a `type: superseded`, `executed: false` SUMMARY recording its disposition, so it no longer
reports as outstanding work; their `[ ]` checkboxes stay deliberately unticked and their PLAN files
byte-unchanged. Gap cycle 5 added plans 34.5-38..42 on 2026-08-02: 34.5-38 —
authorisation/disposition/measured-baseline record; 34.5-39 — item-4/item-5 gate preflight;
34.5-40 — authored `34.5-LIVE-GATE-RERUN-2.md`, the third blocking gate contract, `verdict: null`;
34.5-41 — RAN the third blocking gate on real hardware, **VERDICT FAIL 0/5** (see below); 34.5-42
— propagated that verdict and closed the cycle. Gap cycle 6 added plans 34.5-43..51 (9 plans, 4
waves) on 2026-08-11, of which **34.5-43, 34.5-44, 34.5-46, 34.5-47 and 34.5-48 are now executed**
(34.5-43: `getInstallInfo` ported to the sidecar, F-34.5-G6-10, inventory/gate reconciled to
39+3+16=58; 34.5-44: single-instance guard + deep-link delivery, F-34.5-G6-09, ledger row
U-34.5-16 retired; 34.5-46: `handleLaunch` made runner-aware and fail-closed through
`libraryManagerMap`, closing the confused-deputy defect that sent every runner's launch to
`steam://rungameid`, plus a test-covered `eb117d9e4` verdict for the uninstall-tile-staleness
symptom; 34.5-47: fixed-literal `origin` threaded through all 15 `refreshLibrary` call sites with
a literal-only source-text gate, plus a live discriminator for the Manage Accounts "logging into
gog" symptom resolving READING NONE / non-reproduction; 34.5-48: closed the EOS overlay UAT
test-16 gap — `callOrDeclare()` plus an `AdvancedSettings/index.tsx` rewrite so the EOS panel
declines visibly under Tauri, a call-site source-text gate RED-proven against three injected
known-bad inputs, and a correction of `34.5-PORTED-CHANNELS.md`'s falsified "no new code needed"
claim)
; 34.5-45 (real `sips`-backed `nativeImage` shim + quoted/percent-encoded `run.sh`, closing the
injection surface), 34.5-49 (full preload-surface audit, 217 channels, 11 previously unlisted, all
bucketed) and 34.5-50 (authored `34.5-LIVE-GATE-RERUN-3.md`, the fourth blocking gate contract)
also now executed — **all 9 gap-cycle-6 plans complete.** 34.5-51 **RAN the fourth blocking gate
on real hardware 2026-08-12: VERDICT FAIL** (`items_passed=2, items_failed=1, items_blocked=0,
items_not_attempted=1` — see below). 48 of 48 in-scope plans are complete (39 pre-cycle-6 + 9
cycle-6). Dispositions for 34.5-29/30/31: `34.5-CYCLE5-ROUTING.md`.

**2026-08-13 — gap cycle 7 PLANNED: 9 plans (34.5-52..60) across 6 waves.** Built from
`34.5-CYCLE7-ROUTING.md`'s ten-item work-list as modified by three binding operator decisions.
**D-CYCLE7-A**: item 1's fix is an **in-page origin banner** reusing the mandated cancel strip's own
injection mechanism — child-window attachment is permanently closed and sheet presentation is
SHIPPED and live-PASSED, so the routing document's first option is factually unavailable;
`U-34.5-05`'s transcription bar is RE-TARGETED to that element rather than retired.
**D-CYCLE7-B**: routing items 5 (`U-34.5-29`, Amazon library population) and 9 (`U-34.5-27`, a real
GOG `.ico`) are OUT of scope for cycle 7 — both need an operator-supplied fixture that does not
exist — recorded with `blocked_on: operator-supplied test fixture`, both rows staying OPEN, and
neither able to affect the gate's required 4/0/0/0. **D-CYCLE7-C**: the keyring arm
(`U-34.5-01`/`U-34.5-10`) gets its own **non-blocking** session outside the gate, screen unlocked.

Planning falsified three of its own briefs, each verified against current source:
**`F-34.5-G6-19`** — `F-34.5-G6-18`'s claim that DXVK's install direction "never calls
`runWineCommand`" is WRONG (the `reg add ... DllOverrides` loops at `tools/index.ts:438`/`:459` do,
after the copy), and the emitter is `launcher.ts:1520` (`logDebug`), not `1581`; without this
correction a DXVK-ON PASS would have retired nothing, because `runWineCommand` executing for a
non-Steam runner IS item 4's subject. **`F-34.5-G6-20`** — a SECOND nile credential-log site at
`nile/user.ts:62` leaking the PKCE `code_verifier` at INFO level, unobserved by any gate; both sites
are GameLib-side logger calls, which closes `F-34.5-G6-17`'s open question.
**`F-34.5-G6-21`** — the SteamGridDB/winetricks sweep command greps CHANNEL names against
API-METHOD-name space, so it structurally could not find two real call sites; the census is 10, not
8, and the two missed sites are the worst shape (a `catch` that substitutes an empty array).

Waves: (1) 34.5-52 origin banner, 34.5-53 nile redaction, 34.5-54 DXVK evidence-line pinning;
(2) 34.5-55 SteamGridDB/winetricks honest decline; (3) 34.5-56 authors the fifth gate contract
`34.5-LIVE-GATE-RERUN-4.md` with its seven-test Structural Reachability Review, 34.5-57 code review
(sequenced BEFORE the sweep, so its findings can still be ledgered); (4) 34.5-58 the non-gate
keyring session; (5) 34.5-59 RUNS the fifth gate; (6) 34.5-60 propagates the verdict and resolves
the ledger row by row. Next step: `/gsd-execute-phase 34.5`.

**2026-08-14 — 34.5-52 EXECUTED** (F-34.5-G6-16 code fix): `login_origin_banner_script` /
`login_origin_banner_update_script`, RED-proven `#[cfg(test)]` coverage, wired into
`humble_login_open`'s macOS visible arm alongside the mandated cancel strip. `U-34.5-05`
RE-TARGETED (not retired) to the banner per D-CYCLE7-A; `U-34.5-31` opened for the banner's own
spoofability residual (31 rows). `F-34.5-G6-16` itself stays OPEN pending live transcription —
this plan is the code half only, per D-CYCLE7-A's own closing condition.

**2026-08-14 — 34.5-53 EXECUTED** (`F-34.5-G6-17`/`F-34.5-G6-20` code fix, gap-cycle-7 routing
item 4): `redactNileLoginData`/`redactNileRegisterData` route both nile credential-logging call
sites (`NileUser.login`'s `logDebug`, `NileUser.getLoginData`'s `logInfo`) through redaction —
lengths, presence booleans, and (login-data only) the authorize URL's host, never the raw OAuth
`code`, PKCE `code_verifier`, or full URL. Both lines kept, not deleted. RED-proven behavioral +
source-text gate (`nileCredentialRedaction.test.ts`, 9/9 passing) against three known-bad inputs
(each raw call site individually restored, plus a synthetic third unswept logger call). `npm run
test:ci`: 4809 -> 4818 passed, 246 -> 247 suites, no regressions. Both findings fixed AND
diagnosed on the record (GameLib-side logger calls, not nile stdout) — live confirmation in a
real `gamelib.log` is explicitly deferred to the wave-5 live gate (plan 34.5-59), not claimed
here. Next: 34.5-54.

**2026-08-14 — 34.5-54 EXECUTED** (`F-34.5-G6-19` correction of `F-34.5-G6-18`, gap-cycle-7
routing item 3): created `dxvkEvidenceLines.test.ts`, a 7-assertion RED-proven source-text gate
pinning the corrected DXVK-toggle evidence set — the install dispatch marker
(`tools/index.ts:369`) and its ordering before the early return, the install direction's genuine
`runWineCommand` calls via the `reg add`/`native,builtin` registration loops at `:438`/`:459`, the
restore direction's `wineboot -u`/`reg delete` ordering, the version-marker write, and
`launcher.ts:1520`'s `logDebug` emitter (not `:1581`'s assumed `logInfo`). RED-proved against
three injections (renamed marker, reordered early return, stripped `reg add` loops), each
producing a non-vacuous failure; restored to a byte-identical `git diff` on `tools/index.ts`
(confirmed empty). Recorded `F-34.5-G6-19`/`-20`/`-21` in `deferred-items.md` (items 29-31) as
findings against findings, none from a live run. `npm run test:ci`: 4818 -> 4825 passed (+7,
matching the new assertions), no regressions. Explicitly does NOT prove a live DXVK toggle works —
`U-34.5-30` stays NOT ATTEMPTED, owed to the wave-5 live gate (plan 34.5-59). Next: 34.5-55.

**2026-08-14 — 34.5-55 EXECUTED** (closes routing item 8, `U-34.5-25`): all 10 SteamGridDB
(7 sites, 5 channels) and winetricks (3 sites, 3 channels) call sites now route through
`callOrDeclare()` with a visible decline — the API-key field disables with an unavailable notice,
the "has key" answer becomes UNKNOWN-AND-UNAVAILABLE rather than false, the picker's generic
try/catch is replaced by the declared result, and the Winetricks panel's `declined` state never
substitutes an empty component array; the one send-kind `winetricksInstall` call is gated behind
`WINETRICKS_DECLINED_GUARD` instead of wrapped. Census corrected 8 -> 10 (`F-34.5-G6-21`): the
fourth gate's own sweep grepped CHANNEL names (`winetricksAvailable`/`winetricksInstalled`)
against the PRELOAD API-METHOD-name space the frontend actually calls
(`winetricksListAvailable`/`winetricksListInstalled`), so it could never match the two real
call sites in `Winetricks/index.tsx`. `DeferredChannelCallSiteGuard.test.ts` RED-proven four
separate ways — a natural capture against the real unwrapped source before any wrapping, plus
three synthetic injections (an unwrap, a full deletion, a removed guard token), each restored
byte-identical. Live-discovered Rule 1 fix along the way: `meta/hardcodedStringGate.test.ts`
(D-12, blocking) flagged real violations — a locally-declared feature-name variable and a dotted
channel-name object-property literal — in the two files this plan edits that ARE in the gate's
scope (`EditGameDialog/index.tsx`, `SideloadDialog/index.tsx`); fixed by centralizing those
strings as exports in `declaredUnavailable.ts`, which the gate's scope file does not cover.
`npm run test:ci`: 4825 -> 4832 passed (+7, matching the new gate's assertions), no regressions.
`34.5-UNTESTED-ITEMS.md`: `U-34.5-25` RETIRED on the corrected-sweep observation, scoped
explicitly to the source-level treatment only; `U-34.5-32` opened in the same commit for the
live-observation half (mirrors `U-34.5-24`'s identical split for the EOS cluster), 32 rows.
Nothing in this plan has been observed live under a real Tauri webview. Next: 34.5-56.

**2026-08-14 — 34.5-57 EXECUTED** (cycle-7 code review, run BEFORE the gate and BEFORE the
propagation sweep, per this project's own measured lesson that a review run after the sweep is
unledgered by construction). Nine authoring-time defect-class passes run against the union of
plans 34.5-52/-53/-54/-55's diffs — vacuous-assertion sweep, all twelve required RED captures
individually verified PRESENT, both temporary-edit restoration proofs re-run from HEAD, production
call-shape checks, grep-gate self-reference check, localisation/`hardcodedStringGate`, scope
discipline on the HALTED 34.5-29/30/31, the full additive/reversible invariant (`tsc` clean;
`cargo check`/`test` 147/0/1; `npm run test:ci` 4832/1/0 across 249 suites; both Python IPC gates
exit 0), and the phase's own seven-class redaction sweep over the cycle's commits (clean, proven
non-vacuous first). All nine PASS on the cycle's own diff — but an independent trace beyond the
plan's own checklist, following `NileUser.login()`'s `runRunnerCommand` call into the shared
`callRunner()` in `src/backend/launcher.ts`, found a real, currently-live leak:
**`F-34.5-G6-22` (blocker)** — the PKCE `code_verifier` is written unredacted to `gamelib.log` on
every real `NileUser.login()` call, via a pre-existing call site (`launcher.ts:1704`'s `logInfo`)
that plan 34.5-53 never touched; `getRunnerCallWithoutCredentials` (`launcher.ts:1888`) only
redacts `--code`/`--token` array members, never `--code-verifier`, and
`nileCredentialRedaction.test.ts`'s Group A mocks `runRunnerCommand` entirely so it cannot reach
this code path. This falsifies plan 34.5-53's own closing claim that neither the code nor the
`code_verifier` reaches `gamelib.log` in cleartext any more — true only for the two call sites
inside `nile/user.ts` itself. `F-34.5-G6-23` (note, non-blocking) also recorded: the
`winetricksInstall` send-kind exemption in `Winetricks/index.tsx` is correct reasoning only while
all three winetricks channels port atomically (currently true per `IPC-PORT-INVENTORY.md`'s
Slice-9 grouping), flagged for Phase 34.6's own live verification. Recorded in
`34.5-CYCLE7-REVIEW.md` with **`halt_gate: true`** — **plan 34.5-59 (the fifth blocking live gate)
must NOT launch until `F-34.5-G6-22` is fixed by a new plan inserted before wave 5 and this review
is amended to `halt_gate: false`.** The fix is not applied inline in plan 57 itself — this plan's
own file scope is read-only-review (its own Task 1 `<files>` tag and Task 2's single-file
`git diff --stat` acceptance criterion), overriding the plan's secondary "fixable within two
files" allowance by deliberate decision, recorded in `34.5-57-SUMMARY.md`. Next: 34.5-56 and
34.5-58 (independent of each other and of this plan); **34.5-59 BLOCKED pending `F-34.5-G6-22`.**

**PHASE DOES NOT CLOSE.** The blocking 5-item live gate (`34.5-15-PLAN.md`) ran
2026-08-01 and FAILED (0/5 PASS) — see `34.5-LIVE-GATE.md` and `34.5-15-SUMMARY.md`. Gap cycle
`34.5-16` through `34.5-18` fixed the single diagnosed root cause (a wrong `publicDir` under the
sidecar — 4th recurrence of the `publicdir-getapppath-chunking` family) and closed the
gate-contract defect in the old precondition 5. Plan `34.5-19` authored a RE-RUN contract,
`34.5-LIVE-GATE-RERUN.md`, and plan `34.5-20` executed it on real hardware 2026-08-01: **FAIL
again, 0 of 5 clean** (3 FAIL — items 1/2/3 — and 2 NOT ATTEMPTED — items 4/5). The RE-RUN proved
the `publicDir` root cause CLOSED (all four runner binaries `exists=true`, no asset-root defect
line, items 2/3 both reached backend `status=captured` for the first time this phase) but
surfaced a NEW, downstream-of-capture defect: Epic's login form never becomes interactive, and
GOG/Amazon's successful backend captures are never consumed into a completed, UI-visible,
library-populated login.

Gap cycles 3 and 4 (plans `34.5-22`..`34.5-37`) diagnosed and fixed that layer without ever
re-running the gate. **Gap cycle 5 (plans `34.5-38`..`34.5-42`) authored and RAN the third
blocking gate on 2026-08-02** — contract `34.5-LIVE-GATE-RERUN-2.md` written with `verdict: null`
before any live work, executed by plan `34.5-41`: **FAIL, 0 of 5 clean** — `items_passed: 0`,
`items_failed: 2` (items 2, 4), `items_blocked: 1` (item 1, Epic, entering BLOCKED per D-CYCLE5-A
with the parked pre-auth defect as its cause), `items_not_attempted: 2` (items 3, 5). The four
counters reconcile to 5. Per D-08, **the phase still does not close.**

What the third run nevertheless earned, stated without inflation:

- **F-34.5-G6-02 is CLOSED, live-proven.** GOG's full backend chain — capture → `gogdl auth` →
  `refreshLibrary complete runner=gog managers=1` → 7 titles persisted to
  `store_cache/gog_library.json` — ran end to end, and
  `[useTauriOAuthLogin] runner=gog phase=idle (login completed, library refresh triggered)` fired
  **twice** where run 2 produced six backend terminal outcomes and zero such lines. The failure
  moved again, to a frontend-render layer: the data lands and the UI shows nothing.

- **Items 4 and 5 carry a result for the first time in this phase's history**, after being
  silently skipped by both prior runs. Item 4 FAIL, with three named root causes (a dead
  `nativeImage` sidecar stub, `addToSteam` returning `undefined`, and Electron-shaped Steam
  LaunchOptions the Tauri shell ignores). Item 5 NOT ATTEMPTED — but as an explicit, recorded
  refusal naming its blocking prerequisite, not a drift.

- **Ledger row `U-34.5-09` retired**, live-proven twice.

⚠ **A Phase 35 precondition surfaced that is larger than this gate**: `getInstallInfo` is unported
AND absent from `IPC-PORT-INVENTORY.md` entirely (F-34.5-G6-10), so that document's own
"Phase 35 must not run while any channel below is unported" rule cannot catch it. The extent of the
inventory's incompleteness is UNKNOWN and must not be assumed to be one channel.

See `34.5-LIVE-GATE-RERUN-2.md` for the third run's full evidence, `34.5-CYCLE5-ROUTING.md`
§ Outcome for the routing decision, `deferred-items.md` items 13-22 for the nine new findings, and
`34.5-42-SUMMARY.md` for this propagation pass.

**Gap cycle 6 (plans `34.5-43`..`34.5-51`) authored and RAN the fourth blocking gate on
2026-08-12** — contract `34.5-LIVE-GATE-RERUN-3.md` written with `verdict: null` before any live
work (by plan 34.5-50), executed by plan `34.5-51`: **FAIL** — `items_passed: 2` (item 2 Amazon
login, item 3 shortcuts), `items_failed: 1` (item 1 GOG login, on a single clause), `items_blocked:
0`, `items_not_attempted: 1` (item 4 Wine). The four counters reconcile to 4. Per D-08, **the phase
still does not close.**

What the fourth run earned, stated without inflation:

- **Items 2 and 3 both PASSED, independently verified from disk and log, not taken on the
  operator's report alone.** Item 2: real Amazon login end to end, `www.amazon.com` host anchor
  CONFIRMED (Assumption A1). Item 3: both `exe` call sites confirmed byte-exact from disk
  (`shortcuts.vdf`'s `Exe` field matching `GAMELIB_SHELL_EXE` character for character, and the
  `.app`/`run.sh` shortcut correctly quoted/percent-encoded), addToSteam's resolved value
  cross-checked across two independent components, two independent real-game launches both showing
  the clean single-instance flow — driven through the REAL UI buttons after the DevTools console
  was confirmed unusable on this build mid-run, not through the console invocations the original
  contract prescribed.
- **Item 1 FAILED on one clause, root-caused rather than merely observed absent.** The GOG login
  mechanism itself worked cleanly (8 of 9 clauses PASS: capture, CLI auth, library population,
  account surface, Manage Accounts resolution) — but the anti-phishing origin-title clause FAILS
  because the feature has been established as genuinely ABSENT on macOS: the login window is
  unconditionally presented as a titleless AppKit sheet (a Phase 34.4.2 fix), so Plan 34.5-27's
  origin-prefixed title is set correctly on the underlying `NSWindow` but never visible to the
  user (`F-34.5-G6-16`). By explicit developer decision this is FAIL, not BLOCKED — the observation
  is complete and positive, not merely unreachable. This is a code defect requiring a fix, not a
  re-run.
- **Item 4 (Wine) is NOT ATTEMPTED, and a second contract defect was found alongside it.** The
  wineVersion-repoint prerequisite is independently confirmed, but the DXVK-toggle action itself
  was never clicked — a stale, week-old setting already showed the switch ON, and no click ever
  happened. This gate's own contract also cited the wrong "definitive" evidence line for this
  action (`F-34.5-G6-18`): the install/backup direction never calls `runWineCommand` at all.
- **7 ledger rows retired** on their own named observations (`U-34.5-02/07/08/12/13/15/17`),
  **2 new rows opened** (`U-34.5-29` Amazon library population never observed by any run to date —
  the test account owns zero games; `U-34.5-30` the DXVK toggle never actually exercised),
  `34.5-UNTESTED-ITEMS.md` now 30 rows.

See `34.5-LIVE-GATE-RERUN-3.md` for the fourth run's full evidence, `34.5-CYCLE7-ROUTING.md` for
the gap-cycle-7 work-list, `deferred-items.md` items 25-28 for the new findings, and
`34.5-51-SUMMARY.md` for the full execution record.

Plans:

- [x] 34.5-01-PLAN.md — Wave-1 seam 1: pathShim desktop/exe/documents + GAMELIB_SHELL_EXE on both Rust spawn paths + pathShim.test.ts (wave 1)
- [x] 34.5-02-PLAN.md — Wave-1 seam 2: host-anchor nile's redirect match on www.amazon.com, closing T-34.4.1-44b (wave 1)
- [x] 34.5-03-PLAN.md — 34.5-LIVE-GATE.md written empty + Phase 34.6 inserted into ROADMAP + inventory reconciled 38/3/16 (wave 1)
- [x] 34.5-04-PLAN.md — The four registration modules declared, wired into handlers.ts and wiring-proven (wave 1)
- [x] 34.5-05-PLAN.md — Register the runWineCommand seam (D-14 / seam 3) + probes + wine version management, 6 of 9 (wave 2 — seam 3 cannot be wave 1: every registration depends on 34.5-04's modules)
- [x] 34.5-06-PLAN.md — Epic + GOG auth, 7 channels incl. the logoutGOG send asymmetry and the Epic sign-out ordering fix (wave 2)
- [x] 34.5-07-PLAN.md — 4 runner CLI version probes + 2 runtime channels (wave 2)
- [x] 34.5-08-PLAN.md — Shortcuts A: 3 send channels + shortcutsExists + electronStub reload/openDevTools no-ops (wave 2)
- [x] 34.5-09-PLAN.md — DXVK/VKD3D toggles, completing the Wine cluster at 9, + the dialog-already-safe verification (wave 3)
- [x] 34.5-10-PLAN.md — Amazon auth, completing the auth cluster at 11 (wave 3)
- [x] 34.5-11-PLAN.md — Shortcuts B: addToSteam/removeFromSteam/isAddedToSteam + the unset-exe loud-throw pin (wave 3)
- [x] 34.5-12-PLAN.md — callTool/egsSync/getGOGLinuxInstallersLangs + both saves-sync channels (wave 3)
- [x] 34.5-13-PLAN.md — Reach ledger regenerated by measurement + all-38 completeness + both Discretion sweeps (wave 4)
- [x] 34.5-14-PLAN.md — 34.5-PORTED-CHANNELS.md, 38 rows with honest proof levels, + self-tested gate script (wave 5)
- [x] 34.5-15-PLAN.md — Blocking 5-item live gate under tauri:dev, results recorded and propagated (wave 6, non-autonomous) — **RAN 2026-08-01, VERDICT FAIL 0/5** (items 1/2/3 FAIL: `legendary`/`gogdl`/`nile` binaries `spawn ENOENT` at sidecar startup — wrong `publicDir` under `getAppPath()`/`process.cwd()`; item 4 NOT ATTEMPTED; item 5 FAIL by blockage). Root cause fully diagnosed (`34.5-LIVE-GATE.md` § Root cause) — 4th recurrence of the publicdir-getapppath-chunking family. **Phase 34.5 DOES NOT CLOSE** — gap cycle required.

**Cross-cutting constraints:**

- Nothing in this plan claims a live behaviour on the strength of a passing test
- Neither prior gate document is modified — each remains the record of its own failed run
- None of the three prior gate documents is modified, overwritten or deleted

Gap cycle (planned 2026-08-01 via `/gsd-plan-phase 34.5 --gaps`; waves restart at 1 for this cycle):

- [x] 34.5-16-PLAN.md — App-root consumer sweep + `GAMELIB_APP_ROOT` handed down from both Rust spawn paths + `electronStub.getAppPath()` consumes it (gap wave 1)
- [x] 34.5-17-PLAN.md — Existence-checked `archSpecificBinary` x64 fallback + real-filesystem coverage under sidecar-like cwd (`src-tauri/`) (gap wave 2)
- [x] 34.5-18-PLAN.md — Sidecar boot logging of the `GAMELIB_SHELL_EXE` it actually received + asset-root self-check, closing the precondition-5 gate-contract defect (gap wave 2)
- [x] 34.5-19-PLAN.md — `34.5-LIVE-GATE-RERUN.md` authored with `verdict: null`, 7 preconditions, all 5 items incl. the never-attempted item 4 (gap wave 3)
- [x] 34.5-20-PLAN.md — **BLOCKING live gate RE-RUN**, all 5 items on real hardware (gap wave 4, non-autonomous) — **RAN 2026-08-01, VERDICT FAIL 0/5** (items 1/2/3 FAIL: Epic's login form never becomes interactive 0/3 captures; GOG/Amazon both reach backend `status=captured` but nothing consumes the capture into a completed login; items 4/5 NOT ATTEMPTED). `publicDir` root cause CONFIRMED CLOSED (precondition 4); Assumption A1 CONFIRMED. See `34.5-LIVE-GATE-RERUN.md`. **Phase 34.5 STILL DOES NOT CLOSE** — another gap cycle required.
- [x] 34.5-21-PLAN.md — Propagation: `34.5-PORTED-CHANNELS.md` LIVE cells, gate script, inventory, ROADMAP, STATE (gap wave 5)

Gap cycle 3 (planned 2026-08-01 via `/gsd-plan-phase 34.5 --gaps`; waves restart at 1 for this cycle).
Scoped against the RE-RUN's six findings (F-34.5-G6-01..06) plus gate items 4 and 5, NOT ATTEMPTED on
both prior runs. Planning established a **second defect layer the RE-RUN did not name**: beyond the
capture never reaching the renderer, `useTauriOAuthLogin` calls the RAW auth channels rather than
`GlobalState.tsx`'s wrappers, so `handleSuccessfulLogin` → `refreshLibrary` never runs — fixing only
the transport would have produced a third FAIL for a different reason (F-34.5-G6-03).

- [x] 34.5-22-PLAN.md — Preserve the gate-run log off the rotation path; diagnose F-34.5-G6-02 to one of three named gap shapes, from source (gap wave 1)
- [x] 34.5-23-PLAN.md — F-G6-02 layer 1: exempt `oauthCaptureLogin` from the 60 s `INVOKE_TIMEOUT`, make the transport failure loud, add the self-tested standing guard (gap wave 2)
- [x] 34.5-24-PLAN.md — F-G6-01 instrumentation: hostname-only nav logging + `GAMELIB_OAUTH_UA_LEGENDARY` override + the discriminator contract, `verdict: null` (gap wave 2)
- [x] 34.5-25-PLAN.md — F-G6-06: diagnose the double Keychain prompt and count the shared arm's blast radius, then dedupe reads and bound the failure memo (gap wave 2)
- [x] 34.5-26-PLAN.md — F-G6-02 layer 2 / F-G6-03: route the captured code through the post-login completion path so the library actually refreshes (gap wave 3)
- [x] 34.5-27-PLAN.md — F-G6-04 origin shown in the login window's own chrome (phishing-resistance) + F-G6-05 light interface style for the login webview (gap wave 3)
- [x] 34.5-28-PLAN.md — Diagnostic live checkpoint: two-arm Epic UA discriminator + one-runner capture-to-library smoke, before committing to the full gate (gap wave 4, non-autonomous)
- [ ] 34.5-29-PLAN.md — **HALTED and SUPERSEDED — never executed, deliberately left unticked and byte-unchanged on disk as the record of its own halt.** Task 1 (the Epic user-agent fix) is VOID by three independent gates: its own cycle-3 `BINDING DECISION: fix-first` self-halt, its own `R1-FALSIFIED` verdict branch, and the second discriminator's `verdict: E1` routing (diagnosis only) combined with `.planning/debug/epic-login-non-interactive.md`'s `## Constraints`, which forbid changing `USER_AGENTS`, `EPIC_LOGIN_URL` or `matchOAuthRedirect`. **Tasks 2 and 3 were RE-HOMED to `34.5-39`** and executed there. Disposition: `34.5-CYCLE5-ROUTING.md`. Do not read this `[ ]` as work left undone.
- [ ] 34.5-30-PLAN.md — **HALTED and SUPERSEDED by `34.5-40`**, which authored `34.5-LIVE-GATE-RERUN-2.md`. Never executed; left unticked and byte-unchanged as the record of its own halt. Disposition: `34.5-CYCLE5-ROUTING.md`.
- [ ] 34.5-31-PLAN.md — **HALTED and SUPERSEDED by `34.5-41`** (gate run + verdict) **and `34.5-42`** (propagation). Never executed; left unticked and byte-unchanged as the record of its own halt. Disposition: `34.5-CYCLE5-ROUTING.md`.

> **Gap cycle 4 planned 2026-08-01.** `34.5-28`'s checkpoint recorded `BINDING DECISION: fix-first` in
> `34.5-G6-EPIC-DISCRIMINATOR.md` § Routing. Plans **34.5-29/30/31 are HALTED — NOT EXECUTED**: the
> blocking five-item gate is neither authored nor run this cycle, and `34.5-29`'s Epic half is void
> because the discriminator selected NO fix (`R1-FALSIFIED`, R2 unconfirmed — do not ship a
> user-agent-only Epic fix). Dispositions and the full cycle-4 map are recorded in
> `34.5-CYCLE4-ROUTING.md`; explicitly-untested items are tracked in `34.5-UNTESTED-ITEMS.md`.
> Two root causes were confirmed at source level during planning: the sidecar's `refreshLibrary`
> handler ignores its runner argument and always refreshes **Steam** (`steamFlowRegistration.ts:62`,
> a Phase 27 walking-skeleton stub), which is why no non-Steam library can populate under Tauri; and
> `useTauriOAuthLogin.ts` discards a completed authentication when its effect is torn down mid-flight.

- [x] 34.5-32-PLAN.md — Record the halt on plans 29/30/31 and open the explicitly-untested ledger (gap-4 wave 1)
- [x] 34.5-33-PLAN.md — Routing items 1+2: make the sidecar `refreshLibrary` runner-aware with per-runner completion logging, and remove `Refreshing undefined Library` (gap-4 wave 1) — closed at the unit/structural level only; both live observables tracked as U-34.5-07/08 on `34.5-UNTESTED-ITEMS.md`
- [x] 34.5-34-PLAN.md — Routing item 4: instrument every OAuth cancellation window, then make cancellation suppress state updates only — never a completed or perishable login (gap-4 wave 1)
- [x] 34.5-35-PLAN.md — Routing item 3: raise the keyring read bound to 45s so a human can win the Keychain approval race, and extend the failure memo past the observed 101s re-read interval (gap-4 wave 1)
- [x] 34.5-36-PLAN.md — Developer-scoped: dev-only secret vault (env-opt-in, loud-warned, production-refused) to remove Keychain prompts as a gate confounder, with the Keychain path tracked as UNPROVEN (gap-4 wave 2)
- [x] 34.5-37-PLAN.md — Routing item 5: pre-registered Electron-vs-Tauri discriminator for Epic, separating "broken by the port" from "broken independently of this project" — ships no fix (gap-4 wave 2, non-autonomous). **DONE 2026-08-01: verdict E1 SELECTED** (Electron's Epic login form accepted a real login; Tauri's stayed non-interactive across two full 300s timeouts) — implicates the Tauri/WKWebView seam specifically. Routes to console/script-error instrumentation, no fix shipped. `U-34.5-06` stays OPEN. Gap cycle 4 (both waves) now fully executed; blocking 5-item gate still not authored/run.

> **Gap cycle 5 planned 2026-08-02** via `/gsd-plan-phase 34.5 --gaps`. This is the cycle that
> AUTHORS and RUNS the blocking five-item live gate cycle 4 deferred. Two binding developer
> decisions govern it: **D-CYCLE5-A** — gate-first; gate item 1 (Epic) enters as **BLOCKED** with
> the parked pre-authentication defect named as its cause, while items 2, 3, 4 and 5 get a real
> attempt (4 and 5 for the first time ever). **D-CYCLE5-B** — the run uses
> `GAMELIB_DEV_SECRET_VAULT=1`, which by the ledger's own binding statement keeps `U-34.5-01` and
> `U-34.5-10` OPEN and forbids treating plan 34.5-35's raised keyring constants as live-proven.
> Because a BLOCKED item is not a PASS, **5 of 5 is unreachable this cycle and Phase 34.5 cannot
> close on it** (D-08 unchanged). Plans `34.5-29/30/31` stay on disk unexecuted as the record of
> their own halt: 29's Task 1 is VOID, 29's Tasks 2-3 are RE-HOMED to `34.5-39`, 30 is superseded
> by `34.5-40`, 31 by `34.5-41` + `34.5-42`. Dispositions and per-verdict routing are recorded in
> `34.5-CYCLE5-ROUTING.md`.

- [x] 34.5-38-PLAN.md — Cycle-5 routing/authorisation record + the MEASURED build baseline that becomes the gate's own precondition floor (gap-5 wave 1) — `34.5-CYCLE5-ROUTING.md` authored, HEAD `c8f314205` measured live (jest 3553/3553, tsc/cargo check/cargo test/gate.py all exit 0)
- [x] 34.5-39-PLAN.md — Re-homed 34.5-29 Tasks 2/3: verified item-4/item-5 preflight (`34.5-G6-ITEM45-PREFLIGHT.md`), incl. the login-dependency analysis that caused both prior skips (gap-5 wave 2)
- [x] 34.5-40-PLAN.md — Author `34.5-LIVE-GATE-RERUN-2.md` with `verdict: null`, eleven preconditions, a Rule-3 known-holes table, and all five items (gap-5 wave 3) — DONE 2026-08-02, ships no code
- [x] 34.5-41-PLAN.md — **BLOCKING live gate, third run**, all five items on real hardware, verdict + four-way arithmetic (gap-5 wave 4, non-autonomous) — **RAN 2026-08-02, VERDICT FAIL 0/5** (`items_passed=0`, `items_failed=2` [item 2 GOG, item 4 shortcuts], `items_blocked=1` [item 1 Epic], `items_not_attempted=2` [item 3 Amazon, item 5 Wine]). Both run-1/run-2 root causes CONFIRMED CLOSED a second time (F-34.5-G6-02 closes: GOG's full backend chain — capture → CLI auth → dispatch → persistence, 7 games — now works end to end); a THIRD, new frontend-render-only failure blocks GOG's Library UI. Items 4 and 5 each got a real result for the first time this phase: item 4 FAIL (three new structural sidecar defects, F-34.5-G6-07/08/09 — `nativeImage` stub, `addToSteam` return type, no single-instance detection); item 5 NOT ATTEMPTED (no `wine`-type Wine version downloaded). U-34.5-09 RETIRES. All four standing research claims remain STANDING. Nine new findings (`F-34.5-G6-07..15`). See `34.5-LIVE-GATE-RERUN-2.md` and `34.5-41-SUMMARY.md`. **Phase 34.5 STILL DOES NOT CLOSE** — gap cycle 6 required.
- [x] 34.5-42-PLAN.md — Propagate the verdict everywhere, resolve the untested-items ledger row by row, close the cycle (gap-5 wave 5) — DONE 2026-08-02; verdict propagated to `34.5-PORTED-CHANNELS.md`, `deferred-items.md`, `IPC-PORT-INVENTORY.md`, `ROADMAP.md` and `STATE.md`; ledger resolved row by row; `34.5-CYCLE5-ROUTING.md` § Outcome filled

### Phase 34.6: Tauri IPC re-plumb slice 9 — EOS overlay, SteamGridDB artwork and winetricks (INSERTED)

**Goal:** Port the **16 channels** deferred by Phase 34.5's **D-03** — EOS overlay (8):
`disableEosOverlay`, `enableEosOverlay`, `getEosOverlayStatus`, `getLatestEosOverlayVersion`,
`installEosOverlay`, `isEosOverlayEnabled`, `removeEosOverlay`, `updateEosOverlayInfo`; SteamGridDB
artwork (5): `steamgriddb.getGrids`, `steamgriddb.getHeroes`, `steamgriddb.hasApiKey`,
`steamgriddb.searchGame`, `steamgriddb.setApiKey`; winetricks (3): `winetricksAvailable`,
`winetricksInstall`, `winetricksInstalled`. Additive and reversible still applies — the Electron
build keeps working unchanged. EOS is Epic (core value) and is not needed to install or launch,
only for overlay features; SteamGridDB is a pure enhancement behind a user-supplied API key;
winetricks is Linux-centric power-user tooling — all three deferred rather than dropped because
Phase 35's cutover requires the IPC re-plumb to be COMPLETE.

`winetricksInstall` is `addListener`/send-kind (`tools/ipc_handler.ts`), same class as this
slice's own send channels — the next slice inherits the send-channel warning (silent failure
under the sidecar) rather than rediscovering it. `callTool`'s `winetricks` branch already works
from Phase 34.5 via `Winetricks.run()` on the shared `tools/index.ts` object — this phase is about
the three dedicated IPC channels above, not about making winetricks work at all.

*Inserted by Phase 34.5 plan 03, 2026-07-29, per 34.5 D-03/D-05.*

**Requirements:** TBD — mint at `/gsd-plan-phase 34.6`
**Depends on:** Phase 34.5
**Blocks:** Phase 35 (the IPC re-plumb must be COMPLETE before cutover)
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 34.6 to break down)

### Phase 34.8: Frontend i18n compliance for fork-added code (INSERTED)

**Goal:** Every fork-added frontend surface is fully translatable via i18next, and a
gate prevents new hardcoded user-facing strings from ever landing again. Audit
2026-08-05 found 4 fork-added files bypassing i18n entirely (~35 strings —
`SteamLogin/index.tsx` alone is ~25: "Steam client not found", "Incorrect username or
password…", etc.; plus `RedeemSteamKeyDialog/copy.ts`, `useTauriOAuthLogin.ts`, and
`bootErrorSurface.ts` which is pre-i18n-boot and may be exempted with a comment) and
fork-added mixed files with stray literals (ConsoleMode store labels, LogSettings
titles, PlatformSupport, etc.). Scope: (1) retrofit all fork-added hardcoded strings
to `t(key, 'Default')`; (2) maintain an explicit allowlist for brand names, units and
platform names (GameLib, Steam, MB/s, Linux/macOS/Windows…) — these stay literal;
(3) run `pnpm i18n` (i18next-parser) to sync the stale en catalogs (en/login.json has
zero Steam keys today) and make it repeatable; (4) add an enforcement gate — either an
eslint rule (react/jsx-no-literals with the allowlist) or a source-scanning extension
to `meta/lintTranslations.ts` — wired into CI/test so violations fail loudly. Gate
must tolerate the repo's dynamic `[key, default]` tuple tables (CrossoverBadge,
LibraryFilters), aliased `t` (`t2`, `tr`), and the deliberate English fallbacks in
`repairFailure.ts`.
**Out of scope:** upstream-inherited Heroic strings (~50, e.g. GOG REDmod, Gamescope,
aria-labels) — churning them is pure merge-conflict surface against upstream; and the
backend error-code contract (~30 English error payloads from Steam
bottle/clientSetup/bridge managers surfacing verbatim in the UI) — that needs its own
design phase (codes over IPC, frontend maps to t() keys) and must not churn
live-verified Steam paths mid-Tauri-migration. Note: fork-minted keys will render
their English defaults in the other 37 locales (Weblate is upstream's) — full key
coverage in `en` + English fallback is the compliance bar here.
*Inserted 2026-08-05 at operator direction: localisation is a standing requirement;
new features (Steam et al.) had shipped hardcoded constants.*
**Requirements:** REQ-34.8-01..17 (minted 2026-08-07 during `/gsd-plan-phase 34.8` from `34.8-CONTEXT.md` D-01..D-22 + `34.8-RESEARCH.md`. Research resolved the two decisions CONTEXT.md left open: the D-16 gate is a new `ts-morph` AST scanner exercised as a `meta/` jest test riding the already-blocking `pnpm test:ci` — **zero new CI YAML** — and D-07's merge-base diff is a committed snapshot, because `actions/checkout@v6` carries neither the Heroic upstream remote nor the merge-base commit. **Two targets named in this phase's own goal text above are resolved to NO CODE CHANGE by measurement, not descoped:** D-21 — ConsoleMode store labels, LogSettings titles and StoreSearch's `STORE_DISPLAY_NAME` are satisfied by extending the do-not-translate glossary with the compound/variant brand forms actually in use (`Amazon`, `ZOOM`, `Epic/Legendary`, `Amazon/Nile`, `Amazon Games`), so those three files need no retrofit; and D-22 — `PlatformSupport.tsx` is DROPPED, a measurement-superseded audit false positive whose only literals are exact glossary matches (`Windows`/`macOS`/`Linux`) and whose one prose string is already `t()`-wrapped. Also corrected: the "37 locales" figure above is wrong — the repo has **49** locale directories, i.e. 48 non-English; and item (3)'s "sync the stale en catalogs" is SUPERSEDED by D-01/D-04, the deliverable being `en/gamelib.json` generated repeatably in a fork-owned namespace. The retrofit backlog's true size is DISCOVERED by REQ-34.8-11's audit-mode gate run — 205 `src/frontend/**` files are touched since merge-base `b5b5cad3f` (104 net-new) — not assumed from the 4 files named above.)
**Depends on:** Phase 34 (frontend-only; independent of the 34.x IPC slices)
**Blocks:** Phase 35 (sequenced BEFORE 34.7 — 34.7 stays last before cutover)
**Plans:** 13/14 plans executed

Plans:

- [x] 34.8-01-PLAN.md — wave 1: flip `keepRemoved` to true (+ assertion test) and author `meta/i18nGlossary.json` with the D-02/D-21 terms
- [x] 34.8-02-PLAN.md — wave 1: `meta/genI18nGateScope.ts` + the committed `meta/i18nGateScope.json` merge-base snapshot (offline, never fetched in CI)
- [x] 34.8-03-PLAN.md — wave 2: `meta/hardcodedStringGate.ts` core — ts-morph literal collection, user-facing scope, glossary exemption + negative fixtures
- [x] 34.8-04-PLAN.md — wave 3: the D-14 exemption engine (t-alias, `[key, default]` tuple, single-scope dataflow, full-file comment) with verbatim positive fixtures
- [x] 34.8-05-PLAN.md — wave 4: `scanScope()` orchestration, the measured D-18 allowlist, and the bidirectional stale-exemption proof
- [x] 34.8-06-PLAN.md — wave 5: the gate's own audit-mode run → `34.8-AUDIT.md` triaged retrofit backlog (+ blocking scope decision if oversized)
- [x] 34.8-07-PLAN.md — wave 6: retrofit `RedeemSteamKeyDialog/copy.ts` to the injected-`TFunction` idiom; `bootErrorSurface.ts` exemption comment; record D-21/D-22 no-change
- [x] 34.8-08a-PLAN.md — wave 6: retrofit the two heavy audit-assigned files — `ThemeSelector` (14) + `SideloadDialog` (13) — into `gamelib:` keys, then prove that subset closed
- [x] 34.8-08b-PLAN.md — wave 6: retrofit the 15 one-to-three-string audit-assigned files (19 violations, incl. `appleRating.ts`) into `gamelib:` keys, then prove that subset closed
- [x] 34.8-08c-PLAN.md — wave 6: close 08b's one blocked violation — translate `defaultWineVersion`'s `'Wine Default'` at its render site and exempt the declaration narrowly
  <sub>(34.8-08 was split into 08a/08b on 2026-08-07 by the developer's `split-plan` scope decision — the measured backlog, 46 violations across 17 files, exceeded the single plan's context budget. `34.8-08-PLAN.superseded.md` must not execute. See `34.8-AUDIT.md` § Scope Decision. 08c was added the same day to close the single `blocked` item 08b correctly refused to fix out-of-scope; the developer chose the render-site approach over a 14-file fan-out or an allowlist entry.)</sub>

- [x] 34.8-09-PLAN.md — wave 7: generate `public/locales/en/gamelib.json`, build the D-05 no-churn guard, scope `lintTranslations.ts` to `gamelib`
- [x] 34.8-10-PLAN.md — wave 8: flip the gate to BLOCKING and write `34.8-I18N-CONTRACT.md` (incl. every deliberate non-action: D-06/D-13/D-20/D-21/D-22)
- [x] 34.8-11-PLAN.md — wave 8: build the D-08/D-09/D-10/D-11 machine-fill script with hermetic tests and a bulk-run refusal
- [ ] 34.8-12-PLAN.md — wave 9: prove machine-fill on `de`+`fr` with provenance sidecars, add a catalog-parity test, and verify `gamelib.json` loads on BOTH Electron and Tauri

### Phase 34.7: Epic device-auth single sign-in path (INSERTED)

**Goal:** Make device-auth bootstrap the **single** Epic sign-in path. Delete the interactive
legendary-login UI (already marked red in the UI as deletion-pending); keep legendary purely as
the download/library backend, seeded via exchange code from the device-auth session; the bootstrap
doubles as the recovery flow. Deliberately **one** path — the interactive legendary login is NOT
retained as a fallback ("one robust path beats one robust + one flaky", operator decision
2026-08-05 after the alt-login 403 research concluded).

**Permanently out of scope:** any further work on the alt-login 403 issue. It stays parked —
no additional investigation time is to be spent on it (operator decision 2026-08-05; see the
`epic-login-tauri-connection-anomaly` record).

**Verification note:** confirm cloud-save and EOS-overlay flows still work when the session is
seeded via exchange code rather than minted by legendary itself — it is the same launcher-client
token either way, but any Heroic/legendary flow that assumes it minted the session must be
checked, not assumed.

*Inserted 2026-08-05 per operator decision: scheduled as the last thing before Phase 35.*

**Requirements:** TBD — mint at `/gsd-plan-phase 34.7`
**Depends on:** Phases 34.5 and 34.6 (runs LAST before Phase 35 — operator-scheduled)
**Blocks:** Phase 35
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 34.7 to break down)

### Phase 34.9: macOS runner onedir repackaging — eliminate the PyInstaller cold-start spawn tax (INSERTED)

**Goal:** Ship `legendary`, `gogdl` and `nile` as PyInstaller **`--onedir`** builds on macOS so a
runner spawn costs ~0.2s instead of ~20s cold, removing the dominant term in every store login.
The tax is macOS-specific (`amfid` runs a Gatekeeper assessment per extracted file, and onefile's
randomly-named `$TMPDIR/_MEIxxxxxx` defeats the assessment cache), so **Linux and Windows keep the
current onefile binaries unchanged** — they gain nothing and would only pay the bundle growth.

**Measured, not assumed** (debug session `nile-spawn-app-side-latency`, commit `a9192ae80`;
nile v1.1.2 built twice from `imLinguin/nile` at the pinned tag with upstream CI's own pyinstaller
command, differing only in the flag; two cold rounds separated by 400s idles, second reversed):

| build | cold (avg) | warm |
|---|---|---|
| onefile (control — reproduces the tax) | 20.84s | 6.61s |
| **onedir** | **0.22s** | **0.14s** |

~95x cold, ~47x warm; for onedir the cold/warm distinction collapses to ~80ms of noise.
Measured cost: 29MB across 108 files vs 13MB as one — 2.2x bundle growth per runner and ~100
extra Mach-O files each for notarization to sign and staple. **That signing/packaging work is the
real effort; the build flag is one word.**

**Strategy (user decision 2026-08-06): BOTH.** Build onedir runners in GameLib's own CI and ship
the win now, while opening PRs upstream in parallel; drop the local build if/when upstream lands
it. Upstream owners: `imLinguin/nile` (`.github/workflows/build.yaml`),
`Heroic-Games-Launcher/legendary`, `Heroic-Games-Launcher/heroic-gogdl`. Heroic has the identical
problem, so upstreaming benefits both projects and limits how far the fork diverges on vendoring.
`comet` is a Rust static binary (~0.01s) and is explicitly OUT of scope.

**Known constraints the plan must handle (do not rediscover):**

- PyInstaller **cannot cross-compile**. macOS x64 and arm64 must each build on their own runner
  (upstream uses a macos-13/macos-14 matrix). Only arm64 is verifiable on the dev machine.

- `meta/downloadHelperBinaries.ts` currently downloads a **single file** and `chmod 755`s it
  (`downloadAsset`, line ~58). Onedir assets are directory trees and need archive + extract.

- `archSpecificBinary()` (`src/backend/utils.ts:~510`) resolves a **file**; onedir needs
  `.../nile/nile`. `getNileBin()`/`getLegendaryBin()`/`getGOGdlBin()` already return `{dir, bin}`
  via `splitPathAndName`, so the consumer shape likely survives unchanged — verify, don't assume.

- Signing must cover every Mach-O in the tree or notarization fails. **Both** `electron-builder.yml`
  and the Tauri bundler need this until Phase 35 removes the Electron build — i.e. this phase pays
  the packaging cost twice by running before 35. Accepted deliberately for the size of the win.

- The `altLegendaryBin`/`altGogdlBin`/`altNileBin` user overrides must keep working (they bypass
  `archSpecificBinary` entirely and may point at a onefile binary).

**Requirements**: REQ-34.9-01, REQ-34.9-02, REQ-34.9-03, REQ-34.9-04, REQ-34.9-05, REQ-34.9-06,
REQ-34.9-07, REQ-34.9-08, REQ-34.9-09, REQ-34.9-10, REQ-34.9-11 (minted 2026-08-07 at
`/gsd-plan-phase 34.9`; the full block lands in REQUIREMENTS.md at plan 34.9-11, where each box is
ticked only by measured evidence)
**Depends on:** Phase 34 (packaging/signing/notarization pipeline). Independent of the 34.1-34.8
IPC slices. Runs before Phase 35, which will later delete the Electron half of the signing work.
**Plans:** 33/33 plans executed — **PHASE 34.9 COMPLETE, closed 2026-08-15.**
`34.9-VERIFICATION.md` re-verified 2026-08-15 (gap cycle 4): `status: passed`, **8/8 truths
verified, 0 gaps open**, 33/33 plans complete, no human verification outstanding. The gap that held
the phase open across three re-verifications — gap-cycle-3's own review findings (C3-01/02/03)
sitting in a review document with no ledger entry — is closed **by fix, not by deferral**. Every
review finding in the phase is now dispositioned: `34.9-REVIEW-SWEEP-CHECK.cjs` reports
`REVIEW-SWEEP-OK 24/24 mapped, unmapped 0`, exit 0, across all five review cycles, with the tool
byte-unchanged (so the gate went green because rows were written, not because the check was
loosened). Regression gate at closure: `pnpm test:ci` — 251/251 suites, 4867 passed / 1 skipped,
exit 0. Closes with **3 deferred ledger items** (C4-05, C5-01, C5-02), none
a live defect, each carrying `OWNER:`/precondition/blocker; the two C5 items touch `meta/runTs.cjs`,
the subject of `34.9-WRAPPER-PROOF.md`'s PASS, so fixing them now would decouple the phase's headline
evidence from the artifact it describes. **Scope fence unchanged:** REQ-34.9-02/03/04 (x64 CI leg,
digest download path) and REQ-34.9-09 (per-runner cold-spawn ratio) remain descoped by recorded user
decision — the phase closes on the **arm64 leg only**, and the honest headline is **~27–33x warm**
(nile 32.5x, legendary 26.6x, gogdl 27.2x), cold UNMEASURED.

**Structural outcome worth carrying forward:** gap cycle 4 also closed the *cause* of the repeated
gap. `code_review_gate` runs AFTER a phase's reconciliation sweep, so every cycle's own review was
unledgered by construction the moment it was written — four cycles running (CR-01/34.9-17,
C2-01..08/34.9-22, C3-01..03/34.9-28, C4-01..05/34.9-33). Cycle 4 broke the ordering instead of
trying to out-discipline it: the cycle-4 review was front-loaded, the sweep tool was generalised to
be cycle-agnostic, and this execution's own review (`34.9-REVIEW-CYCLE5.md`) was run and ledgered
*before* verification. Front-loading paid for itself immediately — it caught C4-01 (the wrapper
installed no signal handlers, so a SIGTERM orphaned the child and leaked the tmpdir) *before*
`34.9-WRAPPER-PROOF.md` was executed, and that contract's Direction B row 11 prescribes exactly that
SIGTERM to abort a destructive/network step. A review that runs before an unrun gate contract can
invalidate the **contract**, not just the code. Protocol recorded in `deferred-items.md`'s
`## Closure protocol` section.

Plan-count derivation (retained): 33 total = 17 original + 5 gap cycle 2 + 6 gap cycle 3 + 5 gap
cycle 4 — re-derived 2026-08-14 from `.planning/phases/34.9-.../34.9-*-PLAN.md` on disk (33 files,
`ls ... | wc -l` = 33; not incremented from the prior 28, since gap cycle 4's 5 plans (34.9-29..33)
were already counted at gap-cycle-4 planning time). Gap cycle 3's first plan, 34.9-23
(audit-only, `34.9-PIPE-AUDIT.md`: derived the C2-01 pipe-swallow
census by predicate — 13 instances, one more than gap-planning decision D-C3-01's 12-item list;
no `VACUOUS TODAY`/`BLOCKER` instances found; every CI caller currently BLOCKED UPSTREAM). Gap
cycle 3 (34.9-23..28, planned 2026-08-13, 5 waves) closes the sole remaining verification gap:
`34.9-VERIFICATION.md` truth 8 / C2-01 (the pipe-swallow idiom itself, not merely the guard it was
originally found in). Gap cycle 1 (34.9-12..17) closed the arm64 leg (2026-08-11) — see the phase-status
note above. **2026-08-12 correction:** the earlier claim that "34.9-17 completed the full
reconciliation" was FALSE — `34.9-VERIFICATION.md` truth 8 found that 34.9-17's own ledger recorded
6 descoped items, 2 UI defects and 1 PKCE note but contained **zero** mentions of CR-01, WR-01, or
any other code-review finding; gap cycle 2 is the reconciliation that actually swept them (see
`deferred-items.md`'s "Code-review finding disposition" section). Gap cycle 2 (34.9-18..22) closes
CR-01/WR-01 and the five other unrecorded review findings; 34.9-18 (CR-01/WR-01,
`meta/preserveRunnerSymlinks.ts`), 34.9-19 (WR-02 in
`meta/verifyRunnerBundle.ts`, IN-01/IN-02 doc comments in `meta/cleanDistMac.ts`), 34.9-20
(CR-01 fully wired into `dist:mac`/`release:mac`; `34.9-GUARD-PROOF.md` authored + validated,
unrun), 34.9-21 (ran `34.9-GUARD-PROOF.md` on real macOS arm64 hardware, verdict
**PASS** -- both directions scored from disk evidence, restore independently audited twice,
closing CR-01 and `34.9-VERIFICATION.md` truth 8, scoped strictly to arm64/local/non-CI; three
methodology findings on the proof contract's own commands opened as `deferred-items.md` items
14-16), and 34.9-22 (this plan — the six-finding sweep, deferred-items.md 11-13, and the corrected
tripwire prose) are complete. **The phase does not close from gap cycle 2's own edits** —
`34.9-VERIFICATION.md` remains `status: gaps_found` until the verifier re-scores truth 8 against
this landed evidence: `/gsd-verify-work 34.9`.
**Gap cycle 3 — planned 2026-08-13 at `/gsd-plan-phase 34.9 --gaps`.** 6 plans in 5 waves, 6/6
gap-cycle plans complete. Closes `34.9-VERIFICATION.md` truth 8's second failure — C2-01, the
`esbuild ... | node -` pipeline swallowing a compile failure — plus the seven other
`34.9-REVIEW-CYCLE2.md` findings (C2-02 through C2-08) that appeared in no ledger at the
2026-08-12 verification run:

- [x] 34.9-23-PLAN.md — derive the C2-01 defect census by predicate (never a line-range grep), enumerate every caller, and measure the __dirname/require.main deltas against real bundled output — **DONE 2026-08-13**, see `34.9-PIPE-AUDIT.md`, 34.9-23-SUMMARY.md
- [x] 34.9-24-PLAN.md — close C2-06/C2-08: the top-level framework stub's missing resolved-target check, and the symlink-free-tree test's ignored third return-shape key — **DONE 2026-08-13**, see `34.9-24-SUMMARY.md`
- [x] 34.9-25-PLAN.md — convert every census instance from the exit-code-swallowing pipe to the `&&` idiom this repo already uses (`verify:updater-key`'s precedent), and correct every comment the conversion makes false
- [x] 34.9-26-PLAN.md — prove, both directions against a known-bad input, that plan 34.9-25's conversion actually converts silent success into loud failure, per script and at the `dist:mac` chain level — **DONE 2026-08-13, verdict PASS 36/36** (Direction A 13/13 scripts both shapes, Direction B 8/8 RUN, both chain proofs, restore audit independently confirmed), see `34.9-PIPE-PROOF.md`, `34.9-26-SUMMARY.md`; one finding (F-34.9-26-01, `meta/i18nGateScope.json` catalogue drift) opened as `deferred-items.md` item 17
- [x] 34.9-27-PLAN.md — close C2-04 with a wiring-pin regression test for `verify:runner-bundle`'s position in `dist:mac`/`release:mac`; record C2-05/C2-07 as dated, owned deferred entries — **DONE 2026-08-13** (proven red against all four mutations: M1/M2 presence, M3/M4 ordering, `package.json` restored byte-identical), see `34.9-27-SUMMARY.md`; does NOT close C2-01 / truth 8 (already satisfied by 34.9-26)
- [x] 34.9-28-PLAN.md — close gap cycle 3: sweep all eight `34.9-REVIEW-CYCLE2.md` findings by set-difference, confirm each cycle-3 deliverable against the repository, leave `/gsd-verify-work 34.9` as the next step — **DONE 2026-08-13**, this cycle's cycle-2-scoped sweep tool (renamed 2026-08-14 by plan 34.9-30 to `34.9-REVIEW-SWEEP-CHECK.cjs`, see below) (proven RED against the pre-content baseline and four deliberately-mutated inputs before going green) reports `C2-SWEEP-OK 8/8 mapped, unmapped 0`; see `deferred-items.md`'s `## Code-review finding disposition — gap cycle 2 review (2026-08-13)` section, `34.9-28-SUMMARY.md`. **This plan does not close Phase 34.9 and does not itself score truth 8** — the phase awaits re-verification: `/gsd-verify-work 34.9`.

**Gap cycle 4 — planned 2026-08-13 at `/gsd-plan-phase 34.9 --gaps`.** 5 plans in 4 waves. Truth 8
is VERIFIED 8/8 and is NOT reopened; this cycle closes the single remaining gap — gap cycle 3's own
review findings (C3-01/C3-02/C3-03) had zero disposition in any of the four ledgers — and breaks the
structural loop that produced it for the fourth time. Census correction made at planning time: the
shared-outfile defect's own predicate matches **14** scripts, not the 13 gap cycle 3 converted;
`verify:updater-key` predates the conversion and carries the identical hazard.

- [x] 34.9-29-PLAN.md — close C3-01: introduce `meta/runTs.cjs` (compile into a private
  `mkdtempSync` directory, never run `node` on a failed compile, propagate the child's exit code) and
  route all 14 exposed scripts through it, with a red-provable wiring pin — **DONE 2026-08-14.**
  Census re-derived at execution time found **15**, not 14 — `gen-tray-icon-variants` was added by
  unrelated commit `49e891f58` (phase 34.1-13) after this cycle's planning-time census; converted per
  the plan's own "scope by the predicate" principle. Two real bugs found and fixed live during
  execution, both confined to `meta/runTs.cjs`: `process.exit()` does not run pending `finally`
  blocks in Node (cleanup now explicit at every exit point), and compiling into `os.tmpdir()` broke
  `require.resolve()` for two of the 15 scripts (`build:sidecar-sea`, `verify:updater-key` — both
  locate a CLI tool's on-disk path to spawn as a subprocess), fixed by symlinking the project's
  `node_modules` into the private tmpdir (read-only, does not reintroduce the C3-01 race). `pnpm
  test:ci` 250/250 suites green (zero regressions). See `34.9-29-SUMMARY.md`.
- [x] 34.9-30-PLAN.md — close C3-02 (the stale pipe/argv comment in `meta/lintTranslations.ts` AND
  the `34.9-PIPE-AUDIT.md` Section 7 claim that no such comment exists) and C3-03 (polarity check),
  and generalise the sweep to `34.9-REVIEW-SWEEP-CHECK.cjs` — cycle-agnostic, works against a review
  file that does not exist yet — **DONE 2026-08-14.** `meta/lintTranslations.ts`'s doc comment no
  longer claims argv is mechanically unreachable via an `esbuild|node` pipe (states the env-var
  scope is a deliberate convention, matching `verifyUpdaterSigningKey.ts`'s precedent, names no
  invocation mechanism); `34.9-PIPE-AUDIT.md` Section 7 retracts its own false "no stale claim to
  correct" conclusion and corrects the neighbouring "every `meta/*.ts` comment" overclaim to 11 of
  12. The cycle-2-scoped sweep tool (authored by 34.9-28) was renamed (git mv, history preserved) to
  `34.9-REVIEW-SWEEP-CHECK.cjs` and generalised: list A globs `*-REVIEW*.md` and parses every
  `### <ID>` heading (proven against a
  synthetic `C9-01` heading in a throwaway file not yet existing at authoring time); list B is the
  union of `| <ID> |` rows across every disposition section in `deferred-items.md`, not one named
  section (a finding legitimately cross-referenced from two sections, e.g. C2-05/C2-07, is merged,
  not rejected — only a genuine FIXED-vs-DEFERRED conflict trips DUPLICATE-ROW). FIXED-row
  confirmation tightened per C3-03: a case-insensitive polarity deny-list rejects a citation whose
  own text denies the fix, checked before and independent of citation acceptance — RED-proven against
  the reviewer's verbatim counter-example on a temporary `deferred-items.md` copy (real file never
  mutated), rejected `FIXED-CONFIRMATION-DENIES-FIX`. Run with no arguments from the phase directory:
  discovers all 3 real review files, list A = 17 IDs, reports exactly 3 unmapped (C3-01/02/03, all
  `NO-ROW`) and exits non-zero — the expected RED state at this plan, matching plan measured ground
  truth exactly; the 14 already-dispositioned IDs are not in the unmapped list (no regression).
  `pnpm test:ci` 250/250 suites green (4862/4863 tests, 1 pre-existing skip), `pnpm lint` unchanged
  at the pre-existing 3544-problem/53-error baseline, `tsc --noEmit` clean. See `34.9-30-SUMMARY.md`.
- [x] 34.9-31-PLAN.md — author `34.9-WRAPPER-PROOF.md` (author/runner separation: this plan may not
  run any direction), including the mandatory Direction C positive control — **DONE 2026-08-14.**
  Independently re-derived the wrapped-script census from the live `package.json` before writing
  anything (**15**, agreeing with `34.9-29-SUMMARY.md`'s own count, not this plan's own stale
  key-link of 14). Direction A: 30 rows (15 scripts x S1/S2 broken-compile shapes), a five-criterion
  PASS bar including a private-tmpdir-absence check (`meta/runTs.cjs`'s `cleanupAndExit` discipline).
  Direction B: 10 full-run + 1 partial-run (`build-runners-onedir`, argv-arrival only, `SIGTERM`'d
  before its network/destructive step) + 4 named exclusions — all five required inclusions satisfied
  (both argv-forwarding call sites, the `export`-prefixed script, the chained `build:sidecar-sea`,
  node22 coverage). Direction C: a 60-trial concurrency race check plus a MANDATORY positive control
  against the retired shared-outfile idiom, scored INVALID not PASS if the control fails to
  reproduce the previously-measured ~100% rate. Contract Validation: all 6 distinct check shapes
  specimen-validated pass+fail using the real `meta/runTs.cjs`/`esbuild` on throwaway scratchpad
  files — including a genuine failing temp-dir specimen via `SIGKILL` and a Direction C
  detector-logic validation using fabricated fixture pairs, never an actual concurrent run (this
  plan is FORBIDDEN from concurrency harness execution). `directions_total: 43` filled as the sole
  deliberate exception to the unfilled-result-fields rule. `git status --porcelain -- meta/
  package.json` clean throughout. See `34.9-31-SUMMARY.md`.
- [x] 34.9-32-PLAN.md — run the three-direction proof on real macOS arm64 hardware and write its
  verdict (human operator required) — **DONE 2026-08-14.** Verdict **PASS, 43/43 directions, 0
  failed**. Direction A: 30/30 rows PASS (all five criteria, all 14 entry files restored and
  `shasum`-verified). Direction B: 10/10 full-run + 1/1 partial-run PASS — row 11
  (`build-runners-onedir`) live-confirmed the C4-01 signal-forwarding fix (`meta/runTs.cjs`, commit
  `fdc5b24e7`): the wrapper process was `SIGTERM`'d directly the instant its pre-network stdout
  marker appeared, confirmed terminated, tmpdir removed, `public/bin/`/`build/bin/` byte-unchanged
  before/after. Direction C: mandatory positive control run FIRST against the retired shared-outfile
  idiom, reproduced cross-contamination in 60/60 trials (100% trial-level rate, matching the
  reviewer's 60/60 and the verifier's 20/20) — only then did the new-idiom trials run, 0/120
  cross-contamination across 60 trials. Scored **VALID and PASS**, not a bare PASS from an unproven
  harness. Two honestly-recorded, non-blocking deviations (a live Tauri dev-instance precondition
  miss, and a bash-3.2 associative-array harness retry caught before any file mutation). Checkpoint
  approved by the operator after independent orchestrator verification. See `34.9-32-SUMMARY.md`.
- [x] 34.9-33-PLAN.md — ledger C3-01..C3-03, record the closure protocol, reconcile
  ROADMAP/REQUIREMENTS/STATE, and carry the sweep PAST `code_review_gate` before
  `/gsd-verify-work 34.9` runs — **DONE 2026-08-14.** Task 1 ledgered all three gap-cycle-3
  findings (C3-01/02/03, all FIXED) AND, discovered live by the cycle-agnostic sweep since it globs
  every `*-REVIEW*.md` (not just the cycle this plan was authored against), all five gap-cycle-4
  findings from `34.9-REVIEW-CYCLE4.md` (C4-01..04 FIXED by quick task 260814-u2u commit
  `fdc5b24e7`, C4-05 DEFERRED as `deferred-items.md` item 21). `34.9-REVIEW-SWEEP-CHECK.cjs` now
  reports 0 unmapped, exit 0, across all 22 IDs in all four discovered review files — planning-time
  `<expected_sweep_states>` (17 IDs / 3 unmapped) was stale against `34.9-REVIEW-CYCLE4.md`, which
  did not exist at planning time; the live pre-Task-1 sweep found 22 IDs / 8 unmapped instead, and
  this plan closed that real gap rather than the stale planned one. Task 2 recorded the fuller
  closure protocol in `deferred-items.md`'s own `## Closure protocol` section (this ROADMAP note is
  the abbreviated cross-reference) and reconciled REQUIREMENTS/STATE. See `34.9-33-SUMMARY.md`.
  **Task 3's checkpoint RESOLVED 2026-08-14 (operator response "swept").** This execution's own
  `code_review_gate` output was redirected by hand to `34.9-REVIEW-CYCLE5.md` (avoiding the
  fixed-path `34.9-REVIEW.md` silent-overwrite hazard the closure protocol names — `34.9-REVIEW.md`,
  gap cycle 1's review, confirmed intact, `reviewed: 2026-08-11T03:22:49Z` unchanged), scoped to
  `meta/runTs.cjs`'s post-cycle-4 rewrite (commit `fdc5b24e7`, never previously reviewed) plus its
  new test/fixture. Two findings — C5-01 (Warning, a startup-window tmpdir leak between
  `mkdtempSync` and signal-handler installation, only reproducible via an artificially widened
  window) and C5-02 (Info, `SIGHUP` forwarding untested but manually verified correct) — both
  DEFERRED as `deferred-items.md` items 22/23 rather than fixed, since both touch `meta/runTs.cjs`
  or its test and that file is the subject of `34.9-WRAPPER-PROOF.md`'s `verdict: PASS`. Committed
  `221a1fce8`. `34.9-REVIEW-SWEEP-CHECK.cjs` (byte-unchanged) now reports `REVIEW-SWEEP-OK 24/24
  mapped, unmapped 0`. **This is the first time in this phase's history a cycle's own review was
  ledgered BEFORE `/gsd-verify-work` rather than after** — the closure protocol's own non-vacuity
  demonstration. Plan 34.9-33 is now fully complete (all 3 tasks). **This plan still does not close
  Phase 34.9** — `/gsd-verify-work 34.9` is the orchestrator's own next step, not run by this plan.

**Closure protocol (recorded 2026-08-13, gap cycle 4; full version in `deferred-items.md`'s own
`## Closure protocol — why every cycle's own review is unledgered by construction` section, added by
plan 34.9-33).** `/gsd-execute-phase` runs all waves, THEN `code_review_gate`, THEN `regression_gate`,
THEN `verify_phase_goal`. A phase's reconciliation sweep is its LAST WAVE, so it always runs *before*
the review whose findings it is supposed to sweep — every cycle's review is unledgered by
construction. This phase hit that shape four times (CR-01 / 34.9-17, C2-01..08 / 34.9-22, C3-01..03 /
34.9-28, and C4-01..05 / 34.9-33). The remedy is ordering, not diligence: re-run
`34.9-REVIEW-SWEEP-CHECK.cjs` (renamed 2026-08-14 from its cycle-2-scoped predecessor name, plan
34.9-30, `D-C4-04a` — cycle-agnostic, not scoped to one named cycle) AFTER the review gate and ledger its
findings BEFORE `/gsd-verify-work`. Plan 34.9-33's blocking checkpoint (Task 3) enforces this for
THIS execution's own upcoming review. Related hazard: `code_review_gate` writes to the FIXED path
`{phase_dir}/{padded_phase}-REVIEW.md` and silently overwrites on re-review — the one-file-per-cycle
convention only holds because the file was moved by hand each time.

**Gap cycle 1 planned 2026-08-11**
(`/gsd-plan-phase 34.9 --gaps`), 6 plans in 4 waves, 6/6 gap-cycle plans complete (17/17 overall):

- [x] 34.9-12-PLAN.md — preserve the runner `Python.framework` symlinks through vite's `publicDir` → `outDir` copy (fixes F-34.9-01; corroborated by F-34.9-03) — **DONE 2026-08-11**, see 34.9-12-SUMMARY.md
- [x] 34.9-13-PLAN.md — make `pnpm verify:runner-bundle` enforce framework structural integrity against the BUILT artifact
- [x] 34.9-14-PLAN.md — clear stale macOS `dist/` artifacts before every build so a failed build cannot read as success (fixes F-34.9-02) — **DONE 2026-08-11**, see 34.9-14-SUMMARY.md
- [x] 34.9-15-PLAN.md — author `34.9-LIVE-GATE-RERUN.md` (author/runner separation: this plan may not run it)
- [x] 34.9-16-PLAN.md — run the re-run gate on macOS hardware and write its verdict (human operator required) — **DONE 2026-08-11, verdict PASS 2/2** (Scored Item 1 Tauri DEV PASS, Scored Item 2 Electron PACKAGED PASS 8/8 criteria); carried-forward items 2/3/5 not invalidated (no DEV-side regression). See `34.9-LIVE-GATE-RERUN.md`, 34.9-16-SUMMARY.md
- [x] 34.9-17-PLAN.md — record the descoped/deferred set and reconcile REQUIREMENTS/ROADMAP/STATE to the post-gap-cycle truth — **DONE 2026-08-11**, see `deferred-items.md`, 34.9-17-SUMMARY.md

**Scope note (planning, 2026-08-07):** `R-34.5-G1-PKG` — the packaged Tauri asset root does not
resolve, because `electronStub.app.isPackaged` stays `false` under the sidecar so `publicDir`
unconditionally appends `'public'` to a resource root that has no such child — is **DESCOPED**. It
is Phase 34.5's deferred item 12, it pre-dates this phase, and it already breaks packaged-Tauri
runner resolution for today's single-file runners identically. Phase 34.9 therefore proves the
onedir win in the **Tauri DEV** build and the **Electron PACKAGED** build (still the shipping
artifact until Phase 35), and records **Tauri-PACKAGED as UNPROVEN**. Real-certificate notarization
also stays out of scope (D-03/D-04, no Apple credentials enrolled); the honest proxy is
`codesign --verify` on an adhoc-signed bundle plus a per-file signature-state report.

**Measurement caveat — RESOLVED 2026-08-11, and the headline number is retired.** The `~95x cold`
figure above is **nile-only, and this phase did not reproduce it per-runner.** Plan 34.9-03's two
attempted cold runs both failed their own harness validity anchor, so the **cold ratio is
UNMEASURED for all three runners** and no cold claim may be cited from this phase. What IS measured
and valid is the **warm** ratio, per runner (`34.9-MEASUREMENT.md` §8.4):

| runner | onefile warm | onedir warm | ratio |
|---|---|---|---|
| nile | 4.23s | 0.13s | **32.5x** |
| legendary | 3.99s | 0.15s | **26.6x** |
| gogdl | 2.99s | 0.11s | **27.2x** |

All three independently confirm a large win, so the phase's premise holds — but the honest headline
is **~27–33x warm, cold unmeasured**, not ~95x cold. The one cold figure the project may still cite
(nile ~20.84s → 0.22s) comes from the earlier `nile-spawn-app-side-latency` debug session,
independently of this phase's invalidated runs, and applies to nile alone. The live gate's own
items 2 and 3 measured real user-visible intervals (<1s and 1s against a 2s bar), consistent with
the warm figures and with no disagreement found.

**Phase status 2026-08-12: does not close yet.** `34.9-VERIFICATION.md` is `status: gaps_found` --
truth 8 ("automated regression protection exists so a future dereferencing regression of the
F-34.9-01 shape cannot silently ship again") FAILED that verification run, because CR-01 (the code
review's sole Critical finding) had been neither fixed nor triaged into a dated, owned deferral.
Gap cycle 2 (`34.9-18`..`34.9-22`) has now landed the fixes (CR-01, WR-01, WR-02, IN-01, IN-02) and
the ledger entry for the one deferred finding (IN-03, `deferred-items.md` item 11), plus items 12
and 13 recording the guard's arm64-only and not-in-CI scope. **Truth 8 must now be re-scored by the
verifier against this landed evidence** -- `/gsd-verify-work 34.9` is the next step; this ROADMAP
entry does not itself close the phase. Gap cycle 1 (plans `34.9-12`..`34.9-17`) closed the blocking
live gate's original FAIL finding. **F-34.9-01** (each onedir runner's `Python.framework`
bundle dereferenced by vite's `copyDir`, producing a layout `codesign` rejects with
`bundle format is ambiguous`, aborting `pnpm dist:mac` outright) was closed at its mechanism by
plan 34.9-12's symlink-preserving `closeBundle` vite plugin, with plan 34.9-13 adding
framework-structural-integrity enforcement to `pnpm verify:runner-bundle` -- later wired into
`dist:mac`/`release:mac` (plan 34.9-20) and observed live to gate `electron-builder` on real macOS
arm64 hardware (`34.9-GUARD-PROOF.md`, run 2026-08-12, verdict PASS), scoped to **arm64 only** and
**not in CI** (`deferred-items.md` items 12-13). **F-34.9-02** (a failed build leaving a stale pre-34.9 dmg/zip in `dist/` that could
read as success) was closed by plan 34.9-14's `pnpm clean:dist-mac`, now the first step of both
`dist:mac` and `release:mac`. **F-34.9-03** (the same dereferencing roughly doubling the runner
payload, 84M → 157M) closed as a side effect of F-34.9-01's fix. The blocking live gate then
RE-RAN in full on real macOS arm64 hardware (`34.9-LIVE-GATE-RERUN.md`, authored by plan 34.9-15,
run by plan 34.9-16, 2026-08-11) and returned **`verdict: PASS`, `items_passed: 2`,
`items_failed: 0`** — Scored Item 1 (Tauri DEV, regression canary) and Scored Item 2 (Electron
PACKAGED, the original failure) both PASS, against the artifact's own on-disk shape (exactly 12
restored symlinks, zero `bundle format is ambiguous` occurrences, `verify:runner-bundle` exit 0,
+0.02% payload delta, a new dmg/zip strictly newer than a recorded `BUILD_START`). Carried-forward
items 2/3/5 were not invalidated (no DEV-side regression observed) and retain their original PASS
verdicts. REQ-34.9-08 and REQ-34.9-11 ticked on this basis. A green 235-suite / 4598-test run never
detected F-34.9-01 in the first place — the live gate is what caught it, and the live gate is what
closed it. See `34.9-16-SUMMARY.md`.

**2026-08-13 update — gap cycle 3 landed, phase still does not close.** Gap cycle 3 (34.9-23..28)
landed: the pipe-idiom conversion across all 13 censused `package.json` scripts, not merely the two
`34.9-VERIFICATION.md` originally named (34.9-25); its both-direction proof on real arm64 hardware,
verdict PASS 36/36 (34.9-26, `34.9-PIPE-PROOF.md`); the C2-06 (`resolvedTopLevelTargetExists`) and
C2-08 (`result.rejected` assertion) fixes (34.9-24); the C2-04 wiring-pin regression test, proven
red against four mutations (34.9-27); the C2-05/C2-07 dated ledger entries, items 18/19 per locked
decision D-C3-05 (34.9-27); and the eight-finding sweep closing this section's own precedent's
pattern a second time, computed unmapped count 0 (34.9-28, `deferred-items.md`'s
`## Code-review finding disposition — gap cycle 2 review (2026-08-13)` section). **Truth 8 must
still be re-scored by the verifier against this landed evidence** — `/gsd-verify-work 34.9` is the
next step; this paragraph does not itself close the phase.

**The x64 leg remains permanently blocked FOR THIS PHASE, by a user decision recorded 2026-08-11 at
gap-planning time** — this is a deliberate scope fence, not an unresolved gap. The CI leg was never
dispatchable (`workflow_dispatch` requires the workflow on the default branch —
`34.9-CI-ROUNDTRIP.md` Outcome C), so **the x64 onedir leg exists nowhere**, all six digests remain
`PENDING-CI-PUBLISH` sentinels, and the download → verify → extract path (REQ-34.9-02/03/04) is
unproven. REQ-34.9-09's cold-spawn ratio stays satisfied-on-WARM only, with no third
cold-measurement attempt authorized. The three upstream PRs were **declined** by the developer on
2026-08-11, so the local onedir build is permanent rather than interim. Every descoped item, plus
two out-of-scope UI defects the gate observed and the pre-existing plaintext PKCE logging at
`nile/user.ts:62`, are recorded with dated blockers, preconditions and owners in
`.planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md`
(plan 34.9-17).

Plans:

- [x] 34.9-01-PLAN.md — `meta/buildRunnersOnedir.ts`: clone pinned tags, derive upstream's own pyinstaller command, swap one flag, archive (wave 1)
- [x] 34.9-02-PLAN.md — `archSpecificBinary()` resolves nested darwin paths for three runners; alt*Bin bypass and stale-layout throw (wave 1)
- [x] 34.9-03-PLAN.md — Build all three on arm64 and MEASURE cold/warm per runner against the vendored onefile control (wave 2)
- [x] 34.9-04-PLAN.md — `build-runners-onedir-macos.yml`: macos-13/macos-14 matrix publishing to a rolling prerelease (wave 2)
- [x] 34.9-05-PLAN.md — Upstream PR patches + bodies for nile/legendary/heroic-gogdl; developer submits (wave 3 — sequenced AFTER 34.9-03 so every PR body cites its own runner's measured figures) — **all three DECLINED 2026-08-11**; content prepared and committed, submission not made, so the local onedir build is not droppable
- [x] 34.9-06-PLAN.md — Downloader: darwin archives, sha256-verified against in-repo digests, layout-aware freshness (wave 3)
- [x] 34.9-07-PLAN.md — electron-builder + Tauri packaging config, and the packaging-limitations record (wave 4)
- [x] 34.9-08-PLAN.md — `meta/verifyRunnerBundle.ts`: inspect a BUILT artifact, report per-file signature state (wave 4)
- [x] 34.9-09-PLAN.md — Dispatch CI for real, pin the published digests, run the vendoring round trip (wave 5)
- [x] 34.9-10-PLAN.md — Author the blocking live-gate contract + Structural Reachability Review (wave 6)
- [x] 34.9-11-PLAN.md — Run the gate on hardware; reconcile REQUIREMENTS.md and this ROADMAP entry (wave 7) — **RAN 2026-08-11, verdict FAIL 4/5**; REQ-34.9-01..11 backfilled, ROADMAP ~95x claim retired

**Gap cycle 1 — planned 2026-08-11 at `/gsd-plan-phase 34.9 --gaps`.** Closes the live gate's FAIL.
Scope fenced by user decision at that run: REQ-34.9-02/03/04 (x64 CI leg — blocked by
`workflow_dispatch`'s default-branch constraint) and REQ-34.9-09 (cold ratio — warm 26.6–33x stands)
are **descoped and recorded, not worked**; the two out-of-scope UI defects the gate found
(`electronStub.showOpenDialog` swallowing every failure as a user-cancel, `PathSelectionBox`
discarding typed input unless blurred) go to `deferred-items.md`. The phase closes on the **arm64
leg only**.

- [x] 34.9-12-PLAN.md — Preserve each runner's `Python.framework` symlinks through vite's `publicDir`→`outDir` copy, via a `closeBundle` plugin in `electron.vite.config.ts` (wave 1) — closes **F-34.9-01**, corroborated by **F-34.9-03**'s payload returning to ~84M (apparent-size match, 0.0% diff) — **DONE 2026-08-11**, live-proven: 12/12 symlinks restored across two consecutive builds, the exact prior-failing codesign invocation now exits 0; see 34.9-12-SUMMARY.md
- [x] 34.9-13-PLAN.md — `meta/verifyRunnerBundle.ts` **enforces** framework structural integrity against the built artifact — the check that would have caught F-34.9-01 while 4598 tests stayed green (wave 1)
- [x] 34.9-14-PLAN.md — Clear stale macOS `dist/` artifacts before every build so a failed build cannot read as success (wave 1) — closes **F-34.9-02** — **DONE 2026-08-11**, live-verified against the real `dist/`: removed the four 2026-07-21 stale macOS artifacts, `latest-mac.yml`, and the abandoned `mac-arm64/` tree; `builder-debug.yml` survives; see 34.9-14-SUMMARY.md
- [x] 34.9-15-PLAN.md — Author `34.9-LIVE-GATE-RERUN.md` + its Structural Reachability Review; **forbidden from running any of it** (wave 2) — carries the absolute-path rule and **F-34.9-04**'s version-string non-discriminator — **DONE 2026-08-11**, unrun contract authored (`verdict: PENDING`), see 34.9-15-SUMMARY.md
- [x] 34.9-16-PLAN.md — Run the re-run gate on hardware; sole writer of results (wave 3, `autonomous: false` — human operator on macOS arm64) — **RAN 2026-08-11, verdict PASS 2/2.** Scored Item 1 (Tauri DEV nested resolution) PASS, both sinks, no regression. Scored Item 2 (Electron PACKAGED, F-34.9-01's own subject) PASS on all 8 on-disk criteria: exactly 12 restored symlinks, zero `bundle format is ambiguous` against the framework bundle, `verify:runner-bundle` exit 0, new dmg/zip strictly after `BUILD_START`, +0.02% payload delta (F-34.9-03 corroboration). Carried-forward items 2/3/5 NOT invalidated (Section 2's conditional did not trigger). REQ-34.9-08/11 ticked. See `34.9-LIVE-GATE-RERUN.md`, 34.9-16-SUMMARY.md.

**Gap cycle 2 — planned 2026-08-12 at `/gsd-plan-phase 34.9 --gaps`.** Closes
`34.9-VERIFICATION.md` truth 8 (FAILED, `status: gaps_found`) and CR-01, the code review's sole
Critical finding — plus the five other `34.9-REVIEW.md` findings (WR-01, WR-02, IN-01, IN-02, IN-03)
that gap cycle 1's own reconciliation plan (34.9-17) recorded nowhere, the exact failure this cycle
exists to not repeat.

- [x] 34.9-18-PLAN.md — Close CR-01 (`closeBundle` throws on a skipped or rejected symlink restore) and WR-01 (`isContainedSymlinkTarget` target-containment guard) in `meta/preserveRunnerSymlinks.ts` (wave 1) — **DONE 2026-08-12**, see 34.9-18-SUMMARY.md
- [x] 34.9-19-PLAN.md — Close WR-02 (`summarise()` now fails a fully-absent top-level framework stub) in `meta/verifyRunnerBundle.ts`; correct IN-01/IN-02 doc comments in `meta/cleanDistMac.ts` (wave 1) — **DONE 2026-08-12**, see 34.9-19-SUMMARY.md
- [x] 34.9-20-PLAN.md — Wire `pnpm verify:runner-bundle build --arch=arm64` into `dist:mac`/`release:mac` immediately before `electron-builder`; author `34.9-GUARD-PROOF.md`, an unrun, author/runner-separated proof contract (wave 2) — **DONE 2026-08-12**, see 34.9-20-SUMMARY.md
- [x] 34.9-21-PLAN.md — Run `34.9-GUARD-PROOF.md` on real macOS arm64 hardware, sole writer of results (wave 3, `autonomous: false` — human operator required) — **RAN 2026-08-12, verdict PASS** (`directions_passed: 2`, `directions_failed: 0`), both directions scored from disk evidence, restore independently audited twice; closes CR-01 and `34.9-VERIFICATION.md` truth 8's guard-firing claim, scoped strictly to arm64/local/non-CI. Three methodology findings on the proof contract's own commands opened as `deferred-items.md` items 14-16. See `34.9-GUARD-PROOF.md`, 34.9-21-SUMMARY.md
- [x] 34.9-22-PLAN.md — Sweep all six review findings by set-difference (deferred-items.md items 11-13); correct the overclaiming tripwire prose in `34.9-LIVE-GATE-RERUN.md`/ROADMAP.md/REQUIREMENTS.md; reconcile ROADMAP structure and STATE.md (wave 4, the closing plan) — **DONE 2026-08-12.** **The phase does NOT close from this plan** — `34.9-VERIFICATION.md` remains `status: gaps_found`; truth 8 awaits re-scoring by the verifier against this cycle's landed evidence: `/gsd-verify-work 34.9`. See `deferred-items.md`, 34.9-22-SUMMARY.md

### Phase 34.10: Navigation shell — horizontal card tabs replace the sidebar (INSERTED)

**Goal:** Replace the left sidebar with a **two-tier navigation shell**. Tier 1 is a horizontal
row of **card/folder tabs** — `Manage Accounts`, `Games`, `Stores`, `Settings` — where the active
tab merges into the content surface below it. Tier 2 is a **vertical contextual panel** scoped to
the selected tab. `Sidebar` and `SidebarLinks` are retired, and the ~14 destinations they carry
are redistributed. **The Games panel carries today's filter controls across unchanged** — the
filter redesign is Phase 34.11, so this phase ships a usable app on its own.

**Designed, not speculative.** Sketches `001`–`004` in `.planning/sketches/` are committed,
interactive, and rendered in the app's real tokens. `001` selected the card/folder tab style;
`003`'s winning synthesis fixed the tier-2 behaviour. The planner should read
`.planning/sketches/MANIFEST.md` first and treat the sketch decisions as settled input.

**Structure (settled — do not re-litigate):**

| Tier 1 tab | Tier 2 |
|---|---|
| Manage Accounts | **none** — content runs full-bleed |
| Games | filter panel (this phase: relocate existing controls; 34.11 redesigns) |
| Stores | nav list — GOG, Steam, Epic, Amazon, Deals, Store Search, Humble Keys, Redeem a Steam key |
| Settings | nav list — General, Game Defaults, Advanced, Wine Manager, Accessibility, Console Mode, Logs, Documentation, Ko-fi |

**Downloads is not a tab.** It is ambient state with live progress, so it sits top-right as a
progress ring with an active count.

**Known constraints the plan must handle (do not rediscover):**

- **macOS traffic lights occupy ~78px** at the window's top-left whenever the Tauri titlebar is
  transparent or overlaid. No top-mounted bar may start at x=0. Every sketch reserves this inset;
  toggle `Annotate` in any sketch to see it.

- **Themes invert the figure/ground assumption.** `themes.scss` ships themes whose navbar is
  *lighter* than the body (`dracula`, `dracula-classic`). Card/folder tabs were chosen partly
  because they survive this; any restyle must be checked against all shipped themes, not just
  `midnightMirage`.

- **MUI `<Tabs>/<Tab>` is already in the tree** at `WineManager/index.tsx:222`, and
  `components/UI/TabPanel/index.tsx` already exists. Prefer restyling the existing pattern over
  introducing a new dependency.

- **Two of four tier-1 tabs have asymmetric tier 2.** Manage Accounts drops the panel entirely,
  which shifts content width by ~204px on that transition. This was accepted deliberately (003)
  because it fires on one infrequent tab; it is a decision, not a defect to fix.

- **i18n.** Every relocated destination has an existing translation key across **49 locale
  directories**. Renaming `Library` → `Games` and reparenting sub-items is a key migration, and
  Phase 34.8's hardcoded-string gate rides `pnpm test:ci` — new nav literals will fail it.

**Correction (2026-08-07, `/gsd-discuss-phase` + `/gsd-plan-phase`):** the "~78px traffic lights"
constraint above is a CONDITIONAL statement whose condition is **false on this branch**.
`framelessWindow` defaults to `false` (`src/backend/config.ts:367`), `tauri.conf.json`/`main.rs`
set no `titleBarStyle`/`decorations`, and Tauri's `setDecorations(false)` removes macOS traffic
lights entirely. **The real inset today is 0px** (CONTEXT.md D-01), shipped as a conditional token
so overlay mode later becomes a value change. Where this section and 34.10-CONTEXT.md disagree,
CONTEXT.md wins.

**Requirements:** REQ-34.10-01, REQ-34.10-02, REQ-34.10-03, REQ-34.10-04, REQ-34.10-05,
REQ-34.10-06, REQ-34.10-07, REQ-34.10-08, REQ-34.10-09, REQ-34.10-10, REQ-34.10-11, REQ-34.10-12,
REQ-34.10-13, REQ-34.10-14, REQ-34.10-15, REQ-34.10-16
**Depends on:** Phase 34.1 (app shell and window chrome — provides the window-control surface and
the frameless drag-region runtime this rebuilds against)
**Blocks:** Phase 34.11 (the filter panel needs the tier-2 slot to exist); **Phase 34.12** — the
onboarding-tour rework (34.10 disables `SidebarTour` per D-13 and does not rebuild it). That
deferred phase was finally CREATED 2026-08-13; before then this line referenced a phase that
existed nowhere, which is why `SidebarTour.tsx` read as an abandoned orphan on disk.
**Plans:** 27/27 plans executed — **PHASE 34.10 COMPLETE, closed 2026-08-09.** Live gate **run 4**
(plan 34.10-27, 2026-08-09) scored **5/5**: all five items PASS. **REQ-34.10-06 and REQ-34.10-16 → Complete.**

Item 1 — the only item that could still fail this phase closed, and the one that failed every
prior run — PASSES. **F-34.10-03 (the seam) and F-34.10-04 (wordmark/strip/ring on one line) are
CLOSED BY MEASUREMENT in a SCORED theme**, which is the distinction gap cycle 3 was built around:
commit `220211230`'s pixel verification and the operator's `1c7a3359d` confirmation were both taken
in an unscored teal scheme, and this phase had already declared this same truth fixed twice before
(34.10-18's seam border, 34.10-19's tab `min-height`) with a live measurement contradicting it both
times. Item 1's three-theme sweep PASSED on both the seam and idle-ring columns across
`midnightMirage`, `gruvbox_dark` and `dracula`, obtained as six distinctly elicited answers — the
first run in this phase with clean per-theme provenance on all six cells. Items 2, 3, 4 and 5 were
each RE-RUN live rather than carried forward, and all PASS.

**PERMANENT RESIDUAL RISK — the gamepad focus-scroll regression, never measured in any of the four
runs.** No controller was available at any run (P9), so `GamesList/index.tsx:46-76`'s
`scrollCardIntoView` — container-rect-relative arithmetic, exercised only when `activeController`
is truthy, and **directly affected by plan 34.10-18's relocation of the scroll container off
`document.body`** — has never been exercised live. It is non-blocking per the gate's own escape
hatch and the phase closes with it open, but it is recorded here as a named risk rather than left
as a pending gate cell for a fifth run to inherit. It must never be inferred from the
mouse/keyboard back-to-top sub-check's PASS: different code path, different arithmetic. Whoever
next has a controller on this machine should drive it.

**F-34.10-08 (new, process-not-product, open).** Run 4's own preflight row P11 carried two
independent defects, both proven empirically rather than reasoned about: a `^` anchor that can
never match vite's single-line minified CSS (it returned `0` even for the file that *does* contain
the rule, so it would have passed against a bundle carrying the live leak), and a directory-wide
glob over 14 accumulated build chunks including abandoned debug instrumentation. Neither altered a
verdict — the intended assertion was carried out correctly by hand — and both are recorded rather
than fixed, per decision D-E. Same class as F-34.10-07. **Generalisable rule for successor
contracts: a grep-based assertion must be proven to FAIL against a known-bad input before it is
trusted to pass against a good one.**

**The stale-bundle rule earned its place for the second run running.** Preflight caught that the
already-running app was serving an 08:39 build predating plan 34.10-23's 11:17 rescope; `build/`
was cleared and rebuilt before any scored observation.

The debug session triggered by F-34.10-03/-04 surviving their targeted fixes has RUN and
is CLOSED (`.planning/debug/navbar-seam-and-logo-offset.md`, `status: resolved`). Root cause:
`src/frontend/screens/Settings/sections/GamesSettings/index.scss:40` declared
`.MuiTabs-root { padding-bottom: var(--space-xs) }` with no scoping ancestor, so the 8px leaked
app-wide into the nav shell's `<Tabs>`; `.NavShell__navbar`'s `align-items: flex-end` bottom-aligns
the flex item's BORDER BOX, so that padding held the tab strip 8px above the real navbar/content
boundary — one cause, both findings. Fixed in commit `220211230` (a nested
`&.MuiTabs-root { padding-bottom: 0; min-height: 0 }` in `NavTabs/index.scss`), operator-confirmed
live in commit `1c7a3359d` ("the download and wordmark read level now"). Five earlier attempts
targeted the wrong property and are enumerated in the debug file so none is retried — do not
re-litigate `min-height` or `align-items` on that element. STILL OWED: a run-4 live gate that
re-measures item 1 IN FULL, because the fix was confirmed in ONE non-scored theme (the ambient
teal scheme) only, and this exact truth has already been wrongly declared fixed twice in this
phase. **That run-4 gate has now RUN and PASSED** (34.10-25 authored §10.1-§10.4, 34.10-26 authored
§10.5 plus `34.10-run4-contract-check.mjs`, 34.10-27 ran it — decision D-E honoured throughout, no
plan both authoring and scoring). See `34.10-LIVE-GATE.md` §10 and §10.6. **Next:
`/gsd-verify-work 34.10`.**

Gap cycle 2 plans, closing F-34.10-03 through F-34.10-06 plus the per-theme sweep that has
never been reached in two runs:

- [x] 34.10-17-PLAN.md — revert REQ-34.10-06 to Pending; live box-model capture; diagnose F-34.10-04 and settle F-34.10-05 (wave 1)
- [x] 34.10-18-PLAN.md — F-34.10-03 seam border + F-34.10-06 navbar pinning and scroll-container relocation (wave 2)
- [x] 34.10-20-PLAN.md — F-34.10-05 tier-2 disclosure panel surface (wave 2)
- [x] 34.10-19-PLAN.md — F-34.10-04 single-line navbar, implemented against 34.10-17's diagnosis (wave 3)
- [x] 34.10-21-PLAN.md — author the run-3 live-gate contract, its reviews and preflight (wave 4, D-E author)
- [x] 34.10-22-PLAN.md — RUN the run-3 gate and reconcile REQUIREMENTS.md (wave 5, D-E runner)

Gap cycle 3 plans, closing the run-3 gaps recorded in `34.10-VERIFICATION.md`:

- [x] 34.10-23-PLAN.md — rescope the leaking `.MuiTabs-root` rule + repo-wide guard test (wave 1)
- [x] 34.10-24-PLAN.md — correct stale ROADMAP/STATE records; record the pill-tab deferral (wave 1)
- [x] 34.10-25-PLAN.md — author the run-4 gate contract §10.1-§10.4 (scope, preflight, reviews) (wave 2)
- [x] 34.10-26-PLAN.md — author §10.5 item bodies + prove every automated check against a filled specimen (wave 3)
- [x] 34.10-27-PLAN.md — RUN the run-4 gate; reconcile REQUIREMENTS/ROADMAP/STATE (wave 4, blocking checkpoint) — **VERDICT PASS 5/5**

**Carried forward from the phase-34.10 code review (`34.10-REVIEW.md`, 2026-08-09) — two
CONFIRMED Critical findings, deliberately NOT fixed in this phase.** Both were independently
verified rather than taken on the reviewer's word, and both are coverage gaps the live-gate
contract never covered — not measurements it got wrong, so neither contradicts run 4's 5/5. They
are deferred on the operator's explicit decision, because patching CSS after the gate would mean
HEAD no longer matches the bundle that passed, and *a shipped fix is not evidence* is the lesson
this phase paid for four times over.

- **CR-01 — `NavTabs/index.scss:229` uses an undefined theme token with no fallback.**
  `.Mui-selected { color: var(--navbar-active) }`. `--navbar-active` is declared in only 3 places
  in `themes.scss` while `--navbar-active-background` exists in all 11 theme blocks; **`gruvbox_dark`,
  one of the three SCORED gate themes, has the background variant and not this one**, so the active
  tab's label falls through to an inherited colour. `NavItem/index.scss:22` already uses the correct
  fallback chain (`var(--navbar-active, var(--accent-overlay, var(--accent)))`), and the comment
  block directly below the offending line documents this exact defect class for `--divider` — it was
  fixed there for `border-color` and missed on `color`. **Not observed as visibly broken during run
  4's gruvbox_dark sweep**, which judged the seam and the idle ring rather than label legibility;
  stated in both directions rather than inflated. Whichever phase fixes it must re-measure the
  active-tab label in `gruvbox_dark`, not fix-and-assume.

- **CR-02 — the window drag region was never ported from the retired sidebar.**
  `.Sidebar/index.scss` carried `-webkit-app-region: drag` (confirmed at `0559bc0d0~1:21`).
  `.NavShell__navbar` has no equivalent. The `no-drag` CHILDREN *were* ported
  (`HeroicVersion/index.scss:35`, `WindowControls/index.scss:6`), so those exclusions now exclude
  from a drag region that does not exist — a partial port, not a design choice. Under **Electron**
  frameless (`main_window.ts:48-49`, driven by the same `settings.framelessWindow` the gate toggled
  under Tauri) navbar dragging is therefore broken; `tauriWindowChrome.ts`'s JS drag handler is
  Tauri-only and does not cover that path. The gate could not have caught this by construction:
  item 2 was Tauri-only and item 5's Electron check never exercised dragging. **Likely moot rather
  than urgent** — Phase 35 deletes Electron entirely — but recorded so that decision is made
  knowingly rather than by omission.

Also carried forward, lower severity: **WR-01** — `muiTabsSelectorScoping.test.ts`'s guard (the
load-bearing one that prevents F-34.10-03/-04 recurring) is bypassable by wrapping an unscoped
`.MuiTabs-root` in `@media`/`@supports`, verified empirically; dormant today but the guard's stated
promise does not fully hold. **WR-02** — `LibraryFilters/index.tsx`'s `t(RunnerToStore[store])`
produces untranslatable labels for `steam`/`zoom` (never registered in `translation.json`, unlike
the Epic/GOG/Amazon siblings); pre-existing, predates this phase. **IN-01** — dead `data-tour`
props in `CategoryFilter`/`LibraryFilters` that `Dropdown` never reads.

**Pill-tab restyle election — DROPPED FROM SCOPE 2026-08-13 (user decision). Do not re-raise.**

History: during run 3 the operator said, verbatim (`34.10-LIVE-GATE.md` §9.6): *"i going to drop
the tab and let make a pill, that what it looks like anyway! just needs rounded bottom corners."*
That was recorded as a DECISION and deferred to follow-up work, out of scope for gap cycle 3.
`34.10-VERIFICATION.md`'s third `human_verification` item was answered by it.

**Outcome: the restyle will not be done.** Asked on 2026-08-13 whether to capture it as a phase
alongside the tour rework, the user answered: *"no do not need pill-tab restyle, that can be
removed from scope."* The card/folder tab **as it currently ships is final** — this is now a
closed decision, not a pending one, and it needs no phase, no backlog entry and no follow-up work.

**REQ-34.10-06's card/folder framing STANDS unchanged** and is now permanent rather than
provisional — run 4 scored the tab shape as it ships, which is the shape that stays.

The onboarding-tour rework that was the OTHER deferred item from this phase (CONTEXT.md D-13) is a
separate matter and was captured as **Phase 34.12** on 2026-08-13. Dropping the pill restyle does
not affect it.

**Follow-up finding filed by the debug session, closed by plan 34.10-23:** the unscoped
`.MuiTabs-root` leak class (see root cause above) had no regression guard anywhere in the app —
`NavTabs/index.scss` is protected by `appShellLayout.test.ts`, but the `GamesSettings`/
`WineManager`/`DownloadManager` stylesheets that also declare `.MuiTabs-root`-adjacent rules were
not. `34.10-23-PLAN.md` rescopes the leaking rule and adds a repo-wide guard test for this leak
class.

--- run 2's status, preserved as history ---
**Plans:** 16 plans, all 16 executed — **PHASE STILL DOES NOT CLOSE (gap cycle 2 owed).** The
blocking 5-item live gate ran a SECOND time 2026-08-08 (`34.10-16-PLAN.md`), recorded into
`34.10-LIVE-GATE.md` §7 (run 2): **VERDICT FAIL, 4 of 5 PASS** (`items_passed: 4`) — see
`34.10-LIVE-GATE.md` run 2 and `34.10-16-SUMMARY.md`. Both of run 1's blocking defects are now
CLOSED and live-confirmed: item 3 (tier-2 filter controls' functional contract, REQ-34.10-09)
PASSES — **F-34.10-01 CLOSED**; item 4 (Downloads ring, REQ-34.10-08) PASSES, including the arc
filling and advancing during a real download — **F-34.10-02 CLOSED**, and the two risks
34.10-15-SUMMARY.md left explicitly unresolved (a `key`-driven remount; H3's mechanism doubt) are
**FALSIFIED** by this measurement. Item 5 (Electron, REQ-34.10-05) PASSES for the first time on
its tab-navigation sub-check — never measured in run 1. Item 2 (window dragging, REQ-34.10-04)
PASSES. **Item 1 (theme survival, REQ-34.10-06) newly FAILS**, on layout defects not present in
run 1: **F-34.10-03** (a visible ~10px gap between the tier-1 tab strip and the content region,
breaking the card/folder merge illusion), **F-34.10-04** (the logo and Downloads ring wrap onto a
second row instead of sharing one line with the tab strip), and **F-34.10-06** (the navbar scrolls
away with page content instead of staying fixed to the top of the window, and an active scrollbar
draws over it). A fourth new finding, **F-34.10-05** (item 3's tier-2 disclosure panel renders a
black background that breaks its styling), does not gate item 3's own PASS but keeps
REQ-34.10-09 Pending, by the same precedent run 1 itself set for F-34.10-01. `REQUIREMENTS.md`'s
REQ-34.10-05 and REQ-34.10-08 are now Complete; REQ-34.10-09 and REQ-34.10-16 stay Pending. Item
1's per-theme rows are recorded NOT ATTEMPTED (the operator's report was general, not per-theme),
never inferred. **Next: `/gsd-plan-phase 34.10 --gaps` (gap cycle 2)** to diagnose and fix
F-34.10-03 through F-34.10-06, then a third live-gate pass scoped to item 1 (and item 3's
F-34.10-05) — items 2, 4 and 5 are closed and should not need re-measurement unless a gap-cycle fix
touches their surfaces.

--- run 1's original entry, preserved as history ---

The blocking 5-item live gate
(`34.10-11-PLAN.md`) authored `34.10-LIVE-GATE.md` and RAN it on real hardware 2026-08-08:
**VERDICT FAIL, 2 of 5 PASS** (`items_passed: 2`) — see `34.10-LIVE-GATE.md` and
`34.10-11-SUMMARY.md`. Item 1 (theme survival, REQ-34.10-06) and item 2 (window dragging under
WKWebView, REQ-34.10-04) PASS, both now live-confirmed. Item 3 (tier-2 portal live, REQ-34.10-09)
FAILS on **F-34.10-01**: the portal seam itself is confirmed sound (search filters the grid
correctly), but `CategoryFilter`/`LibraryFilters` open on hover and overflow off the left edge of
the 204px tier-2 column (`Dropdown/index.scss`'s `right:0; min-width:250px` popup). Item 4
(Downloads ring, REQ-34.10-08) FAILS on **F-34.10-02**: no ring renders at rest or during an
active download — a hover-state backdrop-token mismatch plus `hasProgress()` yielding no percent
for the head element. Item 5 (Electron, REQ-34.10-05) is NOT ATTEMPTED on its tab-navigation
sub-check (shell-renders and the no-traffic-light-overlap observation both PASS). REQUIREMENTS.md's
REQ-34.10-05/-08/-09 were reverted Complete → Pending accordingly; REQ-34.10-04/-06 stay Complete.
**Gap cycle 1 planned 2026-08-08** (`/gsd-plan-phase 34.10 --gaps`): plans 34.10-12..16, 16/16
total, 3 waves. Plan 12 is a live *diagnostic* (not a gate) that collapses F-34.10-02 cause (b)'s
hypothesis field before any code is written — the live gate's own suggested cause (a keying/remount
difference vs. the retired `CurrentDownload`) is already falsified in source, since
`git show 0559bc0d0^:src/frontend/components/UI/Sidebar/index.tsx` used the identical `elements[0]`
source AND the identical `key={...params.appName}`. Plan 16 re-runs the gate, including the three
sub-checks recorded NOT ATTEMPTED in run 1.
**Plan 12 EXECUTED 2026-08-08** (`34.10-12-SUMMARY.md`): the live three-question discriminator
(Q1/Q2/Q3, all YES) rejected H1/H2/H4 by direct criteria, H5 by the idle-opacity-does-not-apply
-during-active-download argument, and H6 by two independent working precedents (`WineItem`,
`GameCard`) for the same inline-custom-property mechanism in this codebase. H3 survives **by
elimination**, not a proven always-reproducing mechanism: `hasProgress.ts:14-19`'s `previousProgress
?? default` never applies because `previousProgress` is always the truthy empty object `{}` (the
`${appName}_${runner}_progress` localStorage key is written nowhere in the repo), amplified by
`RingProgress` being the one `hasProgress` consumer that is conditionally mounted
(`DownloadsRing/index.tsx:70-75`) rather than persistently mounted. Three concrete fix directives
handed to plan 34.10-15 — see `34.10-F02-DIAGNOSIS.md`. No `src/` changes; `34.10-LIVE-GATE.md`
byte-identical. REQ-34.10-08 stays Pending (diagnosis only, no fix implemented or measured).
**Plan 15 EXECUTED 2026-08-08** (`34.10-15-SUMMARY.md`): implemented ONLY item 2 of the diagnosis's
three-item recommendation (unconditional mount, in scope) — `RingProgress` in `DownloadsRing`
(`index.tsx`) mounted unconditionally with `?? ''`/`?? 'legendary'` fallback args, following the
`ProgressHeader` precedent (`DownloadManager/index.tsx:113-115`); `percent` gated on non-empty
`appName`. `RingProgress` exported and directly invoked by a new test for the first time, with a
regression assertion verified to fail pre-fix (temporarily reverted `index.tsx`, `idleRingElement`
came back `undefined`). Full suite green: 218/218 suites, 4246/4246 tests. **F-34.10-02 remains
UNPROVEN** — a post-implementation re-read surfaced two unresolved risks (full detail in
`34.10-15-SUMMARY.md`): (1) `key={head?.params.appName ?? 'idle'}` still forces a React remount at
the idle→active boundary, so the hook-instance lifetime this fix targets may not have actually
changed at the one boundary that matters, and the new test cannot detect this (it invokes
`RingProgress` directly, bypassing React's reconciler and `key` semantics entirely); (2)
`hasProgress.ts`'s reconciliation effect fires on mount, so H3's `{}` seed should produce at most
one transient 0%-frame, not the sustained flat arc the live gate observed — H3's mechanism may not
survive close reading. Item 1 (`hasProgress.ts:14-19` seed fix, all six consumers affected)
deliberately NOT implemented — out of scope (shared hook, not in this plan's files_modified), owed
to a future plan. REQ-34.10-08 stays Pending; `34.10-LIVE-GATE.md` untouched.
**Next:** `/gsd-execute-phase 34.10 --gaps-only` — not `/gsd-verify-work`, and not a milestone
transition. Plan 34.10-16's live gate item 4 is the only adjudicator of whether F-34.10-02 is
actually closed, and must specifically check both unresolved risks above if it fails again.

Plans:

- [x] 34.10-01-PLAN.md — Shell contracts: `navTabs.ts` tab identity + default-store cascade, the tier-2 portal context, and the Games portal-target panel (wave 1)
- [x] 34.10-02-PLAN.md — `NavItem` tier-2 row primitive + the shell stylesheet and its `--tier2-width` / navbar-height / inset tokens (wave 1)
- [x] 34.10-03-PLAN.md — Ambient Downloads ring: always-present, dimmed when idle, queue-count badge (wave 1)
- [x] 34.10-04-PLAN.md — Tier-1 card/folder tab strip on reskinned MUI `<Tabs>`, route-driven, relational seam (wave 2)
- [x] 34.10-05-PLAN.md — Stores and Settings tier-2 panels: all 14 destinations redistributed, three reparented, Quit relocated (wave 2)
- [x] 34.10-06-PLAN.md — Games tier-2 via portal from `Library` (LibraryContext stays intact), `Header` becomes a vertical stack, frameless padding hack deleted (wave 2)
- [x] 34.10-07-PLAN.md — `HeroicVersion` relocation with unconditional mount, tour disabled, `NavShell` root composition (wave 3)
- [x] 34.10-08-PLAN.md — Mount the shell in `App.tsx`, restructure the `App.css` grid, migrate the drag region off `.Sidebar` with its three fixtures in lockstep (wave 4)
- [x] 34.10-09-PLAN.md — Replacement structural tests + retire the `Sidebar` tree (wave 5)
- [x] 34.10-10-PLAN.md — i18n: the one new `nav.tabs.games` key, gate-scope regeneration, full-suite proof (wave 6)
- [x] 34.10-11-PLAN.md — Author and run the blocking live gate: FAIL 2/5 (F-34.10-01, F-34.10-02) — phase does not close, gap cycle owed (wave 7)
- [x] 34.10-12-PLAN.md — GAP: F-34.10-02 cause (b) live diagnostic — three-question discriminator on real hardware, then a six-hypothesis source trace to one root cause; H3 survives by elimination (wave 1, checkpoint)
- [x] 34.10-13-PLAN.md — GAP: F-34.10-01 — `Dropdown` becomes a click-toggled in-flow disclosure sized to the 204px column, `popUpOnHover` deleted, tier-2 portal gains a scroll container (wave 1)
- [x] 34.10-14-PLAN.md — GAP: F-34.10-02 cause (a) — the ring's painted hole becomes a CSS mask, idle track repainted in the count badge's proven-visible token chain (wave 1)
- [x] 34.10-15-PLAN.md — GAP: F-34.10-02 cause (b) — RingProgress mounted unconditionally (item 2 only) + first `RingProgress` test coverage; F-34.10-02 remains UNPROVEN, two risks unresolved, routed to plan 16's live gate (wave 2)
- [x] 34.10-16-PLAN.md — GAP: live gate RUN 2 EXECUTED — 4/5 PASS (items 2, 3, 4, 5); item 1 (theme/seam) FAILS on 3 new findings (F-34.10-03/04/06); F-34.10-01 and F-34.10-02 CLOSED; phase still does not close, gap cycle 2 owed (wave 3, checkpoint)

### Phase 34.11: Library filtering — search, views, collections and cross-store facets (INSERTED)

**Goal:** Build the Games tier-2 panel for real — sketch `004` **variant C (hybrid)**. Search and
single-select views (`All games`, `Installed`, `Recently played`, `Favourites`) and user
collections sit at the top so the common case stays one click. Multi-select facets for **Store**,
**Platform** and **Genre** live below, collapsed by default. Active filters surface as
**removable chips above the grid**, so the user can always see why they are looking at 6 games
instead of 214.

**Why the facets matter more here than in other launchers:** spanning Epic, GOG, Amazon and Steam
is GameLib's reason to exist, so "show me only my GOG games" is the product's central question. A
views-only panel (sketch 004 variant A) cannot answer it, which is why A lost.

**Known constraints the plan must handle (do not rediscover):**

- **Facet counts must exclude their own facet.** Ticking `GOG` must leave the other Store counts
  showing what they *would* yield rather than collapsing to 0. The sketch implements this; it is
  the difference between counts that guide the next click and counts that lie.

- **Genre metadata coverage is unverified and will be uneven.** Genres come from four different
  store APIs. A genre facet that is empty for every Amazon title reads as broken. **Verify real
  coverage per store before committing to the genre facet** — dropping it is an acceptable
  outcome; shipping it half-populated is not.

- **Platform filtering is not cosmetic on this fork.** GameLib runs Windows games on macOS through
  Wine/CrossOver bottles, so the question users have is "will this run on my machine", not "is
  this native". Those are different predicates. The CrossOver compatibility index (Phase 19) and
  the macOS 32-bit detection work (Phase 18) already hold the data to answer the first one.

- **Filter state persistence** — whether filters survive navigation, restart, or neither, is
  undecided and belongs in this phase's discuss step.

- Collections (`Roguelikes`/`Cozy`/`Backlog`/`Co-op` in the sketch) are mocked. Whether they are
  manual, rule-based, or both was explicitly left out of scope by sketch 004.

**Requirements:** REQ-34.11-01..17 (minted 2026-08-09 during `/gsd-plan-phase 34.11` from `34.11-CONTEXT.md` D-01..D-35 + the checker-approved `34.11-UI-SPEC.md` + `34.11-RESEARCH.md` + `34.11-VALIDATION.md`. **Three of the "Known constraints" above are superseded by measurement:** the **genre facet is DROPPED** — measured coverage shows Epic contributes none at all and Steam only for games the user has already opened, so the "verify before committing" instruction was carried out and its answer was no (D-13/D-14/D-15); **filter-state persistence is no longer undecided** — search is session-only and cleared on tab switch, every other filter survives tab switch and restart, and `Clear all` persists (D-22..D-25, REQ-34.11-06/07); and **the runnability facet cannot render on Windows at all** — `GameInfo` carries `is_mac_native`, `mac_arch` and `is_linux_native` but no Windows-native field of any kind, so D-12's own "hide rows you cannot compute" rule removes the entire group on that host rather than showing a degenerate all-pass row (REQ-34.11-01). **Two operator decisions at plan time are recorded as CONTEXT.md amendments:** `Fuse.js` fuzzy search STAYS this phase — research falsified D-33's premise that substring matching is what ships today (`Library/index.tsx:601-616` runs Fuse at `threshold: 0.4`), so D-35 is tagged `[informational — DEFERRED]` and REQ-34.11-15 specifies the consequence that facet counts are computed over the fuzzy-matched set; and the Runnability group is omitted entirely on Windows. **One defect absent from every upstream artifact** was found during UI-SPEC scouting and minted as REQ-34.11-12: `.NavShell__tier2`'s `border-inline-end` resolves `var(--divider)`, a token defined in only 2 of 11 theme blocks and missing from both mandatory stress-test themes — the third instance of this class, and the first pinned by a committed automated gate rather than a live sweep. Collections ship **manual only**, as sketch 004 left open (D-19).)
**Depends on:** Phase 34.10 (the tier-2 panel slot)
**Plans:** 9/9 plans complete

Plans:

**Wave 1** *(no dependencies — run in parallel)*

- [x] 34.11-01 — Extract the library filter pipeline into named pure functions; add opt-in facet types
- [x] 34.11-02 — Extend `NavItem`'s `button` branch with `className` + `active`
- [x] 34.11-03 — Theme fixes CR-01, CR-02, `--divider`; pin with an automated source gate

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 34.11-04 — New filter state model in `Library`, exposed via `LibraryContext`

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 34.11-05 — Rewire `gamesForAlphabetFilter` onto `filterEngine`; retire literal-platform + CrossOver-rating stages
- [x] 34.11-06 — Views + Collections panel sections
- [x] 34.11-07 — Store + Runnability + "More filters" facet groups, with own-facet-excluding counts

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 34.11-08 — `FilterChipRow` above the grid + zero-result empty state

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 34.11-09 — Mount the panel, retire `CategoryFilter`/`LibraryFilters`, close the i18n + multi-theme gates *(not autonomous — human-driven live sweep)*

**Cross-cutting constraints:**

- Counts and the grid come from ONE implementation (`filterLibrary`), so a count can never disagree with what is shown (REQ-34.11-04).
- A facet option's count excludes its own facet (REQ-34.11-10).
- No jsdom in this repo (`testEnvironment: 'node'`, no `@testing-library/react`) — every test uses direct function-invocation or a source-text gate.
- Localisation is a standing BLOCKING gate: new keys use the `gamelib:` namespace via the literal `tGamelib` alias, and new files are registered in `meta/i18nGateScope.json`.
- A grep assertion must be proven to FAIL against a known-bad input before it counts as passing.
- Multi-theme survival: never validate against `midnightMirage` alone; `gruvbox_dark` and `dracula` are mandatory.

### Phase 34.12: Onboarding tour rework — re-anchor the disabled SidebarTour against the two-tier NavShell (INSERTED)

**Goal:** Rebuild the onboarding tour against the two-tier NavShell. Phase 34.10 DISABLED the
sidebar tour under decision D-13 and deliberately did not rebuild it; this phase is the rebuild
34.10 has owed since it closed. Each of `SidebarTour.tsx`'s twelve `data-tour="sidebar-*"` steps
must be re-anchored to a surface that still exists in the new shell, or dropped with a reason.

**Requirements**: TBD (run `/gsd-discuss-phase 34.12`)
**Depends on:** Phase 34.10 (the two-tier shell the steps must anchor to) and Phase 34.11 (the
filter panel — several retired steps pointed at library surfaces that 34.11 replaced)
**Plans:** 0 plans

**Why this phase exists — captured 2026-08-13.** It was referenced in three places but had never
been created: ROADMAP.md listed "the deferred onboarding-tour rework phase" in Phase 34.10's
`Blocks:` line, and 34.10's gap-cycle notes say the phase "already owes" it (CONTEXT.md D-13) —
yet no phase heading existed anywhere. The dangling deferral is why
`src/frontend/components/UI/Sidebar/components/SidebarTour.tsx` reads as an abandoned orphan on
disk; a `/gsd-audit-uat` follow-up mistook it for exactly that before checking the plan that
created the state.

**Work-list (do not rediscover — this is the phase's input):**
- `src/frontend/components/UI/Sidebar/components/SidebarTour.tsx` — the sole surviving file of the
  retired `Sidebar/` tree, kept ON PURPOSE by plan 34.10-09 Task 3 ("the entire `Sidebar` tree
  **except** `components/SidebarTour.tsx`"). Its 21-line header comment records its own status.
  Its step text and i18n keys are this phase's input, unchanged since 34.10.
- **Known pre-existing defect to FIX, not rediscover:** two different elements carried the same
  `data-tour="sidebar-downloads"` value — the retired `Sidebar/index.tsx`'s `currentDownloads`
  wrapper and the "Downloads" row inside the retired `SidebarLinks`. A selector matching two
  elements is ambiguous; whichever the tour library picked first was never guaranteed to be the
  intended one.
- **34.10 IN-01** — dead `data-tour` props in `CategoryFilter`/`LibraryFilters` that `Dropdown`
  never reads. Fold in here rather than leaving them as permanent noise.

**Gate that must be retired as part of this phase:** `NavShell/__tests__/tourDisabled.test.ts`
asserts the tour CANNOT start (no NavShell file references `SidebarTour`/`SIDEBAR_TOUR_ID`/
`TourButton`/`data-tour`, and nothing imports `SidebarTour`). Re-enabling the tour necessarily
falsifies it. Replace it with a positive gate — do not simply delete it, and do not let it become
vacuously true, which is what deleting `SidebarTour.tsx` alone would have done.

**Note on the `(INSERTED)` marker:** carried from the `phase.insert` tooling, which stamps every
insertion as urgent. This phase is NOT urgent — it is deferred UI polish with no user-facing
breakage while the tour stays disabled and unreachable.

Plans:
- [ ] TBD (run `/gsd-discuss-phase 34.12`, then `/gsd-plan-phase 34.12`)

### Phase 35: Electron cutover — remove the Electron build

**Goal:** Retire the Electron build: delete `electron-vite`/`electron-builder` config, the preload contextBridge path, and the `isTauri()` branches, leaving Tauri as the only shell. This is the one phase that deliberately breaks the additive/reversible invariant every prior phase preserved — so it runs last, and only once the `session`/`powerSaveBlocker` parity gaps are resolved or explicitly accepted, and the parked Electron-renderer bugs (see `debug-uninstall-game-vanishes-parked`) have been re-tested against Tauri rather than fixed in Electron.
**Depends on:** Phase 34 (all three platforms shipping on Tauri first) **and Phases 34.1–34.7** (the IPC re-plumb must be complete, plus the Epic device-auth single-path consolidation — see `.planning/IPC-PORT-INVENTORY.md`). As of 2026-07-25 only 27 of 210 IPC channels are on the sidecar; cutting over before the port finishes would strand ~183 channels. Also blocked on migrating the renderer off `electron-vite` onto plain Vite, since `tauri:dev` currently shells out to `electron-vite build` and `tauri.conf.json` serves its `build/` output as `frontendDist`.
**Requirements:** TBD — mint at `/gsd-plan-phase 35`
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 35 to break down)

## Progress

**Execution Order:**
v0.1: 1 → 2 → 3 → 4 (complete)
v0.2: 5 → 6 → 7 → 8 → 9 (9 not started)
v0.3: 10 → 11 → 12 → 13 → 14 → 15 (Phase 15 depends on Phase 12; can run in parallel with Phase 14)
v0.4: 16 (depends on Phase 7 extra-info rows; feasibility validated by spike 260710-nwb)
v0.5: 17 (depends on Phase 3 Steam ops + Phase 7 platform data; macOS-only CrossOver/Wine runtime) → 18 (depends on Phase 17 bottle routing + Phase 7 platform data)
     19 (depends on Phase 16 only — independent of 17/18, can run in parallel)
v0.6: 20 (depends on Phase 12 ownership dedup only — independent of the v0.5 macOS/CrossOver line, can run in parallel)
v0.7: 21 (depends on Phase 3 Steam ops + Phase 1 auth) → 23 (depends on 21) → 24 (depends on Phase 17; supersedes/parks 22) → 25 (depends on 24) → 26 (depends on Phase 1 + Phase 2/12, and Phase 14 for the auto-redeem increment)
v0.8: 27 (depends on the Phase 1-26 backend lineage + spikes 009-012)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Steam Authentication | 3/3 | Complete | 2026-06-27 |
| 2. Steam Library | 6/6 | Complete | 2026-06-28 |
| 3. Game Operations | 4/4 | Complete | 2026-06-28 |
| 4. Branding | 2/2 | Complete | 2026-06-28 |
| 5. Branding & About Polish | 4/4 | Complete | 2026-07-02 |
| 6. Library & Game Status UX | 2/2 | Complete | 2026-07-03 |
| 7. Game Details Enrichment | 1/1 | Complete | 2026-07-03 |
| 8. New Steam Surfaces | 6/6 | Complete | 2026-07-03 |
| 08.1 Steam Delisted Games & Library Filters | 4/4 | Complete | 2026-07-04 |
| 9. Quality Gate | 0/0 | Not started | - |
| 10. Humble Auth + Adapter Scaffold | 6/6 | Complete | 2026-07-05 |
| 11. Library Sync + 5-State Key Model | 5/5 | Complete | 2026-07-06 |
| 12. Ownership Dedup | 5/5 | Complete | 2026-07-06 |
| 13. Keys-Waiting + Giftable-Spares Views | 5/5 | Complete (gaps historically found — verify closure) | 2026-07-08 |
| 14. Guided Claim Flow | 8/8 | Complete | 2026-07-09 |
| 15. Store Overlay + Expiration Alerts | 6/6 | Complete | 2026-07-10 |
| 16. CrossOver Compatibility Rating (CodeWeavers) | 3/3 | Complete | 2026-07-10 |
| 17. Steam on macOS via CrossOver/Wine | 17/17 | Complete | 2026-07-13 |
| 18. macOS 32-bit detection, badge & CrossOver routing | 6/6 | Complete | 2026-07-13 |
| 19. CrossOver Compatibility Index (macOS) | 8/8 | Complete | 2026-07-14 |
| 20. Aggregated Store Search (CheapShark) | 7/7 | Complete | 2026-07-15 |
| 21. Steam Native Install (depot download) | 17/17 | Complete | 2026-07-20 |
| 22. Steam Game Families (multiple bottle configs) | 0/8 | Parked (superseded by Phase 24) | - |
| 23. Steam full-ownership install (StateFlags=4) | 5/10 | In progress — gaps G-23-01/G-23-02 open | - |
| 24. macOS native Steam bridge (out-of-process steam_api proxy) | 16/17 | Complete (code + HW Gates 0-3; Gate 4/Hoard out of scope; 24-10 has no SUMMARY.md) | 2026-07-21 |
| 25. Steam depot download multi-host fan-out (throughput) | 3/3 | Complete + HW-verified | 2026-07-19 |
| 26. Steam Key Redemption | 5/5 | Complete | 2026-07-20 |
| 27. Tauri Shell Walking Skeleton | 5/5 | Complete | 2026-07-21 |

---

## Parked / Superseded Phases

### Phase 22: Steam Game Families (multiple bottle configurations)

**Status:** ⛔ PARKED 2026-07-21 — superseded by Phase 24. See `.planning/phases/22-multiple-steam-bottles/PARKED.md` and commit `b40aa6d8`.
**Plans:** 8 written, 0 executed — all artifacts retained, nothing deleted.

**Why:** Phase 22 existed to let a user group macOS Steam games into "families," each backed by its own dedicated CrossOver bottle with its own Steam client/login/Wine version, working around the fact that the Phase 17 single-bottle foundation shared one bottle for every macOS Steam game. Phase 24 shipped a native `steam_api` proxy instead: a drop-in shim in a single shared bridge bottle talks out-of-process to the real native macOS Steam client. There is no bottled Windows Steam client to configure per family anymore, and one shared bridge bottle (`DEFAULT_BRIDGE_BOTTLE_NAME`, D-03) serves all bridge-eligible games — the per-family bottle matrix Phase 22 was designed to manage no longer has anything to manage. This was anticipated: the bridge was already recorded in STATE.md as "Phase 22's preferred successor" before Phase 24 was executed.

**Goal (as originally scoped, never executed):** Let a user group macOS Steam games into "families" — each family backed by its own dedicated CrossOver bottle with its own Steam client, login, and Wine/CrossOver version — so games that need a different configuration can get one, instead of every macOS Steam game sharing the single Phase 17 bottle.
**Depends on (as scoped):** Phase 17 (dedicated Steam bottle foundation) and Phase 18 (bottle-eligibility routing). Independent of the Phase 20/21 lines.
**Requirements**: TBD (never minted — SPEC.md never locked)

**Plans (unexecuted):**

- [ ] 22-01-PLAN.md — Reshape SteamBottleConfig → families/assignments + thread explicit bottleName through bottle.ts primitives
- [ ] 22-02-PLAN.md — families.ts service: zero-loss migration, CRUD, resolveFamilyForApp, naming rules
- [ ] 22-03-PLAN.md — Cross-family ACF reconciliation + poller: scan all families, tag bottleName
- [ ] 22-04-PLAN.md — Resolver-first routing in games.ts across all four bottle-eligible methods
- [ ] 22-05-PLAN.md — Fold single-bottle IPC into the family group + wire startup migration
- [ ] 22-06-PLAN.md — Parameterize the guided-setup store/component by bottleName
- [ ] 22-07-PLAN.md — Install-time family picker + gate both install chokepoints
- [ ] 22-08-PLAN.md — "Steam Families" Settings section: create/rename/set-wine/guarded delete

**If ever unparked:** the parts of Phase 22 that could still have value are the ones *not* about bottle multiplicity — chiefly any per-game launch-configuration UI and the Steam game-families data model itself. Re-derive those against the bridge architecture rather than executing the plans as written. Bridge scope limits that might reopen adjacent work are tracked in Phase 24's own artifacts (`24-UAT.md`, `24-SECURITY.md`) and the `spike-findings-gamelib` skill — notably that the bridge currently proxies only ISteamUser + ISteamFriends, so games needing more interfaces (Utils/Apps/UserStats/RemoteStorage/Matchmaking/Networking) are out of scope until those proxies are built.
