---
created: 2026-11-24T10:00:00.000Z
title: "The CrossOver trial notice has no dismiss control and its Buy CrossOver button is not logged"
area: engine
files:
  - src/frontend/screens/Game/GamePage/components/EngineNotices.tsx (:29-38, the in-page trial notice and its Buy button)
  - .planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md (item 2, the contract text that implied a dismiss)
severity: minor
platform: any
ready: human
---

## Problem

In the 87-59 live gate (2026-11-24), item 2's trial notice read "CrossOver trial: 5 days remaining. When the trial ends,
GameLib will switch this game to its built-in engine (best-effort)." It is an in-page notice (not a toast) with a Buy
CrossOver button and no dismiss control. The 87-HUMAN-UAT contract text implied a dismiss. Pressing Buy CrossOver writes no
log line, so a click on it cannot be confirmed from `gamelib.log`.

The two dismissable engine notices were already dismissed in the notices store, so the owed 56c-3 check (dismissal handled by
Rust alone) was not run.

## Not fixed in Phase 87

Recorded from the 87-59 run's non-gate observations. The user decided on 2026-11-24 to fix the five gate findings (F1 to F5)
and the engine log in Phase 87 and to track the rest as todos, so this is deliberately not planned there.

## To do

Decide whether the trial notice should be dismissable (a product call: a countdown the user cannot hide for 7 days, against a
notice that hides the one warning before the engine switches). Then either add the control or correct the contract wording,
and log the Buy click if the control stays.
