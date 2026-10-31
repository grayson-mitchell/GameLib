# 58-01 Title measurement: Schedule I: Free Sample (3205720)

Measured 2026-10-31 from installed files and operator captures (`/tmp/gamelib-58-01-20261031T001305Z/`, outside the repo). Nothing was downloaded or launched during measurement. Only method names, versions and counts are copied from logs.

**Honesty note on ordering.** Plans 58-02..58-16 were executed BEFORE this capture, so the `launch-gamelib.prev.log` launch (13:22) ran on the WIRED bridge, not a pre-wiring one. The plan's "pre-wiring rows" therefore reflect the wired bridge. A second launch (`post-513-fix-gamelib.log`, 14:34) ran after quick fix 261031-ixa (LobbyCreated_t 513 relay). No pre-wiring evidence is claimed. 58-17 still regenerates this list.

## Install

- Installed through GameLib (bridge route) into the per-game bottle `GameLibSteamBridge-3205720`.
- `steamapps/appmanifest_3205720.acf`: name "Schedule I: Free Sample", `installdir` "Schedule I Demo", buildid 18191878.
- Install dir: `steamapps/common/Schedule I Demo/` containing `Schedule I Free Sample.exe`, `UnityCrashHandler64.exe`, `UnityPlayer.dll`, `MonoBleedingEdge/`, `Schedule I Free Sample_Data/`.
- `steam_api64.dll` in `Plugins/x86_64/` is the GameLib shim; the genuine one is preserved as `steam_api64.dll.gamelib-orig` and was used for the version scan.

## Launch exe

- Launch exe: `Schedule I Free Sample.exe` (beside `UnityPlayer.dll`).
- `.bind` section: **no**. Sections: `.text .rdata .data .pdata .rsrc .reloc`. Not SteamStub-wrapped (A5).
- PE format: `objdump -f` reports `file format coff-x86-64`, architecture x86_64; `objdump -x` Magic 020b (PE32+); `file`: "PE32+ executable (GUI) x86-64". That is x86-64 (this macOS objdump names PE x86-64 as coff-x86-64, not `pei-x86-64`).
- `UnityCrashHandler64.exe`: also x86-64, no `.bind`.

## Engine and Steam stack

- Engine: Unity, Mono scripting (`MonoBleedingEdge/EmbedRuntime/mono-2.0-bdwgc.dll`, 169 managed DLLs). Not IL2CPP (no `GameAssembly.dll`).
- Steam wrapper: Steamworks.NET 2024.8.0 on Steamworks SDK 1.60 (`com.rlabrecque.steamworks.net.dll`, `Plugins/Steamworks.NET.txt`), native `steam_api64.dll`.
- Netcode: FishNet (`FishNet.Runtime.dll`) with a FishySteamworks transport embedded in `Assembly-CSharp.dll` (20 ASCII and 1 UTF-16 matches), plus Tugboat (UDP transport in FishNet.Runtime) and Edgegap (dedicated-server tooling). Assembly-CSharp references Steam lobby methods (CreateLobby, JoinLobby, GameLobbyJoinRequested, LobbyChatUpdate), SteamNetworking (7 matches), SteamNetworkingSockets (1), SteamFriends.ActivateGameOverlayInviteDialog (1).
- Not found: EOSSDK, EpicOnlineServices, Photon, Heathen, Facepunch (Mirror matches are a single stray string in Assembly-CSharp and Assembly-CSharp-firstpass).
- Anti-cheat: none (no EasyAntiCheat, BattlEye, EOSBootstrapper files or folders).
- Strings prove presence, not calls. Which of FishySteamworks' Steam transport calls (SteamNetworking P2P versus Sockets) run is NOT measured: the host never reached in-session play.

## Interface versions present

From `steam_api64.dll.gamelib-orig` (genuine Valve DLL):

| Family | Versions found | File |
| --- | --- | --- |
| SteamMatchMaking | SteamMatchMaking009 | steam_api64.dll.gamelib-orig |
| SteamMatchMakingServers | SteamMatchMakingServers002 | steam_api64.dll.gamelib-orig |
| SteamNetworking | SteamNetworking006 | steam_api64.dll.gamelib-orig |
| SteamNetworkingSockets | SteamNetworkingSockets012 | steam_api64.dll.gamelib-orig |
| SteamNetworkingUtils | SteamNetworkingUtils004 | steam_api64.dll.gamelib-orig |
| SteamNetworkingMessages | SteamNetworkingMessages002 | steam_api64.dll.gamelib-orig |
| SteamFriends | SteamFriends017 | steam_api64.dll.gamelib-orig |
| SteamGameServer | SteamGameServer015, SteamGameServerStats001 | steam_api64.dll.gamelib-orig |
| ManualDispatch | `SteamAPI_ManualDispatch_Init` imported | steam_api64.dll.gamelib-orig; named also in the Steamworks.NET managed DLL |

