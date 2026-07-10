---
quick_id: 260711-alc
slug: throttle-steam-metadata-fetches
date: 2026-07-11
type: quick
---

# Fix: throttle Steam metadata fetches on cold cache

## Problem

On a fresh/wiped cache the library renders all games (376 in the reporter's
account) and each fires `SteamGame.fetchMetadataIfNeeded()` →
`axios.get(store.steampowered.com/api/appdetails)`. There was **no concurrency
cap and no request timeout**, so hundreds of parallel TLS connections hit
Steam's CDN at once and mass-timed-out (`connect ETIMEDOUT ...:443`) — only ~14
of 376 succeeded, so art (whose URLs come from that metadata) never loaded.

Secondary symptom: the saturated main process was slow to promote a queued
Steam install from `queued` → `installing`, making installs look stuck.

`pendingFetches` only dedupes per-AppID; it does not bound overall concurrency.

## Fix

`src/backend/storeManagers/steam/state.ts`
- Add a small concurrency semaphore: `acquireMetadataSlot()` /
  `releaseMetadataSlot()` capping in-flight fetches at
  `MAX_CONCURRENT_METADATA_FETCHES = 5`; over-cap callers queue and are handed a
  slot on release.
- Export `METADATA_FETCH_TIMEOUT_MS = 15000`.

`src/backend/storeManagers/steam/games.ts`
- `fetchMetadataIfNeeded`: `await acquireMetadataSlot()` after the per-AppID
  dedup guard; add `{ timeout: METADATA_FETCH_TIMEOUT_MS }` to the `axios.get`;
  `releaseMetadataSlot()` in the `finally`.

## Verification

- New `__tests__/state.test.ts` unit-tests the semaphore (grants up to MAX,
  queues the over-cap request, hands it the slot on release).
- Updated two `games.test.ts` assertions for the new `axios.get(url, {timeout})`
  signature.
- `npm run codecheck` 0, eslint 0 errors, full suite 915/915.
- Runtime re-check pending in the running dev app (art should drain steadily).
