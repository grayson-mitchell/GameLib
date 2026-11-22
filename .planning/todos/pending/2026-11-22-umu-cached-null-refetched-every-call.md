---
created: 2026-11-23T05:00:00.000Z
title: "umu id lookup: a cached miss (null) is asked for again on every call"
area: info
files:
  - src-tauri/crates/gamelib-info/src/umu.rs (get: the `!is_falsy` cache check)
  - src/backend/wiki_game_info/umu/utils.ts (getUmuId: `if (cachedValue) return cachedValue`)
  - src/backend/wiki_game_info/stores.ts (umuStore: `invalidateCheck: (data) => !data`)
severity: minor
platform: linux
ready: code
---

## Problem

`getUmuId` writes `null` for a confirmed miss (umu answered an empty list) and then reads the cache with
`if (cachedValue) return cachedValue`. A cached `null` is falsy, so the lookup goes to the network again on every
call, and the `umu` store's `invalidateCheck: (data) => !data` also means an expired entry is only evicted when its
value is falsy. The cache therefore never saves a request for a title umu does not know: each wiki info refresh on
Linux (30 day wiki cache, and every stale-self-heal refetch inside it) asks umu again.

Phase 86 (86-20, D-03) copied this exactly into `gamelib-info` `umu::get`; the 86-06 golden
`umu-cached-null-is-refetched` pins it (a null cached 5 minutes ago still makes the request).

## Why it is parked

It is one small GET to a public endpoint per wiki refresh, on Linux only, and the answer is correct each time.
Fixing it changes the cache contract the renderer-visible `umu` store has had since it shipped.

## If it ever matters

Read the cache with a presence check instead of truthiness (a stored `null` is a hit), keep `invalidate WhenFalsy`
only if an expired miss should be retried, re-record the `umu-cached-null-is-refetched` golden, and decide a lifespan
for a miss (it is 6 hours today, like a hit).