`com.rlabrecque.steamworks.net.dll`, `Assembly-CSharp.dll` and `FishNet.Runtime.dll` carry the symbolic name `STEAMMATCHMAKING_INTERFACE_VERSION` (managed) but no extra versioned strings.

## Runtime calls observed

Source: `bridge helper [3205720]:` lines. HELLO, GINIT and READY were seen on both launches (first launch: HELLO 13:22:26, GINIT `SteamInternal_SteamAPI_Init` ok, `INIT manual dispatch ready`, `READY init=ok`). `NOVER`: none on any launch.

STUBCALL (first call of locally stubbed methods; identical on both launches):

- `SteamUtils010.GetImageSize` slot=5 kind=stub
- `SteamFriends017.GetMediumFriendAvatar` slot=35 kind=stub
- `SteamFriends017.ActivateGameOverlayInviteDialog` slot=33 kind=stub
- `SteamClient021.SetWarningMessageHook` slot=22 kind=stub

CALL (wired):

- First launch: `SteamUser023.GetSteamID`, `SteamMatchMaking009.CreateLobby`, `SteamMatchMaking009.GetLobbyData`, `SteamMatchMaking009.GetNumLobbyMembers`; later in the same session `SteamFriends017.GetPersonaName`.
- Post-513-fix launch: the above plus `SteamMatchMaking009.SetLobbyData` and `SteamMatchMaking009.GetLobbyMemberByIndex`.

Callbacks: first launch `CBQ unlisted iCallback=513 action=drop` (LobbyCreated_t broadcast dropped; root cause of the blank host version). After quick fix 261031-ixa the 14:34 launch queued 513 and delivered it by both the broadcast and call-result paths (`CBDISP iCallback=513` src=callresult and held=0), and the game then called SetLobbyData. Other unlisted-and-dropped callback ids on both launches: 336, 304, 1270009, 1270006, 1040044, 1040015, 1040011 (348 once on the continuation). These are not yet attributed to a game need.

## Re-measure on the wired bridge

Measured 2026-10-31 (capture `/tmp/gamelib-58-17-20261031T062510Z/`, outside the repo; Player.log not copied). Source: `bridge helper [3205720]:` lines in `wired-launch-gamelib.log`, all with plans 58-12..58-16 wired. The log holds three helper sessions (HELLO at 06:27:51Z, 06:32:25Z, 06:36:21Z; the orchestrator saw two game process launches). The union over all three is recorded; each finding says which session(s) it came from (S1, S2, S3). GINIT `SteamInternal_SteamAPI_Init` ok in all three; `READY init=ok` in S1 and S2. `NOVER`: none in any session.

Operator notes (verbatim, in order): (1) "launched on mac, looks like game has crashed... got to main menu then clicked continue"; (2) "may have gone real slow, tried B as was having issues hosting for A. did not work. got a wrong platform error when trying to click steam link. when in game already and clicking link nothing happens"; (3) "done". Run shape: A (Mac hosts) was attempted first; B (PC hosts in Schedule I, invites the Mac account via Steam friends "Invite to Game", Mac accepts) did not work. Peer-invite from the PC side was therefore not completed end to end.

Orchestrator-observed (from the bottle Player.log, not operator-reported): on Continue the game logged lobby create, "Lobby created" and "Entered lobby", sent its host-loading message, then FishNet "Server connection state: Starting and transport index: 1" immediately followed by "Stopped and transport index: 1", so the FishNet listen server failed to start. Two Unity crash-report uploads followed (NullReferenceException in `ScheduleOne.UI.PauseMenu.Pause/Resume`): managed exceptions, the process kept running, so this is not a process crash. The "wrong platform" error came from the invite link being handled by Mac Steam while the game was not running (no Mac build of the title).

STUBCALL (S1, S2, S3, identical):

- `SteamUtils010.GetImageSize` slot=5 kind=stub
- `SteamFriends017.GetMediumFriendAvatar` slot=35 kind=stub
- `SteamFriends017.ActivateGameOverlayInviteDialog` slot=33 kind=stub
- `SteamClient021.SetWarningMessageHook` slot=22 kind=stub

NOVER: none.

CALL:

