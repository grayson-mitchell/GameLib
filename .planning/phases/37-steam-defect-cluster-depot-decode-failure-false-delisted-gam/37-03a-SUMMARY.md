---
phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
plan: 03a
subsystem: library-filtering
tags: [steam, library-filter, availability, console-mode, jest]

# Dependency graph
requires:
  - phase: 37-CONTEXT
    provides: D-11/D-13/D-15/D-16 locked decisions on the delisted forced-hide reversal
provides:
  - isGameAvailable() no longer treats a delisted store page as non-availability
  - isNonAvailableGame reduced to the nonAvailableAppNames membership test alone
  - selectConsoleGames / activateGame no longer forced-hide delisted games in Console Mode
  - findSilentlyExcludedGames and reconcileNonAvailableGames doc comments corrected to match the new behaviour
affects: [37-03b, 37-VALIDATION, library-header-counts, console-mode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flip a stale test asserting the OLD forced-hide behaviour in place, rather than adding a second test beside it (this repo's ledger records a stale-green-next-to-new-red test as how a gate goes vacuous)."

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/frontend/screens/Library/filterEngine.ts
    - src/frontend/screens/Library/__tests__/filterEngine.test.ts
    - src/frontend/screens/Library/components/LibraryHeader/gameCount.ts
    - src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts
    - src/frontend/hooks/constants.ts
    - src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts
    - src/frontend/screens/ConsoleMode/selectors.ts
    - src/frontend/screens/ConsoleMode/index.tsx
    - src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts

key-decisions:
  - "D-15 (forced): games.ts's isGameAvailable() LIB-07 gate and filterEngine.ts's isNonAvailableGame delisted OR clause were removed in the SAME commit — removing only the frontend clause would have trapped Dead Island harder via handleNonAvailableGames -> nonAvailableGames -> the first clause of the same OR."
  - "D-16: the new delisted facet (37-03b) is NOT routed through nonAvailableGames — that list keeps exactly one writer and one meaning (an installed game whose install_path went missing)."
  - "findSilentlyExcludedGames folds the delisted exclusion back IN (opposite direction from the library/Console Mode fix) because a delisted game reaching nonAvailableAppNames is now exactly as anomalous as any other game reaching it — the old !game.is_delisted term existed specifically to treat that case as a legitimate, non-anomalous exclusion, and that premise is now false."
  - "Two stale tests not named in the plan's interfaces (libraryHeaderVisibility.test.ts's findSilentlyExcludedGames cases, reconcileNonAvailableGames.test.ts's 'isNonAvailableGame delisted-independence premise') were discovered failing after the games.ts/filterEngine.ts commit and flipped in the same commit (Rule 1) rather than left red or deferred."

patterns-established:
  - "Wave-0-then-fix: flip/add the RED gate first, record the RED failure text, then land the fix and confirm GREEN in the SUMMARY, rather than writing tests and fix together."

requirements-completed: [REQ-37-02]

# Metrics
duration: 20min
completed: 2026-08-22
---

# Phase 37 Plan 03a: Remove the delisted forced-hide from library and Console Mode Summary

**Deleted the LIB-07 delisted-gate in `isGameAvailable()` and the matching `filterEngine` OR clause in the same commit (D-15), then lifted the identical forced-hide out of Console Mode (D-13) — a delisted, installed Steam game (Dead Island / 91310) is no longer trapped by any of the three enforcement points.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-22T14:00Z (approx)
- **Completed:** 2026-08-22T14:15:20+12:00
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- `SteamGame.isGameAvailable()` now answers only "is this game installed and is its install_path on disk" — the same question its gog/nile/legendary analogs answer. The LIB-07 gate that forced `false` for any delisted game is gone.
- `filterEngine.isNonAvailableGame` is now `deps.nonAvailableAppNames.includes(game.app_name)` and nothing else — the delisted OR clause that could not be healed by `reconcileNonAvailableGames` is gone.
- `selectConsoleGames` and `activateGame` (Console Mode) no longer exclude/refuse delisted games — the same forced-hide defect, on a second screen, is fixed in the same plan.
- Two readers that would have gone stale the moment the fix landed — `findSilentlyExcludedGames`'s `!game.is_delisted` exclusion and `reconcileNonAvailableGames`'s doc comment claiming the delisted clause "keeps hiding it regardless" — were corrected in the same commit as the production fix, not left as landmines.
- Two additional stale tests not enumerated in the plan's `<interfaces>` section (in `libraryHeaderVisibility.test.ts` and `reconcileNonAvailableGames.test.ts`) were discovered failing immediately after the Task 2 production edit and flipped in the same commit.

## Task Commits

1. **Task 1: Wave 0 — write the two gates that must go RED against today's code** - `58cd12864` (test)
2. **Task 2: Remove the delisted hide from BOTH enforcement points, and correct the two readers it makes stale** - `125f7915b` (fix)
3. **Task 3: Lift the same forced hide out of Console Mode (D-13)** - `14b3e0817` (fix)

_Note: this is a plain `type="auto"` plan, not TDD-gated; the RED-then-GREEN discipline was followed by choice per the plan's Wave 0 instruction, not by `tdd="true"` frontmatter._

## Wave 0 RED Evidence (Task 1, before any production edit)

```
FAIL Frontend src/frontend/screens/Library/__tests__/filterEngine.test.ts
  ● filter engine › a delisted Steam game is VISIBLE at default filters — is_delisted no longer implies non-available (REQ-37-02, D-11)

    expect(received).toEqual(expected) // deep equality
    - Expected  - 3
    + Received  + 1
    - Array [
    -   "delisted-app",
    - ]
    + Array []
      181 |     expect(result.map((g) => g.app_name)).toEqual(['delisted-app'])
          |                                           ^

FAIL Backend src/backend/storeManagers/steam/__tests__/games.test.ts
  ● SteamGame supporting read methods — GAME-01 unblock › isGameAvailable() resolves TRUE when game is delisted and installed with an existing install_path (D-15, Dead Island/91310 specimen) — LIB-07 gate removed

    expect(received).toBe(expected) // Object.is equality
    Expected: true
    Received: false
      6288 |     expect(available).toBe(true)
           |                       ^

Test Suites: 2 failed, 2 total
Tests:       2 failed, 289 passed, 291 total
```

Only the two target cases failed; all other 289 tests in both suites stayed green, confirming the RED gates were isolated to the intended behaviour and not a broken harness.

## Task 3 RED Evidence (before ConsoleMode production edit)

```
FAIL Frontend src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts
  ● ConsoleMode/selectors: selectConsoleGames › a delisted Steam game IS returned, and a hidden game is still excluded (REQ-37-02, D-13; over-removal guard)

    expect(received).toEqual(expected) // deep equality
    - Expected  - 13
    + Received  +  1
    - Array [
    -   Object { "app_name": "delisted", ... "is_delisted": true, ... }
    - ]
    + Array []
      93 |     expect(result).toEqual([delisted])
         |                    ^

Test Suites: 1 failed, 2 passed, 3 total
Tests:       1 failed, 56 passed, 57 total
```

## Post-fix GREEN confirmation

- `npx jest src/frontend/screens/Library/__tests__/ src/frontend/screens/ConsoleMode/ src/frontend/hooks/__tests__/ --silent` → 14 suites / 233 tests passed.
- `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts --silent` → 1 suite / 260 tests passed.
- `npx tsc --noEmit -p tsconfig.json` → clean, no errors.
- Both Task 1 gates (filterEngine.test.ts's flipped delisted case, games.test.ts's flipped D-15 case) are GREEN against the fixed production code — confirmed against the RED text recorded above.
- Task 3's new `selectors.test.ts` delisted case is GREEN against the fixed `selectors.ts`.

## Files Created/Modified
- `src/backend/storeManagers/steam/games.ts` - removed the LIB-07 `if (info?.is_delisted) return resolve(false)` guard from `isGameAvailable()`; replaced with a comment recording the REQ-37-02/D-15 reversal.
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - flipped the delisted+installed `isGameAvailable()` case to assert `true`; renamed the delisted+not-installed case to make explicit it is the "did not become always-true" over-removal guard.
- `src/frontend/screens/Library/filterEngine.ts` - reduced `isNonAvailableGame` to `deps.nonAvailableAppNames.includes(game.app_name)`; rewrote the header comment to describe the single-writer semantics and D-16's deliberate non-routing of the delisted facet.
- `src/frontend/screens/Library/__tests__/filterEngine.test.ts` - flipped the delisted case to assert visibility; added a companion case pinning the surviving `nonAvailableAppNames` membership half of the OR.
- `src/frontend/screens/Library/components/LibraryHeader/gameCount.ts` - removed the `!game.is_delisted &&` term from `findSilentlyExcludedGames`; rewrote the doc comment paragraph that justified the old exclusion (now false) with the post-REQ-37-02 rationale (a delisted game on the list is anomalous like any other).
- `src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts` - flipped the "does NOT fire for a delisted Steam game" case to "FIRES for a delisted Steam game" and updated the mixed-library case's expected output to include the delisted appName.
- `src/frontend/hooks/constants.ts` - corrected the `reconcileNonAvailableGames` doc-comment sentence claiming the delisted clause "keeps hiding it regardless" — that clause no longer exists, so dropping a delisted game's list entry now does make it visible.
- `src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts` - flipped the `isNonAvailableGame delisted-independence premise` describe/test to assert the premise is retired (`isNonAvailableGame` now returns `false` for a delisted game with an empty list).
- `src/frontend/screens/ConsoleMode/selectors.ts` - removed the `!g.is_delisted &&` term from `selectConsoleGames`'s filter predicate; rewrote the GAP-B comment to record the REQ-37-02/D-13 reversal.
- `src/frontend/screens/ConsoleMode/index.tsx` - removed `activateGame`'s `if (game.is_delisted) return` early return and its GAP-B comment; the `!idle` guard and status branches are untouched.
- `src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts` - split the combined DLC/third-party/delisted exclusion test (removing delisted from the "still excluded" group) and added a new case asserting a delisted game is returned while a hidden game is still excluded.

## Decisions Made
- Followed the plan's D-15/D-16/D-13 decisions exactly as locked in `37-CONTEXT.md`. No new product decisions were required — the two "Claude's Discretion" follow-on readers (`gameCount.ts`, `hooks/constants.ts`) were sequenced as the plan specified.
- Chose to flip existing tests rather than duplicate-and-add throughout, per this repo's recorded lesson that a stale test asserting old behaviour left green next to a new opposite one is how a gate goes vacuous.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two additional stale tests broken by the Task 2 production change, not named in the plan's `<interfaces>` section**
- **Found during:** Task 2, immediately after committing the `games.ts`/`filterEngine.ts` change, while running the broader `Library`/`hooks` suites (not just the two Task 1 gates) to confirm no regressions.
- **Issue:** `src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts` had two `findSilentlyExcludedGames` cases pinning the OLD "delisted exclusion is legitimate" premise (one asserting the guard does NOT fire for a delisted game, one asserting a delisted appName is excluded from the guard's output in a mixed library). `src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts` had a describe block, `isNonAvailableGame delisted-independence premise`, explicitly asserting the now-removed OR clause's behaviour (`isNonAvailableGame` returns `true` for a delisted game with an empty list).
- **Fix:** Flipped all three assertions to match the corrected behaviour: `findSilentlyExcludedGames` now fires on a delisted game (matching the `gameCount.ts` doc-comment rewrite in the same commit), and `isNonAvailableGame` now returns `false` for a delisted game with an empty `nonAvailableAppNames` list.
- **Files modified:** `src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts`, `src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts`
- **Verification:** `npx jest src/frontend/screens/Library/ src/frontend/hooks --silent` — 24 suites / 609 tests passed after the fix.
- **Committed in:** `125f7915b` (Task 2 commit — same commit as the production fix, not a separate follow-up, since these tests directly encode the behaviour Task 2 was changing).

---

**Total deviations:** 1 auto-fixed (Rule 1, spanning 2 files / 3 test cases)
**Impact on plan:** Necessary for correctness — leaving either stale test red or green-but-wrong would have hidden a real regression signal or a real gap. No scope creep: both files are direct downstream readers of the two functions Task 2 explicitly changed, discovered by running the plan's own stated verification command (`npx jest src/frontend/screens/Library/... src/frontend/hooks/...`) rather than by exploring unrelated code.

## Issues Encountered
None beyond the deviation above. All three tasks' `<verify>` and `<acceptance_criteria>` commands passed as specified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- REQ-37-02's production/test surface for the library grid and Console Mode is complete and green. Per the plan's own `<verification>` note, a green suite does NOT close REQ-37-02 — the live gate for this requirement lives in plan **37-03b**, which needs 37-03b's "No store page" label to be checkable in the same restart before the requirement can be marked closed end-to-end.
- `steamInstallOptionsEntry.ts` (D-14) was NOT touched, as required — the Install-with-options doors stay closed.
- `fetchMetadataIfNeeded`'s `is_delisted` write path and its `!data` guard were NOT touched, as required — only the READ side of the flag changed.
- 37-03b can now build the new delisted facet/badge/filter row on top of an `isGameAvailable()` and `isNonAvailableGame` that no longer conflate "delisted" with "non-available", per D-16's constraint that the new facet must not be routed through `nonAvailableGames`.

---
*Phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam*
*Plan: 03a*
*Completed: 2026-08-22*

## Self-Check: PASSED

- FOUND: commit 58cd12864 (Task 1 — test)
- FOUND: commit 125f7915b (Task 2 — fix)
- FOUND: commit 14b3e0817 (Task 3 — fix)
- FOUND: .planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-03a-SUMMARY.md
- FOUND: src/backend/storeManagers/steam/games.ts
- FOUND: src/frontend/screens/ConsoleMode/selectors.ts
