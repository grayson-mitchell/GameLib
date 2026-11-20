---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 04
subsystem: testing
tags: [census-floor, diPhaseGates, dead-code, fileStore, jest]
status: partial

requires:
  - phase: 82-02
    provides: src/backend/testUtils/censusFloor.ts (assertAtOrAboveFloor)
provides:
  - diPhaseGates.test.ts census walks that cannot pass vacuously (D-05)
affects: [82-13, phase-85]

actuals:
  tokens: 1500
  tasks: 1
  commits: 1
plan_head_before: c0fbfa775ee8cd9dac91d2016ca972d129c5751e
plan_head_after: c3e3855c60fec1d8bcb8b91696c692d75c35c7c6

tech-stack:
  added: []
  patterns:
    - "Every census walk floor goes through assertAtOrAboveFloor, with a deliberate empty-directory case"

key-files:
  created: []
  modified:
    - src/backend/__tests__/diPhaseGates.test.ts

key-decisions:
  - "Task 1 (delete fileStore.ts) was halted under the plan's own live-path clause: ~27 Jest suites redirect backend/store_backend to jest.requireActual('../fileStore'); the deletion is Phase 85 scope, not a zero-risk delete"
  - "testUtils walk floor raised from 3 to 50 (measured 53 at c0fbfa775)"

requirements-completed: []

duration: 25 min
completed: 2026-11-20
---

# Phase 82 Plan 04: fileStore live-or-dead check and diPhaseGates D-05 guard Summary

**diPhaseGates now routes all ten walk floors through assertAtOrAboveFloor with an empty-directory proof; the fileStore.ts deletion was halted because ~27 Jest suites still load it as their store implementation.**

## What was done

### Task 2 (D-05 guard) - complete, commit c3e3855c6

- Every walk floor in `src/backend/__tests__/diPhaseGates.test.ts` (>= 400 twice, >= 17, >= 24, >= 1500 twice, >= 400 for the 66.3 scan, >= 80, and the shards `> 0`) now calls `assertAtOrAboveFloor(label, scanned, floor)`.
- The weak `files.length > 3` testUtils floor became a floor of 50 (measured 53 testUtils `.ts` files at c0fbfa775).
- New `census floors cannot pass vacuously (D-05)` describe: walks an empty `mkdtempSync` directory with the file's own `walk` helper and expects the floor guard to throw `below the floor`.
- No floor lowered. `assertAtOrAboveFloor` count in the file: 12 (acceptance >= 4); `toBeGreaterThan(3)` count: 0; the D-05 case string count: 1.
- Verify: jest 162 passed / 1 failed (the known shimCoverage 66.3 case, see below); `pnpm codecheck` clean; prettier `--file-info` not ignored and `--write` left the file unchanged.

### Task 1 (tracer: delete fileStore.ts) - HALTED, no commit

The plan's D-19 clause says to stop and record the work as Phase 85 scope if the live-or-dead check shows a live path. It did, in the importer re-grep (not in the bundle).

- Esbuild metafile (dev sidecar command from `meta/buildSidecar.ts`, `src/sidecar/index.ts`, metafile in the session scratchpad): 584 inputs, `fileStore.ts` absent, `store_backend.ts` and `storeRoot.ts` present. The runtime bundle does not reach it, as research said.
- Importer re-grep contradicts the research ("one test file plus its own test"). Besides `fileStore.test.ts` and `storeRoot.test.ts`, about 27 sidecar suites carry
  `jest.mock('backend/store_backend', () => ({ __esModule: true, default: jest.requireActual('../fileStore').default }))`: skeletonFlows, loggerFlows, storeLayer, humbleFlows, migrationsWiring, gogPresenceBootWire, bootstrapUserReconcile, bootstrapWirings, enrichmentFlows, shortcutsFlows, engineTempSweepBootWire, playtimeLockBootClear, electronUntouched, signInProbeBootWire, shellFilesFlows, appShellFlows, playtimeQueueBootDrain, sidecarRejectionGuard, clipboardFlows, installFlows, gameDetailsFlows, downloadQueueFlows, steamAuthFlows, onlineMonitorWiring, settingsFlows, runnerAuthFlows, steamFlows, humbleLoginFlows, testContainment. Deleting the file breaks all of them.
- Re-pointing them is not mechanical: they exercise fileStore's path-keyed cells and containment semantics as the test store, and the replacement (the conf-backed shim with a test root) behaves differently. That is a test-infrastructure migration across ~29 files outside this plan's `files_modified`, so it was not attempted. The plan's prohibition (no deleting code a live importer still reaches) also forbids the delete.
- Left untouched on purpose: `fileStore.ts`, its test, the `FileStore` cases in `storeRoot.test.ts`, `FileStoreCell`/`cells`/`createFileStoreCells` in `storeRoot.ts`, the diPhaseGates ledger line, the `sidecar.json` jestMock line, and the stale-comment edits (they are only stale once the file is gone). `meta/knip-baseline.txt` untouched.

## Deviations from Plan

### Plan halted by its own clause

**1. [Rule 4 - scope] Task 1 not executed: fileStore.ts has ~27 live test importers**
- **Found during:** Task 1 importer re-grep
- **Issue:** research claimed one importer; actual is the store mock for ~27 suites
- **Fix:** halted per the plan's instruction; recorded here as Phase 85 scope (migrate the suites to a test store root, then delete the file plus its test, cell types and baseline lines in one commit)
- **Files modified:** none
- **Commit:** none

Tracer gate: Task 2 does not depend on Task 1's output (the plan says Task 1's ledger removal is "already committed; do not touch the ledger", and the ledger line correctly remains because the file remains), so it ran. Its verification passes.

**Total deviations:** 1 (halt). **Impact:** criterion 5's fileStore part is unmet; the D-05 part is met.

## Issues Encountered

Known pre-existing red, not caused by this plan and deliberately left unsanctioned: `diPhaseGates.test.ts` 66.3 case `shimCoverage.ts has no module state` fails on `X86_NULL_OBJECT_VERSION_SET` at `src/backend/storeManagers/steam/bridge/shimCoverage.ts:515` (another session's quick-261120-rdo change). 162 of 163 cases pass.

## Known Stubs

None.

## Threat Flags

None. No new surface; T-82-11 was mitigated by the importer re-grep catching the live path before any deletion.

## Next Phase Readiness

- 82-13 (owns `meta/knip-baseline.txt`) is unaffected; this plan changed no baseline.
- Follow-up needed: the fileStore deletion (Phase 85 or a new 82 plan) must first replace the ~27 `requireActual('../fileStore')` mocks. The `82-RESEARCH.md` "fileStore live or dead (settled)" section is wrong about importers.

## Self-Check: PASSED

- `src/backend/__tests__/diPhaseGates.test.ts` exists; commit c3e3855c6 is an ancestor of HEAD.
- `git rev-list --count c0fbfa775..HEAD` = 1 at SUMMARY time.
