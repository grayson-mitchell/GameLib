---
created: 2026-10-26T07:55:17.273Z
title: "Cancelling a native Steam download and removing it from Downloads still leaves the game on \"Resume install\""
source: 51-UAT item 24 (2026-10-26), seen on Dungeonmans 288120 and Fallout 2 38410
area: steam
files:
  - src/backend/storeManagers/steam/games.ts:4062
  - src/backend/storeManagers/steam/games.ts:1105
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/library.ts
severity: minor
platform: any
ready: code
---

## Problem

The operator cancelled an in-flight native depot download (`SteamGame: aborting in-flight native depot download for appId 288120`, `[DownloadManager]: 288120 removed from download manager.`, then `Installation of 288120 aborted!`). Afterwards the library entry still had `install.steamResumePending: true`, `steamResumeTargetSteamappsDir` pointing at the bottle, and `steamResumeInstalldir`. The partial download also stayed on disk (`GameLibSteamBridge-288120/.../common/Dungeonmans`). The game page therefore offered "Resume install". Operator: "option in game is to resume install even though I killed and removed in downloads... should just be install." Fallout 2 (38410) did the same.

`SteamGame.stop()` (games.ts ~4062) serves both pause and cancel, and only aborts the controller. Pause has to keep the resume marker, so nothing on the cancel path clears it.

Side effect: the marker also feeds WR-08's guard (`install()` keeps the bottle named by `steamResumeTargetSteamappsDir`). A stale marker from a cancelled bottled download would pin a later default-route install to GameLibSteam.

## Solution

TBD. Distinguish cancel and remove from pause where the download manager removes the entry, and on a real cancel clear `steamResumePending`, `steamResumeTargetSteamappsDir` and `steamResumeInstalldir`. Decide whether cancel should also delete the partial bits, and a freshly provisioned per-game bridge bottle that holds nothing else, or leave them for an explicit uninstall. Keep pause and resume, and the startup "interrupted install" surfacing (games.ts ~1105), unchanged.
