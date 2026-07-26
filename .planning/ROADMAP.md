
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
- [ ] **Phase 23: Steam full-ownership install (StateFlags=4)** - GameLib authors a StateFlags=4 (FullyInstalled) manifest so Steam does zero verify/download work on first install (in progress — 5/10 plans executed [23-01,02,03,05,06]; gaps G-23-01/G-23-02 open — native install applies no execute bits, KCD2 Blocked-depot-key aborts whole install; Gate 2 CONDITIONAL PASS only after a manual `chmod +x`; Gate 3 not yet run; REQ-23-07 stays open; see 23-TRACE.md)
- [ ] **Phase 24: macOS native Steam bridge (out-of-process steam_api proxy)** - Out-of-process steam_api shim so bottled Windows-only Steam games run against ONE native macOS Steam client instead of a bottled Windows Steam client per bottle (16/17 plans — 24-10, the human-HW packaged-build acceptance checkpoint, has no SUMMARY.md; Gates 0/1/2/3 PASS on real hardware per 24-UAT.md and gap cycles 24-11..24-17 closed the shim-overwrite/install-poll/launch/sync clusters; Gate 4 (Hoard) explicitly out of scope — bridge proxies only ISteamUser + ISteamFriends; superseded/parked the multi-bottle-families phase, see `## Parked / Superseded Phases`)
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

- [ ] 24-10-PLAN.md — R5/R6 packaged-build + Avernum 4 + Hoard playable single-player acceptance → 24-UAT.md (needs 24-07/08/09). No SUMMARY.md — hardware acceptance recorded directly in 24-UAT.md instead (Gates 0/1/2/3 PASS; Gate 4/Hoard out of scope).

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

### Phase 34.1: Tauri IPC re-plumb slice 4 — app shell and window chrome (INSERTED)

**Goal:** Port the **app shell and window chrome** IPC cluster (**33 channels** — `callTool` reassigned to Phase 34.5 by D-14) onto the Tauri build: window state and controls (minimize/maximize/unmaximize/close/fullscreen/frameless), zoom factor, title-bar overlay, tray colour, About window, language switching, custom themes/CSS, app version + changelog + releases, connectivity signal, gamepad input, and quit/lock/unlock. Establishes a **third port kind** — `renderer-side (Tauri JS)` — for window chrome (D-01/D-02), and is the **first slice to modify `src/backend/main.ts`** (D-07 body extraction), so the additive/reversible invariant becomes BEHAVIORAL rather than textual: `npm start` and `pnpm tauri:dev` must both still work.
**Requirements:** REQ-34.1-01, REQ-34.1-02, REQ-34.1-03, REQ-34.1-04, REQ-34.1-05, REQ-34.1-06, REQ-34.1-07, REQ-34.1-08, REQ-34.1-09, REQ-34.1-10, REQ-34.1-11, REQ-34.1-12
**Depends on:** Phase 34 (independent of the other slice-4..8 phases — these may run in any order or in parallel)
**Plans:** 8/8 plans complete

Plans:
- [x] 34.1-01-PLAN.md — D-04 capability grants (12 explicit window/webview commands, `core:window:default` composition verified) + D-14 IPC-PORT-INVENTORY correction (34.1: 34→33, 34.5: 55→56)
- [x] 34.1-02-PLAN.md — D-07/D-08 handler-body extraction into Electron-free `src/backend/appshell/*`, `main.ts` reduced to one-line delegations
- [x] 34.1-03-PLAN.md — D-01/D-02 ten window-chrome channels renderer-side via Tauri JS + D-05/D-06 frameless runtime (pre-paint `setDecorations`, on-toggle re-apply, working drag region)
- [x] 34.1-04-PLAN.md — D-03/D-09 curated sidecar `appShellFlowRegistration.ts` for the 18 sidecar-routed channels + D-13 logged no-ops + a genuinely new import-graph gate
- [x] 34.1-05-PLAN.md — D-10 `gamepadAction` re-implemented renderer-side (geometric directional focus replacing Chromium spatial navigation)
- [x] 34.1-06-PLAN.md — D-11 real bounded Tauri tray (`tray-icon` feature, `TrayIcon` at setup, one new `tray_set_icon` Rust arm driving `changeTrayColor`)
- [x] 34.1-07-PLAN.md — D-12 `createNewWindow`/`showAboutWindow` as real `WebviewWindow`s with a fail-closed child-window capability boundary + static `about.html`
- [x] 34.1-08-PLAN.md — D-02/D-15 `34.1-PORTED-CHANNELS.md` declared list (third port kind + honest unobserved sign-off), `34.1-HUMAN-UAT.md`, SEAM.md §3→§1 move

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
**Plans:** 1/9 plans executed

