---
created: 2026-11-14T00:00:00.000Z
title: 'Stale-build finish guard does nothing when the ACF target equals the installed build'
area: steam
severity: minor
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-REVIEW.md WR-02 (gap-closure round 4, deferred at phase close 2026-11-14)'
files:
  - src/backend/storeManagers/steam/updateNative.ts:88-98
  - src/backend/storeManagers/steam/library/updatePollOnce.ts
---

## Problem

`updateNative.ts` prefers the ACF `TargetBuildID` over the newer PICS build whenever the ACF is
pending. A pending ACF whose `TargetBuildID` still equals `buildid` makes the hand-off record
`targetBuild === fromBuild`, so 74-34's `atStaleStart` guard is inert and the false
`finished (build <stale>)` from UAT 25 can come back on that path. Live captures of Steam's ACF have
not shown this shape yet.

## Solution

Ignore an ACF target that equals `buildid` (fall through to the PICS target), and add a test for
`targetBuild === fromBuild`. Review also notes (WR-03, not filed separately) that the InstallApp
retry can fire on an update Steam has queued or the user paused; consider gating the retry on
`bytesDownloaded === 0` with no partial progress seen while here.

## Resolution

2026-11-14, `657b6e262`: `updateNative.ts` drops an ACF `TargetBuildID` equal to `buildid`, so a
pending ACF in that shape falls through to the PICS target. New test: pending ACF (StateFlags 6,
TargetBuildID == buildid 5820077) with PICS 5820078 hands off `{ fromBuild: '5820077',
targetBuild: '5820078' }`; it fails on the unfixed source. The poll side needed no change: UAT 25's
existing tests already prove no `finished` at the stale build once the target differs.

WR-03 (gate the InstallApp retry on `bytesDownloaded === 0`): not done, deliberately. The retry is
armed only after the user clicks Update while Steam is closed, so resuming a paused or queued update
is what they asked for; gating it would make that click a no-op for a part-downloaded update on a
game set to "only update when launched".
