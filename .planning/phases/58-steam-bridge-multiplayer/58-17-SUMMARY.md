---
phase: 58-steam-bridge-multiplayer
plan: 17
subsystem: steam-bridge
tags: [steam, measurement, schedule-i, d-09, open-question-4]
requires: [58-01, 58-16]
provides:
  - "Regenerated D-09 measured-need and older-version rows taken on the wired bridge"
  - "Open Question 4 settled: GameLobbyJoinRequested_t (333) reaches the helper and is dropped as unlisted; 337 never appeared"
affects: [58-18, 58-19, 58-20, 58-21, 58-22]
key-files:
  modified:
    - .planning/phases/58-steam-bridge-multiplayer/58-01-TITLES.md
decisions:
  - "Union over three helper sessions (HELLO 06:27:51Z, 06:32:25Z, 06:36:21Z); each finding names its session."
  - "Old rows kept as superseded sub-sections (renamed so only the regenerated headings are canonical)."
metrics:
  tasks: 2
  completed: 2026-10-31
---

# Phase 58 Plan 17: Wired-bridge re-measure Summary

58-01-TITLES.md now carries a `## Re-measure on the wired bridge` section plus regenerated `## Older versions imported` and `## D-09 measured need` rows, each stamped `(re-measured 2026-10-31, wired bridge)`.

## Commits
- dfc39e389: re-measure section and regenerated rows

## Task 1 (operator run)
Capture dir `/tmp/gamelib-58-17-20261031T062510Z` (outside the repo; contains no committed data). The run was split into A (Mac hosts) and B (PC hosts, invites the Mac account). B did not work end to end. Operator reports: game launched, reached main menu, Continue; "wrong platform" error when clicking the Steam link with the game not running (Mac Steam handled it, no Mac build); with the game running, clicking the link did nothing.

## Key findings
- 333 arrived at the helper once (session 3, `callresult=0`) and was dropped as `CBQ unlisted`. 337 never appeared.
- Runtime NOVER: none. STUBCALLs unchanged: `SteamUtils010.GetImageSize`, `SteamFriends017.GetMediumFriendAvatar`, `SteamFriends017.ActivateGameOverlayInviteDialog`, `SteamClient021.SetWarningMessageHook`.
- Newly wired calls seen: `SendLobbyChatMsg`, `GetLobbyChatEntry`, `SteamNetworkingUtils004.CheckPingDataUpToDate`. No Sockets, Networking, Messages, MatchMakingServers or GameServer call in any session.
- Older versions: MatchMakingServers002 and NetworkingSockets012 remain `source: static` only; none runtime.
- D-09 rows: Friends invite overlay measured (rich presence not-observed); 333 measured; 337, MMServers, GameServer not-observed; ManualDispatch informational.
- Orchestrator-observed, not operator-reported: the FishNet listen server went "Starting" then "Stopped" (transport index 1) right after lobby creation, then managed NullReferenceExceptions in PauseMenu (process not crashed).

## Downstream coverage
- 333 drop: covered by 58-18 (relay row for 333 when measured; it now is).
- ActivateGameOverlayInviteDialog stub: covered by 58-18.
- Listen-server Start then Stop: NOT covered by 58-18..58-21; 58-22 only exercises the title. Recommendation (not created): add a todo/gap to diagnose why the FishNet transport stops, since the helper log shows no Sockets/Networking call to explain it. Frame it before 58-22 so the TCP-mode gate is not the first place it surfaces.

## Deviations from Plan
None for the task content. The plan said "after the last HELLO"; the log has three sessions, so the union was recorded as the orchestrator instructed.

## Cleanup request
T-58-68: the operator should delete `/tmp/gamelib-58-17-20261031T062510Z` after 58-18. The bottle Player.log was not copied and contains lobby ids.

## Self-Check: PASSED
58-01-TITLES.md contains the new sections, `Verdict: PROCEED` unchanged, no SteamID64; commit dfc39e389 exists.
