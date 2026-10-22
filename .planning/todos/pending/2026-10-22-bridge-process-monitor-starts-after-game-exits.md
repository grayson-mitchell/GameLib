---
created: 2026-10-22
title: "Bridge process monitor starts only after the game exits — the first launch's helper outlives the game, and every later match is a stale monitor's"
source: phase 51-19 live gate items 1-2 (Avernum 6 206060, Avernum 5 206040), packaged debug bundle
area: steam-bridge
files:
  - src/backend/launcher.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
severity: major
platform: macos
ready: code
---

`fireBridgeWineLaunch()` (`games.ts`) runs `await runWineCommand({ ..., wait: false })` and only
then calls `startBottleProcessMonitor({ ..., onStopped: () => stopBridgeHelper(appId) })`.
`runWineCommand()` (`launcher.ts:1453`) returns a Promise that resolves only on the spawned
child's `close` event. `wait: false` only skips the trailing `wineserver --wait`; it does not
make the call return early. CrossOver's `winewrapper.exe --run -- <game.exe>` stays a child of the
sidecar for the game's whole lifetime. So the monitor for launch N starts only after game N has
exited.

Measured 2026-10-22:

- Avernum 5 first launch (20:15:51): no `bottleProcessMonitor [206040]` line at all while it ran.
  After a force-quit, `steam-bridge-helper --appid 206040` was still LISTENing on 50481 at 6m39s
  of age. That helper holds a live Steam session for a game that is not running (D-51-01's "helper
  lifetime == game lifetime" broken).
- Relaunch (20:20:55): `winewrapper` pid 26675, ppid = sidecar, was still alive 1:35 into play.
  But `game started` was logged at 20:20:57. That match came from launch 1's monitor, which only
  started when launch 1's winewrapper closed. Launch 1's monitor then stopped the helper at
  20:25:05.
- Avernum 6 showed the same pattern: its first launch (20:08:09) never matched, and every later
  `game started` line came from the previous launch's monitor.

Consequences: the first bridge launch per game per session leaks its helper until app quit.
Every launch leaves behind a monitor that polls `ps` forever (no-match backoff to 10s, with no
deadline by LD-4). Steam session/In-Game for the first launch is never torn down by GameLib.

Fix direction: start the monitor before or without awaiting the wine child. Either fire
`runWineCommand` without awaiting it for `wait: false` launches (catch its rejection separately),
or move `startBottleProcessMonitor` above the await. Tests should assert the monitor is started
while the `runWineCommand` promise is still pending. Check the bottled-Steam (`GameLibSteam`)
launch path for the same ordering, since D-51-16's Waiting-for-Steam state lives in the same
monitor.
