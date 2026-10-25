---
created: 2026-10-24
title: "Shims lack the 2014-era Steamworks exports and interface versions that CSteamworks games use, and AnyCPU .NET games are scanned as x86"
source: 284100 hand test, Unclaimed World (2026-10-24)
area: steam-bridge
files:
  - meta/gen_vtables.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/generated/steam_api.def
  - native/steam-bridge/generated/steam_api64.def
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/backend/storeManagers/steam/bridge/importScan.ts
severity: medium
platform: any
ready: code
---

Unclaimed World (284100) is an AnyCPU .NET 4.5.1 MonoGame title. It reaches Steam through
Steamworks.NET and the old `CSteamworks.dll` / `CSteamworks64.dll` native wrapper. With the WMP
registry marker in place (see `2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`),
it reaches Steam init and crashes in Wine:

    Unhandled exception: unimplemented function steam_api64.dll.SteamAPI_InitSafe called in 64-bit code
    Backtrace: =>0 ntdll (+0x68870)  1 csteamworks64 (+0x17da)

No `HELLO`: the game dies on its first steam_api call. Neither shim exports `SteamAPI_InitSafe`.

**Missing exports.** Measured by comparing each wrapper's import table against the built shims in
`public/bin/arm64/darwin/`:

- `CSteamworks64.dll` against `steam_api64.dll`: 12 of 29 imports missing. They are
  `SteamAPI_InitSafe`, `SteamGameServer_InitSafe`, `Steam_RunCallbacks`,
  `Steam_RegisterInterfaceFuncs`, `Steam_GetHSteamUserCurrent`, `g_pSteamClientGameServer` (a
  **data** export, a pointer variable), `SteamAPI_GetSteamInstallPath`,
  `SteamAPI_SetTryCatchCallbacks`, `SteamAPI_SetBreakpadAppID`, `SteamAPI_UseBreakpadCrashHandler`,
  `SteamAPI_WriteMiniDump` and `SteamAPI_SetMiniDumpComment`.
- `CSteamworks.dll` against `steam_api.dll`: 17 of 31 imports missing. These are the same 12 plus
  `SteamAPI_GetHSteamUser`, `SteamAPI_GetHSteamPipe`, `SteamClient`, `VR_Init` and `VR_Shutdown`.

**Missing interface versions.** The launch log (2026-10-24 21:46:30) already listed the versions
this title requests that the shim cannot serve: `SteamUser017`, `SteamFriends014`, `SteamUtils007`,
`STEAMAPPS_INTERFACE_VERSION006`, `STEAMREMOTESTORAGE_INTERFACE_VERSION012`,
`STEAMUGC_INTERFACE_VERSION002`, `STEAMHTTP_INTERFACE_VERSION002`,
`STEAMSCREENSHOTS_INTERFACE_VERSION002`, `STEAMAPPLIST_INTERFACE_VERSION001`,
`STEAMMUSIC_INTERFACE_VERSION001`, `STEAMMUSICREMOTE_INTERFACE_VERSION001`,
`STEAMUNIFIEDMESSAGES_INTERFACE_VERSION001`, `SteamGameServer012` and `SteamGameServerStats001`.
With the exports alone, the game would get past init and then hit the null object, the same way
Manor Lords does (`2026-10-24-x64-shim-lacks-interface-versions-ue5-titles-request.md`).

**Scan picks the wrong architecture.** `UnclaimedWorld.exe` is a PE32 file, but it is AnyCPU
.NET, so in a win64 bottle it runs 64-bit and loads `CSteamworks64.dll` → `steam_api64.dll`.
The scan logged "conflicting steam_api.dll and steam_api64.dll import headings (via
CSteamworks.dll)" and judged coverage against the x86 importer. For a .NET exe without the
32BITREQUIRED flag (CLR header `Flags`), the launch arch is x64.

**No fallback either.** `placeShimForGame` logged that the original `steam_api*.dll` is gone, with
no `.gamelib-orig` backup: it was overwritten before backups existed. So the game cannot be
withheld and launched offline until the original is restored from the depot.

Fix:
1. Add the 12 legacy exports to both shims through `meta/gen_vtables.ts`. `*_InitSafe` aliases
   `*_Init`. The breakpad and minidump calls are no-ops. `Steam_RunCallbacks` and
   `Steam_GetHSteamUserCurrent` map onto existing paths. `g_pSteamClientGameServer` needs a data
   export. x86 also needs the 5 extra exports listed above.
2. Add the old interface versions. Check each one's vtable layout against the SDK headers of its
   generation (around SDK 1.30), slot by slot.
