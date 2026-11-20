---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 13
subsystem: ipc
tags: [ipc, zod, settings, gameDetails]
requires: [67-05, 67-12]
provides: [settingsSyncArgs, settingsAsyncArgs, gameDetailsSyncArgs, gameDetailsAsyncArgs]
key-files:
  created:
    - src/backend/sidecar/__tests__/ipcSchemas/settings.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/gameDetails.test.ts
  modified:
    - src/common/types/ipc/settings.ts
    - src/common/types/ipc/gameDetails.ts
    - src/common/types/ipc/install.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/utils/ipc_handler.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
    - src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
decisions:
  - "settings: setSetting key is a bounded non-empty string (not keyof AppSettings) and value stays z.unknown(); writeConfig config is phase70Passthrough({}) cast to Partial<AppSettings>"
  - "gameDetails: addNewApp GameInfo is phase70Passthrough declaring only app_name + runner; changeInstallPath uses absolutePathArg (callers pass a dialog result)"
  - "wineVersion strictness (67-07): no change needed, see disposition below"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-C, V67-D]
---

# Phase 67 Plan 13: settings and gameDetails Summary

All 12 settings channels (1 send, 11 invoke) and all 19 gameDetails channels (3 send, 16 invoke) now carry zod schemas with `z.input`-derived types; hand-written argument interfaces are gone.

## Commits
- e99618185 settings domain (12 channels)
- 2082cffbe gameDetails domain (19 channels), install `installPlatform` export, flow-test re-pin

## Ceiling (ipcSchemaCoverage CEILING, equality)
| Bucket | Before | After settings | After gameDetails |
|--------|--------|----------------|-------------------|
| invoke | 112 | 101 (-11) | 85 (-16) |
| send | 33 | 32 (-1) | 29 (-3) |
| testOnly / push / local | 6 / 38 / 14 | unchanged | unchanged |

## wineVersion strictness disposition (orchestrator concern from 67-07)
Persisted config can carry `wineVersion` objects that `wineInstallationArg()` (strict) would reject: `config.json` and per-game JSON are read from disk without validation, `WineInstallation` is detected/serialised from several code paths and older Heroic-origin configs may hold extra or legacy keys. They reach the boundary only through round-tripping settings back to the sidecar. In this plan that path is already tolerant, so no schema was loosened: `writeConfig.config` is `phase70Passthrough({})` (loose, declares no keys, so a nested `wineVersion` with extra keys is accepted) and `setSetting.value` is `z.unknown()`. Fixtures pin both (writeConfig with `wineVersion: {..., legacy: 'x'}`, setSetting with `legacyExtra`). `requestGameSettings`/`getGameSettings` only return GameSettings, which is outbound and unvalidated. `wineInstallationArg()` stays strict for channels where the renderer sends a user-picked entry from the detected list (install, importGame, steamBottleProvision, persistBottleWineVersion); those objects originate from detection, not from persisted config. Phase 70 should keep this tolerance when it tightens `config`.

## Verification
- settings and gameDetails fixture suites (every key has valid + invalid fixtures), settingsFlows, gameDetailsFlows, ipcDomainCensus, flowRegistrationCensus, ipcSchemaCoverage, rendererZodGuard green; `pnpm codecheck` green.
- setPrivateBranchPassword sentinel-absence cases pass (rejection value and log line).
- Full Backend/Meta/Common jest and `check:ipc-contract`: only the known failures remain (games.test.ts channel constants, bottle DRM_LAUNCH_FORM, macArch Intel, tauriShellSource .title, logSecretGate x2, genI18nGateScope A-17).

## Deviations from Plan
**1. [Rule 1] gameDetailsFlows.test.ts re-pinned.** The REQ-34.5-13 case sending `getInstallInfo` an unknown runner string now asserts the boundary's `ok:false` rejection instead of a `null` result; the handler's own null fallback is left as redundancy.
**2. [Rule 3] `getSystemInfo` handler** now passes `cache ?? undefined` because the optional positional arrives as `null` on the wire (type `boolean | null | undefined`).
**3.** `installPlatform` enum exported from install.ts for reuse by `getInstallInfo`.
**4.** `getLogContent`'s three-arm union is one all-optional strict object cast back to `GetLogFileArgs`; `ipcSchemas/*.test.ts` files are not in STRUCTURALLY_CONTAINED_SUITES (same as the earlier domain suites; they spawn nothing).

## Known Stubs
None.

## Self-Check: PASSED
