---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 14
subsystem: ipc
tags: [ipc, zod, eosOverlay, shortcuts, runnerMisc, engine]
requires: [67-05, 67-13]
provides: [eosOverlayAsyncArgs, shortcutsSyncArgs, shortcutsAsyncArgs, runnerMiscAsyncArgs, engineAsyncArgs, engineFrontendMessagesArgs]
key-files:
  created:
    - src/backend/sidecar/__tests__/ipcSchemas/eosOverlayShortcuts.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/runnerMiscEngine.test.ts
  modified:
    - src/common/types/ipc/eosOverlay.ts
    - src/common/types/ipc/shortcuts.ts
    - src/common/types/ipc/runnerMisc.ts
    - src/common/types/ipc/engine.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts
    - src/backend/sidecar/eosOverlayFlowRegistration.ts
    - src/backend/sidecar/shortcutsFlowRegistration.ts
    - src/backend/shortcuts/ipc_handler.ts
    - src/backend/storeManagers/legendary/eos_overlay/ipc_handler.ts
decisions:
  - "callTool tool is z.enum(['winecfg','runExe']) from the handler switch; save paths are NUL-free bounded strings (not absolutePathArg: a save path may legitimately be empty or relative to a GOG variable)"
  - "Engine runner stays a bounded string (module guards own identity); engineStateChanged push uses z.custom<EngineState> (typing only)"
  - "downloadRuntime/isRuntimeInstalled use a z.enum with a two-way drift guard against RuntimeName"
metrics:
  completed: 2026-11-08
requirements: [V67-B, V67-C, V67-D]
---

# Phase 67 Plan 14: eosOverlay, shortcuts, runnerMisc, engine Summary

All 35 channels (eosOverlay 8 invoke; shortcuts 1 send + 6 invoke; runnerMisc 14 invoke; engine 5 invoke + engineStateChanged push) now carry zod schemas registered in channelSchemas; hand-written argument types are derived with `z.input`.

## Commits
- 64cb08eb4 eosOverlay and shortcuts (15 channels)
- 0dc290876 runnerMisc and engine (20 channels)

## Ceiling (ipcSchemaCoverage CEILING, equality)
| Bucket | Before | After Task 1 | After Task 2 |
|--------|--------|--------------|--------------|
| invoke | 85 | 71 (-14) | 52 (-19) |
| send | 29 | 28 (-1) | 28 |
| push | 38 | 38 | 37 (-1) |
| testOnly / local | 6 / 14 | unchanged | unchanged |

## Verification
- Fixture suites (every key valid + invalid), eosOverlayFlows, shortcutsFlows, runnerMiscFlows, engineFlows, ipcDomainCensus, flowRegistrationCensus, ipcSchemaCoverage, rendererZodGuard green; `pnpm codecheck`, prettier --check, `pnpm check:ipc-contract` green.
- Full Backend/Common jest: only known failures (games.test.ts, bottle.test.ts, macArchKnownFixRouting, tauriShellSource). Meta: only known failures seen (genI18nGateScope, logSecretGate).

## Deviations from Plan
**1. [Rule 3] null-tolerant optional positionals.** `optionalArg` makes `addShortcut.fromMenu` and `isEosOverlayEnabled.appName` `T | null | undefined`; Electron `ipc_handler.ts` call sites and both sidecar registrations now coalesce `?? undefined` (type errors otherwise, and null would leak into handlers).
**2.** `syncGOGSaves`/`getDefaultSavePath` save-location arrays are strict `{name, location}` objects (backend-produced, round-tripped by the renderer); no persisted-config-derived object is made strict.

## Known Stubs
None.

## Self-Check: PASSED
