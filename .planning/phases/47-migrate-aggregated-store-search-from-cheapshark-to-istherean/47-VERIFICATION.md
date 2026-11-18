---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
verified: 2026-11-18T12:30:00Z
status: human_needed
score: 16/16 must-haves verified
covered_files:
  - ".github/workflows/release-tauri.yml"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-01-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-01-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-02-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-02-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-03-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-03-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-04-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-04-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-05-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-05-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-06-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-06-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-07-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-07-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-08-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-08-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-09-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-09-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-10-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-10-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-11-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-11-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-12-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-12-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-13-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-13-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-14-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-14-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-15-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-15-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-16-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-16-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-17-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-17-SUMMARY.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-18-PLAN.md"
  - ".planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-18-SUMMARY.md"
  - "meta/esbuildWorkerBundleShared.ts"
  - "public/locales/en/translation.json"
  - "src-tauri/src/store_embed/controls.rs"
  - "src-tauri/src/store_embed/open.rs"
  - "src-tauri/src/store_embed/state.rs"
  - "src/backend/storeSearch/handlers.ts"
  - "src/backend/storeSearch/itad.ts"
  - "src/backend/storeSearch/itadCache.ts"
  - "src/backend/storeSearch/itadCoverage.ts"
  - "src/backend/storeSearch/itadKey.ts"
  - "src/backend/storeSearch/itadSecrets.ts"
  - "src/backend/storeSearch/stores.ts"
  - "src/common/discounts/storeMapping.ts"
  - "src/common/types/ipc/enrichment.ts"
  - "src/common/types/storeSearch.ts"
  - "src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx"
  - "src/frontend/components/UI/NavShell/index.tsx"
  - "src/frontend/components/UI/NavShell/navTabs.ts"
  - "src/frontend/components/UI/RegionPicker/index.css"
  - "src/frontend/components/UI/RegionPicker/index.tsx"
  - "src/frontend/helpers/storeRegion.ts"
  - "src/frontend/screens/Discounts/helpers.ts"
  - "src/frontend/screens/Discounts/index.css"
  - "src/frontend/screens/Discounts/index.tsx"
  - "src/frontend/screens/Settings/components/ItadApiKey.tsx"
  - "src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx"
  - "src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx"
  - "src/frontend/screens/StoreSearch/helpers.ts"
  - "src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts"
  - "src/frontend/screens/StoreSearch/hooks/useOwnedSteamGids.ts"
  - "src/frontend/screens/StoreSearch/index.css"
  - "src/frontend/screens/StoreSearch/index.tsx"
  - "src/frontend/screens/WebView/components/StoreEmbedTimeoutBanner.tsx"
  - "src/frontend/screens/WebView/index.tsx"
  - "src/frontend/screens/WebView/useStoreEmbedHost.ts"
