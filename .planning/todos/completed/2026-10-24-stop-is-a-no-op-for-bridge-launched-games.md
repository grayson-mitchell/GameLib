---
created: 2026-10-24
title: "Stop does nothing for bridge-launched games (SteamGame.stop is a no-op outside depot downloads)"
source: 51-29 representative sample (operator report, Manor Lords 1363080)
area: steam-launch
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
severity: medium
platform: macos
ready: code
---

When a game is running, clicking "Playing (Stop)" does nothing. Log, 2026-10-24 07:08:16-18,
three clicks:

    SteamGame.stop: Steam owns process lifecycle for appId 1363080; no-op
    Aborting not possible. Could not find a matching abort controller for 1363080

`SteamGame.stop()` (`games.ts` ~3500) aborts only in-flight native depot downloads. Otherwise
it falls through to the old "Steam owns the process" no-op. That premise is false on the bridge
route. GameLib spawns the Wine command itself, and `bottleProcessMonitor` already knows the
game's Windows PIDs (`82963 ManorLords.exe; 82965 ...-Shipping.exe`).

Fix: on the bridge route, stop the matched processes in the per-app bridge bottle (`wineserver -k`
scoped to `GameLibSteamBridge-<appId>` is the blunt option; it is safe because the bottle is
per-app). Then stop the helper and let the monitor report stopped. The bottled-Steam route can
stay a no-op, or ask bottled Steam to stop; it is a separate decision.

## Closed 2026-10-24: Stop now ends a bridge-launched game in its per-game bottle

Cause: `SteamGame.stop()` treated every non-download Steam route as Steam-owned, but on the bridge route GameLib spawns the Wine command itself, so "Steam owns process lifecycle" was false and Stop did nothing.

Changed: each bridge launch records the bottle it ran in. Stop on a game in its own `GameLibSteamBridge-<appId>` bottle runs a WINEPREFIX-scoped `wineserver -k` through the new guarded `stopPerGameBridgeBottle` (same guard chain as removal), then stops the bridge helper and ends the monitor, which emits the terminal `done` so the UI leaves Playing.

Not done here: bottled-Steam Stop still kills nothing (separate decision). A game still living in the legacy shared `GameLibSteamBridge` bottle gets the helper and monitor teardown plus a warning, but no kill, since a bottle-wide kill would take out other games. Live verification on the operator's Mac (Manor Lords 1363080) has not been run.
