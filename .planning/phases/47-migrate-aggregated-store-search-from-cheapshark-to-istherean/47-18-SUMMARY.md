---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 18
subsystem: store-search/region
tags: [gap-closure, G-47-8, deals, region-picker]
requires:
  - 47-16 (shared RegionPicker, storeRegion helpers)
provides:
  - Deals screen on the shared RegionPicker
  - storeRegion contract test (one stored value, per-screen validation)
affects: []
tech-stack:
  added: []
  patterns: [shared hookless component with a screen-owned onChange wrapper]
key-files:
  created:
    - src/frontend/helpers/__tests__/storeRegion.test.ts
  modified:
    - src/frontend/screens/Discounts/index.tsx
    - src/frontend/screens/Discounts/index.css
key-decisions:
  - 'Deals keeps its own handleRegionChange (filter reset) and passes it as RegionPicker onChange; the picker stays state-free'
  - 'Deals CSS keeps the shared .discountsScreen .MuiOutlinedInput-* rules (DiscountFilters inputs use them); only region rules were removed'
requirements-completed: [PRICE-01]
duration: 12min
completed: 2026-11-18
status: complete
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: 9630479c27af7d3c1340a92760bdc0521aacc4dc
plan_head_after: 1f517f7c95ce9676a15a6492ef18c089bcd96f32
---

# Phase 47 Plan 18: Deals moves onto the shared RegionPicker (G-47-8, part 2) Summary

The Deals screen now renders the shared `RegionPicker` with its own filter-resetting `handleRegionChange`, and a new `storeRegion.test.ts` pins the one-stored-region, per-screen-validation contract that both screens rely on.

## What was built

**Task 1 (tracer), commit `c7219df23`.** `Discounts/index.tsx`: the inline MUI label, Select and MenuItems inside `.discountsScreen__topbar` are replaced by `<RegionPicker id="discountsScreen__regionSelect" ... onChange={handleRegionChange} />`, with the same label, the same `Auto ({{code}})` string (country · currency), the 29 `REGION_OPTIONS` mapped to localized labels with their currency code, and the same locale for sorting. `handleRegionChange` is untouched (both `setHideOwned(false)` occurrences intact). The MUI import is gone. `Discounts/index.css`: removed the region container, label, select, currency-pill rules and the 700px media block; kept topbar, header and all `.discountsScreen .MuiOutlinedInput-*` rules. The tracer gate ran: Discounts and RegionPicker suites, hardcodedStringGate (176), codecheck, lint:src and prettier all pass.

**Task 2 (TDD), commit `1f517f7c9`.** `storeRegion.test.ts` (9 cases, in-memory localStorage stub, no `jest.mock`): the historical key `discounts.regionOverride`; set/remove; `getStoredRegionFor` allow-list, absent, throwing storage; `setStoredRegionOverride` swallowing errors; NZ stored reads as Auto on Deals (`getStoredRegionOverride`) but is honoured by Store Search (itad-list decision); hand-edited code is Auto on both; `STORE_SEARCH_REGION_CODES` is 32 unique codes, REGION_OPTIONS 29.

## Verification

- Frontend jest: all suites pass except the known pre-existing `themeTokens.test.ts` render-site census (.is-link 39 vs 34), out of scope.
- Meta: hardcodedStringGate 176 passed, backendDiCeilings 132 passed (ceilings unchanged).
- `pnpm codecheck` clean; `pnpm lint:src` zero errors (existing warnings only); prettier clean over every written path.
- Acceptance greps: `<RegionPicker` 1; `onChange={handleRegionChange}` 1; `from '@mui/material'` 0; `discountsScreen__region` in index.css 0; `discountsScreen .MuiOutlinedInput-root` 2; `setHideOwned(false)` 2; `jest.mock` in storeRegion.test.ts 0.
- Human check (macOS, `pnpm tauri:dev`, never `tauri:dev:run`): Deals picker look/position unchanged, region change clears Deals filters and reloads in euros, Store Search shows Germany, New Zealand on Store Search reads as Auto on Deals. Not run here; harvested at end of phase.

## Deviations from Plan

None - plan executed as written. Process note: Task 2 is TDD-flagged but tests only pin behaviour already shipped in 47-16, so there was no RED state to observe; the tests were committed in one `test(...)` commit. The remaining `discountsScreen__regionSelect` string in `index.tsx` is the picker's DOM id (the plan's greps target the CSS file only).

## Threat Flags

None. T-47-56 mitigated and now pinned by test.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/frontend/helpers/__tests__/storeRegion.test.ts
- FOUND commits c7219df23, 1f517f7c9
