---
created: 2026-11-19T00:00:00.000Z
title: 'Download queue logs "Finished Installation" at a Steam-client handoff'
area: steam
severity: minor
platform: any
ready: code
files:
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/storeManagers/steam/gameInstall.ts
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
---

## Problem

When a Steam install is delegated to the Steam client (`steam://install/<appId>`), `install()` returns
`{ status: 'done' }` right after `startInstallPolling(...)` (gameInstall.ts, both the macOS and the
Windows delegated paths). The queue then logs `[DownloadManager]: Finished Installation of <appId>`
(downloadqueue.ts ~594-621) in the same second as the handoff, while Steam is still downloading. The
ACF poll owns completion and the badge, so nothing breaks, but the line misled the Phase 81 live
gate (see resolved debug `win-steam-handoff-progress-zero`). `installManagedExternally` already
suppresses the toast but not the log line.

## Direction

For a `managedBySteam`/`installManagedExternally` result, log "handed off to the Steam client"
instead of "Finished Installation". Cover it with a downloadqueue unit test.