covered_digest: "v4:sha256:54cd928c1a2f002f4bbd635a6c413cd9518a20f280b7995441ae9ad7c3c26f0c"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 12/12
  gaps_closed:
    - "G-47-9: opening Stores while offline no longer reaches Webview::url() before a page has finished (plan 47-14)"
    - "G-47-6: a /store-page deep link highlights the owning store's row in the Stores panel (plan 47-15)"
    - "G-47-8: Store Search has its own region picker and Deals uses the same shared picker and stored region (plans 47-16, 47-18)"
    - "G-47-7: Store Search thumbnails show banner300 whole in a landscape contain box (plan 47-17)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Offline Stores tab does not crash (47-14 live item, G-47-9)"
    expected: "macOS, `pnpm tauri:dev` (never `tauri:dev:run`). With the network ON open Library; turn Wi-Fi OFF, wait ~5 s, click Stores and open Amazon Luna (or GOG), watch ~10 s, click Try again once, turn Wi-Fi ON, click Try again again. GameLib never crashes or quits; while offline a notice row under the store controls reads 'You're offline, so this store can't load.' with a Try again button (the embed area may be blank); after Wi-Fi returns and Try again is clicked the row is gone and the store loads; ~/Library/Logs/GameLib/gamelib-shell-panic.log gains no new entry."
    why_human: "The crash needs a real WKWebView whose first navigation fails offline; only a live macOS run produces it. The Rust guard is unit-tested through an injected URL reader, not against a real WKWebView."
  - test: "Store-page deep link highlights the owning store row (47-15 live item, G-47-6)"
    expected: "Stores > Deals, click a game card (opens it in the in-app GOG store); then open a GOG game's page in Library and click its Store link; then click Stores > GOG Store directly. In all three the Stores panel shows the GOG Store row highlighted; coming from Deals the highlight moves from Deals to GOG Store; no case leaves no row highlighted."
    why_human: "The highlight is a CSS active state on a live route change; the unit tests prove the props, not the paint."
  - test: "Store Search region picker (47-16 live item, G-47-8)"
    expected: "Stores > Store Search shows the picker on the title row (title left, picker right), styled like the Deals picker, no currency pill. Search 'xcom'; change to Germany (euro prices, 'Showing prices for Germany.'), then New Zealand, then Auto (language default); each change re-runs the search; the choice survives leaving and re-opening Store Search; legible in a dark and a light theme."
    why_human: "Visual placement, MUI styling outside .discountsScreen and multi-theme legibility need the live renderer."
  - test: "Store Search art is shown whole (47-17 live item, G-47-7)"
    expected: "Restart `pnpm tauri:dev` so the sidecar carries the new thumbOf; search 'hades' then 'xcom'. Each row's art is a wide banner shown whole with no side cut off; a game with no art shows the GameLib card whole; title, badges and price stay centred against the thumbnail."
    why_human: "Whether the art reads as uncropped and the row looks balanced is a visual judgement on real ITAD assets; the regression test pins only the CSS box and thumbOf order against each other."
  - test: "Deals picker unchanged and one shared region (47-18 live item, G-47-8)"
    expected: "Stores > Deals: set a genre and hide-DLC, change the region to Germany. The picker looks and sits as before (label STORE REGION, outlined select, currency pill per country, 'Germany · EUR' when selected); changing region clears the Deals filters and reloads in euros. Store Search then shows Germany selected with euro prices. Pick New Zealand on Store Search, go back to Deals: Deals shows 'Auto (...)'."
    why_human: "Look and cross-screen behaviour with real localStorage need the live app."
  - test: "Owned-on-Steam badge on a live ITAD result (PRICE-02, never had a live item)"
    expected: "With a Steam library loaded, search a title you own on Steam; the row shows 'Owned on Steam'. A title you do not own shows no Steam badge."
    why_human: "The gid-to-appid join is test-backed against recorded fixtures only; PRICE-02 is still unticked in REQUIREMENTS.md for lack of a live confirmation."
---

# Phase 47: Migrate aggregated store search from CheapShark to IsThereAnyDeal Verification Report

**Phase Goal:** Replace the USD-only CheapShark adapter behind `/store-search` with a localised IsThereAnyDeal provider, so a non-US user sees prices in their own currency on the price-checker the way they already do on the Deals tab. Stage 1 of the store-price direction. Retires the D-13 debt (`SEARCH_CURRENCY = 'USD'`, `formatUsdPrice()`).
**Verified:** 2026-11-18T12:30:00Z
**Status:** human_needed
**Re-verification:** Yes, after gap closure (plans 47-14..47-18 for UAT gaps G-47-6..G-47-9)

## Goal Achievement

The goal holds, and the four UAT gaps are closed in code. I re-read the code behind each gap closure and ran the scoped tests (all pass; details below). Nothing from the first verification regressed: the CheapShark module and both debt symbols are still gone, `pnpm gen:ipc-contract --check` is still "up to date", and no file owned by the parallel Phase 81 session (`main.rs`, `rust_dispatch.rs`, `ipc_contract.rs`) changed since `d4278f3a4`. The status is `human_needed` solely because the live macOS checks for 47-14..47-18 were not run (they need `pnpm tauri:dev` on macOS) and one planned live item for PRICE-02 never existed.

