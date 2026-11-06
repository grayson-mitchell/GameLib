---
phase: 58-steam-bridge-multiplayer
plan: 20
subsystem: steam-bridge
tags: [matchmaking-servers, server-browser, helper-relay, control-slot-12]
requires: [58-19]
provides:
  - "SteamMatchMakingServers003 handle methods wired (7) with a zero-handle guard"
  - "Helper response objects, 64-entry event ring, CONTROL slot 12 drainServerEvents"
  - "gl_mms_* custom request functions (list, ping, players, rules, friends, get_server_details)"
affects: [58-21]
requirements-completed: [M-03]
key-files:
  modified:
    - meta/sdk/wire-policy.json
    - meta/sdk/isteammatchmakingservers003.manifest.json
    - meta/gen_vtables.ts
    - meta/extractProtonInventory.ts
    - native/steam-bridge/helper/bridge_helper.c
    - native/steam-bridge/helper/gamelib_callresult.h
    - src/backend/storeManagers/steam/bridge/protocol.ts
metrics:
  completed: 2026-10-31
  tasks: 2
---

# Phase 58 Plan 20: MMServers003 baseline and helper relay Summary

Branch taken: D-07 baseline, unconditional. 58-17 measured MMServers as not observed for Schedule I, but the plan builds the 003 server browser regardless (D-07); the measured row only decides MMServers002, which stays with 58-21. Precondition held (`Verdict: PROCEED`). Slot 13 stays unassigned (58-19: SteamGameServer not wired).

## Commits

- c4df2f5a3 feat(58-20): wire SteamMatchMakingServers003 handle methods with a zero-handle guard
- 8ebdf786c feat(58-20): helper server-browser response relay, event ring and CONTROL slot 12

## What was built

Task 1: wire-policy block `SteamMatchmakingServers` for ReleaseRequest, CancelQuery, RefreshQuery, IsRefreshing, GetServerCount, RefreshServer, CancelServerQuery (flat names confirmed with `nm -gU` on the Mac `libsteam_api.dylib`). New method-level `zeroHandleParam`: the generated shim returns locally (void / 0) before any pack or transact when the handle is 0 (golden test). Re-extraction of 003 from `164e0ccd` reproduced the stub manifest exactly. Proton has no `__thiscall` body for slots 0-8, so the handle params are retyped by policy to `uint64` (a Mac HServerListRequest is a 64-bit pointer; `uint32` would truncate it). A policy `stackBytes` override keeps the wire cross-check consistent with the retyped widths. 003 stays manifest-level `stub`; PingServer, PlayerDetails, ServerRules, ServerFriends, GetServerDetails and the six Request*ServerList slots are untouched for 58-21.

Task 2 (TDD harness cases, all green): bounded event ring (64, oldest zeroed on eviction, pop zeroes the slot, small cap keeps the entry), string events refused above 255 chars, gameserveritem_t repack by field map pinned to `CALLBACK_LAYOUTS.gameserveritem_t` (x64 and mac are both 380 bytes with identical offsets; every string field forced NUL-terminated), CONTROL slot 12 (HELLO-gated, argLen 0, `[u32 0]` when idle, never sleeps or logs), `protocol.ts` `drainServerEvents: 12`, unknown-slot probe moved to 14.

## Event-kind table for 58-21

Slot 12 reply: `[u32 count 0|1]` then if 1 `[u8 kind][u32 hRequest][i32 iServer][i32 value][u32 cub][cub bytes]`. Max reply 533 bytes (`GL_MMS_DRAIN_RESP_MAX_BYTES`).

