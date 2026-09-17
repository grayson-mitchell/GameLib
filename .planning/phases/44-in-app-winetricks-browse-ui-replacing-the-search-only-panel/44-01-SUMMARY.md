---
phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
plan: 01
subsystem: winetricks
tags: [typescript, jest, tdd, pure-functions, react-free]

# Dependency graph
requires: []
provides:
  - "src/common/winetricks/verbs.ts: CURATED_WINETRICKS_VERBS (8, D-01 order), NEEDS_GUI_WINETRICKS_VERBS (8), resolveCuratedComponents() (D-03 silent-skip resolver)"
  - "src/common/winetricks/deriveRowState.ts: WinetricksRowState (6-member union), deriveRowState() (needsGui-first precedence), attributeProgressEvent()/clearVerbError() (per-verb error attribution)"
  - "D-03 curated-coverage fixture in winetricksListParse.test.ts, proven non-vacuous by a recorded revert-to-red negative control"
affects: [44-02, 44-03, 44-04, 44-05, 44-06, 44-07, 44-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure logic modules under src/common/<domain>/ (no React, no I/O) so both the Common and Backend jest projects can import them -- mirrors src/common/humble/viewFilters.ts"
    - "Reference-stable state updates (attributeProgressEvent/clearVerbError return the SAME object when nothing changed) to avoid re-rendering a large row list on every progress event"

key-files:
  created:
    - src/common/winetricks/verbs.ts
    - src/common/winetricks/deriveRowState.ts
    - src/common/winetricks/__tests__/verbs.test.ts
    - src/common/winetricks/__tests__/deriveRowState.test.ts
  modified:
    - src/backend/tools/__tests__/winetricksListParse.test.ts

key-decisions:
  - "Placed both new modules in src/common/winetricks/ rather than src/frontend/.../WinetricksBrowse/ (RESEARCH's proposed layout) so the Backend-project D-03 test can import CURATED_WINETRICKS_VERBS directly, and to avoid enrolling two non-UI files in the i18n fork-touched-files gate (plan's own placement note, not a new deviation)"

patterns-established:
  - "Pattern: per-verb error attribution via a correlation key (payload.installingComponent) rather than global log-line classification -- fills RESEARCH Pitfall 2's confirmed gap"

requirements-completed: [REQ-44-01, REQ-44-02, REQ-44-03, REQ-44-13, REQ-44-19, REQ-44-20]

# Metrics
duration: ~20min
completed: 2026-09-16
---

# Phase 44 Plan 01: Winetricks curated verbs, Needs-GUI set, and row-state derivation Summary

**Three pure TypeScript modules under `src/common/winetricks/` (curated/Needs-GUI verb constants, a silent-skip D-03 resolver, and a six-state row precedence function with per-verb error attribution) plus a real multi-category parser fixture proving D-03's drift-detection assertion is non-vacuous.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-16
- **Tasks:** 3 completed (Task 2 executed as TDD: RED then GREEN)
- **Files modified:** 5 (3 created, 1 test-created, 1 extended)

## Accomplishments

- `verbs.ts` ships the exact D-01 8-verb curated list, the D-C4/fence-3 8-verb Needs-GUI set, and `resolveCuratedComponents()`, which resolves curated verbs by lookup against the parsed set, skips unmatched entries silently, preserves curated order (not input order, no `.sort()`), and returns the same object references so React keys stay stable.
- `deriveRowState.ts` implements the six-state `WinetricksRowState` union with `needsGui` unconditionally first (C-4), plus `attributeProgressEvent()`/`clearVerbError()` -- the per-verb error-attribution seam RESEARCH Pitfall 2 confirmed does not exist anywhere in this repo, built to be reference-stable (no unnecessary re-renders) via full TDD (RED commit, then GREEN commit).
- Extended `winetricksListParse.test.ts` with a realistic, multi-category, multi-chunk fixture (`CURATED_COVERAGE_CHUNKS`) covering all 8 curated verbs plus 2 Needs-GUI verbs and a cross-category duplicate, and a D-03 assertion that fails by naming the exact drifted verb -- proven with a recorded revert-to-red negative control.

## Task Commits

1. **Task 1: Create src/common/winetricks/verbs.ts** - `f1f8f98ac` (feat)
2. **Task 2: Create src/common/winetricks/deriveRowState.ts** - TDD:
   - RED: `4206e6cc2` (test)
   - GREEN: `fa9d3059b` (feat)
3. **Task 3: Extend winetricksListParse.test.ts with D-03's curated-coverage fixture** - `1e7057c7f` (test)

_Note: no plan-metadata commit was made for STATE.md/ROADMAP.md -- see "State Updates Skipped" below._

## Files Created/Modified

- `src/common/winetricks/verbs.ts` - `CURATED_WINETRICKS_VERBS`, `NEEDS_GUI_WINETRICKS_VERBS`, `resolveCuratedComponents()`
- `src/common/winetricks/deriveRowState.ts` - `WinetricksRowState`, `VerbErrorMap`, `deriveRowState()`, `attributeProgressEvent()`, `clearVerbError()`
- `src/common/winetricks/__tests__/verbs.test.ts` - 7 tests covering exact ordering, Needs-GUI membership, resolver order/skip/identity/no-mutation
- `src/common/winetricks/__tests__/deriveRowState.test.ts` - 15 tests, one per behaviour listed in the plan's `<behavior>` block
- `src/backend/tools/__tests__/winetricksListParse.test.ts` - added `CURATED_COVERAGE_CHUNKS` fixture + 2 new `it()` cases (structural parse + D-03 resolution)

## Final `verbs.ts` export list (recorded per plan `<output>` instruction)

```
export const CURATED_WINETRICKS_VERBS = [
  'vcrun2019', 'vcrun2013', 'vcrun2010', 'dotnet48',
  'd3dx9', 'xact', 'corefonts', 'physx'
] as const

export const NEEDS_GUI_WINETRICKS_VERBS: ReadonlySet<string>  // size 8:
  // 3dmark03, 3dmark06, fontxplorer, foobar2000,
  // stalker_pripyat_bench, ubisoftconnect, unigine_heaven, utorrent

export function resolveCuratedComponents(
  all: readonly WinetricksComponent[]
): WinetricksComponent[]
```

## Task 3 negative-control failure output (recorded per plan `<output>` instruction, verbatim)

Temporarily appended a 9th, non-existent verb (`'nonexistentverb9'`) to `CURATED_WINETRICKS_VERBS` in `src/common/winetricks/verbs.ts`, re-ran `npx jest --selectProjects Backend --passWithNoTests winetricksListParse -t "D-03"`, confirmed RED, then reverted (confirmed clean via `git diff` showing no changes to `verbs.ts`):

```
  ● parseWinetricksListAll › D-03 curated coverage fixture › D-03: every curated verb resolves against the committed parse fixture

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 3

    - Array []
    + Array [
    +   "nonexistentverb9",
    + ]

      353 |       )
      354 |
    > 355 |       expect(unresolved).toEqual([])
          |                          ^
      356 |     })
      357 |   })
      358 | })

      at Object.<anonymous> (src/backend/tools/__tests__/winetricksListParse.test.ts:355:26)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 16 skipped, 1 passed, 18 total
```

The failure names the exact drifted verb (`"nonexistentverb9"`), confirming the assertion is non-vacuous and that CI would report drift by name, not just by count.

## Decisions Made

None beyond the plan's own documented placement note (`src/common/winetricks/` over `src/frontend/.../WinetricksBrowse/`) -- followed as specified in the plan's `<objective>` block.

## Deviations from Plan

None - plan executed exactly as written. All acceptance-criteria greps (verb counts, sort absence, `' err'` single-occurrence check, `toBe` reference-identity count, `=====` header-count delta ≥5) were verified and passed; see verification section below.

## Issues Encountered

Two arithmetic mistakes while building `CURATED_COVERAGE_CHUNKS`' structural assertion (first miscounted 10 distinct entries, corrected to the actual parsed count of 12, then corrected again to the true count of 11 after restructuring the fixture to put the category-header chunk boundary on `fonts` and move the duplicate to `corefonts` under `settings` per the plan's "duplicated verb across two categories" wording). Caught immediately by running the suite before committing; no incorrect assertion was ever committed.

