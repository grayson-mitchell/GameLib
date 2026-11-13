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

## Resolution

Fixed by quick task 261114-at7 (`9c092bf21`, `8e26a1406`). From source, UAT 6b's missing label
came from the depotJobEvent schema dropping stage events before `378aa80b1`. WR-07 was still real:
`runBridgeUpdate` sent no status before the estimate, and nothing cleared `steam-update-planning`
on `planned`. `runBridgeUpdate` now sends `updating` + `steam-update-planning` before the estimate.
`createProgressBridge` in update mode sends a plain `updating` on `planned`, which also covers the
stale-journal fallback that emits `planned` with no stage.

Live verified 2026-11-14 08:41 NZDT on Core Keeper (1621690), bridge, staged stale via buildid
26332184 to 26332183. On the Downloads hero the operator saw "Planning update…" from confirm, then
"Applying update…"; `Finished Update of 1621690`. The update downloaded nothing, so the plain-updating
step between the two labels was too brief to observe; it is covered by `progressBridge.stage.test.ts`.
