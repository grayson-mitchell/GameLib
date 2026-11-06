---
phase: 58-steam-bridge-multiplayer
plan: 15
subsystem: steam-bridge
tags: [steam, networking, sockets, out-messages, carry-queue, shimLocal, helperCustom]
requires: [58-06, 58-10, 58-13, 58-14]
provides:
  - "out-messages ParamKind (countParam): int32 count then bounded records, decoded into Windows-side pool messages"
  - "SteamNetworkingSockets013 served as wire on x64 (30 of 48 virtuals)"
  - "Helper: loss-free bounded receive with carry queue, option-filtered open, connection-info path evidence, real-time status and lane helpers"
affects: [58-16, 58-17, shimCoverage served tables]
key-files:
  created: []
  modified:
    - meta/gen_vtables.ts
    - meta/extractProtonInventory.ts
    - meta/sdk/wire-policy.json
    - meta/sdk/isteamnetworkingsockets013.manifest.json
    - native/steam-bridge/helper/bridge_helper.c
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/bridge_dispatch.h
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - meta/__tests__/fixtures/networking_local_harness.c
    - meta/__tests__/networkingLocalHost.test.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/__tests__/extractProtonInventory.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
decisions:
  - "out-messages response = the method's own int32 return (the count n) followed by n records; there is no second count. The kind sends nothing in the request; nMaxMessages is an ordinary by-value param."
  - "Two helperCustom names (gl_net_receive_messages for connections, gl_net_receive_messages_pg for poll groups) instead of a leading method byte, because the generic request carries no selector and a custom function cannot see its slot."
  - "A malformed record ends decoding but earlier complete records stay valid and are returned; only the failed record's allocation is freed. (Freeing the earlier ones while returning their count would hand the game dangling pointers.)"
  - "SendMessages honours the 013 thunk's 4th param bDeleteFailedMessages: a sent message is always released, a failed one only when the flag is set."
metrics:
  tasks: 3
  completed: 2026-10-31
---

# Phase 58 Plan 15: ISteamNetworkingSockets 013 wiring Summary

SteamNetworkingSockets013 is served as wire on x64: connect, listen, accept, close, send, receive, connection info, status, lanes, identity, authentication, poll groups and ResetIdentity cross the bridge, with game-owned received messages and a bounded loss-free helper receive path.

## Commits
- 7c0deed8e: out-messages kind, shim-local Sockets block (decode, option filter, status, lanes), host harness cases
- 24142ab7e: helper carry queue, option-filtered open, connection info path, status and lane helpers, source pins, STATUS_ERR integration case
- 340ce0617: wire policy, manifest re-extraction at 164e0ccd, served flip to `wire`, policy and coverage tests

## What was built
- **out-messages kind.** Validated (type `SteamNetworkingMessage_t**`, integer `countParam`, int32 return, requires `helperCustom`). Record: `{u32 cbSize, u32 conn, u8 identity[136], i64 connUserData, i64 usecTimeReceived, i64 messageNumber, i32 channel, i32 flags, u16 lane, u16 pad, payload}` (180-byte header). `gl_net_decode_messages` checks every length against the remaining frame bytes before allocating, rejects a count above the game's `nMaxMessages` (nothing allocated), allocates each message with `gl_msg_alloc` (m_pfnRelease set), and writes the pointers into the game's array. Documented in WIRE_LAYOUT_DOC; `countParam` joins the wire-table hash key.
- **Helper receive.** `gl_nets_receive` takes at most `min(nMaxMessages, 64)` Mac messages, copies each into a record and Releases it in the same call. Records that do not fit in 61440 bytes go to a per-handle carry queue (256 records, 32 handles, plus a 1 MiB per-handle byte bound I added) that holds malloc'd copies only and is drained first on the next call, preserving order. A single message too big for any response is dropped with `NET role=game kind=oversize iface=Sockets`; an overflowing queue drops the oldest with the same line. A reply with n > 0 logs `kind=recv iface=Sockets`.
- **Open calls.** `gl_net_open` (shim) walks the game's options: Ptr entries and Callback_* ids are bound in the 58-14 config store (scope LISTEN or CONNECTION) to the returned handle and never sent; int/float/int64 and string options (string bytes read in-process) are forwarded; a callback id with a non-Ptr type, an unknown type, a NULL string, more than 32 options or a request over 8 KiB fails the call (handle 0). If binding fails (store full) the new handle is closed and 0 returned. `gl_net_sockets_open` (helper) refuses type 5 and ids 201-207 again and length-checks every kept option before reading it.
- **Other helpers.** `gl_net_get_connection_info` (logs `kind=path` once per direct/relayed from `m_nFlags & 16`), `gl_net_rt_status` (status plus count-bound lane array) and `gl_net_configure_lanes` (exact-length, 1..255 lanes).
- **Shim-local bodies.** SendMessages sends each message through the wired SendMessageToConnection, writes each result (message number, or negative EResult) into `pOutMessageNumberOrResult`, and releases messages as above. RunCallbacks runs `gl_cb_run_callbacks()` then `gl_md_run_frame()`; each is gated on `gl_md_enabled` in opposite senses, so nothing is consumed twice.
- **Generator.** Versioned struct names with a letter suffix (`SteamNetConnectionInfo_t_153a`) now resolve to the measured layout. The overlay copies `countParam`.