- S1, S2, S3: `SteamUser023.GetSteamID`, `SteamMatchMaking009.CreateLobby`, `SetLobbyData`, `GetLobbyData`, `GetNumLobbyMembers`, `GetLobbyMemberByIndex`
- S1, S2 only: `SteamMatchMaking009.SendLobbyChatMsg`, `SteamMatchMaking009.GetLobbyChatEntry`, `SteamNetworkingUtils004.CheckPingDataUpToDate`

`NET role=game kind=join iface=Matchmaking cb=504 n=1`: appeared in S1, S2 and S3 (once each).

Callbacks relayed (CBDISP, all sessions): 504, 505, 507 (S3 also 503), 513 (broadcast and call-result), 1101, 1222, 1281. Queued with sizes: 504/505/507/503 cub=24, 513 cub=16, 1222 cub=260, 1281 cub=272.

`CBQ unlisted ... action=drop` ids: S1: 304, 336, 1040011, 1040015, 1040044, 1270006, 1270009. S2: 1040011, 1040015, 1040044, 1270006, 1270009. S3: 304, 336, 348, 1040011, 1040015, 1270003, **333**. 337 never appeared.

**Open Question 4 answer.** 333 (GameLobbyJoinRequested_t) arrived at the helper: yes, once, in S3 at 06:36:59Z when the operator clicked the invite link with the game running. It was dropped as unlisted (`callresult=0`), consistent with the operator's "nothing happens". 337 (GameRichPresenceJoinRequested_t): no. So Mac Steam does deliver the join request to the bridge helper, and only the missing allowlist row stands between it and the game.

### Findings for downstream plans

- 333 drop: covered by 58-18 (its must_haves wire "relay rows for GameLobbyJoinRequested_t (333)" when this section marks it measured; it now does, and 58-18 adds the exact-size allowlist row).
- `ActivateGameOverlayInviteDialog` stub: covered by 58-18 (specific ISteamFriends invite methods named as measured).
- FishNet listen-server Starting then Stopped on transport index 1: NOT covered by 58-18, 58-19 (SteamGameServer, not measured) or 58-20/58-21 (server browser), and 58-22 only tests the TCP-mode subject. Cause unknown; the game used only Matchmaking and Utils calls in the helper log, so the failure is in the title's own FishNet transport (FishySteamworks over SteamNetworking or Sockets, neither of which showed a CALL or STUBCALL), possibly the transport selected by the "transport index: 1" Tugboat/UDP fallback or a missing sockets/networking call that is not logged. Recommend a todo or gap before 58-22.

### Pre-wiring rows (superseded)


#### Pre-wiring older versions (superseded)

Current SDK versions per the plan: SteamMatchMaking009, SteamMatchMakingServers003, SteamNetworking006, SteamNetworkingSockets013, SteamNetworkingUtils004, SteamNetworkingMessages002.

- SteamMatchMakingServers002 (older than 003)
- SteamNetworkingSockets012 (older than 013)

All other families found are at the current version (or have no current baseline in the plan: SteamFriends017, SteamGameServer015, SteamGameServerStats001). Present in the DLL's string table; whether the game's code path uses them is not measured.


#### Pre-wiring D-09 rows (superseded)

| Item | Status | Evidence |
| --- | --- | --- |
| ISteamFriends invite / overlay / rich presence calls | measured (invite overlay). Rich presence: not-observed | `STUBCALL SteamFriends017.ActivateGameOverlayInviteDialog slot=33 kind=stub` on the host path (both launches). `SetRichPresence` only appears as a Steamworks.NET wrapper string, no runtime call. Also measured stubs: `SteamFriends017.GetMediumFriendAvatar`, `SteamUtils010.GetImageSize` |
| GameLobbyJoinRequested_t / GameRichPresenceJoinRequested_t referenced | measured (static) for GameLobbyJoinRequested_t: referenced in Assembly-CSharp.dll (2 matches). GameRichPresenceJoinRequested_t: not-observed in game code (wrapper only) | strings over `Assembly-CSharp.dll`; not exercised at runtime |
| ISteamMatchmakingServers request methods | not-observed | no CALL/STUBCALL; version 002 present in the DLL, wrapper strings only |
| SteamGameServer* hosting | not-observed | no CALL/STUBCALL; SteamGameServer015 present in the DLL, wrapper strings only |
| ManualDispatch import | measured | `SteamAPI_ManualDispatch_Init` present in `steam_api64.dll.gamelib-orig`; `INIT manual dispatch ready` in the helper log |

The invite path is the first to stub and blocked the host's "add another player", so later join-path calls (join, lobby browser) may hide behind it.

## Older versions imported (re-measured 2026-10-31, wired bridge)

Current SDK versions per the plan: SteamMatchMaking009, SteamMatchMakingServers003, SteamNetworking006, SteamNetworkingSockets013, SteamNetworkingUtils004, SteamNetworkingMessages002.

