---
created: 2026-11-07T00:00:00.000Z
title: 'Cat Quest (593280) launches through the bridge with the shim withheld, so its Steam init fails'
area: steam
severity: medium
platform: macos
ready: live-gate
found_by: 'quick 261107-lum live gate (forced-Windows install of a dual-build Unity title)'
---

Cat Quest (593280, Unity, Steamworks.NET) routes to the native bridge (`bridge/pending-scan`) but launches "via the Steam bridge bottle directly (shim withheld: coverage gaps …, no helper)": the install-time import scan of its `steam_api.dll` reports hundreds of flat-API and interface-version exports as uncovered (SteamAPI_ISteamApps_*, SteamAPI_ISteamFriends_*, SteamAPI_ISteamUserStats_*, SteamUser020, SteamFriends017, SteamUtils009, SteamController@ambiguous(SteamController006,SteamController007), …). With no shim the game's own `SteamAPI_Init()` fails (`error.log` in `GameLibSteamBridge-593280/drive_c/users/crossover/AppData/LocalLow/The Gentlebros Pte_ Ltd_/Cat Quest/`: `[Steamworks.NET] SteamAPI_Init() failed`, then `InvalidOperationException: Steamworks is not initialized` at `SteamUser.GetSteamID`). The game still plays, without achievements or any Steam feature.

Not caused by the forced-Windows routing: a Windows-only title shipping the same steam_api would hit the same wall. Find out why this SDK's export set is judged uncovered (is the list really all uncovered, or is the scan miscounting a full-export DLL whose game only calls a few?) and why the helper is absent ("no helper"), then either extend coverage or decide the withheld-shim behaviour is right. Strict verified bar applies: shim HELLO plus a clean game Steam-init line in `output_log.txt` / `error.log`.

Also observed in the same gate: Undertale (391540, GameMaker) logged `shim coverage miss … steam_api.dll@runtime-loaded`, launched with the helper `READY init=ok`, but produced no shim HELLO and no game-originated call. Check whether it is the same class before splitting it out.
