---
phase: 61-unified-macos-engine-for-all-stores
plan: 13
subsystem: ipc
tags: [ipc, engine, sidecar, preload, census]
requires: [61-11]
provides:
  - "common/types/ipc/engine.ts: EngineAsync, EngineFrontendMessages"
  - "sidecar/engineFlowRegistration.ts: registerEngineFlows"
  - "preload/api/engine.ts: getEngineState, listEngineOptions, getDefaultEngine, getPerGameBottleName, dismissEngineNotice, handleEngineStateChanged"
affects: [61-14, 61-15, 61-17]
key-files:
  created:
    - src/common/types/ipc/engine.ts
    - src/backend/sidecar/engineFlowRegistration.ts
    - src/preload/api/engine.ts
    - src/backend/sidecar/__tests__/engineFlows.test.ts
  modified:
    - src/common/types/ipc/index.ts
    - src/common/types/ipc/steamAuth.ts
    - src/common/types/ipc/steam.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/preload/api/index.ts
    - src/preload/api/steam.ts
    - src/frontend/state/GlobalState.tsx
    - src/frontend/state/SteamEngineState.ts
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/SteamEngineNotices.tsx
    - src/frontend/screens/Settings/components/SteamEngineOverride.tsx
    - src/frontend/screens/Settings/components/SteamOverlayOverride.tsx
    - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
key-decisions:
  - "Steam is dispatched by hasCapability(runner, 'usesBottleRuntime'); no runner literals in the sidecar registration"
  - "Native / Browser / non-macOS / failing getGame all resolve null in the IPC layer, before getGameEngineState"
  - "Steam-named settings components fall back to runner 'steam' when the global SettingsContext carries no runner"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 13: Engine IPC domain Summary

One store-agnostic `engine` IPC domain (five invoke channels plus the `engineStateChanged` push) replaces the three Steam-named engine channels and their push, and every renderer call site now uses it.

## Commits
- c84e0a57c: engine domain types, sidecar registration, preload, censuses, test rename
- b9f98699b: renderer call sites and tests repointed
- f7a534ded: stale header comment in steamAuthFlowRegistration

## Behaviour
- `getEngineState({runner, appName})`: invalid identity -> null with no lookup; bottle-runtime store -> Steam adapter; otherwise macOS + Windows (not Browser) + not native, then `getGameEngineState`.
- `listEngineOptions`, `getDefaultEngine` (D-09), `getPerGameBottleName` (D-17), `dismissEngineNotice` delegate with args[0] uncast.
- Publisher installed as a closure at register time (no I/O).

## Deviations from Plan

**1. [Rule 3 - blocking] testContainment.test.ts updated.** Renaming `steamEngineFlows.test.ts` tripped the T-34.2-83 directory tripwire; reclassified as `engineFlows.test.ts`.

**2. [Rule 3 - blocking] Renderer local helper renamed** `handleSteamEngineStateChangedSignal` -> `handleEngineStateChangedSignal` (the plan's grep acceptance would otherwise match it); `ipcDomainCensus` file count 21 -> 22 and part total 294 -> 296.

**3. Runner fallback.** `SettingsContextType.runner` is optional, so the two Steam settings components use `runner ?? 'steam'`.

**4. Lint.** Handlers returning sync values wrapped in `Promise.resolve` to avoid two new `require-await` warnings. Totals unchanged: tests 664, src 1117.

## Verification
- jest `src/backend/sidecar` 1632 passed; frontend state/GamePage/Settings suites pass; `pnpm codecheck`, `pnpm boundaries`, prettier clean.
- Acceptance greps: removed channel names absent outside tests; `ipcMain.handle(` count in engineFlowRegistration.ts is 5; no old names in `src/frontend`.

## Known Stubs
None. The store is still keyed by appId (re-keyed in 61-17).

## Self-Check: PASSED
