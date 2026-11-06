---
phase: 58-steam-bridge-multiplayer
plan: 18
subsystem: steam-bridge
tags: [steam-bridge, interface-versions, callbacks, friends]
requires: [58-17]
provides:
  - SteamNetworkingSockets012 served (x64, own Proton block)
  - GameLobbyJoinRequested_t (333) relay to the game
  - SteamFriends017.ActivateGameOverlayInviteDialog wired
key-files:
  created: [meta/sdk/isteamnetworkingsockets012.manifest.json, meta/signatureEquality.ts]
  modified: [meta/gen_vtables.ts, meta/extractProtonInventory.ts, meta/sdk/wire-policy.json, meta/sdk/acceptance-interface-versions.json, meta/sdk/ordinals.json, meta/sdk/isteamfriends017.manifest.json, native/steam-bridge/helper/gamelib_cbqueue.h, src/backend/storeManagers/steam/bridge/shimCoverage.ts]
duration: 1h
completed: 2026-10-31
---

# Phase 58 Plan 18: Measured older versions and invite surface Summary

Applied only what 58-17 measured on the wired bridge: SteamNetworkingSockets012 as an own-block manifest, the 333 join-request relay, and the invite overlay method.

Commit: 0cdc658b1.

## Older versions imported (D-07)

- SteamNetworkingSockets012: new manifest from its own Proton block (pin 2c620c0f, ordinal 73, x64, title 3205720), helperInterface `SteamAPI_SteamNetworkingSockets_SteamAPI_v013`, flatAccessor `..._v012`. SHIM64 served `wire`. 29 of 48 methods wired.
- Unwired (stub) on 012: SendMessages (013 added a `bool` param, signature differs), ReceivedRelayAuthTicket, FindRelayAuthTicketForServer, ConnectToHostedDedicatedServer, GetHostedDedicatedServerPort, GetHostedDedicatedServerPOPID, GetHostedDedicatedServerAddress, CreateHostedDedicatedServerListenSocket, GetGameCoordinatorServerLogin, ConnectP2PCustomSignaling, ReceivedP2PCustomSignal, GetCertificateRequest, SetCertificate, BeginAsyncRequestFakeIP, GetFakeIP, CreateListenSocketP2PFakeIP, GetRemoteFakeIPForConnection, CreateFakeUDPPort, destructor. No 012 method was named in the runtime measurement (source: static).
- SteamMatchMakingServers002: handled by 58-21.
- Signature-equality check: `validateOlderVersionSignatures` in gen_vtables (names both versions) plus `demoteSignatureMismatches` in the extractor so re-extraction never yields a refused manifest. Scoped to the Phase 58 multiplayer families plus SteamFriends; earlier-phase older versions (SteamUser/UserStats/Client) intentionally hand-wired with helper-side arg handling are out of scope.

## D-09 rows

- ISteamFriends invite overlay: wired: SteamFriends017.ActivateGameOverlayInviteDialog (helperFlat SteamAPI_ISteamFriends_ActivateGameOverlayInviteDialog, nm-verified on Mac dylib).
- Rich presence: no change (not-observed).
- GameLobbyJoinRequested_t (333): wired: helper allowlist row (16/16 whole-struct copy) and CALLBACK_RELAY_TABLE row with hold true (fits 64-byte held slot).
- GameRichPresenceJoinRequested_t (337): no change (not-observed).
- ISteamMatchmakingServers: handled by 58-20 / 58-21.
- SteamGameServer*: handled by 58-19 (not-observed here, no change).
- ManualDispatch: informational, no change.

## Deviations

- [Rule 3] New dependency-free `meta/signatureEquality.ts`: importing gen_vtables from the extractor would execute the generator main() in the bundle.
- [Rule 3] wire-policy gained `pIdentity1/pIdentity2` overrides on CreateSocketPair (012 spells the names differently than 013's pPeerIdentity1/2; same types).
- SteamFriends017 manifest edited by hand (one method) instead of re-extracted: re-extraction dropped the earlier hand-wired GetFriendPersonaName. SteamFriends018 untouched (not imported by this title).
- Actual manifest file for 018 is isteamfriends.manifest.json (plan named isteamfriends018); not changed.

## Verification

- jest: gen_vtables, extractProtonInventory, callbackRegistryHost, shimAbiGate, cbqueue, shimCoverage: 623 passed.
- `pnpm gen-vtables && pnpm build-steam-bridge`: exit 0 (helper arm64, x86 and x64 shim compile gates passed).
- `pnpm codecheck` clean; prettier clean on all TS/JSON paths.
- Not live-tested: the 333 relay and the invite dialog need a live Mac run with the peer (not exercised here). The FishNet listen-server failure is tracked separately and not in scope.

## Self-Check: PASSED
