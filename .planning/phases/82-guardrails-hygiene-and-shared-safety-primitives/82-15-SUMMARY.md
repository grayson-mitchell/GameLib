---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 15
subsystem: infra
tags: [e2e-surface, legendary, nile, ipc-contract, census, dead-code, sidecar]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-10 gogdl stub removal (the commit shape repeated here); census pins 293 total / 65 owner-less"
provides:
  - "The legendary and nile e2e stubs are gone end to end: both e2eMock.ts files, both runtimes' stubs slots, both library CI=e2e early returns, both bootstrap listener registrations"
  - "The last four TestSync channels (set/reset Legendary/Nile CommandStub) removed from testStubs.ts and the regenerated src-tauri/src/ipc_contract.rs (zero CommandStub left)"
  - "The TestSync kind retired: KINDS/UMBRELLA, TestSyncIPCFunctions, TestStubsTestSync, testStubsTestSyncArgs, onTestOnly and RunnerCommandStub deleted"
  - "Census pins moved with the code: total 293 -> 289, owner-less allowlist 65 -> 61, 66.4 owned-list floor 79 -> 77"
affects: [82-16]

actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: 990952cc2d115745cd3f2587f3bafd1fe2e1c4b3
plan_head_after: 424d790c4a98a5e94e05ce9e631bfe52a08c025f

tech-stack:
  added: []
  patterns:
    - "A deliberate deletion moves its census pin and any floor that sat exactly at the list length in the same commit, with a history comment line"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/legendary/legendaryRuntime.ts
    - src/backend/storeManagers/legendary/library.ts
    - src/backend/storeManagers/nile/nileRuntime.ts
    - src/backend/storeManagers/nile/library.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/ipcRegistry.ts
    - src/backend/testUtils/ipcDomainParse.ts
    - src/common/types.ts
    - src/common/types/ipc/testStubs.ts
    - src/common/types/ipc/index.ts
    - src/common/types/ipc/channelSchemas.ts
    - src-tauri/src/ipc_contract.rs
    - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/mainWindowTestStubs.test.ts
    - src/backend/sidecar/__tests__/ipcRegistry.test.ts
    - src/backend/storeManagers/legendary/__tests__/legendaryRuntime.test.ts
    - src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts
    - src/backend/storeManagers/nile/__tests__/nileRuntime.test.ts
    - src/backend/__tests__/diPhaseGates.test.ts
  deleted:
    - src/backend/storeManagers/legendary/e2eMock.ts
    - src/backend/storeManagers/nile/e2eMock.ts
    - src/backend/storeManagers/__tests__/e2eStubListeners.test.ts

key-decisions:
  - "e2eStubListeners.test.ts deleted outright once its last case went: subject deletion, not a D-03 retirement of a red suite"
  - "Left ipcDomainCensus DECLARATIONS_FLOOR at 284: the new total 289 still clears it with margin 5, and the comment says never lower"
  - "Lowered the diPhaseGates 66.4 owned-list floor 79 -> 78 (legendary) -> 77 (nile) with comments; the floor stays equal to the list length"
  - "Deleted onTestOnly from ipcRegistry.ts rather than leave an uncallable helper typed over an empty keyof; 82-16's remaining ipcRegistry work (the e2e gate) is therefore already done"

patterns-established:
  - "Retiring a channel kind: parser KINDS, census UMBRELLA, umbrella type export, schema wiring, registry helper and coverage-test bucket all leave in the commit that removes the last channel"

requirements-completed: [FND-01]

duration: 25min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 15: Remove the legendary and nile e2e stubs Summary

**The legendary and nile e2e stubs are deleted end to end (mock files, runtime slots, library early returns, listener registrations, the last four TestSync channels, regenerated Rust contract), and the then-empty TestSync kind is retired, with every census pin and ledger floor lowered in the same commits.**

## Performance

- **Duration:** 25 min
- **Tasks:** 2
- **Files modified:** 20 modified, 3 deleted

## Accomplishments

- `LegendaryLibraryManager.runRunnerCommand` and `NileLibraryManager.runRunnerCommand` no longer branch on `process.env.CI === 'e2e'`; the real runner is the only path.
- `LegendaryRuntime` and `NileRuntime` lost their `stubs` fields; bootstrap imports and registers no stub listeners any more.
- `setLegendaryCommandStub`, `resetLegendaryCommandStub`, `setNileCommandStub` and `resetNileCommandStub` are gone from `testStubs.ts` and from `ipc_contract.rs` (`grep -c CommandStub` is 0; `pnpm check:ipc-contract` passes).
- With no TestSync channel left, the TestSync kind left `KINDS`/`DETECT_ORDER` (ipcDomainParse), the census `UMBRELLA`, `TestSyncIPCFunctions`, `TestStubsTestSync` and the schema wiring.
- ipcDomainCensus: total 293 -> 291 (Task 1) -> 289 (Task 2); `NO_REGISTRATION_OWNER` 65 -> 63 -> 61.

