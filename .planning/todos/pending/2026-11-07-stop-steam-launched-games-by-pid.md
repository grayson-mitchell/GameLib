---
created: 2026-11-07T22:03:40.671Z
title: "Stop button should end Steam-launched games by PID (SteamGame.stop() is a no-op for them)"
area: launch
files:
  - src/backend/storeManagers/steam/games.ts (stop() ~515; final no-op branch ~585)
  - src/backend/gamedetails/dispatch.ts (kill ~152)
  - src/backend/storeManagers/steam/runningFromFolder.ts (isProcessRunningFromFolder ~89)
  - src/backend/storeManagers/steam/library/runningPoll.ts (readRunningAppId ~112)
severity: medium
platform: macos
ready: live-gate
---

## Problem

GameLib's Stop button cannot end a Steam game that Steam launched. This covers Mac-native titles,
and anything else started through `steam://rungameid` / `steam://launch`.

Stop goes `kill` (`dispatch.ts` ~152) → `SteamGame.stop()` (`games.ts` ~515). `stop()` handles
three cases:

- an in-flight depot download (abort)
- a delegated install (cancel GameLib's wait)
- a bridge game (stop its own per-game bottle)

Anything else falls through to
`logWarning('SteamGame.stop: Steam owns process lifecycle for appId …; no-op')` and returns. The
bottle-monitor branch also says it does not kill the game process. You have to quit these games
in the game itself.

Found while building the "Steam Lib Actions" table (2026-11-08). The operator thought Stop worked;
the likely reason is that the games tried were bridge games, where Stop does work. Confirm first:
press Stop on a running Mac-native game, check whether it keeps running, and look for the
`no-op` log line.

## Solution

Find the game's process(es) and end them gracefully, then forcefully if needed.

- **Finding the process:** reuse the delete route's detection.
  `isProcessRunningFromFolder()` (`runningFromFolder.ts`, quick 261107-td5) scans the process
  table for anything running from the install folder. It was added because `registry.vdf` had no
  `RunningAppID` on macOS while WazHack ran (live gate D, 2026-11-07), so `readRunningAppId()`
  alone is not reliable. Extend it to return PIDs instead of a boolean, resolving the folder from
  the ACF `installdir` inside a registered Steam library.
- **Ending it:** SIGTERM, wait a bounded grace period, then SIGKILL anything still alive. Only
  signal PIDs whose executable path is inside the game's install folder. Never signal `steam_osx`
  or other Steam helpers, and never run a broad `pkill`.
- **Scope:** macOS first (`ps` already supports it); Linux uses the same approach. Windows can
  follow, but `runningFromFolder.ts` returns false on win32 today, so it needs its own
  process-table probe.
- **After stopping:** clear GameLib's playing/launching state the way the bridge branch does,
  and let Steam notice the exit itself (it handles cloud save sync and playtime on exit).
- **Sidecar exit contract:** any `ps` child is user-triggered and bounded by a timeout. Unref the
  grace-period timer.

Live gate: launch a Mac-native title (e.g. WazHack 264160) through GameLib, press Stop, and check
that the game exits, Steam shows it as no longer running, and GameLib's Play button comes back.
