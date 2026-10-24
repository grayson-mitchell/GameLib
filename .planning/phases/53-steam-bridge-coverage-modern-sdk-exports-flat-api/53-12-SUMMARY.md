---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 12
subsystem: steam-bridge
tags: [steamworks-net, interface-versions, proton-extraction, gap-closure, x64]
requires: [53-10]
provides:
  - x64 served map covers the whole Steamworks.NET CSteamAPIContext.Init set for the four sampled Unity titles
  - 23 new Proton-extracted all-stub x64 manifests (Utils009 carries its 11 wire methods)
  - extractor refuses unknown struct-pointer returns instead of emitting pointer + `_ret`
affects: [53-16]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/steamworksNetContextVersions.json
    - meta/sdk/isteamscreenshots003.manifest.json
    - meta/sdk/isteamgamesearch001.manifest.json
    - meta/sdk/isteamhttp003.manifest.json
    - meta/sdk/isteamugc010.manifest.json
    - meta/sdk/isteamugc016.manifest.json
    - meta/sdk/isteamugc017.manifest.json
    - meta/sdk/isteamugc020.manifest.json
    - meta/sdk/isteamapplist001.manifest.json
    - meta/sdk/isteammusic001.manifest.json
    - meta/sdk/isteammusicremote001.manifest.json
    - meta/sdk/isteamhtmlsurface005.manifest.json
    - meta/sdk/isteaminventory003.manifest.json
    - meta/sdk/isteamvideo002.manifest.json
    - meta/sdk/isteamvideo007.manifest.json
    - meta/sdk/isteamtimeline001.manifest.json
    - meta/sdk/isteamparentalsettings001.manifest.json
    - meta/sdk/isteamparties002.manifest.json
    - meta/sdk/isteamremoteplay001.manifest.json
    - meta/sdk/isteamremoteplay002.manifest.json
    - meta/sdk/isteamutils009.manifest.json
    - meta/sdk/isteamcontroller006.manifest.json
    - meta/sdk/isteamcontroller008.manifest.json
    - meta/sdk/isteamgameserver012.manifest.json
  modified:
    - meta/extractProtonInventory.ts
    - meta/gen_vtables.ts
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/interfaceVersions.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api64.def
    - native/steam-bridge/generated/bridge_dispatch.h
    - src/backend/storeManagers/steam/bridge/shimExports.generated.ts
key-decisions:
  - "Serve Controller008 and UGC010 as well: serving only 006/016-020 would have half-served those families for Ranch Simulator and ELEX (Pitfall 4) and defeated the null-object answer"
  - "Hell Clock's measured list differs (VIDEO_V007, TIMELINE_V001): both extracted from their own Proton blocks"
requirements-completed: [D-53-02, D-53-03, D-53-06, D-53-07, D-53-01]
completed: 2026-10-25
---

# Phase 53 Plan 12: Serve the Steamworks.NET Init set on x64 Summary

Every interface version requested by `CSteamAPIContext.Init` in Rogue Waters, Vampire's Fall, Hell Clock and Planet Crafter is now a served x64 proxy, so `NOVER flat lookup` can no longer come from Init. Live confirmation is plan 53-16.

## Commits

- b4b76f942 test: measured fixture (RED) plus extractor sret hardening
- 211066ced feat: extract batch 1 (small Init families)
- 9fa080c08 feat: extract batch 2 (HTTP, UGC, HTMLSurface, Inventory)
- bcd372b73 feat: extract batch 3 (Utils009, Controller006, GameServer012)
- 1510c84fa feat: serve, regenerate, retarget tests

## Measured version lists

Measured with `readManagedInterfaceVersionStrings` (after widening the scan pattern to `_VERSION_005` / `_V003` forms, which the old pattern could not see). 31 constants per title.
- 1691190 matched the planning list.
- 1167950 and 1284190: identical to each other; UGC017, GameServer015, User023 (as planned).
- 1782460 Hell Clock differs from the planning abbreviation: `STEAMVIDEO_INTERFACE_V007` (not V002), plus `STEAMTIMELINE_INTERFACE_V001`; no AppList, RemotePlay002, UGC020, Client021. Both extras were added (Timeline conservatively, as an Init superset).

