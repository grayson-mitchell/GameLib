import { GameInfo } from 'common/types'

/**
 * Shared in-memory library Map — populated by SteamLibraryManager.refresh()
 * and read by SteamGame.getGameInfo(). Lives here (not in library.ts) so that
 * games.ts (plan 03) can import it without creating a circular dependency.
 */
export const library = new Map<string, GameInfo>()

/**
 * Tracks in-flight metadata fetches so SteamGame.fetchMetadataIfNeeded()
 * does not fire concurrent requests for the same AppID.
 * Mitigates T-2-03 (Tampering — repeated CM calls).
 */
export const pendingFetches = new Set<string>()

/**
 * Concurrency limiter + timeout for Steam store-API metadata fetches.
 *
 * On a cold cache a large library (hundreds of games) fires one metadata fetch
 * per game at once. With no cap that opens hundreds of parallel TLS connections
 * to Steam's CDN, which mass-time-out (`connect ETIMEDOUT`) and starve the rest
 * of the app (art never loads, the download queue is slow to promote installs).
 *
 * `acquireMetadataSlot`/`releaseMetadataSlot` bound the number of in-flight
 * fetches; the remainder queue and drain steadily. The timeout ensures a dead
 * connection fails fast and frees its slot (the game just retries on next render).
 */
export const MAX_CONCURRENT_METADATA_FETCHES = 5
export const METADATA_FETCH_TIMEOUT_MS = 15000

let activeMetadataFetches = 0
const metadataFetchWaiters: Array<() => void> = []

/** Acquire a metadata-fetch slot, waiting if the concurrency cap is reached. */
export async function acquireMetadataSlot(): Promise<void> {
  if (activeMetadataFetches < MAX_CONCURRENT_METADATA_FETCHES) {
    activeMetadataFetches++
    return
  }
  await new Promise<void>((resolve) => metadataFetchWaiters.push(resolve))
}

/**
 * Release a metadata-fetch slot. If callers are waiting, the slot is handed
 * directly to the next one (the active count is unchanged); otherwise the count
 * is decremented.
 */
export function releaseMetadataSlot(): void {
  const next = metadataFetchWaiters.shift()
  if (next) {
    next()
  } else {
    activeMetadataFetches--
  }
}
