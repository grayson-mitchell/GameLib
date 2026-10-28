---
created: 2026-10-29
title: "DRM stage: a fresh wine session can hit the winebus/GameController abort-spin and hang reg add"
area: steam-bridge
severity: major
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

## 56-26 evidence (severity raised from medium to major)
The hang is no longer a rare residual: it blocks every first DRM launch on a fresh bottle. Live gate 56-26: the first stage hung 2 of 2 times (Grim Dawn launch 1, Ranch launch 7: `reg add SteamClientDll64 timed out after 15000 ms`, `wineboot.exe --init` stuck, one `winedevice.exe` at 102-108% CPU). Repeat launches on staged bottles hung 0 of 4 (Grim Dawn 2, 3; Raft 5, 6). Grim Dawn retry 1b passed on the bottle the failed stage left partly staged (3 of 4 values still unstaged, stage took 17 s).
A 3 s `sample` of the spinning winedevice in the Ranch hang shows 20 of 20 samples on the main thread in `-[IOHIDDeviceClass valueAvailableCallback:]` > `IOHIDQueueClass copyNextValue:` > `_IOHIDValueCreateWithElementValuePtr` (IOKit HID): a controller/HID value-callback spin, not an abort. That answers the open question about the failure mode; the cause of the first-launch dependence is still unproven.
No wine log exists for the stage session (see the stage-session logging todo), so the launch 1 hang left no trace beyond `ps` and the SIDECAR timeout lines. The processes exit on their own after about 90 s.
Candidate directions stay as above; any fix needs a live gate on a fresh bottle, since a staged bottle never reproduces it.