The prior report's five live items (47-10 items 1-3, 47-13 items 1-2) are closed: `47-UAT.md` records tests 1-5 as `pass`. They are not carried forward.

ROADMAP Phase 47 has no `success_criteria` list, so the contract is the Goal paragraph, REQUIREMENTS PRICE-01..03, CONTEXT D-01..D-13, and the PLAN frontmatter truths (merged).

### Observable Truths

Truths 1-12 are the first verification's truths, regression-checked (code present, scoped tests green). Truths 13-16 are the gap-closure truths.

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | PRICE-01: a search returns up to 20 rows priced in the requested country's currency via ITAD search v1 + prices v3 with `country`; zero-deal games dropped | VERIFIED | `itad.ts` `searchGames`/`mapSearchResults`; `itad.test.ts` passes (65 tests across `itad`, `itadCache`, `handlers`); live UAT test 1 `pass` (Germany) |
| 2  | D-13: an unpriced country falls back to US and the response says `pricedCountry`; UI shows the fallback note only when it differs | VERIFIED | `StoreSearch/index.tsx:176-190` gated on `pricedCountry !== countryCode`; `itadCoverage.ts`; tests pass |
| 3  | D-13 debt retired: no `cheapshark.ts`, `SEARCH_CURRENCY`, or `formatUsdPrice` in non-test source; prices render via Intl `formatPrice` | VERIFIED | `grep -rnE "SEARCH_CURRENCY\|formatUsdPrice" src meta src-tauri/src` outside `__tests__` returns nothing; remaining `cheapshark` hits are test-fixture buy URLs, comments, and the test file name `formatUsdPrice.test.ts` (which tests `formatPrice`) |
| 4  | PRICE-02: ITAD gid maps to a Steam appid via the keyless lookup so "Owned on Steam" / "Key available" keep working | VERIFIED (code) | `lookupSteamGids`, `useOwnedSteamGids`, `index.tsx` `steamAppId: gidToAppId.get(...)`; tests pass. No live check ever run (see human item 6) |
| 5  | PRICE-03: on 429 serve stale cached rows/deals with `cachedAt`, else `rateLimited`; UI shows a sibling "Price from" line, not an error | VERIFIED | behavioral tests in `itad.test.ts`; live UAT test 3 `pass` |
| 6  | D-08/D-10: cache freshness/retention, single-flight, no timers in `storeSearch/` | VERIFIED | `itadCache.test.ts` passes |
| 7  | D-01..D-04: release builds bake the key into both sidecar bundles; keyless build raises `notConfigured`; workflow fails before sidecar build when the secret is empty | VERIFIED | unchanged since first verification; `itadKeyDefine`/`releaseWorkflow` suites previously green; the 47 gap commits touch none of these files |
| 8  | Every `buyUrl` is ITAD's deal url byte-for-byte; non-https deals dropped | VERIFIED | `itad.test.ts` |
| 9  | The ITAD key never appears in a log call or thrown message | VERIFIED | `itad.test.ts` |
| 10 | IPC surface is zod-validated, registered, in preload and the generated Rust allow-list | VERIFIED | `pnpm gen:ipc-contract --check`: "up to date"; no Phase 47 IPC channel added by 47-14..18 |
| 11 | D-05/D-06: optional user key, never displayed back, rejected-key danger line | VERIFIED | `ItadApiKey.tsx`, live UAT tests 4 and 5 `pass` |
| 12 | D-12: coverage sweep committed, measured constants locked | VERIFIED | `47-ITAD-COVERAGE.json`, `itadCoverage.ts` |
| 13 | G-47-9 (47-14): with the network off, opening a Tauri-embed store does not panic the shell. `store_embed_take_nav_events` never calls `Webview::url()` on an embed that has not delivered `PageLoadEvent::Finished` in its lifetime; the guard keys on an observed Finished, not on `current_url()`; a store switch keeps the flag, clear/new-webview reset it, a chrome push does not set it; an offline notice row with Try again shows while connectivity is offline | VERIFIED (code and unit tests); live crash repro not run | `controls.rs:98-143` `take_nav_events_with` reads `has_finished_page()` under the lock, releases it, and calls `read_live_url()` only when true (the only production `.url()` read in `store_embed`); `open.rs:119` Finished arm calls `note_page_finished()` and `open.rs:297-301` resets before `add_child`; `state.rs:351-370` flag lifecycle incl. `clear()`; five `store_embed_finished_guard_*` tests present (`controls.rs:456-531`); `cargo test --bin gamelib-shell store_embed`: 80 passed, 0 failed. `StoreEmbedTimeoutBanner.tsx` offline variant (`role="status"`, Try again, wins over timeout), mounted at `WebView/index.tsx:660-666` with `offline={connectivity?.status === 'offline'}`; `webview.offline.message` / `tryAgain` present in `public/locales/en/translation.json`; banner tests pass |
| 14 | G-47-6 (47-15): on `/store-page?store-url=<store url>` the matching Stores-panel row is highlighted (GOG, Amazon, Epic, Steam; Humble highlights Humble Keys); a non-store or non-https host highlights none; `/store/:store` unchanged; host matching reuses `resolveStoreForUrl` | VERIFIED (code and unit tests); live paint not run | `navTabs.ts:96-111` `resolveActiveStore` (`/store/:store` key arm, `/store-page` arm via `resolveStoreForUrl(url)?.key`); `NavShell/index.tsx:45,86` passes `activeStore`; `StoresPanel/index.tsx` `isActiveFallback` on amazon/epic/gog/steam rows and the Humble Keys row; `NavItem` ORs `isActiveFallback` into `active`; `storeEmbedOrigins.ts` keys are `epic/gog/amazon/steam/humble`; `navTabs`, `StoresPanel`, `NavShell` tests pass |
| 15 | G-47-8 (47-16, 47-18): Store Search has its own region picker on its title row; choosing a country persists it under `discounts.regionOverride` and re-runs the search; Auto removes it; a stored code outside a screen's list reads as Auto there; Deals renders the same shared `RegionPicker` with its own filter-resetting handler and its 29-country validation; no inline Deals region select or region CSS remains | VERIFIED (code and unit tests); live not run | `StoreSearch/index.tsx:53-76,146-156` (state seeded by `getStoredRegionFor(STORE_SEARCH_REGION_CODES)`, `handleRegionChange` persists, `countryCode` feeds `useDebouncedStoreSearch(countryCode)`, which re-runs on country change); `helpers/storeRegion.ts` hoisted key/helpers, `STORE_SEARCH_REGION_CODES = ITAD_PRICED_COUNTRIES`; `Discounts/index.tsx:116-131,569-583` uses `<RegionPicker onChange={handleRegionChange}>` where `handleRegionChange` still resets all 11 filter states; `git show c7219df23` shows the removed inline Select was functionally identical (same label, Auto label, currency pill, sort, locale); `grep discountsScreen__region` leaves only the picker `id`; `Discounts/helpers.ts` re-exports; `RegionPicker`, `storeRegion`, `StoreSearchScreen`, `localeSettingsLanguageForm` tests pass |
| 16 | G-47-7 (47-17): Store Search rows show art whole: `thumbOf` prefers banner300, then banner145, then boxart; the thumb box is `aspect-ratio: 300 / 140` with `object-fit: contain` (so banner145, boxart and the 2:3 fallback card are letterboxed, not cut); a regression test pins box ratio and `thumbOf` order together | VERIFIED (code and unit tests); live visual not run | `itad.ts:303-308` `a?.banner300 ?? a?.banner145 ?? a?.boxart`; `StoreSearch/index.css` `.storeSearchRow__thumb { width:120px; aspect-ratio:300/140; object-fit:contain }`; `itad.test.ts` banner300 preference tests; `storeSearchThumbBox.test.ts` passes; `search-portal.json` fixture carries banner300 for real ITAD assets |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified). Truth 13 is behavior-dependent (an ordering/guard invariant); its behavioral evidence is the injected-reader test `store_embed_finished_guard_drain_skips_url_read_before_finished` (zero reader calls before a Finished) together with `..._drain_reads_url_after_finished` (one call after) and the lifecycle tests, all passing.