| kind | source callback | game vtable slot | iServer | value | payload |
|---|---|---|---|---|---|
| 1 | ServerListResponse::ServerResponded | 0 | iServer | 0 | none |
| 2 | ServerListResponse::ServerFailedToRespond | 1 | iServer | 0 | none |
| 3 | ServerListResponse::RefreshComplete | 2 | 0 | EMatchMakingServerResponse | none |
| 4 | PingResponse::ServerResponded | 0 | 0 | 0 | 380-byte gameserveritem_t (x64 layout) |
| 5 | PingResponse::ServerFailedToRespond | 1 | 0 | 0 | none |
| 6 | PlayersResponse::AddPlayerToList | 0 | float bits of flTimePlayed | nScore | name NUL |
| 7 | PlayersResponse::PlayersFailedToRespond | 1 | 0 | 0 | none |
| 8 | PlayersResponse::PlayersRefreshComplete | 2 | 0 | 0 | none |
| 9 | RulesResponse::RulesResponded | 0 | 0 | 0 | rule NUL value NUL |
| 10 | RulesResponse::RulesFailedToRespond | 1 | 0 | 0 | none |
| 11 | RulesResponse::RulesRefreshComplete | 2 | 0 | 0 | none |
| 12 | ServerFriends response (shape unmeasured) | value | 0 | vtable slot Mac called (0-3) | none |

`hRequest`: kinds 1-3 carry the low 32 bits of the Mac HServerListRequest (the helper refuses to issue a handle whose low 32 bits collide with another live one); kinds 4-12 carry the HServerQuery (int32 as u32). Ping/players/rules/friends callbacks have no handle in Mac Steam's signature, so each query takes one object from a pool of 8 per interface and the event carries the handle that object was bound to.

Custom request encodings (all exact length, integers and 256-byte string slots only):
- `gl_mms_request_list`: `[u32 variant 0..5 = Internet,LAN,Friends,Favorites,History,Spectator][u32 appId][u32 nFilters<=32]` + nFilters x `[256 key][256 value]` -> `[u64 Mac handle]` (LAN: no filters)
- `gl_mms_ping_server` / `gl_mms_player_details` / `gl_mms_server_rules` / `gl_mms_server_friends`: `[u32 ip][u32 port<=65535]` -> `[i32 HServerQuery]` (-1 invalid)
- `gl_mms_get_server_details`: `[u64 hRequest][i32 iServer]` -> `[u32 present][380 bytes]`; handle must be one the helper issued and iServer inside `GetServerCount`

## Deviations from Plan

None that change scope. Notes:

- Policy `stackBytes` override, `zeroHandleParam` and the pool of response objects are additions needed to satisfy the plan's own truths (a 0 handle answered locally; per-query event handles) without truncating 64-bit handles. No new table or service layer.
- The `hRequest` on the wire is u32 as specified; for list handles it is the low 32 bits. 58-21 must key its handle map on that value for kinds 1-3.

## Assumptions for 58-21 / live verification

- ManualDispatch `RunFrame` is assumed to deliver server-list/ping/players/rules response callbacks; slot 12 pumps it exactly as slot 11 does. Unverified against live Mac Steam (no title exercises MMServers; 58-17 measured not observed).
- ServerFriends response callback shape is not measured; kind 12 records only which of four vtable slots fired.
- Re-running `extract-proton-inventory` for SteamMatchMakingServers002 would apply this family policy to 002 (its acceptance entry has no `helperInterface`, so the older-version demotion does not apply). 002 is a 58-21 decision; do not bulk re-extract before then.

## Verification

- `pnpm gen-vtables && pnpm build-steam-bridge`: helper, x86 and x64 shim compile gates PASSED
- jest: cbqueue (incl. 12 new mms cases + gsi pin), protocol, helperIntegration, gen_vtables (4 new zeroHandleParam tests), shimAbiGate green; `pnpm codecheck` clean; scoped `prettier --check` clean on TS/JSON paths
- Full `jest src/backend/storeManagers/steam/bridge meta`: 4 pre-existing failures unrelated to this plan (genI18nGateScope, i18nCatalogChurnGuard on a working-tree gamepage.json edit, steamclientLayerNotice `-p58b` asset, findDeadcode flagging `src/preload/api/tauriNativeGamepad.ts isSameDevice`)

## Deferred (out of scope)

- `bridge_helper.c:1070` `const int iface = which == 2 ? GL_NET_IFACE_MESSAGES : iface;` is self-initialised (clang -Wuninitialized, pre-existing from an earlier plan)

## Known Stubs

None added. PingServer, PlayerDetails, ServerRules, ServerFriends, GetServerDetails and Request*ServerList remain manifest stubs by design until 58-21.

## Self-Check: PASSED
