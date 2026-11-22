---
created: 2026-11-23T08:00:00.000Z
title: "Rust wiki GOG path makes its own GOG GETs and never writes GOG's gog_api_info cache"
area: info
files:
  - src-tauri/crates/gamelib-info/src/wiki/gog_ctx.rs (gamesdb_release, gog_store_url)
  - src/backend/storeManagers/gog/library.ts (getGamesdbData, getGamesData: the TS path and its apiInfoCache)
  - src/backend/storeManagers/gog/games.ts (getExtraInfo: the requirements and changelog requests Rust skips)
severity: minor
platform: any
ready: code
status: CLOSED
closed: 2026-11-23
closed_by: "operator decision -- won't fix; D-23 stands"
---

## Problem

Phase 86 decision D-23 moved the two unauthenticated GOG requests the wiki lookup needs into Rust:
`gamesdb.gog.com/platforms/<store>/external_releases/<id>` (the Steam id of a non-Steam title) and
`api.gog.com/v2/games/<id>?locale=en-US` (the store link HowLongToBeat's GOG branch reads). The TS made them
through the GOG library manager, which stored every GamesDB answer in `gog_api_info` (keyed `<store>_<id>`, with its
ETag) and, for the store link, first built the system-requirements array and fetched the product changelog
(`getExtraInfo`).

The Rust path does none of that, so after the wiki lookup moves to Rust (86-22 and 86-23):

- a GOG, Epic or Amazon game's GamesDB answer is no longer written to `gog_api_info`; the other reader of that cache
  (the GOG manager's own `getGamesdbData` with `forceUpdate` unset) will find fewer entries and ask the network
  itself;
- the requirements and changelog requests are not made for a wiki lookup (the recorded `tsOnly` exchanges), so a
  GOG answer with a malformed `_embedded` block, which made the TS reject and failed the whole wiki lookup, no
  longer does;
- nothing sends an `If-None-Match`, so a GamesDB answer is always the full body.

## Why it is parked

The cache was a side effect of the wiki lookup, never its contract: the wiki lookup forced an update every time
(`getGamesdbData(..., true)`), so it never read its own entries, and the renderer-visible results are identical.
The decision (D-23) was taken with the operator knowing this.

## If it ever matters

Have the GOG manager (when it moves to Rust) own `gog_api_info` and call `gog_ctx::gamesdb_release` through it, or
give `gamesdb_release` a store-host write guarded to the GOG store. Re-record the GOG wiki goldens without the
`tsOnly` flags.

## Resolution

**CLOSED 2026-11-23 (operator decision): won't fix. D-23 stands.**

Nothing needs the entries the wiki lookup used to leave in `gog_api_info`. The lookup always forced an update and
never read them back, and the renderer gets the same results either way. The only other reader, the GOG manager's
own `getGamesdbData`, fetches from the network when it misses.

Two options were weighed and rejected:

- **Rust writes `gog_api_info.json` directly.** The file belongs to a sidecar `CacheStore`
  (`src/backend/storeManagers/gog/stores.ts`) that keeps it in memory and commits it during a library refresh
  (`use_in_memory` / `commit`). A second writer would race it, and the sidecar's copy would overwrite Rust's.
- **Rust hands each answer to a sidecar handler that calls `apiInfoCache.set`.** That adds an IPC round-trip
  per lookup to fill a cache nothing depends on.

Reopen this when the GOG manager moves to Rust and owns `gog_api_info`. At that point have `gog_ctx::gamesdb_release`
go through it, as "If it ever matters" above describes.
