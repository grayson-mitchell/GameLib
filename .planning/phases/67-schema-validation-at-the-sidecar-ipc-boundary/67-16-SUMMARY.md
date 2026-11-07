---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 16
subsystem: ipc
tags: [ipc, zod, enrichment, downloadQueue, steam, legendary, gog]
requires: [67-05, 67-15]
provides: [enrichmentAsyncArgs, downloadQueueSyncArgs, downloadQueueAsyncArgs, downloadQueueFrontendMessagesArgs, steamAsyncArgs, steamFrontendMessagesArgs, gogFrontendMessagesArgs, legendaryFrontendMessagesArgs]
key-files:
  created:
    - src/backend/sidecar/__tests__/ipcSchemas/enrichment.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/queueStorePush.test.ts
  modified:
    - src/common/types/ipc/enrichment.ts
    - src/common/types/ipc/downloadQueue.ts
    - src/common/types/ipc/steam.ts
    - src/common/types/ipc/legendary.ts
    - src/common/types/ipc/gog.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
    - src/backend/sidecar/__tests__/steamFlows.test.ts
    - src/backend/sidecar/__tests__/skeletonFlows.test.ts
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/discounts/index.ts
    - src/backend/wiki_game_info/ipc_handler.ts
decisions:
  - "steamgriddb.setApiKey accepts any string up to 256 chars including empty: an empty value is the documented clear-the-key gesture (the plan's nonEmptyString would have broken it)"
  - "legendary refreshLibrary push is typing-only and NOT registered in channelSchemas: the map is keyed by name and it collides with steam's refreshLibrary invoke"
  - "steam launch is a loose envelope (appName, runner, skipVersionCheck, args checked; launchArguments passes through as persisted-config-derived) cast to LaunchParams"
  - "Steam push payloads are z.custom type carriers (backend-originated, D-12)"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-C, V67-D]
---

# Phase 67 Plan 16: enrichment, downloadQueue, steam, legendary, gog Summary

All 17 enrichment invokes (including the four dotted `steamgriddb.*` names), downloadQueue (4 send, 1 invoke, 1 push), steam (2 invoke, 11 push) and gog (1 push) now carry zod schemas registered in channelSchemas; argument types are derived with `z.input` and the hand-written interfaces are gone. `SteamSyncStatus` is still exported from steam.ts.

## Commits
- 611bda524 enrichment (17 invoke)
- 11a33b75a downloadQueue, steam, gog (plus legendary typing-only)
- af1087de5 skeletonFlows test updated for value-free rejection

## Ceiling (ipcSchemaCoverage CEILING, equality)
| Bucket | Before | After Task 1 (enrichment) | After Task 2 |
|--------|--------|---------------------------|--------------|
| invoke | 34 | 17 (-17) | 14 (-3) |
| send | 24 | 24 | 20 (-4) |
| push | 30 | 30 | 17 (-13) |
| testOnly / local | 6 / 14 | unchanged | unchanged |

## Deviations from Plan

**1. [Rule 1 - Bug] setApiKey must allow the empty string.** The plan specified `nonEmptyString(256)`, but the existing flow test and UI treat an empty submit as the clear-the-key gesture. Schema is `z.string().max(256)`. The sentinel-absence rejection test (T-67-50) still passes for non-string and over-long input.

**2. [Rule 3 - Blocking] refreshLibrary name collision.** legendary's `refreshLibrary` push and steam's `refreshLibrary` invoke share a name; `mergeChannelEntries` throws on duplicates. The legendary schema is exported for typing only (derives `LegendaryFrontendMessages`) and is not registered; the push ceiling therefore keeps that one name .

**3. [Rule 1 - Bug] Null optional positionals.** `getGogDiscounts` and `getWikiGameInfo` handlers (Electron-side `backend/discounts/index.ts`, `backend/wiki_game_info/ipc_handler.ts`, and the sidecar registration) now coerce null with `?? undefined`/`?? false`.

**4. Flow tests updated for boundary rejection.** `enrichmentFlows` (WR-01 non-string key), `steamFlows` (Test B bad runner) and `skeletonFlows` (unknown refresh runner) previously asserted handler-level no-op/`status: error`/runner-naming errors. They now assert `ok: false` at the schema boundary, store/manager untouched, and the rejection message value-free.

## Verification
Fixture suites, enrichmentFlows, steamFlows, skeletonFlows, downloadQueueFlows, ipcDomainCensus, flowRegistrationCensus, ipcSchemaCoverage, rendererZodGuard green; `pnpm codecheck`, prettier --check and `check:ipc-contract` (pre-commit) green. Full Backend jest: only the known failures (games.test.ts, bottle.test.ts, macArchKnownFixRouting, tauriShellSource).

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
