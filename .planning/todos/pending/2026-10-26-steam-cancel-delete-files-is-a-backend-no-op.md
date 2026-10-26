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
