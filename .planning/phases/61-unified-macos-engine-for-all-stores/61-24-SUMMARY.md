---
phase: 61-unified-macos-engine-for-all-stores
plan: 24
subsystem: engine / wine tools / sideload install
tags: [gap-closure, CR-04, sideload, per-game-bottle]
requires: [61-23]
provides:
  - resolveToolSettingsForId (Game-free resolver)
  - runWineCommandForPendingInstall
  - runWineCommandForGame optional wait / pendingInstall args
affects: [SideloadDialog Run installer]
key-files:
  modified:
    - src/backend/engine/toolSettings.ts
    - src/backend/engine/__tests__/toolSettings.test.ts
    - src/backend/tools/index.ts
    - src/common/types.ts
    - src/backend/sidecar/wineToolsFlowRegistration.ts
    - src/backend/sidecar/__tests__/wineToolsFlows.test.ts
    - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx
    - src/frontend/screens/Library/components/InstallModal/__tests__/engineInstallDialogs.test.tsx
  created:
    - src/backend/tools/__tests__/runWineCommandForPendingInstall.test.ts
decisions:
  - "Reach the pending-install runner through the existing runWineCommandForGame channel with optional wait/pendingInstall args; no new IPC channel, so no census change."
  - "runWineCommandForPendingInstall is sideload-only and computes the bottle server-side."
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 24: Sideload Run installer in the game's own bottle (CR-04) Summary

Sideload "Run installer" with an Engine choice now runs in the game's per-game bottle on its resolved engine (creating the bottle first) through a Game-free resolver and a sideload-only pending-install runner, instead of the renderer sending stored global Wine settings.

## Trace result

`runWineCommandOnGame` cannot serve the normal case: Run installer is clicked before the sideload game is added, so `libraryManagerMap.sideload.getGame(appName).getGameInfo()` returns `{}` and `SideloadGame.isNative()` throws destructuring `install.platform`. It also hard-codes `wait: false`. So `resolveToolSettings` was split: the native check stays with the `Game`, the rest moved into `resolveToolSettingsForId`.

## Commits

- ec591f4ad: Game-free resolver and `runWineCommandForPendingInstall` (Task 1)
- 9a2426368: sidecar handler routing, `RunWineCommandArgs` fields, SideloadDialog fix (Task 2)

## RED evidence

- Task 1: before implementation, `resolveToolSettingsForId` and `runWineCommandForPendingInstall` were undefined: 5 new tests failed ("is not a function"), 20 existing passed.
- Task 2: before the fix, exactly 2 new tests failed: the sidecar `pendingInstall: true` routing test and the SideloadDialog source gate. The remaining new tests (no pendingInstall keeps old path with wait false, non-boolean coercion, malformed commandParts) passed pre-fix by design as regression guards.

## Verification

- Jest: engine, tools, sidecar, InstallModal suites 2889 passed; `flowRegistrationCensus` unchanged.
- `pnpm codecheck`, `pnpm boundaries`, prettier on all touched files: clean. `pnpm lint`: 0 errors (1115 pre-existing warnings, cap issue is not from this plan).
- `pnpm smoke:sidecar`: PASS (no timers or watchers added; exit contract untouched).

## Deviations from Plan

**1. [Rule 3 - Lint] ** `pnpm lint` flagged two errors in my new code: an unnecessary `runner as Runner` cast in toolSettings.ts and a `!== 'sideload'` literal compare in tools/index.ts. Fixed by dropping the cast and using `isStore(args.runner, 'sideload')`. Included in 9a2426368.

Otherwise the plan executed as written. `launcherOverlayCensus` needed no change.

## Known Stubs

None.

## Threat Flags

None. T-61-24-01..04 mitigated: sideload-only runner, server-side bottle name, `=== true` coercion after `assertCommandParts`, logs carry appName and reason only.

## Self-Check: PASSED
