---
created: 2026-11-24T10:00:00.000Z
title: "Bottled games sometimes exit about one second after the wine command, or show no window"
area: launch
files:
  - src-tauri/crates/gamelib-engine/src/launch (the launch step and the first-match watch)
  - src/backend/storeManagers/steam/gameLaunch.ts (the bridge launch path)
severity: medium
platform: macos
ready: live-gate
---

## Problem

In the 87-59 live gate (2026-11-24), several bottled launches ended almost at once or never showed a window:

- The Binding of Isaac (Steam bridge, its own bottle) exited about 1 s after the wine command four times in one session
  (`launcher exited before any game process matched`), while CrossOver's own `wine cmd /c` in the same bottle worked.
- Trash Goblin (Epic, non-Steam) exited about 1 s on CrossOver in launch 1, then ran on the built-in Staging engine and later
  on CrossOver again.
- Isaac on the built-in Staging engine after an expired trial showed a Dock icon but never a window, at 0.0% CPU for about
  3 minutes until Stop.

It may be one pattern or several. Nothing in the gate explains it, and 0.12.0 (the Phase 86 build) was not compared, so it is
not known whether Phase 87 introduced it.

## Not fixed in Phase 87

Recorded from the 87-59 run's non-gate observations. The user decided on 2026-11-24 to fix the five gate findings (F1 to F5)
and the engine log in Phase 87 and to track the rest as todos, so this is deliberately not planned there.

## To do

Reproduce on the signed 0.12.0 build and the current build with the same bottle and compare. With the engine log now reaching
`gamelib.log` (87-61), read what the launch step logs between the wine command and the exit before guessing a cause.
