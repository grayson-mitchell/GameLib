---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 16
subsystem: store-search/region
tags: [gap-closure, G-47-8, store-search, region-picker, ui-spec]
requires: []
provides:
  - frontend/helpers/storeRegion (hoisted region key, REGION_OPTIONS, getLocaleSettings, get/set helpers, getStoredRegionFor, STORE_SEARCH_REGION_CODES)
  - shared hookless RegionPicker component (Auto option, optional currency pill)
  - Store Search region picker on the title row (persisted, re-runs the committed search)
  - 47-UI-SPEC section 1a (G-47-8 amendment)
affects: [47-18 (moves Deals onto RegionPicker)]
tech-stack:
  added: []
  patterns: [one shared localStorage value validated per screen against that screen's own list, hookless shared component with every string passed as a prop]
key-files:
  created:
    - src/frontend/helpers/storeRegion.ts
    - src/frontend/components/UI/RegionPicker/index.tsx
    - src/frontend/components/UI/RegionPicker/index.css
    - src/frontend/components/UI/RegionPicker/__tests__/RegionPicker.test.tsx
  modified:
    - src/frontend/screens/Discounts/helpers.ts
    - src/frontend/screens/StoreSearch/index.tsx
    - src/frontend/screens/StoreSearch/index.css
    - src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx
    - .planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-UI-SPEC.md
key-decisions:
  - 'Task 1 (operator decision, verbatim id "itad-list"): Store Search offers ITAD''s 32 priced countries (ITAD_PRICED_COUNTRIES); Deals keeps its 29 REGION_OPTIONS'
  - 'No currency pill on Store Search: ITAD currency differs from GOG''s for 11 of the 29 Deals countries; the ISO code on the price is the truthful label (Currency Contract rule 7)'
  - 'Storage key stays discounts.regionOverride (no migration); a stored code outside a screen''s list reads as Auto on that screen (T-47-53)'
  - 'The override is not routed through getLocaleSettings in Store Search (it drops codes outside REGION_OPTIONS, which would discard NZ, AR, IE, AT, BE, IN)'
requirements-completed: [PRICE-01]
duration: 25min
completed: 2026-11-18
status: complete
actuals:
  tokens: 30000
  tasks: 3
  commits: 2
plan_head_before: d920e7e4da317327b280be1df3b9a44cc7b742e6
plan_head_after: 246393f5c9d02284b71f7bccc72eb9bda51fd171
---

# Phase 47 Plan 16: Store Search gets its own price-region picker (G-47-8, part 1) Summary

Store Search now has a region picker on its title row (shared `RegionPicker`, offering ITAD's 32 priced countries plus Auto); a change persists under the existing key and re-runs the committed search once in that country.

## Task 1 decision (recorded verbatim)

Answered by the operator before dispatch: **`itad-list`**. Store Search offers `ITAD_PRICED_COUNTRIES` (32); the Deals screen keeps its 29 `REGION_OPTIONS`. Because the two screens share one stored value, a country picked on one screen that the other cannot price shows as Auto on the other until changed there. Recorded in the `storeRegion.ts` header, the UI-SPEC section 1a, and the key-decisions above. This is a decision checkpoint, not a code task, so it has no commit.

## What was built

**Task 2 (tracer, TDD), commit `ed0d5e6fe`.** `src/frontend/helpers/storeRegion.ts` now holds COUNTRY_CURRENCY_MAP, REGION_OPTIONS, the i18n extractor comment block, the storage key (value unchanged, `discounts.regionOverride`), set/get helpers and `getLocaleSettings`, moved unchanged. New: `getStoredRegionFor(allowed)` (returns the stored code only if in `allowed`), with `getStoredRegionOverride` re-implemented over it so Deals behaves identically, and `STORE_SEARCH_REGION_CODES` (= `ITAD_PRICED_COUNTRIES`, an array, no module-scope Set). `Discounts/helpers.ts` re-exports the four moved names, so `Discounts/index.tsx` and `localeSettingsLanguageForm.test.ts` are untouched and green. `RegionPicker` is hookless: an MUI Select whose first item is Auto, then options sorted by label for the locale, an optional currency pill, and `onChange('' -> null)`. `StoreSearch/index.tsx` holds `regionOverride` state seeded from `getStoredRegionFor(STORE_SEARCH_REGION_CODES)`, `autoCountry` from the language, `countryCode = regionOverride ?? autoCountry`, a `handleRegionChange` that does not touch Deals filters, and the picker beside the title. Five new tests in `StoreSearchScreen.test.tsx` (mount defaults with 32 codes and no pills; pick DE persists, updates the caption and re-searches in DE; Auto removes the override and returns to US; stored NZ honoured at mount; stored IL treated as Auto). The tests were written first and seen red (six failures) before the implementation.

**Task 3 (TDD), commit `246393f5c`.** `RegionPicker/index.css` hoists the Deals picker rules under component classes, tokens only (the `rgba()` values for the pill and divider fallback are carried over verbatim from Deals), with `.regionPicker__currency` top-level for the MUI portal and the 700px rule. `StoreSearch/index.css` gains `.storeSearchScreen__topbar` and the header's bottom margin moves onto it. `RegionPicker.test.tsx` (six cases, no `jest.mock`) covers root/label, Auto first then locale-sorted options, pill only with a currency, `renderValue`, and `'' -> null`. `47-UI-SPEC.md` section 1 no longer says "No picker this phase"; new "### 1a. Region picker (amended 2026-11-18, gap G-47-8, plan 47-16)", the D3 upstream-decision row marked superseded for Store Search, and a new Interaction summary row.

## Verification

- Frontend jest project: 362 suites passed; the only failure is the known pre-existing `themeTokens.test.ts` render-site census (.is-link 39 vs 34), out of scope.
- Meta `backendDiCeilings` and `hardcodedStringGate`: 308 passed; the real RegionPicker imports cleanly in the StoreSearch test, so no `jest.mock` was added and no ceilings entry changed (stays 7).
- `pnpm codecheck` clean; `pnpm lint:src` exit 0; `prettier --check` clean over every written path (47-UI-SPEC.md is prettier-ignored, no check applies).
- Acceptance greps: `discounts.regionOverride` 1 in storeRegion.ts and 0 in Discounts/helpers.ts; `getStoredRegionFor(STORE_SEARCH_REGION_CODES)` 1; `frontend/screens/Discounts/helpers` in StoreSearch 0; `<RegionPicker` 1; `useTranslation` in RegionPicker 0; `^.regionPicker__currency` 1; hex colours in RegionPicker css 0; `storeSearchScreen__topbar` in css 1; "No picker this phase" 0; "G-47-8" in UI-SPEC 3.
- Human check (macOS, `pnpm tauri:dev`, never `tauri:dev:run`; both dark and light themes): picker placement and styling on the Store Search title row, changing Germany then New Zealand then Auto re-runs the 'xcom' search, persistence across leaving and re-opening. Not run here; harvested at end of phase per the plan.

## Deviations from Plan

None in behaviour. Two process notes:

- **TDD commit shape.** The plan lists one tracer commit for Task 2, so the RED test file and the implementation went in a single commit (`ed0d5e6fe`) rather than a separate `test(...)` RED commit; the red state was observed locally (6 failures) before the implementation.
- **Test harness.** The plan's fallback (mock RegionPicker, raise the ceiling 7 to 8) was not needed.

## Threat Flags

None. T-47-53 is mitigated by `getStoredRegionFor`; the backend's `normalizeCountry` is unchanged. T-47-54 accepted as planned.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/frontend/helpers/storeRegion.ts, src/frontend/components/UI/RegionPicker/{index.tsx,index.css,__tests__/RegionPicker.test.tsx}
- FOUND commits ed0d5e6fe, 246393f5c (ancestors of HEAD)
