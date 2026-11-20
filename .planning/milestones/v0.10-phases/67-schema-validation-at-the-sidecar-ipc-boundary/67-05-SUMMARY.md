---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 05
subsystem: ipc
tags: [ipc, zod, shellFiles, dialog, clipboard, fixtures]
requires: [67-02]
provides: [ipcSchemaFixtures, shellFilesSyncArgs, shellFilesAsyncArgs, dialogAsyncArgs, clipboardSyncArgs, clipboardAsyncArgs]
affects: [67-07, 67-09]
key-files:
  created:
    - src/backend/testUtils/ipcSchemaFixtures.ts
    - src/backend/sidecar/__tests__/ipcSchemas/shellFiles.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/dialogClipboard.test.ts
  modified:
    - src/common/types/ipc/shellFiles.ts
    - src/common/types/ipc/dialog.ts
    - src/common/types/ipc/clipboard.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
decisions:
  - "checkDiskSpace and pathExists accept '' (z.string().max(4096)) so the handler's Path.parse / existsSync keep deciding; every other path arg is nonEmptyString"
  - "removeFolder is z.tuple([z.tuple([absolutePathArg(), nonEmptyString(255)])]); it has no renderer caller, so the shape follows the handler's args[0] destructure"
  - "openExternalUrl uses urlArg (any scheme) since gamelib:// deep links are sent; allow-list is Phase 72"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-C, V67-D]
---

# Phase 67 Plan 05: shellFiles, dialog, clipboard conversion Summary

24 channels (shellFiles 3 invoke + 17 send, dialog 1 invoke, clipboard 1 invoke + 2 send) now carry zod tuple schemas, their TS types are derived with `z.input`, and the shared fixture helper plus recipe are proven.

## Commits
- 41783890d: fixture helper + shellFiles (20 channels), ceiling invoke 188->185, send 56->39
- 7452941fe: dialog + clipboard (4 channels), ceiling invoke 185->183, send 39->37

Ceiling totals: invoke 188->183 (5), send 56->37 (19). Matches the plan; no measured difference.

## Verification
- Backend: shellFiles and dialogClipboard fixture suites, shellFilesFlows, clipboardFlows, ipcDomainCensus, ipcSchemaCoverage, flowRegistrationCensus, ipcValidation all green (220 tests). Meta rendererZodGuard 8 green.
- `pnpm codecheck` green; prettier clean on all written paths.
- Mutation: removing `shellFilesAsyncArgs` from channelSchemas turned the invoke ceiling red (expected 183, received 186); restored.
- `pnpm build:sidecar-sea` exit 0; `pnpm smoke:sidecar` PASS (READY sentinel, exit 0 at stdin EOF).
- A1: `--disallow-code-generation-from-strings` is absent from `meta/buildSidecarSea.ts` and `src-tauri/src/sidecar.rs`, so zod 4 JIT needs no `jitless` config; none added.
- No `*FlowRegistration.ts` file touched; no preload/frontend call site needed edits.

## Deviations from Plan
None - plan executed as written. The `genIpcContract` step in the pre-commit hook reported `ipc_contract.rs` up to date.

## Known Stubs
None.

## Self-Check: PASSED
