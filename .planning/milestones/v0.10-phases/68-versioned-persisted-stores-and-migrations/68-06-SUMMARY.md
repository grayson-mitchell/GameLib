---
phase: 68-versioned-persisted-stores-and-migrations
plan: 06
subsystem: backend-ipc
tags: [store-versioning, read-only, ipc-push, frontendReady]
requires: [68-02]
provides:
  - READ_ONLY_AREAS / READ_ONLY_REASONS closed sets (src/common/types/readOnlyStores.ts)
  - areaForStoreKey, flushReadOnlyStores with injected send/log sinks
  - readOnlyStoresNotice push (appShell domain) and handleReadOnlyStoresNotice preload slot
affects: [68-07, 68-09]
key-files:
  created:
    - src/common/types/readOnlyStores.ts
    - src/backend/storeVersioning/__tests__/readOnlyStores.test.ts
  modified:
    - src/backend/storeVersioning/readOnlyStores.ts
    - src/common/types/ipc/appShell.ts
    - src/preload/api/settings.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/appShell.test.ts
key-decisions:
  - "Payload is deduped by area+reason and carries ids only; detail/file/storeKey go to the app log only"
  - "Flush sits in the once-per-process frontendReady block; late recordReadOnly after the flush re-publishes the full list"
requirements-completed: [D-03, D-05, D-07]
completed: 2026-11-08
---

# Phase 68 Plan 06: Read-only stores notice delivery Summary

Read-only stores detected at module scope are now held in the sidecar and delivered as one ids-only `readOnlyStoresNotice` push from the `frontendReady` one-shot boot block, with one app-log line per affected store.

## Tasks

1. Closed sets, area mapping, flush/publish logic, 5 tests - `05e1e8618`
2. Push schema, preload slot, frontendReady emit, IPC gates, appShellFlows test - `ed9ef43f8`

## Placement

In `appShellFlowRegistration.ts`, `if (!frontendReadyBootWorkDone)` is at line 541 and `flushReadOnlyStores(` at line 592, inside that block after the `detectVCRedist` try/catch, in its own try/catch. No timers or handles added (`readOnlyStores.ts` has no setTimeout/setInterval and no logger import).

## Deviations from Plan

**1. [Gate ratchets] ipcDomainCensus counts** - the new owner-less push channel raised the census total 295 -> 296 and the owner-less allowlist 65 -> 66; both equality ratchets updated to the measured values. `ipcSchemaCoverage.test.ts` needed no change (the channel is schema'd). `pnpm check:ipc-contract` reports the Rust contract already up to date (no regeneration needed).

## Verification

Task suites, `pnpm check:ipc-contract`, `pnpm codecheck`, scoped prettier pass. `logSecretGate` still fails only on the 2 pre-existing `uninstaller.ts:131,142` violations (deferred-items.md); no new violations. A "Cannot log after tests are done" notice appears in the appShellFlows run (existing isolated-module pattern; all tests pass). smoke:sidecar and tauri:dev not run.

## Known Stubs

None. Renderer display is plan 07.

## Self-Check: PASSED
