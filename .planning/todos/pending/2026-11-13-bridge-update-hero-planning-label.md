---
created: 2026-11-13T00:00:00.000Z
title: 'Show a planning label on the hero during the long pre-job work of a bridge update'
area: steam
severity: minor
platform: any
ready: live-gate
source: '.planning/phases/74-steam-game-updates/74-REVIEW.md WR-07 and 74-UAT.md item 6b (deferred by the 74 gap-closure scope, 2026-11-13)'
files:
  - src/backend/storeManagers/steam/depotRust/progressBridge.ts:45-58
  - src/backend/downloadmanager/utils.ts:486
---

## Problem

`stage:delta_planning` sets the context `steam-update-planning`, and nothing clears it on
`planned`. The long pre-job TypeScript work (estimate with the lease, buildDepotRefs,
retired-key fetches) runs before any stage event, under the generic `updating` status, so the
hero shows no planning label. The root cause of the missing label is not confirmed from source
(UAT 6b); treat the review's account as a hypothesis.

## Fix direction

Emit the planning status from TypeScript before the estimate. Send a plain `updating` status on
`planned`. Confirm the root cause live first, since it is unconfirmed.

## Done when

During a bridge update the hero shows the planning label from the moment the user confirms until
transfer starts, then switches to the plain updating state. Checked live.
