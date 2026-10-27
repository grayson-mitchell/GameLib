---
created: 2026-10-26T07:55:17.273Z
title: "Cancelling a native Steam download and removing it from Downloads still leaves the game on \"Resume install\""
source: 51-UAT item 24 (2026-10-26), seen on Dungeonmans 288120 and Fallout 2 38410
area: steam
files:
  - src/backend/storeManagers/steam/games.ts:4062
  - src/backend/storeManagers/steam/games.ts:1105
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/library.ts
severity: minor
platform: any
ready: code
---

## Problem

The operator cancelled an in-flight native depot download (`SteamGame: aborting in-flight native depot download for appId 288120`, `[DownloadManager]: 288120 removed from download manager.`, then `Installation of 288120 aborted!`). Afterwards the library entry still had `install.steamResumePending: true`, `steamResumeTargetSteamappsDir` pointing at the bottle, and `steamResumeInstalldir`. The partial download also stayed on disk (`GameLibSteamBridge-288120/.../common/Dungeonmans`). The game page therefore offered "Resume install". Operator: "option in game is to resume install even though I killed and removed in downloads... should just be install." Fallout 2 (38410) did the same.

`SteamGame.stop()` (games.ts ~4062) serves both pause and cancel, and only aborts the controller. Pause has to keep the resume marker, so nothing on the cancel path clears it.

Side effect: the marker also feeds WR-08's guard (`install()` keeps the bottle named by `steamResumeTargetSteamappsDir`). A stale marker from a cancelled bottled download would pin a later default-route install to GameLibSteam.

## Solution

TBD. Distinguish cancel and remove from pause where the download manager removes the entry, and on a real cancel clear `steamResumePending`, `steamResumeTargetSteamappsDir` and `steamResumeInstalldir`. Decide whether cancel should also delete the partial bits, and a freshly provisioned per-game bridge bottle that holds nothing else, or leave them for an explicit uninstall. Keep pause and resume, and the startup "interrupted install" surfacing (games.ts ~1105), unchanged.

## Closed 2026-10-27 (superseded by quick 261027-cux)

The operator hit this on 2026-10-26. At that point the Steam cancel dialog offered only
[Keep Downloading] [Stop & Keep Files] (quick 261026-t7b hid Delete Files for Steam). The logged
sequence (`aborting in-flight native depot download` → `removed from download manager.` →
`Installation of … aborted!`) is that keep-files path: `cancelCurrentDownload(false)` →
`removeFromQueue`. Downloads offers no separate "remove", so the operator had no way to discard
the partial download.

Quick 261027-cux (`6b8db906f`, `eceb1ef9b`, `9271b7e67`) restored Delete Files for Steam.
`cancelCurrentDownload(true)` now routes to `deleteCancelledSteamInstall`
(`src/backend/storeManagers/steam/cancelDelete.ts`). That function waits for the aborted run to
settle, removes `common/<installdir>` and the ACF, and calls `clearSteamResumeBreadcrumb`, which
clears `steamResumePending`, `steamResumeTargetSteamappsDir` and `steamResumeInstalldir`. The game
page then offers Install, and the stale WR-08 bottle pin is gone with the breadcrumb.

How each choice now behaves:

- **Delete Files**: partial bits and the breadcrumb are removed, and the game shows Install. This
  is the case the operator wanted.
- **Stop & Keep Files**: keeps the breadcrumb, so the game shows Resume Install and resumes into
  the same bottle. This is the label the dialog promises ("Keep the downloaded files to resume
  later"), so it is by design. Pause/resume and the startup interrupted-install surfacing are
  unchanged.

Not done, left to explicit uninstall: Delete Files does not remove a freshly provisioned per-game
bridge bottle (`GameLibSteamBridge-<appId>`); it removes only that app's install dir and ACF.

Live-confirmed 2026-10-27 on Dungeonmans (288120): cancel with Delete Files leaves the game page on
Install. Fallout 2 (38410) not retested.
