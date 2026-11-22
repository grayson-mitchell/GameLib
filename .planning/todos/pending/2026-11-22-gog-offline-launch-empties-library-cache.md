---
created: 2026-11-22T05:00:00.000Z
title: "An offline launch empties the GOG library cache (gog_library.json, gog_api_info.json)"
area: gog-library
files:
  - src/frontend/state/libraryState.ts (refreshLibrary no-cache branch, ~line 632)
  - src/backend/storeManagers/gog/library.ts (refresh writes the result even when every fetch failed)
severity: medium
platform: any
ready: code
---

## Problem

Found in the Phase 85 live gate (85-20, launch 1, 2026-11-22). The gate's first v0.11.0 launch ran with
Wi-Fi off. The renderer took the `No cache found, getting data from gog...` branch, called
`refreshLibrary('gog')`, and every GOG fetch failed (8 × `Could not get game info for <id>`). The refresh
still completed and **wrote** its empty result:

- `store_cache/gog_library.json` went from 10 games to a 66-byte file with none
- `gog_api_info.json` went from 104 KB to 66 B
- the library showed GOG 0 instead of 10

An online Refresh afterwards refetched the same 10 games and the same 104 KB, so nothing was lost for
good. But an offline start shouldn't wipe a good cache.

## Two parts

1. **Why the renderer saw "no cache".** The v0.10.0 baseline also logged `No cache found` while the
   10-game file was on disk (it was online, so it refetched and nobody noticed). So the renderer's read of
   the GOG cache comes back empty even when the file isn't, on both builds. That means this is probably not
   a Phase 85 regression. Still check that the 85-16 Rust snapshot serves `gog_library` / `gog_api_info`
   to `loadGOGLibrary`.
2. **A failed refresh must not overwrite a good cache.** When every fetch fails (offline, ENOTFOUND), keep
   the existing cache and report the refresh as failed. Today the empty result is persisted.

## Evidence

The gate dir `/tmp/gamelib-gate-2026-11-22T03:38:53Z/` holds `launch1-gog_library.emptied.json` and
`gamelib-launch-1.log`, plus the related notes in `notes.log` and 85-20-SUMMARY.md (item 3).

## Done when

An offline launch with a populated GOG cache leaves both files byte-identical and shows the cached games.
A jest case covers "refresh with every fetch failing keeps the cache".
