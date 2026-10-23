---
created: 2026-10-24
title: "Bridge scan reads the Unreal bootstrap exe, finds no steam_api import and launches without shim or helper"
source: 51-29 representative sample, Manor Lords (1363080)
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/games.ts
severity: major
platform: macos
ready: code
---

Manor Lords (1363080, UE5) routes to the bridge. It plays fine, but Mac Steam never shows
In-Game. Log, 2026-10-24 07:04:25 and 07:06:33:

    placeShimForGame: appId 1363080 imports nothing from steam_api(64)?.dll -- no-steam-api
    SteamGame: launching appId 1363080 via the Steam bridge bottle directly (no-steam-api, no helper)

`ManorLords.exe` is Unreal's bootstrap stub. It only starts
`ManorLords/Binaries/Win64/ManorLords-Win64-Shipping.exe`, which is the binary that imports
`steam_api64.dll`. The DLL itself sits in
`Engine/Binaries/ThirdParty/Steamworks/Steamv157/Win64/`. The scan read only the stub, decided
"no-steam-api", and skipped both the shim and the helper. So Valve's real `steam_api64.dll` ran
in Wine, found no Steam, and the game played offline. That means no In-Game, no achievements and
no cloud.

Every UE4/UE5 title ships this stub-plus-Shipping layout, so this is a large class of games, not one.

**Fix.**
1. Resolve the UE stub to its Shipping binary: the `<Project>/Binaries/Win64/*-Shipping.exe`
   beside a top-level `<Project>.exe`. More generally, scan every PE in the tree that imports
   `steam_api*.dll` (part 2 of
   `2026-10-23-x64-shim-lacks-modern-sdk-steaminternal-exports-and-scan-misses-dll-importers.md`).
2. Place the shim at the DLL's real location (`Engine/Binaries/ThirdParty/Steamworks/Steamv*/Win64/`),
   with the cfg copy beside it.
3. Then coverage: the Shipping exe imports `SteamInternal_ContextInit`,
   `SteamInternal_FindOrCreateUserInterface`, `SteamInternal_FindOrCreateGameServerInterface`
   and `SteamInternal_GameServer_Init`, which brings in the modern-SDK export todo above.

Measurement note for 51-29/51-30: bridge-routed, plays, but not through the bridge (no shim was
placed). That is a scan defect, not `knownBad`.