- SteamMatchMakingServers002 (older than 003): source: static (string table in the genuine DLL); the run shows no `NOVER` and no call for it or for 003.
- SteamNetworkingSockets012 (older than 013): source: static; the run shows no `NOVER`, no STUBCALL and no CALL for any SteamNetworkingSockets version.

No version was imported at runtime (`source: runtime`: none). All other families seen at runtime are at the current version: SteamMatchMaking009, SteamNetworkingUtils004 (re-measured 2026-10-31, wired bridge).

## D-09 measured need

| Item | Status | Evidence |
| --- | --- | --- |
| ISteamFriends invite / overlay / rich presence calls | measured (invite overlay). Rich presence: not-observed | `STUBCALL SteamFriends017.ActivateGameOverlayInviteDialog slot=33 kind=stub` in S1, S2, S3. Also stubs: `SteamFriends017.GetMediumFriendAvatar`, `SteamUtils010.GetImageSize`. No SetRichPresence/GetFriendRichPresence call (re-measured 2026-10-31, wired bridge) |
| GameLobbyJoinRequested_t / GameRichPresenceJoinRequested_t | measured: 333 arrived and was dropped (`CBQ unlisted iCallback=333 action=drop`, S3). 337: not-observed (re-measured 2026-10-31, wired bridge) | live invite-link click with the game running |
| ISteamMatchmakingServers request methods | not-observed | no STUBCALL/CALL naming SteamMatchMakingServers*; MMServers003 relay is built regardless (58-20/58-21, D-07); this row only decides MMServers002 (re-measured 2026-10-31, wired bridge) |
| SteamGameServer* hosting | not-observed | no STUBCALL/CALL naming SteamGameServer* or a SteamGameServer_* export (re-measured 2026-10-31, wired bridge) |
| ManualDispatch import | measured (informational) | `GINIT ok` and manual dispatch active in S1-S3 (re-measured 2026-10-31, wired bridge) |

The invite path stubbing no longer hides later calls: with matchmaking wired the title reached lobby create, chat and ping calls, then failed at its own FishNet listen server start (see findings above).

## Join flow

Operator notes (step 8):

- The game runs to its menu. Host works (lobby created).
- "Add a player" first showed "version mismatch: Host version [blank], your version 0.2.9f8". Cause measured: LobbyCreated_t (513) was dropped as unlisted, so the game never ran its lobby-created handler and never called SetLobbyData. Fixed by quick task 261031-ixa; on the 14:34 launch SetLobbyData is called.
- After the fix, "add another player" is unresponsive: it calls `SteamFriends017.ActivateGameOverlayInviteDialog`, a STUB. Per D-09 this family is admitted because the title was measured calling it on its host path (belongs to 58-17/58-18).
- Join, lobby browser and code join were not exercised (the invite path blocked first).
- Peer-hosts direction: the invite path is a Steam friend invite through the overlay dialog and arrives as GameLobbyJoinRequested_t (referenced in game code), so a peer-hosts direction needs a Steam friend invite delivered to the Mac. Whether it is also reachable by lobby browser or code join is open.

## Account preflight

- Second (limited) account signed into Steam on the peer PC. PC was rebooted from Windows into Linux mid-setup; real Steam is in use (D-04).
- Friendship with the main account: accepted.
- Second account owns Raft (648800).
- Schedule I: Free Sample installed on the peer. The main account also played the demo on Linux. A separate record of the second account's own launch to main menu was not given in the operator reply.

## Assumptions settled

- A1 (Steam transport): open, leaning confirmed. FishySteamworks, Steam lobbies and SteamNetworking/Sockets strings are present and the lobby calls run through Steam matchmaking, but the data transport calls are not runtime-measured because no session reached play.
- A2 (Steamworks.NET / Sockets012): confirmed for the library (Steamworks.NET 2024.8.0, SDK 1.60). SteamNetworkingSockets012 is the version in the DLL; use of it is not runtime-measured.
- A4 (limited account can join): open. Friendship accepted and the account has the demo installed, but no join was exercised.
- A5 (free title not SteamStub-wrapped): confirmed. No `.bind`.

## Operator decision (Task 3, D-14)

Operator replied "approved" on 2026-10-31: Schedule I: Free Sample (3205720) is confirmed as the TCP-mode test title. A1 and A4 stay open until 58-17/58-18 wire the invite family and a join is exercised. Outstanding precondition for 58-17: the operator did not explicitly confirm that the second account launched Schedule I to its main menu on the peer PC; this is not recorded as confirmed.

Verdict: PROCEED
