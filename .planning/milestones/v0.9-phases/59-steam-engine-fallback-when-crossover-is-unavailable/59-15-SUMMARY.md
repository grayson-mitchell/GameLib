---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 15
subsystem: steam-engine-state
tags: [engine-state, gap-closure, preflight]
requires: []
provides:
  - "SteamEngineState.overrideEligible and launchNotice"
  - "writeBridgeModeVerdict / readBridgeModeVerdict and SteamBridgeVerdict.mode"
  - "preflightCrossover(bottle, deps, { killOnTimeout, appId }) and broken.inconclusive"
  - "resolveCrossoverBinDirForEngine()"
affects: [59-18, 59-19, 59-20, 59-21]
key-files:
  modified:
    - src/backend/storeManagers/steam/engine/engineDecision.ts
    - src/backend/storeManagers/steam/engine/engineState.ts
    - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/common/types/steam.ts
requirements-completed: [D-04, D-06, D-09, D-13, D-14]
completed: 2026-11-02
---

# Phase 59 Plan 15: Eligibility-gated engine state Summary

Engine state now answers only for titles with a bridge install, a CrossOver override counts as supported, and a display read can no longer stop a wineserver.

## Commits
- 2721f1680: passive page preflight and creation decision without a foreign probe (WR-03, WR-07, IN-02, IN-06)
- 8ee7e6a9b: eligibility-gated, override-aware state with launch notice (WR-04, G9, G12a, G6, IN-03, IN-04)

## What changed
- `decideCreationEngine` decides from CrossOver presence and an executable `bin/wine` only (`probed:false`). `listReadyBridgeBottleNames` was removed from the decision deps (no other caller there); a `monitorPhase` dep replaced it.
- `preflightCrossover` skips the wineserver kill and the retry on timeout when `killOnTimeout:false` or a process monitor is active for the title, returning `broken` with `inconclusive:true`. `decideLaunchEngine` passes its appId.
- `getSteamEngineState` returns null without a bridge install (`findBridgeInstallBottle`), sets `overrideEligible` (own bottle and not DRM-mode), shows `crossover/override` for a CrossOver override, and skips the preflight for pinned and wine-manager overrides.
- Page preflight uses `killOnTimeout:false`; inconclusive results are not cached; non-healthy cache entries expire after 60 s (`ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS`).
- `recordLaunchDecision` publishes `launchNotice {reason, seq}` for automatic fallback launches and carries the last `crossoverInstalled` forward when there is no preflight.
- `bridgeVerdict.mode` added with `writeBridgeModeVerdict` / `readBridgeModeVerdict`.

## Note for 59-20 / 59-21
Until the launch path (59-20) and install prefetch (59-21) call `writeBridgeModeVerdict`, `mode` reads undefined and a title counts as not DRM-mode. This is harmless: DRM-mode launches never read the override.

## Deviations from Plan
**[Rule 3 - Blocking] `SteamBridgeVerdict.mode` declared in `electronStores.ts`** (the interface lives there, not in bridgeVerdict.ts); the file was not in the plan's list. Without it `codecheck` fails.

## Verification
- jest: engineState, engineDecision, bridgeVerdict, steamEngineFlows and games suites pass.
- `pnpm codecheck` exits 0; prettier clean on all touched files.

## Known Stubs
None.

## Self-Check: PASSED
Commits 2721f1680 and 8ee7e6a9b exist; all modified files exist.
