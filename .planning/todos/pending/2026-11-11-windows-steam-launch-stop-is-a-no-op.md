---
created: 2026-11-11T00:00:00.000Z
title: 'Windows Steam launch Stop is a no-op (the game reaches Playing, but Stop does nothing)'
area: launch
files:
  - src/backend/storeManagers/steam/games.ts (SteamGame.stop ~527)
  - src/backend/storeManagers/steam/runningFromFolder.ts (findPidsRunningFromFolder returns [] on win32)
  - src/backend/storeManagers/steam/stopSteamLaunchedGame.ts (unsupported-platform on win32)
severity: medium
platform: windows
ready: live-gate
---

## Problem

Since quick 261111-7wo, Windows Steam launches reach Playing, so the Stop button is now reachable.
It does nothing for them: `SteamGame.stop()` finds no PIDs because `findPidsRunningFromFolder`
returns `[]` on win32, and `stopSteamLaunchedGame` returns `unsupported-platform` there. The
workaround is to quit from inside the game.

## Solution direction

A Windows PID lookup by executable path under the install folder, through the injected runner.
Never kill by name (Phase 72 D-13). Leave the design open.
