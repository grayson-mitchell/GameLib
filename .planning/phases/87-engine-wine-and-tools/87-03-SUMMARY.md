---
phase: 87-engine-wine-and-tools
plan: 03
subsystem: testing
tags: [jest, delete-gate, shim-schedule, port-complete, rollback-flag, twin, view]

requires:
  - phase: 86-pure-leaf-services
    provides: infoPortComplete runSlice gate, infoShimSchedule, infoPortGate scans, censusFloor
provides:
  - src/backend/testUtils/portSliceGate.ts (SliceSpec, runSlice, loaders, walks and floors shared by the 86 and 87 gates)
  - findRustCalls(files, prefixes) with findRustInfoCalls as a wrapper, and an optional channel-prefix parameter on checkShimShape
  - findExportedValues (exported function, const, class and non-type export-list names, never a type)
  - ShimRow.shape widened to shim, resolver, twin, view with an optional vectors test file
  - engineWinePortComplete.test.ts with the noRollbackFlag describe (no GAMELIB_ENGINE or GAMELIB_WINE under src/ or src-tauri/src)
  - engineWineShimSchedule.test.ts, an empty schedule with both-direction discovery and planted detectors
affects: [87-04, 87-56, 87-57, 98-shell-cutover]

actuals:
  tokens: 9500
  tasks: 2
  commits: 3

plan_head_before: f110d249011bc750197d3800cabd167155912280
plan_head_after: 9fe956e538f5b48277de138d999f15133395c224

tech-stack:
  added: []
  patterns:
    - "a per-slice gate helper in testUtils (outside __tests__, so jest never runs it) that both phase gates import, with the walks exported rather than rebuilt"
    - "a schedule whose discovery covers exported value bindings in a directory plus every function holding a typed channel call outside it, with register* helpers covered only by a same-file row's wiring list"
    - "twin and view survivors pinned to Rust by a vectors test that must import the survivor's file"

key-files:
  created:
    - src/backend/testUtils/portSliceGate.ts
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
  modified:
    - src/backend/testUtils/infoPortGate.ts
    - src/backend/__tests__/infoPortComplete.test.ts

key-decisions:
  - "No sub-slice describe was added to engineWinePortComplete yet: a SliceSpec with nothing deleted passes vacuously, so each deleting plan adds its own describe red first; the header lists the six D-06 sub-slices"
  - "checkShimShape gained an optional prefixes parameter (default RUST_INFO_) instead of a second function, so the 86 schedule and its messages are unchanged"
  - "noIntraPhaseRowsLeft is exported from the schedule test file and throws naming every deletedBy 87 row; 87-56 adds the it() that calls it over SCHEDULE"
  - "Twin and view rows are in discovery scope only when their file is under enginewine/ or is engineWineResolvers.ts; shim and resolver rows are always in scope because discovery finds them by their call site"

patterns-established:
  - "Rollback-flag gate from the first commit: findRollbackFlag over raw text, so a flag named in a comment is still caught"
  - "A temp-directory planted tree walked through the real walkStripped proves a detector can fail"

requirements-completed: [SVC-02]

duration: 20 min
completed: 2026-11-23
status: complete

coverage:
  - deliverable: "runSlice and SliceSpec extracted; infoPortComplete imports them and its describes are unchanged"
    verification:
      - kind: test
        ref: "src/backend/__tests__/infoPortComplete.test.ts"
        status: pass
    human_judgment: false
  - deliverable: "findRustCalls generalised; findRustInfoCalls is a wrapper"
    verification:
      - kind: test
        ref: "src/backend/__tests__/infoShimSchedule.test.ts"
        status: pass
    human_judgment: false
  - deliverable: "noRollbackFlag gate for GAMELIB_ENGINE and GAMELIB_WINE with planted self-tests"
    verification:
      - kind: test
        ref: "src/backend/__tests__/engineWinePortComplete.test.ts#noRollbackFlag"
        status: pass
    human_judgment: false
  - deliverable: "survivor schedule with four shapes, both-direction discovery and planted detectors"
    verification:
      - kind: test
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 03: Engine and wine delete-gate and survivor schedule Summary

**A per-sub-slice port-complete gate with a from-the-first-commit no-rollback-flag check, and a survivor schedule admitting shim, resolver, twin and view rows with discovery in both directions, both reusing the 86 scans.**

## Performance