## State Updates Skipped

Per this run's explicit standing project instruction (CLAUDE.md + this task's `<project_specific_hard_ban>`), `.planning/STATE.md` and `.planning/ROADMAP.md` were NOT modified by this executor -- confirmed byte-identical via `git status --short` showing no changes to either file after all task commits. No `gsd-sdk query state.*`, `roadmap.*`, `phase.complete`, or `commit` invocations were made. The orchestrator owns these writes after the wave completes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`src/common/winetricks/verbs.ts` and `deriveRowState.ts` are ready to be imported by the downstream composition plans (44-02 through 44-06: `WinetricksBrowse/Row`, `WinetricksBrowse/index.tsx`, `Winetricks/index.tsx` wiring). No files under `src/frontend/` were touched by this plan, keeping plan 44-07's gate-artifact arithmetic to exactly the 2 new `.tsx` files plus 1 deletion as the plan's success criteria required.

## Verification

```
npx jest --selectProjects Common --passWithNoTests --silent
  # 3 suites, 74 tests passed

npx jest --selectProjects Backend --passWithNoTests --silent winetricksListParse
  # 1 suite, 18 tests passed

npx jest --selectProjects Backend --passWithNoTests --silent
  # 218 suites, 4864 passed, 1 skipped (pre-existing worker-exit warning,
  # unrelated to this plan -- documented in plan's <verification> note)

npx tsc --noEmit -p tsconfig.json   # no errors in any file touched
npx eslint <all 5 touched/created files>   # no errors
```

## Self-Check: PASSED

All 5 created/modified files confirmed present on disk; all 5 commit hashes
(`f1f8f98ac`, `4206e6cc2`, `fa9d3059b`, `1e7057c7f`, `23211634f`) confirmed
present in `git log --oneline --all`.

---
*Phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel*
*Plan: 01*
*Completed: 2026-09-16*
