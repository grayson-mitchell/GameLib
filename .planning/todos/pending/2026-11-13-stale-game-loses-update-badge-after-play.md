---
created: 2026-11-13T00:00:00.000Z
title: 'A stale Steam game loses its update badge after it is played'
area: steam
severity: minor
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-UAT.md items 20 and 21 (deferred by the 74 gap-closure round 3, 2026-11-13)'
files:
  - src/frontend/state/libraryState.ts:262-378
  - src/backend/storeManagers/steam/updateLaunchPrompt.ts
---

## Problem

After playing stale Hell Clock 1782460 (bridge) through the launch prompt (Esc, then Return), its
card lost the update badge while the ACF was still at the old build. A manual Refresh restored it.

## Notes

Not root-caused. `handleGameStatus` in libraryState.ts drops an appName from `gameUpdates` only
when a 'done' or 'error' follows a status of 'updating' (74-27 relies on that for registered
update completion). So the likely cause is something in the launch path sending
`status: 'updating'` for the game before its launch 'done' (for example the pre-launch update
check or the prompt's code path), or a launch-time refresh whose update list misses the app.
Start by capturing the gameStatusUpdate sequence for a Play on a stale bridge game.

## Done when

Playing a stale game (Play anyway) and quitting it leaves the badge in place, pinned by a
libraryState sequence test for the launch statuses.