- **Duration:** 20 min (estimated; the start time was not recorded)
- **Completed:** 2026-11-23
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `runSlice`, `SliceSpec`, the manifest and store-table loaders, the walks and the floor constants moved out of `infoPortComplete.test.ts` into `testUtils/portSliceGate.ts`. All 86 describes pass unchanged (243 tests across the three 86/87 gate suites at that point).
- `findRustCalls(files, prefixes)` is the one AST walk; `findRustInfoCalls` is `findRustCalls(files, ['RUST_INFO_'])`. `checkShimShape` takes an optional prefix list, defaulting to `RUST_INFO_` with the same message text, so the 86 schedule is untouched.
- `engineWinePortComplete.test.ts` forbids `GAMELIB_ENGINE` and `GAMELIB_WINE` anywhere under src/ or src-tauri/src (none exist today), with floors on every walk and three planted self-tests (a flag in code, in a comment and as a longer name; a temp tree walked through `walkStripped`; an empty tree failing the floor).
- `engineWineShimSchedule.test.ts` starts with an empty `SCHEDULE` and no `enginewine/` directory, so discovery equals the schedule from the first commit. It carries 30 tests, 22 of them planted-fixture detectors: an unscheduled exported function in a temp `enginewine/` tree, a `registerX` export with and without a covering `wiring` row, a shim with two calls, a twin with no vectors field, with a missing vectors file and with a vectors test that does not import it, `deletedBy` outside 87..99, and `noIntraPhaseRowsLeft` failing while a row has `deletedBy: 87`.
- `findExportedValues` reports exported functions, consts, classes and non-type export lists and never an interface or type alias.

## Task Commits

1. **Task 1: tracer, extract runSlice, generalise the call finder, noRollbackFlag** - `5763d6135` (test)
2. **Task 2 RED: the survivor schedule gate with planted detectors, failing on the missing `findExportedValues`** - `9d8b7d122` (test)
3. **Task 2 GREEN: twin and view shapes and `findExportedValues` in infoPortGate** - `9fe956e53` (feat)

The tracer gate ran: the Task 1 verify (jest over the three gate suites, `pnpm codecheck`, prettier) passed before Task 2 started.

## Files Created/Modified

- `src/backend/testUtils/portSliceGate.ts` - the shared `SliceSpec`, `runSlice`, loaders, walks and floors
- `src/backend/testUtils/infoPortGate.ts` - `findRustCalls`, `RustCall`, `findExportedValues`, `ShimRow` widening, `checkShimShape` prefixes
- `src/backend/__tests__/infoPortComplete.test.ts` - imports the extracted helper; behaviour unchanged
- `src/backend/__tests__/engineWinePortComplete.test.ts` - the Phase 87 gate and `noRollbackFlag`
- `src/backend/__tests__/engineWineShimSchedule.test.ts` - the Phase 87 survivor schedule

## Decisions Made

See `key-decisions` above. The notable one: no empty sub-slice describes were pre-created, because an empty `SliceSpec` would be a green check proving nothing; each deleting plan adds its describe red first, as the plan's header text requires.

## Deviations from Plan

None - plan executed exactly as written. Two small additions inside the plan's stated files: `checkShimShape` takes an optional channel-prefix parameter (needed for any `RUST_ENGINE_`/`RUST_WINE_` shim row to pass the shape rule), and the schedule file adds `wiringProblems` so a `wiring` entry must be an exported `register*` helper.

## Issues Encountered

None.

## Verification

- `pnpm exec jest --runTestsByPath` over engineWinePortComplete, infoPortComplete, infoShimSchedule and engineWineShimSchedule: 4 suites, 273 tests pass.
- Full Backend jest project: 611 suites pass, 13895 tests pass, 3 suites skipped (pre-existing).
- `pnpm codecheck` clean; `npx prettier --check` over the five paths clean; `npx eslint` over the changed files clean.
- Acceptance: `grep -c "export function findRustCalls"` is 1; `grep -c "function runSlice" infoPortComplete.test.ts` is 0; `grep -c "'twin'" infoPortGate.ts` is 1.

## Known Stubs

None. The empty `SCHEDULE` is intentional: each plan that creates a survivor adds its row in the same commit.

## Threat Flags

None. T-87-06 (a gate that scans nothing passing vacuously) is mitigated by the floors on every walk, the planted-violation self-tests per detector and the both-direction set equality.

## Next Phase Readiness

Ready for 87-04 onward: every deletion plan adds its `describe('<name>PortComplete', () => runSlice(SPEC))` red first, and every shim, resolver, twin and view adds its schedule row with the commit that creates it. 87-56 adds the `noIntraPhaseRowsLeft(SCHEDULE)` assertion and 87-57 compares the final schedule with the D-22/D-23/D-24 survivor list.

## Self-Check: PASSED

- FOUND: src/backend/testUtils/portSliceGate.ts
- FOUND: src/backend/__tests__/engineWinePortComplete.test.ts
- FOUND: src/backend/__tests__/engineWineShimSchedule.test.ts
- FOUND: 5763d6135, 9d8b7d122, 9fe956e53 (all ancestors of HEAD)
