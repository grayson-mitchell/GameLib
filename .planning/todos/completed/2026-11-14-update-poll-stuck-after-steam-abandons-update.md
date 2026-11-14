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

## Resolution

2026-11-14, `b9ff5638d`: `updatePollOnce` counts consecutive ticks where, after activity, the ACF
sits settled at `fromBuild` (not pending, StateFlags bit 4, no running flags) with a known different
target. At `STEAM_UPDATE_ABANDONED_TICKS` (20, about 60 s) it ends quietly: it logs
`Steam: update of appId <id> settled back at build <fromBuild> for 20 ticks; ending the update poll quietly`,
invalidates the cached update state (the badge stays) and sends `done`, with no `finished` line.
Any other tick resets the count. Three multi-tick tests: the abandon exit, a reset by an active tick,
and the target still finishing after a settled spell. The first two fail on the unfixed source.
The quiet-end helper is shared with the no-activity exit, whose log line is unchanged.
Not seen live; reproducing it needs Steam to start and then drop an update.
