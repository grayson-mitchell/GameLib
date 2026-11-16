import type { SteamGameInfo } from 'common/types/steam'
import { logWarning, LogPrefix } from 'backend/logger'
import { NUMERIC_APP_ID } from './gameConstants'
import { knownFixSaysMac32 } from './macArchKnownFix'
import { RUST_STEAMCM_STORE_ENRICH } from 'common/types/sidecarTransport'
import { invokeSteamCm } from './cm/rustSteamCm'
import type SteamGame from './games'
import type { SteamMetadataCacheEntry } from './stores'

/** C1/WR-04: how many times one enrichment re-runs after a concurrent metadata write. */
const ENRICH_ATTEMPTS = 2

/**
 * One fetch-and-merge. The merge is built from the entry read before the fetch, so it is written
 * only if that entry is unchanged, checked and written under the platform-capture lock the Rust
 * Refresh writes under (T-79-127). A concurrent write (a Refresh's PICS capture) reads `stale`.
 */
async function enrichOnce(
  steamGame: SteamGame,
  current: SteamGameInfo
): Promise<'settled' | 'stale'> {
  const { deps, appId } = steamGame
  const store = deps.stores.steam.steamMetadataStore
  // A serialised snapshot: the store may hand out live objects, and the stale check compares
  // against this. Entries are persisted JSON, so the text is a faithful copy.
  const snapshot = JSON.stringify(store.get(appId) ?? null)
  const cached = JSON.parse(snapshot) as SteamMetadataCacheEntry | null
  const res = await invokeSteamCm(deps, RUST_STEAMCM_STORE_ENRICH, {
    appId,
    cached,
    current,
    knownFixMac32: knownFixSaysMac32(deps, appId, cached ?? undefined)
  })
  if (!res.ok) {
    logWarning(
      `Steam metadata fetch failed for appId ${appId}: ${res.kind}`,
      LogPrefix.Steam
    )
    return 'settled'
  }
  const { kind, entry, game } = res.result
  if (kind === 'noData' || !entry || !game) return 'settled'
  return deps.steamLaunchRuntime.platformCapture.withPlatformCaptureLock(
    async () => {
      if (JSON.stringify(store.get(appId) ?? null) !== snapshot) {
        return Promise.resolve('stale' as const)
      }
      store.set(appId, entry)
      deps.steamSession.libraryState.library.set(appId, game)
      deps.sendFrontendMessage('pushGameToLibrary', game)
      return Promise.resolve('settled' as const)
    }
  )
}

/**
 * D-12: cm=rust. One steamcm_store_enrich call does the fetch and the merge (delisted branch,
 * art URLs, platform precedence, mac_arch, carry-forwards); TS only persists and pushes.
 * Throws nothing it should not: failures are logged by the caller's catch or here.
 * C1/WR-04: a merge that went stale during the fetch is re-run on the fresh entry, not written.
 */
async function enrichViaRust(
  steamGame: SteamGame,
  current: SteamGameInfo
): Promise<void> {
  const { deps, appId } = steamGame
  let game = current
  for (let attempt = 1; attempt <= ENRICH_ATTEMPTS; attempt++) {
    if ((await enrichOnce(steamGame, game)) === 'settled') return
    // A Refresh may have replaced the library entry too: merge onto what is there now.
    game = deps.steamSession.libraryState.library.get(appId) ?? current
  }
  logWarning(
    `Steam metadata for appId ${appId} kept changing during the fetch; left for the next enrichment`,
    LogPrefix.Steam
  )
}

/**
 * Fetches title, description, genres, and artwork from the Steam store
 * appdetails API.  Deduplicates concurrent calls via module-level
 * `pendingFetches` Set (T-2-03 mitigation): the appId is added to the Set
 * BEFORE the first await so subsequent synchronous callers see it immediately.
 *
 * On success: caches metadata in steamMetadataStore (D-05) and pushes the
 * enriched GameInfo to the frontend via sendFrontendMessage.
 * On failure: logs a warning and returns silently (no throw).
 *
 * @internal Lifted from SteamGame (65-13); do not call from outside steam/.
 */
export async function fetchMetadataIfNeeded(
  steamGame: SteamGame,
  current: SteamGameInfo
): Promise<void> {
  // Guard: if a fetch is already in-flight for this appId, return immediately
  // (pendingFetches.add MUST come before the await — prevents T-2-03 race)
  if (
    steamGame.deps.steamSession.libraryState.pendingFetches.has(steamGame.appId)
  )
    return

  // Guard: non-numeric appId rejected before any URL is constructed (T-06-01),
  // matching the sibling chokepoints getSteamInstallSize and
  // buildSteamProtocolUrl. 08.1 review WR-03: this method interpolates
  // `steamGame.appId` into a store.steampowered.com query string AND into two
  // cdn.cloudflare.steamstatic.com image URLs that are pushed to the renderer
  // as <img src>, so it is exactly the shape those two already validate.
  // Placed AFTER the dedup check and BEFORE the syncing-indicator flip so a
  // rejected appId cannot leave the indicator stuck on.
  if (!NUMERIC_APP_ID.test(steamGame.appId)) {
    logWarning(
      `SteamGame: fetchMetadataIfNeeded rejected a non-numeric appId (T-06-01)`,
      LogPrefix.Steam
    )
    return
  }
  // Notify the frontend a background metadata/art sync is starting (the first
  // pending fetch flips the indicator on; the last one flips it off below).
  if (steamGame.deps.steamSession.libraryState.pendingFetches.size === 0) {
    steamGame.deps.sendFrontendMessage('steamMetadataSyncing', {
      syncing: true
    })
  }
  steamGame.deps.steamSession.libraryState.pendingFetches.add(steamGame.appId)

  // Throttle: wait for a concurrency slot so a cold cache doesn't open
  // hundreds of parallel Steam CDN connections at once (mass ETIMEDOUT).
  await steamGame.deps.steamSession.libraryState.acquireMetadataSlot()

  try {
    await enrichViaRust(steamGame, current)
  } catch (err) {
    logWarning(
      [`Steam metadata fetch failed for appId ${steamGame.appId}:`, err],
      LogPrefix.Steam
    )
  } finally {
    steamGame.deps.steamSession.libraryState.releaseMetadataSlot()
    steamGame.deps.steamSession.libraryState.pendingFetches.delete(
      steamGame.appId
    )
    // Last pending fetch drained — turn the sync indicator off.
    if (steamGame.deps.steamSession.libraryState.pendingFetches.size === 0) {
      steamGame.deps.sendFrontendMessage('steamMetadataSyncing', {
        syncing: false
      })
    }
  }
}
