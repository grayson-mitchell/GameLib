---
created: 2026-10-23
title: "bridge-census scans the x86 binary of a dual-arch title while install and launch use x64 (230070 shows x86 | missing-symbols)"
source: phase 51-28 live gate item 18 (The Age of Decadence, 230070)
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/
severity: major
platform: any
ready: code
---

The Age of Decadence ships both AoD.exe (x86) and AoD64.exe (x64). The install-time scan, shim placement (`steam_api64.dll`) and launch all used x64, and the game plays through the bridge (51-UAT item 18). `pnpm bridge-census` nevertheless reports `| 230070 | The Age of Decadence | Age of Decadence | x86 | missing-symbols | no | SteamInternal_CreateInterface, SteamAPI_GetHSteamUser, SteamAPI_GetHSteamPipe, ... |`, because it scanned the x86 exe and steam_api.dll. For a dual-arch title the census disagrees with what actually runs.

Plan 51-30 relies on the census for its closing numbers, so this must be fixed before then (make the census pick the same executable and arch the launcher selects, or read the persisted verdict) or explicitly handled and called out in 51-30.
