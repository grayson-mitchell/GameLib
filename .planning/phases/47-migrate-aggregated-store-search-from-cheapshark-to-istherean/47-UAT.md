---
status: diagnosed
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
source: [47-VERIFICATION.md]
started: 2026-11-17T23:10:00Z
updated: 2026-11-18T13:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Localised prices in a non-US region (47-10 live item 1)
expected: With the Deals screen region override set to Germany (or the United Kingdom), searching Store Search for 'portal' shows rows priced in that currency (e.g. '9,75 €' / '£8.19'), never '$… EUR' or '$… GBP', and the region caption names the priced country.
result: pass — Store Search, region Germany, with GAMELIB_ITAD_API_KEY set at launch (first attempt mistakenly used the in-app GOG store)

### 2. Expanded row uses the same country (47-10 live item 2)
expected: Expanding the first 'portal' row lists per-store deals in the same currency as the collapsed row; clicking a store opens its ITAD link in the browser.
result: pass — tested with 'xcom' (portal is Steam-only, so its expanded row has one store)

### 3. Cached price shows 'Price from ...' instead of an error (47-10 live item 3)
expected: After item 1, quit GameLib and tell Claude "age the cache" (Claude moves every fetchedAt in store_cache/itad_prices.json back 2 hours, no other change). Relaunch `pnpm tauri:dev` with network ON, open Store Search, then turn the network OFF only for this action: search 'portal' again, note the rows, and turn the network back ON before reporting. Rows render with a separate secondary 'Price from <date, time>' line under the price (hover shows the longer explanation), no error banner, no dimming, and the text never says error, failed or rate limited.
result: pass — offline 'xcom' search on the aged cache: 'Price from' line with hover text, no error banner, no dimming, no error/failed/rate-limited text

### 4. Settings key field never displays the saved key (47-13 live item 1)
expected: Settings > Advanced shows the IsThereAnyDeal field under SteamGridDB with an (i) on the label line; entering a key then reopening Settings shows the 'Key saved' placeholder with an EMPTY input; clearing it restores the optional placeholder.
result: pass

### 5. Rejected user key shows the danger line (47-13 live item 2)
expected: With a deliberately bad user key saved, run a Store Search (results still appear via the built-in key), then reopen Settings > Advanced: the danger-colored 'ITAD rejected this key, so Store Search is using the built-in key.' line shows; typing or clearing hides it.
result: pass — fake user key, fresh 'hades' search still returned results via the built-in key

### 6. Opening a store keeps the left navigation (found during test 1)
expected: Opening the GOG store from a game link (here, 'portal' in the GOG store) switches the left navigation to the GOG panel instead of leaving it blank.
result: issue
reported: "minor bug, if you click on portal takes you to the gog store, the left navigation goes blank rather than changing to gog"
severity: minor

### 7. Store Search game art is not cropped (found during test 2)
expected: Each Store Search row shows the game's art without significant cropping.
result: issue
reported: "gameart in search is cropped (significantly)"
severity: cosmetic

### 8. Store Search region can be set without going to Deals (found during test 2)
expected: The Store Search price region can be chosen from Store Search itself (or a shared setting), not only from the Deals screen's region picker.
result: issue
reported: "setting region in deals only is not a good ux."
severity: minor

### 9. Opening Stores while offline does not crash (found during test 3)
expected: With the network off, clicking Stores opens the in-app store view (or an offline state) without GameLib crashing.
result: issue
reported: "when i click on stores when offline gamelib crashes"
severity: blocker

### 10. Offline Stores tab does not crash (47-14 live item, G-47-9)
expected: macOS, `pnpm tauri:dev` (never `tauri:dev:run`). With the network ON open Library; turn Wi-Fi OFF, wait ~5 s, click Stores and open Amazon Luna (or GOG), watch ~10 s, click Try again once, turn Wi-Fi ON, click Try again again. GameLib never crashes or quits; while offline a notice row under the store controls reads 'You're offline, so this store can't load.' with a Try again button (the embed area may be blank); after Wi-Fi returns and Try again is clicked the row is gone and the store loads; ~/Library/Logs/GameLib/gamelib-shell-panic.log gains no new entry.
result: [pending]

### 11. Store-page deep link highlights the owning store row (47-15 live item, G-47-6)
expected: Stores > Deals, click a game card (opens it in the in-app GOG store); then open a GOG game's page in Library and click its Store link; then click Stores > GOG Store directly. In all three the Stores panel shows the GOG Store row highlighted; coming from Deals the highlight moves from Deals to GOG Store; no case leaves no row highlighted.
result: [pending]

