---
phase: 16-crossover-compatibility-rating-codeweavers
plan: 03
subsystem: frontend
tags: [frontend, gamepage, extra-info, codeweavers, crossover, rating, stars]

# Dependency graph
requires:
  - phase: 16-crossover-compatibility-rating-codeweavers
    plan: 01
    provides: "CodeweaversInfo type (rating/ratingCount/slug) + WikiInfo.codeweavers field"
  - phase: 16-crossover-compatibility-rating-codeweavers
    plan: 02
    provides: "codeweavers data populated end-to-end in WikiInfo (fetch -> cache -> return) on Mac + Linux"
provides:
  - "Extra-info CrossOver rating row renders live CodeWeavers data as a 5-star display (SC-01)"
  - "Graceful 'No compatibility data available' miss state for genuine soft-404 misses (SC-03, D-09)"
  - "CrossOver row renders independently of applegamingwiki so it appears on Linux (D-08)"
  - "CrossOver deep-link uses codeweavers.slug (works even when AppleGamingWiki data is absent)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MUI Rating (readOnly, precision=0.5, max=5) for a read-only star display of a numeric aggregateRating"
    - "Pure count-label helper (formatCrossoverRating) + null-miss sentinel, star value fed directly to the component"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/crossoverRating.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/crossoverRating.test.ts
  modified:
    - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
    - public/locales/en/gamepage.json
    - src/frontend/jest.config.js

key-decisions:
  - "CrossOver row renders a 5-star MUI Rating (checkpoint feedback) matching the CodeWeavers site, instead of numeric '5 / 5 (N ratings)' text — rating count kept as a text label beside the stars"
  - "CrossOver row decoupled from applegamingwiki: gated only on `codeweavers` presence so it renders on Linux where AppleGamingWiki is not fetched (D-08)"
  - "Wine row left exactly as-is (AppleGamingWiki + ratingTier, D-06)"
  - "Genuine miss (codeweavers.rating === null) renders the 'No compatibility data available' i18n string — no stars, no zero-star row (D-09), distinguished from a real 0"

requirements-completed: [SC-01, SC-03, D-05, D-06, D-08, D-09]

# Metrics
duration: ~35min
completed: 2026-07-10
---

# Phase 16 Plan 03: Live CrossOver Rating Row (Mac + Linux) Summary

**The extra-info "Crossover rating" row now renders live CodeWeavers data as a 5-star display (half-star precision) with a rating-count label, independently of AppleGamingWiki so it appears on Linux, with a graceful "No compatibility data available" state for genuine misses; the Wine row is unchanged. Human-verified on the app and approved.**

## Performance

- **Duration:** ~35 min (Tasks 1-2 ~20 min + checkpoint-feedback star fix ~15 min)
- **Completed:** 2026-07-10
- **Tasks:** 3 (2 code tasks + 1 human-verify checkpoint, approved)
- **Files created:** 2 · **Files modified:** 3

## Accomplishments
- Added `formatCrossoverRating` helper — after checkpoint feedback, refactored to return the rating-count label text (`"(N rating[s])"`) or `null` on a miss; the numeric value feeds the star component directly
- Rewired `AppleWikiInfo.tsx`: broke the `applegamingwiki` coupling so the CrossOver row is gated only on `codeweavers`, renders a 5-star `<Rating value={rating} precision={0.5} max={5} readOnly />` on a hit, and the "No compatibility data available" i18n string on a genuine miss
- Deep-links the CrossOver row via `codeweavers.slug` (falls back to a CodeWeavers search URL when slug/data absent)
- Added the `info.no-compatibility-data` i18n key to `gamepage.json`
- Left the Wine rating row untouched (AppleGamingWiki + `ratingTier()`, D-06)

## Task Commits

1. **Task 1: formatCrossoverRating helper + test** - `271e4381` (test/RED), `5df90e7e` (feat/GREEN)
2. **Task 2: Rewire AppleWikiInfo row + miss state + i18n key** - `bd23aa3c` (feat)
3. **Checkpoint-feedback fix: render CrossOver rating as stars** - `e90f69d0` (feat)
4. **Task 3: Human-verify checkpoint** - approved by user (visual verification on the running app)

## Files Created/Modified
- `src/frontend/screens/Game/GamePage/components/crossoverRating.ts` (created) - count-label helper + null-miss sentinel
- `src/frontend/screens/Game/GamePage/components/__tests__/crossoverRating.test.ts` (created) - updated for the count-label contract
- `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` (modified) - decoupled CrossOver row, MUI star Rating, miss state, slug deep-link
- `public/locales/en/gamepage.json` (modified) - `info.no-compatibility-data` key
- `src/frontend/jest.config.js` (modified) - `testMatch` extended to include `*.test.ts` (see Deviations)

## Decisions Made
- **Star display over numeric text** (user checkpoint feedback): the CrossOver row uses MUI `Rating` in read-only mode with half-star precision to mirror the CodeWeavers website's presentation. The rating count remains as adjacent text.

## Deviations from Plan

1. **[Rule 3 - Blocking] Frontend `jest.config.js` `testMatch` extended to pick up `*.test.ts`.** The plan's test file `crossoverRating.test.ts` is a pure-function test (plain `.ts`), but the frontend jest `testMatch` was `.tsx`-only, so the new test was silently skipped ("No tests found"). Added `'**/__tests__/**/*.test.ts'` alongside the existing `.tsx` pattern. Committed in `271e4381`.

2. **Checkpoint-feedback display change (star rating).** The plan specified a numeric "X / 5 (N ratings)" render; the human-verify checkpoint surfaced a user request to display stars like the CodeWeavers site. Implemented via MUI `Rating` and the helper was refactored to a count-label producer. Committed in `e90f69d0`.

## Issues Encountered

- The repo's `pnpm lint` script hardcodes `.` and fails on an unrelated pre-existing file (`spike/crossover-compat-lookup.mjs`, a parserOptions/type-info config gap) — out of scope for this plan and not touched by it. Verified touched files lint-clean via scoped `eslint --cache <files>` instead.

## User Setup Required

None.

## Next Phase Readiness
- Delivers the user-visible outcome (SC-01, SC-03). CrossOver compatibility now shows live CodeWeavers star ratings on Mac and Linux with a graceful miss state.
- Out-of-scope follow-up (per plan, not this phase): `applegamingwiki.crossoverRating` and its `crossoverRatingRegEx` fetch/parse in the AppleGamingWiki backend are now dead/unused and can be removed as optional post-phase cleanup.

---
*Phase: 16-crossover-compatibility-rating-codeweavers*
*Completed: 2026-07-10*

## Self-Check: PASSED

All created/modified files verified present on disk; commits `271e4381`, `5df90e7e`, `bd23aa3c`, `e90f69d0` verified present in git log on main. `pnpm codecheck` exits 0; full jest suite (836 tests) passes; human-verify checkpoint approved by user.
