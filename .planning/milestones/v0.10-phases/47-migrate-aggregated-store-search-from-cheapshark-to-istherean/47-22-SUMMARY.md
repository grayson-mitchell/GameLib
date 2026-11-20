---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 22
subsystem: ui
tags: [css, container-query, deals, autocomplete, gap-closure]

requires:
  - phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
    provides: 47-21 surface and tint rules in DiscountFilters/index.css (same stylesheet)
provides:
  - Deals Genres and Features controls that grow to hold every selected chip, with no hover bubble
  - Deals filter rows that reflow to two columns on the main-content width (container query), before any label wraps
  - filterLayout.test.ts, a CSS and source contract for the autocomplete root and the reflow breakpoint
affects: [deals, discount-filters]

actuals:
  tokens: 5200
  tasks: 2
  commits: 4
plan_head_before: 7a45229495e66e3ed21cb1819363a340f5898799
plan_head_after: 90d8c0cbc2ba5945e2992391334b1be216d2ca87

tech-stack:
  added: []
  patterns:
    - "A multi-value MUI Autocomplete root gets min-height plus flex-wrap, never a fixed height with overflow hidden"
    - "Layout reflow in a screen keys on the named main-content container (App.css), not the viewport, because the tier-2 panel eats 256px+"

key-files:
  created:
    - src/frontend/screens/Discounts/components/DiscountFilters/__tests__/filterLayout.test.ts
  modified:
    - src/frontend/screens/Discounts/components/DiscountFilters/index.css
    - src/frontend/screens/Discounts/components/DiscountFilters/index.tsx

key-decisions:
  - "Kept limitTags={2}: blurred the control shows two chips and +N, focused it grows to show them all inside its outline; the hover bubble was removed because the control can now hold its chips (G-47-14b)"
  - "Reflow switched to @container main-content (max-width: 1239.98px), the WKWebView-validated threshold from the debug session; both the inputs and sliders rows switch together (G-47-14c)"
  - "Deleted the 700px one-column rule instead of converting it: the 900px window minimum meant it never fired, and as a container rule it would fire at the minimum window for no reason"

requirements-completed: [PRICE-01]

duration: 5min
completed: 2026-11-19
status: complete
---

# Phase 47 Plan 22: Deals filter layout gaps Summary

**Genres and Features controls now grow (min-height 40px, flex-wrap) to hold every chip and the hover bubble is gone, and the Deals filters reflow to two columns on the main-content container width (1240px) instead of the viewport, pinned by a stylesheet and source contract test (G-47-14b, G-47-14c)**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-11-18T18:41:22Z
- **Completed:** 2026-11-18T18:46:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `.discountFilters__autocomplete .MuiInputBase-root` is `min-height: 40px; height: auto; flex-wrap: wrap` with no overflow clipping, so the browser no longer scrolls a clipped box to the caret and the notched outline stays around the chips. The inputs grid is `align-items: start`, so a taller control does not stretch its neighbours.
- `MultiSelectChips` lost its hover-bubble wrapper and the unused MUI import; `.discountFilters__tooltipChips` is deleted. `limitTags={2}`, `renderTags`, `renderInput` and the label count pill are unchanged.
- The 1100px viewport media rule became `@container main-content (max-width: 1239.98px)` holding the same two row rules; the 700px one-column rule is deleted. The six-track inputs and three-track sliders defaults are untouched.
- `filterLayout.test.ts` (10 cases) scans the stylesheet by brace depth so a selector inside the container block is never mistaken for a top-level rule, parses declarations by property name (so `min-height` is not read as `height`), and checks `App.css` still declares `container: main-content / inline-size`. The 47-21 `rowSurfaceTheme.test.ts` pins stay green.

## Task Commits

1. **Task 1 (tracer): Genres and Features controls grow to hold their chips**
   - RED `966b24cfb` test(47-22): 5 cases failed at HEAD
   - GREEN `f70d28af1` feat(47-22)
2. **Task 2: Filters reflow to two columns on the content width**
   - RED `cb2d78258` test(47-22): 3 cases failed (no media rules, one container block, both rows to two columns); the 2 guard cases passed at HEAD by design
   - GREEN `90d8c0cbc` feat(47-22)

The tracer gate re-ran Task 1's full `<verify>` (filterLayout, rowSurfaceTheme, hardcodedStringGate 176 cases, codecheck, lint:src, scoped prettier) and it passed before Task 2 started.

## Verification

- filterLayout (10) and rowSurfaceTheme (42) pass: 52 cases.
- hardcodedStringGate (Meta) 176 pass; `pnpm codecheck` exit 0; `pnpm lint:src` 0 errors; `npx prettier --check` over the three written paths clean.
- Acceptance greps (comments stripped): `Tooltip` in index.tsx 0, `tooltipChips` 0, `min-height: 40px` 1, `limitTags={2}` 1, `@media (max-width: 1100px)` 0, `@media (max-width: 700px)` 0, `@container main-content (max-width: 1239.98px)` 1, `minmax(90px, 110px)` 1.

## Deviations from Plan

None - plan executed exactly as written.

## Known Limitations

- The 1240px threshold is tuned to English. A long translation (Russian "Suitable for age" is 35 characters) can still wrap in the six-column layout just above 1240px. The debug session's optional fixed label-row height or subgrid was deliberately not taken.
- A control that grows with its chips can make the filter panel taller (T-47-62, accepted: selection is bounded by the GOG genre and feature lists, and the page scrolls).

## Known Stubs

None.

## Human Check Outstanding

Task 2's `<human-check>` (macOS, `pnpm tauri:dev`, English UI: narrow the window from widest to minimum, with and without a PEGI value showing, and confirm no label wraps; select five genres, confirm the control grows while focused, shows two chips and +3 when blurred, with nothing cropped, nothing popping out and the outline intact) is harvested at end of phase and has not been run. Wrapping depends on WKWebView's synthetic-bold metrics and chip layout on real focus behaviour; jest proves only the stylesheet and markup.

## Threat Flags

None. Stylesheet and markup change only; no new trust boundary.

## Next Phase Readiness

Last plan in phase 47. Phase complete once the harvested human checks (47-21 and 47-22) are run.

## Self-Check: PASSED

- FOUND: src/frontend/screens/Discounts/components/DiscountFilters/__tests__/filterLayout.test.ts
- FOUND commits 966b24cfb, f70d28af1, cb2d78258, 90d8c0cbc
