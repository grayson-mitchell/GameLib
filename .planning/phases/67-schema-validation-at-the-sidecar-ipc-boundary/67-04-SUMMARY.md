---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 04
subsystem: renderer
tags: [ipc, preload, zod, boot-error, guard]
requires: [67-02]
provides: [IpcValidationError, classifyBootError, rendererZodGuard]
affects: [67-05]
key-files:
  created:
    - src/preload/ipcValidationError.ts
    - src/preload/__tests__/ipcValidationError.test.ts
    - src/frontend/__tests__/bootErrorSurface.test.ts
    - meta/__tests__/rendererZodGuard.test.ts
  modified:
    - src/preload/ipc.ts
    - src/frontend/bootErrorSurface.ts
    - src/frontend/state/GlobalState.tsx
decisions:
  - "IpcValidationError.message leads with the wire marker so bootErrorSurface (zero-import, message-text only) can classify it after the preload conversion"
  - "bootErrorSurface test runs under the node environment with a stub window, testing classifyBootError only"
  - "rendererZodGuard rule (d) takes an injectable reader so the two-hop mutation case runs in memory"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-C]
---

# Phase 67 Plan 04: Renderer typed error, boot-error classification, zod guard Summary

Sidecar schema rejections now reach renderer code as `IpcValidationError` (code, channel, paths, codes), the boot-error page warns and continues on them, and a source-scan gate keeps zod and `common/types/ipc` values out of the renderer.

## Commits
- 58eb60cd6: IpcValidationError + `makeHandlerInvoker` `.catch` conversion
- fabdd481b: `classifyBootError`, rendererZodGuard, GlobalState `import type`

## Verification
- Preload (ipcValidationError, tauriTransport, storeApi) green; Frontend bootErrorSurface 3 green; Meta rendererZodGuard 8 green (rules a-d, in-memory mutation cases, non-vacuity). `pnpm codecheck` green; prettier clean on all touched files; bootErrorSurface.ts still has 0 imports.
- Repo scan finds no direct or transitive zod / `common/types/ipc` value path from src/frontend or src/preload.

## Deviations from Plan

**1. [Rule 1 - Bug] Marker lost after preload conversion**
- **Found during:** Task 2
- **Issue:** The preload converts the wire string into IpcValidationError, whose message did not contain the marker, so `classifyBootError` would have returned 'fatal' for the very rejection it targets.
- **Fix:** Message now starts with `[GAMELIB_IPC_INVALID_ARGS]`; test added.
- **Files:** src/preload/ipcValidationError.ts, its test
- **Commit:** fabdd481b

## Known Stubs
None.

## Self-Check: PASSED
