---
created: 2026-10-22
title: "Confirm XCOM (200510) knownBad `drm-wrapped` diagnosis by running it through bottled Steam"
source: phase 51-19 live gate item 5, operator decision 2026-10-22
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
severity: minor
platform: macos
ready: live-gate
---

51-19 added XCOM: Enemy Unknown (200510) to `knownBad` with reason `drm-wrapped`. That reason is
an inference, not a proof. Through the bridge, `XComGame.exe` loads the shim, reads the PE
resources `STEAM_SPLIT_GUID` / `STEAM_GUIDD` / `STEAM_MINSTANCE`, writes
`XComGame.exe.<pid>.STEAMSTART`, idles ~30s and exits without ever calling `SteamAPI_Init`. That
pattern matches Steam CEG waiting for a Windows Steam client over Steam IPC. The resource names were
identified from memory, not checked against Valve documentation.

Confirmation test (the operator's Mac now has a working `GameLibSteam` bottle):

1. Install XCOM through the bottled route. It is in knownBad, so GameLib routes it to bottled
   Steam with the D-51-08 notice ("Use bottled Steam"). The download is ~20 GB.
2. Play it to the main menu.

Outcomes:
- **Runs in bottled Steam:** CEG is confirmed. Keep `drm-wrapped`, and add a note citing this test
  to the knownBad entry.
- **Fails in bottled Steam too:** change the reason to `does-not-run`, cite both observations, and
  look at wine-level causes. The routing does not change.

Related: `2026-10-22-detect-steam-ceg-drm-in-bridge-prescreen.md` (detect CEG automatically).
