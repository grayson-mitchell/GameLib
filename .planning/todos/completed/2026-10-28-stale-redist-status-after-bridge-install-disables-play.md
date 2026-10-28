---
created: 2026-10-28
title: "A bridge install leaves the game stuck in 'redist' and Play disabled"
area: steam-bridge
severity: medium
platform: macos
ready: human
source: "phase 56 live gate (56-16), session /tmp/gamelib-gate-20261028T081115Z, 2026-10-28"
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/downloadqueue.ts
---

## Problem

After a bridge install, the install-time shared-redist step (games.ts about 2327-2341, `sharedRedistInstall.ts` sends status 'redist') leaves the game in 'redist' ("Installing DirectX Jun2010"). The Steam download-queue 'done' is suppressed (downloadqueue.ts about 312) and nothing sends a final status after the redists. Play stays disabled; the live gate needed a dev restart. Cmd+R reload is a no-op under Tauri (`fakeWindow.reload(): logged no-op`), so it cannot be used to recover.

## Next

Send a final status after the redist step completes or fails.

## Resolution (56-20)

`installBridgeGame` (games.ts) now sends `sendGameStatusUpdate({ appName, runner: "steam", status: "done" })` in a `finally` after `installSteamBridgeSharedRedists` settles, whether it resolves or rejects. Live confirmation is left to 56-22; 56-26 decides closure.

## Closed by 56-26
Item G3 (live gate item 13) passed: after the reinstall finished with the dev pid unchanged, the operator reported Play enabled (not stuck on redist), and the click reached the backend (`drm setup: appId 219990` lines within 20 s). A different, intermittent stale-`redist` status after a DRM-setup failure is filed separately.
