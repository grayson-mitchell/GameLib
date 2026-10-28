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
