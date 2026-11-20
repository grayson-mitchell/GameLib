---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 01
subsystem: backend/storeSearch
tags: [itad, measurement, coverage-sweep, fixtures]
status: complete
requires: []
provides:
  - meta/measureItadCoverage.ts operator-run ITAD sweep (HTTP only, key from GAMELIB_ITAD_API_KEY)
  - 47-ITAD-COVERAGE.json redacted sweep summary
  - real ITAD response fixtures under src/backend/storeSearch/__tests__/fixtures/itad/
affects: [47-06, 47-07]
key-files:
  created:
    - src/backend/storeSearch/itadCoverage.ts
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
  - "ITAD_SEARCH_RESULTS_PARAM = 'results', graded SPEC (official ITAD OpenAPI: number 1..100, default 20, no `limit` param); the sweep's resultsParam stays null in 47-ITAD-COVERAGE.json as the raw measurement"
requirements-completed: [PRICE-01, PRICE-02]
commits: 3
plan_head_before: 01d78e5e34b45fb4d183fc40dc7d01c93defddac
plan_head_after: 7657d6bf5
completed: 2026-11-17
---

# Phase 47 Plan 01: ITAD coverage sweep Summary

The sweep script was written and run by the operator against ITAD with the app API key; its key-free output and response fixtures are committed, and the measured values are locked in `src/backend/storeSearch/itadCoverage.ts`. The one value the sweep could not measure, the search results param, is locked from the official ITAD OpenAPI spec and graded SPEC.

## Status

All three tasks complete.

## Commits

- `fd2477a83`: `meta/measureItadCoverage.ts` and its pure-helper tests (Task 1)
- `92f388a63`: `47-ITAD-COVERAGE.json` and the eight `itad/*.json` fixtures (Task 2 outputs)
- `7657d6bf5`: `src/backend/storeSearch/itadCoverage.ts` (Task 3)

`commits: 3` is counted by plan scope, not `rev-list ${plan_head_before}..HEAD` (that range spans unrelated main-branch commits made between the two plan commits). `plan_head_before` is the parent of `fd2477a83`.

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

## Search results param: SPEC, not MEASURED (D-09)

`/games/search/v1` returned 20 rows for BOTH `results=20` and `limit=20`, so the sweep could not tell which param ITAD honours; `47-ITAD-COVERAGE.json` keeps the raw measurement (`resultsParam: null`, `searchCounts: {results: 20, limit: 20}`) and was not edited. Resolution, graded **SPEC**: the official ITAD OpenAPI spec (docs.isthereanydeal.com, game search; read via a search-index snippet because the live page returns 403 to automated fetch) defines `results` as a number 1..100, default 20, "maximum number of results returned", and has no `limit` param. That is consistent with the sweep: 20 is the default and the unknown `limit` was ignored. An attempted operator re-probe with a count of 5 was inconclusive (403: the operator shell held the wrong credential), so this stays SPEC until a live probe with a non-default count upgrades it. `ITAD_SEARCH_RESULTS_PARAM = 'results'`; `ITAD_SEARCH_RESULT_COUNT = 20`.

## Locked constants (src/backend/storeSearch/itadCoverage.ts)

`ITAD_PRICED_COUNTRIES` (the 32 above, includes US), `ITAD_FALLBACK_COUNTRY = 'US'`, `ITAD_SHOP_ID_STEAM = '61'`, `ITAD_SHOP_ID_GOG = '35'`, `ITAD_SHOP_ID_EPIC = '16'`, `ITAD_SEARCH_RESULTS_PARAM = 'results'` (SPEC), `ITAD_SEARCH_RESULT_COUNT = 20`, `ITAD_LOOKUP_BATCH_SIZE = 200`, `ITAD_PRICE_AMOUNT_SOURCE = 'amount'`, `ITAD_AUTH_STYLE = 'query:key'`. Plans 47-05/47-06 cite these.

## RESEARCH "what result changes the plan" rows that fired

- Row 1 (most REGION_OPTIONS countries return own currency): fired, plan as written.
- Row 2 (silent USD fallback identical to the US run): fired for IL RU UA MD MX ZA SG HK SA AE (status 200, identicalToUS true). Those are absent from `ITAD_PRICED_COUNTRIES`, so the UI can say the region is not priced and show the USD note (Pitfall 5).
- Row 3 (4xx countries): not fired, every country returned 200.
- Row 4 (`amountInt` disagrees with `amount`): not fired, `amountSource = 'amount'`.
- Row 5 (lookup ceiling below library size): not fired, ceiling 1000; the adapter still chunks at 200.
- Row 6 (Epic id differs from the assumed 16): not fired, measured id is 16 (by title "Epic Game Store").
- Row 7 (429 on the sweep): not fired.

## Redaction and format checks

- Grep of the committed JSON and fixtures for `key=`, `"key":`, `apikey`, `api_key` printed nothing; operator also confirmed the `grep -F` of the live key printed nothing.
- `src/backend/storeSearch/__tests__/fixtures` is not prettier-ignored; `npx prettier --check` over the nine written JSON paths passed with no reformat needed, so file content is exactly what the script wrote.

## Process note: first sweep run used the wrong credential

The operator's first run used the ITAD app's OAuth client credential instead of its API Key and got 403 "Invalid or expired api key" on every keyed call. The re-run with the API Key succeeded (all output above is from that run). The repo secret `ITAD_API_KEY` was re-set with the correct API Key; that is Plan 47-02's concern and is recorded here only as context.

## Deviations from Plan

None. Task 3's STOP rule (null results param) was resolved by the orchestrator with the SPEC-graded value above before Task 3 ran.

## Known Stubs

None.

## Threat Flags

None. No new network surface in the app; the sweep is a standalone meta script.

## Self-Check: PASSED

- 47-ITAD-COVERAGE.json and all eight fixtures present and non-empty (Task 2 verify passed).
- itadCoverage.ts present; `pnpm codecheck` clean; scoped `prettier --check` over itadCoverage.ts and the eight fixtures clean; key grep over fixtures and summary JSON returned 0 files.
- Commits `fd2477a83`, `92f388a63` and `7657d6bf5` exist on main.
