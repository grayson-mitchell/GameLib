---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 07
subsystem: ipc
tags: [ipc, zod, install, wineTools, fixtures]
requires: [67-05, 67-04]
provides: [installAsyncArgs, wineToolsAsyncArgs, wineToolsFrontendMessagesArgs, runnerArg, wineInstallationArg]
key-files:
  created:
    - src/backend/sidecar/__tests__/ipcSchemas/install.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/wineTools.test.ts
  modified:
    - src/common/types/ipc/install.ts
    - src/common/types/ipc/wineTools.ts
    - src/common/types/ipc/schemaTypes.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
    - src/backend/sidecar/__tests__/installFlows.test.ts
    - src/backend/sidecar/__tests__/downloadQueueFlows.test.ts
    - src/backend/wine/manager/ipc_handler.ts
decisions:
  - "GameInfo/GameSettings passthroughs are cast to z.ZodType<T, T> so the derived call-site type stays the real interface (zod's loose-object input carries an index signature an interface cannot satisfy)"
  - "moveInstall/importGame path is a bounded z.string(), not absolutePathArg(): a boundary reject would skip the handler's localisable dialog and terminal 'done' status"
  - "updateGame shares install's key set with path/platformToInstall optional, because a Retry re-sends the queue element params the backend already extended"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-C, V67-D]
---

# Phase 67 Plan 07: install and wineTools conversion Summary

9 install channels and 15 wineTools invoke channels plus 4 wineTools push messages now carry zod schemas; types are derived with `z.input`, GameInfo and GameSettings are explicit `phase70Passthrough` objects, and the ceilings dropped by the converted counts.

## Commits
- 06d028049: install domain (9 channels), `runnerArg()`; CEILING invoke 183->174
- 8ccfb29a0: wineTools domain (15 invoke, 4 push), `wineInstallationArg()`; CEILING invoke 174->159, push 42->38

Ceiling totals: invoke 183->159 (24), push 42->38 (4). Matches the plan's counts (9 + 15, 4); the 13-key WineToolsAsync estimate was 15 in the file, as the registration also shows.

## Verification
- Backend: install and wineTools fixture suites, installFlows, wineToolsFlows, downloadQueueFlows, ipcDomainCensus, ipcSchemaCoverage, flowRegistrationCensus all green; full `src/backend/sidecar`, `src/backend/wine`, `src/common` and `src/frontend/{state,helpers}` runs show only the known pre-existing failures. Meta rendererZodGuard green. `pnpm codecheck` green; prettier clean.
- No `*FlowRegistration.ts` file changed.

## Deviations from Plan
**1. [Rule 1 - Bug] moveInstall/importGame path not absolutePathArg().** installFlows tests (34.6-19) proved a boundary reject drops the user-facing dialog and the terminal `done` status. Path is `z.string().max(4096)`; `assertPlausibleAbsolutePath` stays authoritative (D-05).
**2. [Rule 1] installFlows malformed-appName tests.** Non-string appName (123, [570]) is now rejected by the schema before the handler; those rows moved to explicit "rejected at the IPC boundary" tests. String rows still exercise the handler's own guard.
**3. [Rule 1] downloadQueueFlows install fixture** lacked the required `gameInfo.install`; added `install: {}`.
**4. [Rule 3] Call-site fix** `wine/manager/ipc_handler.ts`: `fetch ?? undefined` (optionalArg is nullish).
**5.** `updateGame` envelope allows `path`/`platformToInstall`/`size` (retry re-sends queue params).
**6.** `runWineCommand` envelope omits backend-internal `options` and `onSpawn`; `wineVersion` objects are strict (all six keys).

## Known Stubs
None.

## Self-Check: PASSED
