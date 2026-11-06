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
