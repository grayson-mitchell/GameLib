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

## Resolution

Closed as not reproducible (2026-11-14). Quick 261114-mhd (763d308c3) found nothing in the bridge
launch path that sends 'updating' and pinned the launch statuses (launching -> playing -> done,
and a steam-starting/engine-download variant) as badge-preserving in libraryState.test.ts. It also
added a permanent `[gameUpdates] dropped appIds=... path=...` log for every shrink of
gameUpdates (handleGameStatus prior/new, or refresh origin/runner/checkUpdates/source/snapshotStale).

Live re-run on stale Hell Clock 1782460 (bridge, buildid 26431636 -> 26431635, autoUpdateGames
off): three Play-anyway launches, including the original Esc-then-Return pair, at 16:50:41,
16:52:21 and 16:52:58. The badge stayed after each, and gamelib.log had zero drop lines. The
original run differed in one known way: Settings and store/config.json disagreed on
autoUpdateGames, fixed since by quick 261114-l1j. If the badge loss returns, grep the drop line;
its path/source fields name the cause.
