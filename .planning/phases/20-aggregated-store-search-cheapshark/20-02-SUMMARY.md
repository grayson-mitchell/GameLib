---
phase: 20-aggregated-store-search-cheapshark
plan: 02
subsystem: api
tags: [typescript, ipc, electron, types, cheapshark]

# Dependency graph
requires:
  - phase: 20-01
    provides: shared fuzzy title matcher (src/common/matching/titleMatch.ts) — not directly used by this plan, but establishes the pattern of lifting shared common/ modules for Phase 20
provides:
  - Provider-neutral StoreSearchResult/StoreSearchDeal/StoreSearchStore types in common/types/storeSearch.ts, each with an explicit currencyCode field (D-13/STORESEARCH-04)
  - CHEAPSHARK_STORE_TO_RUNNER mapping constant + resolveRunner() helper in common/discounts/storeMapping.ts, unit-tested against drift
  - searchStores/getStoreSearchDeals/getStoreSearchStoreMap channel signatures declared in AsyncIPCFunctions
affects: [20-03, 20-04, 20-05, 20-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider-neutral shared types (common/types/storeSearch.ts) mirror common/types/discounts.ts's structural shape so a second provider can be added without reshaping consumers"
    - "currencyCode kept as bare `string` (never a literal union) in shared types so provider-specific currency assumptions stay visible, not baked into the type system"

key-files:
  created:
    - src/common/types/storeSearch.ts
    - src/common/discounts/storeMapping.ts
    - src/backend/__tests__/storeMapping.test.ts
  modified:
    - src/common/types/ipc.ts

key-decisions:
  - "storeMapping constant placed in common/discounts/storeMapping.ts (not inside storeSearch.ts) per RESEARCH Open Question 1's sibling-file recommendation"
  - "buyUrl kept as a plain GameLib-built string field, never a raw CheapShark URL, so the Plan 04 adapter can enforce a fixed host prefix (threat T-20-02 mitigation)"
  - "No new IPC channel for the buy handoff — reuses existing openExternalUrl SyncIPC listener (D-08), confirmed via grep that no 'openStoreSearchUrl'-style channel was added"

patterns-established:
  - "Every price-bearing type in the store-search vocabulary carries currencyCode: string — enforced via acceptance-criteria grep for zero literal 'USD' occurrences in shared types"

requirements-completed: [STORESEARCH-01, STORESEARCH-03, STORESEARCH-04]

# Metrics
duration: 10min
completed: 2026-07-14
---

# Phase 20 Plan 02: Store-Search Type Vocabulary + IPC Contract Summary

**Provider-neutral StoreSearchResult/Deal/Store types with explicit per-price currencyCode, a tested CheapShark storeID→Runner mapping, and three new AsyncIPCFunctions channel signatures ready for the backend adapter.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-14T09:47Z (approx, following 20-01 completion)
- **Completed:** 2026-07-14T09:50:29Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Defined `StoreSearchResult`, `StoreSearchDeal`, `StoreSearchStore` in `src/common/types/storeSearch.ts`, mirroring `discounts.ts`'s structural conventions, with `currencyCode: string` on every price-bearing type (D-13) and zero literal `'USD'` unions
- Created `CHEAPSHARK_STORE_TO_RUNNER` constant + `resolveRunner()` helper in `src/common/discounts/storeMapping.ts`, importing the existing `Runner` union rather than restringing store names
- Added a unit test (`src/backend/__tests__/storeMapping.test.ts`) asserting all four confirmed mappings ('1'→steam, '7'→gog, '25'→legendary, '4'→nile) plus an unknown-storeID fallback case
- Declared `searchStores`, `getStoreSearchDeals`, `getStoreSearchStoreMap` in `AsyncIPCFunctions` (`src/common/types/ipc.ts`) beside the existing `getGogDiscounts` entry, referencing the new storeSearch types

## Task Commits

Each task was committed atomically:

1. **Task 1: storeSearch.ts types + storeMapping.ts constant + mapping unit test** - `61f12230` (feat)
2. **Task 2: Declare the three store-search IPC channels in AsyncIPCFunctions** - `12d3a3c6` (feat)

**Plan metadata:** (this commit, following)

## Files Created/Modified
- `src/common/types/storeSearch.ts` - StoreSearchResult/StoreSearchDeal/StoreSearchStore interfaces, each price field carrying `currencyCode: string`
- `src/common/discounts/storeMapping.ts` - CHEAPSHARK_STORE_TO_RUNNER Record<string, Runner> + resolveRunner()
- `src/backend/__tests__/storeMapping.test.ts` - unit tests asserting all four mappings by value
- `src/common/types/ipc.ts` - added storeSearch type import + three new AsyncIPCFunctions channel signatures

## Decisions Made
- currencyCode kept as bare `string` (not a `'USD'` literal type) so the field itself carries the USD-only debt without hardcoding it into the type system — acceptance criterion enforced via `grep -c "'USD'"` returning 0
- The first draft of the file-level doc comment on `storeSearch.ts` inadvertently included the literal substring `'USD'` inside a doc comment (to explain the currencyCode field's practical value today); this tripped the acceptance-criteria grep even though it wasn't a type-level union. Reworded to "US dollar code" so the comment conveys the same information without the literal substring the grep guards against.
- `resolveRunner`/`CHEAPSHARK_STORE_TO_RUNNER` placed in `common/discounts/storeMapping.ts` per RESEARCH's recommendation, keeping `storeSearch.ts` purely about type shapes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc comment on storeSearch.ts violated its own acceptance criterion**
- **Found during:** Task 1 (self-verification before commit)
- **Issue:** The file-level doc comment explaining D-13 used the literal text `'USD'` (in backtick-quotes) twice, which is exactly the pattern the acceptance criterion's `grep -c "'USD'" src/common/types/storeSearch.ts` checks for (must be 0). The intent of that check is "no literal USD type/union baked into the shared types," but a naive grep also flags prose mentioning USD in quotes.
- **Fix:** Reworded the doc comment to say "US dollar code" instead of `'USD'`, preserving the same explanation without tripping the literal-string check.
- **Files modified:** src/common/types/storeSearch.ts
- **Verification:** `grep -c "'USD'" src/common/types/storeSearch.ts` returns 0; `npm run codecheck` still exits 0
- **Committed in:** 61f12230 (Task 1 commit, fixed before commit — no separate commit needed)

---

**Total deviations:** 1 auto-fixed (1 bug — doc comment wording)
**Impact on plan:** No scope creep; purely a wording fix to satisfy the plan's own acceptance criterion. No behavioral or type-level change.

## Issues Encountered
- The plan's verify command (`npx jest src/backend/__tests__/storeMapping.test.ts --selectProjects backend`) uses a lowercase `backend` project selector, but the actual Jest `displayName` configured in `src/backend/jest.config.js` is `Backend` (capitalized) — `--selectProjects backend` silently matches zero projects and jest reports "No tests found, exiting with code 1." Ran with `--selectProjects Backend` instead, which passed 6/6. No code change needed; documenting for future plans that also embed `--selectProjects backend` in their verify blocks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The provider-neutral type vocabulary, tested storeID→Runner mapping, and IPC channel signatures are ready for the Plan 04 backend adapter (`backend/storeSearch/cheapshark.ts` + `backend/storeSearch/index.ts`) to implement `addHandler` against, and for the Plan 04+ preload bridge (`preload/api/storeSearch.ts`) to invoke via `makeHandlerInvoker`.
- No blockers. Plan 03 (badge resolver extension per PATTERNS.md) and Plan 04 (CheapShark adapter) can proceed independently against these committed contracts.

---
*Phase: 20-aggregated-store-search-cheapshark*
*Completed: 2026-07-14*
