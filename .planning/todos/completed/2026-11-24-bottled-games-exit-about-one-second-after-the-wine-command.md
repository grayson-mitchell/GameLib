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

## Seen again in 87-69 (RF1)

Dated 2026-11-25. The 87-69 re-run 1 gate on the signed 0.13.1 build (finding RF1) reproduced the pattern for non-Steam games on
CrossOver, and it is not intermittent:

- Trash Goblin (Epic, legendary) and Caravan SandWitch (Amazon, nile) exited in 1 to 2 s on `engine=crossover` with
  `reason=cx-healthy`. In launch 1 there were 7 `launch deadline cancelled (launcher-exited)` lines for them.
- Wine-Staging launches of the same games worked (1 launch).
- The one CrossOver launch right after the pinned-to-crossover restore ran normally, then the next two dropped again.
- The same nile command run from a shell started the game, also under the sidecar's minimal env (`env -i`); an empty recreated
  shared prefix did not help.

Tracked by 87-72 (diagnosis) and 87-77 (fix); live proof is re-run 2 item 3 (`87-RERUN-2-HUMAN-UAT.md`); 87-79 closes this todo
when item 3 passes.

2026-11-25 (87-72): RF1's cause is named at the bottle's state at spawn: the plain `cx-healthy` branch leaves the wineserver its own
demo-status probe started running and the launch spawns against that warm server, while the restore branch's switch kills it first and
launches cold (confidence medium; the isolating shell run is 87-77's first step). See
`.planning/debug/rf1-crossover-launches-exit-within-two-seconds.md`; 87-77 fixes it.

## Resolved 2026-11-26

Resolved by 87-77; proven live in re-run 2 item 3 (`87-RERUN-2-HUMAN-UAT.md`, 87-79) on the signed 0.13.2 build: four
`engine=crossover reason=cx-healthy` launches (Trash Goblin three times, Caravan SandWitch once) each kept the game process 78 s
to about 10 min, every deadline ended `cancelled (first-match)`, and 0 `cancelled (launcher-exited)` lines.