## Task Commits

1. **Task 1: Tracer, remove the legendary e2e stub end to end** - `215a64c62` (feat)
2. **Task 2: Remove the nile e2e stub and retire the TestSync kind** - `424d790c4` (feat)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Decisions Made

See key-decisions above. `meta/backendDiCeilings/sidecar.json` and `meta/knip-baseline.txt` needed no change: `pnpm backend-di-ceilings` (jestMock=1865) and `pnpm find-deadcode` (312 baselined) pass exactly after both commits, since no jest.mock count dropped and no baselined finding vanished.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 66.4 owned-list floor sat exactly at the list length**
- **Found during:** Task 1 and Task 2 (removing the two e2eMock ledger lines)
- **Issue:** `assertAtOrAboveFloor('66.4 owned list', OWNED_66_4.length, ...)` would fail once the deleted files' entries left the list.
- **Fix:** Floor 79 -> 78 in Task 1, 78 -> 77 in Task 2, with comments; the floor still equals the list length.
- **Files modified:** src/backend/__tests__/diPhaseGates.test.ts
- **Committed in:** 215a64c62, 424d790c4

**2. [Rule 3 - Blocking] Removing the last TestSync channel orphaned code outside the plan's file list**
- **Found during:** Task 2
- **Issue:** `onTestOnly` in `ipcRegistry.ts` is typed `keyof TestSyncIPCFunctions`, which is `never` once the kind is empty; `RunnerCommandStub` in `common/types.ts` had no user left; `ipcSchemaCoverage.test.ts` had a `testOnly` bucket whose non-vacuity assertion (`size > 0`) could no longer hold; `ipcRegistry.test.ts` exercised `onTestOnly`.
- **Fix:** Deleted `onTestOnly` (and its test), `RunnerCommandStub`, and the `testOnly` bucket / `onTestOnly` scan in `ipcSchemaCoverage.test.ts` (replaced by an assertion that no channel entry is tagged `testOnly`). The `testOnly` flag in `schemaTypes.ts` and the unrelated fixtures that set `testOnly: false` are left for a follow-up.
- **Files modified:** src/backend/sidecar/ipcRegistry.ts, src/backend/sidecar/__tests__/ipcRegistry.test.ts, src/common/types.ts, src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
- **Committed in:** 424d790c4

**Handoff to 82-16:** the `ipcRegistry.ts` e2e gate it was to remove is already gone (it was `onTestOnly`'s `env.CI === 'e2e'` check), and the one `RunnerCommandStub` mention in `src/common/types.ts` is gone too. 82-16 should expect nothing to remove in those two spots.

---

**Total deviations:** 2 auto-fixed (both blocking)
**Impact on plan:** Both follow directly from deleting the last TestSync channel; no new behaviour.

## Issues Encountered

`diPhaseGates.test.ts` "shimCoverage.ts has no module state" stays red. It is the known pre-existing failure from another session's `a94108e3e` (X86_NULL_OBJECT_VERSION_SET), left untouched and not sanctioned.

## Verification

- Jest after Task 2: nileRuntime, ipcDomainCensus, mainWindowTestStubs, ipcSchemaCoverage, ipcRegistry pass; diPhaseGates fails only the known shimCoverage case. After Task 1 the legendary, staleness, e2eStubListeners suites also passed.
- `pnpm check:ipc-contract` up to date; `pnpm codecheck` clean; `pnpm backend-di-ceilings` PASS; `pnpm find-deadcode` PASS (312 baselined).
- `npx prettier --check` over every edited TS file passes (all confirmed not ignored via `--file-info`); eslint 0 errors.
- Acceptance: no `src/backend/storeManagers/*/e2eMock.ts` remains; `CommandStub` count 0 in `testStubs.ts` and `ipc_contract.rs`; `TestSync` in the census test only in history comment lines.

## Threat Surface

T-82-41 mitigated: no code path in the shipped sidecar swaps the real legendary or nile backend for a stub. T-82-42 mitigated: census, schema coverage and contract checks moved in the same commit as each runner's channels; DECLARATIONS_FLOOR (284) still clears the new total (289). No new surface.

## Known Stubs

None.

## Next Phase Readiness

Ready for 82-16 (remaining `CI === 'e2e'` branches and the e2eSurfaceGone gate); see the handoff note above.

---
*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Completed: 2026-11-20*

## Self-Check: PASSED

- Both `e2eMock.ts` files and `e2eStubListeners.test.ts` confirmed absent; commits `215a64c62` and `424d790c4` are ancestors of HEAD.
