---
phase: 19-crossover-compatibility-index-macos
plan: 05
subsystem: backend
tags: [crossover, codeweavers, macos, wine, slugify, index-lookup, jest]

# Dependency graph
requires:
  - phase: 19-02
    provides: "normalize.ts matching-key normalizer + NAME_MATCHING_SHIPS D-02 promotion-gate verdict"
  - phase: 19-03
    provides: "fetcher.ts loadIndex(), schema.ts crossoverIndexSchema, electronStore.ts crossoverIndexStore"
provides:
  - "getCodeweaversFromIndex(gameInfo) — index-first CrossOver lookup (Steam-AppID always, non-Steam name match D-02-gated)"
  - "crossoverIndexHas(gameInfo) — sync self-heal probe reading the last-good cached index"
  - "isCrossoverIndexEligible(gameInfo) — eligibility predicate consumed by 19-06 (key-absent vs null-in-map, D-16)"
  - "isMac-gated index-first wiring in wiki_game_info.ts (Linux/Windows behavior unchanged)"
  - "D-20 slugify() fix: roman numerals kept verbatim, apostrophe drop retained"
affects: [19-06, 19-07, 19-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-02 gate pattern: exact-key joins (Steam AppID) are ungated ground truth; fuzzy joins (non-Steam name match) are gated on a build-time promotion verdict (NAME_MATCHING_SHIPS), defaulting fail-safe to false"
    - "Eligibility predicate exported separately from the lookup function itself, so a consumer (19-06) can distinguish 'never looked up' (key-absent) from 'looked up, found nothing' (null) — D-16 honesty invariant"
    - "jest.mock factory self-containment: when a test file's FIRST runtime import transitively requires the module being mocked, the mock factory must not close over an outer-scope const (TDZ) — use jest.requireActual/jest.requireMock inside/after the factory instead"

key-files:
  created:
    - src/backend/crossover_index/index.ts
    - src/backend/crossover_index/__tests__/index.test.ts
    - src/backend/wiki_game_info/__tests__/wiki_game_info.test.ts
  modified:
    - src/backend/wiki_game_info/wiki_game_info.ts
    - src/backend/wiki_game_info/codeweavers/utils.ts
    - src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts

key-decisions:
  - "Steam-AppID exact joins are NEVER gated by NAME_MATCHING_SHIPS; only non-Steam name matching is gated (D-02)"
  - "getCodeweaversFromIndex keeps a CodeweaversInfo | null contract; isCrossoverIndexEligible carries the eligibility signal separately (do not overload the lookup's null return with undefined)"
  - "D-20 reversal: slugify() no longer converts roman numerals to Arabic digits — CodeWeavers and Steam already agree on the roman form; only the apostrophe drop is load-bearing"
  - "Fixed a pre-existing TDZ crash in index.test.ts's normalize mock (Rule 1 — the test was committed by a prior stalled session but never actually passed)"

patterns-established:
  - "crossoverIndexDescriptor lives in index.ts as the D-19 seam's single real consumer (no registry)"

requirements-completed: [CXIDX-06, CXIDX-07, CXIDX-08]

# Metrics
duration: ~35min (continuation session; task 1 was pre-existing from a prior stalled session)
completed: 2026-07-13
---

# Phase 19 Plan 05: CrossOver Index-First Lookup + D-20 Slugify Fix Summary

**Index-first `getCodeweaversFromIndex()` wired into `wiki_game_info.ts` behind `isMac`, with a D-02-gated non-Steam name match and a D-20 `slugify()` correction that stops mangling roman numerals.**

## Performance

- **Duration:** ~35 min (this continuation session)
- **Completed:** 2026-07-13T23:09:50Z
- **Tasks:** 3 (1 pre-existing/verified, 1 finished+committed, 1 executed fresh) + 1 test-infra bug fix
- **Files modified:** 6 (2 created new test files, 1 new source file already existed from task 1, 3 modified)

## Accomplishments
- Index-first CrossOver lookup (`getCodeweaversFromIndex`, `crossoverIndexHas`, `isCrossoverIndexEligible`) resolves Steam-AppID joins unconditionally and gates non-Steam name matching on the D-02 `NAME_MATCHING_SHIPS` verdict, never fabricating a rating.
- `wiki_game_info.ts`'s codeweavers slot is now index-first on macOS with the Linux lazy-scrape path proven byte-identical (regression-guarded by a dedicated test).
- D-13 self-heal: a cached Phase-16 "checked, none found" miss (`macRating === null`) re-resolves once the index now covers the title, without looping on genuine misses.
- D-20 `slugify()` fix: roman numerals (`age-of-empires-ii`, `quake-ii`) are now preserved verbatim; the apostrophe drop (`alekhines-gun`) is retained.
- Fixed a pre-existing bug (Rule 1) in the already-committed `index.test.ts`: a `jest.mock('../normalize', () => normalizeMock)` factory referenced an outer `const` before it was initialized (TDZ `ReferenceError`), because this test file's first runtime import transitively requires `crossover_index/index.ts` before the file's own top-level consts finish executing. Made the factory self-contained and exposed a mutable reference via `jest.requireMock` for per-test gate toggling.

## Task Commits

Each task was committed atomically:

1. **Task 1: index-first lookup — getCodeweaversFromIndex() + crossoverIndexHas()** — `91c3c300` (feat) — committed by a prior stalled session; verified present and re-tested this session (was failing until the TDZ fix below)
2. **[Rule 1 bugfix] Fix TDZ crash in index.test.ts normalize mock** — `e01161e8` (fix)
3. **Task 2: isMac-gated wiring + staleCrossoverData self-heal** — `9639de94` (feat)
4. **Task 3: D-20 slugify() fix** — `ca953ee0` (fix)

**Plan metadata:** commit to follow this Summary.

_Note: Task 1 was already committed by a prior session before this continuation began; this session verified it, discovered and fixed a bug in its test, then completed Tasks 2 and 3._

## Files Created/Modified
- `src/backend/crossover_index/index.ts` - index-first lookup, sync self-heal probe, eligibility predicate, `crossoverIndexDescriptor` (D-19 seam)
- `src/backend/crossover_index/__tests__/index.test.ts` - lookup coverage across both `NAME_MATCHING_SHIPS` gate states; TDZ bug fixed
- `src/backend/wiki_game_info/wiki_game_info.ts` - isMac-gated codeweavers slot + extended `staleCrossoverData` self-heal
- `src/backend/wiki_game_info/__tests__/wiki_game_info.test.ts` - macOS index-hit/miss, Linux-unchanged, Windows-null, and D-13 self-heal (both directions) coverage
- `src/backend/wiki_game_info/codeweavers/utils.ts` - deleted `ROMAN_NUMERAL_RE`/`ROMAN_NUMERAL_MAP`, `slugify()` now `baseSlugify(withoutApostrophes)`
- `src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts` - updated roman-numeral test to expect the roman form preserved; added `age-of-empires-ii`, `quake-ii`, `alekhines-gun` cases

## Decisions Made
- Steam-AppID exact joins are never subject to the D-02 gate; only non-Steam name matching is (per plan spec, verified by flag-toggle tests both in `index.test.ts` and transitively in `wiki_game_info.test.ts`'s self-heal tests).
- The TDZ bug fix used `jest.requireMock` for the mutable per-test flag reference rather than restructuring the whole mock module, keeping the diff minimal and consistent with the file's existing test structure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TDZ crash in `index.test.ts`'s normalize mock factory**
- **Found during:** Continuation verification of Task 1 (already committed by a prior stalled session)
- **Issue:** `jest.mock('../normalize', () => normalizeMock)` referenced the outer-scope `const normalizeMock` before its initializer ran. This file's very first runtime import (`axiosClient` from `backend/utils`) transitively requires `wiki_game_info.ts` → `crossover_index/index.ts` → `./normalize`, invoking the (already-registered) mock factory before the file's own `const actualNormalize`/`const normalizeMock` declarations executed — `ReferenceError: Cannot access 'normalizeMock' before initialization`. The entire test suite for Task 1 was failing despite being committed.
- **Fix:** Made the `jest.mock('../normalize', ...)` factory self-contained (inline `jest.requireActual` call, no outer-scope reference), and exposed a mutable reference to the mocked module via `jest.requireMock('../normalize')` for per-test `NAME_MATCHING_SHIPS` toggling.
- **Files modified:** `src/backend/crossover_index/__tests__/index.test.ts`
- **Verification:** All 17 tests in the file now pass (`pnpm test -- src/backend/crossover_index/__tests__/index.test.ts`).
- **Committed in:** `e01161e8`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary correctness fix — Task 1's committed test suite was silently broken (never actually green) before this fix. No scope creep; fix is confined to test infrastructure in the exact file the plan specifies.

## Issues Encountered
- The prior executor's stalled session left Task 1 committed but its test suite failing (see deviation above) — discovered during this continuation's verification pass rather than left undetected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `getCodeweaversFromIndex`, `crossoverIndexHas`, and `isCrossoverIndexEligible` are all in place and tested — 19-06 can now build `buildCrossoverRatingMap` on top of `isCrossoverIndexEligible` for the grid badge (D-16 key-absent vs null distinction).
- `slugify()`'s D-20 fix is live; the matching-key normalizer in `normalize.ts` remains untouched and distinct (verified by grep — no `slugify`/`naiveSlugify` import in `index.ts`'s matching path).
- No blockers for 19-06/19-07/19-08.

---
*Phase: 19-crossover-compatibility-index-macos*
*Completed: 2026-07-13*

## Self-Check: PASSED

All created/modified files verified present on disk; all 4 task/fix commits (`91c3c300`, `e01161e8`, `9639de94`, `ca953ee0`) verified present in git log.
