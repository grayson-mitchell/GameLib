---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
verified: 2026-11-17T23:00:00Z
status: human_needed
score: 12/12 must-haves verified
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
  - "meta/esbuildWorkerBundleShared.ts"
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
  - "src/frontend/screens/Settings/components/ItadApiKey.tsx"
  - "src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx"
  - "src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx"
  - "src/frontend/screens/StoreSearch/helpers.ts"
  - "src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts"
  - "src/frontend/screens/StoreSearch/hooks/useOwnedSteamGids.ts"
  - "src/frontend/screens/StoreSearch/index.tsx"
covered_digest: "v4:sha256:17f74d582b03671aa64f7a90b794f54e0061aaf42b5334820a7f096b934b683a"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Localised prices in a non-US region (47-10 live item 1)"
    expected: "With the Deals screen region override set to Germany (or the United Kingdom), searching Store Search for 'portal' shows rows priced in that currency (e.g. '9,75 €' / '£8.19'), never '$… EUR' or '$… GBP', and the region caption names the priced country."
    why_human: "Needs a live ITAD key, the real API, and a visual read of the rendered currency; jest uses recorded fixtures."
  - test: "Expanded row uses the same country (47-10 live item 2)"
    expected: "Expanding the first 'portal' row lists per-store deals in the same currency as the collapsed row; clicking a store opens its ITAD link in the browser."
    why_human: "Live deals fetch plus an external-browser open; not exercisable in jest."
  - test: "Cached price shows 'Price from ...' instead of an error (47-10 live item 3)"
    expected: "After item 1, quit GameLib, age every fetchedAt in store_cache/itad_prices.json back 2 hours, relaunch with network ON, then with network OFF only for the action search 'portal' again: rows render with a separate secondary 'Price from <date, time>' line under the price, no error banner, no dimming, text never says error/failed/rate limited. Turn the network back ON before reporting."
    why_human: "Real persisted-cache file, real network cut and a visual check of the cached line; the 429 arm itself is pinned by itad.test.ts but the user-visible path is not."
  - test: "Settings key field never displays the saved key (47-13 live item 1)"
    expected: "Settings > Advanced shows the IsThereAnyDeal field under SteamGridDB with an (i) on the label line; entering a key then reopening Settings shows the 'Key saved' placeholder with an EMPTY input; clearing it restores the optional placeholder."
    why_human: "Keyring round trip and visual layout in the running Tauri app (the component test mocks React state and the IPC)."
  - test: "Rejected user key shows the danger line (47-13 live item 2)"
    expected: "With a deliberately bad user key saved, run a Store Search (results still appear via the built-in key), then reopen Settings > Advanced: the danger-colored 'ITAD rejected this key, so Store Search is using the built-in key.' line shows; typing or clearing hides it."
    why_human: "Needs a real ITAD 403 against a bad key and the sidecar's session-scoped rejected flag across two screens."
---

# Phase 47: Migrate aggregated store search from CheapShark to IsThereAnyDeal Verification Report

**Phase Goal:** Replace the USD-only CheapShark adapter behind `/store-search` with a localised IsThereAnyDeal provider so a non-US user sees prices in their own currency; retire the D-13 debt (`SEARCH_CURRENCY = 'USD'`, `formatUsdPrice()`).
**Verified:** 2026-11-17T23:00:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

The automated evidence is complete: every must-have truth is backed by code that exists, is substantive, is wired end to end (adapter, handlers, IPC schema and generated allow-list, preload, container, row, breakdown, Settings) and is covered by passing scoped tests. The CheapShark module and both debt symbols are gone from `src/`, `meta/` and `src-tauri/src/`. What remains is the operator's live check (five items below), which the phase planned as non-blocking human-verify checkpoints and which was not run. No FAILED truth, no BLOCKER.

