---
phase: 87-engine-wine-and-tools
plan: 53
subsystem: engine
tags: [rust, rustinvoke, dialogs, shims, registration-census, d-02, d-06, d-14]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the engine_dialog_displayed op and engine:<n> ack ids (87-50), the empty engineFlowRegistration.ts (87-52)
provides:
  - src/backend/enginewine/launch.ts shim engineDialogDisplayed (schedule row, deletedBy 98)
  - rustInvoke channel engine_dialog_displayed (RUST_ENGINE_DIALOG_DISPLAYED), shell arm rpc_dialog_displayed
  - the renderer's dialogDisplayed send forwards engine: ack ids to Rust
  - engineFlowRegistration.ts and engineFlows.test.ts deleted
affects: [87-54, 87-55, 87-56, 88, 98]

actuals:
  tokens: 14000
  tasks: 2
  commits: 2

plan_head_before: b3e29660edb0755577c63f3a7fe9f32ab37c5b80
plan_head_after: 81249b84b0ff8ac8a832d13aa6daab55977c6b57

tech-stack:
  added: []
  patterns:
    - "a renderer send that two owners share is split by an id prefix at the one handler that still owns the channel: the prefix the owner issued is forwarded, everything else stays in the old table"

key-files:
  created: []
  modified:
    - src/backend/enginewine/launch.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
  deleted:
    - src/backend/sidecar/engineFlowRegistration.ts
    - src/backend/sidecar/__tests__/engineFlows.test.ts

key-decisions:
  - "An engine: ack id is forwarded to Rust and NOT also acknowledged in the TS table: the table never issued it, and acknowledge() on an unknown id is a no-op, so skipping it keeps the two owners disjoint (T-87-54)."
  - "The forward is `engineDialogDisplayed(...).catch(logSendFailure)` rather than a bare `void`: a rejected call (a malformed id Rust refuses, the shutdown) must not become an unhandled rejection in a send handler."
  - "engineFlows.test.ts's single assertion (the file registers no channel) has no successor of its own: with the file gone, one owner per engine channel is held by registrationOncePerBoot, nativeChannelOwnership and the getEngineState cases already in engineWineResolvers.test.ts, so nothing was moved."
  - "engine.ts needed no zod entry dropped: getEngineState is the only entry left and it is a scheduled resolver channel (D-23)."

patterns-established:
  - "a deleted registration file lowers three census floors by one each (ipcDomainCensus FILES_FLOOR, bootSourceShape, diPhaseGates), each with a dated note, as 87-36 did"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "D-02: the renderer's dialogDisplayed send forwards an ack id that starts with engine: to Rust through the engineDialogDisplayed shim (one returned typed call, schedule row deletedBy 98), and keeps acknowledging every other id in the TS table; a rejected forward is logged and the next ack is still served"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/appShellFlows.test.ts#87-53 dialogDisplayed (3 cases: forward, TS ack never forwarded, rejected forward survives)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "engine_dialog_displayed is in the IPC contract: strict one-object decode, shell arm, bounded in the sidecar, generated contract current, channel counts 172 -> 173"
    requirement: SVC-02
    verification:
      - kind: other
        ref: "pnpm check:ipc-contract; cargo test --bin gamelib-shell engine_dispatch (30, the new arm in the bad-args and not-ready loops); rustInvokeSchemas.test.ts; tauriShellSource.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-06 and D-14: engineFlowRegistration.ts, its registerEngineFlows call and engineFlows.test.ts are deleted; every engine renderer channel is native or a scheduled resolver"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "registrationOncePerBoot, flowRegistrationCensus, ipcDomainCensus (19 files), nativeChannelOwnership, engineWineResolvers, testContainment, bootSourceShape, diPhaseGates"
        status: pass
      - kind: other
        ref: "test ! -e src/backend/sidecar/engineFlowRegistration.ts; pnpm exec jest --selectProjects Backend (14247 passed, 13 skipped); pnpm backend-di-ceilings"
        status: pass
    human_judgment: false
  - id: D4
    description: "A live engine dialog (a Wine-engine download or refusal notice) shows, the renderer acks it and gamelib.log records display=shown"
    verification: []
    human_judgment: true
    rationale: "The wire from a real renderer to a real Rust dialog is not asserted by any test here; the sidecar side is unit-tested with a fake transport and the Rust side by gamelib-engine's own tests. Needs one live macOS run."

duration: 30min
completed: 2026-11-24
---

# Phase 87 Plan 53: Engine dialog acks to Rust, engine registration file deleted Summary

