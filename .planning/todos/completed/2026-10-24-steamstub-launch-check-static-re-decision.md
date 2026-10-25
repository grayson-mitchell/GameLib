---
created: 2026-10-24
title: "Decide whether to pursue static RE of the SteamStub launch check (Grim Dawn main menu through the bridge)"
source: Phase 52 amended done-when (52-UAT items 29, 31-32)
area: steam-bridge
files:
  - src/backend/storeManagers/steam/games.ts
  - native/steam-bridge/helper/bridge_helper.c
severity: major
platform: any
ready: human
---

**Problem.** SteamStub titles (Grim Dawn 219990) reject the bridge's forwarding steamclient64.dll with Application load error 3 and never reach their main menu. Making the stub accept the forwarder would need static reverse engineering of the stub's launch check.

**Evidence.** 52-UAT items 24 and 27-29: the stub reads the whole forwarder file, a live pid removes the IsSteamRunning warning but the load error persists, so the file/forwarder check is the blocker.

**Boundary.** Static RE of the stub is outside the locked boundary of Phase 52, so the operator decides first. Nothing here proposes a stand-in, a genuine Valve DLL, an exe edit or a bottled-Steam reroute.

**GameLib today.** The forwarded path logs the trigger and shows an honest "Steam DRM check not supported" notice, as an OS notification and as an in-app dialog (52-34, 52-36; confirmed live in item 32).

**Revisit trigger.** re-scope the notice if any SteamStub title is ever observed reaching its menu through the bridge.

## 53-15 evidence (2026-10-25)

More SteamStub titles hit the same wall through the bridge, none reaching their menu:

- Raft 648800 and Grim Dawn 219990 (53-UAT item 11): census class `steamstub-forwarded:launch-check-unsatisfiable`, FWD CreateInterface only, operator "drm message shows, error message: Application load error." (Raft) and "DRM message in app, error: application failed error" (Grim Dawn).
- Ranch Simulator 1119730 (53-15 Task 1): the Shipping exe has a `.bind` section (0x39248 bytes, last section) and exits 53 (0x35) before steam_api64.dll is ever loaded. The result is identical with the game's original `steam_api64.dll.gamelib-orig`, so the shim is not involved. Operator re-test on the current build: "other two do not [run], think they have not changed". Not rerouted to bottled Steam; the decision stays with this todo.