3. Make the scan treat AnyCPU .NET (no 32BITREQUIRED) as x64 for coverage and placement.
4. Before choosing the scope, count how many owned titles ship `CSteamworks*.dll` or request these
   versions. `pnpm bridge-census` is the likely tool. This decides whether it is a quick task or a
   phase.
5. Restore 284100's original `steam_api64.dll` / `steam_api.dll`, then live-check.

## Reach, measured 2026-10-24: one installed title

All 20 game folders across every CrossOver bottle's `steamapps/common` were searched. Only
Unclaimed World ships `CSteamworks*.dll`. Only Unclaimed World has a non-`steam_api` PE that names
`SteamAPI_InitSafe` or `SteamGameServer_InitSafe`, in `CSteamworks.dll`, `CSteamworks64.dll` and
`Steamworks.NET.dll`. The Phase 51 owned-library census (`51-RESEARCH.md`, D-51-15, 8 titles) has
no old-SDK title either. Owned-but-uninstalled titles cannot be counted from disk.

Severity lowered from `major` to `medium` for that reason: the blast radius is one known game.
Scope accordingly. Steps 1 and 3 (legacy exports, AnyCPU scanned as x64) are quick-task sized and
worth doing when the next old-SDK title appears. Step 2 (14 old interface versions) is hard to
justify for a single title; the Unity flat-API todo
(`2026-10-23-bridge-shim-lacks-steamworks-flat-api-for-unity-steamworks-net-games.md`) is the
larger lever.

## Evidence (2026-10-25, phase 53 live run, 53-UAT item 11)

Step 3 (AnyCPU arch, D-53-10, amended to also honour 32BITPREFERRED) shipped in 53-02/53-05. Steps 1, 2, 4, 5 remain. Live confirmation: Unclaimed World 284100 still crashes in Wine with `unimplemented function steam_api64.dll.SteamAPI_InitSafe called in 64-bit code`, backtrace ntdll+0x68870 then csteamworks64+0x17da; no HELLO. Still pending.

## Closed 2026-10-25 (quick 261025-t7i)

- **Step 1, exports: DONE for x64 (`99eaac2f3`).** The real gap on the then-current shim was 6, not
  12; 53-04 had already added the breakpad, minidump and install-path no-ops. Added
  `SteamAPI_InitSafe`, which reports init code 2 once and never calls `SteamAPI_Init`, plus
  `SteamGameServer_InitSafe`, `Steam_RunCallbacks`, `Steam_RegisterInterfaceFuncs`,
  `Steam_GetHSteamUserCurrent`, and `g_pSteamClientGameServer` as a NULL data export. Disassembly
  confirmed CSteamworks64 dereferences that pointer only on game-server paths.
  `pnpm check-csteamworks64-exports` gates 29/29.
- **Step 2, versions: DONE, but this todo's 14-version list was the wrong one.** That list came from
  the x86 CSteamworks.dll, around SDK 1.30. The x64 wrapper that actually loads is Steamworks.NET
  7.0.0 (SDK 1.34), and it requests 22 versions. Ten were added from Proton's inventory at the pinned
  SHA: User018, Utils007, Apps007, RemoteStorage012, UGC007, HTTP002, Screenshots002, HTMLSurface_003,
  Inventory_V001 and Video_V001. A test pins their slots.
- **Step 3: shipped earlier, in 53-02/53-05.**
- **Step 4: measured as one installed title.**
- **Step 5, restore: DONE by hand.** The Mac Steam console's `download_depot` fetched the Windows
  depot, and the next placement created `.gamelib-orig`. The other bottles with no backup are tracked
  in `2026-10-25-bridge-shims-placed-without-gamelib-orig-backup.md`.
- **Also found and fixed live: `4d26c70d1`** (debug `uw-284100-no-iface-pins`). `importParse.ts`
  matched objdump's export-table `DLL name:` line as an import. This affected any importer PE whose
  export name differs from its file name. The census diff showed no other row changed.
- **Live result, 22:00:** HELLO, `GINIT fn=SteamAPI_InitSafe ok=1`, 22 `iface.` pins, and
  `CALL SteamUtils007.GetAppID`. Steamworks.NET init no longer fails. Recorded as working but
  **unverified** under the unchanged 53-11 rule, which needs 2 or more game calls including an
  identity call; the operator chose to keep the rule.
- **Deferred:** x86 (17 exports, SteamClient015, VR_*) under D-53-09.
- **The game still exits** on a Media Foundation error opening its main-menu WMV. That is not a
  Steam problem; see `2026-10-25-unclaimed-world-mainmenu-wmv-fails-in-wine-media-foundation.md`.
