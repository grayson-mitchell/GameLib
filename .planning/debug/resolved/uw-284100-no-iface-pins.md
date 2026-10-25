---
status: resolved
trigger: "Unclaimed World (284100) bridge launch after quick 261025-t7i: HELLO and GINIT ok, but Steamworks.NET init fails because gamelib_bridge.cfg has no iface.* pins"
created: 2026-10-25
updated: 2026-10-25
---

# Debug: Unclaimed World 284100 cfg gets no interface pins

## Symptoms

- **Expected:** placement of the rebuilt shim, with the game-original steam_api64.dll restored, writes
  `iface.<Family>=<Version>` lines into the game-dir `gamelib_bridge.cfg`. At minimum this includes
  `iface.SteamClient=SteamClient017`, plus the other served families the original names: SteamUser018,
  SteamFriends015, SteamUtils007, STEAMUSERSTATS_INTERFACE_VERSION011, STEAMAPPS_INTERFACE_VERSION007 and so
  on. Steamworks.NET 7.0 init then succeeds and the game makes SteamUserStats calls through the bridge.
- **Actual:** the live run 2026-10-25 21:43-21:47 (`~/Library/Logs/GameLib/gamelib.log`) showed:
  - placement kept both originals as `.gamelib-orig` (21:43:14)
  - HELLO, then `GINIT fn=SteamAPI_InitSafe ret=1 ok=1` (21:44:09)
  - the window was raised and the process lived 210 s
  - `gamelib_bridge.cfg` holds only `port=52658` / `appid=284100`
  - no CALL lines appeared
- **Errors:**
  - The game's `Errors.txt` (game dir, 21:44:09): `[Steamworks.NET] SteamAPI_Init() failed. Achievements will
    not be available.`
  - The game later shows the generic dialog "Oops, there was an error: unknown".
  - `placeShimForGame` warned: "conflicting steam_api.dll and steam_api64.dll import headings (via
    CSteamworks.dll)" and "launch exe imports no steam_api ... runtime-loaded (importer PEs: CSteamworks.dll),
    recording a miss and placing the shim anyway".
- **Timeline:** this is the first time 284100 reaches init. Before 261025-t7i it crashed on an unimplemented
  `SteamAPI_InitSafe`. The originals were restored from depot 284101 (manifest 3159369609451446961) just before
  this run. Their shasums: steam_api64.dll 59ac74f6..., steam_api.dll a150b754...
- **Reproduction:** launch 284100 through the bridge in `tauri dev`. The sidecar was rebuilt at 21:42:08 and
  includes 261025-t7i.

## Context

- Research: `.planning/quick/261025-t7i-shim-legacy-csteamworks-exports-and-old-/261025-t7i-RESEARCH.md`. It
  says SteamClient() returns an object only when the cfg pins a SteamClient version, and that the
  CSteamworks64 context init NULL-checks 22 versions.
- Hypotheses to test first:
  1. In the `placeShimForGame` runtime-loaded branch, `selectInterfaceVersionPool`
     (`src/backend/storeManagers/steam/bridge/shimGenerate.ts` ~L880-930, `interfaceVersions.ts:340`) uses only
     the managed (Mono) UTF-16 versions when the Managed scan finds any, and drops dllVersions from the restored
     original.
  2. `resolveRequiredInterfaceVersions` in bare-accessor mode yields `{}`, because CSteamworks64's imports are
     not bare accessors, or because `usesRuntimeInterfaceLookup(merged)` is false.
  3. A persisted verdict with empty `interfaceVersions` (`readBridgeVerdict`, games.ts ~L2934; config write at
     games.ts ~L3100) is reused instead of the fresh scan.
- Constraint: the bottle `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-284100` is
  READ-ONLY. Copy files to the scratchpad at
  `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/71bf01b5-7590-4bca-949c-cba23c17cd81/scratchpad`
  if you need them. The operator does the relaunch.

## Current Focus

next_action: none -- verified live 2026-10-25 22:00 (22 iface pins, CALL SteamUtils007.GetAppID, no SteamAPI_Init failure)

## Evidence

- Offline harness (placeShimForGame against copies of 284100 files, originals restored) reproduced:
  verdict missingSymbols=[steam_api64.dll@runtime-loaded], interfaceVersions={} (the `forName.length === 0 &&
  managedPart.required.length === 0` marker-only branch; no pool is ever built).
- Cause: objdump prints CSteamworks64.dll's EXPORT table name as `DLL name: CSteamworks.dll`; parseImportedDllNames
  matched it case-insensitively as an import, so scanImportClosure followed the x86 CSteamworks.dll, saw a
  steam_api.dll block against the x64 steam_api64.dll block, and scanSteamApiImports returned the conflicting-headings
  error. findImporterPes then dropped CSteamworks64.dll (status error), leaving only the x86 importer; launch arch x64
  => no x64 importer and no Managed DllImports => marker-only miss, interfaceVersions {}.
- After the fix (case-sensitive `DLL Name:`): verdict clean, arch x64, 21 interfaceVersions including
  SteamClient=SteamClient017, SteamUser018, SteamFriends015, SteamUtils007, STEAMUSERSTATS_INTERFACE_VERSION011.

## Eliminated

- hypothesis 1 (Managed pool replaces dllVersions): not reached; branch is skipped by the marker-only continue.
- hypothesis 2 (bare-accessor mode yields {}): not reached for the same reason.
- hypothesis 3 (persisted verdict reused): not the cause of this run (fresh placement); but see relaunch trap.

## Resolution

root_cause: parseImportedDllNames / STEAM_API_HEADING matched the export-table `DLL name:` line (case-insensitive).
fix: case-sensitive `DLL Name:` in importParse.ts.
verification: offline harness + new importScan regression test (fails before, passes after); steam tree + meta suites.
files_changed: [src/backend/storeManagers/steam/bridge/importParse.ts, src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts]
