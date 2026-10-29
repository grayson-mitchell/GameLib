---
created: 2026-10-29T00:00:00.000Z
title: Spike finer-grained progress for Steam-performed downloads in the Downloads view
area: steam
severity: minor
platform: macos
ready: live-gate
found_by: "Discussion after quick 261029-iwy / spikes 047-049 (deferred 'let Steam download Mac-native games' setting)"
files:
  - src/backend/storeManagers/steam/library.ts
  - src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts
---

## Problem

When Steam itself performs a download (today's handoff routes, and the deferred setting to let
Steam download Mac-native games instead of GameLib's depot downloader), the Downloads view gets
its progress from the install poller reading the ACF every 3 s (`BytesDownloaded` /
`BytesToDownload`, with speed and ETA derived from them). Steam only rewrites the ACF about once
per whole percent, so progress moves in steps and the speed reading on a large game is jumpy.
Seen in the spike 048/049 logs and the quick 260822-uri speed-graph work.

## Candidate sources (both untested as progress signals)

| Source | What it could give | Risk |
| --- | --- | --- |
| Byte total of `steamapps/downloading/<appId>/` | Near-live bytes while Steam downloads, since chunks are staged there before commit | If Steam pre-allocates files at full size, folder size won't track progress |
| `logs/content_log.txt` | Steam's own `Current download rate: X Mbps`, plus phase lines (Downloading, Verifying, Committing) | Log format is undocumented; rate lines are periodic, not per chunk |

## Spike

Watch one Steam-performed download of a mid-size owned game (a few GB) with native Mac Steam
running. Sample all three sources every second (ACF Bytes*, staging-folder byte total, and
content_log rate and phase lines) and compare them against wall-clock time. Answer these:

- Does the staging-folder total grow smoothly, or does it jump to full size at preallocation?
- How often do the ACF and the content_log rate update?
- Which source, or which combination, gives a smooth percent and a stable speed?

Reuse the harness in `.planning/spikes/047-running-steam-adoption/probe.mjs`. Note that
`steam://install` opens Steam's install dialog and needs a click (corrected in 047-049), so the
operator must click Install to start the download.

## Done when

The spike README has a verdict naming which source(s) to read for the Downloads hero during a
Steam-performed download, and the cadence each one actually achieved.
