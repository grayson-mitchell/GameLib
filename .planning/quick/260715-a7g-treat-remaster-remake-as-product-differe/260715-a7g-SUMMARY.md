---
phase: quick-260715-a7g
plan: 01
subsystem: matching
tags: [matching, humble-dedup, store-search-badge, false-positive, jest]

requires:
  - phase: 20
    provides: "Shared fuzzy title matcher (common/matching/titleMatch.ts, D-02) reused by store-search badge resolver and Humble dedup"
provides:
  - "isRemasterFalsePositiveRisk guard in the shared title matcher, treating remaster/remake as distinct products"
  - "normalizeTitle no longer strips 'remastered', preserving the keyword for the guard"
  - "Regression-protected test coverage proving all other EDITION_SUFFIXES and the DLC guard are unaffected"
affects: [store-search, humble-dedup, title-matching]

tech-stack:
  added: []
  patterns:
    - "Product-differentiator guard mirrors the existing DLC false-positive guard structurally (shorter/longer by length, lowercase, longer-.includes-token-shorter-lacks)"

key-files:
  created: []
  modified:
    - src/common/matching/titleMatch.ts
    - src/backend/__tests__/titleMatch.test.ts

key-decisions:
  - "Scope locked to ONLY 'remaster'/'remastered'/'remake' — all other EDITION_SUFFIXES (GOTY, definitive, deluxe, collection, etc.) remain stripped exactly as before"
  - "Guard implemented as isRemasterFalsePositiveRisk, an exact structural mirror of isDlcFalsePositiveRisk, ORed into fuzzyMatch's early-false-return alongside the DLC guard"
  - "Single shared matcher (D-02) is the only file changed for logic — both the Humble dedup surface and store-search badge resolver inherit the fix automatically"

patterns-established: []

requirements-completed: [QUICK-260715-a7g]

duration: 12min
completed: 2026-07-15
---

# Quick Task 260715-a7g: Treat remaster/remake as product differentiators Summary

**Fixed a false-positive "Owned"/duplicate match where an original game title (e.g. "Alan Wake") fuzzy-matched its remaster/remake ("Alan Wake Remastered") because `normalizeTitle()` stripped the word "remastered", collapsing both titles to an identical normalized string with similarity 1.0 — added a `isRemasterFalsePositiveRisk` guard (mirroring the existing DLC guard) to the single shared matcher so both the Humble ownership-dedup surface and the store-search badge resolver inherit the fix.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-15T (session start)
- **Completed:** 2026-07-15T19:25:03Z
- **Tasks:** 2/2 completed
- **Files modified:** 2

## Accomplishments

- Removed `'remastered'` from `EDITION_SUFFIXES` so `normalizeTitle` no longer strips it, while every other suffix (GOTY, definitive, deluxe, collection, etc.) still normalizes away exactly as before.
- Added a new trusted constant `PRODUCT_VARIANT_KEYWORDS = ['remaster', 'remake'] as const` with T-12-01/T-a7g-01-style trusted-constant discipline (substring `.includes()` only, never regex from untrusted input).
- Added and exported `isRemasterFalsePositiveRisk(a, b)`, structurally identical to `isDlcFalsePositiveRisk` (shorter/longer by length, lowercase, longer-`.includes()`-keyword-shorter-lacks).
- Wired the new guard into `fuzzyMatch()` alongside the existing DLC guard, so it returns `false` before the similarity threshold check whenever either guard fires.
- Extended the shared-matcher jest suite with bug-fix coverage (`Alan Wake` vs `Alan Wake Remastered`/`Remake` → false; exact remaster self-match → true) plus regression assertions proving Deluxe Edition, `(Steam)` qualifier, and sequel (`Alan Wake 2`) behavior is unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add remaster/remake product-differentiator guard to the shared matcher** - `2d020c6f` (fix)
2. **Task 2: Extend matcher tests — remaster/remake coverage + edition-suffix regression** - `72ac5d70` (fix)

_Note: docs commit (STATE/PLAN/SUMMARY) handled separately by the orchestrator._

## Files Created/Modified

- `src/common/matching/titleMatch.ts` - Removed `'remastered'` from `EDITION_SUFFIXES`; added `PRODUCT_VARIANT_KEYWORDS` constant, exported `isRemasterFalsePositiveRisk`, and wired it into `fuzzyMatch`'s early-return guard.
- `src/backend/__tests__/titleMatch.test.ts` - Added `isRemasterFalsePositiveRisk` import; new `describe` blocks for the guard and for remaster/remake product-differentiator `fuzzyMatch` behavior; regression assertions for unaffected edition suffixes and sequels.

## Decisions Made

- Kept the fix scoped to exactly `'remaster'`/`'remastered'`/`'remake'` per the user-approved scope lock — did not touch `DLC_KEYWORDS`, the 0.85 threshold, `titleSimilarity`, or the `normalizeTitle` regex loop mechanics.
- Mirrored `isDlcFalsePositiveRisk`'s exact structure for `isRemasterFalsePositiveRisk` rather than introducing a new pattern, keeping the two guards symmetric and easy to reason about together.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` and `<acceptance_criteria>` blocks with no additional fixes required.

## Verification Results

- `npx jest src/backend/__tests__/titleMatch.test.ts --selectProjects Backend`: **21/21 tests passed** (1 suite), including all new remaster/remake and regression cases.
- `npx jest src/backend --selectProjects Backend` (full Backend project): **1087/1087 tests passed** across **50/50 suites**, including `src/backend/humble/__tests__/dedup.test.ts` and `src/backend/discounts/__tests__/storeSearchBadges.test.ts` both green.
- `npm run codecheck` (`tsc --noEmit`): exits 0, no errors.

## Known Stubs

None.

## Threat Flags

None — the plan's own `<threat_model>` (T-a7g-01 ReDoS, T-a7g-02 Tampering) fully covers the new `PRODUCT_VARIANT_KEYWORDS`/`isRemasterFalsePositiveRisk` surface; no additional network endpoints, auth paths, file access, or schema changes were introduced.

## Self-Check: PASSED

- FOUND: `src/common/matching/titleMatch.ts` contains `isRemasterFalsePositiveRisk` and `PRODUCT_VARIANT_KEYWORDS`.
- FOUND: `src/backend/__tests__/titleMatch.test.ts` contains `'Alan Wake Remastered'` test cases.
- FOUND: commit `2d020c6f` in `git log`.
- FOUND: commit `72ac5d70` in `git log`.

## Next Steps

- None required — this was a self-contained bug fix. The shared matcher (D-02) is the only file with logic changes, so the fix is automatically live on both the Humble ownership-dedup surface and the Phase 20 store-search badge resolver.
