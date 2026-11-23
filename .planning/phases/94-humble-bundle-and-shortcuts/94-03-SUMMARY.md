---
phase: 94-humble-bundle-and-shortcuts
plan: 03
subsystem: testing
tags: [delete-gate, survivor-schedule, jest, no-rollback-flag, discovery, relocated]
status: complete

requires:
  - phase: 86-pure-leaf-services
    provides: infoPortGate scans (findRustCalls, findExportedValues, findImporters, checkShimShape) and runSlice
  - phase: 87-engine-wine-and-tools
    provides: the engineWinePortComplete / engineWineShimSchedule shape this plan mirrors
provides:
  - humblePortComplete.test.ts and shortcutsPortComplete.test.ts, each with a noRollbackFlag describe (D-15)
  - humbleShortcutsShimSchedule.test.ts with five survivor shapes, ALLOWED_DELETED_BY and exported noIntraPhaseRowsLeft
affects: [94-04, 94-11, 94-22, 94-24, 94-29, 94-30]

requirements-completed: []

actuals:
  tokens: 21000
  tasks: 2
  commits: 2

plan_head_before: d7cd463a7e9dd702e83a9c2d5ea15af5a168b422
plan_head_after: df3b8bdd9e42d0f2fa256ec3a2f2450d29f5e3be

tech-stack:
  added: []
  patterns:
    - "a relocated schedule row covers the RUST_* calls inside the one top-level export it names (counted per file#fn), not the whole file"
    - "local ScheduleRow in the schedule test so the shared infoPortGate.ts (which 87 also edits) is untouched"

key-files:
  created:
    - src/backend/__tests__/humblePortComplete.test.ts
    - src/backend/__tests__/shortcutsPortComplete.test.ts
    - src/backend/__tests__/humbleShortcutsShimSchedule.test.ts
  modified: []

key-decisions:
  - "The schedule starts with one row, not empty: createRustLoginWindowSeam (relocated, deletedBy 92) at its current file humbleLoginFlowRegistration.ts, because the tree already held eight RUST_HUMBLE_LOGIN_*/REVEAL_POST calls that discovery finds"
  - "A relocated row covers calls held inside the single export it names, so 94-04 can move the seam factory and add the loginSeamRegistration rows without discovery going red"
  - "The port-complete gates carry no runSlice describe yet: a SliceSpec with nothing deleted would pass vacuously, so 94-24, 94-29 and 94-30 add theirs red first"

patterns-established:
  - "Survivor shapes shim, resolver, view, twin and relocated, each checked by its own detector with a planted-violation self-test"

duration: 25min
completed: 2026-11-24
---

# Phase 94 Plan 03: Delete gates and survivor schedule Summary

**Two no-flag port-complete gates for Humble and shortcuts plus a both-direction survivor schedule that admits shim, resolver, view, twin and relocated rows, all green and self-tested from the first commit.**

## Accomplishments

- `humblePortComplete.test.ts` and `shortcutsPortComplete.test.ts` walk `src/` and `src-tauri/src` and assert neither `GAMELIB_HUMBLE` nor `GAMELIB_SHORTCUTS` appears (D-15). Each has an anti-vacuity floor test and three planted self-tests (flag caught in code, comment and longer name; planted tree walked; empty walk fails the floor). 5 tests each.
- `humbleShortcutsShimSchedule.test.ts` (36 tests) discovers survivors in both directions: exported values under `src/backend/humbleshortcuts/`, every export of `src/backend/sidecar/shortcutsResolvers.ts`, and every function holding a `requestRustInvoke(RUST_HUMBLE_*` or `RUST_SHORTCUTS_*` call elsewhere. `register*` exports need a row naming them in `wiring`.
- Relocated rows are checked by file, export and callers; twin and view rows by a `vectors` test that imports the file; `deletedBy` is held to `ALLOWED_DELETED_BY` (88 to 99 with 90.1 and 90.2); exported `noIntraPhaseRowsLeft` fails while a 94 row exists (for 94-30).
- Every walk has a floor, and every detector has a planted-violation self-test.

## Task Commits

1. Task 1 (tracer): both port-complete gates - `163308f52`
2. Task 2: humbleShortcutsShimSchedule - `df3b8bdd9`

The tracer gate re-ran the Task 1 verify (jest, `pnpm codecheck`, prettier) green before Task 2 expanded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The tree already held Rust calls on `RUST_HUMBLE_*` channels, so an empty schedule could not be green**
- **Found during:** Task 2
- **Issue:** The plan assumed an empty `SCHEDULE` equals an empty discovered set on the real tree. `src/backend/sidecar/humbleLoginFlowRegistration.ts` (Phase 91) already holds eight `requestRustInvoke(RUST_HUMBLE_LOGIN_*` / `RUST_HUMBLE_REVEAL_POST` calls, all inside the `createRustLoginWindowSeam` factory's methods. Discovery by nearest named holder would return `open`, `cookies`, `close` and five more, red from the first commit.
- **Fix:** Scheduled the one real survivor as a `relocated` row (`createRustLoginWindowSeam`, `humbleLoginFlowRegistration.ts`, callers `handlers.ts`, deletedBy 92, matching 94-04's value), and made a relocated row cover the calls inside the single top-level export it names (counted per `file#fn`, so a stray function or a same-named method elsewhere in the file is still discovered, with a planted test). No floor lowered and no allow-list widened.
- **Impact on later plans:** 94-04 must repoint this row's `file` to `src/backend/sidecar/loginSeamRegistration.ts` when it moves the factory (the test goes red until it does, which is the intended signal), and keep `registerLoginWindowSeam` and the others as its plan lists.
- **Files modified:** src/backend/__tests__/humbleShortcutsShimSchedule.test.ts
- **Commit:** df3b8bdd9

Otherwise the plan executed as written. Plan acceptance numbers: both gate files pass with 5 tests each; the schedule passes with 26 planted-fixture self-tests (plan asked for 6); `grep -c "'relocated'"` is 8.

## Known Stubs

None.

## Threat Flags

None. Test-only files; no new network, auth, file-access or schema surface (T-94-06 mitigated: floors on every walk, planted self-tests per detector, both-direction set equality).

## Verification

- `pnpm exec jest --runTestsByPath` on all three files: 3 suites, 46 tests, passing.
- `pnpm codecheck` clean; `npx prettier --check` on the three files clean; `npx eslint` on the three files clean.
- The real-tree count of `GAMELIB_HUMBLE` and `GAMELIB_SHORTCUTS` under `src/` and `src-tauri/src` is 0.

## Self-Check: PASSED

- FOUND: src/backend/__tests__/humblePortComplete.test.ts
- FOUND: src/backend/__tests__/shortcutsPortComplete.test.ts
- FOUND: src/backend/__tests__/humbleShortcutsShimSchedule.test.ts
- FOUND: 163308f52, df3b8bdd9
