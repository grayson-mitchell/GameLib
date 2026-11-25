---
created: 2026-11-25T04:30:00.000Z
title: "Version-change cache clear races the startup GOG refresh and empties gog_api_info.json"
area: gog-library
files:
  - src/backend/sidecar/shellFilesFlowRegistration.ts (clearCache handler, version-change branch ~line 268)
  - src/backend/storeManagers/gog/library.ts (init() -> refresh(), ~line 104)
  - src/frontend/components/UI/NavShell/components/HeroicVersion/index.tsx (clearCache(false, true), ~line 71)
severity: minor
platform: any
ready: code
---

## Problem

Found in the live check of `.planning/debug/resolved/gog-offline-empties-cache.md` (2026-11-25), online
version-change launch:

- 17:24:46 `Connectivity: online`, then the sidecar's startup GOG refresh logs `Getting GOG library`
- 17:24:47 renderer `Updated to a new version, cleaaning up the cache.` -> clearCache runs at once (online)
- 17:24:47 `Saved games data`

The startup refresh begins before the renderer's version check, so the clear runs mid-refresh or after it.
End state: `gog_library.json` intact (13,756 B, written last) but `gog_api_info.json` emptied to 66 B.
No `No cache found, getting data from gog` follows, so nothing refills api_info until the next refresh.

Not caused by the offline fix (92d9c391a): when online the clear still runs immediately, as it did before.
Impact is small: api_info is a details cache and the next GOG refresh refetches it.

## Fix direction

Order the two: either the version-change clear happens before the startup library refreshes start (e.g.
the backend decides "version changed" at boot instead of waiting on the renderer), or clearCache cancels
and re-runs an in-flight GOG refresh, or the refreshLibrary push after the clear always refetches GOG
when api_info is empty.

## Done when

An online launch after a version change ends with both GOG cache files populated, and a jest case covers
"clear during an in-flight refresh still leaves api_info filled".
