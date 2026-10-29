---
created: 2026-10-29
title: "winebus's IOHID path wedges winedevice on the PowerA Switch 2 wired pad"
area: steam-bridge
severity: major
platform: macos
ready: live-gate
source: "debug session drm-stage-winebus-hid-spin, live gate 2026-10-29"
files:
  - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
---

## Problem

Input reports from the PowerA Advantage Wired Controller for Nintendo Switch 2 (USB, VID 8406 / PID 42784) wedge `winedevice.exe` in any DRM-mode wine session. macOS's GameController framework does not claim this pad, so winebus reads it through its raw IOHID path, and that path faults. Wine's ntdll fault handler then spins on one core.

Hot-plugging the pad into a running Ranch Simulator session reproduced it 1 of 1: winedevice went from 1.3% to 87.6% CPU within seconds. With the pad unplugged, winedevice idles.

Three stack signatures have been seen, and all look like heap corruption or a bad callback on that path:

- `_onqueue_addMouse` > malloc_zone_error > SIGABRT
- `__IOHIDDeviceInputReportApplier` > a jump to 0x0
- `IOHIDQueueClass copyNextValue:` > malloc > `_os_unfair_lock_lock_slow`

The samples are recorded in `.planning/debug/drm-stage-winebus-hid-spin.md`.

## Consequences

- When the wedge lands during the stage's `wineboot --init`, the stage `reg add` hangs. The stage retry in `stageDrmBottle.ts` (debug drm-stage-winebus-hid-spin) only recovers from that. It does not prevent it.
- In the game session it burns a core until the game exits. The session then clears itself in about 10 s.
- The pad gives no input in game. This is very likely the cause of the "pad not recognised on macOS" problem.

## Directions

- Steer winebus away from IOHID for this device, for example through its SDL backend (`HKLM\System\CurrentControlSet\Services\winebus` options) or by disabling only the IOHID bus. It must not disable winebus as a whole: `winebus.sys=d` was rejected because the game reuses the stage session and controller input would break.
- Check whether newer CrossOver or upstream wine fixes the macOS IOHID backend.
- Gate: hot-plug the pad into a running DRM session. winedevice must stay idle, and pad input must work in game.

## 56-34 result

Stays pending (out of scope for Phase 56). Evidence from the third live gate (2026-10-29): W1, launch 1, Grim Dawn first Play on a fresh bottle with the PowerA pad CONNECTED (USB count 1): the stage ran once (attempt 0 only), four `reg add`s succeeded, no `timed out after 15000 ms`, no `stage retry passed` line, game reached its menu. One connected-pad launch with no wedge neither confirms nor refutes the root cause; the wedge is intermittent. R1, launch 5, Ranch with the pad UNPLUGGED (count 0) and the first stage attempt forced to 300 ms: `bottle processes at timeout: 7819:0.3:wineserver,7817:4.5:winewrapper.exe`, `ended stage session, killed 0 leftover process(es)`, `stage retry passed on attempt 1`, then the DRM anchor, so the in-product retry mechanics recover from a stage timeout. The natural-wedge falsification test (does the retry's fresh session also enumerate the pad?) is still unrun.
