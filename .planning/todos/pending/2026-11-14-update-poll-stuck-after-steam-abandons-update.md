---
created: 2026-11-14T00:00:00.000Z
title: 'Steam update poll can stay on Updating for hours if Steam abandons an update'
area: steam
severity: medium
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-REVIEW.md WR-01 (gap-closure round 4, deferred at phase close 2026-11-14)'
files:
  - src/backend/storeManagers/steam/library/updatePollOnce.ts:137-162
  - src/backend/storeManagers/steam/library/updatePollOnce.ts:207-232
  - src/backend/storeManagers/steam/__tests__/library.updatePollOnce.test.ts
---

## Problem

74-34 added an `atStaleStart` guard so the update poll no longer logs `finished` at the starting
build when a different target build is known. The quiet end only runs while `!awaiting.sawActivity`,
and the guard now blocks the other exit. So if Steam showed download activity and the ACF then
settles back at `fromBuild` (StateFlags 4, `TargetBuildID == buildid`), the poll keeps sending
'updating' plus progress from Steam's leftover byte counters every tick until `MAX_TICKS`, about 6 h.
Before 74-34 the poll ended here, with a misleading `finished` line. Not seen live; needs Steam to
start an update and then abandon it.

## Solution

Give the stale-start-after-activity case its own bounded exit (end quietly, keep the badge), and add
a multi-tick test: activity seen, then the ACF settles at `fromBuild` with a known newer target.
