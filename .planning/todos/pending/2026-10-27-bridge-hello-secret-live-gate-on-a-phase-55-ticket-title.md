---
created: 2026-10-27
title: "Bridge HELLO launch secret is unverified on a live Phase 55 web-API ticket title"
severity: medium
platform: macos
ready: live-gate
area: steam-bridge
found_by: "quick 261027-9vr execution, 2026-10-27"
files:
  - native/steam-bridge/helper/bridge_helper.c
  - meta/gen_vtables.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/bridgeConfig.ts
---

## Problem

Quick `261027-9vr` gated the bridge helper's CONTROL and interface slots behind a per-spawn HELLO
secret. Jest covers it against the real compiled helper, but no game has run through it yet.

## Live gate

Restart `tauri dev` first, because it does not rebuild the sidecar. Then launch a Phase 55 live-gate
title that calls GetAuthTicketForWebApi, and check:

1. The game receives callback 168 (`GetTicketForWebApiResponse_t`), including after the helper's 5 s
   idle timeout forces a reconnect.
2. A second, unauthenticated loopback client sending CONTROL slot 6 (DRAIN) gets STATUS_ERR, and the
   helper logs `AUTH refused`.
3. `gamelib_bridge.cfg` is mode 600, and `ps` shows no secret in the helper's argv.
4. The helper log shows `HELLO shim attached` for the game, but not for the backend's readiness probe.
