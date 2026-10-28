---
created: 2026-10-29
title: "DRM stage: a fresh wine session can hit the winebus/GameController abort-spin and hang reg add"
area: steam-bridge
severity: medium
platform: macos
ready: live-gate
source: "debug session drm-second-launch-bottle-stage (resolved), 2026-10-29"
files:
  - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
---

## Problem

Residual risk left after 5ff2dbd8c. That commit stops already-staged bottles from running `reg add`, but a truly unstaged bottle (fresh, or after a registry reset) still starts a wine session at stage time. In the observed hang, winedevice (winebus.so) crashed in macOS GameController `_onqueue_addMouse` (malloc_zone_error -> SIGABRT) and wine's ntdll.so signal handler spun at 100% CPU. `wineboot --init` blocked on it and `reg add` timed out at 15000 ms. The crashing code is stock CrossOver (winebus.so, ntdll.so, winedevice.exe identical to the clone).

## Open questions

- Why the first launch usually avoids the crash (unproven).
- Whether Raft (648800) hung for the same reason; its user.reg already matched exactly.

## Options considered

- Disabling winebus (`winebus.sys=d`) for the stage call is rejected: the game reuses the stage session, so controller input would break.
- Writing user.reg directly is risky without knowing that no session is live.
- Candidate: short-timeout first stage, then retry after killing the stage session's own winedevice.
