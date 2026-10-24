---
created: 2026-10-23
title: "Bridge shim exports no Steamworks flat API, so Unity/Steamworks.NET games run without Steam"
source: 51-29 representative sample, Vampire's Fall: Origins (1167950), after quick 261023-ue0
area: steam-bridge
files:
  - meta/gen_vtables.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
severity: major
platform: macos
ready: code
---

Vampire's Fall: Origins (1167950, x64 Unity) routes to the bridge. After quick 261023-ue0
put `gamelib_bridge.cfg` beside the shim in `<Game>_Data/Plugins/x86_64/`, the shim attaches
(`HELLO shim attached appid=1167950`, 2026-10-23 22:01:08). Steam still never initialises. The
game's own `Player.log` says:

    EntryPointNotFoundException: SteamAPI_ISteamClient_GetISteamUser
      at Steamworks.SteamClient.GetISteamUser (...)
      at Steamworks.CSteamAPIContext.Init ()
      at Steamworks.SteamAPI.Init ()

Steamworks.NET, the standard C# wrapper Unity games use, P/Invokes Valve's **flat C API**:
`SteamAPI_ISteamClient_*`, `SteamAPI_ISteamUser_*`, `SteamAPI_ISteamUserStats_*` and so on,
hundreds of exports. The shim exports only the bare accessors, the `SteamInternal_*` lookup
family and a few `SteamAPI_*` lifecycle calls. The game tolerates the failure and plays
offline: no achievements, no cloud, no Steam identity.

Two parts:

1. **Coverage.** Generate flat-API exports from the same interface tables the vtable proxies
   come from. Each `SteamAPI_ISteamX_Method(self, ...)` forwards over the bridge like the vtable
   slot does. Older Steamworks.NET builds bind version-specific flat names, so check which SDK
   generations the owned Unity library uses before choosing a target.
2. **Detection.** The install scan is blind here. A C# game loads steam_api at runtime, so the
   persisted verdict is only `missing: ['steam_api64.dll@runtime-loaded']`. The required
   entry-point names are readable from the managed assemblies' DllImport metadata
   (`<Game>_Data/Managed/*.dll`, e.g. `com.rlabrecque.steamworks.net.dll` or
   `Assembly-CSharp.dll`). Scanning them would make the verdict, and the census "covered" count,
   honest for this class.

Measurement caveat for 51-29/51-30: Mac Steam's In-Game status for such a title comes from
the bridge helper's own `SteamAPI_Init`, not from the game. "Verified running through the
bridge" must require `HELLO` **and** no Steam-init failure in the game's own log.

As of quick 261024-f0w (2026-10-24) `pnpm bridge-census` applies this: its Evidence column reads
gamelib.log `HELLO` plus the bottle's Unity `Player.log` and reports verified / unverified /
init-failed (symbol).

Likely phase-sized rather than a quick task. Unity + Steamworks.NET is a large share of
Windows-only Steam titles, so this may be the biggest single lever on D-51-15's "most".

## Recurrence: Rogue Waters (1691190) hangs on the loading screen (2026-10-24)

The game is not always tolerant. Rogue Waters attaches (`HELLO shim attached`, 10:19:34). Its
`Player.log` then shows the same `EntryPointNotFoundException: SteamAPI_ISteamClient_GetISteamUser`
from `SteamAPI.Init`. It also shows a second one, `SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck`,
thrown from `RewiredInputAdapter.OnEnable` while Zenject builds the project context. The game
then sticks on its loading page. This happened twice, including after an operator restart of
GameLib. Mac Steam shows In-Game, which comes from the helper as noted above.

So for some titles the flat-API gap does not just mean playing offline: it **blocks play**. The
sample now has three Unity titles hitting it (1167950, 1284190, 1691190), and Rogue Waters is the
first that cannot be played. Both missing symbols are on the minimum list for a first slice.

## Evidence (2026-10-25, phase 53 live run, 53-UAT items 1-4)

Left open: items 1, 2 and 4 fail. Player.log shows `SteamAPI_Init() failed` for 1691190, 1167950 and 1782460; each logged `NOVER flat lookup ver=STEAMSCREENSHOTS_INTERFACE_VERSION003 served=no`. Planet Crafter 1284190 (same NOVER) passed. Next step: serve STEAMSCREENSHOTS_INTERFACE_VERSION003 (and SteamUtils009, SteamController006 for 1691190), then re-test.
