---
phase: 61-unified-macos-engine-for-all-stores
plan: 08
subsystem: engine
tags: [engine, engineDecision, engineSwitch, steamAdapter, bottle-busy]
requires: ["61-04", "61-05", "61-06"]
provides:
  - steam/engine/steamEngineDeps.ts (steamDecisionDeps, steamSwitchDeps, readSteamEngineOverride)
  - store-agnostic decideLaunchEngine / decideCreationEngine / preflightCrossover / prepareBottleForEngine keyed by EngineKey
  - 'bottle-busy' PrepareResult reason (D-16)
affects: [61-09, 61-12]
key-files:
  created:
    - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
    - src/backend/storeManagers/steam/__tests__/steamEngineDeps.test.ts
  modified:
    - src/backend/engine/engineDecision.ts
    - src/backend/engine/engineSwitch.ts
    - src/backend/engine/engineState.ts
    - src/backend/engine/gameKey.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/gameInstall.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
  deleted:
    - src/backend/engine/__tests__/readStoredEngineOverride.test.ts
decisions:
  - "bottle-busy check runs after the same-engine early return and before the shared-bottle check and any kill, so a second same-engine game in a shared bottle still launches (plan behavior case 3) while no engine change happens under a running game"
  - "ownBottleName is optional: only Steam supplies it, so non-Steam idle shared bottles switch (D-16, D-02)"
  - "engineState.ts (Steam display state) reaches the adapter through a lazy require, matching its existing lazy Steam imports"
  - "Steam getSettings merges the stored override as both engineOverride and steamEngineOverride"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 08: Store-agnostic engine decision and switch Summary

engineDecision and engineSwitch now take a game `key`, import nothing from `storeManagers/`, and a Steam adapter injects every Steam-only input; the switch refuses with `bottle-busy` when another game (any store) runs in the bottle.

## Tasks

Both tasks were committed together as `ad837d2c7`: they edit the same Steam call sites and tests (`gameLaunch.ts`, `gameInstall.ts`, `games.test.ts`), and the repo's per-commit typecheck would have failed on a split.

| Task | Notes |
| ---- | ----- |
| 1 decision layer plus adapter | `readStoredEngineOverride` removed; `bottleBusy` dep added and consulted with `monitorPhase` before any probe-timeout wineserver kill; `appNameOf` added to gameKey |
| 2 switch layer, D-16 | `crossoverSettings` required by type (`@ts-expect-error` test); `ownBottleName` optional; `bottle-busy` handled like `shared-bottle` in gameLaunch |

## Verification

- `grep storeManagers` on engineDecision.ts and engineSwitch.ts: no matches; `readStoredEngineOverride` no longer exists in `src`.
- jest over `src/backend/engine`, `storeManagers/steam`, `sidecar`: only the known pre-existing failures remain (56-01 channel constants, DRM_LAUNCH_FORM, macArch Intel).
- `pnpm codecheck` and `pnpm boundaries` clean. `pnpm lint` fails only on the known tests-scope ceiling; games.test.ts, engineSwitch.test.ts warning counts unchanged, new files clean.

## Deviations from Plan

**1. [Rule 1 - correctness] bottle-busy placement.** The plan text says "right after the game-running check", but its own behavior case 3 (marker already matches next -> `ok, changed:false`) and the intent "never block a same-engine launch" require the check after the marker-equal early return. Placed there; still precedes every `killWith`. The DXVK-failed retry path (no kill) also consults it.

**2. [Rule 3 - blocking] engineState.ts** imported `readStoredEngineOverride` and used the default resolver; repointed to the adapter via lazy require (not listed in the plan's files).

**3.** Test edits beyond the listed files: `sidecar/__tests__/steamEngineFlows.test.ts` (mock the adapter, expect its deps passed). `games.test.ts` getSettings expectations gained `engineOverride` alongside `steamEngineOverride`.

## Known Stubs

None.

## Self-Check: PASSED
