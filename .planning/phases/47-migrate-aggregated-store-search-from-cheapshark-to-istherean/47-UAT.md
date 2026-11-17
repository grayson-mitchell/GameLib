---
status: testing
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
source: [47-VERIFICATION.md]
started: 2026-11-17T23:10:00Z
updated: 2026-11-17T23:10:00Z
---

## Current Test

number: 1
name: Localised prices in a non-US region (47-10 live item 1)
expected: |
  With the Deals screen region override set to Germany (or the United Kingdom), searching Store Search for 'portal' shows rows priced in that currency (e.g. '9,75 €' / '£8.19'), never '$… EUR' or '$… GBP', and the region caption names the priced country.
awaiting: user response

## Tests

### 1. Localised prices in a non-US region (47-10 live item 1)
expected: With the Deals screen region override set to Germany (or the United Kingdom), searching Store Search for 'portal' shows rows priced in that currency (e.g. '9,75 €' / '£8.19'), never '$… EUR' or '$… GBP', and the region caption names the priced country.
result: [pending]

### 2. Expanded row uses the same country (47-10 live item 2)
expected: Expanding the first 'portal' row lists per-store deals in the same currency as the collapsed row; clicking a store opens its ITAD link in the browser.
result: [pending]

### 3. Cached price shows 'Price from ...' instead of an error (47-10 live item 3)
expected: After item 1, quit GameLib and tell Claude "age the cache" (Claude moves every fetchedAt in store_cache/itad_prices.json back 2 hours, no other change). Relaunch `pnpm tauri:dev` with network ON, open Store Search, then turn the network OFF only for this action: search 'portal' again, note the rows, and turn the network back ON before reporting. Rows render with a separate secondary 'Price from <date, time>' line under the price (hover shows the longer explanation), no error banner, no dimming, and the text never says error, failed or rate limited.
result: [pending]

### 4. Settings key field never displays the saved key (47-13 live item 1)
expected: Settings > Advanced shows the IsThereAnyDeal field under SteamGridDB with an (i) on the label line; entering a key then reopening Settings shows the 'Key saved' placeholder with an EMPTY input; clearing it restores the optional placeholder.
result: [pending]

### 5. Rejected user key shows the danger line (47-13 live item 2)
expected: With a deliberately bad user key saved, run a Store Search (results still appear via the built-in key), then reopen Settings > Advanced: the danger-colored 'ITAD rejected this key, so Store Search is using the built-in key.' line shows; typing or clearing hides it.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
