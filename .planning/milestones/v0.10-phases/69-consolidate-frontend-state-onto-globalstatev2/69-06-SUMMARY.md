---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 06
subsystem: frontend-state
tags: [zustand, uiState, bridge, boot-module]
requires: [69-05]
provides: [uiState UI/dialog slice, bridgeContextValue (D-09), R10 componentDidMount convention]
affects: [69-07, 69-24]
key-files:
  created: [src/frontend/state/bridgeContextValue.ts, src/frontend/state/__tests__/bridgeContextValue.test.ts, .planning/todos/pending/2026-11-10-install-game-push-stale-status-and-unread-modal-state.md]
  modified: [src/frontend/state/uiState.ts, src/frontend/state/GlobalState.tsx, src/frontend/state/initStateSubscriptions.ts, src/frontend/state/__tests__/uiState.test.ts, src/frontend/state/__tests__/initStateSubscriptions.test.ts, src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts]
decisions:
  - "bridgedContextSlice returns Pick<ContextType, BridgedKeys> rather than Partial so the Provider value still satisfies ContextType"
  - "handleInstallGame closes over module constant LIBRARY_STATUS_AT_REGISTRATION = [] (identical to the class's mount-time capture)"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 06: UI/dialog slice behind the bridge Summary

The 12 UI fields and 4 dialog actions moved from GlobalState into uiState; unconverted consumers still get them through `bridgedContextSlice()` spread into the Provider value, with GlobalState re-rendering on any uiState change via `subscribeBridge`.

## Commits
- 26edebfe8: Task 1, uiState fields/actions/`readInitialUi`, bridgeContextValue.ts, tests.
- 45ede9c16: Task 2, GlobalState shrink, boot-module listeners, FramelessRefresh gate rewrite, todo.

## What changed
- GlobalState: StateProps, state literal and four methods removed; `subscribeBridge(() => this.forceUpdate())` plus one `forceUpdate()` at the top of componentDidMount; render spreads `bridgedContextSlice()`; remaining dialog callers use `useUiState.getState().showDialogModal`.
- initStateSubscriptions: section (1) `useUiState.setState(readInitialUi())`; section (2) handleInstallGame and the nine D-04 signal listeners; exported `seedAndFollowWindowChrome` (awaited seed, then both listeners), `registerControllerListener`, `followConnectivity`, called from componentDidMount at their original positions.
- FramelessRefresh test part A is now behavioural (real `seedAndFollowWindowChrome`, fake window.api, real store) with near-miss convictions (never subscribes, subscribe-before-seed, constant handler, never seeds); part B and S5-S7 unchanged.
- Acceptance greps: moved-field lines in GlobalState = 0; old method names = 0; `bridgedContextSlice()` = 1; `subscribeBridge(` = 1; moved window.api registrations in GlobalState = 0.

## Deviations
- [Rule 1] Removed now-unused imports in GlobalState.tsx (eslint errors; tsc does not flag them).
- knip baseline needed no change. Todo file filed per R1 (three preserved defects).

## Gates
Frontend jest, codecheck, lint (0 errors), find-deadcode, frontend-context-ceiling, backend-di-ceilings, planning-gates all exit 0. `pnpm perf:rerender` passes (its baseline.json rewrite was reverted, not committed). No new jest.mock.

## Self-Check: PASSED
