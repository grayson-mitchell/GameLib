---
created: 2026-10-23
title: "Game page stays on \"Launching\" after a bottled-Steam game exits"
source: phase 51-27 live gate item 16 (Avernum 4, 206020, bottled Steam)
area: steam-bottle
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
severity: major
platform: macos
ready: code
---

After quitting Avernum 4 (206020) launched via the bottled Steam client, the game page still shows "Launching" although the backend saw the stop both times: monitor lines `matched process(es) gone after 65s of play — game stopped` and `gone after 34s`, each followed by `[refreshLibrary] runner=steam origin=game-status`.

Related log lines from the same run: `SteamGame.stop: Steam owns process lifecycle for appId 206020; no-op`, `Aborting not possible. Could not find a matching abort controller for 206020` (the user pressed stop while Launching), and `raiseFrontmostBottledProcess [launch]: no matching process within ~18s`. Likely the frontend status is never moved off `launching` for the bottled-Steam path (the status is set by the launch flow, and the monitor's stop only refreshes the library). Investigate which status event the frontend waits on and emit it from the monitor's onStopped.

## Closed 2026-10-24: page's Play-click latch now released by playing, and by launch failure

**Root cause.** The backend did send `done`: the `[refreshLibrary] runner=steam origin=game-status` line is the renderer's done-branch. The stuck label was GamePage's local `playClicked` latch, which outranks `playing` in MainButton and was released only by a `launching` status or by the launch IPC resolving. Pre-gvu nothing emitted `launching` for Steam, and the bottled launch IPC awaits runWineCommand's child close, so it stayed pending for the whole cold-Steam session.

**Changed.** Quick 261024-i23: `releasesPlayClicked` releases the latch on `launching` or `playing`; `handlePlay` resets it in a `finally`. Quick 261024-gvu's monitor `launching` push already covers the main path.

Live verification on the Mac (Avernum 4, 206020, bottled, cold Steam: play, quit, page returns to Play) is still owed.
