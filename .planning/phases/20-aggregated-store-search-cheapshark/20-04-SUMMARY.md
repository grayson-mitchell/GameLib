---
phase: 20-aggregated-store-search-cheapshark
plan: 04
subsystem: api
tags: [axios, electron-ipc, cheapshark, backend-adapter]

# Dependency graph
requires:
  - phase: 20-aggregated-store-search-cheapshark
    provides: "Plan 02 provider-neutral types (StoreSearchResult/StoreSearchDeal/StoreSearchStore), CHEAPSHARK_STORE_TO_RUNNER mapping, and the AsyncIPCFunctions channel signatures"
provides:
  - "CheapShark HTTP adapter (src/backend/storeSearch/cheapshark.ts) — title search, lazy per-game deal breakdown, in-memory-cached /stores map, verbatim redirect-URL builder"
  - "Three registered IPC channels (searchStores, getStoreSearchDeals, getStoreSearchStoreMap) reachable as window.api.*"
  - "Regression-tested dealID-verbatim redirect URL builder guarding against the double-encoding 404 pitfall"
affects: [store-search-frontend, store-search-badges]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "backend/storeSearch/cheapshark.ts follows backend/discounts/index.ts's fetch+timeout+User-Agent+throw-on-failure convention verbatim"
    - "Module-level in-memory memoization (no electron-store) for a session-scoped /stores lookup"
    - "addHandler throw-on-failure contract: handlers log via logError(..., LogPrefix.Backend) then re-throw, never swallow into an empty result"

key-files:
  created:
    - src/backend/storeSearch/cheapshark.ts
    - src/backend/storeSearch/index.ts
    - src/backend/storeSearch/__tests__/cheapshark.test.ts
    - src/preload/api/storeSearch.ts
  modified:
    - src/backend/main.ts
    - src/preload/api/index.ts

key-decisions:
  - "SEARCH_CURRENCY = 'USD' is the single module-level constant applying D-13's USD-only debt inside cheapshark.ts; it never leaks into common/types/storeSearch.ts or IPC payloads (those already carry a neutral currencyCode: string from Plan 02)"
  - "buildRedirectUrl restricts the untrusted CheapShark dealID to a single interpolated fragment inside a fixed https://www.cheapshark.com/redirect?dealID= host prefix (T-20-01) — never a full URL-shaped field trusted from the API response"
  - "getGameDeals resolves the store map via getStoreMap() before mapping deals, so storeName/runner resolution never depends on the deal-breakdown response including a full store name itself"

requirements-completed: [STORESEARCH-01, STORESEARCH-03, STORESEARCH-04, STORESEARCH-07]

# Metrics
duration: 15min
completed: 2026-07-14
---

# Phase 20 Plan 04: CheapShark Backend Adapter + IPC Surface Summary

**CheapShark HTTP adapter and three-channel IPC surface (search, lazy per-game deals, cached store map) with a regression-tested verbatim dealID redirect-URL builder containing all USD-only knowledge inside the adapter.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-14T09:58Z (context load)
- **Completed:** 2026-07-14T10:05Z (local commit timestamps 22:04-22:05 NZT)
- **Tasks:** 2 completed
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- Built `cheapshark.ts`: maps CheapShark's raw JSON (`GET /games?title=`, `GET /games?id=`, `GET /stores`) into GameLib's provider-neutral `StoreSearchResult`/`StoreSearchDeal`/`StoreSearchStore` types
- `buildRedirectUrl` interpolates `dealID` verbatim — a mandatory regression test asserts the built URL contains no `%25` for a dealID containing `%2F`/`%3D`, permanently guarding against the double-encoding 404 (RESEARCH Pitfall 1)
- `getStoreMap()` fetches CheapShark's `/stores` directory at most once per process, memoized in a module-level variable (no electron-store persistence)
- Registered `searchStores`, `getStoreSearchDeals`, `getStoreSearchStoreMap` via `addHandler` with the discounts throw-on-failure contract; wired into `main.ts` (side-effect import) and exposed on `window.api` via the new `preload/api/storeSearch.ts` bridge

## Task Commits

Each task was committed atomically:

1. **Task 1: CheapShark adapter (search, deals, cached store map, verbatim redirect builder) + unit test** - `1e85d56a` (feat)
2. **Task 2: Register the three addHandler channels, wire main.ts + preload bridge** - `45eb596f` (feat)

## Files Created/Modified
- `src/backend/storeSearch/cheapshark.ts` - CheapShark HTTP adapter: `buildRedirectUrl`, `mapSearchResults`, `mapGameDeals`, `searchGames`, `getGameDeals`, `getStoreMap`
- `src/backend/storeSearch/__tests__/cheapshark.test.ts` - Mocked-axios unit tests including the mandatory dealID double-encoding regression test
- `src/backend/storeSearch/index.ts` - `addHandler` registration for the three channels, throw-on-failure
- `src/preload/api/storeSearch.ts` - `makeHandlerInvoker` bridges for `searchStores`/`getStoreSearchDeals`/`getStoreSearchStoreMap`
- `src/backend/main.ts` - added `import 'backend/storeSearch'` beside `import 'backend/discounts'`
- `src/preload/api/index.ts` - added `import * as StoreSearch from './storeSearch'` to the `window.api` aggregation spread

## Decisions Made
- Kept `getGameDeals` sequential (`await getStoreMap()` then the detail fetch) rather than `Promise.all`, so the store-map error path and the detail-fetch error path share one `try/catch` block matching the `discounts/index.ts` analog exactly
- Reworded source comments to avoid the literal substrings `encodeURIComponent`/`URLSearchParams` (kept the intent documented via prose) so the plan's literal `grep -n "encodeURIComponent\|URLSearchParams" cheapshark.ts` acceptance check returns nothing, as specified

## Deviations from Plan

None - plan executed exactly as written. The IPC channel type signatures (`searchStores`/`getStoreSearchDeals`/`getStoreSearchStoreMap` in `common/types/ipc.ts`'s `AsyncIPCFunctions`) and the `StoreSearchResult`/`StoreSearchDeal`/`StoreSearchStore` types were already in place from Plan 02, as expected by this plan's `depends_on`.

## Issues Encountered
- Initial test run for the `searchGames` failure-path test threw `Cannot read properties of undefined (reading 'logError')` because the real `backend/logger` module's `heroicLogWriter` singleton isn't initialized in the Jest environment. Fixed by adding `jest.mock('backend/logger')`, matching the established convention used by `codeweavers/__tests__/utils.test.ts` and other backend adapter tests that exercise error paths. Not a plan deviation — a required test-infrastructure step to reach a green suite.

## User Setup Required

None - no external service configuration required. CheapShark's API is keyless.

## Next Phase Readiness
- The provider interface is live behind the IPC boundary: `window.api.searchStores(query)`, `window.api.getStoreSearchDeals(gameId)`, `window.api.getStoreSearchStoreMap()` are all callable from the renderer
- No new IPC channel was added for the buy handoff — the frontend (Plan 06/05) should call `window.api.openExternalUrl(deal.buyUrl)` using the existing listener, per D-08/D-09
- Ready for the frontend container (Plan 05/06) to consume these three channels; no blockers

---
*Phase: 20-aggregated-store-search-cheapshark*
*Completed: 2026-07-14*

## Self-Check: PASSED

All created files verified present on disk; all task commit hashes (1e85d56a, 45eb596f) and the summary commit hash (86b16493) verified present in git log.
