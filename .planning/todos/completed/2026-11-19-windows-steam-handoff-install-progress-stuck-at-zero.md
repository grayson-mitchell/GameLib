---
created: 2026-11-19T00:00:00.000Z
title: 'Windows: progress stays at 0 for an install handed to the Steam client'
area: steam
severity: medium
platform: windows
ready: live-gate
files:
  - src/backend/storeManagers/steam/gameInstall.ts
---

## Problem

Phase 81 live gate, item 10 (a), first attempt (Windows 11, 2026-11-19). The setting "Download
Steam games directly in GameLib" (`enableSteamNativeInstall`) was off in the operator's config, so
GameLib handed the install to the Steam client: gamelib.log 05:56:36
`SteamGame: delegating install for appId 237990 via steam://install/237990`, then
`[DownloadManager]: Finished Installation of 237990` in the same second. GameLib's progress for
the game stayed at 0. On macOS the same handoff path shows Steam's download progress, so the
operator expects it on every OS.

Not yet established: whether Steam actually started downloading 237990 (the install dialog may
have been waiting for confirmation), and whether the Rust install poll
(`steampoll_install_start`) reads progress from the ACF on Windows the way it does on macOS.

## Direction

Reproduce on Windows with the setting off: start the install, confirm Steam's dialog and that Steam
downloads, then compare the ACF's `BytesDownloaded`/`BytesToDownload` with what GameLib shows.
Check the terminal for `gamelib-steampoll: starting install polling for appId <id>` and its
`delegatedToSteamClient` flag. Also check why the download manager reports "Finished Installation"
at handoff time.
