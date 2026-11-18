---
status: diagnosed
trigger: "region-picker-auto-shows-blank: When the region is Auto, the region select displays 'Auto (...)', never a blank value (G-47-14a, UAT test 14)"
created: 2026-11-19T00:00:00Z
updated: 2026-11-19T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED. RegionPicker's Select omits displayEmpty, so MUI never calls renderValue for value '' and renders a zero-width space (blank) for Auto.
test: SSR render of the real RegionPicker with value=null vs 'DE' (done); counter-test with displayEmpty added in a scratchpad copy (done).
expecting: n/a, both confirmed (null -> blank, DE -> 'Germany · EUR'; with displayEmpty null -> 'Auto (US · USD)').
next_action: none (diagnosis complete); hand back to caller for a fix plan (add displayEmpty plus a render-level test).

## Symptoms

expected: Stores > Deals and Stores > Store Search share one region (localStorage `discounts.regionOverride`, helpers now in src/frontend/helpers/storeRegion.ts after gap-closure plans 47-16/47-18). Picking New Zealand on Store Search, then going back to Deals, Deals shows 'Auto (...)' (the language-default label). Choosing Auto in either picker shows 'Auto (...)'.
actual: "Auto select shows as blank"
errors: None reported
reproduction: Test 14 in UAT (47-18 live item). Stores > Deals / Store Search region picker with Auto selected (or after choosing a region on Store Search that is not in the Deals option list, e.g. New Zealand).
started: Discovered during UAT 2026-11-19. Picker was extracted/shared in gap-closure plans 47-16 and 47-18.

## Eliminated

## Evidence

- timestamp: 2026-11-19
  checked: .planning/debug/knowledge-base.md for region/auto/select patterns
  found: no matching prior resolution
  implication: no known-pattern candidate; investigate from scratch

- timestamp: 2026-11-19
  checked: src/frontend/components/UI/RegionPicker/index.tsx
  found: Select has value={value ?? ''}, a MenuItem value="" labelled autoLabel, and renderValue whose first branch is `if (!selected) return autoLabel`. No displayEmpty prop.
  implication: the Auto branch of renderValue is only reachable if MUI calls renderValue with ''.

- timestamp: 2026-11-19
  checked: node_modules/@mui/material/Select/SelectInput.js lines 332-341 (v5.17.1) and InputBase/utils.js isFilled
  found: renderValue(value) is only invoked inside `if (isFilled({value}) || displayEmpty)`. isFilled returns false for value === ''. When display is empty (isEmpty(display)) the node renders a `<span class="notranslate">&#8203;</span>` (lines 460-463).
  implication: with value '' and no displayEmpty, MUI renders a zero-width space: a blank select. Matches the symptom.

- timestamp: 2026-11-19
  checked: grep displayEmpty across src and git log -S displayEmpty -- src
  found: zero hits, never present in history
  implication: no screen in the repo has ever passed displayEmpty; the Auto branch of renderValue was never live.

- timestamp: 2026-11-19
  checked: git show c7219df23^:src/frontend/screens/Discounts/index.tsx (pre-extraction inline Deals Select)
  found: identical shape (value={regionOverride ?? ''}, renderValue with `if (!value)` auto branch, MenuItem value="", no displayEmpty)
  implication: the defect is NOT introduced by the extraction; it was carried over verbatim from the Deals inline Select. The 47-16 Store Search picker inherited it.

- timestamp: 2026-11-19
  checked: src/frontend/components/UI/RegionPicker/__tests__/RegionPicker.test.tsx
  found: tests call RegionPicker() as a plain function and invoke the `renderValue` prop directly (`renderValue(root, '')` -> 'Auto (United States)'); no jsdom, MUI Select never actually renders
  implication: the unit tests bypass MUI's `isFilled || displayEmpty` guard, so they assert a branch MUI never executes. That is why the defect shipped green.

- timestamp: 2026-11-19
  checked: SSR experiment. esbuild-bundled the REAL src/frontend/components/UI/RegionPicker/index.tsx and rendered it with react-dom/server (scripts in the session scratchpad, nothing in the repo touched)
  found: value=null renders the combobox as `<span class="notranslate">&#8203;</span>` (blank). value='DE' renders `Germany · EUR`.
  implication: direct reproduction of the symptom, no i18n or app state involved (autoLabel was a hard-coded non-empty 'Auto (US · USD)').

- timestamp: 2026-11-19
  checked: counter-experiment. Same SSR harness on a scratchpad copy of RegionPicker with only `displayEmpty` added to the Select
  found: value=null renders `Auto (US · USD)`; value='DE' unchanged (`Germany · EUR`)
  implication: displayEmpty alone is sufficient; the label is a plain <label>, not MUI InputLabel, so there is no label/placeholder overlap to worry about.

- timestamp: 2026-11-19
  checked: how each picker derives its value. storeRegion.ts getStoredRegionFor / getStoredRegionOverride; StoreSearch/index.tsx:53-54,153; Discounts/index.tsx:50-51,572
  found: Deals value = getStoredRegionOverride() = getStoredRegionFor(REGION_OPTIONS codes); Store Search value = getStoredRegionFor(STORE_SEARCH_REGION_CODES). Both return null for absent storage OR a stored code outside that screen's list. Both pass `value={regionOverride}` to the same RegionPicker, which maps null -> ''.
  implication: every Auto state on either picker hits the same blank path. Cross-picker case: stored NZ is in the 32-country ITAD list but not the 29-country REGION_OPTIONS, so Deals gets null -> '' -> blank; this is the Auto the operator expected to read 'Auto (...)'. The data/validation layer behaves exactly as designed (47-16 key decision T-47-53); only the closed-select display is wrong.

- timestamp: 2026-11-19
  checked: git log -S"regionOverride ?? ''" and sibling usages (grep renderValue / MuiSelect / displayEmpty in src)
  found: the `value={regionOverride ?? ''}` + `if (!value) return auto label` shape came in with the original Deals picker (927f1565c, 2026-04-22); RegionPicker is the only renderValue user in src; no theme override of MuiSelect sets displayEmpty
  implication: latent defect predating phase 47; 47-16/47-18 extraction copied it verbatim and added a second picker that inherits it. Not a regression introduced by the extraction. Open dropdown is unaffected (MenuItem value="" is selected and labelled).

## Resolution

root_cause: RegionPicker's MUI Select (src/frontend/components/UI/RegionPicker/index.tsx, Select at lines 50-67) represents Auto as value '' and handles it in renderValue (`if (!selected) return autoLabel`), but MUI v5.17.1 SelectInput only calls renderValue when `isFilled({value}) || displayEmpty` (SelectInput.js:333-341) and isFilled is false for ''. `displayEmpty` is not set, so renderValue never runs for Auto and MUI renders its zero-width-space placeholder (SelectInput.js:460-463): a blank closed select. Affects both pickers in every Auto state (Auto chosen, nothing stored, or a stored code the screen's own list does not offer such as NZ on Deals). The renderValue Auto branch is dead code. Unit tests missed it because RegionPicker.test.tsx invokes the renderValue prop directly and never renders MUI's Select (no jsdom).
fix: (diagnose-only, not applied) add `displayEmpty` to the Select in RegionPicker. One prop; verified in a scratchpad copy.
verification: SSR reproduction of the blank on the real component and of the fix on a scratchpad copy (see Evidence). Fix not applied to the repo.
files_changed: []
