---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
plan: 04
subsystem: humble-keys
tags: [pure-module, jest, refactor, search-predicate, comparator]

# Dependency graph
requires:
  - phase: 43-01
    provides: "REQ-43-01..24 minted in REQUIREMENTS.md and the corrected Per-Task Verification Map in 43-VALIDATION.md (positional jest test-path commands, not -t-filtered)"
provides:
  - "src/common/humble/genericKeyPlatform.ts — GENERIC_KEY_PLATFORM as a leaf module with zero imports"
  - "GENERIC_KEY_PLATFORM's two surviving production importers (viewFilters.ts, keyTypePresentation.ts) repointed off groupKeys.ts, clearing the edge plan 43-08 needs to delete groupKeys.ts"
  - "compareWaiting exported from viewFilters.ts as the unified list's default Expiring-soonest comparator (D-43-06)"
  - "matchesKeySearch(key, query) — title-only, case-insensitive search predicate (D-43-10)"
  - "isGiftableSpare(key) — per-row scenario-3 predicate (D-54/D-55), the singular form of selectGiftableSpares"
  - "21 new unit tests (35 -> 56) pinning all three semantics, with a recorded mutation proof for compareWaiting's undated tiebreak"
affects: [43-05, 43-06, 43-07, 43-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Leaf-constant extraction pattern: a single-value module with zero imports, sibling to urgencyBadge.ts/expirationDisplay.ts, used to break a delete-then-breaks-build ordering dependency before the deletion plan runs"
    - "jest CLI argument order matters in this repo: `npx jest <path> --selectProjects <Project>` isolates the file; `npx jest --selectProjects <Project> <path>` silently consumes <path> as an additional (nonexistent) project name and runs the ENTIRE project instead — confirmed this session with a --listTests probe showing correct filtering vs. an actual run showing all 213 suites/4786 tests. Every jest command in this SUMMARY uses the working (path-first) order."

key-files:
  created:
    - src/common/humble/genericKeyPlatform.ts
  modified:
    - src/common/humble/viewFilters.ts
    - src/common/humble/keyTypePresentation.ts
    - src/backend/humble/__tests__/viewFilters.test.ts

key-decisions:
  - "genericKeyPlatform.ts's doc comment avoids the literal substring 'import' entirely (not just avoiding real import statements) — the leaf-module acceptance check greps the whole file for that substring, and the word 'importers' would have false-positived it. Reworded to 'consumers' and 'circular dependency'."
  - "matchesKeySearch and isGiftableSpare were placed adjacent to selectGiftableSpares in viewFilters.ts (not appended at file end) so the array-returning/per-row pairs read together; WAITING_STATES.has(...) was NOT wrapped, per D-43-08's explicit zero-new-predicate instruction for the checkbox."
  - "The jest command order in 43-VALIDATION.md's Per-Task Verification Map (`--selectProjects Backend <path>`) does not isolate the file in this repo — verified this session with a --listTests probe (correctly narrows to 1 file) versus an actual test run of the same command (runs all 213 suites, 4786 tests). The working order is `<path> --selectProjects Backend`. This plan's own verification used the working order throughout; 43-VALIDATION.md's table still shows the non-isolating order and should be corrected in a future plan or todo."

requirements-completed: [REQ-43-05, REQ-43-07, REQ-43-09, REQ-43-18, REQ-43-21]

# Metrics
duration: ~25min
completed: 2026-09-10
---

# Phase 43 Plan 04: Relocate GENERIC_KEY_PLATFORM and land the unified list's pure predicates Summary

**Extracted `GENERIC_KEY_PLATFORM` into its own leaf module and repointed both surviving importers off `groupKeys.ts`, then exported `compareWaiting` and added `matchesKeySearch`/`isGiftableSpare` to `viewFilters.ts`, pinning all three with 21 new unit tests (35 -> 56) including a verified mutation proof for the comparator's undated-key tiebreak.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-10T06:50:00+12:00 (approx.)
- **Completed:** 2026-09-10T06:59:14+12:00
- **Tasks:** 3/3 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `groupKeys.ts` can now be deleted (plan 43-08) without breaking a build: both of its surviving production importers (`viewFilters.ts`, `keyTypePresentation.ts`) read `GENERIC_KEY_PLATFORM` from the new leaf module `genericKeyPlatform.ts` instead, verified by `npx tsc --noEmit` passing while `groupKeys.ts` still exists on disk.
- The unified Humble Keys list has a real, exported, tested comparator (`compareWaiting`, D-43-06) instead of a module-private function later plans could not call.
- Two new pure per-row predicates exist for the screen to consume: `matchesKeySearch` (title-only search, D-43-10 — explicitly does NOT match `origin`, which 20/33 live keys pollute with a junk gift string) and `isGiftableSpare` (D-54/D-55).
- 21 new tests added to `viewFilters.test.ts` (35 -> 56, all passing), including a mutation proof: temporarily replacing `compareWaiting`'s tiebreak return with `return 0` (mirroring the deleted `byExpiringSoonest`) made exactly the two tests that assert the alphabetical-tiebreak behavior fail by name; the file was restored and verified byte-identical (`git diff --quiet`) before committing.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the genericKeyPlatform leaf module and repoint both importers** - `34da3f4ab` (feat)
2. **Task 2: Export compareWaiting and add matchesKeySearch and isGiftableSpare** - `5454b7a06` (feat)
3. **Task 3: Pin the three new semantics with differentiating unit tests** - `f06582e1c` (test)

## Files Created/Modified

- `src/common/humble/genericKeyPlatform.ts` - New leaf module exporting `GENERIC_KEY_PLATFORM = 'generic'`; zero imports, docblock rewritten to describe the constant's two surviving roles (unknown-presentation branch, Keys-waiting exclusion) instead of the retired Other-group routing language.
- `src/common/humble/viewFilters.ts` - Repointed its `GENERIC_KEY_PLATFORM` import to `./genericKeyPlatform`; exported `compareWaiting` (previously module-private) with an extended doc comment recording its divergence from `groupKeys.ts`'s `byExpiringSoonest`; added `matchesKeySearch` and `isGiftableSpare`.
- `src/common/humble/keyTypePresentation.ts` - Repointed its `GENERIC_KEY_PLATFORM` import to `./genericKeyPlatform`; corrected a stale inline comment that named the old `./groupKeys` path.
- `src/backend/humble/__tests__/viewFilters.test.ts` - Added imports for the three new exports plus `GENERIC_KEY_PLATFORM`, and four new `describe` blocks (`compareWaiting`, `WAITING_STATES` field-independence, `matchesKeySearch`, `isGiftableSpare`). All 35 pre-existing tests unchanged.

## Decisions Made

- See `key-decisions` in frontmatter for the two load-bearing ones (the `import`-substring false positive in the leaf module's docblock, and the jest CLI argument-order gotcha).
- Left `groupKeys.ts` fully in place (still exporting `GENERIC_KEY_PLATFORM`, still used internally by `groupAndSortKeys`) — its deletion is explicitly plan 43-08's task, not this one's.
- Did not delete or weaken `selectKeysWaiting`, `selectGiftableSpares`, or `partitionWaitingByUrgency` — `selectKeysWaiting` has three surviving consumers outside the Humble Keys screen (StoreSearch, Discounts, two test files) per the plan's `<interfaces>` section.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded genericKeyPlatform.ts's docblock to avoid the literal substring "import"**
- **Found during:** Task 1 self-verification
- **Issue:** The plan's own acceptance criterion (`grep -c 'import' src/common/humble/genericKeyPlatform.ts` returns `0`) is a raw substring grep, not an AST check. My first draft's prose used "importers" and "circular import" in the docblock, which the substring grep flagged as non-zero even though the file has no real import statement.
- **Fix:** Reworded to "consumers" and "circular dependency" — no change in meaning, only in the specific words used.
- **Files modified:** `src/common/humble/genericKeyPlatform.ts`
- **Commit:** `34da3f4ab`

**2. [Rule 1 - Bug] Corrected a stale `./groupKeys` path reference in keyTypePresentation.ts's inline comment**
- **Found during:** Task 1, after the import repoint
- **Issue:** A comment at what is now line 70 of `keyTypePresentation.ts` said "the literal GENERIC_KEY_PLATFORM value from ./groupKeys is an EXPLICIT entry here" — this became factually wrong the moment the import was repointed to `./genericKeyPlatform`, and the plan's `<action>` text did not call this line out explicitly.
- **Fix:** Updated the path in the comment to `./genericKeyPlatform`.
- **Files modified:** `src/common/humble/keyTypePresentation.ts`
- **Commit:** `34da3f4ab`

---

**Total deviations:** 2 auto-fixed (both Rule 1, both in the same task's scope, both required to satisfy the plan's own literal acceptance criteria / to avoid shipping a factually stale comment introduced by this plan's own edit)
**Impact on plan:** No scope creep — both fixes are corrections to text this plan itself was writing/touching, not new functionality.

## Issues Encountered

- **jest CLI argument order silently defeats file isolation in this repo.** `npx jest --selectProjects Backend <path>` does NOT isolate `<path>` — `--selectProjects` is a multi-value flag that greedily consumes the following positional path argument as an additional (nonexistent, silently-ignored) project name, leaving no test-path filter at all and running the entire Backend project (213 suites, 4786 tests). This was caught by comparing `--listTests` output (correctly showed 1 file) against an actual test run of the identical command (ran everything). The working order is `npx jest <path> --selectProjects Backend`, used throughout this plan's own verification. **43-VALIDATION.md's Per-Task Verification Map still uses the non-isolating order** for the REQ-43-05/07/09/18/21 rows this plan covers — those commands will report `Tests: 2 skipped, 4784 passed, 4786 total` (the whole suite) rather than the per-file count they were written to assert. This does not invalidate this plan's own results (verified directly, per-file, with the working order) but is a gap in the validation record worth flagging for whoever runs 43-VALIDATION.md's commands verbatim later in this phase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `groupKeys.ts` is now safe to delete once its remaining internal-only usage (`groupAndSortKeys`, `GROUP_ORDER`, `byExpiringSoonest`) is also retired — that is plan 43-08's scope, not this plan's.
- `compareWaiting`, `matchesKeySearch`, and `isGiftableSpare` are exported, tested, and ready for the unified list screen (plans 43-05/43-06/43-07) to import directly from `common/humble/viewFilters`.
- Flag for a future plan or todo: correct 43-VALIDATION.md's jest command argument order (see Issues Encountered) so its Per-Task Verification Map rows actually isolate the file they claim to test.

---
*Phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit*
*Completed: 2026-09-10*

## Self-Check: PASSED

- FOUND: `src/common/humble/genericKeyPlatform.ts`
- FOUND: `src/common/humble/viewFilters.ts`
- FOUND: `src/common/humble/keyTypePresentation.ts`
- FOUND: `src/backend/humble/__tests__/viewFilters.test.ts`
- FOUND: `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-04-SUMMARY.md`
- FOUND: commit `34da3f4ab` in `git log --oneline --all`
- FOUND: commit `5454b7a06` in `git log --oneline --all`
- FOUND: commit `f06582e1c` in `git log --oneline --all`

All claims verified. No missing items.
