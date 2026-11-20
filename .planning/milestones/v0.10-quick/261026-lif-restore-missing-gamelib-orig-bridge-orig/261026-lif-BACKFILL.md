# Quick 261026-lif: bridge `.gamelib-orig` backfill record

"Before" survey taken by the executor on 2026-10-26 (after `pnpm build:sidecar`, sidecar.js mtime
15:43:45, newer than the Task 3 commit 39692c70a at 15:43:40). Command per appId:
`find "$HOME/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-<appId>/drive_c" -iname 'steam_api*.dll*'`
plus `grep -c -a GameLibSteamBridgeShim <file>` (`shim=1` is a GameLib shim, `shim=0` is a game original).
Paths are relative to `.../drive_c/Program Files (x86)/Steam/steamapps/common/`.

Survey result: no `*.gamelib-orig` exists in any of the 11 bottles. 13 of the 14 steam_api dlls are
shims. 230070 `steam_api.dll` is NOT a shim (original in place, nothing to restore). The todo/CONTEXT
said "15 shims"; the survey found 13 shims + 1 original on disk.

Filled 2026-10-26 by the orchestrator from gamelib.log and the bottles after the operator ran Verify and Repair + relaunch on all 11. Originally: the operator fills the last four columns (repair outcomes, `.gamelib-orig` present, relaunch verdict,
bridge verified) and `notes`. The executor does not.

| appId | shim paths | repair outcomes | .gamelib-orig present | relaunch verdict | bridge verified | notes |
|---|---|---|---|---|---|---|
| 1167950 | `Vampire's Fall Origins/Vampire's Fall Origins_Data/Plugins/x86_64/steam_api64.dll` (shim=1) | restored | yes (1, shim=0) | placed (runtime-loaded, covered) | yes: HELLO 15:47:34 | before: no backup; after: launched fine |
| 1284190 | `The Planet Crafter/Planet Crafter_Data/Plugins/x86_64/steam_api64.dll` (shim=1) | restored | yes (1, shim=0) | placed (runtime-loaded, covered) | yes: HELLO 15:48:10 | before: no backup; after: launched fine |
| 1603180 | `Mining Mechs/steam_api64.dll` (shim=1) | restored | yes (1, shim=0) | **withheld** (SteamClient ambiguous + unservable ifaces) | no: shim withheld, no helper | before: no backup; after: ran without Steam; was bridged before; quick 261026 withhold-rule task |
| 1691190 | `RogueWaters/RogueWaters_Data/Plugins/x86_64/steam_api64.dll` (shim=1) | restored | yes (1, shim=0) | placed (runtime-loaded, covered) | yes: HELLO 15:51:27 | before: no backup; after: first-launch redists vc2019+DX installed (261025-rkj) |
| 1782460 | `Hell Clock/Hell Clock_Data/Plugins/x86_64/steam_api64.dll` (shim=1) | restored | yes (1, shim=0) | already-placed | yes: HELLO 15:52:25 | before: no backup; after: launched fine |
| 206060 | `Avernum 6/steam_api.dll` (shim=1) | restored | yes (1, shim=0) | placed (2 imported symbols covered) | yes: HELLO 15:53:49 | before: no backup; after: launched fine |
| 219990 | `Grim Dawn/steam_api.dll`, `Grim Dawn/compat/steam_api64.dll`, `Grim Dawn/x64/steam_api64.dll` (all shim=1) | restored x3 | yes (3, all shim=0) | steamstub forwarder (launch 1); steamstub-unforwarded:withheld (launch 2) | HELLO 15:57:41 on launch 1; DRM | before: no backup on any of 3; after: DRM title; second launch took a different route, investigate in withhold-rule task; redists vc2010/2012/2013 installed |
| 230070 | `Age of Decadence/steam_api64.dll` (shim=1); `Age of Decadence/steam_api.dll` is a game original (shim=0) | steam_api.dll original-in-place; steam_api64.dll restored | yes (1, shim=0) | **withheld** (SteamController003, STEAMUGC008) | no: shim withheld, no helper | before: no backup for the x64 shim; the x86 dll is an original, expect `original-in-place`; after: ran 18s without Steam; redists vc2012/2015+DX installed |
| 3410180 | `Overlooting/steam_api64.dll` (shim=1) | restored | yes (1, shim=0) | **withheld** (SteamClient ambiguous, REMOTEPLAY003, TIMELINE004, UGC021) | no: shim withheld, no helper | before: no backup; after: ran without Steam; was bridged before |
| 411300 | `ELEX/system/steam_api64.dll` (shim=1) | restored | yes (1, shim=0) | **withheld** (SteamController003, STEAMUGC008) | no: exits after 2s (x3) | before: no backup; after: REGRESSION: ran 188s with the shim on 2026-10-23; game-own steam_api finds no Steam client. Owned by the withhold-rule follow-up (operator chose option a) |
| 648800 | `Raft/Raft_Data/Plugins/x86_64/steam_api64.dll` (shim=1) | restored | yes (1, shim=0) | placed + steamstub forwarder | HELLO 16:06:37; DRM | before: no backup; after: DRM title; DX Jun2010 installed |

## Operator instructions

1. Fully quit and restart the dev app (tauri dev does not rebuild or reload the sidecar; `build/main/sidecar.js` was rebuilt at 15:43:45).
2. Make sure GameLib is signed in to Steam (Library loads owned games).
3. For each title above: open its game page, open the menu, choose "Verify and Repair", confirm. Note "Finished repairing" or "Error Repairing".
4. Copy the `SteamGame.repair appId <id>: <path>: <outcome>` lines from the GameLib log into the row. Outcomes: `restored`, `already-backed-up`, `original-in-place`, `not-in-depot`, `backup-refused`, `refused`, `download-failed`.
5. Re-run the find command. Each placed shim should now have a `.gamelib-orig`, and `grep -c -a GameLibSteamBridgeShim` on the backup should print 0.
6. Launch the title. In the log look for `discarding the persisted verdict and rescanning (quick 261026-lif)` or a plain `placed` line. Record the new verdict status and pins from `steam_metadata.json` (`<appId>.bridge.scan`: status, `interfaceVersions`, and that `originalFingerprints` is present) and the `iface.` lines in `gamelib_bridge.cfg`.
7. Record "bridge verified" under the strict criterion (HELLO plus a clean game Steam-init log; no game log means unverified; In-Game never counts). A title whose fresh scan withholds the shim is recorded as `withheld`; that is correct, not a regression.
8. A title that cannot be restored (`not-in-depot`, depot refused or blocked) gets its reason in `notes`; a recorded reason meets the Done-when.
