---
created: 2026-08-16T11:50:00.000Z
title: "Steam library sync captures NO platform data — it only reads the cache, so \"platforms not captured\" is reachable in ordinary use"
area: steam
severity: high
found_by: "Operator, during Phase 34.14 D-08 UAT (2026-08-16) — architectural observation, then confirmed in source"
files:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/electronStores.ts
---

## Problem

The Steam library sync does not capture platform availability. It only **reads** whatever the
metadata cache already holds:

```ts
// library.ts:753, 778-780
const cachedMeta = steamMetadataStore.get(appIdStr)
...
is_mac_native:     cachedMeta?.is_mac_native ?? false,
is_linux_native:   cachedMeta?.is_linux_native ?? false,
is_windows_native: cachedMeta?.is_windows_native,
```

`Steam: fetched 378 owned games` is `steam-user`'s `getOwnedApps()`, which returns **appIds and
names only** — no platform information. The platform flags are populated **lazily, one game at a
time**, by `fetchMetadataIfNeeded` → `store.steampowered.com/api/appdetails`
(`games.ts:647`, persisted at `games.ts:704`).

So for any game the user has never opened, there is no platform data at all, and
`is_windows_native` is `undefined` — the "never captured" state.

## Why this matters

**The "not captured" state is a normal-operation state, not an error state.** During Phase 34.14's
UAT it was initially assumed that this path was only reachable under forced network failure. That
is wrong. It is reachable whenever:

- a game's metadata has never been fetched (i.e. most of a 378-game library), or
- the appdetails fetch loses a race against the user opening the install dialog, or
- the connection is slow enough that the 15s deadline is approached.

Phase 34.14's D-04 fail-open is therefore **load-bearing in ordinary use**, not merely a
network-outage safety net. That is an argument for the phase, not against it — but it also means
the underlying data gap is worth closing on its own terms.

It also explains the companion finding
[[2026-08-16-steam-metadata-cache-lacks-is-windows-native-pre-d17-residue]]: 370 of 380 real cache
entries carry `platformsCaptured: true` with no `is_windows_native`, and nothing in the sync path
will ever repair them, because the sync never writes platform data.

## How to fix

Capture platforms at sync time so the lazy per-game path becomes a fallback rather than the
primary source:

1. **Bulk capture during sync.** Steam's `appdetails` endpoint accepts multiple appids per request
   (`?appids=a,b,c`). Batch the owned-app list and populate `is_windows_native` / `is_mac_native` /
   `is_linux_native` / `platformsCaptured` for the whole library in a bounded number of requests,
   rate-limited and resumable. Note the endpoint is undocumented and rate-limits aggressively —
   measure before choosing a batch size.
2. **Or** treat platform capture as a background backfill job after sync, so the first sync is not
   slowed but the cache converges to complete.

Either way, keep the three-valued contract intact: `undefined` = never captured, `false` =
confirmed no depot, `true` = depot present. Do **not** collapse `undefined → false` to make the
data look complete — `library.ts:764-776` documents at length why that collapse was removed, and
34.14's whole gating layer depends on the distinction surviving.

## Scope note

Not a 34.14 regression, and not something 34.14 claimed to fix. 34.14 correctly made the renderer
behave safely when the signal is missing. This todo is about the signal being missing far more
often than it needs to be.
