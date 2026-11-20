---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 09
subsystem: ui/storeSearch
tags: [itad, store-search, region, owned-badge, error-states, i18n]
requires: [47-03, 47-08]
provides:
  - country-aware useDebouncedStoreSearch(countryCode) returning pricedCountry and errorCode
  - useOwnedSteamGids hook (Steam library + waiting-key appids -> Map<gid, appId>)
  - Store Search container with region caption, region-fallback note, three error variants and the gid badge join
affects: [47-10, 47-11]
tech-stack:
  added: []
  patterns: [stable-key effect (one backend call per distinct appid set), error-code classification from IPC marker strings]
key-files:
  created:
    - src/frontend/screens/StoreSearch/hooks/useOwnedSteamGids.ts
    - src/frontend/screens/StoreSearch/__tests__/useOwnedSteamGids.test.ts
  modified:
    - src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts
    - src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts
    - src/frontend/screens/StoreSearch/index.tsx
    - src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx
    - src/frontend/screens/StoreSearch/index.css
    - public/locales/en/translation.json
    - meta/backendDiCeilings/frontend-screens-other.json
    - src/backend/storeSearch/itadCoverage.ts
key-decisions:
  - 'Imported getLocaleSettings/getStoredRegionOverride straight from frontend/screens/Discounts/helpers; pnpm lint:src raised no cross-screen import error, so no hoist to src/frontend/helpers/regionSettings.ts was needed and Discounts is untouched'
  - 'Region-note tint is rgba(44, 234, 199, 0.1): the same hard-coded-rgba construction the danger banner uses, computed from --status-info (#2ceac7)'
  - 'knip-baseline line for StoreSearch.getItadSteamGids is KEPT: knip does not count window.api.* renderer calls as a caller (searchStores/getStoreSearchDeals stay baselined the same way), so removing it makes find-deadcode fail'
requirements-completed: [PRICE-01, PRICE-02, PRICE-03]
duration: 35min
completed: 2026-11-17
status: complete
actuals:
  tokens: 16000
  tasks: 2
  commits: 3
plan_head_before: 73a66d442da0face91f9c58c27eee4c727cf516b
plan_head_after: 3e47ef38374d326cec6c90de68a63e85d0276452
---

# Phase 47 Plan 09: Store Search container wiring for ITAD Summary

The Store Search screen now sends the user's country with every search, always shows which region is priced, explains a US fallback, tells rate-limited and not-configured failures apart, and resolves "Owned on Steam" and "Key available" through ITAD's gid -> appid mapping.

## Commits

- ad4fd1503: country-aware search hook + `useOwnedSteamGids` hook + tests + ceiling entry (`feat(47-09)`)
- f5ea3650c: `ITAD_AUTH_STYLE` unexported and its literal annotation dropped (`fix(47-09)`, Rule 3, see Deviations)
- 3e47ef383: container, CSS, en strings, screen tests (`feat(47-09)`)

## What was built

- `useDebouncedStoreSearch(countryCode)`: calls `searchStores(query, countryCode)`; `countryCode` is a dep of the fetch effect so a region change re-runs the committed search exactly once (generation-counter cleanup kept); returns `pricedCountry` and `errorCode` (`storeSearchErrorCode(err)` in the catch, cleared on success and when the query drops below 3 chars). Raw error still only goes to `logError`.
- `useOwnedSteamGids(steamLibrary, keysWaiting)`: appid set = library `app_name` + waiting-key `steamAppId`, digits only (1-10), `'0'` dropped, deduped, sorted, joined into a stable string key; one `getItadSteamGids` call per distinct key, `cancelled` flag in cleanup; resolved record inverted to `Map<gid, appId>`; a rejection logs via `logError` and yields an empty Map (so `steamAppId` stays undefined and no Steam badge can be wrong, T-47-32).
- `StoreSearch/index.tsx`: `countryCode` from `getLocaleSettings(toShippedLanguage(i18n.language), getStoredRegionOverride())`; always-visible `storeSearchScreen__region` caption via `formatCountryName`; `role="note"` fallback note when `status === 'results'` and `pricedCountry !== countryCode`; error banner now `role="alert"` with rateLimited / notConfigured / provider copy, Retry hidden for notConfigured; `resolveStoreSearchBadges({ ...result, steamAppId: gidToAppId.get(result.gameId) }, ...)` with `gidToAppId` in the memo deps. `badges.ts` untouched.
- `index.css`: `__region` and `__regionNote` rules using semantic tokens only.
- `translation.json` (en): `storeSearch.region`, `regionFallback`, `error.rateLimited`, `error.notConfigured`.
- Tests: hook tests for country send / pricedCountry / one re-fire on country change / errorCode classification and reset / no raw error in state; owned-gid hook tests for digit filter, dedupe, sort, inversion, no repeat call for same appids, one more call for a changed library, rejection and empty set; screen tests for caption, country sent, fallback note present/absent, three error variants, gid-mapped Owned on Steam, failed lookup showing no Steam badge, waiting-key appid mapped to the gid yielding Key available. The existing D-05 ownership test now seeds `getItadSteamGids` (it previously relied on the result carrying a steamAppId).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ITAD_AUTH_STYLE: knip finding and lint:src error**
- **Found during:** Task 2 verify (`pnpm lint:src` exited 1; `pnpm find-deadcode` flagged it, as the orchestrator warned)
- **Issue:** `export const ITAD_AUTH_STYLE: 'query:key' = 'query:key'` in `itadCoverage.ts` had no importer (knip) and tripped `@typescript-eslint/prefer-as-const` (error, so `pnpm lint:src` failed).
- **Fix:** dropped the `export` and the literal annotation; kept as a documented measured-value constant with a scoped `eslint-disable-next-line no-unused-vars`.
- **Files modified:** `src/backend/storeSearch/itadCoverage.ts`
- **Commit:** f5ea3650c

