---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 07
subsystem: backend/storeSearch
tags: [itad, handlers, store-search, cheapshark-removal, di]
requires: [47-06]
provides:
  - handleSearchStores(deps, query, country?), handleGetStoreSearchDeals(deps, gameId, country?), handleGetItadSteamGids(deps, appIds) on the ITAD adapter
  - normalizeCountry (garbled or missing country prices as US)
affects: [47-08]
tech-stack:
  added: []
  patterns: [log-and-rethrow D-14 contract kept over a marker-carrying error]
key-files:
  created: []
  modified:
    - src/backend/storeSearch/handlers.ts
    - src/backend/storeSearch/__tests__/handlers.test.ts
    - src/backend/miscRuntime.ts
    - src/backend/testUtils/testMiscRuntime.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/services/types.ts
    - src/backend/__tests__/diPhaseGates.test.ts
    - src/backend/sidecar/__tests__/electronReachLedger.test.ts
    - meta/backendDiCeilings/storeSearch.json
    - src/common/types/storeSearch.ts
  deleted:
    - src/backend/storeSearch/cheapshark.ts
    - src/backend/storeSearch/__tests__/cheapshark.test.ts
key-decisions:
  - 'The itad.ts path replaces cheapshark.ts in both module-path pins (diPhaseGates OWNED_66_4 and electronReachLedger requiredModules): the measured walk confirms itad.ts is census-clean and reaches no electron edge, so the pin stays a live anti-regression guard rather than being dropped'
requirements-completed: [PRICE-01, PRICE-02, PRICE-03]
duration: 15min
completed: 2026-11-17
status: complete
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: ac799a6c8b84fdcf2d8977864f499f8ce9657593
plan_head_after: 326ae2922c9cdc7654209a13d0f192629691cd70
---

# Phase 47 Plan 07: Handlers on ITAD, CheapShark deleted Summary

The store-search handlers now run on the ITAD adapter with the D-14 log-and-rethrow contract intact (the `[storeSearch:<code>]` marker survives the rethrow), a country arg that falls back to US instead of failing, and a new `handleGetItadSteamGids`; cheapshark.ts, its test, the `storeMap` misc-runtime slot and the `StoreSearchStore` type are gone.

## Commits

- 4c58de83c: handlers on ITAD (`feat(47-07)`), handlers.test.ts rewritten
- 326ae2922: delete CheapShark module/test/slot/type, repoint pins (`refactor(47-07)`)

## What was built

- `handlers.ts` imports only `./itad` and the logger. `normalizeCountry` accepts only `/^[A-Z]{2}$/` and otherwise returns `'US'`. `handleGetStoreSearchStoreMap` is deleted. All three handlers keep the try / `logError('<channel> handler failed: ...')` / rethrow shape (StoreSearchError messages carry no URL or key).
- `handlers.test.ts`: still exactly 2 `jest.mock` calls (`../itad`, logger); deps typed `ItadDeps` with a real `createItadGate()`; cases for country pass-through and the US fallback (`undefined`, `null`, `'gb'`, `'USA'`, `''`), rejection rethrown with the `[storeSearch:` marker asserted, gid lookup pass-through and rethrow; the single-source-of-truth gate now checks `getItadSteamGids handler failed:`.
- `miscRuntime.ts` has no `storeMap`; comments in testMiscRuntime.ts, bootstrap.ts and services/types.ts say "ITAD rate-limit gate". `meta/backendDiCeilings/storeSearch.json` keeps handlers.test.ts at 2 and itad.test.ts at 2.

## Deviations from Plan

None - plan executed as written. One judgment call recorded under key-decisions (the electronReachLedger entry was replaced with itad.ts rather than removed, since the walk shows itad.ts absent from the reach set, which is what that list asserts).

## Verification (all run)

- Task 1: `pnpm exec jest --selectProjects Backend --runTestsByPath handlers.test.ts itad.test.ts`: exit 0 (46 tests); scoped `npx prettier --check` on both files (`--file-info` ignored:false): exit 0; greps: `jest.mock` x2, `cheapshark` 0 in handlers.ts
- Task 2: Backend jest (handlers, diPhaseGates, electronReachLedger, moduleStateCensus): exit 0 (192 tests); Meta jest `backendDiCeilings.test.ts`: exit 0 (132 tests); scoped prettier over all 8 written paths (all `ignored:false`): exit 0
- Acceptance greps: cheapshark files gone; `storeMap` in miscRuntime.ts 0; `interface StoreSearchStore` 0; remaining `cheapshark` mentions in src/backend: steamAppIdResolver.ts (prose), enrichmentFlowRegistration.ts and enrichmentFlows.test.ts (47-08), itadCoverage.ts (a 47-01 file path in a comment, harmless)

## Expected-red checks (intermediate state, per plan)

`pnpm codecheck` is red by design until 47-08. Errors, all at the registration seam:

- `src/backend/sidecar/enrichmentFlowRegistration.ts`: imports removed `handleGetStoreSearchStoreMap` (173); `MiscRuntimeSlice<'storeMap'>` (189); `EnrichmentFlowDeps` not assignable to `ItadDeps` at 330 and 336 because its `stores` Pick lacks `storeSearch`
- `src/backend/sidecar/handlers.ts:292`: `storeMap` missing from `Pick<MiscRuntime,'storeMap'>` (derives from the enrichment deps type)
- `src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts` (176, 374): deps not assignable to `EnrichmentFlowDeps` (same cause)
- `src/common/types/ipc/enrichment.ts:14`: `StoreSearchStore` no longer exported

The sidecar enrichment suites (enrichmentFlows.test.ts etc.) are not run and expected red. No compat shim was added.

## Notes for 47-08

- `EnrichmentFlowDeps` needs `miscRuntime: MiscRuntimeSlice<'itadGate'>` and `'storeSearch'` added to its `stores` Pick (the real `Stores.storeSearch.itadPricesStore` / `itadSteamGidsStore` go in structurally; assignability of real CacheStore to ItadDeps.stores is then confirmed by codecheck). Pass `deps` straight to the three handlers.
- Also touches `src/backend/sidecar/handlers.ts:292` and `runnerSliceRegistration.test.ts` deps fixtures (both derive from the enrichment deps type); preload/schema/IPC types for `getStoreSearchStoreMap` and `StoreSearchStore` still to remove, plus `enrichmentFlows.test.ts` store-map cases.
- New handler signatures: `handleSearchStores(deps, query, country?)`, `handleGetStoreSearchDeals(deps, gameId, country?)`, `handleGetItadSteamGids(deps, appIds)`. `normalizeCountry` is exported from handlers.ts if the registration layer wants it, but the handlers already normalise.

## Known Stubs

None.

## Threat Flags

None. T-47-28 (marker survives rethrow, asserted in handlers.test.ts) and T-47-29 (D-14 log-and-rethrow kept verbatim, tested) mitigated.

## Self-Check: PASSED

- FOUND commits: 4c58de83c, 326ae2922
- cheapshark.ts and cheapshark.test.ts absent; handlers.ts, handlers.test.ts present
