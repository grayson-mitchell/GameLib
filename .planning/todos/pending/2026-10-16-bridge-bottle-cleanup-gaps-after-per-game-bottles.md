---
created: 2026-10-16
title: "Two cleanup gaps left by per-game bridge bottles: legacy uninstall manifest, and Remove all copies leaving an empty bottle"
source: quick task 261016-u1w planner and executor (T-u1w-06, LD-5)
area: steam
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
severity: minor
platform: macos
ready: human
---

Both were deliberately left out of 261016-u1w.

1. **Legacy-bottle uninstall may leave a stale `appmanifest_<appId>.acf` (T-u1w-06, unverified).**
   Uninstalling a bridge game that lives in the legacy shared `GameLibSteamBridge` bottle never deletes
   its manifest. If that manifest still reads fully installed, the next library refresh may show the
   game as installed again. Read from source, not reproduced. Per-game bottles are immune (the whole
   bottle is deleted). Measure first: uninstall from the legacy bottle, refresh, check the library.

2. **"Remove all copies" leaves an empty per-game bottle (LD-5, needs a decision).**
   `removeSteamInstallCopy('bridge')` removes the install dir and manifest but keeps
   `GameLibSteamBridge-<appId>`. The next install reuses it, so nothing breaks; it costs disk and
   clutters CrossOver's bottle list. Decide whether it should call `removePerGameBridgeBottle` when the
   bottle is per-game.
