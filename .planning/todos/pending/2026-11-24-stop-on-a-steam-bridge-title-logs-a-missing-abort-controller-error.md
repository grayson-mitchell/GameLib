---
created: 2026-11-24T10:00:00.000Z
title: "Stop on a Steam bridge title logs an ERROR: no matching abort controller"
area: launch
files:
  - src/backend/aborthandler/aborthandler.ts (:44, the missing-controller error)
  - src/backend/storeManagers/steam/gameLaunch.ts (the bridge launch that never registers a controller)
severity: minor
platform: macos
ready: code
---

## Problem

In the 87-59 live gate (2026-11-24), pressing Stop on a Steam bridge title (Avernum 6, app id 206060) ended the game
correctly and then wrote this line to `~/Library/Logs/GameLib/gamelib.log`:

`[ERROR][Backend] Aborting not possible. Could not find a matching abort controller for 206060` (`aborthandler.ts:44`)

Stop worked on every Steam bridge title and on the built-in engine; the error is noise written at ERROR level for a normal
action. It hides real errors in a log that users upload.

## Not fixed in Phase 87

Recorded from the 87-59 run's non-gate observations. The user decided on 2026-11-24 to fix the five gate findings (F1 to F5)
and the engine log in Phase 87 and to track the rest as todos, so this is deliberately not planned there.

## To do

Find whether the bridge launch should register an abort controller, or whether the Stop path should skip the abort when none
exists, and log at a level that matches what happened.
