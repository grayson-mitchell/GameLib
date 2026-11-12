---
created: 2026-11-13T00:00:00.000Z
title: 'Give estimateBridgeUpdate a unique job key and an abort timeout'
area: steam
severity: medium
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-REVIEW.md WR-10 (deferred by the 74 gap-closure scope, 2026-11-13)'
files:
  - src/backend/storeManagers/steam/depotRust/updateEstimate.ts:100-110
  - src/backend/storeManagers/steam/updateInfo.ts:75
---

## Problem

The fixed active-job key `summary-${appId}` collides between "Show update size" and a queued
update's estimate, so one dispose can unregister the other's refresher. The estimate takes no
signal and has no timeout, so a hung lease stays held.

## Fix direction

Use a unique key per call. Pass an AbortSignal with a timeout of about 60 s.

## Done when

Running "Show update size" while an update's estimate is in flight leaves both refreshers
registered, and an estimate against a stalled lease aborts and releases it within the timeout.
