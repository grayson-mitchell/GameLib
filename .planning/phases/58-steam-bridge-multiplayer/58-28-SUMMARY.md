---
phase: 58-steam-bridge-multiplayer
plan: 28
subsystem: steam-bridge-helper
tags: [gap-closure, native, c, net-evidence, generator]
requires: [58-26, 58-27]
provides:
  - WR-06 segmented NET budgets (join never starved)
  - WR-08 eviction evidence and queue clear on CloseConnection/DestroyPollGroup
  - WR-09 60 s expiry on a held GameLobbyJoinRequested_t (333)
affects: [native/steam-bridge/helper/bridge_helper.c, meta/gen_vtables.ts, meta/sdk]
key-files:
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - meta/sdk/wire-policy.json
    - meta/sdk/isteamnetworkingsockets012.manifest.json
    - meta/sdk/isteamnetworkingsockets013.manifest.json
    - meta/gen_vtables.ts
    - native/steam-bridge/generated/bridge_dispatch.h
    - native/steam-bridge/generated/steam_api_shim.c
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c
    - src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/__tests__/callbackRegistryHost.test.ts
    - meta/__tests__/bridgeCensus.test.ts
    - meta/__tests__/fixtures/callback_registry_harness.c
decisions:
  - NET budgets are per process with no reset; per process equals per launch
  - CloseChannelWithUser queue clear deferred (Messages queues keyed by channel, not peer)
metrics:
  tasks: 3
  completed: 2026-11-01
---

# Phase 58 Plan 28: NET evidence reliability Summary

The NET evidence stream now has segmented budgets (join 16, each send/recv/oversize per-iface pair 8, path exempt), Sockets carry queues are cleared on close and evictions are logged, and a held 333 invite expires after 60 s.

## What changed

- **WR-06 (fd3fa0dec):** `gl_net_evidence` replaces the single 32-line cap with `GL_NET_JOIN_MAX 16` and a `[kind][iface]` budget of `GL_NET_KIND_IFACE_MAX 8`. Worst case is 112 lines per launch. Cap notes (`NET cap kind=join reached; ...`, `NET cap kind=send iface=Sockets reached; ...`) are built from the closed word tables and do not parse as NET events (census test added). Line grammar is unchanged, so `NET_LINE_RE` is untouched.
- **Budget scope decision:** no reset function was added. `stopBridgeHelper(this.appId)` runs on every game-exit/stop path in `src/backend/storeManagers/steam/games.ts` (launch deadline ~4031, bottle monitor `onStopped` ~4908, `SteamGame.stop` ~5833), so the helper process does not outlive a launch; per process equals per launch.
- **WR-08 (cb2c44563):** `gl_nets_queue_find` eviction logs `kind=oversize ... n=<dropped count>` when the victim holds records. `CloseConnection` and `DestroyPollGroup` are now `helperCustom` (`gl_nets_close_connection`, `gl_nets_destroy_poll_group`): they call the Mac flat, clear the matching `(which, handle)` queue (secure-zeroed via `gl_nets_rec_free`) and write the same `[i32 ret]` the generic path wrote. The 61260-byte single-message ceiling is documented in `shimCoverage.ts` for Sockets and Messages.
- **WR-08 partial deferral:** `CloseChannelWithUser` is unchanged. Messages queues are keyed by channel, not by peer, so clearing on one peer's close would drop other peers' carried messages. A code comment at `gl_nets_queue_find` records this.
- **WR-09 (80df13a62):** `CallbackRelayRow.holdExpiryMs` (333 = 60000, 1101 none), a `hold_expiry_ms` column in the generated relay table, `born_ms` on the held slot, and a clear-without-report in the held-retry loop under `GL_CB_LOCK`.

## Verification

- `helperNetHarness.test.ts`: 13 tests pass (new: net-budget, net-join-budget, net-path-latch, nets-evict, nets-close-clears, nets-destroy-pg-clears).
- `callbackRegistryHost.test.ts` + `gen_vtables.test.ts`: 417 pass (new host cases: 333 delivered at 59 s, 333 dropped at 61 s, 1101 delivered after 10 min).
- `helperIntegration`, `bridgeCensus`, `shimCoverage`, `shimGenerate` pass. `pnpm gen-vtables` and `pnpm build-steam-bridge` exit 0 (both compile gates PASSED).

## Deviations from Plan

**1. [Rule 3 - Blocking] Manifests edited by hand.** The two `isteamnetworkingsockets01{2,3}.manifest.json` files carry the per-method `helperCustom`, and `pnpm extract-proton-inventory` (which would regenerate them from `wire-policy.json`) fails in this environment (Proton thunk parse error) and rewrites ~70 unrelated manifests. Those were reverted with `git checkout -- meta/sdk/*.manifest.json`, then `helperCustom` was added to exactly the CloseConnection and DestroyPollGroup entries in both files, matching the existing `gl_net_read_p2p_packet` shape. The wire-policy change and the manifests agree.

**2. [Rule 1 - Test pin] `helperIntegration.test.ts` source pin** now accepts `logts("NET", cap);` alongside `msg`, since the cap note is built in its own buffer.

**3.** The pre-existing `gl_nets_queue_drop_oldest` already logged an oversize line (byte size); the plan's eviction evidence (count of dropped records) was added on the slot-eviction path in `gl_nets_queue_find`, which had none.

## Known unrelated failures

`meta/__tests__` has failures in genI18nGateScope, lintTranslations, i18nCatalogChurnGuard, findDeadcode and runTsSignals; none touch files from this plan (the i18n ones coincide with the concurrent session's uncommitted `public/locales/en/gamepage.json` edit). Not fixed.

## Known Stubs

None.

## Self-Check: PASSED

Commits fd3fa0dec, cb2c44563 and 80df13a62 exist; all listed files present.