**2. [Plan correction] knip-baseline line not deleted**
- The orchestrator note and 47-08 said to delete the `StoreSearch.getItadSteamGids` baseline line once a renderer caller exists. I deleted it and `pnpm find-deadcode` then reported it as a new finding: knip does not treat `window.api.*` as a caller (same reason `searchStores` and `getStoreSearchDeals` stay baselined). Restored; `meta/knip-baseline.txt` is unchanged.

### Test-harness note
- `useOwnedSteamGids.test.ts` needs its own `jest.mock('react', ...)` (the hook uses `useMemo` and the existing hook harness has none); added to `meta/backendDiCeilings/frontend-screens-other.json` with count 1. `StoreSearchScreen.test.tsx` stays at 7 mocks.

## Verification (all run)

- `pnpm exec jest --selectProjects Frontend --runTestsByPath` over the 5 StoreSearch test files: exit 0, 5 suites, 53 tests
- `pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/backendDiCeilings.test.ts`: exit 0, 132 tests
- `pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/hardcodedStringGate.test.ts`: exit 0, 176 tests
- `pnpm i18n-churn-guard`: exit 0 ("clean") after the commits. It diffs the working tree against HEAD, so it reports the hand-edited `translation.json` as upstream churn until that edit is committed; it passes once committed.
- `pnpm codecheck`: exit 0; `pnpm lint:src`: exit 0 (warnings only, all pre-existing)
- Scoped `npx prettier --check` over every written `.ts`/`.tsx`/`.css`/`.json` path (each confirmed `ignored:false` via `--file-info`): exit 0. `translation.json` is prettier-ignored by design.
- Acceptance greps: `steamAppId: gidToAppId.get(result.gameId)` 1; `role="note"` 1; en catalog keys 5 (>= 4); `badges.ts` diff empty.
- `pnpm find-deadcode`: exit 1 on 3 findings, none from this phase (BoundedOutputCapture, NativePortDataStyle, NativePortMac); the phase-47 `ITAD_AUTH_STYLE` finding is cleared.

## Deferred / out-of-scope issues

- Full Frontend jest run: `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` "render-site census" fails (34 expected, 37 found in GameSubMenu / is-link sites). Not touched by this plan (no GameSubMenu or NavShell change); left alone.
- Pre-existing, as the orchestrator listed: `storeKinds.test.ts`, `createStores.test.ts`, `acfUpdateReplay.test.ts` (Backend project, not run here).

## Notes for 47-10 / 47-11

- `useDebouncedStoreSearch` returns `pricedCountry` and `errorCode`; `StoreSearchResult.cachedAt` and `StoreSearchDeal.cachedAt` are untouched by this plan (row/breakdown cached-at lines are 47-10).
- `window.api.getItadSteamGids` now has a renderer caller but its knip baseline line must STAY (knip ignores `window.api` calls).
- A new i18n string in `translation.json` makes `pnpm i18n-churn-guard` fail until committed; run it after committing, not before.
- Frontend jest `--selectProjects Frontend <path>` runs the whole project; use `--runTestsByPath`.

## Known Stubs

None.

## Threat Flags

None. T-47-30 (country arg normalised by the sidecar, untouched), T-47-31 (only the classified code selects a fixed `t()` string; raw error goes to `logError`, asserted in the hook test), T-47-32 (failed lookup shows no Steam badge, tested) and T-47-33 (one lookup call per distinct appid set, tested) are mitigated.

## Self-Check: PASSED

- FOUND commits: ad4fd1503, f5ea3650c, 3e47ef383 (`git merge-base --is-ancestor` against HEAD)
- FOUND files: `useOwnedSteamGids.ts`, `useOwnedSteamGids.test.ts`
