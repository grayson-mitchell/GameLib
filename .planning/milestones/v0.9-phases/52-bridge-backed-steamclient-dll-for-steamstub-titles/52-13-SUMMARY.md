---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 13
subsystem: steam-bridge-shim
tags: [shim, x64, gap-closure, grim-dawn]
requires: []
provides:
  - Win64 shim serves SteamUser023 (wire), SteamNetworking006 and STEAMREMOTESTORAGE_INTERFACE_VERSION016 (stub)
affects: [52-17 re-gate]
key-files:
  created:
    - meta/sdk/isteamnetworking006.manifest.json
    - meta/sdk/isteamremotestorage016.manifest.json
  modified:
    - meta/sdk/acceptance-interface-versions.json
    - meta/sdk/isteamuser.manifest.json
    - meta/sdk/ordinals.json
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api64.def
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
key-decisions:
  - "Option (a): serve the versions rather than add a SteamStub-aware guard"
requirements-completed: [P52-SCOPE-1, P52-DONE]
duration: 15min
completed: 2026-10-24
---

# Phase 52 Plan 13: Serve Grim Dawn's x64 interface versions Summary

`findUnservableInterfaceVersions` now returns [] for Grim Dawn's x64 set, so the j4l withhold guard no longer withholds 219990.

## Accomplishments
- Acceptance inventory records the three versions (title 219990); SteamUser023 widened to x86+x64 by hand (helperInterface `SteamAPI_SteamUser_v023` retained, not re-extracted).
- Two new Proton-extracted stub manifests (ordinals 23 and 24, 0 wired methods, no helperInterface; no wire-policy overrides needed, wire-policy.json untouched).
- Regenerated shim; `steam_api.def` (x86) byte-identical. `steam_api64.def` gained SteamAPI_SteamUser_v023, SteamAPI_SteamNetworking_v006, SteamAPI_SteamRemoteStorage_v016, mirrored in `SHIM64_EXPORTED_SYMBOLS`.
- Grim Dawn acceptance test added; isScanVerdictNowCovered table row flipped, x64 SteamUser021 negative case added.
- Jest (5 suites, 284 tests), `pnpm build-steam-bridge`, `pnpm codecheck` all pass.

## Commits
- 545ccdff5: acceptance entries and manifests
- 3e37a6e2b: shim regeneration, served map, tests (see git log)

## Named risk for the 52-17 re-gate
Other versions x64/Engine.dll names that the x64 shim does not serve (resolver reported `@ambiguous`): SteamClient023, SteamFriends018, SteamUtils011, STEAMAPPS_INTERFACE_VERSION009, STEAMUSERSTATS_INTERFACE_VERSION013, SteamMatchMakingServers003. They fall to the x64 null object at runtime. Recorded, not acted on.

## Deviations from Plan
None. (`bridge_dispatch.h` did not change on regeneration, so it was not committed.)

## Self-Check: PASSED
