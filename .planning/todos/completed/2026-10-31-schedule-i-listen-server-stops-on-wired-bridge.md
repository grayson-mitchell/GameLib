---
created: 2026-10-31
title: "Schedule I listen server starts then stops immediately on the wired bridge (blocks 58-23 GameLib-hosts direction)"
source: 58-17 wired-bridge re-measure (orchestrator observation from the title's Player.log)
area: steam
files:
  - .planning/phases/58-steam-bridge-multiplayer/58-17-SUMMARY.md
  - .planning/phases/58-steam-bridge-multiplayer/58-01-TITLES.md
severity: major
platform: macos
ready: live-gate
---

## Problem

During 58-17, Schedule I: Free Sample (3205720) launched through GameLib in bridge (TCP shim)
mode created and entered its Steam lobby on Continue (`CreateLobby` CALL, `NET role=game
kind=join iface=Matchmaking cb=504`), then its FishNet transport logged
`Server connection state: Starting and transport index: 1` immediately followed by
`Server connection state: Stopped and transport index: 1`. The operator reported "having issues
hosting". The helper log shows no SteamNetworkingSockets / SteamNetworking / SteamGameServer call
in that window, so no bridge stub explains it from the helper side.

58-18..58-21 do not cover it (58-17 SUMMARY searched them). 58-22/58-23 score Schedule I in both
directions, including GameLib hosts, so this likely fails the 58-23 GameLib-hosts item.

## Next step

Diagnose before 58-22: which FishNet transport index 1 is (FishySteamworks vs Tugboat/UDP), what
it calls at server start, and whether a bridge-side result (e.g. a socket listen call answered by
a stub or a missing interface version) makes it stop. Player.log lives in the bottle under
`drive_c/users/crossover/AppData/LocalLow/TVGS/Schedule I Free Sample/` and contains lobby ids;
do not commit it.

## Resolution (2026-10-31)

Fixed by 58-18 (`0cdc658b1`), which served SteamNetworkingSockets012 — the older interface
version Schedule I imports. Before it, the game had no 012 interface to create its listen socket on,
so FishNet stopped without any helper-side call. Quick host check after 58-20/58-21 on a rebuilt
bridge and restarted dev (operator: "game launched quickly and game loaded into world"):
Player.log shows `Server connection state: Starting` then `Started and transport index: 1`, then
`Starting FishySteamworks client connection`; the helper log shows
`CALL SteamNetworkingSockets013.CreateListenSocketP2P` (012 served through the 013 helper path) and
`CALL SteamFriends017.ActivateGameOverlayInviteDialog`. Peer join is scored in 58-23.
