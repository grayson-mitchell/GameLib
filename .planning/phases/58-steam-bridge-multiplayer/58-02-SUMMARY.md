---
phase: 58-steam-bridge-multiplayer
plan: 02
subsystem: steam-bridge
tags: [abi, layout, msvc, pack, zig, callbacks]
requires: []
provides:
  - "CALLBACK_LAYOUTS: measured size and field offsets for 30 structs x (x64, x86, mac)"
  - "parseCallbackLayoutsDump"
affects: [58-06, 58-07, 58-10, 58-11, 58-14, 58-15, 58-16]
tech-stack:
  added: []
  patterns: ["raw zig record-layout dump committed; table pinned two-arm (committed + live darwin)"]
key-files:
  created: []
  modified:
    - meta/__tests__/fixtures/steam_callback_structs.cpp
    - meta/__tests__/fixtures/steam_callback_structs.layout.txt
    - meta/msvcCallbackLayout.ts
    - meta/__tests__/msvcCallbackBaseLayout.test.ts
key-decisions:
  - "CSteamID in the fixture is pack(1) as steamclientpublic.h declares it; the legacy UserStatsReceived_t member is kept as CSteamIDLegacy so its pinned values do not move"
requirements-completed: [M-03]
duration: ~25min
completed: 2026-10-31
---

# Phase 58 Plan 02: Callback and message layout measurement Summary

Measured size and field offsets of 30 relayed or copied structs for x86_64-msvc, i686-msvc and arm64-macosx, committed as a raw zig dump, held in one `CALLBACK_LAYOUTS` table and pinned by a two-arm test (23 tests green, arm B ran live on darwin with no skip).

## Commits
- 648b4b49c test(58-02): fixture extended to 30 structs, raw three-triple dump
- 7ab15b436 feat(58-02): CALLBACK_LAYOUTS, parseCallbackLayoutsDump, tests

## Measured sizes (bytes)

| Struct | id | x64 | x86 | mac | mac differs from x64 |
|---|---|---|---|---|---|
| LobbyInvite_t | 503 | 24 | 24 | 24 | no |
| LobbyEnter_t | 504 | 24 | 24 | 20 | **yes** |
| LobbyDataUpdate_t | 505 | 24 | 24 | 20 | **yes** |
| LobbyChatUpdate_t | 506 | 32 | 32 | 28 | **yes** |
| LobbyChatMsg_t | 507 | 24 | 24 | 24 | no |
| LobbyMatchList_t | 510 | 4 | 4 | 4 | no |
| LobbyKicked_t | 512 | 24 | 24 | 20 | **yes** |
| LobbyCreated_t | 513 | 16 | 16 | 12 | **yes** |
| P2PSessionRequest_t | 1202 | 8 | 8 | 8 | no |
| P2PSessionConnectFail_t | 1203 | 9 | 9 | 9 | no |
| SteamNetConnectionStatusChangedCallback_t | 1221 | 712 | 712 | 704 | **yes** |
| SteamNetAuthenticationStatus_t | 1222 | 260 | 260 | 260 | no |
| SteamNetworkingMessagesSessionRequest_t | 1251 | 136 | 136 | 136 | no |
| SteamNetworkingMessagesSessionFailed_t | 1252 | 696 | 696 | 696 | no |
| SteamRelayNetworkStatus_t | 1281 | 272 | 272 | 272 | no |
| SteamAPICallCompleted_t | 703 | 16 | 16 | 16 | no |
| GameLobbyJoinRequested_t | 333 | 16 | 16 | 16 | no |
| GameRichPresenceJoinRequested_t | 337 | 264 | 264 | 264 | no |
| SteamNetworkingIdentity | - | 136 | 136 | 136 | no |
| SteamNetworkingIPAddr | - | 18 | 18 | 18 | no |
| SteamNetConnectionInfo_t | - | 696 | 696 | 696 | no |
| SteamNetConnectionRealTimeStatus_t | - | 120 | 120 | 120 | no |
| SteamNetConnectionRealTimeLaneStatus_t | - | 64 | 64 | 64 | no |
| P2PSessionState_t | - | 20 | 20 | 20 | no |
| SteamNetworkingMessage_t | - | 216 | **208** | 216 | no (x86 differs) |
| CallbackMsg_t | - | 24 | 16 | 20 | yes (never relayed) |
| SteamNetworkPingLocation_t | - | 512 | 512 | 512 | no |
| SteamNetworkingConfigValue_t | - | 16 | 16 | 16 | no |
| servernetadr_t | - | 8 | 8 | 8 | no |
| gameserveritem_t | - | 380 | 380 | 380 | no |

**Repack set for 58-07** (Mac wire form must be rewritten to MSVC pack 8): LobbyEnter_t, LobbyDataUpdate_t, LobbyChatUpdate_t, LobbyKicked_t, LobbyCreated_t, SteamNetConnectionStatusChangedCallback_t. All other relayed structs are byte-identical across mac and x64 and (except where noted) x86.

All 19 callback ids matched the plan list; no header disagreed.

## A3 settled
LobbyEnter_t 20/24, LobbyCreated_t 12/16, 1221 704/712, SteamNetworkingMessage_t 216 on mac and x64 but **208 on x86** (pointers). **Correction to RESEARCH:** P2PSessionConnectFail_t is 9 bytes on all three, not 12/16, because CSteamID is pack(1) (alignment 1) in the SDK. Also LobbyDataUpdate_t, LobbyChatUpdate_t and LobbyKicked_t differ and were not in the RESEARCH estimate.

## Deviations from Plan

**1. [Rule 2 - fidelity] CSteamID declared pack(1) for new structs.** steamclientpublic.h wraps CSteamID in `#pragma pack(push, 1)`; the existing fixture declared it under the callback pack. New structs (P2PSessionRequest_t, P2PSessionConnectFail_t, GameLobbyJoinRequested_t, GameRichPresenceJoinRequested_t, gameserveritem_t) use the faithful pack(1) class. The old class is kept as `CSteamIDLegacy`, used only by UserStatsReceived_t, so `USER_STATS_RECEIVED_LAYOUT` is unchanged as the plan required.

## Findings needing a decision (not fixed here)

**Pre-existing defect candidate in k51 stats wire form.** With the SDK-faithful pack(1) CSteamID, UserStatsReceived_t measures **size 24, m_steamIDUser at offset 12 on Windows** (x64 and x86; Mac size 20, offset 12). The committed `USER_STATS_RECEIVED_LAYOUT.x64/x86` says steamID at **16**, and `gamelib_cbqueue.h` `GL_CBQ_USR_WIN_OFF_STEAMID` pins 16. Proton's own generated assert agrees with 12 (`offsetof(UserStatsReceived_t_102x, m_steamIDUser) == 12`, pack 8, 4-byte pad after). So the helper likely writes the user SteamID 4 bytes too far for Windows games. Impact is limited to `m_steamIDUser` in the UserStatsReceived_t callback. Fixing it means changing the table, the two defines in `gamelib_cbqueue.h` and the helper repack; I left it alone because the plan said keep values and it touches native code. Suggest a follow-up task.

## Known Stubs
None.

## Self-Check: PASSED
- 648b4b49c and 7ab15b436 present in git log
- `pnpm exec jest meta/__tests__/msvcCallbackBaseLayout.test.ts`: 23 passed, arm B live on darwin
- `pnpm codecheck` exit 0; prettier check clean on the two TS files
- 30 `Type: struct` records present in all three dump sections; CALLBACK_LAYOUTS has 30 keys
