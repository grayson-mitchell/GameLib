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
