---
phase: 58-steam-bridge-multiplayer
plan: 13
subsystem: steam-bridge
tags: [steam, networking, p2p, wire-policy, helperCustom, bridge_helper]
requires: [58-06, 58-07, 58-10, 58-12]
provides:
  - "SteamNetworking006 (18 of 22 methods) wired to real Mac SteamAPI_ISteamNetworking_* exports"
  - "gl_net_read_p2p_packet: fail-closed ReadP2PPacket"
  - "gl_net_get_p2p_session_state: relay/direct NET path observation"
  - "1202 fallback accept (helper-originated)"
affects: [shimCoverage served tables, bridge_dispatch.h, steam_api_shim.c]
key-files:
  modified:
    - meta/sdk/wire-policy.json
    - meta/sdk/isteamnetworking006.manifest.json
    - native/steam-bridge/helper/bridge_helper.c
    - native/steam-bridge/generated/bridge_dispatch.h
    - native/steam-bridge/generated/steam_api_shim.c
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
    - meta/__tests__/gen_vtables.test.ts
decisions:
  - "GetP2PSessionState is a second helperCustom (gl_net_get_p2p_session_state) so the helper can read m_bUsingRelay without a generator change"
  - "ReadP2PPacket limit is min(cubDest, capacity, 61440, respCap-20); with the 61456-byte dispatch scratch the effective ceiling is 61436, so packets of 61437..61440 bytes are refused as oversize rather than truncated"
  - "Dispatch scratch is now zeroed after every send_response (not only P2P) so packet bytes and SteamIDs never linger"
metrics:
  tasks: 2 (+ pre-task)
  completed: 2026-10-31
---

# Phase 58 Plan 13: SteamNetworking006 wire Summary

Legacy ISteamNetworking 006 P2P now crosses to real Mac Steam on x64, with fail-closed packet reads, NET send/recv/oversize/path evidence, and a helper-side accept fallback for unattended 1202 session requests. Every `SteamAPI_ISteamNetworking_<Method>` name used was confirmed with `nm -gU` on the Steam Helper libsteam_api.dylib (all 22 exports present).

## Commits
- 16d58e308: pre-task fix (see Deviations)
- e21b19f48: wire policy, helper custom functions, fallback accept, regenerated shim and dispatch header, tests
- af3b222db: served-table flip (x64 only), shimCoverage test

## What was done
- wire-policy `SteamNetworking`: 18 entries. SendP2PPacket and SendDataOnSocket use `in-buffer`; ReadP2PPacket, RetrieveData and RetrieveDataFromSocket use 61440-byte capped `out-buffer`s plus out-values; the rest are plain value methods. SendP2PPacket carries `evidence {send, Networking}`.
- `gl_net_read_p2p_packet`: probes `IsP2PPacketAvailable` first, refuses oversize (logs `NET role=game kind=oversize iface=Networking`, returns false, leaves the packet queued), otherwise reads straight into the response and logs `kind=recv`.
- `gl_net_get_p2p_session_state`: forwards the real call, returns the 20-byte struct, logs `kind=path` (direct or relayed) once per value from `m_bUsingRelay` (offset 3).
- 1202 fallback: the pump remembers the latest P2PSessionRequest_t remote (helper-only, never logged); slot 10 with did 1202, ndispatched 0, held 0 calls `AcceptP2PSessionWithUser` once per remote (max 16 stored) and logs the fixed line `CBQ p2p-accept src=helper`.
- Stub (not wired), as listed in the plan: CreateListenSocket, CreateConnectionSocket, GetSocketInfo, GetListenSocketInfo (SteamIPAddress_t by value or pointer, unmeasured, D-09).
- Served table: x64 `SteamNetworking006` is `wire`; x86 has no 006 entry; `SteamNetworking005` stays `stub` (58-18 decides). `SHIM_EXPORT_SET_VERSION` is derived and moves with the mode.

## Deviations from Plan

**1. [Rule 1 - Bug] wireExtendedCompile.test.ts failing since 58-10** (pre-task, 16d58e308)
The generated dispatch header includes `gamelib_callresult.h` but the clang invocation lacked `-I native/steam-bridge/helper`. Added the include path; suite passes.

**2. [Rule 1 - Bug] find-deadcode flagged 18 `meta/msvcCallbackLayout.ts` exports** (pre-task, 16d58e308)
Plan said 7; the gate reported 11 unreachable plus 7 used-in-module. Five types with no other user (`CallbackLayoutName`, `MsvcCallbackLayout`, `MsvcTriple`, `StructLayout`, `UserStatsReceivedLayout`) lost `export`. The other 13 are consumed by `meta/gen_vtables.ts` or `meta/__tests__/msvcCallbackBaseLayout.test.ts` (measured data and parsers, not deletable) and now carry `// ts-prune-ignore-next` with a reason, per the repo mechanism. No baseline edits; gate reports 0 new findings.

**3. [Rule 3 - Blocking] GetP2PSessionState needed a helperCustom** (not in plan text)
The generic out-struct path cannot observe `m_bUsingRelay`, and changing `meta/gen_vtables.ts` was out of the plan's file list, so the path observation is a second helperCustom function. Request `[u64]`, response `[i32 ret][u8 present][20 bytes]`.

**4. Existing tests updated** for the new reality: three `gen_vtables.test.ts` pins (base-text-only, scratch size now 61456, and "real manifests declare no custom prototype" now pins exactly the two 58-13 prototypes).

## Known gaps / notes
- Live behaviour (a real send/recv, a real 1202) needs a signed-in Steam and a P2P title; the integration tests cover arg-decode bounds and source pins only (no session means every dispatch is STATUS_ERR). Not verified against a live peer.
- Generated dispatch cases for bool-returning flat calls read an `int` (pre-existing generator pattern); the new custom functions mask `& 0xff`.
- Pre-existing, ignorable failures unchanged: genI18nGateScope, i18nCatalogChurnGuard, steamclientLayerNotice NOTICE pin.

## Threat model
T-58-41 mitigated (size probe, bounded read, oversize refused and logged); T-58-42 mitigated (payload and SteamIDs never logged, scratch zeroed after send); T-58-43 accepted as planned.

## Self-Check: PASSED
Commits 16d58e308, e21b19f48, af3b222db exist; build gate (gen-vtables, build-steam-bridge, zig x86/x64 compile gates), codecheck, prettier on touched files, find-deadcode, and helperIntegration, gen_vtables, shimAbiGate, shimCoverage, bridgeRoute, wireExtendedCompile suites green.
