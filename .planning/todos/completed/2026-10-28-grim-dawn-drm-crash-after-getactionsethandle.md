---
created: 2026-10-28
title: "Grim Dawn crashes with a null read right after ISteamController_SteamController008_GetActionSetHandle in DRM mode"
area: steam-bridge
severity: medium
platform: macos
ready: live-gate
source: "phase 56 live gate (56-16), session /tmp/gamelib-gate-20261028T081115Z, 2026-10-28"
files:
  - native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c
---

## Problem

Grim Dawn 219990 in steamclient-layer DRM mode passes Steam init (census verified, `game call ISteamUser_SteamUser017_GetSteamID`) and then crashes: c0000005 at `grim dawn.exe+0x1d10a`, read of 0x18 (null deref), thread 244. The last traced calls are `ISteamController_SteamController008_Init` then `ISteamController_SteamController008_GetActionSetHandle`. The trace has no role=helper lines. Crash files are in the session dir under `launch-1-crash/`.

The on-disk exe is SteamStub-encrypted, so only the minidump memory is useful.

## Next

Check what +0x1d10a dereferences in the minidump, and whether the layer returns a null ISteamController interface or a null action-set result.
