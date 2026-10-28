---
created: 2026-10-28
title: "DRM mode: the second launch in a bottle hangs at bottle-stage (wineboot --init, winedevice spinning)"
area: steam-bridge
severity: medium
platform: macos
ready: live-gate
source: "phase 56 live gate (56-16), session /tmp/gamelib-gate-20261028T081115Z, 2026-10-28"
files:
  - src/backend/storeManagers/steam/games.ts
---

## Problem

A first DRM launch in a bottle works, but every later DRM launch in the same bottle times out at `stageDrmBottle` (`reg add ... timed out after 15000 ms`, `reason=drm-bottle-stage`). During each hang the bottle's wine session under the DRM clone runner runs `wineboot.exe --init` and a `winedevice.exe` spins near 100% CPU and never exits. Seen for Grim Dawn (22:49:14, 22:55:43) and Raft (22:52:09) after each had one successful DRM launch.

`wineserver -k` with CX_BOTTLE alone did not stop the Grim Dawn session; a pid kill and kill -9 of winedevice did.

## Next

Sample the spinning winedevice, check for a stock versus clone wineserver mismatch on the bottle, and test ending the bottle session after game exit (D-11).
