---
phase: 58-steam-bridge-multiplayer
plan: 26
subsystem: steam-bridge-helper
tags: [gap-closure, native, c, harness]
requires: []
provides:
  - CR-01 iface label fix in gl_nets_receive
  - -Werror=uninitialized helper compile flag
  - CR-02 consume-and-discard for oversize legacy P2P packets
  - host harness for the helper receive paths
affects: [native/steam-bridge/helper/bridge_helper.c, meta/buildSteamBridgeShims.ts]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c
    - src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
decisions:
  - Oversize P2P packets up to 1 MiB are read into a zeroed-then-freed scratch and dropped; above 1 MiB the packet is left at the channel head and only logged (T-58-82)
metrics:
  tasks: 2
  completed: 2026-11-01
---

# Phase 58 Plan 26: Helper receive-path gap closure Summary

CR-01 and CR-02 are fixed in the helper, the compiler now rejects the CR-01 bug class, and a darwin-only host harness proves both against the real helper source.

## What changed

- `gl_nets_receive` assigns `iface = which == 2 ? GL_NET_IFACE_MESSAGES : GL_NET_IFACE_SOCKETS`. Sockets recv and oversize NET lines now read `iface=Sockets`.
- `buildHelperCompileArgv` carries `-Werror=uninitialized` (after `-O2`). The real helper compiles clean with it and `pnpm build-steam-bridge` exits 0. No other site needed a fix.
- `gl_net_read_p2p_packet` consumes and discards an oversize packet (at most 1 MiB), zeroing and freeing the scratch, logs `oversize`, and returns ret=0/len=0/remote=0. The next read returns the following packet.
- `net_harness_driver.c` `#include`s the real `bridge_helper.c` (main renamed), with fake Mac receive symbols and a fake P2P FIFO that pops only when `cubDest >= size`. `helperNetHarness.test.ts` (darwin-only, fake-HOME profile for compile and run) covers sockets-conn, sockets-poll, messages, sockets-oversize, p2p-oversize-then-small, p2p-huge and p2p-normal.
- Pins: argv pin for `-Werror=uninitialized` and a source pin beside the existing `which == 2` assertion.

## Verification

Jest for helperNetHarness, buildSteamBridgeShims and helperIntegration: 92 tests pass. `pnpm build-steam-bridge` exits 0. The self-reference grep is empty.

## Deviations from Plan

The two tasks touch the same hunk-adjacent regions of `bridge_helper.c` and the same harness files, so they landed in one commit (`78b4c0b7c`) instead of two. Otherwise executed as written.

## Known Stubs

None.

## Self-Check: PASSED
