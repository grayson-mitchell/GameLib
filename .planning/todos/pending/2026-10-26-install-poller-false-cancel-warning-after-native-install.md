---
created: 2026-10-26T07:55:17.273Z
title: "Install poller logs \"no manifest detected; user may have cancelled\" after a successful native install into GameLibSteam"
source: 51-UAT item 22 (2026-10-26)
area: steam
files:
  - src/backend/storeManagers/steam/library.ts:3008
severity: minor
platform: any
ready: code
---

## Problem

Legends of Eisenwald (246760) resumed and installed into the GameLibSteam bottle. `Writing StateFlags=4 full-ownership manifest for appId 246760` was logged at 20:28:34, then `Steam: upgrading in-flight install poll for appId 246760 to isNativeHandoff (260822-dkf D-02)` and `[DownloadManager]: Finished Installation of 246760`. Ten seconds later the poller logged `Steam: install polling for appId 246760 stopped after grace window (20 ticks) — no manifest detected; user may have cancelled` (library.ts ~3008) and sent a `gameStatusUpdate` `done`. The library entry correctly ended up installed at the GameLibSteam path, so the visible effect was only the false warning.

This poll started as `source native, isNativeHandoff false`. A second install of Luxor 3 (15930) started as `source bottle, isNativeHandoff true`, and that poll completed normally (`install polling complete … badge flipped to installed`). The resume-path poll probably never sets `seenDownloading`, or watches a different steamapps dir than the one the manifest was written to.

## Solution

TBD. Find which steamapps dir the resume-path poll watches, and why `seenDownloading` stays false after the upgrade to `isNativeHandoff`. Then treat a manifest at StateFlags 4 in the actual target dir, or a completed native install for that appId, as success.
