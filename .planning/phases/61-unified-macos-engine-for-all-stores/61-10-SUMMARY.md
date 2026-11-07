---
phase: 61-unified-macos-engine-for-all-stores
plan: 10
subsystem: engine
tags: [engine-state, dependency-cruiser, refactor]
requires: [61-09]
provides:
  - "backend/engine/engineState.ts: getEngineState(identity, deps), recordLaunchDecision(identity, ...), publishOverlayNotice, publishOverlayExitNotice, dismissEngineNotice, setEngineStatePublisher"
  - "backend/engine/engineNoticeStore.ts (CacheStore 'steam_engine_notices', name unchanged)"
  - "Steam adapter: getSteamEngineState, steamEngineStateDeps, STEAM_ENGINE_RUNNER, isDrmModeFromVerdict in steamEngineDeps.ts"
  - "dependency-cruiser rule engine-is-store-agnostic (zero violations)"
affects: [61-11, 61-13]
key-files:
  created: [src/backend/engine/engineNoticeStore.ts]
  modified:
    - src/backend/engine/engineState.ts
    - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
    - src/backend/storeManagers/steam/stores.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - .dependency-cruiser.cjs
key-decisions:
  - "Engine deps use property-style function types (unbound-method lint)"
  - "Overlay step runtime validation moved to gameLaunchOverlay (OVERLAY_STEPS check before publishing)"
  - "recordLaunchDecision takes required deps; Steam callers pass steamEngineStateDeps(appId)"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 10: Generic engine state Summary

Engine state is now computed per game identity (runner + appName, keyed by EngineKey) through injected deps; Steam's bridge-install, DRM-mode and overlay specifics live in the Steam adapter, and `src/backend/engine` imports nothing from storeManagers (rule enforced at zero).

## Commits
- 28e7db263: generalise engineState, move notice store, Steam adapter wrapper
- e09282fc7: neutral log prefix (`LogPrefix.Backend`, `Engine:`) and `engine-is-store-agnostic` rule

## Notes
- Legacy effective engine gives engine 'unsupported', `engineLabel` "Legacy: <label>", no preflight (D-15). `stateWithoutBottle` supports plain-prefix/Legacy games for 61-11.
- Payload now also carries effectiveEngineId, engineSource, prefixKind, perGameBottleName, legacyLabel.
- The Steam channels still register via the Steam adapter until 61-13.
- Old "Steam engine:" messages in fallbackEngine were also renamed to "Engine:".

## Deviations from Plan
- [Rule 3] games.test.ts mock of steamEngineDeps extended with `STEAM_ENGINE_RUNNER` and `steamEngineStateDeps`; its overlay-notice assertions updated to the identity argument.
- engineState tests keep Steam-style overrides through local wrapper functions (no store imports); the isDrmModeFromVerdict tests moved to steamEngineDeps.test.ts. The "bogus overlay step" case dropped from engineState tests since validation moved to gameLaunchOverlay.

## Verification
codecheck clean; `pnpm boundaries` clean; jest engine/steam/sidecar: only the 3 known pre-existing failures; lint totals unchanged (src 1117, tests 664); prettier clean.

## Self-Check: PASSED
