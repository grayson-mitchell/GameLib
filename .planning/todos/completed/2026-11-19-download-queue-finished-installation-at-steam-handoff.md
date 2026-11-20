---
created: 2026-11-19T00:00:00.000Z
title: 'Download queue logs "Finished Installation" at a Steam-client handoff'
area: steam
severity: minor
platform: any
ready: code
resolved: 2026-11-21
resolution: "fixed by quick 261121-97s — SteamGame.install()'s steam://install and InstallApp hand-off returns now carry handedOffToSteam, installQueueElement/updateQueueElement forward it, and the queue logs \"<Installation|Update> of <appId> handed off to the Steam client\" instead of \"Finished\""
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

## Resolution (2026-11-21, quick 261121-97s)

Two code commits:

- `fix(quick-261121-97s): log a Steam-client install hand-off as handed off, not Finished` (2c72b10a7)
- `fix(quick-261121-97s): forward the Steam update hand-off flag so the queue logs handed off, not Finished` (f16f58990)

The marker is `InstallResult.handedOffToSteam`, not the `installManagedExternally` capability. The
capability is true for every Steam install, including GameLib's own depot installs (native, bottle,
bridge), which really have finished when they return `done`, so keying on it would mislabel them.
`managedBySteam` is a `GameStatus` badge field, not an install-result field.

The Steam update hand-off got the same fix (discretion): `updateQueueElement` already computed the
flag and now forwards it, so an update logs "Update of <appId> handed off to the Steam client".

Unchanged: the toast suppression for Steam, the finished-list record of a handed-off install, the
dequeue, and the Steam status badge flow.
