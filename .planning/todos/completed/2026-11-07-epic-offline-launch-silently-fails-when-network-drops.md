---
created: 2026-11-07T00:00:00.000Z
title: 'Epic offline launch silently fails when the network drops just before launch'
area: launch
severity: medium
platform: any
ready: code
found_by: 'Phase 62 smoke 2 (62-UAT.md), pre-existing, not caused by phase 62'
---

isOnline() lags right after network-off and isEpicServiceOffline() (src/backend/utils.ts ~:240) returns false on an ENOTFOUND fetch error, so legendary launch runs without --offline and fails login (Login failed, cannot continue!). No user-facing error is shown. Treat fetch errors as offline and surface a launch error.

## Resolution (code fix, quick 261111-8b5, 2026-11-11)

Network-level status-fetch failures, where the request went out and no response came back, now count as offline in isEpicServiceOffline via src/backend/utils/epicServiceStatus.ts, so the launch gets --offline. HTTP-error responses keep the old online result. No outage notification is shown for a local network failure; one warning naming the error code is logged instead.

LegendaryGame.launch() now raises a "Launch aborted" dialog when legendary's output carries a login-failure marker (expired credentials / network / generic sign-in failure), via src/backend/storeManagers/legendary/launchFailure.ts. The captured output is bounded and never logged or shown.

Desk-verified by unit tests only. A live re-check is still open: turn the network off, launch an Epic canRunOffline game at once, and expect it to start offline. Then do the same with a game that cannot run offline and expect the dialog.

Accepted side effect: in the same lag window, an Epic install/update now refuses up front with the existing "Epic Servers are having major outage" dialog instead of running a doomed legendary install. The wording is a candidate follow-up.
