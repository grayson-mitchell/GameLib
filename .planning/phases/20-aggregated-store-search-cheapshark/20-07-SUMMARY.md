---
phase: 20-aggregated-store-search-cheapshark
plan: 07
subsystem: testing
tags: [jest, cheapshark, uat, validation-gate, title-matching]

# Dependency graph
requires:
  - phase: 20-06
    provides: StoreSearch container, debounce hook, sidebar entry, /store-search route, i18n keys
provides:
  - Full-suite gate confirmation (pnpm test green, tsc clean) for the entire Phase 20 store-search feature
  - Completed and signed-off 20-VALIDATION.md (Per-Task Verification Map, Wave 0 file inventory, Manual-Only Verifications, sign-off checklist)
  - Live human UAT approval of the end-to-end CheapShark search → price/USD labels → ownership badges → external buy handoff → fail-soft states flow
  - Regression fix for an owned-badge false positive on remaster/remake titles, with a pinned unit test, in the shared title matcher all callers (Humble dedup + store-search badges) depend on
affects: [store-search, humble-dedup, title-matching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live/manual UAT checkpoints record findings back into 20-VALIDATION.md's Manual-Only Verifications table rather than a separate document"
    - "Product-differentiator guard pattern (isRemasterFalsePositiveRisk) mirrors the existing isDlcFalsePositiveRisk guard — same OR-into-fuzzyMatch shape for suppressing false-positive title matches on a shared matcher"

key-files:
  created:
    - .planning/phases/20-aggregated-store-search-cheapshark/20-07-SUMMARY.md
  modified:
    - .planning/phases/20-aggregated-store-search-cheapshark/20-VALIDATION.md
    - src/common/matching/titleMatch.ts (via quick task 260715-a7g, not this plan directly)
    - src/backend/__tests__/titleMatch.test.ts (via quick task 260715-a7g)

key-decisions:
  - "Full jest suite (1194 tests, 66 suites) and tsc --noEmit both green before live UAT began — the automated gate for all of Phase 20 passed with zero red tests"
  - "Live UAT surfaced one real defect (remaster/remake false-positive ownership badge) that no mocked-axios unit test could have caught, confirming the RESEARCH rationale for requiring a live-API checkpoint at the phase gate"
  - "The remaster/remake fix was applied to the SHARED title matcher (common/matching/titleMatch.ts), so Humble dedup inherits the same correctness fix, not just store-search"
  - "User re-verified the fix live in the running app and gave final approval — the plan's checkpoint:human-verify gate is now closed"

patterns-established:
  - "Product-variant differentiator guard: PRODUCT_VARIANT_KEYWORDS (remaster/remake) OR'd into fuzzyMatch alongside the DLC guard, so a base title and its remaster/remake never fuzzy-match even at high normalized similarity"

requirements-completed: [STORESEARCH-01, STORESEARCH-02, STORESEARCH-03, STORESEARCH-04, STORESEARCH-05, STORESEARCH-06, STORESEARCH-07, STORESEARCH-08]

# Metrics
duration: ~20min (across two sessions — gate/VALIDATION fill, then live UAT + defect fix + re-verification)
completed: 2026-07-15
---

# Phase 20 Plan 07: Full-Suite Gate + Live UAT Sign-Off Summary

**Phase-gate closure: 1194-test suite green, live CheapShark UAT approved after fixing an owned-badge false positive on remaster/remake titles in the shared matcher**

## Performance

- **Duration:** ~20 min total (Task 1 automated gate + VALIDATION fill in one session; Task 2 live UAT, defect discovery, quick-task fix, and re-approval in a follow-up session)
- **Started:** 2026-07-14T22:30:00Z (approx, Task 1)
- **Completed:** 2026-07-15T06:25:58Z
- **Tasks:** 2 (Task 1 auto; Task 2 checkpoint:human-verify)
- **Files modified:** 1 direct (20-VALIDATION.md) + 2 via the mid-checkpoint quick-task fix (titleMatch.ts, titleMatch.test.ts)

## Accomplishments

- Full jest suite confirmed green (66 suites, 1194 tests, 0 failures) and `npm run codecheck` (tsc --noEmit) exits 0 — the automated gate for the entire Phase 20 store-search feature
- `20-VALIDATION.md` fully populated: Per-Task Verification Map for all of 20-01..20-06, Wave 0 file inventory, Manual-Only Verifications table, `nyquist_compliant: true` / `wave_0_complete: true` frontmatter, sign-off checklist
- Live end-to-end UAT against the real CheapShark API approved by the user: searchable priced rows with correct "$X USD" labels, store-attributed ownership badges (the headline feature), coexisting "Key available" pills, working external buy handoff (no 404 — dealID-verbatim redirect confirmed live), and three distinct fail-soft states (prompt / no-results / provider-failed-retryable) all verified on the running app
- One real defect found during live UAT — an owned-badge false positive where an original title fuzzy-matched its own remaster ("Alan Wake" wrongly showed "Owned" for "Alan Wake Remastered") — was root-caused and fixed in the shared `common/matching/titleMatch.ts` matcher (quick task 260715-a7g), pinned with a regression test, and re-verified live by the user before final approval

## Task Commits

Each task was committed atomically:

1. **Task 1: Full-suite gate + fill 20-VALIDATION.md from the executed test map** - `5fe683ac` (docs)
2. **Task 2: Live end-to-end verification on the running app** - checkpoint:human-verify, `user_response = "approved"` (no direct commit; see mid-checkpoint fix below)

**Mid-checkpoint UAT-found defect fix** (quick task 260715-a7g, applied between UAT start and final approval):
- `2d020c6f` fix(20): treat remaster/remake as product differentiators in shared title matcher
- `72ac5d70` fix(20): add remaster/remake regression coverage to shared title matcher tests
- `d64de842` docs(quick-260715-a7g): treat remaster/remake as product differentiators in shared title matcher

**Plan metadata:** (this commit) `docs(20-07): finalize phase gate after approved UAT`

## Files Created/Modified

- `.planning/phases/20-aggregated-store-search-cheapshark/20-07-SUMMARY.md` - this summary
- `.planning/phases/20-aggregated-store-search-cheapshark/20-VALIDATION.md` - Task 1 filled the full verification map/sign-off; this plan's finalization adds a short UAT-approved note to the Manual-Only Verifications section
- `src/common/matching/titleMatch.ts` - (via quick task 260715-a7g) removed `'remastered'` from `EDITION_SUFFIXES`, added `PRODUCT_VARIANT_KEYWORDS`/`isRemasterFalsePositiveRisk` guard OR'd into `fuzzyMatch`
- `src/backend/__tests__/titleMatch.test.ts` - (via quick task 260715-a7g) regression test pinning `fuzzyMatch("Alan Wake", "Alan Wake Remastered") === false`

## Decisions Made

- Full backend suite (1087/1087 after the remaster fix) and full jest suite (1194/1194 at the original gate) both confirmed green before and after the mid-checkpoint fix — no regressions introduced by the fix
- The remaster/remake false-positive fix was made in the shared matcher module rather than store-search-local code, so Humble key dedup automatically inherits the same correctness improvement (D-02 precedent: shared matcher, single source of truth)
- Live UAT is treated as authoritative for the three Manual-Only Verifications categories that mocked-axios unit tests cannot prove (real CheapShark response shape, real dealID redirect, real owned-badge correctness against the user's actual library) — consistent with the RESEARCH Validation Architecture rationale that motivated requiring this checkpoint

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed owned-badge false positive on remaster/remake titles**
- **Found during:** Task 2 (live end-to-end UAT, step 4/5 — ownership badge correctness check)
- **Issue:** `normalizeTitle` stripped `'remastered'` as an `EDITION_SUFFIXES` entry, so a base title and its remaster normalized to the same string and scored 100% similarity — "Alan Wake" incorrectly showed an "Owned on Steam" badge when searching "Alan Wake Remastered" (a different, separately-owned/unowned product)
- **Fix:** Removed `'remastered'` from `EDITION_SUFFIXES`; added a `PRODUCT_VARIANT_KEYWORDS = ['remaster', 'remake']` differentiator guard (`isRemasterFalsePositiveRisk`, mirroring the existing `isDlcFalsePositiveRisk` pattern) OR'd into `fuzzyMatch` so a remaster/remake title never fuzzy-matches its base title, while deluxe/GOTY/definitive editions of the same underlying game continue to match correctly
- **Files modified:** `src/common/matching/titleMatch.ts`, `src/backend/__tests__/titleMatch.test.ts`
- **Verification:** New unit test pins `fuzzyMatch("Alan Wake", "Alan Wake Remastered") === false`; full backend suite re-ran green (1087/1087, includes `dedup.test.ts` and `storeSearchBadges.test.ts`); `npm run codecheck` exit 0; user re-verified live in the running app and approved
- **Committed in:** `2d020c6f` (fix), `72ac5d70` (test), `d64de842` (quick-task docs) — handled as quick task 260715-a7g, tracked outside this plan's own commit sequence per the mid-checkpoint deviation protocol

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug fix, found live during the plan's own UAT checkpoint)
**Impact on plan:** Necessary correctness fix for the headline ownership-badge feature (T-20-03 threat: false "Owned" badge). No scope creep — fixed in the same shared module the plan's Task 2 was already exercising, and the plan's checkpoint was held open until the user re-verified and approved.

## Issues Encountered

None beyond the UAT-found defect documented above, which was resolved and re-verified within the same checkpoint before approval.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 20 (Aggregated Store Search — CheapShark) is fully complete: all 7 plans executed, full suite green, live UAT approved by the user, `20-VALIDATION.md` signed off
- All eight STORESEARCH requirements (STORESEARCH-01 through STORESEARCH-08) are confirmed live and complete
- No blockers carried forward from this plan
- Shared title matcher (`common/matching/titleMatch.ts`) now has stronger false-positive resistance (DLC guard + remaster/remake guard), benefiting both store-search and Humble dedup going forward

---
*Phase: 20-aggregated-store-search-cheapshark*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: .planning/phases/20-aggregated-store-search-cheapshark/20-07-SUMMARY.md
- FOUND: .planning/phases/20-aggregated-store-search-cheapshark/20-VALIDATION.md
- FOUND: src/common/matching/titleMatch.ts
- FOUND: src/backend/__tests__/titleMatch.test.ts
- FOUND commit: 5fe683ac
- FOUND commit: 2d020c6f
- FOUND commit: 72ac5d70
- FOUND commit: d64de842
