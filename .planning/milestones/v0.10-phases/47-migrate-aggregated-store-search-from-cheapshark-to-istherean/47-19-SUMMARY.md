---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 19
subsystem: ui
tags: [react, store-search, session-state, module-store, i18n-gate]

requires:
  - phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
    provides: Store Search screen, useDebouncedStoreSearch hook and region picker (47-16)
provides:
  - session-only module store for the Store Search query and last rows (storeSearchSession.ts)
  - useDebouncedStoreSearch seeded from and written back to that store
  - no loading flash, no spinner and no new request when returning to Store Search with current rows
affects: [phase 47 UAT G-47-12a re-verification, Store Search]

gap_closure: [G-47-12a]

actuals:
  tokens: 11600
  tasks: 3
  commits: 4
plan_head_before: 99076110744ce2745af8eef43fabadb6c0206157
plan_head_after: abc1aad57079c37c96367f8528ffb0c44ff88541

tech-stack:
  added: []
  patterns:
    - "Module-scope session store (shape of Library/librarySessionSearch.ts) read in a lazy useState initialiser and written back from one useEffect"
    - "Kept price rows restored only for the same trimmed query and country, at most one hour old, from a 'results' or 'empty' status"

key-files:
  created:
    - src/frontend/screens/StoreSearch/storeSearchSession.ts
    - src/frontend/screens/StoreSearch/__tests__/storeSearchSession.test.ts
  modified:
    - src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts
    - src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts
    - src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "Session-only module memory, never localStorage or sessionStorage: the rows carry prices and the backend treats a search as fresh for one hour (D-22/WR-11)"
  - "KEPT_RESULTS_MAX_AGE_MS = one hour, mirroring the backend ITAD_FRESH_MS which the renderer cannot import"
  - "An 'error' or 'loading' status is never resurrected: the query returns, debouncedQuery is seeded, and the search re-runs on mount"
  - "storeSearchSession.ts is SCANNED in the i18n gate (declares no user-facing string), not declared debt"

requirements-completed: [PRICE-01]

duration: 25min
completed: 2026-11-19
status: complete
---

# Phase 47 Plan 19: Store Search keeps its query and rows across a leave-and-return Summary

**A session-only module store (`storeSearchSession.ts`) seeds `useDebouncedStoreSearch` so Store Search returns with the same query and rows on the first frame, with no request, no spinner and no stale price shown as current.**

## Performance

- **Duration:** about 25 min
- **Completed:** 2026-11-19
- **Tasks:** 3
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- Leaving Store Search (Settings, theme change) and coming back restores the query in the box and the rows on the first render. When the restored rows already match the committed query and country, the fetch effect does not re-fetch and the debounce effect starts no timer, so there is no loading flash and no spinner.
- Restore rules: rows come back only for the same trimmed query and country, at most one hour old (inclusive), and only from a 'results' or 'empty' status. A region change between visits, stale rows, an edited query, or a failed or still-loading last search keep the query and drop the rows, and the search re-runs at once for the current region. A query under three characters is kept as typed with the prompt state.
- Nothing is written to localStorage or sessionStorage; a no-storage test and a comment-stripped source gate pin it (T-47-57, T-47-58).
- i18n gate bookkeeping: the new file is recorded in scope (317 to 318) and the fork-touched list (439 to 440).

## Task Commits

1. **Task 1: Store Search keeps its query and rows across a remount** - `0df3a6f88` (feat; tracer, tdd)
2. **Task 2: Restore rules for a changed region, stale rows, failed or short searches** - `8106554d4` (feat; tdd)
3. **Task 3: Record the new session module in the i18n gate scope** - `1b68cc845` (scope entry, hand-inserted) and `abc1aad57` (regenerated fork-touched list, scope history note, count updates)

**Plan metadata:** recorded in the docs commit that follows this file.

_TDD note: each task was a single commit per the plan's task-per-commit shape. RED was observed before GREEN (below); no separate `test(...)` commits were made._

## TDD Gate Compliance

Plan type is `execute` with `tdd="true"` tasks, so the plan-level RED/GREEN commit sequence is not required. The RED/GREEN discipline was followed inside each task:

