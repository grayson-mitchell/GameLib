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