## Sockets013 methods that stay stubs (D-09 / D-10)
18 of 48 stay `mode: stub`, with no policy entry and no helper case:
- Dedicated-server (D-10): ReceivedRelayAuthTicket, FindRelayAuthTicketForServer, ConnectToHostedDedicatedServer, GetHostedDedicatedServerPort, GetHostedDedicatedServerPOPID, GetHostedDedicatedServerAddress, CreateHostedDedicatedServerListenSocket, GetGameCoordinatorServerLogin.
- Custom signaling (the Windows side hands over C++ function-pointer objects): ConnectP2PCustomSignaling, ReceivedP2PCustomSignal.
- Certificates (not applicable to a Steam-authenticated client): GetCertificateRequest, SetCertificate.
- FakeIP (no consumer in the target titles; D-09): BeginAsyncRequestFakeIP, GetFakeIP, CreateListenSocketP2PFakeIP, GetRemoteFakeIPForConnection, CreateFakeUDPPort.
- destructor (never called by a game).

## Deviations from Plan

**1. [Interpretation] Two receive helper names instead of a method byte.** The plan says one `gl_net_receive_messages` selects connection or poll group "by a leading method byte". A helperCustom receives only `(self, args, ...)` and the generic request has no selector, so the poll-group method is `gl_net_receive_messages_pg`; both share `gl_nets_receive`. `grep -c gl_net_receive_messages` on `bridge_dispatch.h` still matches both.

**2. [Interpretation] Lying-size behaviour.** The plan's behaviour reads "stops decoding, frees already-built messages, and returns the count built before it". Those cannot both hold without returning dangling pointers, so earlier complete records stay valid and are returned; the failed record frees its own allocation. The harness test asserts count 1, no allocation for the bad record, and live count back to the start after release.

**3. [Rule 3 - Blocking] `SendMessages` has a fourth param.** Proton's 013 thunk is `(nMessages, pMessages, pOut, bDeleteFailedMessages)` (stackBytes 16). Kept at four params so the retN check holds; the flag is honoured.

**4. [Rule 2 - Missing safety] Per-handle byte bound on the carry queue.** Records are up to 61440 bytes, so 256 x 32 alone allows hundreds of MB from a hostile peer; a 1 MiB per-handle bound was added (oldest dropped, logged).

**5. [Plan variance] Integration test answers STATUS_ERR, not `[u32 0]`.** With no Steam session every dispatch is STATUS_ERR (the same limitation as 58-13's ReadP2PPacket case), so the case proves bounds handling and that the helper keeps serving; the clamp itself is pinned in source.

**6. Generated `steam_api64.def` and `shimExports.generated.ts` did not change** (no new exports); listed in the plan only as possible touch points.

## Verification
- `pnpm gen-vtables && pnpm build-steam-bridge`: exit 0 (arm64 helper, x86 and x64 compile gates PASSED).
- jest: gen_vtables, shimAbiGate, networkingLocalHost (7 new host cases), bridgeCensus, wireExtendedCompile, extractProtonInventory and all of `src/backend/storeManagers/steam/bridge` green (40 suites). `pnpm codecheck`, `pnpm find-deadcode` and prettier clean.
- Known unrelated failures only: steamclientLayerNotice pins and i18nCatalogChurnGuard live tree.

## Known gaps / notes
- Not verified against a live Steam or a Unity/UE title: the shim C is proven on the host; helper functions are compile- and source-pin-checked only.
- A callback bound after the handle returns can be missed if the status callback fires on another thread before binding completes.
- `m_idxLane` of a message passed to SendMessages is ignored (all sends use lane 0 through SendMessageToConnection).
- Carry-queue state assumes the single dispatch thread, as in 58-13.

## Threat model
T-58-48 mitigated (every record length checked before allocation; count checked against nMaxMessages; malformed record ends decoding). T-58-49 mitigated (256 x 32 queue plus byte bound, oldest dropped with an oversize line, batch capped at 64). T-58-50 mitigated (Ptr and Callback_* options filtered shim-side, refused again helper-side). T-58-51 mitigated (Mac messages Released in-call, queue holds copies, no payload or identity logged; NET lines carry integers only).

## Self-Check: PASSED
Commits 7c0deed8e, 24142ab7e, 340ce0617 exist; manifest and wire policy updated; generated files regenerate byte-identically (committed-files test green).
