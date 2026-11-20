---
quick_id: 260711-alc
slug: throttle-steam-metadata-fetches
date: 2026-07-11
status: complete
files_modified:
  - src/backend/storeManagers/steam/state.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/state.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
---

# Summary

Throttled Steam store-API metadata fetches so a cold cache doesn't open
hundreds of parallel connections and mass-time-out. Found during Phase 17 UAT
after wiping userData: only ~14 of 376 games loaded art, and a queued install
was slow to start because the main process was saturated with hung requests.

## Changes

`state.ts`
- Added a concurrency semaphore (`acquireMetadataSlot`/`releaseMetadataSlot`,
  `MAX_CONCURRENT_METADATA_FETCHES = 5`): over-cap callers queue and receive a
  slot when one is released (slot transferred directly to the next waiter).
- Exported `METADATA_FETCH_TIMEOUT_MS = 15000`.

`games.ts` (`fetchMetadataIfNeeded`)
- Acquire a slot after the per-AppID `pendingFetches` dedup guard.
- Pass `{ timeout: METADATA_FETCH_TIMEOUT_MS }` to `axios.get` so dead
  connections fail fast and free their slot.
- Release the slot in `finally`.

## Verification

- New `__tests__/state.test.ts`: semaphore grants up to MAX immediately, queues
  an over-cap request, and hands it the slot on release.
- Updated two `games.test.ts` assertions for the `axios.get(url, {timeout})`
  signature.
- `npm run codecheck` 0; eslint 0 errors; full suite **915/915** (steam
  254/254).

## Notes

- Pre-existing Phase 2/7 metadata-path issue; only severe on a cold cache.
- Cap of 5 is conservative; can be tuned if art still drains slowly.
- The `getSteamInstallSize` estimate call (games.ts) still has no timeout — a
  single on-demand request, not part of the storm; left as-is.
- Runtime re-check pending in the running dev app.

## Self-Check: PASSED
