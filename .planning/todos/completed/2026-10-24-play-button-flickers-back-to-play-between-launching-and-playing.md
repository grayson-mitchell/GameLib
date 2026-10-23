---
created: 2026-10-24
title: "Play button flips Launching -> Play -> Playing for 1-2 s on bridge launches"
source: 51-29 representative sample (operator report, Manor Lords 1363080 and others)
area: steam-launch-ui
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
severity: minor
platform: macos
ready: code
---

Clicking Play shows "Launching", then reverts to "Play" for 1-2 seconds, then shows
"Playing (Stop)". The launch call returns once the Wine command is spawned. The playing state
only arrives when `bottleProcessMonitor` matches the game process, about 1-2 s later (Manor Lords:
spawn at 07:04:25, `matched process(es) — game started` at 07:04:26).
For the gap between the two, the UI has neither state and shows "Play", which invites a second
click.

Fix: keep the launching state until the monitor reports started, or until it gives up. Check whether
the bottled route's 20 s wait
(`2026-10-23-bottled-launch-gives-up-after-20s-while-steam-is-still-starting-the-game.md`) uses
the same state hand-off, and fix both together.

## Closed 2026-10-24: monitor-owned launching state removes the Play flicker

Same root cause as the 20s-give-up todo: Steam launches bypass `launchEventCallback`, so `launching` was only the frontend `playClicked`, which dropped when the launch IPC resolved on hand-off (bridge: `fireBridgeWineLaunch` returns without awaiting wine; bottled: `runWineCommand({wait:false})`), leaving Play showing until `playing`.

Changed (quick 261024-gvu): `startBottleProcessMonitor` sends `launching` before the launch IPC resolves (bottle.ts now awaits the monitor start before `runWineCommand`) and the monitor holds it until the first match (`playing`) or a terminal `done`. A bridge Launching -> Playing UI pass is not a bridge "verified" claim (strict criterion).

Live verification on the Mac (Manor Lords 1363080 bridge; XCOM 200510 bottled) is still owed.