### Deferred Items

None. The deals browser, Stage 2 feed and Amazon coverage are out of scope in ROADMAP. The two related follow-ups the executor filed as pending todos are not Phase 47 must-haves: `.planning/todos/pending/2026-11-18-store-embed-online-first-load-failure-surface.md` (online failed first load stays a blank embed, not a crash) and `.planning/todos/pending/2026-11-18-invite-picker-url-read-panics-on-failed-first-load.md` (the second `.url()` read, `login_window/invite_picker.rs:130`, has the same latent nil-URL unwrap class; it is outside the Stores tab and was not in G-47-9's scope).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src-tauri/src/store_embed/state.rs` | `page_finished` flag + `note_page_finished` / `has_finished_page` / `reset_for_new_webview` | VERIFIED | lines 131-132, 351-370; `clear()` resets |
| `src-tauri/src/store_embed/controls.rs` | drain core with injected URL reader + regression tests | VERIFIED | `take_nav_events_with` at 108; 5 guard tests |
| `src-tauri/src/store_embed/open.rs` | Finished arm notes; create path resets | VERIFIED | lines 119, 297-301 |
| `StoreEmbedTimeoutBanner.tsx` | offline variant | VERIFIED | contains `webview.offline.message` |
| `NavShell/navTabs.ts` | `resolveActiveStore` | VERIFIED | exported, tested |
| `StoresPanel/index.tsx` | `isActiveFallback` rows | VERIFIED | 5 rows |
| `helpers/storeRegion.ts` | hoisted region store, `getStoredRegionFor`, `STORE_SEARCH_REGION_CODES` | VERIFIED | all present |
| `UI/RegionPicker/{index.tsx,index.css}` | shared hookless picker | VERIFIED | consumed by Deals and Store Search |
| `StoreSearch/index.css` | landscape contain thumb box | VERIFIED | contains `aspect-ratio: 300 / 140` |
| `StoreSearch/__tests__/storeSearchThumbBox.test.ts` | ratio-to-asset regression | VERIFIED | contains `banner300`, passes |
| `Discounts/index.tsx` | shared RegionPicker, own reset handler | VERIFIED | |
| `helpers/__tests__/storeRegion.test.ts` | shared-store contract | VERIFIED | passes |
| First-verification artifacts (adapter, cache, key, secrets, handlers, shop map, Settings field, esbuild define, workflow, coverage JSON) | | VERIFIED | quick regression: files present, suites green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `open.rs` | `state.rs` | Finished arm -> `note_page_finished()`; create path -> `reset_for_new_webview()` | WIRED | |
| `controls.rs` | `state.rs` | `has_finished_page()` read under lock before the URL reader may run | WIRED | |
| `WebView/index.tsx` | `StoreEmbedTimeoutBanner.tsx` | `offline={...}`, `onTryAgain={retryEmbedLoad}` | WIRED | see WR-01 / WR-02 |
| `NavShell/index.tsx` | `navTabs.ts` | `resolveActiveStore(location.pathname, location.search)` -> `StoresPanel activeStore` | WIRED | |
| `navTabs.ts` | `storeEmbedOrigins.ts` | `resolveStoreForUrl(...)?.key` | WIRED | no second host rule |
| `StoreSearch/index.tsx` | `storeRegion.ts` | `getStoredRegionFor(STORE_SEARCH_REGION_CODES)`, `setStoredRegionOverride` | WIRED | |
| `StoreSearch/index.tsx` | `useDebouncedStoreSearch` | `useDebouncedStoreSearch(countryCode)` | WIRED | region change re-runs the committed query |
| `Discounts/helpers.ts` | `storeRegion.ts` | re-exports | WIRED | |
| `Discounts/index.tsx` | `RegionPicker` | `onChange={handleRegionChange}` | WIRED | |
| `itad.ts` `thumbOf` | `StoreSearch/index.css` thumb box | banner300 ratio | WIRED | pinned by `storeSearchThumbBox.test.ts` |
| First-verification links (IPC, handlers, secrets, release workflow, etc.) | | | WIRED | unchanged |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Store Search rows | `countryCode` | `regionOverride` (localStorage via `getStoredRegionFor`) else locale-derived `autoCountry` | Yes, flows to `searchStores(query, countryCode)` | FLOWING |
| Row thumbnail | `result.thumb` | `thumbOf(item)` -> ITAD `assets.banner300` | Yes (recorded real assets) | FLOWING |
| Stores panel highlight | `activeStore` | `resolveActiveStore(pathname, search)` from router location | Yes | FLOWING |
| Offline banner | `connectivity.status` | sidecar-owned `uiState.connectivity` | Yes (see WR-02 on its default) | FLOWING |
| Drain URL read | `live_url` | `Webview::url()` after Finished only | Yes | FLOWING |
| First-verification chains (price, deals, gid badge, cached line) | | | | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Offline-crash guard and store_embed state machine | `cd src-tauri && cargo test --bin gamelib-shell store_embed` | 80 passed, 0 failed (includes the five `store_embed_finished_guard_*` tests) | PASS |
| Deep link highlight, region picker, thumb box, offline banner | `pnpm exec jest --selectProjects Frontend --runTestsByPath` over `navTabs`, `StoresPanel`, `NavShell`, `StoreSearchScreen`, `RegionPicker`, `storeRegion`, `storeSearchThumbBox`, `StoreEmbedTimeoutBanner` | 8 suites, 128 tests passed | PASS |
| Remaining StoreSearch / Discounts renderer suites | `... --runTestsByPath` over `localeSettingsLanguageForm`, `StoreSearchRow`, `formatUsdPrice`, `useDebouncedStoreSearch`, `useOwnedSteamGids` | 5 suites, 55 passed | PASS |
| Adapter, cache, handlers (incl. banner300 preference) | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/storeSearch/__tests__/{itad,itadCache,handlers}.test.ts` | 3 suites, 65 passed | PASS |
| WebView screen and components suites | `... --runTestsByPath src/frontend/screens/WebView/__tests__/*.test.ts* .../components/__tests__/*.test.tsx` | 23 suites, 602 passed | PASS |
| Generated Rust allow-list in sync | `pnpm gen:ipc-contract --check` | "src-tauri/src/ipc_contract.rs is up to date" | PASS |
| Type check | `pnpm exec tsc --noEmit -p .` | no output (clean) | PASS |
| Lint on touched renderer files | `pnpm exec eslint ...` | 0 errors; 4 warnings, all in `WebView/index.tsx` (3 floating-promise, 1 hook deps) and in code the gap plans did not add | PASS |
| Phase 81 isolation | `git diff d4278f3a4..HEAD -- src-tauri/src/{main,rust_dispatch,ipc_contract}.rs` | empty | PASS |

Out-of-phase suite failures, reported not counted: the orchestrator's post-merge full jest run shows failures in themeTokens render-site census, `storeKinds`, `createStores`, `acfUpdateReplay` (all also fail at `d4278f3a4`) and `meta/__tests__/x86CallbackWineHarness.test.ts` (fails in the main checkout, passes in a clean worktree at `d4278f3a4`; no gap commit touches its inputs). I did not re-run the full suite (once-per-verification rule left to the orchestrator's run); none of the five touch Phase 47 code.

### Probe Execution

Step 7c: SKIPPED. No PLAN or SUMMARY declares a `scripts/*/tests/probe-*.sh` probe.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| PRICE-01 | 47-01..13, 47-15, 47-16, 47-17, 47-18 | Store-search prices in the user's own currency | SATISFIED | Truths 1, 2, 3, 15; live UAT tests 1, 2 `pass`; 47-15..18 add UX closure |
| PRICE-02 | 47-01, 05..09 | "You already own this" badge keeps working on ITAD results | SATISFIED in code; no live confirmation | Truth 4; human item 6 |
| PRICE-03 | 47-03, 05..10, 47-14 | Cached price with timestamp instead of an error when rate-limited | SATISFIED | Truth 5; live UAT test 3 `pass`; 47-14 declares PRICE-03 for the offline Stores path (a stretch fit, since G-47-9 is a crash, not a rate limit) |

All three IDs appear in PLAN frontmatter and REQUIREMENTS.md. No orphaned requirements: REQUIREMENTS.md maps no other ID to Phase 47.

Bookkeeping discrepancy: REQUIREMENTS.md now shows PRICE-01 `[x]`/Complete and PRICE-03 `[x]`/Complete but PRICE-02 `[ ]`/Pending. That matches the evidence (PRICE-01 and PRICE-03 have live UAT passes; PRICE-02 has none). Tick PRICE-02 after human item 6 resolves.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| phase-47 modified files | - | TBD/FIXME/XXX scan on the gap-closure files | none | no debt markers found |
| `src/frontend/screens/WebView/index.tsx` | 664 | `connectivity?.status` guard on an always-defined value (IN-01) | Info | cosmetic |
| `src/frontend/helpers/storeRegion.ts` | 11 | renderer imports `ITAD_PRICED_COUNTRIES` from `backend/storeSearch/itadCoverage` (pure constants, no imports) | Info | a renderer-to-backend import; type-checks and tests pass; no lint error observed |
| `src-tauri/src/login_window/invite_picker.rs` | 130 | same-class unguarded `existing.url()` | Info | latent, outside Stores; filed as a pending todo |

### Code Review Findings (47-REVIEW.md: 0 critical, 3 warning, 2 info; plus 4 first-round items still `open` in 47-REVIEW-DISPOSITION.md)

I re-read the cited code for the three warnings; each is accurate. None defeats a must-have as literally written, but WR-01 and WR-02 sit directly on the G-47-9 offline notice and are real user-visible defects:

| ID | Affects | Confirmed | Defeats a must-have? |
| -- | ------- | --------- | -------------------- |
| WR-01 offline Try again re-requests `navState.url`, which holds the previous store's URL after a store switch whose navigate failed (`WebView/index.tsx:421-424`; the hook's own `onTryAgain` at `useStoreEmbedHost.ts:986` already retries `startUrl` for this reason) | 47-14 notice | Yes | No: the truth says "re-requests the embed's current URL", which it does. But the user can be navigated back to store A while the route says store B |
| WR-02 banner is driven by connectivity alone, so it sits over a healthy loaded page, and `uiState` defaults to `{ status: 'offline' }` (`uiState.ts:65`) so a store route mounted before the first connectivity result flashes it | 47-14 notice | Yes | No: the truth says "while the app's connectivity status is offline"; the false message on a loaded page is a UX defect, not a violated truth |
| WR-03 RegionPicker `<label htmlFor>` points at MUI `Select`'s hidden input, leaving the combobox unnamed for screen readers | 47-16/18 | Yes (inherited from the old Deals markup, now in a shared component used twice) | No |
| IN-01, IN-02 | cosmetic | Yes | No |
| WR-04, WR-05, IN-03, IN-04 (first round) | unchanged | Not re-checked this round; still `open` | No |

All nine are `open` in `47-REVIEW-DISPOSITION.md`. Recommended triage order: WR-01 and WR-02 first (cheap to fix, on the just-added offline surface), WR-03 second.

### Human Verification Required

Six items are in the frontmatter. Setup for all: stop any running dev session, then `pnpm tauri:dev` from the repo root on macOS (never `tauri:dev:run`); `tauri dev` does not rebuild the sidecar, so restart it before item 4. For item 1 Claude should check `~/Library/Logs/GameLib/gamelib-shell-panic.log` for a new entry afterwards. Network off only for the action in item 1, back on before reporting.

### Gaps Summary

No gaps. G-47-6, G-47-7, G-47-8 and G-47-9 are closed in code with passing scoped tests, the original goal (localised ITAD prices replacing the USD-only CheapShark adapter, D-13 debt retired) is intact, and nothing regressed. Status is `human_needed` because the live macOS confirmation of the four gap closures (and the PRICE-02 badge) is owed. Not a blocker: the review's WR-01..WR-03 are recommended for triage before shipping the offline banner.

---

_Verified: 2026-11-18T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
