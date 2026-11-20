---
status: diagnosed
trigger: "G-47-14b (47-UAT Test 14, issue 2): The Deals Genres filter control never crops or re-centres at narrow window widths, and selected genres stay inside the control's box"
created: 2026-11-19
updated: 2026-11-19
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
  status: diagnosed
---

## Current Focus

hypothesis: CONFIRMED. `.discountFilters__autocomplete .MuiInputBase-root` (DiscountFilters/index.css:269-275) pins a multi-value MUI Autocomplete to `height: 40px; overflow: hidden`. Chips cannot shrink and `limitTags` only truncates while NOT focused, so a focused control wraps (or runs) past 40px; the overflow:hidden box is then scrolled by the browser to reveal the caret, shifting/cropping chips and detaching the absolutely-positioned notched outline from the content.
test: scratchpad Chrome harness (esbuild bundle of the real DiscountFilters + real CSS + real MUI 5.17.1 theme) at widths 1101-1500 with 0-5 genres, focused/unfocused; then CSS override (height:auto, overflow:visible) as the falsification test.
expecting: n/a - confirmed
next_action: return ROOT CAUSE FOUND to caller (goal: find_root_cause_only). No source modified.

## Symptoms

expected: Stores > Deals filter panel: the Genres control stays fully visible at any window width; selecting several genres keeps the chips/values inside the control's box.
actual: "windows size formating broken for Genres field control. if runs out of space the control gets centered and cropped. control should never crop. also adding more genres starts happening outside of the box!"
errors: None reported
reproduction: Test 14 in UAT; macOS `pnpm tauri:dev`, Stores > Deals, narrow the window horizontally; then select several genres.
started: Discovered during UAT 2026-11-19. Gap-closure plan 47-18 touched the Deals region picker area (shared RegionPicker); determine whether this is a 47-18 regression or pre-existing.

## Eliminated

- hypothesis: 47-18 regression (shared RegionPicker refactor changed Deals layout/CSS)
  evidence: c7219df23 (47-18) touched only Discounts/index.css (removed .discountsScreen__region* rules) and Discounts/index.tsx (inline Select -> RegionPicker). DiscountFilters/index.tsx and index.css were not touched. The offending CSS block came in with the original upstream Deals page commit 927f1565c (2026-04-22). Region picker lives in the topbar, outside the filter grid.
  timestamp: 2026-11-19
- hypothesis: Genres crops because of the app-level layout (page/NavShell) clipping the filter panel
  evidence: harness reproduces the crop with the control inside a plain div; the clipping box is the Autocomplete's own `.MuiInputBase-root` (rootH stays 40 while scrollH is 64-160, scrollTop 18-50).
  timestamp: 2026-11-19

## Evidence

- timestamp: 2026-11-19
  checked: git log / git show c7219df23 (47-18) for Discounts files
  found: 47-18 did not touch DiscountFilters. Block originates in 927f1565c (upstream Heroic Deals page).
  implication: Pre-existing, not a 47-18 regression.
- timestamp: 2026-11-19
  checked: DiscountFilters/index.css:269-279 and index.tsx:85-157 (MultiSelectChips)
  found: `.discountFilters__autocomplete .MuiInputBase-root { height: 40px; overflow: hidden; align-items: center; flex-wrap: nowrap; padding-block: var(--space-3xs) }`. Component uses `Autocomplete multiple limitTags={2}` with a custom `renderTags` that returns every chip; wrapped in a Tooltip that shows all chips when >3 selected.
  implication: Fixed-height clipping box around content whose size is unbounded by selection count.
