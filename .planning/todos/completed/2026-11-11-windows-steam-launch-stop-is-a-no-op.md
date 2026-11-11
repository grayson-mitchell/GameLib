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

## Resolution (code fix, quick 261111-9p6, 2026-11-11)

Code landed in quick 261111-9p6. Windows live gate PASSED 2026-11-11 (operator): launch, Playing, Stop
closed the game, the card returned to Play, Steam kept running.

Design as built:

- PIDs come from a constant PowerShell 5.1 `Get-CimInstance Win32_Process` listing (absolute System32
  path, `-NoProfile`, UTF-8 output, 15 s bound) through the injected runner; matching is in JS on
  ExecutablePath under `<library>\steamapps\common\<installdir>\` (path.win32, case-insensitive).
- Close request is `taskkill /PID <pid>` (no /F, no /T; exit 128 = gone), then the bounded grace,
  then `process.kill` (TerminateProcess) on survivors that a fresh rescan still finds.
- Delete route and launch watch are unchanged on win32.

Live gate: launch an installed Steam title, wait for Playing, press Stop. The game window closes
(force-ended after the grace if it ignores the close), the card returns to Play, Steam and
`steamwebhelper.exe` keep running.
