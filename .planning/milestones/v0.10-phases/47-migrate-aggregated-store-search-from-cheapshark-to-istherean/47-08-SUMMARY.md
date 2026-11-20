---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 08
subsystem: ipc/storeSearch
tags: [itad, ipc, zod, preload, rust-allow-list, store-search]
requires: [47-07]
provides:
  - searchStores(query, country?) -> StoreSearchResponse, getStoreSearchDeals(gid, country?), new keyless getItadSteamGids(appIds) over IPC
  - generated Rust allow-list without getStoreSearchStoreMap and with getItadSteamGids
  - renderer reading the StoreSearchResponse envelope (results + pricedCountry)
affects: [47-09, 47-11]
tech-stack:
  added: []
  patterns: [lenient country arg (handler normalises to US), bounded id arrays at the IPC boundary]
key-files:
  created: []
  modified:
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/sidecar/gameDetailsFlowRegistration.ts
    - src/backend/storeSearch/handlers.ts
    - src/common/types/ipc/enrichment.ts
    - src/preload/api/storeSearch.ts
    - src-tauri/src/ipc_contract.rs
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
    - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/enrichment.test.ts
    - meta/knip-baseline.txt
    - src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts
    - src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts
    - src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx
key-decisions:
  - 'getItadSteamGids caps at 5000 appids per call (plan value; RESEARCH said 1000) so large Steam libraries keep their badges; digits-only, 1-10 chars each'
  - 'getStoreSearchDeals gid schema is /^[0-9a-fA-F-]{1,64}$/ (hex and hyphen only), the adapter then enforces full UUID shape'
  - 'normalizeCountry un-exported: knip flagged it as a new unused export after 47-07 made it public; only handlers.ts calls it'
requirements-completed: [PRICE-01, PRICE-02, PRICE-03]
duration: 25min
completed: 2026-11-17
status: complete
actuals:
  tokens: 14000
  tasks: 2
  commits: 3
plan_head_before: 97754478555238ab3e6ee830de44224b844731f3
plan_head_after: a8084aa2f610597f7d455557c2033a649481f686
---

# Phase 47 Plan 08: IPC half of the CheapShark to ITAD switch Summary

The renderer can now request localized ITAD search results, per-game deals and a keyless Steam appid to ITAD gid map over IPC; `getStoreSearchStoreMap` is gone everywhere, the Rust allow-list is regenerated, and `pnpm codecheck` is green again (it was red by design after 47-07).

## Commits

- 3064f7f84: sidecar registration, zod schemas, preload, regenerated contract, channel pins, knip baseline (`feat(47-08)`)
- a8084aa2f: renderer reads `response.results` from the new envelope (`feat(47-08)`)

`commits: 3` is the measured `rev-list` count from the ledger base. One of the three, `e1847e45f` (`docs(todo): record macOS live gate pass ...`), is not part of this plan: another process committed to `main` between my two task commits. The plan's own commits are 2.

## What was built

- `enrichmentFlowRegistration.ts`: `EnrichmentFlowDeps` carries `MiscRuntimeSlice<'itadGate'>` and `'storeSearch'` in the `stores` Pick; `searchStores` and `getStoreSearchDeals` forward the optional 2nd country arg; new `getItadSteamGids` handler; store-map registration deleted; module doc and the `gameDetailsFlowRegistration.ts` comment name the new trio. Codecheck confirmed the real `Stores.storeSearch` cache stores are structurally assignable to `ItadDeps.stores` with no cast.
- `enrichment.ts`: `countryArg = optionalArg(z.string().max(16))` (lenient on purpose, D3); `searchStores` and `getStoreSearchDeals` tuples gain it; gid regex on deals; `getItadSteamGids` bounded digits-only array (max 5000); returns `Promise<StoreSearchResponse>` / `Promise<Record<string, string>>`; `StoreSearchStore` import and store-map entries removed.
- `preload/api/storeSearch.ts`: `getItadSteamGids` invoker replaces `getStoreSearchStoreMap`.
- `pnpm gen:ipc-contract` regenerated `src-tauri/src/ipc_contract.rs` (never hand-edited); `pnpm check:ipc-contract` exit 0.
- Pins: channel census in `runnerSliceRegistration.test.ts`; `ipcSchemas/enrichment.test.ts` valid/invalid tables per the plan; `enrichmentFlows.test.ts` now scripts ITAD (`axios.get` search, `axios.post` prices and keyless lookup), sets `GAMELIB_ITAD_API_KEY` per describe, asserts `[storeSearch:provider]` and `[storeSearch:notConfigured]` ERROR frames, a no-key/no-URL leak probe (T-47-28b), the `getItadSteamGids` happy path, and swaps the all-channels census rows. No `jest.mock` added; `rendererAllowList.test.ts` needed no change (it reads the contract, not literal names).
- `useDebouncedStoreSearch.ts` takes `response.results`; no other behaviour change (country arg, `pricedCountry` display and error-code handling are 47-09).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] knip ratchet: normalizeCountry**
- **Found during:** Task 1 (`pnpm find-deadcode`)
- **Issue:** 47-07 exported `normalizeCountry` from `handlers.ts` with no importer; knip reported a new unused export.
- **Fix:** dropped the `export` (only `handlers.ts` calls it).
- **Files modified:** `src/backend/storeSearch/handlers.ts`
- **Commit:** 3064f7f84

