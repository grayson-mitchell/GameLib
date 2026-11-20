---
phase: 61-unified-macos-engine-for-all-stores
plan: 09
subsystem: engine
tags: [types, refactor, engine-state]
requires: [61-08]
provides:
  - "common/types/engine.ts: EngineState, EngineOption (with legacy kind), EngineKind, EngineNoticeDismissal, OverlayNoticeStep"
affects: [61-10, 61-17]
key-files:
  created: [src/common/types/engine.ts]
  modified:
    - src/common/types/steam.ts
    - src/common/types/ipc/steam.ts
    - src/common/types/ipc/steamAuth.ts
    - src/backend/engine/engineState.ts
    - src/backend/engine/engineDecision.ts
    - src/frontend/state/SteamEngineState.ts
key-decisions:
  - "Steam engine types deleted with no aliases; backend sets runner 'steam' literal in engineState.ts (moves to Steam adapter in 61-10)"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 09: Shared engine types Summary

One store-agnostic `EngineState` (identity `runner` + `appName`) and `EngineOption` (adds `legacy` kind) now replace the Steam-only engine types across backend, IPC types and frontend, with no behaviour change.

## Commits
- 0540deda2: create engine.ts, repoint backend and IPC types
- b961fd2c5: repoint frontend, delete SteamEngineState/Option/Kind from steam.ts

## Deviations from Plan
None. The ESLint runner-literal ban did not flag `runner: 'steam'` in engineState.ts. The `EngineNoticeDismissal` type is exported but not yet used by importers (61-10 consumes it).

## Verification
`pnpm codecheck` clean; jest over engine, sidecar and frontend dirs: 167 suites, 2689 tests pass; prettier clean. ESLint on touched files: 0 errors, 18 warnings, all in lines I did not author (jest.mock any-typed returns, duplicate imports in existing tests).

## Self-Check: PASSED
