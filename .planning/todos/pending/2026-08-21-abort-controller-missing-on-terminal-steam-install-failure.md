---
created: 2026-08-21
title: "Terminal Steam install failure logs ERROR: no matching abort controller"
area: steam-depot
status: OPEN
severity: minor
files:
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/storeManagers/steam/depot.ts
resolves_phase: 37
planned_as: 37-05
---

## Symptom

Immediately after a terminal Steam install failure, in the same millisecond block:

```
(20:35:52) [INFO]  [DownloadManager]: Aborting in-flight download for 259130 after terminal install failure
(20:35:52) [ERROR] [Backend]: Aborting not possible. Could not find a matching abort controller for 259130
```

The teardown path asks to abort a download whose abort controller is not registered (or was
already removed). Logged at **ERROR** severity, so it is not a cosmetic notice.

## Why it is worth fixing even though the install already failed

The failure path ran to completion here, so the visible impact is a spurious ERROR line. But an
abort controller that cannot be found on the failure path is equally absent on a **user-initiated
cancel** — the case where a non-aborting download actually matters. Whether cancel is affected
was NOT tested; that is the first thing to check.

## Repro

Trigger any terminal Steam depot install failure. Observed 2026-08-21 under `pnpm tauri:dev`,
appid 259130, reproduced on both attempts (20:35:52 and 20:41:36).
