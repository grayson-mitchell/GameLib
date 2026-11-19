---
created: 2026-11-18T00:00:00.000Z
title: 'Mac Steam restart ignores a running bottled (bridged) game'
area: steam
severity: major
platform: macos
ready: live-gate
files:
  - src-tauri/crates/gamelib-steampoll/src/running.rs
  - src/backend/storeManagers/steam/macSteamAdoption.ts
  - src/backend/storeManagers/steam/gameSessionState.ts
---

## Problem

Quick task 261118-uma gives macOS a running-game signal for restart-on-Play, "Restart Steam
now" and the uninstall/update guards: a process whose executable lies under
`<library>/steamapps/common/<installdir>/`, mapped to an appId by ACF. Bridged games (Windows
games GameLib runs in a CrossOver/Wine bottle, e.g. Avernum 5 / 206040 in
`GameLibSteamBridge-206040`) run as wine processes whose executable is the wine binary, not a
file under a Steam library, so they still read as "no game running". GameLib can therefore
quit the Mac Steam client while a bridged game is in session, which breaks the bridge's Steam
connection (the bridge talks to the running Mac Steam).

## Solution

Extend the Mac running-game read to count bridged sessions: GameLib launches them itself, so
it already knows which bottle/appId is live (launch bookkeeping, bottle wineserver, or a
bridge HELLO/session marker). Have the restart guards refuse while any bridged session is
active, ideally with the same "Quit the game running in Steam" notice naming the game.
Live-check: run a bridged game, press Play on a pending native game, expect refusal and an
unchanged steam_osx pid.

## Resolution

Fixed by quick 261119-se9 (`564c1cec5`, `b3f7e53fe`). Root cause: the Mac running read is a process scan by executable path under a Steam library, and a bridged game's processes are wine binaries, so the scan read "no game running" and GameLib could quit Mac Steam mid-session.

Fix: `runningBridgedAppId` (`gameSessionState.ts`) reads GameLib's own bridged launch bookkeeping (`bridgeLaunchBottles` and `bridgeLaunchesInFlight`) and returns the lowest live appId, or 0. `createRestartDeps.readRunningAppId` (`macSteamAdoption.ts`) consults it before the Rust read, so restart-on-Play and "Restart Steam now" refuse with the existing game-running notice and Steam is never told to quit. This signal and not a wine process scan, a helper, HELLO or the monitor phase, because it alone covers the whole session from Play through pre-flight to the game ending, and a wine process cannot be mapped to an appId, a no-steam-api launch spawns no helper, HELLO arrives after pre-flight, and the monitor also covers bottled Steam.

Scope: the uninstall/update guards, the 5 s RunningPoll and the Rust op are unchanged. Known limit: the bookkeeping is per boot, so a session left over from a previous GameLib process is not counted.

Live check procedure. Start with `pnpm tauri:dev`, restarted after these commits, since tauri dev does not rebuild the sidecar; check the sidecar.js mtime. Run a bridged game, e.g. Avernum 5 / 206040, and note `pgrep -x steam_osx`. Press Play on a pending native game. Expect:

- the "Quit the game running in Steam, then press Play to finish setting up <name>." notice;
- gamelib.log lines `[Steam] bridged session for game 206040 is active` and `[Steam] not restarting Steam for <pending>: game 206040 is running`;
- no `fired steam://exit`;
- an unchanged steam_osx pid.

Repeat with "Restart Steam now". Then quit the bridged game and confirm Play restarts Steam as before.

Live check passed 2026-11-19 (operator, macOS): with a bridged game running, Play on a pending native game and "Restart Steam now" both refused with the game-running notice and left steam_osx running; after the bridged game quit, Play restarted Steam as before.
