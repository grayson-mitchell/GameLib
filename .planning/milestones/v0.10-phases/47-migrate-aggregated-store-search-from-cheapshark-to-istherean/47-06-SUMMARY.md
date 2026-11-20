---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 06
subsystem: backend/storeSearch
tags: [itad, adapter, store-search, price, cache, rate-limit]
requires: [47-01, 47-04, 47-05]
provides:
  - ITAD adapter (searchGames, getGameDeals, lookupSteamGids, StoreSearchError, ItadDeps)
  - StoreSearchResponse envelope, cachedAt fields, error markers and storeSearchErrorCode classifier
  - ITAD_SHOP_TO_RUNNER keyed by measured shop ids (Amazon removed)
affects: [47-07, 47-08]
tech-stack:
  added: []
  patterns:
    [
      verbatim-url pass-through,
      message-marker error codes over IPC,
      cache-first with timer-free 429 stale fallback
    ]
key-files:
  created:
    - src/backend/storeSearch/itad.ts
    - src/backend/storeSearch/__tests__/itad.test.ts
  modified:
    - src/common/types/storeSearch.ts
    - src/common/discounts/storeMapping.ts
    - src/backend/__tests__/storeMapping.test.ts
    - src/backend/storeSearch/itadCoverage.ts
    - meta/backendDiCeilings/storeSearch.json
key-decisions:
  - 'Error codes travel as a leading message marker ([storeSearch:rateLimited] etc.), same idiom as IPC_INVALID_ARGS_MARKER'
  - 'A search also writes one deals cache entry per gid (under the requested and the actually-priced country), so a row expand is a cache hit'
  - 'Stale fallback covers 429, network errors and 5xx only; 401/403/other 4xx surface as a provider error'
requirements-completed: [PRICE-01, PRICE-02, PRICE-03]
duration: 35min
completed: 2026-11-17
status: complete
actuals:
  tokens: 21000
  tasks: 2
  commits: 3
plan_head_before: ab634606c602d747c0a545ed9859fbde06bd59e9
plan_head_after: 9bee33e2b1d6d1e5ed413965fc8f1ba1d9895881
---

# Phase 47 Plan 06: ITAD adapter Summary

An IsThereAnyDeal adapter that serves localized, cheapest-deal rows with byte-verbatim https deal urls via two calls (search v1 + prices v3), a 1 h cache, single-flight, a timer-free 429 gate that falls back to stale rows carrying `cachedAt`, and a keyless chunked appid -> gid lookup, with the key never logged or thrown.

## Commits

- 864e44fcd: types (`StoreSearchResponse`, `cachedAt`, `STORE_SEARCH_ERROR_MARKER`, `storeSearchErrorCode`), `ITAD_SHOP_TO_RUNNER`, storeMapping tests
- a8a19498a: `ITAD_PRICED_COUNTRIES` array fix (deviation below)
- 9bee33e2b: `itad.ts`, `itad.test.ts` (25 tests), DI ceiling entry

## What was built

- `searchGames(deps, query, country)`: country normalised by `ITAD_PRICED_COUNTRIES` (D-13 US fallback, plus a one-shot US retry on a non-auth 4xx); 20 rows requested via `ITAD_SEARCH_RESULTS_PARAM`; rows without a current deal dropped (D-11); `pricedCountry` returned.
- `getGameDeals(deps, gid, country)`: UUID-validated before any I/O; deals sorted price asc then store name asc; runner via `resolveRunner`.
- `lookupSteamGids(deps, appIds)`: keyless `POST /lookup/id/shop/61/v1`, `ITAD_LOOKUP_BATCH_SIZE` chunks, persisted 30 d (miss 1 d), requests only unseen/expired ids, returns the partial/stale map on a failed chunk with one status-only warning, never throws, does not touch the gate.
- Every `buyUrl` is ITAD's deal url unchanged; a non-https url drops that deal.
- `StoreSearchError` carries `code` and a marker-prefixed message (`marker endpoint status`), no URL or key.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ITAD_PRICED_COUNTRIES` was a module-scope `new Set`**

- **Found during:** Task 2 verify (`moduleStateCensus.test.ts` failed: "itadCoverage.ts: 1 site(s), not a sanctioned file")
- **Issue:** The Plan 47-01 constant tripped the D-66.4-02 module-state census, which the plan's verify block requires green.
- **Fix:** Changed it to `readonly string[]` and the adapter uses `.includes`. Nothing else consumed it. The plan text mentions `.has`; the semantics are identical.
- **Files modified:** `src/backend/storeSearch/itadCoverage.ts`, `src/backend/storeSearch/itad.ts`
- **Commit:** a8a19498a

**2. [Orchestrator note] `ITAD_SEARCH_RESULTS_PARAM` is the graded-SPEC constant `'results'`** from `itadCoverage.ts` (not read from `47-ITAD-COVERAGE.json`, whose raw `resultsParam` is null). Used as instructed.

**3. [Rule 3] `writeGidEntry` does not exist in `itadCache.ts`.** The plan's interface block lists it, but Plan 47-05 shipped only `isGidEntryFresh` for gids. The adapter writes `{data: gid | null, fetchedAt}` straight to the gid store (no index/cap is needed there).

**4. `ItadDeps.stores` is typed structurally** (`get/set/delete` over `ItadCacheEntry`) instead of `Pick<ReturnType<typeof createStoreSearchStores>, ...>`, so Map-backed fakes need no casts. The real `CacheStore` instances are assignable; Plan 47-07 wires them and codecheck will confirm.

## Verification (all run)

- `pnpm exec jest --selectProjects Backend --runTestsByPath itad.test.ts itadCache.test.ts moduleStateCensus.test.ts`: exit 0 (38 tests)
- `pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/logSecretGate.test.ts meta/__tests__/backendDiCeilings.test.ts`: exit 0 (192 tests)
- `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/__tests__/storeMapping.test.ts`: exit 0 (7 tests)
- `pnpm codecheck`: exit 0 (after Task 1 and after Task 2)
- `npx prettier --check` over the exact written paths (all reported `ignored: false` code/JSON paths): exit 0 for both tasks
- Acceptance greps: `buyUrl: deal.url` x1 with `CONTRACTUAL` on the line above; `String(err)|err.config|.request` 0; `setTimeout|setInterval` in code 0; `ITAD_SEARCH_RESULT_COUNT` x2; ceiling entry present

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-47-19..24 mitigated: status-only logging, https-only urls, UUID guard, axios `params`, 1 h cache + single-flight + gate, `pricedCountry` returned).

## Self-Check: PASSED

- FOUND: src/backend/storeSearch/itad.ts, src/backend/storeSearch/__tests__/itad.test.ts, 47-06-SUMMARY.md
- FOUND commits: 864e44fcd, a8a19498a, 9bee33e2b
