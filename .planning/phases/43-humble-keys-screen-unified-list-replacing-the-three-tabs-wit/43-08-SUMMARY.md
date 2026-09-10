---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
plan: 08
subsystem: ui
tags: [humble, i18n-gate, eslint, jest, dead-code-deletion]

# Dependency graph
requires:
  - phase: 43-04
    provides: "compareWaiting with the pinned alphabetical tiebreak, genericKeyPlatform.ts as GENERIC_KEY_PLATFORM's new home"
  - phase: 43-07
    provides: "the unified Humble Keys screen and its test suite, replacing the three-tab router"
provides:
  - "Deletion of the three retired tab containers (Waiting, Spares, All) and the HumbleKeyGroup component"
  - "Deletion of common/humble/groupKeys.ts and its two zero-caller siblings in viewFilters.ts (selectGiftableSpares, partitionWaitingByUrgency)"
  - "meta/i18nGateScope.json and meta/i18nForkTouchedFiles.json re-scoped to 170/212 files, both edited in the same commit as the deletion"
  - "Corrected docblocks/comments so no surviving file describes a component that no longer exists"
affects: [43-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-edit committed gate-scope JSON artifacts in the SAME commit as the deletion they describe, never regenerate them (per meta/__tests__/genI18nGateScope.test.ts's own precedent)"

key-files:
  created: []
  modified:
    - src/common/humble/viewFilters.ts
    - src/backend/humble/__tests__/viewFilters.test.ts
    - src/backend/humble/classify.ts
    - src/frontend/screens/Humble/Keys/stateLabels.ts
    - src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
    - meta/hardcodedStringGate.ts

key-decisions:
  - "Hand-edited both i18n gate-scope JSON artifacts (removed exactly 4 entries each) rather than regenerating, per the test file's own documented precedent, to avoid sweeping in unrelated fork drift since the 2026-08-30 generatedAt"
  - "Fixed 4 hardcoded historical file-counts in genI18nGateScope.test.ts (174->170, 216->212) that the deletion made stale, following the file's own established dated-changelog-comment convention (Rule 1)"
  - "Reworded 3 surviving comments (in classify.ts, viewFilters.test.ts, and the Wave 3 test suite) that named deleted files/functions by literal path or name, so only the one deliberately-annotated hardcodedStringGate.ts census comment still does"

requirements-completed: [REQ-43-17, REQ-43-18, REQ-43-22]

duration: ~55min
completed: 2026-09-10
---

# Phase 43 Plan 08: Delete unified-list dead code Summary

**Deleted the three retired Humble Keys tab containers, the HumbleKeyGroup component, groupKeys.ts, and two zero-caller viewFilters exports, editing both i18n gate-scope JSON artifacts atomically with the deletion and correcting every surviving comment that named a now-deleted file.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 completed
- **Files modified:** 13 (5 deleted, 8 modified)

## Accomplishments

- Deleted `Waiting/`, `Spares/`, `All/` tab containers (plus their `__tests__` dirs) and `components/HumbleKeyGroup/index.tsx`, together with their four entries in `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json`, in one commit (scope 174->170, fork-touched 216->212, unscanned debt unchanged at 42)
- Deleted `src/common/humble/groupKeys.ts` and its test (removes `HumbleKeyGroupId`, `GROUP_ORDER`, `byExpiringSoonest`, `groupAndSortKeys`), and pruned the two zero-caller `viewFilters.ts` exports `selectGiftableSpares` and `partitionWaitingByUrgency` (56 -> 42 tests in `viewFilters.test.ts`)
- Verified `selectKeysWaiting` and its four external consumers (`StoreSearch/index.tsx`, `Discounts/index.tsx`, `library.test.ts`, `badges.test.ts`) are untouched and still pass
- Rewrote `stateLabels.ts`'s docblock to name `HumbleKeyRow` as the sole surviving consumer, and annotated `hardcodedStringGate.ts`'s dated ts-morph census comment recording the scope drop rather than silently editing it
- Repo-wide sweep found and fixed 3 additional surviving comments (2 self-introduced during Task 1's own fix, 1 in Wave 3's test suite) naming deleted files/components by literal path or name — confirmed only the annotated census comment in `hardcodedStringGate.ts` still does

## Task Commits

1. **Task 1: Delete the four gate-scoped frontend files and both artifacts' entries, in one commit** - `edec139b` (feat)
2. **Task 2: Delete groupKeys.ts and prune the two zero-caller viewFilters exports** - `f1ceb2fa` (feat)
3. **Task 3: Correct the surviving comments that name deleted files** - `93602fb6` (docs)

_Note: no separate plan-metadata commit was made — see "Final metadata commit" below._

## Files Created/Modified

- `src/frontend/screens/Humble/Keys/{Waiting,Spares,All}/` - deleted (retired tab containers)
- `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/` - deleted (retired group-heading component)
- `src/common/humble/groupKeys.ts` + its test - deleted (grouped-presentation helper, fully superseded)
- `src/common/humble/viewFilters.ts` - removed `selectGiftableSpares`, `partitionWaitingByUrgency`; corrected module docblock and `selectKeysWaiting`'s doc comment
- `src/backend/humble/__tests__/viewFilters.test.ts` - removed the two corresponding describe blocks (14 tests)
- `src/backend/humble/classify.ts` - fixed a stale `byExpiringSoonest` reference in a WR-07 comment
- `src/frontend/screens/Humble/Keys/stateLabels.ts` - docblock now names `HumbleKeyRow` as the sole consumer
- `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx` - reworded a REWRITE comment that named `HumbleKeyGroup`
- `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json` - 4 entries removed from each (170/212 files)
- `meta/__tests__/genI18nGateScope.test.ts` - fixed 4 stale hardcoded counts (174->170, 216->212) and added/then de-path-ified a dated changelog entry
- `meta/hardcodedStringGate.ts` - appended one dated line to the ts-morph census comment

## Decisions Made

- Hand-edited both i18n JSON artifacts rather than running `pnpm gen-i18n-gate-scope`, per the test file's own documented precedent — a regeneration would have swept in unrelated fork drift accumulated since the 2026-08-30 `generatedAt`.
- Updated `genI18nGateScope.test.ts`'s stale historical counts rather than leaving them red, following the file's own established convention of a dated changelog comment recording each scope-count change (see "Deviations" below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `genI18nGateScope.test.ts` hardcoded 4 stale historical file counts**
- **Found during:** Task 1 verification (`npx jest meta/__tests__/genI18nGateScope.test.ts`)
- **Issue:** Tests `A0`, `A3`, `A4` hardcoded literal `174`/`216` (scope/fork-touched counts) that predated this plan's deletion; after removing 4 files from both artifacts these literals no longer matched `scopeSnapshot.files.length` (170) / `forkTouchedSnapshot.files.length` (212), failing 4 tests plus the git-derivation ANTI-ROT check (which compares live `git diff` against uncommitted HEAD and self-resolves once the deletion is committed — confirmed).
- **Fix:** Updated the 4 hardcoded literals to 170/212, and appended a dated changelog entry to the file's own historical comment block documenting the change, per its established convention (not in `files_modified`, but not editing it would leave the plan's own stated CI acceptance criterion — "26 passed, 1 skipped" — permanently red).
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`
- **Verification:** `npx jest meta/__tests__/genI18nGateScope.test.ts --selectProjects Meta` → 26 passed, 1 skipped, 27 total (post-commit)
- **Committed in:** `edec139b` (Task 1 commit)

**2. [Rule 1 - Bug] Stale `byExpiringSoonest` reference in `classify.ts` after Task 2's deletion**
- **Found during:** Task 2's mandatory repo-wide grep for the four deleted identifiers
- **Issue:** A WR-07 comment in `src/backend/humble/classify.ts:502` named `byExpiringSoonest` (deleted this task) as the function that previously produced NaN comparisons on an unparseable date.
- **Fix:** Reworded to reference "the expiration-sort comparator (viewFilters.ts's compareWaiting)" instead of the deleted function name — required to satisfy Task 2's own stated acceptance criterion (zero repo-wide occurrences of the four dead identifiers).
- **Files modified:** `src/backend/humble/classify.ts`
- **Verification:** `grep -rn "byExpiringSoonest" src` → zero lines
- **Committed in:** `f1ceb2fa` (Task 2 commit)

**3. [Rule 1 - Bug] Two more surviving path-literal mentions of deleted files found during Task 3's sweep**
- **Found during:** Task 3's mandatory repo-wide sweep (`grep -rn "HumbleKeyGroup\|Keys/Waiting\|Keys/Spares\|Keys/All"`)
- **Issue:** (a) My own Task 1 fix had added a dated changelog entry to `genI18nGateScope.test.ts` that spelled out the four deleted files' literal paths (`Keys/All/index.tsx` etc.) — a second exception to the plan's "except one deliberately-annotated census comment" rule. (b) A `REWRITE` comment in `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx:838` (Wave 3, plan 43-07) named `HumbleKeyGroup` directly.
- **Fix:** Reworded both to describe the deletion without repeating the literal path/component name, matching the style already used for the `compareWaiting`/`isGiftableSpare` comment corrections in Task 2.
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`, `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx`
- **Verification:** `grep -rn "HumbleKeyGroup\|Keys/Waiting\|Keys/Spares\|Keys/All" src meta --include="*.ts" --include="*.tsx" --include="*.json" | grep -v "meta/hardcodedStringGate.ts"` → zero lines
- **Committed in:** `93602fb6` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs/staleness directly caused by this plan's own deletions)
**Impact on plan:** All three were necessary to satisfy the plan's own stated acceptance criteria (specific CI test counts, zero-occurrence greps). No scope creep — no file was touched that wasn't either explicitly in `files_modified` or directly named by a failing acceptance-criterion grep this plan's own tasks specify.

## Issues Encountered

None beyond the deviations above. The git-derivation ANTI-ROT test (`A-17 ANTI-ROT: ... equals the LIVE git derivation`) failed transiently between the working-tree edit and the Task 1 commit — expected, since it diffs `<baseCommit>..HEAD` and the deletion wasn't yet in `HEAD`. Resolved itself immediately after committing; verified.

## Observed gate/test counts

- `npx tsc --noEmit` — zero errors (checked after every task)
- `meta/__tests__/genI18nGateScope.test.ts` — 26 passed, 1 skipped, 27 total
- `meta/__tests__/hardcodedStringGate.test.ts` — 151 passed, 151 total (~71s)
- `src/backend/humble/__tests__/viewFilters.test.ts` — 42 passed, 42 total (was 56, minus 14 deleted tests)
- `src/backend/humble/__tests__/library.test.ts` + `src/backend/discounts/__tests__/badges.test.ts` — 191 passed total (combined with viewFilters.test.ts in one run), zero failures
- `npx jest src/frontend/screens/Humble/Keys --selectProjects Frontend` — 3 suites, 125 passed, zero failures
- `node meta/lintScoped.cjs` — production: PASS (1123/1123 warnings, at the declared ceiling, zero headroom despite the deletion), tests: PASS (638/638 warnings, at the declared ceiling). Recorded for plan 43-09: the deletion did not measurably reduce warning counts in either scope — the deleted files apparently carried few or no lint warnings themselves.
- `pnpm lint-translations:gamelib` — observed RED as expected per the plan's known-out-of-scope note (768 hard failures from unfilled `humbleKeys.*` locale keys); not touched, not this plan's job.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Everything the unified Humble Keys list made dead is now gone: the three tab containers, `HumbleKeyGroup`, `groupKeys.ts`, and the two zero-caller `viewFilters.ts` exports. Both blocking i18n/lint gates are green on the same commits as their respective deletions. `selectKeysWaiting` and its four external consumers are untouched and verified. Plan 43-09 inherits zero lint headroom from this deletion (both ceilings measured exactly at their declared values) — worth noting since the plan's own acceptance criteria speculated the deletion would free some.

**Note on process compliance:** No `gsd-sdk state.*` or `roadmap.*` verb was invoked, per this plan's critical constraints. `.planning/STATE.md` and `.planning/ROADMAP.md` were not modified. The standard final metadata commit (which would normally stage `STATE.md`/`ROADMAP.md`/`REQUIREMENTS.md` alongside this SUMMARY.md) is **skipped** for the same reason — only this SUMMARY.md is committed, as its own commit.

---
*Phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit*
*Completed: 2026-09-10*
