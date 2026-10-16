---
phase: 20-aggregated-store-search-cheapshark
verified: 2026-07-15T18:45:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 20: Aggregated Store Search (CheapShark) Verification Report

**Phase Goal:** From a new left-sidebar entry, search a title once and see what it costs across every store — with "you already own this on GOG/Steam/Epic/Amazon/Humble" badges that no price-comparison website can show. Ends the "open six tabs to find the cheapest key" problem.
**Verified:** 2026-07-15T18:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | New sidebar entry + `/store-search` route exists as sibling of `/discounts` | ✓ VERIFIED | `SidebarLinks/index.tsx:205-210` — `SidebarItem url="/store-search"` immediately after the `/discounts` item, no conditional gate, `faMagnifyingGlassDollar` icon. `App.tsx:163-166` registers `{ path: 'store-search', lazy: makeLazyFunc(import('./screens/StoreSearch')) }` immediately after the `discounts` route. |
| 2 | CheapShark adapter + 3 IPC channels registered; `dealID` interpolated verbatim (no encodeURIComponent) with a regression test asserting no `%25` | ✓ VERIFIED | `src/backend/storeSearch/cheapshark.ts:80-82` `buildRedirectUrl` uses a raw template literal; `grep -n "encodeURIComponent\|URLSearchParams" cheapshark.ts` returns nothing. `src/backend/storeSearch/index.ts` registers `searchStores`/`getStoreSearchDeals`/`getStoreSearchStoreMap` via `addHandler`, wired in `main.ts:24` (`import 'backend/storeSearch'`) and exposed via `preload/api/storeSearch.ts` + `preload/api/index.ts:11,24`. `cheapshark.test.ts:24-35` asserts `url.not.toContain('%25')` for a dealID containing `%2F`/`%3D`. |
| 3 | `resolveStoreSearchBadges()` added to `badges.ts` WITHOUT modifying `resolveDiscountBadge()`; Steam exact join only; GOG/Epic/Amazon fuzzy via shared `titleMatch.ts` | ✓ VERIFIED | `badges.ts:147-200` — Steam branch is `libraries.steam.some((g) => g.app_name === result.steamAppId)`, no `fuzzyMatch` call in that branch. GOG/legendary/nile branch iterates fixed order and calls `fuzzyMatch` from `../matching/titleMatch` (imported line 2). `resolveDiscountBadge`/`buildDiscountBadgeMaps` (lines 36-106) are untouched from the Phase 15 shape; `badges.test.ts` (17 tests, Phase 15 suite) still passes. |
| 4 | USD label travels with every price; USD-only contained in the adapter (no `'USD'` literal leaking into shared types) | ✓ VERIFIED | `formatUsdPrice(amount, currencyCode)` returns single string `` `$${amount} ${currencyCode}` `` (`helpers.ts:19-21`), rendered as one text node in `StoreSearchRow`/`StoreSearchBreakdown`. `grep -c "'USD'" src/common/types/storeSearch.ts` = 0; `currencyCode: string` (never a literal union) on `StoreSearchResult`/`StoreSearchDeal`. `SEARCH_CURRENCY = 'USD'` is the single module-level constant in `cheapshark.ts:28`, applied only there. |
| 5 | Debounce ~400ms, min 3 chars, generation-counter cancel; three distinct fail-soft states | ✓ VERIFIED | `useDebouncedStoreSearch.ts`: `DEBOUNCE_MS = 400`, `MIN_QUERY_LENGTH = 3`, `generationRef` discards stale resolve/reject (lines 90-114). `StoreSearch/index.tsx:83-121` renders three structurally distinct blocks: `.storeSearchScreen__errorBanner` (retry button, SearchBar stays enabled), `.storeSearchScreen__message--prompt` (icon), `.storeSearchScreen__message` no-icon empty state. |
| 6 | Remaster fix: `titleMatch.ts` no longer strips 'remastered'; differentiator guard; pinned unit test; Phase 15 `resolveDiscountBadge`/Humble dedup remain green | ✓ VERIFIED | `titleMatch.ts:23-35` — `'remastered'` absent from `EDITION_SUFFIXES`. `PRODUCT_VARIANT_KEYWORDS = ['remaster','remake']` (line 58) + `isRemasterFalsePositiveRisk()` (lines 128-135) OR'd into `fuzzyMatch()` (lines 137-146). `titleMatch.test.ts:145-146` pins `fuzzyMatch('Alan Wake','Alan Wake Remastered') === false` and `...Remake === false`; line 150 confirms an exact remaster-vs-remaster title still matches. Full backend suite (`dedup.test.ts`, `storeSearchBadges.test.ts`, `badges.test.ts`) re-ran green after the fix (confirmed live in this verification run: 557/557 targeted, 1194/1194 full suite). |
| 7 | All 8 STORESEARCH req IDs traced to plans + REQUIREMENTS.md | ✓ VERIFIED | REQUIREMENTS.md lines 138-145 mark STORESEARCH-01..08 `[x]` and lines 222-229 map all 8 to "Phase 20 / Complete". Plan frontmatter `requirements:` fields across 20-01..20-07 collectively cover all 8 IDs (cross-referenced below). No orphans found. |
| 8 | Live human UAT (Task 2 of 20-07) approved; three-state, ownership, buy-handoff, USD labels confirmed live against real CheapShark API | ✓ VERIFIED (human-verified, per task instructions) | `20-VALIDATION.md` Manual-Only Verifications table + `20-07-SUMMARY.md`: "UAT: approved 2026-07-15. All nine live checks passed... One defect was found and fixed mid-checkpoint... User re-verified live and gave final approval." Sign-off checklist fully checked, `nyquist_compliant: true`, `wave_0_complete: true`. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/matching/titleMatch.ts` | Shared pure fuzzy matcher, no backend/store types | ✓ VERIFIED | Exports `normalizeTitle`, `titleSimilarity`, `isDlcFalsePositiveRisk`, `isRemasterFalsePositiveRisk`, `fuzzyMatch`, `HUMBLE_FUZZY_MATCH_THRESHOLD = 0.85`. No `backend/`, `HumbleKey`, or `GameInfo` imports. |
| `src/backend/humble/dedup.ts` | Consumes shared matcher, re-exports for compat | ✓ VERIFIED | Lines 3-8 import from `common/matching/titleMatch`; lines 33-38 re-export; `recomputeOwnership()` (line 58) unchanged/present. |
| `src/backend/humble/constants.ts` | Single-sourced threshold | ✓ VERIFIED | Re-exports `HUMBLE_FUZZY_MATCH_THRESHOLD` (per 20-01-SUMMARY; not independently re-read but grep confirmed no second literal `= 0.85` and dedup tests pass). |
| `src/common/types/storeSearch.ts` | Provider-neutral types w/ currencyCode | ✓ VERIFIED | `StoreSearchResult`/`StoreSearchDeal`/`StoreSearchStore`, all with `currencyCode: string`. |
| `src/common/discounts/storeMapping.ts` | CheapShark storeID→Runner map + resolver | ✓ VERIFIED | `CHEAPSHARK_STORE_TO_RUNNER` maps 1→steam, 7→gog, 25→legendary, 4→nile; `resolveRunner()` helper. Unit-tested (`storeMapping.test.ts`, passing). |
| `src/common/types/ipc.ts` | 3 channel signatures declared | ✓ VERIFIED (via test evidence) | `preload/api/storeSearch.ts` compiles against `AsyncIPCFunctions` (`tsc --noEmit` exits 0), confirming the declarations exist and type-check. |
| `src/common/discounts/badges.ts` | `resolveStoreSearchBadges()` + `StoreOwnershipMatch`, `resolveDiscountBadge` untouched | ✓ VERIFIED | Full file read; see Truth 3. |
| `src/backend/storeSearch/cheapshark.ts` | HTTP adapter, verbatim redirect builder | ✓ VERIFIED | Full file read; see Truth 2. |
| `src/backend/storeSearch/index.ts` | 3 addHandler registrations, throw-on-failure | ✓ VERIFIED | All three handlers try/catch/logError/throw, matching discounts convention. |
| `src/preload/api/storeSearch.ts` | 3 makeHandlerInvoker bridges | ✓ VERIFIED | All three exports present, aggregated into `window.api` via `preload/api/index.ts`. |
| `src/frontend/screens/StoreSearch/helpers.ts` | `formatUsdPrice` + badge-label helper | ✓ VERIFIED | Both present, pure, unit-tested. |
| `StoreSearchRow/index.tsx`, `StoreSearchBreakdown/index.tsx` | Collapsed row + lazy breakdown + buy handoff | ✓ VERIFIED | Badge coexistence (`owned` + `keyAvailable` independent spans, not XOR — line 46-54 of StoreSearchRow); breakdown calls `window.api.getStoreSearchDeals` once on mount, `window.api.openExternalUrl(deal.buyUrl)` on click/Enter/Space; collapses (unmounts) on fetch failure via `onFetchFailed`. |
| `src/frontend/screens/StoreSearch/index.tsx` | Container: debounce + badge-once + 3-state | ✓ VERIFIED | Full file read; see Truths 1, 3, 5. `sideloadedLibrary`/`zoom` never destructured. |
| `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts` | Debounce/min-3/generation-cancel hook | ✓ VERIFIED | Full file read; see Truth 5. |
| `public/locales/en/translation.json` | `storeSearch.*` i18n keys | ✓ VERIFIED (via test) | `StoreSearchScreen.test.tsx`/`StoreSearchRow.test.tsx` pass, exercising the real `t()` calls; JSON parse acceptance criterion from 20-06 plan. |
| `.planning/.../20-VALIDATION.md` | Completed + signed off | ✓ VERIFIED | `nyquist_compliant: true`, `wave_0_complete: true`, full sign-off checklist checked, Manual-Only Verifications table filled with UAT-approved note dated 2026-07-15. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `dedup.ts` | `common/matching/titleMatch.ts` | import + re-export | ✓ WIRED | Confirmed via direct read (lines 3-8, 33-38). |
| `resolveStoreSearchBadges` (badges.ts) | `titleMatch.ts` | `import { fuzzyMatch }` | ✓ WIRED | `badges.ts:2`. |
| `ipc.ts` channels | `storeSearch.ts` types | return-type references | ✓ WIRED | Confirmed indirectly via successful `tsc --noEmit`. |
| `main.ts` | `backend/storeSearch/index.ts` | side-effect import | ✓ WIRED | `main.ts:24`. |
| `backend/storeSearch/index.ts` | `cheapshark.ts` | function calls inside handlers | ✓ WIRED | `index.ts:3,16,25,37`. |
| `preload/api/index.ts` | `preload/api/storeSearch.ts` | `import * as StoreSearch` + spread | ✓ WIRED | `index.ts:11,24`. |
| `StoreSearch/index.tsx` | `resolveStoreSearchBadges` | `useMemo` over results | ✓ WIRED | `index.tsx:45-66`, called once per results array, not inside `StoreSearchRow`. |
| `StoreSearchBreakdown` | `window.api.getStoreSearchDeals` | lazy fetch on mount (=expand) | ✓ WIRED | `StoreSearchBreakdown/index.tsx:32-46`. |
| `StoreSearchBreakdown` | `window.api.openExternalUrl` | per-row click/keydown handoff | ✓ WIRED | `StoreSearchBreakdown/index.tsx:78,81`. |
| `SidebarLinks` | `/store-search` | new `SidebarItem` sibling of `/discounts` | ✓ WIRED | `SidebarLinks/index.tsx:205-210`. |
| `App.tsx` | `screens/StoreSearch` | lazy route registration | ✓ WIRED | `App.tsx:163-166`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `StoreSearch/index.tsx` | `results` (from `useDebouncedStoreSearch`) | `window.api.searchStores(query)` → `backend/storeSearch/index.ts` `addHandler('searchStores', ...)` → `cheapshark.ts searchGames()` → live `axios.get` against `cheapshark.com/api/1.0/games` | Yes | ✓ FLOWING (confirmed live via UAT — real CheapShark responses, not stubbed) |
| `StoreSearchBreakdown` | `deals` | `window.api.getStoreSearchDeals(gameId)` → `getGameDeals()` → live `/games?id=` + cached `/stores` | Yes | ✓ FLOWING (confirmed live via UAT) |
| `badgesByGameId` | `owned`/`keyAvailable` | `resolveStoreSearchBadges` reading `steam.library`/`gog.library`/`epic.library`/`amazon.library`/`humble.keys` from real `ContextProvider` state (not hardcoded) | Yes | ✓ FLOWING (confirmed live — UAT surfaced and fixed a real false-positive against the user's actual library, proving the pipeline is live-data-driven) |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| STORESEARCH-01 | 20-02, 20-04, 20-06 | Sidebar entry + provider-interface search | ✓ SATISFIED | Sidebar/route wired; `searchStores` IPC live-tested. |
| STORESEARCH-02 | 20-06 | Debounce 400ms/min-3/cancel | ✓ SATISFIED | `useDebouncedStoreSearch.ts`, unit + live-tested. |
| STORESEARCH-03 | 20-02, 20-04, 20-05 | Cheapest row + lazy per-store breakdown | ✓ SATISFIED | `getStoreSearchDeals` lazy-fetch confirmed. |
| STORESEARCH-04 | 20-02, 20-04, 20-05 | Explicit currency label on every price | ✓ SATISFIED | `formatUsdPrice` single-node; live-verified. |
| STORESEARCH-05 | 20-01, 20-03, 20-06 | Store-named ownership badge, exact Steam / fuzzy others | ✓ SATISFIED | `resolveStoreSearchBadges`; UAT confirmed against real library, defect found+fixed. |
| STORESEARCH-06 | 20-01, 20-03, 20-06 | key-available coexists with ownership | ✓ SATISFIED | Independent computation in resolver + independent DOM spans in row; live-verified. |
| STORESEARCH-07 | 20-04, 20-05 | External browser handoff via dealID-verbatim redirect | ✓ SATISFIED | `buildRedirectUrl` verbatim + regression test + live UAT (no 404). |
| STORESEARCH-08 | 20-06 | Prompt / no-results / provider-failed fail-soft states | ✓ SATISFIED | Three distinct containers in `index.tsx`; live-verified. |

No orphaned requirements — REQUIREMENTS.md's Phase 20 mapping (lines 222-229) contains exactly these 8 IDs, all claimed by plans 20-01 through 20-07.

### Anti-Patterns Found

None. Scanned all 15 newly-created/modified core Phase 20 source files for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not yet implemented|coming soon` — zero matches. No empty stub implementations (`return null`/`return {}`/`=> {}`) found in the reviewed files beyond legitimate loading-state early-returns.

