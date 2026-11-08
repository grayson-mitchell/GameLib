---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 09
subsystem: sidecar
tags: [trust-boundary, ipc, removeFolder, exit-contract]
requires: [72-05, 72-06]
provides:
  - async timer-free removeFolder helper in src/backend/utils.ts
key-files:
  modified:
    - src/backend/sidecar/shellFilesFlowRegistration.ts
    - src/preload/api/library.ts
    - src/common/types/ipc/shellFiles.ts
    - src-tauri/src/ipc_contract.rs
    - meta/knip-baseline.txt
    - src/backend/utils.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/sidecar/rendererPathGuard.ts
    - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/shellFiles.test.ts
    - src/backend/sidecar/__tests__/rendererPathGuard.test.ts
    - src/backend/__tests__/utils.test.ts
    - src/backend/downloadmanager/__tests__/downloadqueue.test.ts
requirements-completed: [D-09]
completed: 2026-11-08
---

# Phase 72 Plan 09: removeFolder channel removal Summary

The renderer `removeFolder` channel is deleted end to end, and the internal helper is now an async `fs/promises` `rm` with `maxRetries: 5, retryDelay: 200` and no timers.

## Commits
- Task 1 `feat(72-09): remove the renderer removeFolder channel end to end` (de5c77958)
- Task 2 `feat(72-09): async timer-free retrying removeFolder helper` (04a5cd761)

## What changed
- Removed preload export, `shellFilesSyncArgs.removeFolder`, the `ipcMain.on('removeFolder')` registration, the knip baseline line; regenerated `ipc_contract.rs` via `pnpm gen:ipc-contract`.
- shellFilesFlows test: channel count 20 to 19, asserts no listener/handler, and that a stray `removeFolder` send deletes nothing.
- Helper: `assertPlausibleAbsolutePath` on a non-default parent path, existing name containment kept, `rm` with retries. Caller: `void removeFolder(...).catch(logError)`.
- Helper behavior tests added to `src/backend/__tests__/utils.test.ts` (mocked `fs/promises.rm`; asserts args, no setTimeout, relative path rejects, `../escape` refused).

## Deviations
- The `DownloadManagerItem` comment mention was left as is (it does not claim the channel exists).
- rendererPathGuard.ts/test comments reworded to name the internal helper.
- Pre-existing `existsSync` guard dropped: `force: true` makes it redundant.

## Verification
check:ipc-contract, codecheck, find-deadcode, cargo test, jest suites, scoped prettier all green.

## Self-Check: PASSED
