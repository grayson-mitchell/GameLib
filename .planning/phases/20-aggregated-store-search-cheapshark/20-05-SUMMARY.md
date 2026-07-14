---
phase: 20-aggregated-store-search-cheapshark
plan: 05
subsystem: ui
tags: [react, frontend, i18n, fontawesome, jest, store-search, cheapshark]

# Dependency graph
requires:
  - phase: 20-aggregated-store-search-cheapshark
    provides: "Plan 02 StoreSearchResult/StoreSearchDeal types (common/types/storeSearch); Plan 04 window.api.getStoreSearchDeals IPC handler + backend-built redirect buyUrl"
provides:
  - "formatUsdPrice(amount, currencyCode) pure D-13 currency formatter + unit test"
  - "buildOwnedBadgeLabel(owned) pure D-04/D-06 badge-copy helper (i18n key + values, not a rendered string)"
  - "StoreSearchRow: collapsed thumb/title/badge-stack/price/chevron row component"
  - "StoreSearchBreakdown: lazy per-store panel with external buy handoff"
  - "src/frontend/screens/StoreSearch/index.css: .storeSearchScreen shell + row + breakdown styles"
affects: [20-06, 20-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DOM-less component testing: invoke function components directly (no jsdom/react-test-renderer installed), inspect the returned React-element object graph via a collectElements/findByClassNamePart/textContent walker"
    - "Dependency-array-aware useEffect mock in the 'react' jest.mock harness (improves on the HumbleClaimWizard precedent's always-rerun useEffect) to assert an async IPC call fires exactly once per mount, not once per rerender"
    - "Mock whole barrel/leaf modules (frontend/components/UI, frontend/components/UI/StoreLogos) plus one `virtual: true` mock for a vite `?url` asset import, instead of adding a jsdom/asset-transform dependency"

key-files:
  created:
    - src/frontend/screens/StoreSearch/helpers.ts
    - src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx
    - src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx
    - src/frontend/screens/StoreSearch/index.css
    - src/frontend/screens/StoreSearch/__tests__/formatUsdPrice.test.ts
    - src/frontend/screens/StoreSearch/__tests__/StoreSearchRow.test.tsx
  modified: []

key-decisions:
  - "OwnedBadgeLabel.values is a homogeneous Record<string, string|number> rather than a discriminated union keyed off `key` — react-i18next's typed TFunction overloads cannot resolve a heterogeneous union at a single t(key, defaultValue, values) call site; widening `values` keeps the call type-safe without a per-key switch"
  - "Badge Contract read literally: 2 owned stores render as ONE pill with comma-joined names ('Owned on Steam, GOG'), not two separate owned pills — the UI-SPEC's explicit copy contract (ownedOnMulti) is authoritative over the Task 2 action-text's ambiguous 'two owned pills' phrasing; key-available still renders as its own independent second pill (D-07 coexistence)"
  - "StoreSearchBreakdown unmounts entirely on collapse (StoreSearchRow only renders it while expanded) rather than caching deals across expand/collapse cycles — this makes 'a later click retries' (RESEARCH Open Question 2) fall out naturally from React unmount/remount instead of needing explicit retry state"
  - "Badge chrome (.discountCard__badge--owned/--keyAvailable) and the chevron rotate pattern (.discountFilters__toggleIcon--open) are duplicated byte-for-byte into StoreSearch/index.css rather than cross-imported from Discounts — keeps this screen visually correct standalone regardless of route-chunk load order, while still using the exact same class names/values per the interfaces doc's 'reuse EXACTLY' instruction"

patterns-established:
  - "StoreSearch component test harness (StoreSearchRow.test.tsx) is the reference implementation for testing components with useState+useEffect+async IPC calls under this project's no-jsdom constraint; future StoreSearch tests (Plan 06+) should reuse its mount/rerender/collectElements helpers rather than re-deriving them"

requirements-completed: [STORESEARCH-03, STORESEARCH-04, STORESEARCH-07]

# Metrics
duration: ~15min
completed: 2026-07-14
---

# Phase 20 Plan 05: Store-Search Row + Breakdown Presentational Layer Summary

**StoreSearchRow/StoreSearchBreakdown React components render a correctness-grade `$X USD` single-text-node price, a store-named/capped ownership badge stack coexisting with a key-available pill, and a lazy per-store breakdown that hands off to the external browser via `window.api.openExternalUrl` — all from Plan 03/06-resolved props, with 17 passing component tests running under a custom DOM-less hook harness (no jsdom installed in this project).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-14T22:08:18+12:00 (immediately after 20-04's completion commit)
- **Completed:** 2026-07-14T22:20:45+12:00
- **Tasks:** 2
- **Files modified:** 6 (all new)

## Accomplishments

- `formatUsdPrice(amount, currencyCode)` enforces the D-13 correctness rule (single `$14.99 USD` text node, no decimal fabrication) with a dedicated unit test
- `buildOwnedBadgeLabel(owned)` implements D-04 (store-named copy) + D-06 (fixed Steam/GOG/Epic/Amazon order, cap-at-2 with `+N more` overflow) as pure, framework-free data, unit-tested against the exact 20-CONTEXT.md D-06 example
- `StoreSearchRow` renders the collapsed row (thumb, title, badge stack, price, expand chevron) and lazily mounts `StoreSearchBreakdown` only while expanded
- `StoreSearchBreakdown` fetches `window.api.getStoreSearchDeals(gameId)` exactly once per expand, shows a row-scoped loading state (not full-screen `UpdateComponent`), renders each deal as a click-target sub-row that calls `window.api.openExternalUrl(deal.buyUrl)` verbatim (no `withAffiliate`/`navigate`/`/store-page`), and collapses the parent row on fetch failure via an `onFetchFailed` callback so a later click retries
- `StoreLogos` renders on a per-store sub-row only when `deal.runner` is defined; the ~26 unmapped CheapShark storefronts render text-only
- `index.css` implements the `.storeSearchScreen` shell + `.storeSearchRow` + `.storeSearchRow__breakdown` styles using only semantic tokens (2 explicit font-weights: `--semibold` badges, `--bold` title/price), plus the two UI-SPEC-approved hardcoded values (box-shadow hex, hover-background rgba)
- Established a DOM-less component-testing pattern (dependency-array-aware `useEffect` mock) for testing components with async IPC-backed `useState`/`useEffect` under this project's no-jsdom jest environment

## Task Commits

1. **Task 1: formatUsdPrice helper + badge-label helpers + unit test** - `21c45451` (feat)
2. **Task 2: StoreSearchRow + StoreSearchBreakdown + CSS + component test** - `db4921c0` (feat)

**Plan metadata:** (this commit, following)

## Files Created/Modified

- `src/frontend/screens/StoreSearch/helpers.ts` - `formatUsdPrice`, `buildOwnedBadgeLabel`, store display-name map
- `src/frontend/screens/StoreSearch/__tests__/formatUsdPrice.test.ts` - 7 unit tests for both helpers
- `src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx` - collapsed row + badge stack + expand chevron
- `src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx` - lazy per-store breakdown + buy handoff
- `src/frontend/screens/StoreSearch/index.css` - screen shell + row + breakdown styles, reused badge/chevron chrome
- `src/frontend/screens/StoreSearch/__tests__/StoreSearchRow.test.tsx` - 10 component tests for both components

## Decisions Made

See `key-decisions` in frontmatter. In brief: widened `OwnedBadgeLabel.values` to a homogeneous `Record` for i18next type-safety; implemented the badge stack per the UI-SPEC's literal copy contract (one joined pill for ≤2 owned stores, not N separate pills); let the breakdown panel unmount on collapse rather than caching fetched deals, so retry-after-failure is free; duplicated (not cross-imported) badge/chevron CSS chrome for standalone-screen correctness.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2's test file could not use React Testing Library as literally specified**
- **Found during:** Task 2 (component test)
- **Issue:** The task action text says "Create StoreSearchRow.test.tsx (React Testing Library)", but this project has no `jest-environment-jsdom` / `react-test-renderer` installed (confirmed via `src/frontend/jest.config.js`'s own docstring and by checking `node_modules`) — `@testing-library/react`'s `render()` requires a real DOM and cannot run under the configured `node` test environment. Adding jsdom is a new npm dependency, which is outside executor auto-fix (Rule 3's package-manager-install carve-out) and would require a human package-legitimacy checkpoint.
- **Fix:** Followed this project's already-established convention (`HumbleClaimWizard/__tests__/index.test.tsx`, `HumbleOriginInfo.test.tsx`, `CrossoverBadge.test.tsx`): mock `react` at the module level with a hook harness, invoke `StoreSearchRow`/`StoreSearchBreakdown` directly as plain functions, and inspect the returned React-element object graph via a `collectElements`/`findByClassNamePart`/`textContent` walker. Improved on the precedent's `useEffect` mock by making it dependency-array-aware (only reruns an effect when a dep actually changed), which was necessary to assert `getStoreSearchDeals` fires exactly once per expand across multiple `rerender()` calls — the precedent's always-rerun `useEffect` would have double-counted the fetch.
- **Files modified:** `src/frontend/screens/StoreSearch/__tests__/StoreSearchRow.test.tsx` (written from scratch with this pattern)
- **Verification:** `npx jest src/frontend/screens/StoreSearch --selectProjects Frontend` — 17/17 tests pass
- **Committed in:** `db4921c0` (Task 2 commit)

**2. [Rule 3 - Blocking] Component test transitively imports break under Jest's asset resolution**
- **Found during:** Task 2 (component test)
- **Issue:** `StoreSearchRow` imports `CachedImage` via the `frontend/components/UI` barrel (matching the DiscountCard convention) and a `?url`-suffixed SVG asset; `StoreSearchBreakdown` imports `StoreLogos`, which itself imports 6 raw `.svg?react`/`.png` files. None of these have a Jest transform/moduleNameMapper configured (confirmed via `jest.config.js`), and the barrel additionally pulls in ~15 unrelated heavy components (Header, SteamGridDBPicker, Winetricks, ...) with their own transitive imports.
- **Fix:** Added targeted `jest.mock()` calls in the test file only — stub the `frontend/components/UI` barrel down to just `CachedImage`, stub the whole `frontend/components/UI/StoreLogos` module (avoiding 6 individual asset mocks), and a single `virtual: true` mock for the `?url` asset import. Zero new dependencies; production code is unaffected.
- **Files modified:** `src/frontend/screens/StoreSearch/__tests__/StoreSearchRow.test.tsx`
- **Verification:** Same test run as above; `npm run codecheck` exits 0
- **Committed in:** `db4921c0` (Task 2 commit)

**3. [Rule 1 - Bug] i18next TFunction overload rejected the discriminated-union badge-label type**
- **Found during:** Task 2, `npm run codecheck`
- **Issue:** `helpers.ts`'s original `OwnedBadgeLabel` was a discriminated union (`{key:'...ownedOn', values:{store}} | {key:'...ownedOnMulti', values:{stores}} | ...`). Calling `t(ownedLabel.key, ownedLabel.defaultValue, ownedLabel.values)` in `StoreSearchRow` failed `tsc --noEmit` (TS2769: no overload matches) because react-i18next's typed `TFunction` overloads couldn't reconcile the heterogeneous `values` union at a single call site.
- **Fix:** Widened `OwnedBadgeLabel.values` to `Record<string, string | number>` while keeping `key` as the 3-literal union (documented in the type's own comment). The Task 1 unit tests (which assert exact object shape via `toEqual`) still pass unchanged since the widened type is structurally compatible with the literal object shapes already being returned.
- **Files modified:** `src/frontend/screens/StoreSearch/helpers.ts`
- **Verification:** `npm run codecheck` exits 0; `formatUsdPrice.test.ts` 7/7 still green
- **Committed in:** `21c45451` (Task 1 commit — fixed before the commit landed, so no separate follow-up commit was needed)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 blocking, 1 Rule 1 bug)
**Impact on plan:** All three were necessary to make the plan's stated test file buildable/type-safe within this project's actual test infrastructure; none altered the plan's functional scope (badge contract, currency formatting, buy handoff, lazy fetch all implemented exactly as specified).

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 06 (the container that computes debounce + resolves badges via `resolveStoreSearchBadges` and passes `{owned, keyAvailable}` + `StoreSearchResult` props into `StoreSearchRow`) can now import `StoreSearchRow` directly and reuse `.storeSearchScreen` from `index.css` for its own shell.
- Plan 06 also owns adding the `storeSearch.*` i18n keys to `translation.json` — this plan deliberately left them out of the locale file (only inline `t(key, defaultValue, ...)` calls) per the plan's constraints, to avoid a cross-plan file conflict.
- No blockers.

---
*Phase: 20-aggregated-store-search-cheapshark*
*Completed: 2026-07-14*

## Self-Check: PASSED

All 6 created files verified present on disk; all 3 commits (`21c45451`, `db4921c0`, `0cc634ed`) verified in `git log`.
