## Pre-gate measurement

Measured 2026-10-31 by plan 58-08 Task 1. Read-only: `strings -a` and a Python byte count (UTF-8 and UTF-16LE) over
`BOTTLE(648800)/.../Raft/Raft_Data/Managed/Assembly-CSharp.dll` (3211776 bytes). `com.rlabrecque.steamworks.net.dll` is excluded
(it names every type). macOS `strings` has no `-e`, so UTF-16 user strings were counted with Python; every UTF-16 count is 0.

Archive (not uploaded): `build/steamclient-layer-cx26.3.0.39832-p58.tar.gz`, sha256
`53780308f648eff14f6f162721a1446ee9af0a208cb52e9e31eff51cff06e8c5`, size 5360143, equal to 58-04-SUMMARY. Seven
`GAMELIB-DRM-TRACE BEGIN` blocks in steamclient_main.c. Members re-extracted and re-hashed, all six match 58-04-SUMMARY.

| Name                                      | Count in Assembly-CSharp |
| ----------------------------------------- | ------------------------ |
| LobbyEnter_t                              | 0                        |
| LobbyCreated_t                            | 0                        |
| CreateLobby                               | 0                        |
| JoinLobby                                 | 0                        |
| GameLobbyJoinRequested_t                  | 0                        |
| GameRichPresenceJoinRequested_t           | 1                        |
| P2PSessionRequest_t                       | 1                        |
| AcceptP2PSessionWithUser                  | 1                        |
| SendP2PPacket                             | 1                        |
| ReadP2PPacket                             | 1                        |
| IsP2PPacketAvailable                      | 1                        |
| SteamNetConnectionStatusChangedCallback_t | 0                        |
| ConnectP2P                                | 0                        |
| CreateListenSocketP2P                     | 0                        |
| SendMessageToConnection                   | 0                        |
| SteamMatchmaking                          | 0                        |
| SteamNetworkingSockets                    | 0                        |

Other Raft game-code names: `SteamNetworking`, `SteamFriends`, `cheat_joinGameSteamID`, `JoinGameSteamIDBOX`, `Message_InitiateConnectionResultSteam`,
`SendInitiateResultSteam`, `get_CurrentSteamHost`. The game also ships `Unity.Netcode.*` and `Unity.Networking.Transport.dll`.
56-15's Raft captures recorded no lobby or networking `event=call name=` entries (item 8 was a launch-to-menu comparison only).

Reading: Raft is a legacy Steam P2P title (SendP2PPacket / ReadP2PPacket / AcceptP2PSessionWithUser / P2PSessionRequest_t) joined by
Steam friend "Join Game" (GameRichPresenceJoinRequested_t, id 337). It references no lobby type and no Sockets
connection-status type, so the D-08 item 1 callbacks (LobbyEnter_t 504, SteamNetConnectionStatusChangedCallback_t 1221)
are not expected from Raft.

join signal: 1202-only