Plans:
- [x] 34.3-01-PLAN.md — REQ-34.3-01/02: new `shellFilesFlowRegistration.ts` registering the 14 `main.ts` link/reveal openers + the 4 filesystem/diagnostics channels, wired into `handlers.ts`, with `shellFilesFlows.test.ts` (wave 1)
- [ ] 34.3-02-PLAN.md — REQ-34.3-05/06: `clearCache` (dialog + `refreshLibrary` push), `clearAchievementCache`, and `resetHeroic` added to the same module at parity, `utils.ts` untouched (wave 2)
- [ ] 34.3-03-PLAN.md — REQ-34.3-03/06/08: `tauri-plugin-clipboard-manager` + 2 new `dispatch_rust_channel` arms called Rust-side with ZERO capability grant, 2 pure helpers with hand-RED-proved `#[cfg(test)]` tests, the 2 transport constants, and D-05's verified-no-fix comment (wave 1)
- [ ] 34.3-04-PLAN.md — REQ-34.3-09: `logInfoSettled` + the 5 logger/upload channels in `loggerFlowRegistration.ts` via curated imports, `deleteUploadedLogFile`'s both-builds deadness declared (wave 1)
- [ ] 34.3-05-PLAN.md — REQ-34.3-04/07: real `electronStub.clipboard.writeText` forwarding with log-only failure, documented-dead sync `readText`, and the `relaunchInFlight` guard on `app.quit`/`app.exit` (wave 2)
- [ ] 34.3-06-PLAN.md — REQ-34.3-03/04: new `clipboardFlowRegistration.ts` for the 3 clipboard channels, read path awaiting Rust directly per D-04 (wave 3)
- [ ] 34.3-07-PLAN.md — REQ-34.3-08/10: `electronReachLedger.test.ts` entry points + baseline regenerated by running the tooling, and the block-comment-safe `main.rs` source-existence gate (wave 4)
- [ ] 34.3-08-PLAN.md — REQ-34.3-12: `34.3-PORTED-CHANNELS.md` (29 rows + every rider), a self-tested doc-shape gate, SEAM.md §3→§1, and the 2 out-of-scope todos filed (wave 5)
- [ ] 34.3-09-PLAN.md — REQ-34.3-11: the BLOCKING 5-item live gate — items 1/2/3/5 under `tauri:dev`, item 4 on a PACKAGED build (wave 6)

Cross-cutting constraints:
- Every registration's `send`-vs-`handle` kind is cross-checked against `main.ts`/`logger/ipc_handler.ts` — a mismatch fails 100% silently
- Curated imports only: never side-effect-import `logger/ipc_handler.ts` or `utils/ipc_handler.ts`; `logError` must NOT be registered a second time
- Zero `clipboard-manager:*` capability grants; zero `state.shutdown_child()` added to `app_relaunch` (both settled by research)
- `npx tsc --noEmit`, `cd src-tauri && cargo check --quiet`, `cargo test`, and `npx prettier --check` on touched files all stay clean
- Additive and reversible BEHAVIORALLY: `npm start` and `pnpm tauri:dev` both work after every plan; `electronUntouched.test.ts` not weakened (REQ-34.3-13)

### Phase 34.4: Tauri IPC re-plumb slice 7 — Steam completion and Humble (INSERTED)

**Goal:** Port the **remaining Steam surface plus the whole Humble integration** (38 channels): Steam credential/SteamGuard/TOTP login, sign-out, bottle provisioning, client setup, key redemption and private-branch passwords — closing SEAM.md deferred item 5 (D-02) — together with all 21 `humble/ipc_handler.ts` channels from phases 10-15. Additive and reversible — the Electron build keeps working unchanged.
**Requirements:** TBD — mint at `/gsd-plan-phase 34.4`
**Depends on:** Phase 34 (independent of the other slice-4..8 phases — these may run in any order or in parallel)
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 34.4 to break down)

### Phase 34.5: Tauri IPC re-plumb slice 8 — non-Steam runners, Wine and shortcuts (INSERTED)

**Goal:** Port the **inherited non-Steam runner surface** (55 channels — the largest slice): Epic/GOG/Amazon/Zoom auth, sign-out, saves sync and CLI versions; the EOS overlay cluster; Wine version/runtime management and tooling (DXVK, VKD3D, winetricks); desktop shortcuts, add-to-Steam and SteamGridDB artwork. Carried across rather than dropped per the Phase 35 discussion — the keep/drop call is deliberately deferred to this phase own discuss-phase. Additive and reversible — the Electron build keeps working unchanged.
**Requirements:** TBD — mint at `/gsd-plan-phase 34.5`
**Depends on:** Phase 34 (independent of the other slice-4..8 phases — these may run in any order or in parallel)
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 34.5 to break down)

### Phase 35: Electron cutover — remove the Electron build

**Goal:** Retire the Electron build: delete `electron-vite`/`electron-builder` config, the preload contextBridge path, and the `isTauri()` branches, leaving Tauri as the only shell. This is the one phase that deliberately breaks the additive/reversible invariant every prior phase preserved — so it runs last, and only once the `session`/`powerSaveBlocker` parity gaps are resolved or explicitly accepted, and the parked Electron-renderer bugs (see `debug-uninstall-game-vanishes-parked`) have been re-tested against Tauri rather than fixed in Electron.
**Depends on:** Phase 34 (all three platforms shipping on Tauri first) **and Phases 34.1–34.5** (the IPC re-plumb must be complete — see `.planning/IPC-PORT-INVENTORY.md`). As of 2026-07-25 only 27 of 210 IPC channels are on the sidecar; cutting over before the port finishes would strand ~183 channels. Also blocked on migrating the renderer off `electron-vite` onto plain Vite, since `tauri:dev` currently shells out to `electron-vite build` and `tauri.conf.json` serves its `build/` output as `frontendDist`.
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