**The renderer's `dialogDisplayed` send now forwards `engine:<n>` ack ids to Rust's `engine_dialog_displayed` op through one `engineDialogDisplayed` shim while still acknowledging the TS table's own ids, and the empty `engineFlowRegistration.ts` is gone with its call and test.**

## Performance

- **Duration:** about 30 min
- **Started:** 2026-11-23T16:55Z
- **Completed:** 2026-11-23T17:24Z
- **Tasks:** 2
- **Files modified:** 20 (2 deleted)

## Accomplishments
- `engine_dialog_displayed` is a rustInvoke channel with a strict `{ackId}` object, a shell arm (`rpc_dialog_displayed`, which 87-52 had not added) and a bounded sidecar call.
- `appShellFlowRegistration.ts` forwards only ids that start with `engine:`; every other id still goes to `displayAcks.acknowledge`. A rejected forward is logged and does not stop the next ack.
- `engineFlowRegistration.ts`, its `handlers.ts` call and `engineFlows.test.ts` are deleted; the `REGISTERS_NOTHING` and `NO_COUNT_CLAIM` entries are removed and the census counts follow (ipcDomainCensus 20 -> 19, bootSourceShape 24 -> 23, diPhaseGates 23 -> 22).

## Task Commits

1. **Task 1: Tracer, an engine dialog ack reaches Rust through one shim** - `208883b94` (feat)
2. **Task 2: Delete engineFlowRegistration.ts** - `81249b84b` (refactor)

**Plan metadata:** the docs commit that follows this file.

## Files Created/Modified
- `src/backend/enginewine/launch.ts` - `engineDialogDisplayed(deps, ackId)`, one returned typed call
- `src/backend/sidecar/appShellFlowRegistration.ts` - the `engine:` split in the `dialogDisplayed` handler
- `src/common/types/sidecarTransport.ts`, `src/common/types/ipc/rustInvoke.ts`, `src-tauri/src/ipc_contract.rs` (generated) - the channel
- `src-tauri/src/engine_dispatch.rs`, `src-tauri/src/rust_dispatch.rs` - the shell arm
- `src/backend/__tests__/engineWineShimSchedule.test.ts` - row `engineDialogDisplayed` (shim, deletedBy 98); the importer list gains `appShellFlowRegistration.ts`
- `src/backend/sidecar/__tests__/appShellFlows.test.ts` - three `dialogDisplayed` cases
- Census and containment tests adjusted for the deleted files

## Decisions Made
See key-decisions above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two census floors not named in the plan**
- **Found during:** Task 2 (full Backend run)
- **Issue:** `bootSourceShape.test.ts` (registration file count floor 24) and `diPhaseGates.test.ts` (floor 23) both count `*Registration.ts` files and went red when the file was deleted; `testContainment.test.ts` listed `engineFlows.test.ts`.
- **Fix:** Lowered each floor by one with a dated note (the same deliberate-deletion case as 87-36); removed the contained-test entry and its docstring paragraph.
- **Files modified:** src/backend/sidecar/__tests__/bootSourceShape.test.ts, src/backend/__tests__/diPhaseGates.test.ts, src/backend/sidecar/__tests__/testContainment.test.ts
- **Committed in:** 81249b84b

**2. [Rule 3 - Blocking] The shell arm lives in engine_dispatch.rs**
- **Found during:** Task 1
- **Issue:** The plan lists `rust_dispatch.rs` only, but a rustInvoke arm is a macro entry in `engine_dispatch.rs` plus the match in `rust_dispatch.rs`.
- **Fix:** Added `rpc_dialog_displayed` in both and in the arm test loop.
- **Committed in:** 208883b94

---

**Total deviations:** 2 auto-fixed (both Rule 3)
**Impact on plan:** Both were mechanical consequences of the planned change. No scope creep.

## Issues Encountered
- `engineFlows.test.ts` had no assertion worth moving (see key-decisions); the plan's "move remaining assertions" step was therefore a no-op.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 87-54. The carry-forward from 87-52 stands: `engine/toolSettings.ts` still reads the TS registry/overlay (unowned), so a live non-Steam fallback-engine launch's Winetricks/Run EXE target uses the stored override; this plan did not touch it.
- The `engine:` ack path is unit-tested only; a live engine dialog is the one thing worth a look at the phase's UAT.

## Self-Check: PASSED

- `src/backend/sidecar/engineFlowRegistration.ts` and `engineFlows.test.ts`: absent (intended).
- Commits `208883b94` and `81249b84b` are on HEAD.

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