ROADMAP Phase 47 carries no `success_criteria` list, so the roadmap contract was taken from the Goal paragraph, REQUIREMENTS PRICE-01..03 and CONTEXT D-01..D-13; PLAN frontmatter truths were merged on top.

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | PRICE-01: a search returns up to 20 rows priced in the requested country's currency via 2 ITAD calls (search v1 + prices v3 with `country`), each row the cheapest https deal; zero-deal games dropped (D-09, D-11) | VERIFIED | `itad.ts` `searchGames` (GET `/games/search/v1` with `results: 20`, then POST `/games/prices/v3` with `params.country`), `mapSearchResults` drops games with no deal; `itad.test.ts` "searches then prices in two calls...", "drops a game with no current deals", "formats a zero-decimal currency" pass |
| 2  | D-13: a country ITAD does not price (10 measured: IL RU UA MD MX ZA SG HK SA AE) or answers 4xx falls back to US and the response says `pricedCountry: 'US'`; the UI shows `storeSearch.regionFallback` only when it differs | VERIFIED | `pricedCountryFor` + `postPricesWithKey` fallback in `itad.ts`; `itadCoverage.ts` `ITAD_PRICED_COUNTRIES` (32, traced to `47-ITAD-COVERAGE.json`); `StoreSearch/index.tsx` `role="note"` gated on `pricedCountry !== countryCode`; tests "prices an unlisted country as US", "retries once as US when ITAD answers the country with a 4xx" pass |
| 3  | D-13 debt retired: `cheapshark.ts`, `SEARCH_CURRENCY`, `formatUsdPrice` and the per-boot storeMap slot are gone; prices render through Intl `formatPrice` with the ISO code in the same text node (en/GBP -> "£12.99 GBP", not "$14.99 GBP") | VERIFIED | `ls src/backend/storeSearch` has no cheapshark file; `grep -rniE "cheapshark|SEARCH_CURRENCY|formatUsdPrice" src meta src-tauri/src` hits only stale comments, test-fixture buy URLs and the test file name `formatUsdPrice.test.ts` (which now tests `formatPrice`); `helpers.ts` `formatPrice` uses `Intl.NumberFormat(..., {style:'currency'})`; both call sites (`StoreSearchRow/index.tsx:73`, `StoreSearchBreakdown/index.tsx:109`) use it; `formatUsdPrice.test.ts` passes |
| 4  | PRICE-02: an ITAD result's gid maps to a Steam appid via the keyless `/lookup/id/shop/61/v1` (chunked 200, 30-day persisted, only unseen/expired requested, never throws); the container injects `steamAppId` so "Owned on Steam" and "Key available" keep working; no gid map means no wrong Steam badge | VERIFIED | `itad.ts` `lookupSteamGids` (no key param, `isGidEntryFresh`, chunk loop); `useOwnedSteamGids.ts` inverts the map; `index.tsx` `resolveStoreSearchBadges({...result, steamAppId: gidToAppId.get(result.gameId)})`; `badges.ts` exact-appid arm unchanged; `itad.test.ts` lookup describe (5 tests) and `useOwnedSteamGids.test.ts` pass |
| 5  | PRICE-03: on 429 the gate blocks until `Retry-After` (timestamp compare, clamped 1s..15min) and the call returns the stale cached rows/deals each carrying `cachedAt`; with no cache it throws `[storeSearch:rateLimited]`; network errors and 5xx are covered the same way; the renderer shows a sibling "Price from {{time}}" line, not an error | VERIFIED | `itad.ts` `searchGames`/`getGameDeals` (`serveStale`, `noteRateLimit`, `isStaleCoverable`); `itadCache.ts` `parseRetryAfter`, `createItadGate`; `StoreSearchRow/index.tsx` `storeSearchRow__cached` span beside (not inside) the price span; behavioral tests "serves stale rows with cachedAt on 429 and holds the gate until Retry-After", "throws rateLimited on 429 with no cache", "serves cache on a network error", "serves stale deals ... on 429" and the 16 row tests pass |
| 6  | D-08/D-10: search/deals entries are fresh 1 hour and retained (never evicted on read) so they remain the fallback; gid 30 days (miss 1 day); dotted queries are hashed; prices store capped at 500; concurrent identical requests single-flight and clear after rejection; no timers anywhere in `storeSearch/` | VERIFIED | `itadCache.ts` constants and `createItadGate`; `stores.ts` `invalidateCheck: () => false`; `cache.ts` `get` only deletes when `invalidateCheck` is true; `grep setTimeout\|setInterval src/backend/storeSearch/*.ts` returns nothing; `itadCache.test.ts` 7 tests incl. "single-flights and clears after rejection" and "has no timers" pass; `registeredStores.json` carries the two stores |
| 7  | D-01..D-04: release builds bake `secrets.ITAD_API_KEY` into BOTH sidecar bundles via `--define:__ITAD_API_KEY__`; `GAMELIB_ITAD_API_KEY` overrides at runtime; a keyless build runs and raises `notConfigured` (search box stays enabled, no Retry); `release-tauri.yml` fails before the sidecar build when the secret is empty | VERIFIED | `esbuildWorkerBundleShared.ts` `itadKeyDefineFlag`, applied in `buildSidecar.ts:28` and `buildSidecarSea.ts:287`; `release-tauri.yml:337-347` fail-fast step then step-scoped env on `build:sidecar-sea`; `itadKey.ts` `resolveBuiltInItadKey`; `itadKeyDefine.test.ts`, `releaseWorkflow.test.ts`, `itadKey.test.ts` pass; `gh secret list` count of 1 recorded by 47-02 (operator-created). See IN-01: a whitespace-only secret passes the gate |
| 8  | Every `buyUrl` is ITAD's deal url byte-for-byte (contractual comment present); a non-https url drops the deal, never rewritten | VERIFIED | `itad.ts` `mapDeals` comment "CONTRACTUAL (ITAD terms)" and `isHttpsUrl` drop; tests "passes the deal url through byte-for-byte", "drops non-https deals..." pass |
| 9  | The ITAD key (built-in or user) never appears in a log call or a thrown message; failures log `{endpoint, status}` only; `itad.getKeyStatus` returns two booleans | VERIFIED | `itad.ts` `logFailure`, `StoreSearchError` message shape; `enrichmentFlowRegistration.ts:424` booleans only; tests "never puts the key in a log call or a thrown message" (both key kinds) pass; committed fixtures and `47-ITAD-COVERAGE.json` contain no key (grep) |
| 10 | IPC: `searchStores(query, country?)`, `getStoreSearchDeals(gid, country?)` (gid regex blocks dots/slashes), `getItadSteamGids(appIds)` (digits, max 5000), `itad.getKeyStatus`, `itad.setApiKey` (max 256) are zod-validated, registered, exposed in preload and in the generated Rust allow-list; `getStoreSearchStoreMap` is deleted; renderer reads the `StoreSearchResponse` envelope | VERIFIED | `common/types/ipc/enrichment.ts:67-104`; `preload/api/storeSearch.ts`; `ipc_contract.rs:553,615-616`; `pnpm gen:ipc-contract --check` -> "up to date"; `rendererAllowList`, `ipcSchemas/enrichment`, `enrichmentFlows`, `runnerSliceRegistration`, `diPhaseGates`, `bootstrap*` and `ipcDomainCensus` suites pass |
| 11 | D-05/D-06: an optional user key is stored in the `itad-api-key` keyring slot (dev vault in dev), takes precedence over env/baked, a 401/403 on it marks it rejected for the session and retries that request once with the built-in key (or `notConfigured`), PRICE-01..03 do not depend on it, and Settings > Advanced shows a password field that never displays the key back plus a `role="status"` danger line when rejected | VERIFIED (see WR-01..03) | `itadSecrets.ts`, `itadSecretStore.ts`, `main.rs:477` + 3 allow-list tests, `bootstrap.ts` `'itad-secrets'` step, `itad.ts` `resolveKey`/`withKey`, `ItadApiKey.tsx` mounted at `AdvancedSettings/index.tsx:51` after SteamGridDB; `itadSecrets.test.ts`, user-key describe (8 tests) and `ItadApiKey.test.tsx` (6) pass. The happy path holds; the failure paths in the review warnings below are robustness gaps in an optional feature |
| 12 | D-12: the coverage sweep was operator-run and its redacted output is committed; the measured constants (countries, shop ids, lookup ceiling, amount source) are locked in `itadCoverage.ts`; the search results param is graded SPEC, not MEASURED | VERIFIED (SPEC-graded for one constant) | `47-ITAD-COVERAGE.json` + 8 fixtures present; `itadCoverage.ts` header cites the JSON; `ITAD_SEARCH_RESULTS_PARAM = 'results'` documented as SPEC. Impact if wrong is nil for the goal: ITAD's default is 20 and the sweep returned 20 for both candidate params, so the row count holds either way |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified). The behavior-dependent truths (5, 6, 11's fallback) each have a named passing behavioral test.

