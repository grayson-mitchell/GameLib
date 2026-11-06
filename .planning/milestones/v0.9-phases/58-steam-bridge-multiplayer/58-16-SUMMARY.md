---
phase: 58-steam-bridge-multiplayer
plan: 16
subsystem: steam-bridge
tags: [steam, networking, messages, out-messages, carry-queue, helperCustom]
requires: [58-14, 58-15]
provides:
  - "SteamNetworkingMessages002 served as wire on x64 (all six virtuals)"
  - "Helper: channel receive on the shared carry queue (key kind 2), session info with path evidence"
affects: [58-17, shimCoverage served tables]
key-files:
  modified:
    - meta/sdk/wire-policy.json
    - meta/sdk/isteamnetworkingmessages002.manifest.json
    - native/steam-bridge/helper/bridge_helper.c
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/bridge_dispatch.h
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - meta/__tests__/gen_vtables.test.ts
decisions:
  - "ReceiveMessagesOnChannel uses helperCustom gl_net_receive_messages_ch (same split as the _pg variant: a custom cannot see its slot). It calls gl_nets_receive with which=2, so the carry queue key is distinct and evidence and oversize lines say iface=Messages."
  - "GetSessionConnectionInfo uses helperCustom gl_net_session_info (two out-structs plus a path log, which evidence cannot combine with helperCustom); request is [u8 present][136 identity], a missing identity is STATUS_ERR."
  - "No helper auto-accept: AcceptSessionWithUser is a plain forwarded call made only when the game calls it."
metrics:
  tasks: 2
  completed: 2026-10-31
---

# Phase 58 Plan 16: ISteamNetworkingMessages 002 wiring Summary

SteamNetworkingMessages002 is served as wire on x64: send, channel receive, accept, close session, close channel and session connection info cross the bridge, reusing the 58-15 out-messages kind and bounded carry queue.

## Commits
- 81d9130b4: wire policy (6 entries), manifest re-extraction, channel receive and session info helpers, regenerated shim and dispatch header, tests
- the second feat(58-16) commit: served table flip to `wire` and coverage test

## What was built
- **Policy.** Identity params are `in-struct` 136; SendMessageToUser has `in-buffer` pubData with evidence send/Messages; ReceiveMessagesOnChannel is `out-messages` with `countParam nMaxMessages` and int32 return; Close/Accept calls forward plainly.
- **Helper.** `gl_nets_receive` gained which=2 (Messages channel, `SteamAPI_ISteamNetworkingMessages_ReceiveMessagesOnChannel`). Its evidence iface and the drop-oldest oversize line follow the key kind. The fail-closed oversize rule, 64-message batch and 61440-byte response bound are unchanged. `gl_net_session_info` logs `kind=path` (once per direct/relayed) from `m_nFlags & 16` under iface=Messages. No identity or payload is ever logged.
- **M-04.** The 1251 SessionRequest callback already routes through the existing callback machinery; the helper never calls AcceptSessionWithUser (pinned by a source test).

## Deviations from Plan
1. **[Interpretation]** Receive helper named `gl_net_receive_messages_ch` rather than `gl_net_receive_messages` (see decisions). The key_link pattern still matches by prefix.
2. **[Rule 1]** Existing 58-15 source pin and two gen_vtables tests (prototype list, "plain" manifest filter) updated for the new helper names and the Messages interface now using extended kinds.
3. `steam_api64.def` and `shimExports.generated.ts` did not change (no new exports), so SHIM_EXPORT_SET_VERSION is unchanged from 58-15.

## Verification
- `pnpm gen-vtables && pnpm build-steam-bridge`: exit 0 (arm64 helper, x86 and x64 compile gates passed).
- jest: all 34 suites under steam/bridge, gen_vtables, shimAbiGate green; `pnpm codecheck` and prettier clean. In `meta`, only the known steamclientLayerNotice and i18nCatalogChurnGuard failures.
- Not done: the acceptance check that each helperFlat appears in the Mac dylib's `nm` output could not run; no libsteam_api.dylib is present in this tree. Symbols resolve via dlsym at runtime and a missing one fails closed (STATUS_ERR).

## Known gaps
- Not exercised against a live Steam or a title; the integration case proves STATUS_ERR handling without a session and the rest are source pins.
- A game passing a NULL identity reaches the Mac library as NULL on the plain forwarded methods (the generic in-struct behaviour, as with CreateSocketPair).

## Threat model
T-58-52 mitigated (shared bounded queue and per-record checks). T-58-53 mitigated (no helper accept). T-58-54 mitigated (NET lines carry counts only).

## Self-Check: PASSED
