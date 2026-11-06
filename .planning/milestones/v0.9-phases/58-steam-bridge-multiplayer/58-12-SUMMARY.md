---
phase: 58-steam-bridge-multiplayer
plan: 12
subsystem: steam-bridge
tags: [steam, matchmaking, lobbies, wire-policy, gen_vtables, shim]
requires: [58-06, 58-07, 58-10, 58-11]
provides:
  - "SteamMatchMaking009 (38 methods) wired to real Mac SteamAPI_ISteamMatchmaking_* exports"
  - "uint16 out-value valueType"
  - "multi out-buffer helper dispatch (per-buffer capBytes)"
affects: [shimCoverage served tables, bridge_dispatch.h, steam_api_shim.c]
tech-stack:
  patterns: ["wire-policy overlay applied by extract-proton-inventory", "callResult 513/504/510 via gl_helper_cr_track"]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/extractProtonInventory.ts
    - meta/sdk/wire-policy.json
    - meta/sdk/isteammatchmaking009.manifest.json
    - native/steam-bridge/generated/bridge_dispatch.h
    - native/steam-bridge/generated/steam_api_shim.c
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/__tests__/extractProtonInventory.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
decisions:
  - "GetLobbyDataByIndex's two out-buffers use capBytes 256 (key) and 8192 (value); generator extended to allow several out-buffers only when each has a capBytes"
  - "extract-proton-inventory now preserves helperInterface/flatAccessor/flatAccessorAliases from the existing manifest (fixes the 58-11 gotcha)"
metrics:
  tasks: 2
  completed: 2026-10-31
---

# Phase 58 Plan 12: SteamMatchMaking009 wire Summary

All 38 ISteamMatchmaking 009 methods now cross to real Mac Steam (every `SteamAPI_ISteamMatchmaking_<Method>` name confirmed with `nm -gU` on the Steam Helper libsteam_api.dylib), and both served tables mark SteamMatchMaking009 `wire`.

## Commits
- 6b0355d3c: wire-policy block, uint16 out-value, multi out-buffer dispatch, regenerated shim and dispatch header
- d7145d95a: served-table flip, D-13 tests, test updates

## What was done
- `uint16` valueType: 2 bytes on the wire, `uint16_t` in the helper local and in the game pointer; `uint16_t*` and `CSteamID*` shim pointer types mapped (previously fell to `void *`).
- Call results: CreateLobby 513, JoinLobby 504, RequestLobbyList 510 emit `gl_helper_cr_track`.
- SendLobbyChatMsg body is `in-buffer`; GetLobbyChatEntry data is a 4096-byte capped out-buffer; all `const char*` params are `in-string`.
- D-13: no frontend change; notice copy untouched. SteamMatchMaking009-only scans report no stubbed family; SteamNetworking005 still does. x86 wired but not live-verified (D-11).
- SHIM_EXPORT_SET_VERSION changes with served mode (pinned by test).

## Deviations from Plan

**1. [Rule 3 - Blocking] Helper dispatch supported only one out-buffer**
GetLobbyDataByIndex has two. Extended `generateDispatchHeader` (assertDispatchable, response encode with a running, respCap-checked offset, scratch sizing) to allow several out-buffers when each declares `capBytes`. Single-buffer output is byte-identical. Dispatch scratch is now 8460 bytes.

**2. [Rule 1 - Bug] Extractor dropped helperInterface/flatAccessor/flatAccessorAliases**
Plan allowed fixing the extractor; added `preserveAccessorFields` plus a test.

**3. Plan verify grep named `gl_cr_track`; the emitted symbol is `gl_helper_cr_track`.** Verified with the real name (3 matches).

**4. Existing tests updated** for the new reality: WR-04 locked-path test (large-response stubs call `bridge_transact_locked` with the lock held), WIRE_LAYOUT_DOC base-text test and scratch-size test (exclude MM009), XCOM and Hoard stubbed-family expectations (SteamMatchMaking no longer stubbed).

## Deferred / pre-existing failures (not caused by this plan)
- `meta/__tests__/wireExtendedCompile.test.ts` fails: generated header includes `gamelib_callresult.h` (since 58-10) but the test has no `-I native/steam-bridge/helper`.
- `meta/findDeadcode.cjs` flags 7 `meta/msvcCallbackLayout.ts` exports.
- Known ignorable: steamclientLayerCatalogue NOTICE pin, genI18nGateScope A-17, live-tree test.

## Self-Check: PASSED
Commits 6b0355d3c and d7145d95a exist; build gate (gen-vtables, build-steam-bridge, zig compile gates), codecheck, gen_vtables/shimAbiGate/extractProtonInventory/shimCoverage/bridgeRoute/SteamBridgeRouteNotice suites green.