### Deferred Items

None. The deals browser, Stage 2 feed and Amazon coverage are explicitly out of scope in ROADMAP and are not gaps.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/backend/storeSearch/itad.ts` | Adapter: `searchGames`, `getGameDeals`, `lookupSteamGids`, `StoreSearchError` | VERIFIED | 630 lines, substantive, imported by `handlers.ts` |
| `src/backend/storeSearch/itadCache.ts` / `stores.ts` | Cache keys, fresh/stale, gate; two CacheStores | VERIFIED | wired through `createStores.ts` and `miscRuntime.itadGate` |
| `src/backend/storeSearch/itadCoverage.ts` | Measured constants | VERIFIED | all 10 constants present, consumed by `itad.ts` and `storeMapping.test.ts` |
| `src/backend/storeSearch/itadKey.ts` | env > baked resolver | VERIFIED | used by `itad.ts` `resolveKey` |
| `src/backend/storeSearch/itadSecrets.ts`, `sidecar/itadSecretStore.ts` | User-key owner and keyring store | VERIFIED | booted at `'itad-secrets'`, injected into IPC registration |
| `src/backend/storeSearch/handlers.ts` | Rethrow seam with country arg | VERIFIED | 97 lines, three handlers |
| `src/common/types/storeSearch.ts` | Envelope, `cachedAt`, error markers | VERIFIED | `storeSearchErrorCode` consumed by the hook |
| `src/common/discounts/storeMapping.ts` | `ITAD_SHOP_TO_RUNNER` | VERIFIED | one production importer (`itad.ts`) |
| `src/frontend/screens/StoreSearch/{index.tsx,helpers.ts,hooks/*,components/*}` | Country-aware UI, caption, fallback note, error variants, cached lines | VERIFIED | all wired; see links |
| `src/frontend/screens/Settings/components/ItadApiKey.tsx` | Key field | VERIFIED | exported from barrel, mounted |
| `meta/esbuildWorkerBundleShared.ts`, `buildSidecar.ts`, `buildSidecarSea.ts`, `.github/workflows/release-tauri.yml` | Key define + fail-fast | VERIFIED | both bundles and the workflow step present |
| `47-ITAD-COVERAGE.json`, `__tests__/fixtures/itad/*.json` | Redacted sweep + real fixtures | VERIFIED | 8 fixtures + summary present |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `StoreSearch/index.tsx` | `useDebouncedStoreSearch(countryCode)` -> `window.api.searchStores(query, countryCode)` | country derived from `getLocaleSettings` + stored override | WIRED | region change re-runs via effect deps `[debouncedQuery, countryCode]` |
| `StoreSearch/index.tsx` | `resolveStoreSearchBadges` | `steamAppId: gidToAppId.get(result.gameId)` | WIRED | |
| `useOwnedSteamGids` | `window.api.getItadSteamGids` | one call per appid-set change | WIRED | single call, see WR-05 |
| `enrichmentFlowRegistration.ts` | `storeSearch/handlers.ts` | `deps.ipc.handle('searchStores' / 'getStoreSearchDeals' / 'getItadSteamGids')` | WIRED | |
| `enrichmentFlowRegistration.ts` | `deps.itadSecrets` | `itad.getKeyStatus` / `itad.setApiKey` | WIRED | |
| `itad.ts` | `itadCache.ts`, `itadKey.ts`, `itadCoverage.ts`, `storeMapping.ts` | imports + `itadGate.*`, `resolveBuiltInItadKey`, `resolveRunner` | WIRED | |
| `StoreSearchRow` / `StoreSearchBreakdown` | `formatPrice`, `formatCachedAt`, `getStoreSearchDeals(gameId, countryCode)` | JSX | WIRED | |
| `release-tauri.yml` | `pnpm build:sidecar-sea` | step env `ITAD_API_KEY: ${{ secrets.ITAD_API_KEY }}` | WIRED | |
| `ItadApiKey.tsx` | `window.api.itad.getKeyStatus / setApiKey` | mount + onChange | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `StoreSearchRow` price | `result.cheapestPrice` / `currencyCode` | `searchGames` -> ITAD prices v3 `deal.price.amount/currency` | Yes (fixtures are recorded real responses) | FLOWING |
| `StoreSearchBreakdown` rows | `deals` | `getGameDeals` -> cache or prices v3 | Yes | FLOWING |
| Steam badge | `gidToAppId` | `lookupSteamGids` -> keyless ITAD lookup | Yes; empty Map on failure by design | FLOWING |
| Cached line | `result.cachedAt` | `entry.fetchedAt` from the persisted `itad_prices` store | Yes | FLOWING |
| Region caption / note | `countryCode`, `pricedCountry` | locale + response envelope | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Adapter, cache, key, secrets, handlers, shop map | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/storeSearch/__tests__/{itad,itadCache,itadKey,itadSecrets,handlers}.test.ts src/backend/__tests__/storeMapping.test.ts` | 6 suites, 80 tests passed | PASS |
| Renderer: formatters, row, hook, screen, gid hook, Settings field | `pnpm exec jest --selectProjects Frontend --runTestsByPath` over the 6 StoreSearch/Settings test files | 6 suites, 65 tests passed | PASS |
| Build-key define, sweep helpers | `pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/itadKeyDefine.test.ts meta/__tests__/measureItadCoverage.test.ts` | 2 suites, 11 tests passed | PASS |
| Release workflow, IPC schemas, allow-list, flows, DI gates | `pnpm exec jest --selectProjects Backend --runTestsByPath` over `releaseWorkflow`, `rendererAllowList`, `ipcSchemas/enrichment`, `enrichmentFlows`, `runnerSliceRegistration`, `diPhaseGates` | 6 suites, 516 tests passed | PASS |
| Bootstrap wiring | `bootstrap*.test.ts` (4 files) | 58 passed | PASS |
| IPC census pin (47 bookkeeping) | `ipcDomainCensus.test.ts` | passed (the 291 pin from d8d2f885e holds) | PASS |
| i18n gate scope (47 bookkeeping) | `hardcodedStringGate.test.ts` | 176 passed | PASS |
| Generated Rust allow-list in sync | `pnpm gen:ipc-contract --check` | "src-tauri/src/ipc_contract.rs is up to date" | PASS |
| Pre-existing suites flagged by the orchestrator | `storeKinds.test.ts`, `createStores.test.ts` | 2 failed; the diff is solely `steam_direct_launch_verdict` (quick 261117-p38), not an ITAD store | NOT PHASE 47 |

### Probe Execution

Step 7c: SKIPPED. No PLAN or SUMMARY declares a `scripts/*/tests/probe-*.sh` probe, and the phase is not a migration/tooling phase with conventional probes.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| PRICE-01 | 47-01, 02, 03, 04, 06, 07, 08, 09, 10, 11, 12, 13 | User sees store-search prices in their own currency | SATISFIED in code; live confirmation pending (human items 1, 2) | Truths 1, 2, 3, 7, 10, 11 |
| PRICE-02 | 47-01, 05, 06, 07, 08, 09 | "You already own this" badge keeps working on ITAD results | SATISFIED in code | Truth 4; test-backed, no dedicated live item |
| PRICE-03 | 47-03, 05, 06, 07, 08, 09, 10 | When rate-limited, cached price with its timestamp instead of an error | SATISFIED in code; live confirmation pending (human item 3) | Truth 5 |

All three IDs appear in PLAN frontmatter and in REQUIREMENTS.md (`PRICE-01..03` -> Phase 47). No orphaned requirements: REQUIREMENTS.md maps no other ID to Phase 47. Bookkeeping note: REQUIREMENTS.md still shows all three as `[ ]` / `Pending` (47-03 deliberately reverted a premature tick); they should be ticked only after the human items below resolve.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| phase-47 source files | - | TBD/FIXME/XXX/TODO/HACK scan | none | Clean; no debt markers |
| `src/backend/storeSearch/itadCoverage.ts` | 74-80 | unused `ITAD_AUTH_STYLE` + dead `amountInt` branch in `itad.ts:194-209` (IN-03) | Info | Dead configuration, no behavior impact |
| stale comments | `enrichmentFlowRegistration.ts:102`, `process/README.md:248`, `badges.ts:116`, `humble/steamAppIdResolver.ts:11` | mention CheapShark | Info | Comments only; no code path |

### Code Review Findings (47-REVIEW.md: 0 critical, 5 warning, 4 info, all `open`)

I re-read the cited code for each warning; the review's descriptions are accurate. None defeats a PRICE-01..03 must-have, because all five sit on the optional user-key setting (D-05, built to be cuttable) or on the PRICE-02 join's scale limits. They are WARNINGs for the operator's triage, not BLOCKERs.

| ID | Affects | Confirmed in code | Defeats a must-have? |
| -- | ------- | ----------------- | -------------------- |
| WR-01 `setApiKey` reports success when the keyring write failed | 47-13 truth "typing persists the key" | Yes: `itadSecrets.setApiKey` swallows the store failure, `ItadApiKey.persistKey` then does `setHasKey(!!newValue)` | No on the happy path; on a keyring failure the UI says "Key saved" while nothing was stored |
| WR-02 per-keystroke persistence, no write ordering; oversize paste disables the field | 47-13 | Yes: `onChange` fires `setApiKey` per keystroke; a >256 paste is zod-rejected and `setUnavailable(true)` | No; failure is graceful (built-in key fallback), but a quick type-then-clear could leave a stale stored key |
| WR-03 optional user-key read can stall a search on a Keychain prompt | D-05 | Yes: `resolveKey` awaits `secrets.getApiKey()` before the request | No; only users who saved a key, and the built-in-key default path does no I/O |
| WR-04 `lookupSteamGids` keeps requesting after a 429/network failure; a malformed 200 body caches misses for a day | PRICE-02 | Yes: the chunk loop `catch` only logs and continues | No; the badge degrades to fuzzy arms, never to a wrong badge |
| WR-05 owned-on-Steam join disables itself above 5000 appids | PRICE-02 | Yes: hook sends the whole set, schema `.max(5000)` | No for typical libraries; silent loss of the Steam badge for very large ones |
| IN-01 release gate accepts a whitespace-only secret | D-04 | Yes: `test -n` vs the trimmed define | No; narrow edge, but it is the exact outcome D-04 targets |
| IN-02 rejected built-in key surfaces as generic `provider`, no stale copy | PRICE-03 edge | Yes: `isStaleCoverable` excludes 4xx | No |
| IN-03 dead config | - | Yes | No |
| IN-04 empty breakdown panel when ITAD returns no deals | UI polish | Yes | No |

### Human Verification Required

Five live checks the operator owes; they are planned human-verify items (47-10 Task 3, 47-13 Settings) and were not run. Setup for 1-3: in your own terminal `export GAMELIB_ITAD_API_KEY=<your GameLib ITAD app key>`, stop any running dev session (`pnpm tauri:dev` does NOT rebuild the sidecar; `build:sidecar` last ran 22:00 per 47-10), then `pnpm tauri:dev` from the repo root. Never `pnpm tauri:dev:run`.

### 1. Localised prices in a non-US region
expected: With the Deals screen's region override set to Germany (or the United Kingdom), searching Store Search for "portal" shows rows priced in that currency (e.g. "9,75 €" / "£8.19"), never "$… EUR" or "$… GBP", and the region caption names the priced country.
result: pending

### 2. Expanded row uses the same country
expected: Expanding the first "portal" row lists per-store deals in the same currency as the collapsed row; clicking a store opens its ITAD link in the browser.
result: pending

### 3. Cached price shows "Price from ..." instead of an error
expected: After item 1, quit GameLib; tell Claude "age the cache" (it moves every `fetchedAt` in `store_cache/itad_prices.json` under the GameLib config dir back 2 hours). Relaunch with network ON, open Store Search, then turn the network OFF only for this action: search "portal" again, note what the rows show, and turn the network back ON before reporting. Rows render normally with a separate secondary "Price from <date, time>" line under the price (hover shows the longer explanation); no error banner, no dimming, and the text never says error, failed or rate limited.
result: pending

### 4. Settings key field never displays the saved key
expected: Settings > Advanced shows the IsThereAnyDeal field under SteamGridDB with an (i) on the label line; entering a key then reopening Settings shows the "Key saved - type to replace, clear to remove" placeholder with an EMPTY input; clearing it restores the optional placeholder.
result: pending

### 5. Rejected user key shows the danger line
expected: With a deliberately bad user key saved, run a Store Search (results still appear via the built-in key), then reopen Settings > Advanced: the danger-colored "ITAD rejected this key, so Store Search is using the built-in key." line shows; typing or clearing the key hides it.
result: pending

Non-blocking, not a gate: 47-02 Task 2 (reply to ITAD on the api@isthereanydeal.com thread, D-07) is "pending operator". Also note the release fail-fast (D-04) is verified by workflow-text test and code reading only; it has not run in a real release build.

### Gaps Summary

No gaps. Every must-have resolves to VERIFIED with wired, data-flowing code and passing scoped tests; the phase goal (localised ITAD prices replacing the USD-only CheapShark adapter, with the D-13 debt retired) is achieved in the codebase. Status is `human_needed` solely because five planned live checks are owed by the operator. The five open review warnings are recommended for triage (WR-01 and WR-02 are the most user-visible, both in the optional Settings field) but do not block the phase.

---

_Verified: 2026-11-17T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
