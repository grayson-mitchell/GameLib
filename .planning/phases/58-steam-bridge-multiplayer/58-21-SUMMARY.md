---
phase: 58-steam-bridge-multiplayer
plan: 21
subsystem: steam-bridge
tags: [matchmaking-servers, server-browser, shim-relay, control-slot-12]
requires: [58-20]
provides:
  - "Shim response map (64) and slot-12 dispatch (gl_mms_drain) in the generated callback registry"
  - "Eleven MMServers003 request methods wired shim-locally onto the 58-20 helper customs"
  - "SteamMatchMakingServers003 served as wire on x64"
affects: [58-22, 58-23]
requirements-completed: [M-03]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/extractProtonInventory.ts
    - meta/sdk/wire-policy.json
    - meta/sdk/isteammatchmakingservers003.manifest.json
    - meta/__tests__/gen_vtables.test.ts
    - meta/__tests__/callbackRegistryHost.test.ts
    - meta/__tests__/fixtures/callback_registry_harness.c
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/bridge_dispatch.h
metrics:
  completed: 2026-10-31
  tasks: 2
---

# Phase 58 Plan 21: MMServers003 shim relay and wire flip Summary

Branch taken: D-07 baseline, unconditional (precondition `Verdict: PROCEED` held). The regenerated 58-01 row `ISteamMatchmakingServers request methods` is `not-observed` (no CALL/STUBCALL naming MMServers), so MMServers002 outcome: **not measured, stub**. Its manifest and shimCoverage entry are untouched and it was not re-extracted.

## Commits

- 34ee36ab1 feat(58-21): shim server-browser response map and slot-12 dispatch
- c683b8fc8 feat(58-21): wire MMServers003 request methods and serve it as wire

## What was built

Task 1 (generated registry, x64 only via `#if !defined(__i386__)`):
- `gl_mms_*` block: 64-entry table of {class list|query, key, full handle, game object, 380-byte details slot}. List handles key on the low 32 bits (matches the helper's wire value), queries on the int32 HServerQuery. A slot is reserved before the helper is called, so a full table refuses locally (returns 0 / -1) and never leaks a helper handle; a bad or zero helper reply frees the reservation.
- `gl_mms_drain` pulls slot 12 (max `GL_CB_DRAIN_MAX_PER_RUN`), validates count, kind 1-12, exact per-kind `cub` and total length before any copy, then `gl_mms_deliver` copies strings and the item to shim-owned stack buffers, resolves the object under the lock, and calls the vtable slot outside it. Slot-12 failures back off on their own counter; the drain is skipped when the table is empty (no extra transport traffic for non-browser games). Called from `gl_cb_run_callbacks` and `gl_md_run_frame` after the call-result pull (shared 30 ms floor), and therefore also from the Sockets RunCallbacks body.
- Terminal events (ping responded/failed, players failed/complete, rules failed/complete, friends) retire the query mapping; list mappings live until ReleaseRequest. A concurrent unmap from another thread waits while that object is being delivered to; a handler unmapping itself does not.
- `BRIDGE_CONTROL_SLOT_DRAIN_SERVER_EVENTS 12` with `gl_cb_transport_drain_mms` and `gl_mms_transport` (ordinal 69) embedder hooks.
- Eight host-harness cases: the six required (`mms_list_dispatch`, `mms_rules_strings`, `mms_unknown_handle_dropped`, `mms_release_unmaps`, `mms_details_slot`, `mms_capacity`) plus `mms_ping_terminal` and `mms_malformed_ignored`.

Task 2:
- wire-policy `SteamMatchmakingServers` now holds 18 methods (7 handle + 11 request), all `wire`. Request/Details/Ping/Players/Rules/Friends are `shimLocal` with the matching `gl_mms_*` helperCustom; `returns` and param names/types supplied by policy since Proton has no `__thiscall` body for slots 0-8.
- New method field `unmapHandle: 'list'|'query'` (requires `zeroHandleParam`, validated): the generated stub drops the mapping before the zero guard and wire call. Set on ReleaseRequest (list) and CancelServerQuery (query).
- Re-extracted 003 with `--proton-ref 164e0ccd...` (the bare command fails: the default proton_9.0 ref lacks the 003 block).
- shimCoverage SHIM64 `SteamMatchMakingServers003` is now `mode: 'wire'` (comment records the D-07 unconditional baseline).

## Deviations from Plan

1. **[Rule 2 - safety] ServerFriends (kind 12) does not call a game slot.** The callback shape is unmeasured; calling a game vtable slot with only `this` would read garbage argument registers. The event is received and validated, then retires the query. Revisit if a title ever uses ServerFriends.
2. **[Rule 3] Request filters are sent as the helper's fixed 256-byte key/value slots**, not "length-prefixed strings" as the plan text says. The 58-20 helper function fixed that encoding (exact length), so the shim matches it; each string is bounded-copied and force-terminated.
3. **[Rule 3] `unmapHandle`** is an addition needed because ReleaseRequest and CancelServerQuery are generated wire stubs, not shim-local bodies.
4. GetServerDetails returns one details slot per request (per plan), so a game holding pointers for several servers of the same request sees the latest contents.

## Verification

- `pnpm gen-vtables && pnpm build-steam-bridge`: x86 and x64 compile gates PASSED
- jest: callbackRegistryHost (57), gen_vtables, shimAbiGate, shimCoverage, and the whole `src/backend/storeManagers/steam/bridge` directory: 37 suites green
- `pnpm codecheck` clean; scoped `prettier --check` clean on TS/JSON paths
- The four pre-existing unrelated failures from the wide run (genI18nGateScope, i18nCatalogChurnGuard, steamclientLayerNotice, findDeadcode) were not touched or re-run.

## Notes for 58-22 / 58-23

- Unverified live: ManualDispatch RunFrame actually delivering server-browser response callbacks on Mac Steam; no title exercises MMServers (58-17 not observed). Nothing in this plan has a live-game proof; only the host harness and compile gates.
- `HServerQuery` value 0 is treated as a valid handle by the shim; the 58-20 `zeroHandleParam` on CancelServerQuery will short-circuit a real handle 0 (carried from 58-20, untouched).
- 64-bit shim only; x86 gets neither the table nor slot 12.

## Known Stubs

None added. MMServers002 stays a stub by design (not measured).

## Self-Check: PASSED
