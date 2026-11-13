---
created: 2026-11-13T00:00:00.000Z
title: 'Steam overlay does not attach to Core Keeper (1621690) under the bridge'
area: steam
severity: medium
platform: macos
ready: live-gate
source: 'side finding from the live re-verify of the closed SteamInventory_v003 todo (2026-11-13 21:33 NZDT, gamelib.log lines 158-222)'
files:
  - src/backend/storeManagers/steam/bridge/overlay/overlayAttachWatch.ts:170
  - native/steam-bridge/overlay-shim
---

Core Keeper started cleanly under the bridge: HELLO, `steam initialized successfully`, stats
received. But the overlay never attached: `overlay attach: not attached within 10s` at 21:33:18.

The overlay shim did load into `CoreKeeper.exe` (pid 14888): `layer_hooks=3 overlay=present`.
Device, queue and MTL4 queue hooks installed (`AGXG17DDevice hooks=4`,
`AGXG17XFamilyCommandQueue hooks=2`). The command-buffer hook line read
`hooks=1 overlay_commit=missing`, which is the first lead to check. Steam's `gameoverlayui`
was not running at 21:34.

Core Keeper is Unity 6000.0.59f2 on Direct3D 11. Dungeons of Dredmor's overlay was closed as
unsupported because it renders 2D in software. Core Keeper renders through D3D11, so that
reason does not apply here.

Check: launch with `CX_ENV=STEAM_OVERLAY_LOGGING=1 STEAM_OVERLAY_LOGGING_FLUSH=1` as a per-game
env var (fixed in `89d40050d`), and confirm whether `gameoverlayui` is spawned and whether
`overlay_commit` is ever resolved. Done when the overlay attaches and Shift+Tab opens it in game,
or when the title is recorded as unsupported with the reason.
