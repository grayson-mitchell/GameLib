---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 12
subsystem: ipc
tags: [ipc, zod, steamAuth, credentials]
requires: [67-05, 67-09]
provides: [steamAuthAsyncArgs, steamAuthSyncArgs]
key-files:
  created:
    - src/backend/sidecar/__tests__/ipcSchemas/steamAuth.test.ts
  modified:
    - src/common/types/ipc/steamAuth.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
    - src/backend/sidecar/__tests__/steamAuthFlows.test.ts
decisions:
  - "steamAuth credentials use the real key `username` (not the plan's `accountName`); bounded strings only (username 64, password 1024, guard code 16, product key 64), no charset regex"
  - "appId args are digit-only strings (1-10 digits) matching the callers and the handler seams; appName args for isSteamBottleEligible/steamRemoveAllCopies/steamClientSetupRecheck are bounded non-empty strings"
  - "Route reasons are a z.enum with a both-ways drift guard against SteamBridgeRouteReason"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-C, V67-D]
---

# Phase 67 Plan 12: steamAuth domain Summary

All 25 steamAuth channels (1 send, 24 invoke) now carry strict zod schemas with `z.input`-derived types; credential rejections are proven value-free by sentinel cases.

## Commits
- one conversion commit covering both plan tasks (see below)

Ceiling: invoke 136->112 (24), send 34->33 (1); push, testOnly, local unchanged.

## Verification
- steamAuth fixture suite (every key has valid + invalid fixtures; sentinel-absence for steamStartCredentials, steamSubmitGuard, redeemSteamKey), steamAuthFlows, ipcSchemaCoverage green.
- `src/backend/sidecar`, `src/backend/storeManagers/steam`, `src/common`: only the known failures remain (games.test.ts channel constants, bottle.test.ts DRM_LAUNCH_FORM, macArchKnownFixRouting Intel, tauriShellSource `.title(`).
- `pnpm codecheck`, `pnpm check:ipc-contract`, prettier green.

## Deviations from Plan
**1. Tasks 1 and 2 merged into one commit.** The whole steamAuth.ts is written in one pass (as Task 1 permits), so the ceiling drop is taken once for all 25 channels (24 invoke, 1 send) rather than split 11/14.
**2. [Rule 1] steamAuthFlows.test.ts re-pinned.** Four redeemSteamKey malformed-payload cases (wrong store, numeric key, empty key, null) and the persistBottleWineVersion `{}` case now assert the boundary's value-free `IPC_INVALID_ARGS` rejection (ok:false) instead of the handler's typed `invalid-request` result; redeemKey is still asserted never called. Handler-side guards left in place as redundancy.
**3.** Plan said `accountName`; the real caller sends `username`.

## Known Stubs
None.

## Self-Check: PASSED
