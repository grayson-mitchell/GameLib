---
phase: quick-261023-oq7
plan: 01
subsystem: steam-bridge-routing
tags: [steam, bridge, routing, d-51-05, d-51-08, shim]
requirements: [D-51-05, D-51-07, D-51-08, D-51-11, D-51-15]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/bridgeRoute.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/games.ts
    - src/common/types/ipc.ts
    - meta/bridgeCensus.ts
    - src/frontend/state/SteamBridgeRouteNotice.ts
    - src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx
    - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-CONTEXT.md
decisions:
  - A persisted scan miss routes to the bridge (reason stays 'scan-miss'; no new reason).
  - A coverage miss places the shim anyway ('placed-miss'); install and launch continue.
metrics:
  completed: 2026-10-23
  tasks: 3
---

# Quick 261023-oq7: Scan miss routes through the bridge; place shim anyway

A persisted scan miss now resolves to bridge / 'scan-miss' (row 7, before seed) with its missing symbols behind a one-time informational notice. A coverage miss places the shim anyway, and install and launch carry on through the bridge.

## Commits
- 763daf5be: resolver reorder (scan-miss is bridge row 7), census routed / verified / covered split, install() notice reason from NOTICE_REASONS
- 39fc63dae: `placed-miss` in shimGenerate.ts (static and runtime-loaded), install and launch treat it as success
- 6d5433cf3: informational scan-miss dialog (`showKnownBadLine`, acknowledgement carries the payload reason), 51-CONTEXT.md amendments

## Behavior
- win64-no-shim sits ahead of user-forced-bridge and scan-miss, so an x64 miss with no Win64 shim still goes to bottle. user-forced-bottle, failed-this-session and drm-wrapped known-bad are unchanged.
- Runtime-loaded (CR-04) miss: the shim is copied over the shipped steam_api*.dll (x86 source for steam_api.dll, x64 source for steam_api64.dll). The walk now returns GameLib shims too. Shims that are all current give `already-placed` with no verdict, stale ones are re-copied as `placed-miss`, and `no-steam-api` is returned only when no steam_api*.dll exists. The persisted miss and its marker survive. reconcileBridgePrescreen upgrades a persisted 'none' on `placed-miss`.
- Install: a `placed-miss` persists the verdict and completes as `{status:'done'}`. There is no bottle deletion, no breaker and no setup dialog, and userRoute is kept. The win64-no-shim branch is unchanged.
- Launch: the 'miss' early return is gone. `placed-miss` goes through helper, cfg and wine, and only real failures arm the breaker.
- Census: routed follows the resolver, covered = bridge + no-steam-api (the D-51-15 verdict), verified is unchanged. The 51-30 regex prefix still matches.

## Notes queued by the plan
1. **Pre-change 'scan-miss' acknowledgements.** A `noticeAcknowledgedFor: 'scan-miss'` persisted before this change came from a dialog that said bottled Steam would be used. That title now goes to the bridge with no fresh notice. This only exists on dev machines; it is not migrated.
2. **SteamBridgeSetup.tsx's `reason === 'scan-miss'` branch has no producer left.** Install and launch no longer send `steamBridgeSetupRequired` with that reason. It is left as defensive dead handling.
3. **A static-import entry-point failure is not detected as a launch failure.** It happens inside the wine process after `runWineCommand` returns, and the process monitor just sees the game exit. This is the expected, by-design outcome, not something fixed here.

## Deviations
- None to the plan's behavior. T-oq7-03 containment is asserted before every runtime-loaded copy. The walk root is already bottle-contained and symlinks are skipped, so no test input can reach the refusal branch. It is defensive and has no dedicated test.
- No new catalog keys, so gamelib.json and the presence baseline are untouched. bridge-allowlist.json is untouched.

## Verification
- jest over the bridge dir, bridgeCensus, games.test, frontend state, InstallModal and GamePage components: 1542 passed. The wider steam dir shows only the known lzmaNative failures.
- `pnpm codecheck` is clean and `pnpm lint-translations:gamelib` has 0 hard failures. Scoped prettier checks pass on all code files. 51-CONTEXT.md is prettier-ignored and was hand-formatted, with additions only.

## Self-Check: PASSED
