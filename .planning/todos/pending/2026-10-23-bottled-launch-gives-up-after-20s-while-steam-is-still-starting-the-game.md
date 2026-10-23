---
created: 2026-10-23
title: "Bottled launch reverts Play after ~20s (cause=none) while bottled Steam is still starting the game; clicks queue extra -applaunch"
source: phase 51-28 live gate item 17 (XCOM, 200510, bottled Steam)
area: steam-bottle
files:
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
  - src/backend/storeManagers/steam/games.ts
severity: medium
platform: macos
ready: code
---

GameLib sends `steam.exe -applaunch 200510`, logs `[bottle-waiting] appId=200510 cause=none` about 20s later, and the Play button reverts. The game does start later: DXSETUP.exe (first-run prerequisite install) at 20:49:16, 38s after the 20:48:38 click, and XCOMLauncher.exe at 21:14:06. The game page shows "Waiting for Steam… Likely causes: updating / sign in / running elsewhere", none of which applied. Each further click on Play queues another `-applaunch` dispatch.

Fix direction: treat `cause=none` after an `-applaunch` dispatch as "still starting" rather than giving up at 20s (a first-run DXSETUP/vcredist step is a known slow path), keep Play disabled while a dispatch is pending, and do not dispatch a second `-applaunch` for the same appId. Distinct from `2026-10-23-game-page-stuck-on-launching-after-bottled-steam-game-exits.md`, which is about the page not leaving "Launching" after the game exits; this one is about giving up too early.
