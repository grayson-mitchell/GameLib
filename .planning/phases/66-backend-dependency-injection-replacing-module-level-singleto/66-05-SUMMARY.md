---
phase: 66-backend-dependency-injection-replacing-module-level-singleto
plan: 05
subsystem: testing
tags: [jest, sidecar, bootFresh, di, guard-tests]
requires:
  - phase: 66-04
    provides: bootFresh() harness helper
provides:
  - "sidecarRejectionGuard.test.ts on one bootFresh() boot per case"
  - "testContainment.test.ts non-booting loads labelled"
affects: [66-08]
key-files:
  modified:
    - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
key-decisions:
  - "Group 1b pre-boot half runs inside bootFresh({ before }) (sink is read synchronously at emit time), post-boot half after, with an awaited tick between the two uncaught emits"
requirements-completed: []
duration: 30min
completed: 2026-11-10
---

# Phase 66 Plan 05: guard suites onto bootFresh Summary

`sidecarRejectionGuard.test.ts` now boots the sidecar once per case through `bootFresh()`; `testContainment.test.ts` never booted the sidecar and only needed its non-booting loads labelled.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 sidecarRejectionGuard | d607dce56 | 45 passed (45 before), eslint + prettier clean |
| 2 testContainment | 11fe1d36f | 54 passed + 1 known pre-existing failure (T-34.2-83) |

## What changed

- `setupIsolatedBootstrapHarness()` now calls `bootFresh({ before })`; handles (backendEvents, anticheat mock, logWarning spy) are taken from the same fresh registry in the original require order (bootstrap before logger). The three Group 1 tests no longer create streams or call `init`.
- Group 1b (WR-04, D-35-10-01): single boot per case. The guard is installed and the pre-boot emit/assertions run inside `before`; the post-boot emit asserts the sink is now bound (logWarning / logError never logWarning). Pre-boot coverage and the severity pin are preserved.
- Every remaining `jest.isolateModules` code site carries a "no boot" comment (non-booting module loaders).
- testContainment: it never called `init(`/`startSidecar(` in code (source-text gates only); two `isolateModules` loads got "no boot" comments. No behavioural change; `jest.setupContainment.ts` untouched.

## jest.mock accounting

Net 0; `sidecar-tests-flows-1.json` unchanged. `node meta/backendDiCeilings.cjs --shard sidecar-tests-flows-1` PASS.

## Deviations from Plan

None in behaviour. Acceptance-grep note: `grep -cE "\binit\(|startSidecar\("` is not 0 for either file; every remaining hit is a comment/doc-string or a source-gate string (e.g. `indexOf('init()')`), not a call. Likewise prose comments mentioning `jest.isolateModules()` in doc blocks lack a "no boot" label; all code sites have one. testContainment's "booted sidecar" cases from the plan text do not exist in this file.

## Deferred Issues

`testContainment.test.ts` T-34.2-83 still fails (unclassified `outboundHttpRegistry.test.ts`, quick 261110-9w2); pre-existing, in deferred-items.md.

## Known Stubs

None.

## Self-Check: PASSED
