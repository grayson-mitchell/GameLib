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

## Resolution (quick 261027-g9o, 2026-10-27)

Root cause: the poll watched the wrong steamapps root. `resumeInterruptedSteamInstall` starts a bare
`startInstallPolling(appId)` (source `native`). games.ts's finalize handoff then called it again with
`{ source: 'bottle', isNativeHandoff: true }`, but the existing-entry upgrade branch adopted only
`isNativeHandoff`. `source` was a `const` captured by the interval closure, so the poll kept reading
the native root and never saw the StateFlags=4 manifest in GameLibSteam. Once the native run left
flight, the GRACE_TICKS branch fired. `seenDownloading` was a symptom, not the cause.

Fix: each poll entry now carries a mutable `source`, and every tick reads `entry.source`. Only an
`isNativeHandoff: true` call with an explicit, differing `source` retargets the poll. That call
logs `switching in-flight install poll … from source A to B` and resets the per-root progress
baselines. Code `6a36daf3b`, tests `3a20a68f9` (Tests E–G in library.test.ts, 242/242).
Not live-gated: a re-run of a resumed bottle install (e.g. Legends of Eisenwald 246760).