- timestamp: 2026-11-19
  checked: node_modules/@mui/material/Autocomplete/Autocomplete.js lines 232 and 552-559
  found: MUI sets `.MuiAutocomplete-inputRoot { flex-wrap: wrap }` for `multiple` (selector specificity 0,2,0, identical to the app's `.discountFilters__autocomplete .MuiInputBase-root`); `limitTags` only truncates `if (!focused && more > 0)`.
  implication: (a) while focused ALL chips render regardless of limitTags; (b) whether the app's `nowrap` or MUI's `wrap` wins is a source-order tie, i.e. decided by when emotion's tags vs the Discounts CSS are inserted.
- timestamp: 2026-11-19
  checked: headless Chrome harness, app CSS linked BEFORE emotion (MUI wins tie -> flex-wrap computed `wrap`), content width = viewport - 256px tier-2 panel
  found: vw=1500 (content 1244): Genres 290px; focus with 2 genres -> root scrollTop 18, scrollH 64 vs clientH 40. vw=1300 (content 1044): Genres 221px; 3 genres focused -> scrollTop 50, scrollH 112. vw=1101 (content 845): Genres 152px; ONE genre unfocused already wraps (scrollH 64, input row at +30px, clipped); 2 genres focused -> scrollTop 48. Screenshots show the top chip cut off, the chip row displaced mid-box, and the blue focus outline scrolled up out of the box.
  implication: Reproduces "centered and cropped" and "genres outside the box": overflow:hidden root is scrolled to reveal the caret; the MUI notchedOutline fieldset is position:absolute inside that scroller so it scrolls with the content and no longer frames the visible box.
- timestamp: 2026-11-19
  checked: same harness, app CSS linked AFTER emotion (app `nowrap` wins)
  found: single-line variant. 5 genres focused at vw=1400: chips run Action 237 -> Simulation 714 against a box ending at x=561; chips slide under the absolutely-positioned clear/popup icons ("Role-play" overlapped by the X) and the caret/input sits at x=716, outside the box.
  implication: Same defect in the other cascade order: chips cropped on the right and overrun the end adornments. Either order violates "never crop".
- timestamp: 2026-11-19
  checked: Tooltip in MultiSelectChips (disableHoverListener only when selected.length <= 3)
  found: with 4+ genres, hover OR focus (Tooltip listens to focus too) pops a bubble below the control holding every chip (screenshot at vw=1400, n=5). It is the only place all chips are visible, and it sits outside the control box.
  implication: Contributes to "adding more genres starts happening outside of the box"; it is a workaround for the clipped box, redundant once the control can hold its chips.
- timestamp: 2026-11-19
  checked: falsification - harness-only CSS override `height:auto; min-height:40px; overflow:visible` on the same selector (scratchpad copy; source untouched)
  found: scrollTop 0, scrollH == clientH (rootH grows 88px at 2 genres, 160px at 5 genres at vw=1101); chips and outline stay together inside the box. Control is never cropped.
  implication: confirms the fixed height + overflow:hidden pair as the cause, not the grid column width alone (narrow columns only make it trigger sooner).
- timestamp: 2026-11-19
  checked: shared cause with G-47-14c
  found: breakpoints are viewport media queries (`max-width: 1100px` -> 2 cols, `700px` -> 1 col, DiscountFilters/index.css:215-227) but the filter panel sits right of the 256px NavShell tier-2 panel (`--tier2-width: 256px`, NavShell/index.scss:25) plus .discountsScreen padding (16px x2) and .discountFilters padding+border (~34px). At vw=1101 the 6-col grid is 180 / 152 / 106 / 76 / 106 / 110px: Genres 152px, Operating system 76px, Suitable for age 106px.
  implication: The 6-col layout is held far too long relative to real content width, which both starves Genres (makes the crop trigger at ordinary widths) and causes the label wrapping in G-47-14c. Fixing the breakpoint (container-aware or raised) reduces how often Genres is cramped but does NOT fix the crop (still reproduces at vw=1500, 2 genres focused).

## Resolution

root_cause: In MultiSelectChips (DiscountFilters/index.tsx:85-157) the multi-value MUI Autocomplete is forced into a fixed `height: 40px; overflow: hidden` box by `.discountFilters__autocomplete .MuiInputBase-root` (DiscountFilters/index.css:269-275). The content is unbounded: `limitTags={2}` only truncates when the control is blurred (MUI Autocomplete.js:552-559), the custom `renderTags` emits every chip, chips never shrink, and MUI forces `flex-wrap: wrap` for multiple (a source-order tie with the app's `nowrap`). Once the control is focused or the column is narrow, the chip row wraps to extra lines (or runs horizontally under the clear/popup icons) beyond 40px; the browser then scrolls the overflow:hidden root to reveal the caret, so chips are shifted and cropped ("centered and cropped") and the absolutely-positioned notched-outline fieldset scrolls away from the visible box ("outside of the box"). With 4+ genres a Tooltip bubble listing all chips also pops out below the box on hover/focus. Pre-existing from upstream Heroic (927f1565c); not a 47-18 regression. Narrow grid columns (viewport-only breakpoints ignoring the 256px nav panel, shared with G-47-14c) make it trigger at ordinary widths, but are not the cause. candidate_causes: code = fixed height+overflow:hidden (confirmed), code = MUI wrap vs app nowrap cascade tie (contributing, order-dependent), code = limitTags disabled on focus (contributing), config/layout = viewport-based breakpoint vs 256px panel (contributing to how soon). and_gate: yes, the crop needs fixed-height clipping AND unbounded chip content; removing either alone stops it.
fix: (diagnosis only - not applied)
verification: (n/a)
files_changed: []
