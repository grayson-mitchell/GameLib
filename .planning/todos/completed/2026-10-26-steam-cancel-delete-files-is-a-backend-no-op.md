---
created: 2026-10-26T00:00:00Z
title: "Steam download cancel cannot delete partial files: removeDownloaded is gated on GameInfo.folder_name, which Steam never sets"
source: quick 261026-t7b planning
area: steam-install
files:
  - src/backend/downloadmanager/downloadqueue.ts:335
  - src/frontend/helpers/library.ts
severity: medium
platform: any
ready: code
---

## Problem

`cancelCurrentDownload({removeDownloaded: true})` in
`src/backend/downloadmanager/downloadqueue.ts` only deletes files when
`libraryManagerMap[runner].getGame(appName).getGameInfo().folder_name` is truthy.
Nothing under `src/backend/storeManagers/steam/` ever sets `folder_name`, so for
Steam the delete path silently keeps every file. It also leaves
`steamResumePending` set, so the next Install click resumes the "deleted" install.

Keep-files does work for Steam: the abort returns `{status:'cancelled'}`,
`markSteamInstallIncomplete` sets `steamResumePending`, and
`reconcilePartialState` skips sha1-verified files on resume.

Because of this, the cancel dialog (quick 261026-t7b) hides "Delete Files" for
`runner === 'steam'` and shows only [Keep Downloading] [Stop & Keep Files].

## Fix direction

Add a Steam-aware delete that removes `steamapps/common/<installdir>`, the
downloading/staging tree and the appmanifest ACF, and clears the
`steamResumePending` flag. Then restore the Delete Files button for Steam in
`handleStopInstallation` (`src/frontend/helpers/library.ts`).

## Closed 2026-10-27 (quick 261027-cux)

Shipped:

- New `src/backend/storeManagers/steam/cancelDelete.ts` exporting
  `deleteCancelledSteamInstall(appId, opts?)`. Guards: numeric appId; bounded
  wait (60s, unref'd timer) for `isNativeInstallInFlight` to go false; the
  breadcrumb (`steamResumeTargetSteamappsDir` / `steamResumeInstalldir`) is the
  only source of targets and `steamResumePending` must be true; the steamapps
  dir must resolve to a known Steam library, the GameLib bottle or the bridge
  bottle; installdir must be non-blank, pass `sanitizeInstalldir` unchanged and
  be a single segment under `common/`; refuse when the ACF has StateFlags bit 4;
  a dir shared with another appId's manifest is kept (only this appId's ACF is
  removed). Never throws; every refusal is logged and keeps files and flag.
- Native layout finding: there is no staging or downloading tree. The depot
  writer puts files straight into `common/<installdir>` and writes the manifest
  through `appmanifest_<appId>.acf.tmp`. So exactly `common/<installdir>`,
  `appmanifest_<appId>.acf` and `appmanifest_<appId>.acf.tmp` are removed.
  `steamapps/downloading`, `temp`, `depotcache` and the shared redist cache are
  left alone.
- Settle-before-delete: the delete waits until the aborted native run has
  settled, so the late `markSteamInstallIncomplete` cannot re-set
  `steamResumePending` after `clearSteamResumeBreadcrumb` runs.
- `cancelCurrentDownload` in `downloadqueue.ts` routes `runner === 'steam'`
  through `deleteCancelledSteamInstall`; other runners are unchanged.
- The cancel dialog shows [Delete Files] [Keep Downloading] [Stop & Keep Files]
  for Steam again; `messageSteam` removed.
