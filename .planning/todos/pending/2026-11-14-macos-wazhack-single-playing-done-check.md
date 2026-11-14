---
created: 2026-11-14T00:00:00.000Z
title: 'macOS: confirm a Steam rungameid launch gets exactly one Playing and one Done (poller + launch watch)'
area: launch
files:
  - src/backend/storeManagers/steam/library/runningPoll.ts
  - src/backend/storeManagers/steam/steamLaunchWatch.ts
severity: minor
platform: macos
ready: live-gate
---

## Problem

The Mac half of the RunningAppID poller live gate (quick 261111-a9g) was never run. The poller todo
(`.planning/todos/completed/2026-11-11-revive-steam-runningappid-poller-under-tauri.md`) was closed by
66.4-23 on the Windows regression pass (66.4-WINDOWS-UAT items 5-6), per D-66.4-06.

Low risk: on macOS Steam wrote no `RunningAppID` while WazHack 264160 ran (2026-11-11), so only
`steamLaunchWatch` reports and the poller stays silent. The check guards against a Mac Steam that
starts writing `RunningAppID`, where the wire would carry `playing` (watch), `playing` (poller), `done`
(the frontend collapses the repeat; see 7wo).

## Solution

On the Mac, run `pnpm tauri:dev`, launch WazHack 264160 from GameLib, quit in-game. Expect exactly one
Playing and one Done on the card with no flicker, and `SteamGame.watch` lines in gamelib.log. Record
whether `Steam: started running-game poller` appears at boot and whether the poller logged anything for
264160.
