---
created: 2026-11-25T04:30:00.000Z
title: "Offline, library tiles show no cover art"
area: library-ui
files:
  - src/backend/storeManagers/gog/library.ts (art_cover / art_square are remote URLs)
severity: minor
platform: any
ready: live-gate
---

## Problem

Found in the live check of `.planning/debug/resolved/gog-offline-empties-cache.md` (2026-11-25). On an
offline launch the GOG games showed from the cache, but with no cover art. Library art is stored as remote
URLs and loaded from the store CDNs each time, so with no network the tiles fall back to the placeholder
(`gameImg installed loaded usingFallback` in the BLANKPROBE log line).

Seen on GOG. Not yet checked for Epic, Amazon or Steam (Steam may already have local art from the client's
librarycache).

## Fix direction

Cache cover art locally (on first successful load, or during refresh) and serve the local copy when
offline, or confirm the webview HTTP cache should already cover it and find why it doesn't.

## Done when

An offline launch shows cover art for games whose art loaded at least once online, on every store.
