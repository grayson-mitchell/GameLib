---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 21
subsystem: ui
tags: [css, theming, store-search, deals, gap-closure, color-mix]

requires:
  - phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
    provides: Store Search rows (20-05) and the Deals filter panel
provides:
  - Store Search rows and the Deals filter panel paint the theme's title-plate token, light in Nord Light and dark in the dark themes
  - Hover and count-pill tints derived from --text-default via color-mix, visible on light and dark surfaces
  - rowSurfaceTheme.test.ts, a stylesheet ban on the overlay gradient plus a per-theme contrast and light-row check over all ten built-ins
affects: [store-search, deals, theming]

actuals:
  tokens: 4200
  tasks: 2
  commits: 4
plan_head_before: 40036a05df16d4c77026cab75cd74342b72c1745
plan_head_after: 10b7251bd2cb61f9addbdc1228e1a55a8a41df40

tech-stack:
  added: []
  patterns:
    - "A surface that must survive every theme uses a token each theme sets (--gamecard-title-color), never the overlay gradient whose first stop is a hardcoded black"
    - "Hover and pill tints are color-mix(in srgb, var(--text-default) N%, transparent), never a white-alpha literal"

key-files:
  created:
    - src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts
  modified:
    - src/frontend/screens/StoreSearch/index.css
    - src/frontend/screens/Discounts/components/DiscountFilters/index.css

key-decisions:
  - "Row and panel surface is background: var(--gamecard-title-color), the Library tile title-plate token; chosen over a transparent row so rows keep their bar shape in every theme"
  - "White-alpha hover and pill literals became color-mix tints of --text-default (8% hovers, 12% count pill) because a light Deals panel would otherwise hide them"
  - "var(--divider, ...) and var(--text-secondary, ...) fallbacks and all layout rules in DiscountFilters stay untouched (plan 47-22 edits the autocomplete and grid rules next)"

requirements-completed: [PRICE-01]

duration: 4min
completed: 2026-11-19
status: complete
---

# Phase 47 Plan 21: Theme-safe Store Search rows and Deals filter panel Summary

**Store Search rows and the Deals filter panel switched from the hardcoded-black card-art gradient to the themeable `--gamecard-title-color` plate, with text-colour `color-mix` hover tints, pinned across all ten built-in themes by a stylesheet and contrast test (G-47-12c)**

## Performance

- **Duration:** about 4 min
- **Started:** 2026-11-18T18:36:23Z
- **Completed:** 2026-11-18T18:40:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `.storeSearchRow` now uses `background: var(--gamecard-title-color)`; the breakdown-item hover is `color-mix(in srgb, var(--text-default) 8%, transparent)`. The thumbnail rule (G-47-7) is untouched.
- `.discountFilters` uses the same plate. The toggle hover and OS segment hover are 8% text-colour tints; the genre count pill is a 12% tint.
- `rowSurfaceTheme.test.ts` has two halves. The stylesheet half bans any `background` or `background-color` that references `gradient-gamecard` or is a white-alpha rgba literal, in both stylesheets, and pins each rule by exact selector. The token half composites the plate over each built-in theme's body and requires `--text-default` and `--text-secondary` to reach 4.5:1, and a light-bodied theme to get a light plate (nord-light is the non-vacuous case).

## Task Commits

1. **Task 1 (tracer): Store Search rows use the theme's title-plate surface**
   - RED `138dfdb93` test(47-21): 4 stylesheet cases failed on the planned assertions, the token half passed
   - GREEN `b65f79a35` feat(47-21)
2. **Task 2: Deals filter panel gets the same surface and tints**
   - RED `d3d04d36a` test(47-21): 6 cases failed (panel surface, three tints, gradient and white-alpha bans on the new stylesheet)
   - GREEN `10b7251bd` feat(47-21)

The tracer gate re-ran Task 1's `<verify>` (both Store Search suites, `lint:src`, scoped prettier) and it passed before Task 2 started.

## Verification

- `rowSurfaceTheme.test.ts` (42 cases) and `storeSearchThumbBox.test.ts` pass.
- `pnpm lint:src`: exit 0, 0 errors (962 pre-existing warnings, none in these files).
- `npx prettier --check` over the three written paths: clean.
- Acceptance greps (comments stripped): StoreSearch gradient-gamecard 0, `background: var(--gamecard-title-color)` 1, white-alpha 0, `aspect-ratio: 300 / 140` 1; DiscountFilters gradient-gamecard 0, white-alpha 0, plate 1, `@media (max-width: 1100px)` 1.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Human Check Outstanding

Task 2's `<human-check>` (visual check in Nord Light, midnightMirage, gruvbox_dark and dracula via `pnpm tauri:dev`) is harvested at end of phase and has not been run. The automated half measures contrast and the stylesheet text only; it cannot prove WebKit paints a light bar.

## Threat Flags

None. Stylesheet-only change.

## Next Phase Readiness

Ready for 47-22, which edits the autocomplete and grid rules in `DiscountFilters/index.css`; this plan left those untouched.

## Self-Check: PASSED

- FOUND: src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts
- FOUND commits 138dfdb93, b65f79a35, d3d04d36a, 10b7251bd
