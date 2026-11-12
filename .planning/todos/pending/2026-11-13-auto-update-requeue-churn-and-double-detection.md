---
created: 2026-11-13T00:00:00.000Z
title: 'Stop auto-update re-queueing failing updates each refresh and running detection twice'
area: steam
severity: medium
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-REVIEW.md WR-08 remainder and 74-UAT.md item 14 (deferred by the 74 gap-closure scope, 2026-11-13)'
files:
  - src/backend/utils/checkGameUpdates.ts:50-63
  - src/backend/storeManagers/index.ts
  - src/backend/storeManagers/steam/updateBridge.ts
---

## Problem

A failing auto-update is re-queued on every refresh, with an error dialog each time, and update
detection runs twice per refresh. UAT 14 saw three "Auto-Updating All Will Fall" notifications
for one game. The unattended-authentication half of WR-08 was fixed by plan 74-19; this is the
remainder.

## Fix direction

Record a per-build "auto-update attempted" marker so a failed build is not retried on every
refresh, make the auto path raise no error dialog, and share one detection result between the
two callers in a refresh.

## Done when

Two consecutive refreshes with a failing auto-update produce one attempt and one notification
for that build, and the log shows one detection pass per refresh.
