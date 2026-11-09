---
phase: 66-backend-dependency-injection-replacing-module-level-singleto
plan: 06
subsystem: testing
tags: [jest, sidecar, bootFresh, di, flows-tests]
requires:
  - phase: 66-04
    provides: bootFresh() harness helper
provides:
  - "humble, gameDetails, logger, shellFiles, skeleton, downloadQueue and enrichment flows suites on one fresh boot per case"
  - "bootFresh({ reuseRegistry }) for cases that must rebind and configure before the boot"
affects: [66-08]
key-files:
  modified:
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
    - src/backend/sidecar/__tests__/humbleFlows.test.ts
    - src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
    - src/backend/sidecar/__tests__/loggerFlows.test.ts
    - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
    - src/backend/sidecar/__tests__/skeletonFlows.test.ts
    - src/backend/sidecar/__tests__/downloadQueueFlows.test.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
key-decisions:
  - "Per file: a freshRegistry() (resetModules + require every module the cases configure or inspect, into file-level lets) runs in beforeEach, then a local boot() = bootFresh({ reuseRegistry: true }). This keeps pre-boot mock configuration working without moving it all into bootFresh({ before })."
requirements-completed: []
duration: 90min
completed: 2026-11-10
---

# Phase 66 Plan 06: flows-2 tests onto bootFresh Summary

Seven flows suites now boot the sidecar exactly once per test case in a fresh module registry; no call to `init(` or `startSidecar(` remains in test code.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 humbleFlows, gameDetailsFlows, loggerFlows (+ harness option) | 617fb079f | 35 + 38 + 17 = 90 passed (90 before) |
| 2 shellFilesFlows, skeletonFlows, downloadQueueFlows, enrichmentFlows | 9b7ef71db | 110 passed (109 before; +1 from a split case) |

Combined run: 200 passed, 200 before + 1 split.

## Approach

Top-level `import` bindings of mocked or registry modules go stale after `jest.resetModules()`. Each file now declares those handles as `let`s and rebinds them in `freshRegistry()` (bootstrap required first, as in 66-04), run from `beforeEach` before any mock configuration. `bootFresh` gained a backward-compatible `reuseRegistry` option so the boot does not reset a second time and discard that configuration. Non-booting module loaders in humbleFlows carry "no boot" comments.

## Converted once-guard / multi-boot cases

- gameDetailsFlows: "two startSidecar() calls do not double-register the 3 send channels" -> "one boot registers each of the 3 send channels exactly once"
- loggerFlows: "two startSidecar() calls do not double-register logError" -> "one boot registers logError exactly once"
- enrichmentFlows: the two-boot `hasApiKey` case became two cases (false / true)

## Behavioural differences a fresh boot exposed (test-side fixes only)

- loggerFlows: a fresh boot initialises the logger, which archives an existing `gamelib.log`; the log file is now seeded after the boot. The WR-02 "os mock is INERT" block asserts facts about the original registry and never boots, so `freshRegistry()` runs only in the two booting describes there.
- skeletonFlows: a fresh boot emits its own `storeChanged` frames (migrations, legacy-key cleanup); store-write cases use `bootQuiet()` which boots, settles, and drops boot-time frames before asserting.
- enrichmentFlows: `envMock.isMac = true` is set after the boot settles (a macOS boot starts the dxmt release check).

## jest.mock accounting

Net 0. `sidecar-tests-flows-2.json` unchanged (jestMock=69, 7 files). `node meta/backendDiCeilings.cjs --shard sidecar-tests-flows-2` and full `pnpm backend-di-ceilings` PASS.

## Deviations from Plan

**1. [Rule 3 - Blocking] harness `reuseRegistry` option**
- **Issue:** the suites configure mocks before booting, so the reset must precede configuration; `bootFresh` always reset again, wiping that configuration.
- **Fix:** optional `reuseRegistry` (default behaviour unchanged). File: helpers/sidecarHarness.ts. Commit 617fb079f.

**Acceptance-grep note:** `grep -cE "\binit\(|startSidecar\("` is not 0 for skeletonFlows (3), downloadQueueFlows (1), shellFilesFlows (2) and the humble/gameDetails/logger docstrings; every hit is prose in a comment, not a call. A few prose comments in humbleFlows mentioning `resetModules` lack a "no boot" label; all code sites have one.

## Deferred Issues

`testContainment.test.ts` T-34.2-83 (unclassified `outboundHttpRegistry.test.ts`) remains failing; pre-existing, in deferred-items.md.

## Known Stubs

None.

## Threat Flags

None. `jest.setupContainment.ts` untouched; all suites stay inside the tmp-root containment (tripwires pass).

## Self-Check: PASSED

Commits 617fb079f and 9b7ef71db exist; all seven suites pass; prettier clean; no production file changed.
