---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 17
subsystem: ipc
tags: [ipc, zod, appShell]
requires: [67-05, 67-16]
provides: [appShellSyncArgs, appShellAsyncArgs, appShellFrontendMessagesArgs]
key-files:
  modified:
    - src/common/types/ipc/appShell.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/__tests__/ipcSchemas/appShell.test.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
decisions:
  - "setTitleBarOverlay is a strict object with optional string color/symbolColor and number-or-string height: the renderer builds it from computed CSS, so every value is a string (handler is a logged no-op)"
  - "changeLanguage is nonEmptyString(35), not an enum: the renderer passes locale tags the handler maps onto a shipped language"
  - "push 'message' is z.tuple([]).rest(z.unknown()); it accepts any argument list so it has no invalid fixture and is tested separately"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-C, V67-D]
---

# Phase 67 Plan 17: appShell Summary

All 14 appShell send, 6 invoke and 16 push channels now carry zod schemas registered in channelSchemas; argument types are derived with `z.input` and the hand-written interfaces are gone. notify is a strict bounded `{title, body}`, openWebviewPage uses `urlArg()` (scheme allow-list stays Phase 72, T-67-53), abort and dialogDisplayed take bounded ids. Push schemas are typing-only (`z.custom`), per D-12.

## Commits
- 4ad125457 send and invoke (appShell.ts also carries the push schemas)
- 350a86057 push registration and ceiling drop

## Ceiling (ipcSchemaCoverage CEILING, equality)
| Bucket | Before | After Task 1 | After Task 2 |
|--------|--------|--------------|--------------|
| invoke | 14 | 8 (-6) | 8 |
| send | 20 | 6 (-14) | 6 |
| push | 17 | 17 | 1 (-16) |
| testOnly / local | 6 / 14 | unchanged | unchanged |

Push remainder: 1, legendary's `refreshLibrary` (name collision with steam's invoke, see 67-16).

## Deviations from Plan
**1. [Rule 1 - Bug] setTitleBarOverlay height/colour are strings.** `TitleBarOverlay.height` is typed number, but the renderer passes CSS strings; schema accepts number or string so the live call is not rejected.

**2. `message` push has no invalid fixture.** It is a variadic rest tuple; covered by an explicit accepts-anything case instead.

## Verification
Fixture suite (104 tests), appShellFlows, ipcDomainCensus, flowRegistrationCensus, ipcSchemaCoverage, rendererZodGuard, `pnpm codecheck`, prettier and check:ipc-contract (pre-commit) green. Full Backend: only the known failures (games, bottle, macArchKnownFixRouting, tauriShellSource). Full Meta minus Wine harness: only genI18nGateScope A-17 and logSecretGate (known).

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
