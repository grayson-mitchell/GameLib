---
phase: 19-crossover-compatibility-index-macos
plan: 07
subsystem: ui
tags: [react, i18n, jest, gamecard, badge, macos]

requires:
  - phase: 19-06
    provides: crossoverRatings zustand slice (Record<string, number | null>) with pull/push IPC wiring

provides:
  - CrossoverBadge component — pure tier-derivation (5/4/3/<=2/null/undefined -> gold/silver/bronze/wontRun/unknown/no-element)
  - gameCardCrossoverBadge CSS dot (base + 5 tier variants) on GameCard/index.css
  - GameCard grid tile wired to render the badge from crossoverRatings[appName]
  - Five library.crossover_* i18n keys

affects: [19-crossover-compatibility-index-macos, library-grid-ui]

tech-stack:
  added: []
  patterns:
    - "Direct-invocation component test (no jsdom): mock react-i18next's t(key, default) -> default, call the component as a plain function, assert on the returned element's .props"
    - "Tier-derivation-in-UI badge: raw index value stays a simple type (number|null), tier/label/CSS-class are computed client-side from that value, never stored upstream (D-12)"
    - "D-16 three-state map contract: undefined key -> no element, null value -> neutral 'unknown' mark, numeric value -> tier mark"

key-files:
  created:
    - src/frontend/screens/Library/components/GameCard/CrossoverBadge.tsx
    - src/frontend/screens/Library/components/GameCard/__tests__/CrossoverBadge.test.tsx
  modified:
    - src/frontend/screens/Library/components/GameCard/index.tsx
    - src/frontend/screens/Library/components/GameCard/index.css
    - public/locales/en/translation.json

key-decisions:
  - "Tier derivation lives entirely inside CrossoverBadge (5->gold, 4->silver, 3->bronze, <=2->wontRun, null->unknown, undefined->no element) — no medal/label field is read from the crossoverRatings slice, matching D-12"
  - "Badge renders as a sibling of gameCardDelistedBadge inside the same wrapper div, reusing the existing position:absolute/z-index/pointer-events overlay idiom rather than inventing new stacking rules"

patterns-established:
  - "Grid corner-overlay badges follow a fixed occupancy map: top-right (store-icon), top-left (status/delisted), top banner (update), bottom-right (crossover medal) — new badges must pick an unused corner/band"

requirements-completed: [CXIDX-10, CXIDX-11]

duration: ~15min
completed: 2026-07-13
---

# Phase 19 Plan 07: CrossOver Medal Badge on Library Grid Tiles Summary

**Adds a bottom-right colored medal dot to macOS `GameCard` grid tiles, deriving gold/silver/bronze/red/unknown tiers client-side from the `crossoverRatings` zustand slice, with the descriptive sentence carried only in `title`/`aria-label`.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-13T23:57:57Z
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `CrossoverBadge` pure component: derives tier from a raw `number | null | undefined` rating, returns `null` when the game was never looked up (D-16 honesty invariant), renders a neutral "unknown" dot for a looked-up miss, and a tier-colored dot for a 1-5 rating
- Full CSS treatment for the medal dot (bottom-right 10px circular overlay, five `--status-*`-token variant classes, no new hex values) that doesn't collide with the three existing grid badges
- `GameCard/index.tsx` reads `crossoverRatings[appName]` synchronously off the already-loaded zustand slice (no fetch/scrape triggered by rendering, D-13) and renders `<CrossoverBadge />`
- Five `library.crossover_*` i18n keys added, mirroring the existing `library.delisted` key placement

## Task Commits

Each task was committed atomically:

1. **Task 1a: RED — failing CrossoverBadge test** - `e2f1748d` (test)
2. **Task 1b: GREEN — CrossoverBadge implementation** - `8c7b4d9d` (feat)
3. **Task 2: Medal-dot CSS** - `aa00b80a` (feat)
4. **Task 3: Wire badge into GameCard + i18n keys** - `8447826d` (feat)

_TDD task (Task 1) produced two commits: test (RED) then feat (GREEN), no refactor step needed._

## Files Created/Modified
- `src/frontend/screens/Library/components/GameCard/CrossoverBadge.tsx` - pure tier-derivation component, empty visible glyph, full sentence in title/aria-label
- `src/frontend/screens/Library/components/GameCard/__tests__/CrossoverBadge.test.tsx` - 9 direct-invocation unit tests covering all tier/render-state combinations
- `src/frontend/screens/Library/components/GameCard/index.tsx` - selects `crossoverRatings` from the slice, computes `crossoverRating = crossoverRatings[appName]`, renders `<CrossoverBadge rating={crossoverRating} />`
- `src/frontend/screens/Library/components/GameCard/index.css` - `.gameCardCrossoverBadge` base rule + five `--gold/--silver/--bronze/--wontRun/--unknown` variant rules
- `public/locales/en/translation.json` - `library.crossover_gold/silver/bronze/wont_run/unknown` keys

## Decisions Made
- Tier derivation (5→gold, 4→silver, 3→bronze, ≤2→wontRun, null→unknown, undefined→no element) is computed entirely inside `CrossoverBadge`, never read as a pre-labeled field off the index — enforces D-12 (index schema stays `{macRating, linuxRating, slug}`, no `medal` field) and keeps the honesty invariant (D-16) auditable in one place.
- The badge is rendered unconditionally (no `is.mac` guard) because `crossoverRatings` map absence already yields `undefined` for every non-macOS/never-looked-up tile, which `CrossoverBadge` turns into "no element" — adding a platform guard would have been redundant and risked accidentally suppressing a legitimately-looked-up rating.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The grid-badge surface (D-15/D-16) for CXIDX-10/CXIDX-11 is complete and verified (9/9 unit tests, no new tsc/eslint errors).
- Remaining phase 19 work per the roadmap (waves after this one): D-17 CrossOver-rating library filter (`LibraryFilters`/`Library/index.tsx`) and D-18 non-blocking install-modal warning (`WineSelector`) are separate, not-yet-executed plans in this phase — this plan does not touch either.

---
*Phase: 19-crossover-compatibility-index-macos*
*Completed: 2026-07-13*

## Self-Check: PASSED

All 6 claimed files found on disk; all 4 claimed commit hashes (e2f1748d, 8c7b4d9d, aa00b80a, 8447826d) found in git log.
