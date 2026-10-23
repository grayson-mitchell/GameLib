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

## Closed

Closed 2026-10-24, quick 261024-f0w.

1. The census reads the persisted `<appId>.bridge.scan.arch` from `steam_metadata.json`, the verdict install wrote from the launcher's own exe, because `resolveBridgeLaunchExe` needs live PICS and backend imports. It objdumps every candidate exe and scans the one whose arch matches.
2. With no persisted verdict it keeps the first importing exe and its detail says the arch is unconfirmed (dual-arch install, no persisted bridge.scan verdict).
3. Live result: `| 230070 | The Age of Decadence | Age of Decadence | x64 | bridge | yes | unverified (no HELLO) |  |`. The arch is x64 and the class is no longer `missing-symbols` from the x86 symbol list.
4. "Verified" now means a `HELLO  shim attached appid=<id>` in gamelib.log plus a clean Unity Player.log in the per-game bottle. The allowlist's `playVerified` is shown as "Play recorded (allowlist)". Summary line: `18 of 19 routed to the bridge; 0 of 19 verified running through the bridge (HELLO + clean game log; 1 init-failed, 18 unverified); 2 of 19 play recorded in the allowlist; 15 of 19 symbols covered by the shim (static scan) (bridge=3, known-bad=3, missing-symbols=1, no-steam-api=12)`.

Consequence for 51-30: its key_link "seed[].playVerified drives the census verified count" is now stale. Its K comes from the Evidence column (HELLO + clean game log), and the census currently reports 0 of 19.
