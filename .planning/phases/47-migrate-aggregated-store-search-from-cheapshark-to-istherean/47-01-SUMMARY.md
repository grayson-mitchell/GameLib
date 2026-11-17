---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 01
subsystem: backend/storeSearch
tags: [itad, measurement, coverage-sweep, fixtures]
status: partial
requires: []
provides:
  - meta/measureItadCoverage.ts operator-run ITAD sweep (HTTP only, key from GAMELIB_ITAD_API_KEY)
  - 47-ITAD-COVERAGE.json redacted sweep summary
  - real ITAD response fixtures under src/backend/storeSearch/__tests__/fixtures/itad/
affects: [47-06, 47-07]
key-files:
  created:
    - meta/measureItadCoverage.ts
    - meta/__tests__/measureItadCoverage.test.ts
    - .planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-ITAD-COVERAGE.json
    - src/backend/storeSearch/__tests__/fixtures/itad/shops.json
    - src/backend/storeSearch/__tests__/fixtures/itad/lookup-steam.json
    - src/backend/storeSearch/__tests__/fixtures/itad/search-portal.json
    - src/backend/storeSearch/__tests__/fixtures/itad/prices-US.json
    - src/backend/storeSearch/__tests__/fixtures/itad/prices-nonUSD.json
    - src/backend/storeSearch/__tests__/fixtures/itad/prices-zeroDecimal.json
    - src/backend/storeSearch/__tests__/fixtures/itad/error-nokey.json
    - src/backend/storeSearch/__tests__/fixtures/itad/error-badkey.json
  modified: []
key-decisions:
  - "Task 3 (itadCoverage.ts) NOT written: the sweep measured resultsParam = null, and the plan says STOP and report in that case (D-09 cannot be met as specified)"
requirements-completed: []
commits: 2
plan_head_before: 01d78e5e34b45fb4d183fc40dc7d01c93defddac
plan_head_after: 92f388a6374c57b64fbdc055757ade3593fc2dd0
completed: 2026-11-17
---

# Phase 47 Plan 01: ITAD coverage sweep Summary

The sweep script was written and run by the operator against ITAD with the app API key; its key-free output and response fixtures are committed. The measured-constants module (Task 3) is blocked on one unresolved measurement: the search results param.

## Status

Tasks 1 and 2 complete. Task 3 not done, deliberately (see "Blocker for Task 3"). `status: partial` so the plan is not read as finished; requirements PRICE-01 and PRICE-02 are not marked complete.

## Commits

- `fd2477a83`: `meta/measureItadCoverage.ts` and its pure-helper tests (Task 1)
- `92f388a63`: `47-ITAD-COVERAGE.json` and the eight `itad/*.json` fixtures (Task 2 outputs)

`commits: 2` is counted by plan scope, not `rev-list ${plan_head_before}..HEAD` (that range spans unrelated main-branch commits made between the two plan commits). `plan_head_before` is the parent of `fd2477a83`.

## Measured values (sweep of 2026-11-17T07:55:47Z)

| Unknown (D-12) | Measured |
| --- | --- |
| Auth style | `query:key` (GET /games/search/v1 and POST /games/prices/v3 accept `?key=`) |
| Steam shop id | 61 ("Steam") |
| GOG shop id | 35 ("GOG") |
| Epic shop id | 16 ("Epic Game Store"; by title, matches the previously `[ASSUMED]` 16) |
| Lookup batch ceiling | 1000 (largest probed size that returned 200; plan caps `ITAD_LOOKUP_BATCH_SIZE` at `min(1000, 200)` = 200) |
| Amount source | `amount` (agrees with `amountInt` for every recorded currency, including JPY/KRW-style zero-decimal) |
| 429 during sweep | none (`stoppedOn429` null) |
| Countries swept | 42, all returned HTTP 200 |
| Priced in own currency (32) | US AU BR CA CN CZ DK FI FR DE GR HU IT JP NL NO PL PT RO KR ES SE CH TW TR GB AR NZ IE AT BE IN |
| Fallback to US (10) | IL RU UA MD MX ZA SG HK SA AE (D-13: absent from `ITAD_PRICED_COUNTRIES`) |
| No-key error | HTTP 403, `{status_code: 403, reason_phrase: "Missing api key"}` |
| Bad-key error | HTTP 403, `{status_code: 403, reason_phrase: "Invalid or expired api key"}` |

Note for the adapter (47-06): a missing or invalid key is a **403**, not 401. Both bodies carry `reason_phrase`.

## Notable finding: resultsParam is null (D-09 unresolved)

`/games/search/v1` returned 20 rows for BOTH `results=20` and `limit=20`, so the probe could not tell which param ITAD honours. 20 may simply be the default page size, in which case neither param is what caps the count, or both are accepted. `pickResultsParam` returns null when both runs match the wanted count, so `47-ITAD-COVERAGE.json` records `resultsParam: null` and `searchCounts: {results: 20, limit: 20}`.

Consequence for downstream plans: any plan that sizes a search request (47-06 onward) cannot assume a param name. Do not hardcode `results` or `limit` from RESEARCH. Resolving it needs a second probe with a wanted count that differs from the default (for example 5 or 50) so the two params can be told apart, or a read of ITAD's API docs for `/games/search/v1`. This plan's downstream plans were not edited.

## Blocker for Task 3

Task 3 says: if `resultsParam` is null, STOP and report, because no param caps the count and D-09 cannot be met as specified. `src/backend/storeSearch/itadCoverage.ts` was therefore not created. Every other constant it needs is measured and listed above, so only `ITAD_SEARCH_RESULTS_PARAM` is open. Next step is an operator/planner decision: re-probe with a non-default count, or relax D-09 to "request 20, slice client-side". Plans 47-06+ should not be unblocked until that is settled.

## Redaction and format checks

- Grep of the committed JSON and fixtures for `key=`, `"key":`, `apikey`, `api_key` printed nothing; operator also confirmed the `grep -F` of the live key printed nothing.
- `src/backend/storeSearch/__tests__/fixtures` is not prettier-ignored; `npx prettier --check` over the nine written JSON paths passed with no reformat needed, so file content is exactly what the script wrote.

## Process note: first sweep run used the wrong credential

The operator's first run used the ITAD app's OAuth client credential instead of its API Key and got 403 "Invalid or expired api key" on every keyed call. The re-run with the API Key succeeded (all output above is from that run). The repo secret `ITAD_API_KEY` was re-set with the correct API Key; that is Plan 47-02's concern and is recorded here only as context.

## Deviations from Plan

None in code. The one departure from the dispatched flow is that Task 3 was not executed, per the plan's own STOP rule.

## Known Stubs

None.

## Threat Flags

None. No new network surface in the app; the sweep is a standalone meta script.

## Self-Check: PASSED

- 47-ITAD-COVERAGE.json and all eight fixtures present and non-empty (Task 2 verify passed).
- Commits `fd2477a83` and `92f388a63` exist on main.