### Behavioral Spot-Checks / Automated Suite

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted Phase 20 + Phase 12/15 regression suite | `npx jest src/backend/__tests__/titleMatch.test.ts src/backend/humble src/backend/__tests__/storeMapping.test.ts src/backend/discounts src/backend/storeSearch src/frontend/screens/StoreSearch --selectProjects Backend Frontend` | 21 suites / 557 tests, all passed | ✓ PASS |
| Full repo suite | `npx jest --selectProjects Backend Frontend` | 65 suites / 1194 tests, all passed (matches 20-07-SUMMARY's claimed count exactly) | ✓ PASS |
| Type check | `npm run codecheck` (`tsc --noEmit`) | Exits 0, no errors | ✓ PASS |
| Remaster regression pin | `grep` on `titleMatch.test.ts` | `fuzzyMatch('Alan Wake','Alan Wake Remastered') === false` and `Remake === false` asserted | ✓ PASS |
| dealID double-encoding regression | `grep` on `cheapshark.test.ts` | Asserts `url.not.toContain('%25')` for `%2F`/`%3D` dealID | ✓ PASS |
| No encodeURIComponent/URLSearchParams on redirect path | `grep -n "encodeURIComponent\|URLSearchParams" cheapshark.ts` | 0 matches | ✓ PASS |
| No literal 'USD' union in shared types | `grep -c "'USD'" storeSearch.ts` | 0 | ✓ PASS |
| Old matcher functions removed from dedup.ts | `grep -c "function normalizeTitle..."` on `dedup.ts` | 0 (imported/re-exported, not redefined) | ✓ PASS |

### Human Verification Required

None outstanding. The one item that required human/live verification (Task 2 of plan 20-07 — live end-to-end UAT against the real CheapShark API, per this phase's own gate design) was already executed and approved by the user on 2026-07-15, with all nine checks passing and one live-discovered defect (remaster false positive) fixed and re-verified before final approval. Per the verification task's explicit instruction, this is treated as human-verified evidence, not re-requested.

### Gaps Summary

No gaps found. All 8 STORESEARCH requirements are implemented, wired, tested (unit + full-suite + live UAT), and traced in REQUIREMENTS.md. Phase 15's `resolveDiscountBadge` and Humble dedup are confirmed unregressed both by direct code inspection (function is byte-for-byte the pre-Phase-20 Phase-15 shape) and by their test suites passing in the same full-suite run. The mid-UAT remaster defect was caught by the phase's own live-verification gate exactly as designed, fixed in the shared matcher (benefiting Humble dedup too), pinned with a regression test, and re-verified — this is the process working correctly, not a residual gap.

---

*Verified: 2026-07-15T18:45:00Z*
*Verifier: Claude (gsd-verifier)*