**2. [Rule 3 - Blocking] knip baseline for the new preload export**
- **Issue:** `StoreSearch.getItadSteamGids` has no renderer caller until 47-09, same as its siblings in the baseline.
- **Fix:** added its baseline line (and removed the deleted `getStoreSearchStoreMap` line). **47-09 should delete the line once a renderer caller imports it.**

**3. [Rule 1 - Test hygiene] all-channels census arg**
- The `deal-x` arg for `getStoreSearchDeals` in the census would now fail the gid regex before reaching the handler; replaced with a UUID.

## Verification (all run)

- `pnpm gen:ipc-contract` and `pnpm check:ipc-contract`: exit 0 ("up to date")
- `pnpm exec jest --selectProjects Backend --runTestsByPath` over enrichmentFlows, runnerSliceRegistration, ipcSchemas/enrichment, rendererAllowList: exit 0, 4 suites, 229 tests. Note: the plan's `--selectProjects Backend <paths>` form swallows the paths as project names and runs the whole Backend project; `--runTestsByPath` is needed.
- `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/screens/StoreSearch/__tests__/*.test.ts*`: exit 0, 4 suites, 37 tests
- `pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/backendDiCeilings.test.ts`: exit 0, 132 tests
- Scoped `npx prettier --check` over every written `.ts`/`.tsx` path (all `ignored:false`): exit 0 after each task; the `.rs` file is generator-owned
- `pnpm codecheck`: exit 0 (tsc and tsc -p tsconfig.meta.json)
- Acceptance greps: `getStoreSearchStoreMap` absent from `src`, `src-tauri/src`, `meta`; `getItadSteamGids` in `ipc_contract.rs`; `MiscRuntimeSlice<'itadGate'>` once in the registration

## Deferred / out-of-scope issues

- `pnpm find-deadcode` exits 1 on four findings that are not from this plan: `ITAD_AUTH_STYLE` in `src/backend/storeSearch/itadCoverage.ts` (an unused exported constant, phase-47 file; the owner of 47-11 or a follow-up should drop the export or tag it `@public`), `BoundedOutputCapture` (`signInProbe/classify.ts`), `NativePortDataStyle` and `NativePortMac` (`common/nativePortCatalogue.ts`). All four findings from this plan's own surface are cleared.
- A whole-Backend jest run (triggered by the mis-ordered plan verify command) showed 3 failures in files this plan does not touch: `storeKinds.test.ts`, `acfUpdateReplay.test.ts` (no oracle case `acfUpdate/readLocalConfigBetaKey/playtime/10`), `createStores.test.ts` (unlisted `steam_direct_launch_verdict` cache store). Pre-existing, left alone.

## Notes for 47-09 / 47-11

- Renderer: `window.api.searchStores(query, country?)` now returns `{ results, pricedCountry }`; the hook ignores `pricedCountry` and passes no country. Error text for a rejected search carries `[storeSearch:provider|notConfigured|rateLimited]` (marker constants in `common/types/storeSearch.ts`).
- `window.api.getItadSteamGids(appIds: string[])` exists in preload and the schema (max 5000 per call); remove its knip-baseline line when a caller lands.
- Backend jest `--selectProjects` takes paths only with `--runTestsByPath`.

## Known Stubs

None.

## Threat Flags

None. T-47-25 (hex/hyphen gid regex), T-47-26 (digits-only, max 5000), T-47-27 (regenerated allow-list, removed channel absent) and T-47-28b (error frame carries marker only, asserted) are mitigated and tested.

## Self-Check: PASSED

- FOUND commits: 3064f7f84, a8084aa2f
- `git grep getStoreSearchStoreMap` over src, src-tauri/src, meta: no matches
