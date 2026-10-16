---
phase: 20-aggregated-store-search-cheapshark
plan: 06
subsystem: ui
tags: [react, frontend, i18n, debounce, sidebar, routing, store-search, cheapshark]

# Dependency graph
requires:
  - phase: 20-aggregated-store-search-cheapshark
    provides: "Plan 03 resolveStoreSearchBadges(result, libraries, keysWaiting); Plan 04 window.api.searchStores IPC handler; Plan 05 StoreSearchRow component + StoreSearch/index.css shell"
provides:
  - "useDebouncedStoreSearch: 400ms/min-3-char/generation-counter-cancel debounce hook exposing {query,setQuery,results,status,loading,retry}"
  - "StoreSearch container (default export, lazy-routed at /store-search): badge-once-via-useMemo wiring, three fail-soft states, SearchBar integration"
  - "New top-level sidebar entry (sibling of Deals) + /store-search route registration"
  - "Full storeSearch.* i18n key block in public/locales/en/translation.json"
  - "SearchBar optional loading prop (icon->spinner swap in the same DOM slot)"
affects: [20-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generation-counter cross-IPC cancellation (inspired by backend/humble/library.ts's currentSyncGeneration()) as the load-bearing debounce-cancel primitive, since AbortController cannot cancel an already-in-flight ipcRenderer.invoke() promise"
    - "Cleanup-AND-dependency-aware useEffect mock for hook/container unit tests (extends 20-05's dependency-aware-only precedent) — required because clearTimeout must actually fire on every requery for the 'one call per pause' assertion to be meaningful rather than accidentally-correct"
    - "settle()-loop test helper: fixed-count microtask-flush + rerender cycles instead of an equality-based early exit, because a mocked-react render can produce a coincidentally-identical serialization mid-chain (observed empirically in the rejected-fetch test) before a later render-hop changes it again"

key-files:
  created:
    - src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts
    - src/frontend/screens/StoreSearch/index.tsx
    - src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts
    - src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx
  modified:
    - src/frontend/App.tsx
    - src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx
    - src/frontend/components/UI/SearchBar/index.tsx
    - src/frontend/screens/StoreSearch/index.css
    - public/locales/en/translation.json

key-decisions:
  - "SearchBar gained an optional loading?: boolean prop (default false) to swap its searchButton-slot icon for a fa-spin-pulse spinner, rather than overlaying a second element or forking the component — the UI-SPEC required the swap to happen in the exact same DOM slot, and SearchBar is a small, non-breaking, backward-compatible shared component (its two other consumers, Discounts and WineManager, pass no loading prop and are unaffected). This modifies a file outside the plan's stated files_modified list; documented as a deviation below."
  - "The container derives keysWaiting via the same selectKeysWaiting(humble.keys ?? []) filter Discounts/index.tsx already applies before calling its sibling resolver, rather than passing humble.keys straight through — a redeemed/expired key should not present as 'key available' on this screen either. The plan's interface comment only enumerated the five ALLOWED read sources (not a literal 'pass keys unfiltered' instruction), so this fills an underspecified detail consistently with the established sibling pattern."
  - "settle() test helper always runs a fixed number of flush+rerender cycles instead of stopping at the first unchanged serialization — an equality-based early exit was tried first and passed 5/6 hook tests but silently returned stale state one test in, because a mid-chain render can coincidentally reserialize identically to the prior render before a subsequent out-of-render mutation (a resolved/rejected promise callback) changes it again on a later hop."

patterns-established:
  - "useDebouncedStoreSearch is the reference debounce+cancel hook for this codebase (no prior precedent existed) — any future per-keystroke-triggers-IPC screen should reuse its two-effect (query->debouncedQuery->fetch) + generationRef shape rather than re-deriving one."

requirements-completed: [STORESEARCH-01, STORESEARCH-02, STORESEARCH-05, STORESEARCH-06, STORESEARCH-08]

# Metrics
duration: ~45min
completed: 2026-07-14
---

# Phase 20 Plan 06: Store-Search Container, Debounce Hook, Sidebar Entry Summary

**A new `/store-search` sidebar destination debounces free-form title queries to exactly one `window.api.searchStores` call per pause (400ms, min 3 chars, generation-counter cross-IPC cancel — no AbortController), resolves store-attributed ownership badges once per results array from five explicit GlobalState sources (sideloadedLibrary/zoom excluded), and renders three structurally distinct fail-soft states so a "no results" verdict is never confused with a retryable provider failure.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-07-14T10:23:34Z (immediately after 20-05's completion commit)
- **Completed:** 2026-07-14T10:39:11Z
- **Tasks:** 2
- **Files modified:** 9 (4 new, 5 modified)

## Accomplishments

- `useDebouncedStoreSearch` implements the D-11 debounce contract: a `query`->`debouncedQuery` effect gated on `trim().length >= 3` with a 400ms `setTimeout` (cleared on every requery), and a `debouncedQuery`->fetch effect guarded by a `generationRef` counter that discards any resolve/reject from a superseded request — the load-bearing rate control T-20-04 calls out (one request per pause, never per keystroke)
- The hook exposes `status: 'prompt' | 'loading' | 'results' | 'empty' | 'error'` plus a `loading` flag true while the debounce timer is pending OR a fetch is in-flight, and a `retry()` that re-fires the last committed query
- `StoreSearch` container reads exactly `steam.library`, `gog.library`, `epic.library`, `amazon.library`, and `selectKeysWaiting(humble.keys)` from `ContextProvider` — `sideloadedLibrary` and `zoom` are never destructured (D-05), grep-asserted by the container test against the actual destructure statement (not just prose)
- Ownership badges are resolved exactly once per results array via a single `useMemo` calling `resolveStoreSearchBadges`, producing a `Map<gameId, {owned,keyAvailable}>` that `StoreSearchRow` only ever renders as a literal (T-20-03)
- Three visually distinct states render below the search input per the UI-SPEC contract: an explanatory prompt block with a large muted icon (no query / <3 chars), a no-results block with no icon (query resolved, zero matches), and an inline left-accent-bar danger banner with a working Retry button for a rejected/errored search — the search box stays enabled throughout (D-14 fail-soft)
- New `/store-search` `SidebarItem` (icon `faMagnifyingGlassDollar`, no conditional gate) added as a sibling immediately after the `/discounts` Deals entry, and a matching lazy route registered in `App.tsx`
- Full `storeSearch.*` i18n key block (sidebar/title/placeholder/prompt/noResults/error.*/badge.*/loadingStores/aria.*) added to `en/translation.json`, wiring the real keys the 20-05 components already called with inline defaults
- `SearchBar` gained a small, non-breaking `loading?: boolean` prop that swaps its existing `searchButton` FontAwesome icon for a `fa-spin-pulse` spinner in the identical DOM slot

## Task Commits

1. **Task 1: useDebouncedStoreSearch hook + unit test** - `b9975a8e` (feat)
2. **Task 2: StoreSearch container + sidebar entry + route + i18n + screen test** - `c3283ad7` (feat)

**Plan metadata:** (this commit, following)

## Files Created/Modified

- `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts` - debounce/min-3/generation-cancel hook
- `src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts` - 6 unit tests (coalescing, min-length gate, stale-race guard, rejection, loading flag, no-AbortController grep)
- `src/frontend/screens/StoreSearch/index.tsx` - container: badge-once useMemo, three-state rendering, row list
- `src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx` - 4 component tests (prompt/no-results/error states + D-05 destructure grep)
- `src/frontend/App.tsx` - `/store-search` lazy route, sibling of `discounts`
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` - new `/store-search` `SidebarItem`
- `src/frontend/components/UI/SearchBar/index.tsx` - optional `loading` prop (icon->spinner swap)
- `src/frontend/screens/StoreSearch/index.css` - screen header, search wrapper, three-state block/banner styles
- `public/locales/en/translation.json` - `storeSearch.*` key block

## Decisions Made

See `key-decisions` in frontmatter. In brief: added a non-breaking `loading` prop to the shared `SearchBar` component (outside the plan's stated file list) rather than overlaying a second spinner element, to satisfy the UI-SPEC's "same DOM slot" requirement cleanly; filtered `humble.keys` through the existing `selectKeysWaiting` helper (matching Discounts' own pattern) rather than passing the raw array; and settled on a fixed-iteration-count async test helper after an equality-based early exit produced a false pass in one scenario.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] SearchBar had no way to satisfy the UI-SPEC's "same DOM slot" spinner requirement**
- **Found during:** Task 2 (container implementation)
- **Issue:** The UI-SPEC mandates the debounce/loading affordance render "inside SearchBar's existing searchButton slot position (same DOM position as the existing search icon — swap icon for spinner, don't add a second element)". The shared `SearchBar` component (`frontend/components/UI/SearchBar/index.tsx`) had no prop for this and is not listed in the plan's `files_modified`.
- **Fix:** Added an optional `loading?: boolean` prop (default `false`) that swaps the existing `FontAwesomeIcon`'s `icon`/className between `faSearch` and `faSpinner`+`fa-spin-pulse`, in the exact same JSX position. Verified the component's two other consumers (`Discounts/components/DiscountFilters`, `WineManager/index.tsx`) pass no `loading` prop and are structurally unaffected.
- **Files modified:** `src/frontend/components/UI/SearchBar/index.tsx`
- **Verification:** `npm run codecheck` exits 0; `npx jest src/frontend/screens/StoreSearch --selectProjects Frontend` 27/27 pass
- **Committed in:** `c3283ad7` (Task 2 commit)

**2. [Rule 1 - Bug] Equality-based test-settle early exit produced a false pass**
- **Found during:** Task 1 (hook unit test), the rejected-fetch scenario
- **Issue:** The initial `settle()` test helper stopped looping as soon as two consecutive mocked-react renders serialized identically. A rejected-fetch scenario produced a coincidental identical serialization one render-hop before the fetch effect's `status='loading'`/eventual `status='error'` mutation became observable, so the loop returned prematurely and the test asserted the wrong (stale 'prompt') status.
- **Fix:** Changed `settle()` to always run a fixed number of flush-microtask + rerender cycles (8) rather than stopping at the first apparent fixed point.
- **Files modified:** `src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts`, `src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx` (same helper pattern reused)
- **Verification:** `npx jest src/frontend/screens/StoreSearch --selectProjects Frontend` — 27/27 pass (was 5/6 and 3/4 respectively before the fix)
- **Committed in:** `b9975a8e` / `c3283ad7` (fixed before each commit landed, no separate follow-up needed)

---

**Total deviations:** 2 auto-fixed (1 Rule 2 missing-functionality, 1 Rule 1 bug)
**Impact on plan:** Neither altered the plan's functional scope (debounce contract, badge-once resolution, three-state rendering, sidebar/route/i18n wiring all implemented exactly as specified) — both were necessary to make the UI-SPEC's literal DOM-slot requirement and the test suite's assertions actually correct.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07 can now navigate to `/store-search`, observe the debounced search flow end-to-end, and build on the container's `StoreSearchRow` list rendering.
- All five STORESEARCH-01/02/05/06/08 requirements for this plan are implemented and unit-tested; `npm run codecheck` exits 0.
- No blockers.

---
*Phase: 20-aggregated-store-search-cheapshark*
*Completed: 2026-07-14*

## Self-Check: PASSED

All 4 created files verified present on disk (useDebouncedStoreSearch.ts, useDebouncedStoreSearch.test.ts, StoreSearch/index.tsx, StoreSearchScreen.test.tsx); all 5 modified files verified present; both commits (`b9975a8e`, `c3283ad7`) verified in `git log`.
