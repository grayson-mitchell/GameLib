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

## Recurrence: Abiotic Factor (427410), 2026-10-24 10:34:32

Abiotic Factor shows the same layout and the same log pair: `no-steam-api`, then
`launching ... directly (no-steam-api, no helper)`. `AbioticFactor.exe` is the stub that starts
`AbioticFactor/Binaries/Win64/AbioticFactor-Win64-Shipping.exe`. The game ships
`Engine/Binaries/ThirdParty/Steamworks/Steamv157/Win64/steam_api64.dll`. It played for 82 s, but
offline: no In-Game. That is two UE titles out of 7 sampled.

## Recurrence: Ranch Simulator (1119730) does not run, 2026-10-24 10:42 and 10:43

This is the same stub/Shipping layout: `no-steam-api`, then `launching ... directly (no-steam-api, no helper)`.
This time the game **exits after 2-3 s** on both launches.
`Ranch_Simulator-Win64-Shipping.exe` imports `steam_api64.dll` (`Steamv161`), including
`SteamAPI_RestartAppIfNecessary` and `SteamInternal_SteamAPI_Init`, and there is no
`steam_appid.txt`. The likely path is that Valve's real DLL finds no Steam, `RestartAppIfNecessary`
returns true, and the game quits to "relaunch through Steam". That is the standard 2-second exit.
The shim's `SteamAPI_RestartAppIfNecessary` returns 0, so placing it would get past this. The
game would then hit `SteamInternal_SteamAPI_Init`, the modern-SDK todo.

So the same scan miss gives "plays offline" for Manor Lords and Abiotic Factor but "won't
launch" here, depending on whether the game calls `RestartAppIfNecessary`. Three UE titles of 10
sampled.

## Closed 2026-10-24: the scan recognises the UE stub-plus-Shipping layout

**Cause.** When the launch exe imports no steam_api, placement walks the install root for
`steam_api*.dll`, but only to depth 4. UE keeps the DLL at
`Engine/Binaries/ThirdParty/Steamworks/Steamv*/Win64/`, six levels down. The walk found nothing
and fell through to `no-steam-api`.

**Fix.** Quick 261024-ir1 adds `findUnrealLayout` to `shimGenerate.ts`. It runs only when a real
`Engine/` directory sits beside the launch exe. The DLL walk also walks
`Engine/Binaries/ThirdParty/Steamworks`, so the shim goes over the DLL at its real location and
that path is reported in `shimPaths` for the cfg copy. The `*/Binaries/Win64/*-Shipping.exe`
files (up to 8) are scanned first and outside the 512-file importer cap, so their imports always
feed coverage. Depth 4, the 512 cap and their tests are unchanged, and so is `games.ts`.

Live re-test is still owed on the Mac: 1363080, 427410 and 1119730 should log `placed` (not
`no-steam-api`), launch with the helper, and reach `HELLO` with a clean game Steam-init log.
Ranch Simulator should no longer exit at 2-3 s.