### 12. Store Search region picker (47-16 live item, G-47-8)
expected: Stores > Store Search shows the picker on the title row (title left, picker right), styled like the Deals picker, no currency pill. Search 'xcom'; change to Germany (euro prices, 'Showing prices for Germany.'), then New Zealand, then Auto (language default); each change re-runs the search; the choice survives leaving and re-opening Store Search; legible in a dark and a light theme.
result: [pending]

### 13. Store Search art is shown whole (47-17 live item, G-47-7)
expected: Restart `pnpm tauri:dev` so the sidecar carries the new thumbOf; search 'hades' then 'xcom'. Each row's art is a wide banner shown whole with no side cut off; a game with no art shows the GameLib card whole; title, badges and price stay centred against the thumbnail.
result: [pending]

### 14. Deals picker unchanged and one shared region (47-18 live item, G-47-8)
expected: Stores > Deals: set a genre and hide-DLC, change the region to Germany. The picker looks and sits as before (label STORE REGION, outlined select, currency pill per country, 'Germany · EUR' when selected); changing region clears the Deals filters and reloads in euros. Store Search then shows Germany selected with euro prices. Pick New Zealand on Store Search, go back to Deals: Deals shows 'Auto (...)'.
result: [pending]

### 15. Owned-on-Steam badge on a live ITAD result (PRICE-02, never had a live item)
expected: With a Steam library loaded, search a title you own on Steam; the row shows 'Owned on Steam'. A title you do not own shows no Steam badge.
result: [pending]

## Summary

total: 15
passed: 5
issues: 4
pending: 6
skipped: 0
blocked: 0

## Gaps

- gap_id: G-47-6
  truth: "Opening the GOG store from a game link switches the left navigation to the GOG panel instead of leaving it blank"
  status: failed
  reason: "User reported: minor bug, if you click on portal takes you to the gog store, the left navigation goes blank rather than changing to gog"
  severity: minor
  test: 6
  root_cause: "Not a blank panel: /store-page?store-url=<gog> deep links (Deals DiscountCard, game-page Store link, Humble Keys claim) render StoresPanel but no row is active, because StoresPanel rows are pathname-only NavLinks (/store/<key>) with no isActiveFallback, and the store key WebView/index.tsx:278 resolves via resolveStoreForUrl never reaches NavShell. Pre-existing (retired Sidebar had the same gap). Confidence medium: user's exact entry point unconfirmed, most likely Deals."
  artifacts:
    - path: "src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx"
      issue: "store rows have no deep-link-aware active state"
    - path: "src/frontend/components/UI/NavShell/navTabs.ts"
      issue: "resolves the tab only, not the active store"
    - path: "src/frontend/screens/WebView/index.tsx"
      issue: "computes the deep-link store key (lines 274-313) but keeps it local"
    - path: "src/frontend/screens/WebView/storeEmbedOrigins.ts"
      issue: "resolveStoreForUrl lives under screens/WebView; NavShell needs it"
  missing:
    - "A pure resolveActiveStore(pathname, search) beside resolveActiveTab: :store param for /store/:store, resolveStoreForUrl(store-url)?.key for /store-page"
    - "StoresPanel passes isActiveFallback to the matching row (Humble Keys row for humble)"
    - "Test: /store-page?store-url=<gog> lights the GOG Store row; a non-store host lights none"
  debug_session: ".planning/debug/gog-store-open-blank-left-nav.md"
- gap_id: G-47-7
  truth: "Each Store Search row shows the game's art without significant cropping"
  status: failed
  reason: "User reported: gameart in search is cropped (significantly)"
  severity: cosmetic
  test: 7
  root_cause: "Landscape art in a portrait cover box: thumbOf() (itad.ts:303-306) prefers banner145 (145x55, 2.64:1) and .storeSearchRow__thumb (StoreSearch/index.css:131-138) is width 60px, aspect-ratio 3/4, object-fit cover, so only ~28% of the image width shows. Latent Phase 20 spec defect (20-UI-SPEC:168), not a Phase 47 regression: CheapShark's 231x87 capsule cropped identically."
  artifacts:
    - path: "src/frontend/screens/StoreSearch/index.css"
      issue: "portrait 3:4 cover box for landscape art (lines 131-138)"
    - path: "src/backend/storeSearch/itad.ts"
      issue: "thumbOf prefers the small landscape banner145 (lines 303-306); order pinned by itad.test.ts:162-166"
  missing:
    - "Landscape thumb box (~2.14:1, matching banner300) and prefer banner300 over banner145"
    - ".storeSearchRow__thumb.usingFallback { object-fit: contain } so the 2:3 fallback card is not cropped"
    - "Regression test pinning the box aspect to the chosen asset family"
  debug_session: ".planning/debug/store-search-art-cropped.md"
