---
created: 2026-10-23
title: "x64 shim lacks the modern-SDK SteamInternal_* exports, and the install scan misses steam_api importers that aren't the exe"
source: 51-29 representative sample, Grim Dawn (219990)
area: steam-bridge
files:
  - meta/gen_vtables.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/generated/steam_api64.def
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
severity: major
platform: macos
ready: code
---

Grim Dawn (219990) routes to the bridge and installs. GameLib places the shims (x86
`steam_api.dll`, x64 `x64/steam_api64.dll` and `compat/steam_api64.dll`) and writes 3 cfg copies.
On every launch `x64/grim dawn.exe` starts and exits **after 2 seconds**, with no
`HELLO shim attached`, no Wine error dialog and no `My Games/Grim Dawn` directory created
(2026-10-23 22:14:22 and 22:15:09). Grim Dawn has no DRM; it is also sold DRM-free on GOG.

**Cause: a static-import miss.** The exe does not import steam_api. `x64/Engine.dll` does, and it
imports these exports, which the x64 shim does not provide (`steam_api64.def` has only
`SteamInternal_CreateInterface` from this family):

- `SteamInternal_SteamAPI_Init` (the SDK 1.55+ init entry point, replacing `SteamAPI_Init`)
- `SteamInternal_ContextInit`
- `SteamInternal_FindOrCreateUserInterface`
- `SteamInternal_FindOrCreateGameServerInterface`
- `SteamInternal_GameServer_Init_V2`

Windows refuses to load a DLL with an unresolved import. Engine.dll fails, and the process
exits silently under Wine. Colony Ship (648410) hit part of the same set in 51-27
(`SteamInternal_FindOrCreateUserInterface` and `SteamInternal_ContextInit`).

**Fix, part 1: coverage.** Export the five functions from the x64 shim, and from x86 too if
the generator makes that free.
- `FindOrCreateUserInterface(hUser, version)` and `FindOrCreateGameServerInterface` resolve
  through the same version-keyed lookup `SteamInternal_CreateInterface` already uses.
- `ContextInit(pContextInitData)` follows the SDK's callback-and-counter context protocol.
- `SteamInternal_SteamAPI_Init(pszInternalCheckInterfaceVersions, pOutErrMsg)` sends the
  `HELLO` transaction like `SteamAPI_Init`, and returns `ESteamAPIInitResult` (0 = OK).
- `GameServer_Init_V2` is a stub that returns failure (no game-server support, the same as the
  other GameServer stubs).

**Fix, part 2: detection.** The scan reads only the launch exe's imports, so the persisted
verdict here was just `missing: ['steam_api.dll@runtime-loaded', 'steam_api64.dll@runtime-loaded']`
and never named the missing symbols. Scan every PE in the install tree that imports
`steam_api*.dll`, here `x64/Engine.dll`, and merge their imports into the required set. Then a
miss names its symbols and the census counts the title as not covered. This is a sibling of
the managed-assembly blind spot in
`2026-10-23-bridge-shim-lacks-steamworks-flat-api-for-unity-steamworks-net-games.md`.

Smaller than the flat-API work: five exports reusing existing lookup plumbing, plus a scan
walk. Re-test 219990 and 648410 after the fix.

Measurement note for 51-29/51-30: Grim Dawn counts as bridge-routed, does not run, cause
missing modern-SDK exports. That is a bridge defect, so it stays off `knownBad`.

## Correction from spike 038 (2026-10-23): the 2-second exit is SteamStub, not the import miss

Traced in an APFS clone of `GameLibSteamBridge-219990`
(`.planning/spikes/038-steamstub-grimdawn-probe/`, `evidence.txt`):

- **Wine does not refuse the load.** The five missing exports show up as
  `warn:module:import_dll No implementation for steam_api64.dll.SteamInternal_* imported from ...Engine.dll`.
  Wine binds them to stubs that fail only when called. `steam_api64.dll` and `Engine.dll` both
  reach `PROCESS_ATTACH`, so "Engine.dll fails" above is wrong under CrossOver.
- **The Steam build is DRM-wrapped.** `x64\Grim Dawn.exe` (and the x86 and `compat` exes) carry a
  SteamStub `.bind` section. "Grim Dawn has no DRM" holds for the GOG build, not this one. After
  the DLL inits, the stub opens `HKCU\Software\Valve\Steam\ActiveProcess` (missing), then
  `HKLM\Software\Wow6432Node\Valve` (missing), then calls `ShellExecute("steam://run/219990//")`,
  which is a no-op in a bridge bottle, and the process exits. That's the observed 2 s. Engine.dll's
  missing imports are never reached.
- **Both fixes are needed, in this order:** SteamStub has to pass first (todo
  `2026-10-23-forwarding-steamclient-dll-for-steamstub-titles.md`), then this todo's five exports
  are what Engine.dll hits next. Fixing this one alone won't make Grim Dawn run.

So the 51-29/51-30 measurement note should read "does not run; SteamStub-wrapped (blocked on the
forwarding steamclient), then missing modern-SDK exports". It's still a bridge defect, not a
`knownBad` entry, because a forwarding client is in scope (unlike CEG, 035–037).

## More titles hitting the missing exports (51-29 sample, 2026-10-24)

The gap blocks or degrades three more sampled titles, reached through three different engines:

- **Hell Clock (1782460, Unity).** Steamworks.NET `SteamAPI.InitEx` P/Invokes
  `SteamInternal_SteamAPI_Init` and gets `EntryPointNotFoundException` (`Player.log`, from
  `HellClock.Steam.SteamManager.Awake`). No `HELLO`. The game plays offline.
- **Mining Mechs (1603180, GameMaker).** The runner loads the GameMaker Steamworks extension
  `Steamworks_x64.dll` at runtime. It imports `SteamInternal_SteamAPI_Init`,
  `SteamInternal_ContextInit` and `SteamInternal_FindOrCreateUserInterface` from the placed shim
  and calls `SteamAPI_InitEx`. Wine binds the missing imports to stubs that fault when called.
  The game then shows a "...encountered a serious problem..." dialog and exits after 44 s
  (10:45:28 to 10:46:12). No `HELLO`. **Does not run.**
- **Ranch Simulator (1119730, UE).** The Shipping exe imports `SteamInternal_SteamAPI_Init`. It is
  masked today by the UE scan miss
  (`2026-10-24-bridge-scan-reads-unreal-bootstrap-exe-and-misses-the-shipping-binary.md`) and
  will be reached once that miss is fixed.

`SteamInternal_SteamAPI_Init` is the common entry for every SDK 1.58+ title, whatever its engine.
Together with the two flat-API misses it is the highest-yield single export. Do part 1 first.
Re-test 1782460 and 1603180 alongside 219990 and 648410.
- **Overlooting (3410180, Godot).** GodotSteam's `libgodotsteam.windows.template_release.x86_64.dll`
  imports `SteamInternal_SteamAPI_Init`, `ContextInit`, `FindOrCreateUserInterface` and
  `FindOrCreateGameServerInterface` from the placed shim. The operator saw the same crash dialog
  as Mining Mechs. No `HELLO`. **Does not run.** Side note: the exe is 322 MB because Godot embeds
  its `.pck`, and the DRM detector logged `could not parse the exe as a PE ... treating as not CEG`.
  Check the parser's size or read limit, since a large exe is a valid PE.

That makes four engines (Unity, GameMaker, Godot, UE) through four different wrappers, all
stopped by the same missing exports.
