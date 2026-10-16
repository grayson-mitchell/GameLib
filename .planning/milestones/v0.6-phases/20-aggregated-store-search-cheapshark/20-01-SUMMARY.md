---
phase: 20-aggregated-store-search-cheapshark
plan: 01
subsystem: matching
tags: [fuzzy-matching, levenshtein, refactor, dedup, common-module]

# Dependency graph
requires:
  - phase: 12-ownership-dedup
    provides: original normalizeTitle/titleSimilarity/isDlcFalsePositiveRisk/fuzzyMatch implementation and the 85% threshold in backend/humble/dedup.ts and constants.ts
provides:
  - "src/common/matching/titleMatch.ts — pure, store-agnostic fuzzy title matcher (no backend/ imports, no Humble/Steam types)"
  - "HUMBLE_FUZZY_MATCH_THRESHOLD single source of truth at 0.85, re-exported by backend/humble/constants.ts"
  - "backend/humble/dedup.ts re-exports the four matcher functions so existing importers (dedup.test.ts) keep compiling unchanged"
affects: [20-03-store-search-badge-resolver]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Store-agnostic pure logic lives in src/common/, never in src/backend/ or src/frontend/, so both store managers and shared resolvers can import it without layering violations"
    - "When lifting logic out of an existing module, keep the old module compiling via `export { X } from 'newLocation'` re-exports rather than updating every caller"

key-files:
  created:
    - src/common/matching/titleMatch.ts
    - src/backend/__tests__/titleMatch.test.ts
  modified:
    - src/backend/humble/dedup.ts
    - src/backend/humble/constants.ts

key-decisions:
  - "Lifted the matcher verbatim (byte-for-byte function bodies) rather than rewriting, to guarantee behavior-identical results between the Humble dedup surface and the future store-search badge resolver (D-02)"
  - "HUMBLE_FUZZY_MATCH_THRESHOLD name preserved even though the constant now lives in common/ — avoids a rename ripple across dedup.ts/constants.ts and their tests"
  - "dedup.ts and constants.ts both re-export from the new common module rather than requiring callers to update their import paths — dedup.test.ts imports the four functions from '../dedup' unchanged and stays green"

patterns-established:
  - "Pattern: common/matching/titleMatch.ts is the canonical location for cross-store pure title-matching logic; do not create a second matcher for future store integrations"

requirements-completed: [STORESEARCH-05, STORESEARCH-06]

# Metrics
duration: ~10min
completed: 2026-07-14
---

# Phase 20 Plan 01: Lift Shared Fuzzy Title Matcher Summary

**Extracted normalizeTitle/titleSimilarity/isDlcFalsePositiveRisk/fuzzyMatch and the 0.85 threshold from backend/humble/dedup.ts into a new pure src/common/matching/titleMatch.ts module, with both original files re-exporting to stay compiling unchanged.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-14
- **Tasks:** 2 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- New `src/common/matching/titleMatch.ts` — pure, I/O-free, no `backend/` imports, no `HumbleKey`/`GameInfo` types leaked; exports `normalizeTitle`, `titleSimilarity`, `isDlcFalsePositiveRisk`, `fuzzyMatch`, and `HUMBLE_FUZZY_MATCH_THRESHOLD = 0.85` as the single source of truth (D-02)
- `backend/humble/dedup.ts` now imports the four functions from the common module and re-exports them (so `dedup.test.ts`'s `from '../dedup'` imports keep working); `recomputeOwnership()` (Humble-specific, D-42) stays untouched in dedup.ts
- `backend/humble/constants.ts` re-exports `HUMBLE_FUZZY_MATCH_THRESHOLD` from the common module instead of redefining it
- New `src/backend/__tests__/titleMatch.test.ts` — 14 tests covering all six documented behaviors (trademark strip, parenthetical strip, similarity scoring, DLC false-positive guard, fuzzy match acceptance/rejection)
- Full verification suite green: `titleMatch.test.ts` (14/14) + all `src/backend/humble` suites (464/464, including `dedup.test.ts` unchanged) = 478/478 passing; `npm run codecheck` (tsc --noEmit) exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Create common/matching/titleMatch.ts with the lifted pure matcher + unit test** - `8a8ef3a2` (feat)
2. **Task 2: Point dedup.ts and constants.ts at the shared matcher; keep dedup tests green** - `d60eabba` (refactor)

## Files Created/Modified
- `src/common/matching/titleMatch.ts` - New pure fuzzy title matcher module (normalizeTitle, titleSimilarity, isDlcFalsePositiveRisk, fuzzyMatch, HUMBLE_FUZZY_MATCH_THRESHOLD)
- `src/backend/__tests__/titleMatch.test.ts` - Unit tests for the lifted matcher (14 tests)
- `src/backend/humble/dedup.ts` - Removed local matcher definitions; imports + re-exports from common/matching/titleMatch; recomputeOwnership() unchanged
- `src/backend/humble/constants.ts` - Re-exports HUMBLE_FUZZY_MATCH_THRESHOLD from common/matching/titleMatch instead of defining it locally

## Decisions Made
- None beyond what's captured in `key-decisions` above — plan executed exactly as written, no deviation from the specified lift-and-re-export approach.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The `jest --selectProjects` flag required the project's `displayName` ("Backend", capitalized) rather than the lowercase `backend` shown in the plan's `<verify>` commands — this is a pre-existing project convention (`src/backend/jest.config.js` sets `displayName: 'Backend'`), not a plan defect; verification commands were run with the correct casing and all gates passed.

## Next Phase Readiness

- `src/common/matching/titleMatch.ts` is ready for Plan 03's store-search badge resolver to import directly — no second matcher needs to be written, satisfying CONTEXT D-02 and RESEARCH Pitfall 4.
- `HUMBLE_FUZZY_MATCH_THRESHOLD` remains single-sourced at 0.85; any future change to the threshold only needs to touch `titleMatch.ts`.
- No blockers.

---
*Phase: 20-aggregated-store-search-cheapshark*
*Completed: 2026-07-14*

## Self-Check: PASSED

All created/modified files verified present on disk; all three task/plan commit hashes (8a8ef3a2, d60eabba, f0ec12a1) verified present in git log.