- **Task 1 RED:** with the session module in place but the hook unwired, the target tests failed on their planned assertions: hook remount (`Expected "portal", Received ""`), same-trimmed-query (`Expected loading false, Received true`) and the screen leave-and-return test (`Expected "portal", Received ""`). The other 29 cases passed. A first draft of the same-trimmed-query test passed vacuously (the harness only shows effect-set state on the next render), so it was strengthened with a second `rerender()` before GREEN.
- **Task 2 RED:** storeSearchSession.test.ts failed on the three cases that needed the new rules (`KEPT_RESULTS_MAX_AGE_MS` value, over-an-hour-old rows, edited query). The region-change and failed-search hook cases already passed on the Task 1 wiring; they are kept as regression pins for the plan's required behaviours.

## Files Created/Modified

- `src/frontend/screens/StoreSearch/storeSearchSession.ts` - module-memory store: `StoreSearchStatus`, `STORE_SEARCH_MIN_QUERY_LENGTH`, `KEPT_RESULTS_MAX_AGE_MS`, `StoreSearchFetchKey`, `writeStoreSearchSession`, `restoreStoreSearchSession`, `resetStoreSearchSessionForTests`
- `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts` - lazy seed from the store, `fetchedFor` state, no timer for an unchanged committed query, fetch skipped for rows already on screen, write-back effect
- `src/frontend/screens/StoreSearch/__tests__/storeSearchSession.test.ts` - restore rules, no-storage check, hook wiring source gate
- `src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts` - `session keep (G-47-12a)` describe (remount, same trimmed query, region change, failed search)
- `src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx` - session reset in both beforeEach blocks and before the second mount of the region-fallback test; new leave-and-return screen test
- `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json`, `meta/__tests__/genI18nGateScope.test.ts` - gate-scope bookkeeping

## Decisions Made

See `key-decisions`. The `fetchedFor` key records the country the request was sent with (captured before the call), so a region change mid-flight cannot mislabel the rows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] genI18nGateScope.test.ts hard-codes the scope and fork-touched counts**
- **Found during:** Task 3
- **Issue:** the plan asked only for a dated history entry, but A0, A2, A3 and A4 in the `--rewrite-scope guard` describe assert 317 and 439 and failed once the scope became 318 and the fork-touched list 440.
- **Fix:** updated the five assertions and the matching test titles to 318 and 440 (the measured numbers, which match the plan's expected ones).
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`
- **Commit:** `abc1aad57`

**Total deviations:** 1 auto-fixed (1 blocking). **Impact:** none on scope; a test-count follow-through the plan did not list.

## Issues Encountered

None. `pnpm lint:src` reports 0 errors (962 pre-existing warnings, none introduced here: the one reported in the hook file is an existing `no-base-to-string` on a line this plan did not write).

## Verification Results

- storeSearchSession, useDebouncedStoreSearch and StoreSearchScreen suites: 51 passed
- genI18nGateScope and hardcodedStringGate (Meta): 2 suites passed, 202 passed, 1 skipped
- `pnpm codecheck`: clean; `pnpm lint:src`: 0 errors
- `npx prettier --check` over every path written: clean
- Acceptance criteria: all PASS (grep counts: restoreStoreSearchSession(countryCode 1, writeStoreSearchSession( 1, resetStoreSearchSessionForTests() 3 in the screen test and 2 in the hook test, jest.mock( 1 in the hook test and 0 in the session test, KEPT_RESULTS_MAX_AGE_MS export 1, session path in scope 1, in fork-touched 1, "phase 47 plan 19" 1)

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or storage surface; T-47-57 and T-47-58 are mitigated and test-pinned.

## Human Check Outstanding

Task 2's `<human-check>` (macOS, `pnpm tauri:dev`): search 'xcom', open Settings, change theme, return via the Stores tab; change region on Deals and return; clear the box, leave and return. Expected: same query and rows at once with no prompt, gap or spinner; rows reload in euros after the region change; empty prompt after clearing. Harvested at end of phase per the plan's verification note.

## Next Phase Readiness

G-47-12a is code-complete and unit-verified; the live check above is the remaining evidence.

## Self-Check: PASSED

- FOUND: src/frontend/screens/StoreSearch/storeSearchSession.ts
- FOUND: src/frontend/screens/StoreSearch/__tests__/storeSearchSession.test.ts
- FOUND commits: 0df3a6f88, 8106554d4, 1b68cc845, abc1aad57 (all ancestors of HEAD; 4 commits measured from the ledger base)
