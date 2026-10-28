---
created: 2026-10-28
title: "Ranch Simulator is not routed to DRM mode: its .bind is on the UE Shipping exe, not the bootstrap launch exe"
area: steam-bridge
severity: minor
platform: macos
ready: live-gate
source: "56-16 gate session; 56-VERIFICATION Gap 11"
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
---

## Problem

Ranch Simulator (1119730) was never routed to DRM mode. Measured read-only with
`x86_64-w64-mingw32-objdump -h`: the launch exe `Ranch Simulator/Ranch_Simulator.exe` has no
`.bind` section (`.text .rdata .data .pdata .rsrc .reloc`), while
`Ranch Simulator/Ranch_Simulator/Binaries/Win64/Ranch_Simulator-Win64-Shipping.exe` has `.bind`.
games.ts routes on `detectDrmWrapper(exePath)` of the launch exe only, so the UE bootstrap hides
the stub. Observed: 2-3 s exits with helper SIGTERM, census `no HELLO`.

## Next

56-19 added `detectLaunchDrmWrapper` (drm/drmScanExe.ts). 56-21 wires it into games.ts (CEG
markers must be read from `drmExe`). 56-26 records whether Ranch then reaches its menu; the
spike 040 exit-53 variant may still apply once routed.

## Closed by 56-26
Gap 11 routing passed (live gate item 16, scored `issue` only on the contract's literal anchor wording). Launch 7: `SteamStub .bind found on Ranch_Simulator-Win64-Shipping.exe (UE runtime exe)` and `bottle: appId 1119730 uses DRM runner` were logged at 09:12:45, and the failure was `reason=drm-bottle-stage`, not the ordinary-bridge-path `reason=stubbed:` notice. Decision rule: this todo's defect is the routing, and the pre-stage lines prove the route directly; the `[bridge-drm]` anchor can't print when the stage hangs. Whether Ranch then reaches its menu is NOT closed: launch 7 failed at bottle-stage (winebus/IOHID spin on a fresh bottle) and the spike 040 exit-53 variant remains untested. That is tracked by the winebus todo. The Phase 52 `gamelib_bridge.cfg` leftovers in the Ranch bottle were still present.
