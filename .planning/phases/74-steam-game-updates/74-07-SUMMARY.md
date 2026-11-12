---
phase: 74-steam-game-updates
plan: 07
subsystem: steam-bridge
tags: [steam, bridge, shim, update]
requires: []
provides:
  - runBridgeUpdateFollowUps
  - isSteamApiDllPath
affects: [74-10]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/bridgeUpdateFollowUps.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeUpdateFollowUps.test.ts
decisions:
  - "Shim handover relies on placeShimForGame/backupOriginalBeforeOverwrite (verified: backup only when on-disk bytes are not a shim); no forced backup refresh needed"
  - "gamelib_bridge.cfg is not written here; reported cfgRewrittenAtLaunch: true (launch rewrites it)"
metrics:
  tasks: 2
  files: 2
completed: 2026-11-12
---

# Phase 74 Plan 07: Bridge Update Follow-ups Summary

`runBridgeUpdateFollowUps` re-runs the GID-keyed bridge steps after an update (launch exe resolve, shim placement/rescan with handover, verdict/DRM/prescreen persist, shared redists, DRM prefetch), each step isolated, never removing the bottle or marking the bridge failed.

## Tasks

1. RED tests (9 cases): 9e1af7f7e
2. Implementation: 0213e8134

## Verification

jest (follow-ups, shimOriginals, fakeHomeIsolation) 19 pass; codecheck and steam-line-ceiling pass; prettier clean; grep for removePerGameBridgeBottle/markBridgeFailedThisSession in code = 0.

## Deviations from Plan

None. Tests replace placeShimForGame with a fake that runs the real backupOriginalBeforeOverwrite then writes shim bytes (real placement needs PE fixtures), so the handover is pinned against the real backup rule, not the full placement.

## Self-Check: PASSED
