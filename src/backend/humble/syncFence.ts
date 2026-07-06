/**
 * CR-01 disconnect fence — a monotonically-increasing generation counter that
 * invalidates every in-flight Humble sync.
 *
 * HumbleUser.disconnect() wipes configStore/humbleLibraryStore/humbleSyncStore,
 * but a sync that is ALREADY RUNNING captured the cookie at start and would
 * otherwise keep making authenticated requests, keep committing
 * humbleLibraryStore entries (silently repopulating the store the disconnect
 * just wiped), rewrite humbleSyncStore's terminal state, and keep pushing
 * humbleKeysUpdated over the renderer's freshly-cleared `keys: []` — violating
 * the HSYNC-02/D-04 invariant that a stale key inventory must never survive a
 * disconnect, and enabling cross-account inventory bleed on a shared machine.
 *
 * runSync() captures the generation at start; disconnect() bumps it BEFORE the
 * wipes. Any generation mismatch marks the sync stale: workers stop issuing
 * authenticated requests at their next dispatch, and every store commit,
 * sync-state write and renderer push is skipped.
 *
 * Kept in its own leaf module (imported by both library.ts and user.ts) so the
 * fence never creates a library.ts <-> user.ts circular import (the WR-09
 * hazard class).
 */

let generation = 0

/** The current store generation — captured by runSync() at sync start. */
export function currentSyncGeneration(): number {
  return generation
}

/**
 * Invalidates every in-flight sync. Called by HumbleUser.disconnect() BEFORE
 * the store wipes so no pre-disconnect sync work can survive them.
 */
export function invalidateSyncGeneration(): void {
  generation += 1
}
