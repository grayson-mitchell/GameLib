---
created: 2026-11-24T10:00:00.000Z
title: "A game page opened from Downloads has no way back to the Library except the app-level tabs"
area: ui
files:
  - src/frontend/screens/Game/GamePage/index.tsx (the back control and the route it returns to)
  - src/frontend/screens/Game/GamePage/components/LeftCard (where the back button renders)
severity: minor
platform: any
ready: code
---

## Problem

In the 87-59 live gate (2026-11-24), a game page opened from the Downloads screen showed a back button that returns to
Downloads. There was no obvious route from that page to the Library; the operator recovered through the app-level tabs.
Nothing was lost and nothing crashed, so this is a navigation rough edge, not a defect in the engine, bottle or wine work
the gate was about.

## Not fixed in Phase 87

Recorded from the 87-59 run's non-gate observations. The user decided on 2026-11-24 to fix the five gate findings (F1 to F5)
and the engine log in Phase 87 and to track the rest as todos, so this is deliberately not planned there.

## To do

Decide whether the game page should remember where it was opened from and offer a Library link, or whether the app-level tabs
are the intended route, and then make the back control say where it goes.