- gap_id: G-47-8
  truth: "The Store Search price region can be chosen without going to the Deals screen"
  status: failed
  reason: "User reported: setting region in deals only is not a good ux. (47-RESEARCH D3 recorded reusing the Deals override as a known limitation, no new picker this phase)"
  severity: minor
  test: 8
  root_cause: "Deliberate Phase 47 scope cut (47-RESEARCH D3, 47-UI-SPEC section 1). The region is one renderer-only localStorage value (discounts.regionOverride); its helpers live in Discounts/helpers.ts and its only writer is the inline MUI Select in Discounts/index.tsx (569-627), coupled to Deals filter resets and styled under .discountsScreen. Store Search reads it once via a useMemo keyed on i18n.language and has no write path."
  artifacts:
    - path: "src/frontend/screens/Discounts/helpers.ts"
      issue: "region key, validator, REGION_OPTIONS and getLocaleSettings scoped to Deals"
    - path: "src/frontend/screens/Discounts/index.tsx"
      issue: "only writer: inline Select coupled to Deals filter resets"
    - path: "src/frontend/screens/Discounts/index.css"
      issue: "picker styles scoped to .discountsScreen"
    - path: "src/frontend/screens/StoreSearch/index.tsx"
      issue: "read-only, non-reactive countryCode snapshot (lines 51-58), caption only"
  missing:
    - "Hoist the region key and helpers to a neutral module, keeping the key name discounts.regionOverride (re-export from Discounts/helpers.ts)"
    - "Extract a shared RegionPicker (Auto option, localized names, currency pill, hoisted CSS) used by Deals and Store Search"
    - "Store Search holds countryCode in state and persists picker changes; no backend change needed (cache keys already per country)"
    - "Decide the option list: REGION_OPTIONS (29, GOG-currency) vs ITAD_PRICED_COUNTRIES (32)"
    - "Amend 47-UI-SPEC section 1 (currently 'no picker')"
  debug_session: ".planning/debug/store-search-region-only-in-deals.md"
- gap_id: G-47-9
  truth: "With the network off, clicking Stores does not crash GameLib"
  status: failed
  reason: "User reported: when i click on stores when offline gamelib crashes"
  severity: blocker
  test: 9
  evidence: "~/Library/Logs/GameLib/gamelib-shell-panic.log: two shell panics on the main thread, 2026-11-18 19:47:39 and 19:48:47 NZDT, payload `called Option::unwrap() on a None value` at wry-0.55.1/src/wkwebview/mod.rs:1349 (wry::wkwebview::url_from_webview <- WebView::url <- tauri_runtime_wry::handle_user_message): a webview URL is read while WKWebView reports no URL"
  root_cause: "store_embed_take_nav_events (src-tauri/src/store_embed/controls.rs:98-100) calls Webview::url() unconditionally on every 250 ms renderer poll. When the embed's first navigation (WebviewUrl::External) fails (offline, DNS, TLS, server down), WKWebView.URL stays nil and wry 0.55.1 url_from_webview unwraps it on the main thread, panicking the shell. The read was added 2026-11-02 in f8782dbbf (quick 261102-sk8); upstream wry PR #1729 is unreleased. Not a Phase 47 regression."
  artifacts:
    - path: "src-tauri/src/store_embed/controls.rs"
      issue: "unconditional webview.url() in the 250 ms nav-event drain (lines 98-100)"
    - path: "src-tauri/src/store_embed/open.rs"
      issue: "on_page_load records only Started/Finished; a failed first load leaves no trace (lines 95-131)"
    - path: "src/frontend/screens/WebView/useStoreEmbedHost.ts"
      issue: "250 ms poll; stale comment says the drain does not read the webview (lines 358-411)"
    - path: "src-tauri/src/login_window/invite_picker.rs"
      issue: "latent same-class existing.url() (lines 129-135)"
  missing:
    - "Track 'embed delivered a PageLoadEvent::Finished' in STORE_EMBED_STATE (set in on_page_load, reset on clear/close/recreate) and skip webview.url() until it is set; do not key on current_url(), which prepare_open seeds"
    - "Offline / failed-first-load surface in the renderer instead of a blank embed"
    - "Regression test driving the drain against an embed with no Finished event; fix the stale comment"
  debug_session: ".planning/debug/offline-stores-tab-crash.md"
