---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 02
subsystem: backend
tags: [zod, ipc, validation, sidecar, ratchet]
requires: [zod-4-baseline]
provides: [validateInbound, channelSchemas, schemaTypes, ipcSchemaCoverage-ceiling]
affects: [67-03]
tech-stack:
  added: []
  patterns: [static channelSchemas map looked up in the dispatch funnel, marker-prefixed JSON-tail wire error, equality-ceiling ratchet]
key-files:
  created:
    - src/common/types/ipc/schemaTypes.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/ipcValidation.ts
    - src/backend/sidecar/__tests__/ipcValidation.test.ts
    - src/backend/testUtils/ipcDomainParse.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
decisions:
  - "Validation lives in sidecarRpc dispatchInvoke/dispatchSend via a static channelSchemas map, not inside ipcMain.handle"
  - "Wire error is '[GAMELIB_IPC_INVALID_ARGS] {json}' (string, because Rust reads error with as_str())"
  - "Rejection logs carry channel, sanitised paths and issue codes only"
metrics:
  completed: 2026-11-07
requirements: [V67-B, V67-D]
---

# Phase 67 Plan 02: Boundary validator and coverage ceiling Summary

One validator in the sidecar dispatch funnel (typed invoke rejection, logged send drop, value-free logs) plus a dual-form census parser and a shrink-only per-bucket equality ceiling, with no channel converted yet.

## Commits
- 810e3da00: contract helpers (wire marker + format/parse, schemaTypes.ts, empty channelSchemas.ts)
- 8f4a4b0da: ipcValidation.ts, dispatch wiring, bootstrap log sink, 8-case test
- 4ee26928e: ipcDomainParse.ts, census floor (>= 290) and const-args case, ipcSchemaCoverage.test.ts

## Measured ceilings (first run)
invoke 188, send 56, testOnly 6, push 42, local 14 (planning expectation was ~189/~56/6/42/~14).
Mutation proof (not committed): send 56 -> 55 turned the send-bucket test red; restored.

## Verification
- ipcValidation (8 cases), storeEmbedFlows, skeletonFlows, ipcDomainCensus, flowRegistrationCensus, ipcSchemaCoverage all green.
- `pnpm codecheck` green (tsc + meta) at the end; prettier clean on all touched files.
- `pnpm build:sidecar && pnpm smoke:sidecar`: PASS (READY sentinel, exit 0 at stdin EOF) with the validator and zod on the boot path.

## Deviations from Plan
- [Rule 3] The Jest config resets `jest.fn()` implementations per test, so the ipcValidation test records handler/listener calls with plain functions instead of jest.fn spies.
- Pre-existing failure, out of scope: `meta/__tests__/logSecretGate.test.ts` has 2 failures from `src/backend/utils/uninstaller.ts:131` (`result.stderr` logged); not touched by this plan. Mid-run, codecheck briefly failed on unrelated dirty WIP in steam `library.ts`/`library.test.ts`; it was green by the end.

## Known Stubs
None. Pass-through for channels without a schema is intentional ratchet-era behaviour (T-67-07), counted by the ceiling; plan 67-18 makes it fail closed.

## Self-Check: PASSED
