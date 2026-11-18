---
status: complete
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
source: [47-VERIFICATION.md]
started: 2026-11-17T23:10:00Z
updated: 2026-11-18T07:04:39.708Z
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

## Summary

total: 9
passed: 5
issues: 4
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-47-6
  truth: "Opening the GOG store from a game link switches the left navigation to the GOG panel instead of leaving it blank"
  status: failed
  reason: "User reported: minor bug, if you click on portal takes you to the gog store, the left navigation goes blank rather than changing to gog"
  severity: minor
  test: 6
  artifacts: []
  missing: []
- gap_id: G-47-7
  truth: "Each Store Search row shows the game's art without significant cropping"
  status: failed
  reason: "User reported: gameart in search is cropped (significantly)"
  severity: cosmetic
  test: 7
  artifacts: []
  missing: []
- gap_id: G-47-8
  truth: "The Store Search price region can be chosen without going to the Deals screen"
  status: failed
  reason: "User reported: setting region in deals only is not a good ux. (47-RESEARCH D3 recorded reusing the Deals override as a known limitation, no new picker this phase)"
  severity: minor
  test: 8
  artifacts: []
  missing: []
- gap_id: G-47-9
  truth: "With the network off, clicking Stores does not crash GameLib"
  status: failed
  reason: "User reported: when i click on stores when offline gamelib crashes"
  severity: blocker
  test: 9
  evidence: "~/Library/Logs/GameLib/gamelib-shell-panic.log: two shell panics on the main thread, 2026-11-18 19:47:39 and 19:48:47 NZDT, payload `called Option::unwrap() on a None value` at wry-0.55.1/src/wkwebview/mod.rs:1349 (wry::wkwebview::url_from_webview <- WebView::url <- tauri_runtime_wry::handle_user_message): a webview URL is read while WKWebView reports no URL"
  artifacts: []
  missing: []
