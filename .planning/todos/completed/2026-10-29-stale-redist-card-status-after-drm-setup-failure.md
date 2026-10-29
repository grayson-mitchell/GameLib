---
created: 2026-10-29
title: "Card keeps 'installing redistributables' and Play stays disabled after a DRM-setup failure (intermittent)"
area: steam-bridge
severity: medium
platform: macos
ready: live-gate
source: "phase 56 live gate (56-26), launch 1, 2026-10-29"
---

## Problem

After Grim Dawn launch 1 failed at bottle-stage, the card kept the label "installing redistributables" with Play disabled. A webview reload, navigating away and back, and a library Refresh did not clear it; only a dev restart did, so the state is held outside the webview. It also showed on the Play click of launch 1. After the Ranch launch 7 failure (same stage failure) the card did NOT show the label, so it is intermittent. `drmLaunchSetup` sends `status: 'redist'` progress (`drmLaunchSetup.ts:234`; contexts 'Compatibility runner' and 'Steam client files'); the launcher is meant to send `done` after `launch()` returns false (`games.ts:3739`, `launcher.ts:354`). Status updates are not logged, so whether the `done` was sent or applied is unproven.

## Next

Log the status updates (or add a final status on every drm setup failure exit) to learn which exit leaves 'redist' set; check ordering between a late progress send and the launcher's done. Reproduce by forcing a bottle-stage failure.

## Closed by 56-34

Closed on unit-test evidence; no live DRM-setup failure occurred in the 56-34 run, so there was nothing to observe for C1 (zero `drm setup: ... stopped at` lines in the whole run). The fix is 56-27: `3e7d63dfb` (`drmLaunchSetup` sends a logged terminal `done` after any failure past progress, literal `sent terminal status done`) and `59f1dd9a2` (`games.ts` sends a terminal `done` when a DRM-ready launch fails, literal `sent terminal status done after launch failure`). Verified 2026-10-29: `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/drmLaunchSetup.test.ts` -> `Tests: 40 passed, 40 total` (includes the five terminal-'done' behavior tests); `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "Phase 56"` -> `Tests: 415 skipped, 53 passed, 468 total` (includes the two launch-failure tests). The sidecar carries the literal (`sent terminal status done` count 2 in `build/main/sidecar.js`, PC6). If the stale label ever recurs live, the new log lines will show which exit left it set; reopen then.
