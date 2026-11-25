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

## Cause (found by the Phase 85 verifier, 2026-11-22)

Before the `No cache found` line, `gamelib-launch-1.log` line 21 shows `Updated to a new version, cleaaning up the cache.`, and the v0.10.0 baseline logs the same message (`gamelib-old-after-p5.log` line 126). The renderer's `HeroicVersion` effect calls `clearCache(false, true)` on any version change. That clears the GOG cache, and offline the refetch can't refill it. So this is the app's version-change cleanup, not the Phase 85 store host. Another session's debug record, `.planning/debug/gog-offline-empties-cache.md`, reaches the same cause. The fix is to not clear (or to keep) the library caches on a version change when the refetch can't succeed.

## Evidence

The gate dir `/tmp/gamelib-gate-2026-11-22T03:38:53Z/` holds `launch1-gog_library.emptied.json` and
`gamelib-launch-1.log`, plus the related notes in `notes.log` and 85-20-SUMMARY.md (item 3).

## Done when

An offline launch with a populated GOG cache leaves both files byte-identical and shows the cached games.
A jest case covers "refresh with every fetch failing keeps the cache".

## Resolution (2026-11-25)

Fixed in 92d9c391a, live-verified 2026-11-25. Session: `.planning/debug/resolved/gog-offline-empties-cache.md`.
The two-part account above is wrong: the renderer read path is fine, and offline refresh() writes nothing.
The writer was the version-change clearCache(false, true), which now waits for a connection. The
"all fetches failed" guard was added anyway, since an online refresh could overwrite the cache that way.
