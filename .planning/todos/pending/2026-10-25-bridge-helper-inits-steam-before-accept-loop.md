---
created: 2026-10-25
title: "Bridge helper runs SteamAPI_InitFlat before its accept loop, so a slow cold init reports the helper unreachable (51-REVIEW WR-02)"
source: 51-REVIEW.md WR-02, skipped in 51-REVIEW-FIX.md (needs native helper change + live gate)
area: steam-bridge
files:
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
severity: medium
platform: macos
ready: live-gate
---

`bridge_helper.c` `main()` logs `LISTEN`, then runs `load_steam_api()` / `init_steam_api_once()`,
and only then reaches `accept()`. If dlopen plus `SteamAPI_InitFlat` takes longer than the
backend's ~3 s readiness budget (cold Steam IPC, Steam mid-update), the per-launch helper is
reported `unreachable` and the launch fails with the bridge-setup dialog.

Options (pick one at fix time): init on a separate thread and serve HEALTH during init; emit
LISTEN only after init; or size the backend wait to a **measured** cold `SteamAPI_InitFlat`
duration. Each needs a live Mac Steam session to verify.

When fixed, also correct the `helperProcess.ts` module doc, which claims HEALTH answers
"immediately at process start, BEFORE `SteamAPI_InitFlat` completes" — false today.
