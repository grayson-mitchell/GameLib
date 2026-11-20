---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 10
subsystem: infra
tags: [e2e-surface, gogdl, ipc-contract, census, dead-code, sidecar]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-02 assertAtOrAboveFloor census floors; 82-05 regenerated ipc_contract.rs; 82-06 census pins (295 total, 67 owner-less); 82-13 knip baseline"
provides:
  - "The gogdl e2e stub is gone end to end: gog/e2eMock.ts, gogRuntime's stubs slot, gog/library.ts's CI=e2e early return in runRunnerCommand, bootstrap's gogdl listener import and registration"
  - "setGogdlCommandStub/resetGogdlCommandStub removed from testStubs.ts and from the regenerated src-tauri/src/ipc_contract.rs"
  - "Census pins moved with the code: total 295 -> 293, owner-less allowlist 67 -> 65, 66.4 owned-list floor 80 -> 79"
affects: [82-15, 82-16]

actuals:
  tokens: 3000
  tasks: 1
  commits: 1
plan_head_before: fac000aca1664d997a94ac6bd54644190dd7ef69
plan_head_after: 4e9de4f12b44179ead67b30c5c5669fd61ffa19d

tech-stack:
  added: []
  patterns:
    - "A deliberate deletion moves its census pin and any floor that sat exactly at the list length in the same commit, with a history comment line"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/gog/gogRuntime.ts
    - src/backend/storeManagers/gog/library.ts
    - src/backend/sidecar/bootstrap.ts
    - src/common/types/ipc/testStubs.ts
    - src-tauri/src/ipc_contract.rs
    - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/mainWindowTestStubs.test.ts
    - src/backend/storeManagers/__tests__/e2eStubListeners.test.ts
    - src/backend/storeManagers/gog/__tests__/gogRuntime.test.ts
    - src/backend/__tests__/diPhaseGates.test.ts
  deleted:
    - src/backend/storeManagers/gog/e2eMock.ts

key-decisions:
  - "Lowered the diPhaseGates 66.4 owned-list floor from 80 to 79 (with a comment) because the list shrank by the deleted e2eMock.ts entry and the floor sat exactly at the list length; the floor still equals the length, so a parse miss still turns it red"
  - "Left ipcDomainCensus DECLARATIONS_FLOOR at 284: the total of 293 still clears it with margin, and the comment says never lower"

patterns-established:
  - "Stub-removal commit shape for 82-15 (legendary, nile): mock file, runtime slot, library early return, bootstrap listener, two TestSync channels, regenerated contract, census pins, mainWindowTestStubs fixtures, diPhaseGates ledger line and its floor, all in one commit"

requirements-completed: [FND-01]

duration: 12min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 10: Remove the gogdl e2e stub Summary

**The gogdl e2e stub is deleted end to end (mock file, runtime slot, library early return, listener registration, two TestSync channels, regenerated Rust contract) with the census pins and ledger floor lowered in the same commit.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-20T09:57:19Z
- **Tasks:** 1
- **Files modified:** 10 modified, 1 deleted

## Accomplishments

- `GogLibraryManager.runRunnerCommand` no longer branches on `process.env.CI === 'e2e'`; the real gogdl runner is the only path.
- `GogRuntime` lost its `stubs` field, so the `gog-runtime` boot step builds only maps, presence, baselines and the credential cache.
- bootstrap no longer imports or registers the gogdl listeners; the legendary and nile ones are untouched for 82-15, and every other `CI === 'e2e'` branch for 82-16.
- `setGogdlCommandStub` and `resetGogdlCommandStub` are gone from `testStubs.ts` and from `ipc_contract.rs` (regenerated with `pnpm gen:ipc-contract`; `pnpm check:ipc-contract` passes).
- ipcDomainCensus: total 295 -> 293 (history comment line added), `NO_REGISTRATION_OWNER` length 67 -> 65.

## Task Commits

1. **Task 1: Tracer, remove the GOG (gogdl) e2e stub end to end** - `4e9de4f12` (feat)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Files Created/Modified