## Pre-scan of by-value struct returns

Added to SRET_STRUCT_SIZE (pinned Proton 2c620c0f, lsteamclient/unixlib_generated.cpp):

| Struct | Size | Source | Used by |
|---|---|---|---|
| ControllerDigitalActionData_t | 2 | :6501 `>= 2` | Controller006 |
| ControllerAnalogActionData_t | 16 | :6491 `>= 13`, bActive@12, aligned | Controller006 |
| ControllerMotionData_t | 40 | :6507 `>= 40` | Controller006 |
| Input* / SteamIPAddress_t | 2/16/40/20 | 53-10 values | Controller008, GameServer |

No version was blocked.

## Manifest method counts

Screenshots003 9, GameSearch001 14, HTTP003 25, UGC010 74, UGC016 86, UGC017 89, UGC020 94, AppList001 5, Music001 9, MusicRemote001 32, HTMLSurface005 38, Inventory003 38, Video002 4, Video007 4, Timeline001 4, ParentalSettings001 6, Parties002 12, RemotePlay001 7, RemotePlay002 8, Utils009 34 (11 wired; helperInterface SteamAPI_SteamUtils_v011 set by hand as for Utils010), Controller006 31, Controller008 34, GameServer012 44. All x64, contiguous slots, no `_ret` param. Ordinals 36-58, additions only.

## Generator resolutions

- FLAT_NAME_OVERRIDES (new): `SteamUGC.CreateQueryAllUGCRequest` to `...Page`, `_2` to `...Cursor`; `GetQueryUGCKeyValueTag_2` to `GetQueryFirstUGCKeyValueTag`; `SteamInventory.SetProperty` to `SetPropertyString`, `_2` to `SetPropertyBool` (the numeric-type suffix rule cannot name these).
- FLAT_UNREPRESENTABLE_CASES: `SteamGameServer.GetPublicIP.SteamGameServer012` (012 returns a uint32 in RAX, 013-015 a 20-byte hidden-pointer struct). The 012 vtable proxy is still served.
- BARE_ACCESSOR_FAMILY gained SteamGameSearch, SteamParentalSettings, SteamParties, SteamRemotePlay, SteamTimeline (required by the CR-02 family-spelling pin).

## Results

- Export count: `objdump -p steam_api64.dll | grep -c SteamAPI_ISteam` = 851 (53-10: 512). steam_api64.dll = 496128 bytes. Generator reports 58 interfaces, 2093 vtable slots, 1012 steam_api64 exports.
- `pnpm gen-vtables` idempotent; `pnpm build-steam-bridge` exit 0; `pnpm codecheck` clean.
- Bridge, gen_vtables, shimAbiGate suites: 19 suites, 726 tests pass; the 53-12 Init-coverage test is green.

## Deviations from Plan

**1. [Rule 3 - Blocking] Controller008 and UGC010 extracted in addition to the plan's list.** Serving Controller006 and UGC016/017/020 made SteamController008 (Ranch Simulator) and STEAMUGC_INTERFACE_VERSION010 (ELEX) unservable under the Pitfall-4 half-served-family rule, failing the existing sampled-title tests. Both were extracted from their own Proton blocks.

**2. [Rule 1 - Bug] Retargeted existing tests that used now-served families as "unserved" examples** (shimCoverage byFamily pin, findUnservable cases, three shimGenerate cases): now use SteamNetworkingUtils/Sockets and unserved versions (HTTP002, Utils006).

**3. Additions beyond the plan list:** STEAMVIDEO_INTERFACE_V007 and STEAMTIMELINE_INTERFACE_V001 (Hell Clock measurement), plus STEAMTIMELINE macro family in interfaceVersions.

Pre-existing, untouched: meta i18n test failures.

## Self-Check: PASSED
