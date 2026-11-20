---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 15
subsystem: ipc
tags: [ipc, zod, logger, humble]
requires: [67-05, 67-14]
provides: [loggerSyncArgs, loggerAsyncArgs, loggerFrontendMessagesArgs, humbleSyncArgs, humbleAsyncArgs, humbleFrontendMessagesArgs]
key-files:
  created:
    - src/backend/sidecar/__tests__/ipcSchemas/logger.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/humble.test.ts
  modified:
    - src/common/types/ipc/logger.ts
    - src/common/types/ipc/humble.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
    - src/frontend/index.tsx
decisions:
  - "logError/logInfo accept string (max 64 KiB), string array (max 256), or a strict Error-like object (name/message/stack, all optional); never z.any/z.unknown"
  - "deleteUploadedLogFile uses httpUrlArg (the only value is the paste URL returned by uploadLogFile; host allow-list stays Phase 72)"
  - "Humble channels take ids only: machineName or strict {gamekey, machineName}; no key value in any argument"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-C, V67-D]
---

# Phase 67 Plan 15: logger and humble Summary

All 8 logger channels (3 send, 3 invoke, 2 push) and all 21 humble channels (1 send, 15 invoke, 5 push) now carry zod schemas registered in channelSchemas; argument types are derived with `z.input`.

## Commits
- a6c40f818 logger (8 channels, plus frontend/index.tsx call-site fix)
- 14978e70c humble (21 channels)

## Ceiling (ipcSchemaCoverage CEILING, equality)
| Bucket | Before | After Task 1 (logger) | After Task 2 (humble) |
|--------|--------|-----------------------|-----------------------|
| invoke | 52 | 49 (-3) | 34 (-15) |
| send | 28 | 25 (-3) | 24 (-1) |
| push | 37 | 35 (-2) | 30 (-5) |
| testOnly / local | 6 / 14 | unchanged | unchanged |

## Verification
Fixture suites (every key valid + invalid), loggerFlows, humbleFlows, ipcDomainCensus, flowRegistrationCensus, ipcSchemaCoverage, rendererZodGuard green; `pnpm codecheck`, prettier --check, `pnpm check:ipc-contract` (pre-commit) green. Full Backend/Common jest: only the known failures (games.test.ts, bottle.test.ts, macArchKnownFixRouting, tauriShellSource).

## Deviations from Plan

**1. [Rule 1 - Bug] Global error handler sent an Error object.** `window.api.logError(ev.error)` in `src/frontend/index.tsx` passed an `Error`, which JSON-serialises to `{}` across IPC (message/stack are non-enumerable), so the log line was useless. The call site now sends `error.stack ?? error.message` (or `String(error ?? ev.message)`), which also lets the schema stay a bounded union. The Error-like object arm is kept tolerant for `{}`.

**2.** `GetLogFileArgs` schema's Heroic-log arm is `{appName?: undefined, runner?: undefined}` (strict) rather than `{}` so it stays assignable from the existing `GetLogFileArgs` type at frontend call sites.

**3.** The rejected-logError fixture calls `validateInbound`/`logRejection` directly (exactly one value-free stderr line, one sink line); a sidecar-side drop never recurses through logError.

## Known Stubs
None.

## Self-Check: PASSED
