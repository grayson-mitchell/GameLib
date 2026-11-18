---
created: 2026-11-18T00:00:00.000Z
title: 'Mac Steam restart ignores a running bottled (bridged) game'
area: steam
severity: major
platform: macos
ready: code
files:
  - src-tauri/crates/gamelib-steampoll/src/running.rs
  - src/backend/storeManagers/steam/macSteamAdoption.ts
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
