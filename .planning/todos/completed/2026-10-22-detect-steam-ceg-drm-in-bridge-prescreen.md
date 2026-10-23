---
created: 2026-10-22
title: "Detect Steam CEG DRM in the bridge pre-screen/scan — a CEG exe scans clean but can never run through the bridge"
source: phase 51-19 live gate item 5 (XCOM: Enemy Unknown, 200510)
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/importScan.ts
  - src/backend/storeManagers/steam/bridge/importParse.ts
  - src/backend/storeManagers/steam/bridge/bridgeRoute.ts
  - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
severity: major
platform: any
ready: code
---

XCOM: Enemy Unknown's `Binaries/Win32/XComGame.exe` scans **clean** for the bridge (x86, no
missing symbols), routes to the bridge, installs, and launches. Then it silently exits after about
30s without calling `SteamAPI_Init`, so no `HELLO` ever reaches the helper. Diagnosed 2026-10-22
with a CrossOver `--cx-log --debugmsg +loaddll,+seh` capture: right after `steam_api.dll` attaches,
the main thread reads the PE resources `STEAM_SPLIT_GUID`, `STEAM_GUIDD` and `STEAM_MINSTANCE`,
writes `XComGame.exe.<pid>.STEAMSTART` next to the exe, then waits for a Windows Steam client over
Steam's own IPC and gives up.

That is Steam CEG (Custom Executable Generation) DRM. It talks to the Steam client directly, not
through `steam_api.dll`, so the shim cannot satisfy it, and a bridge bottle by design has no
`steam.exe`. The exe has no `.bind` section, so a SteamStub check would not catch it either.

The user-visible failure is "pressed Play, nothing launched", with no error.

Fix direction:
- In the pre-screen/scan, read the PE resource directory and treat the presence of
  `STEAM_SPLIT_GUID` / `STEAM_GUIDD` / `STEAM_MINSTANCE` (RT_RCDATA, type 10) as CEG. Classify it as
  known-bad reason `drm-wrapped` and route to bottled Steam with the D-51-08 notice. Do the same
  for a SteamStub `.bind` section if it is not already covered.
- Teach `pnpm bridge-census` the same classification so the census number counts CEG titles as
  misses, not as bridge-routed.
- Until then, Task 2 of 51-19 adds 200510 to `knownBad` as `drm-wrapped` by hand.

## Closed

2026-10-24, quick 261024-br4: CEG is now detected automatically.

1. `placeShimForGame` runs a ranged PE resource scan (`bridge/peSteamDrm.ts`, zero imports) on the game exe after the appId/bottle/containment checks. RT_RCDATA names `STEAM_SPLIT_GUID` / `STEAM_GUIDD` / `STEAM_MINSTANCE` mark the exe as CEG. The finding is persisted as `bridge.drm: 'ceg'`, outside `scan` so a shim export-set bump cannot clear it, and `resolveBridgeRoute` folds it into row 4 as known-bad `drm-wrapped` with the D-51-08 notice. A detected CEG beats a bundled non-DRM reason. A user's "Try the bridge anyway" (`userRoute: 'bridge'`) is still honoured.
2. Install and launch now show the `drm-wrapped` setup dialog (with a CEG line and the re-download note) instead of failing silently. Install also removes the per-game bridge bottle; launch keeps it.
3. `pnpm bridge-census` counts a CEG title as a known-bad `drm-wrapped` miss, not as bridge-routed.
4. Live, read-only check of the operator's GameLibSteam bottle: `XComGame.exe` and `XComEW.exe` both parse and report all three markers (`STEAM_GUIDD`, `STEAM_MINSTANCE`, `STEAM_SPLIT_GUID`), with no `.bind` section.
5. **Deviation:** a SteamStub `.bind` section is detected and reported (a backend log line, census detail text) but deliberately NOT routed. Todo 2026-10-23 "forwarding steamclient dll for SteamStub titles" puts SteamStub in scope for the bridge, and bottled Steam is a narrow fallback where only DRM that needs a Windows Steam client (CEG) justifies a new route into it.
6. The hand-added 200510 `knownBad` entry in `bridge-allowlist.json` stays in place as a belt-and-braces guard.
