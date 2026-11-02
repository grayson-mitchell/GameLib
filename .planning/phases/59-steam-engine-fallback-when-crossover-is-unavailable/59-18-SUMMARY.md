---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 18
subsystem: frontend
tags: [steam, engine-override, gap-closure, zustand]
requires: [59-15, 59-17]
provides:
  - Eligibility-gated engine override select with stored-value fidelity
  - useSteamEngineState.remove(appId)
key-files:
  modified:
    - src/frontend/screens/Settings/components/SteamEngineOverride.tsx
    - src/frontend/screens/Settings/components/__tests__/SteamEngineOverride.test.tsx
    - src/frontend/state/SteamEngineState.ts
    - src/frontend/state/__tests__/SteamEngineState.test.ts
    - src/frontend/screens/Game/GamePage/index.tsx
decisions:
  - "CrossOver is never flagged unsupported; only pinned: and wine-manager: choices are (G9)"
  - "Stored ids not offered by options render as a disabled '(not installed)' entry (WR-05)"
metrics:
  completed: 2026-11-02
  tasks: 2
---

# Phase 59 Plan 18: Engine override frontend gap closure Summary

The engine override now always shows what is stored, treats CrossOver as supported, loads options on mount, and renders only when the backend reports `overrideEligible`.

## Tasks

1. Stored-value fidelity and CrossOver as supported (G9, WR-05, G12b): commit 03793f969. `effectiveValue` replaced by `selectValue`/`storedExtraOption`; select disabled until options load; warning only for `pinned:`/`wine-manager:`.
2. Eligibility gate and stale-state removal (WR-04): commit eb9cc9bfe. Store `remove`, game page calls `remove(appName)` on a null result, the component fetches state when absent and returns null unless eligible.

## Deviations from Plan

- The project has no DOM test environment (no jsdom, no react-test-renderer), so the default component's mount behaviour is tested by calling the component function with React hooks stubbed. The game page's `remove` call has no harness; it is covered by the store `remove` unit test plus the grep acceptance check.

## Deferred Issues

`pnpm lint` exits 1 on two pre-existing errors in files this plan did not touch: `meta/gen_vtables.ts:7472` (unused `manifest`) and `src/backend/storeManagers/steam/engine/engineState.ts:111` (`require()` import). `pnpm codecheck` passes.

## Self-Check: PASSED