- `src/backend/storeManagers/gog/e2eMock.ts` - deleted
- `src/backend/storeManagers/gog/gogRuntime.ts` - stubs slot and its import removed, header comment updated
- `src/backend/storeManagers/gog/library.ts` - CI=e2e early return in runRunnerCommand removed
- `src/backend/sidecar/bootstrap.ts` - gogdl listener import, registration and the stale comment mention removed
- `src/common/types/ipc/testStubs.ts` - the two gogdl TestSync channels removed
- `src-tauri/src/ipc_contract.rs` - regenerated, minus the two channels
- `src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` - two TestSync rows dropped, total and allowlist length lowered by two
- `src/backend/sidecar/__tests__/ipcSchemas/mainWindowTestStubs.test.ts` - gogdl fixtures dropped
- `src/backend/storeManagers/__tests__/e2eStubListeners.test.ts` - gogdl case dropped (legendary and nile remain)
- `src/backend/storeManagers/gog/__tests__/gogRuntime.test.ts` - stub assertions and the stub-slot describe removed
- `src/backend/__tests__/diPhaseGates.test.ts` - e2eMock ledger line removed, owned-list floor 80 -> 79

## Decisions Made

See key-decisions above. `meta/backendDiCeilings/sidecar.json`, `meta/knip-baseline.txt`, `channelSchemas.ts`, `index.ts`, `ipcDomainParse.ts` and `ipcSchemaCoverage.test.ts` needed no change: the ceilings and the knip baseline still pass exactly (no jest.mock count dropped, no baselined finding vanished), and the channel enumerations derive from `testStubs.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 66.4 owned-list floor sat exactly at the list length**
- **Found during:** Task 1 (running diPhaseGates after removing the e2eMock ledger line)
- **Issue:** `assertAtOrAboveFloor('66.4 owned list', OWNED_66_4.length, 80)` failed with "scanned 79" once the deleted file's entry left the list.
- **Fix:** Floor 80 -> 79 with a comment; the floor still equals the list length.
- **Files modified:** src/backend/__tests__/diPhaseGates.test.ts
- **Verification:** diPhaseGates run; only the pre-existing shimCoverage.ts case is red
- **Committed in:** 4e9de4f12

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** None beyond the plan's own intent; the floor tracks a deliberate deletion.

## Issues Encountered

`diPhaseGates.test.ts` "shimCoverage.ts has no module state" stays red. It is the known pre-existing failure from another session's `a94108e3e` (X86_NULL_OBJECT_VERSION_SET), left untouched and not sanctioned.

## Verification

- Jest: gogRuntime, e2eStubListeners, ipcDomainCensus, mainWindowTestStubs, ipcSchemaCoverage all pass; diPhaseGates 161/162 (the known red above).
- `pnpm check:ipc-contract` up to date; `pnpm codecheck` clean; `pnpm backend-di-ceilings` PASS; `pnpm find-deadcode` PASS (312 baselined).
- `npx prettier --check` over the nine edited TS files passes (all confirmed not ignored via `--file-info`); eslint 0 errors.
- Acceptance: `gog/e2eMock.ts` absent; `GogdlCommandStub` count 0 in `testStubs.ts` and `ipc_contract.rs`; census total exactly two lower with a history line.

## Threat Surface

T-82-31 mitigated: no code path in the shipped sidecar swaps the real gogdl backend for a stub. T-82-32 mitigated: census, schema coverage and contract checks moved in the same commit. No new surface.

## Known Stubs

None.

## Next Phase Readiness

Ready for 82-15 (legendary and nile stubs) using the same commit shape, then 82-16 (remaining `CI === 'e2e'` branches and the e2eSurfaceGone gate).

---
*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Completed: 2026-11-20*

## Self-Check: PASSED

- `src/backend/storeManagers/gog/e2eMock.ts` confirmed absent; commit `4e9de4f12` is an ancestor of HEAD.
