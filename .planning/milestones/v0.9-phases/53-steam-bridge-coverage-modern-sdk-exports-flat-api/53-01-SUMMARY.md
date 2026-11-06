---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 01
subsystem: steam-bridge
tags: [shim, x64, interface-versions, proton-manifests]
requires: []
provides:
  - "x64 shim serves SteamClient020/021, SteamUser021, SteamFriends017/018, SteamUtils010, UserStats012/013, SteamInput006, GameServer014/015, GameServerStats001"
  - "SteamInternal_GameServer_Init x64 export (bool false)"
affects: [53-04]
tech-stack:
  added: []
  patterns: ["manifest extraction from pinned Proton SHA; served-map + .def both-directions pin"]
key-files:
  created:
    - meta/sdk/isteamclient020.manifest.json
    - meta/sdk/isteamclient021.manifest.json
    - meta/sdk/isteamuser021.manifest.json
    - meta/sdk/isteamfriends017.manifest.json
    - meta/sdk/isteamutils010.manifest.json
    - meta/sdk/isteamuserstats012.manifest.json
    - meta/sdk/isteamuserstats013.manifest.json
    - meta/sdk/isteaminput006.manifest.json
    - meta/sdk/isteamgameserver014.manifest.json
    - meta/sdk/isteamgameserver015.manifest.json
    - meta/sdk/isteamgameserverstats001.manifest.json
  modified:
    - meta/gen_vtables.ts
    - meta/sdk/isteamfriends.manifest.json
    - meta/sdk/acceptance-interface-versions.json
    - meta/sdk/ordinals.json
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/interfaceVersions.ts
decisions:
  - "Bare accessors for families already covered by GAMESERVER flat stubs (SteamGameServer, SteamGameServerStats) are skipped by the generator; the existing NULL stubs stay"
  - "SteamInput added to BARE_ACCESSOR_FAMILY (not to CAMEL_CASE_FAMILIES)"
metrics:
  completed: 2026-10-25
---

# Phase 53 Plan 01: x64 interface versions and pre-V2 GameServer_Init Summary

11 Proton-extracted x64 manifests plus Friends018 widened to x64, registered in the x64 served map, and a pre-V2 `SteamInternal_GameServer_Init` export (bool false, no bridge_transact).

## Measured version lists (D-53-11, Task 1 Step A)

Read with `readInterfaceVersionStrings` from the installed Shipping exes:

- 1363080 Manor Lords: STEAMAPPS_008, STEAMREMOTESTORAGE_016, STEAMUSERSTATS_012, SteamFriends017, SteamGameServer015, SteamGameServerStats001, SteamInput006, SteamMatchMaking009, SteamMatchMakingServers002, SteamNetworking006, SteamUser023, SteamUtils010
- 427410 Abiotic Factor: identical list to Manor Lords
- 1119730 Ranch Simulator: the above with USERSTATS_013, plus STEAMHTTP_003, STEAMMUSICREMOTE_001, STEAMMUSIC_001, STEAMPARENTALSETTINGS_001, STEAMREMOTEPLAY_002, STEAMSCREENSHOTS_003, STEAMUGC_020, SteamController008, SteamMatchGameSearch001, SteamNetworkingMessages002, SteamNetworkingSockets012, SteamNetworkingUtils004, SteamParties002 (these families have no served version, so the x64 null object answers them, D-51-13)
- 648410 Colony Ship: STEAMUSERSTATS_012, SteamUser023, SteamUtils010

No version beyond the plan's list was missing, so Step A added nothing to the extraction list.

## Manifest method counts

SteamClient020: 42, SteamClient021: 40, SteamUser021: 32, SteamFriends017: 80, SteamUtils010: 39, USERSTATS012: 45, USERSTATS013: 44, SteamInput006: 48, GameServer014: 44, GameServer015: 44, GameServerStats001: 10. Slots contiguous, all x64. SteamUtils010 has `IsSteamRunningOnSteamDeck` as a stub (returns 0, D-53-06), pinned by a gen_vtables test.

## Commits

- a629392eb: manifests, acceptance list, ordinals
- 92a15dbf9: generator, regenerated shim/.def/dispatch, served map, tests

## Verification

- gen_vtables, shimAbiGate, shimCoverage, and all `src/backend/storeManagers/steam` suites pass (2481 tests); `pnpm gen-vtables` idempotent; `pnpm build-steam-bridge` passes (zig compile gates x86, x64, steamclient64); objdump of steam_api64.dll lists the new exports (3 matches).
- Prettier clean on all touched paths.

## Deviations from Plan

**1. [Rule 3 - Blocking] Duplicate bare-accessor export**
- Issue: the new SteamGameServer*/SteamGameServerStats001 manifests made the generator emit bare `SteamGameServer`/`SteamGameServerStats` accessors, duplicating the existing GAMESERVER flat stubs (duplicate .def exports, C redefinition).
- Fix: generator skips bare accessors for names already in GAMESERVER_FLAT_STUBS (`hasGameServerFlatStub`); CR-02 family pin test skips them; `SteamInput` added to BARE_ACCESSOR_FAMILY.
- Files: meta/gen_vtables.ts, meta/__tests__/gen_vtables.test.ts, interfaceVersions.ts

**2. [Rule 1 - Stale tests] Tests that used now-served versions as "unservable" examples**
- shimCoverage.test.ts and shimGenerate.test.ts used SteamFriends017, SteamUtils010, SteamUser021 and SteamInternal_GameServer_Init as uncovered examples. Moved to still-unserved SteamFriends016, SteamUtils009, SteamUser020, SteamAPI_ManualDispatch_Init.

## Deferred / pre-existing (out of scope)

Failing before and unrelated to this plan: pluralCategoriesFor (3), genI18nGateScope A-17, `findDeadcode.cjs` CLI (flags unrelated fixtures). Not touched.

## Known Stubs

None added beyond intended all-stub manifests (SteamInput006, GameServer014/015, GameServerStats001), which are the plan's design.

## Self-Check: PASSED

Manifests, commits a629392eb and 92a15dbf9 exist.
