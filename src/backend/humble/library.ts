import { logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'
import { HumbleKey, HumbleSyncState } from 'common/types/humble'

import { getGamekeys, getOrderDetail } from './adapter'
import { classifyOrder } from './classify'
import {
  humbleLibraryStore,
  humbleRevealedStore,
  humbleSyncStore
} from './electronStores'
import { HUMBLE_SYNC_CONCURRENCY, HUMBLE_COOLDOWN_MS } from './constants'
import { HumbleUser } from './user'

/**
 * HumbleLibrary — HSYNC-01/02/03/04 sync orchestration.
 *
 * Cache-then-sync (mirrors src/backend/storeManagers/steam/library.ts):
 * loadCached() renders whatever is on disk with no network; sync() is
 * triggered separately (D-23) and fails soft — a Humble denial or a
 * network/timeout/5xx throw NEVER clears the cache, it only records
 * `syncError` (and a cooldown for access_denied/429) so the renderer keeps
 * showing the last-known-good library (HSYNC-04).
 *
 * Fetch fan-out is bounded to HUMBLE_SYNC_CONCURRENCY in-flight
 * `getOrderDetail` calls (D-25/T-11-03) and commits each order's cache entry
 * as soon as that order resolves — never batched — so a mid-sync abort
 * (403/429) keeps every already-fetched order committed (D-34/Pitfall 4).
 *
 * Every getGamekeys/getOrderDetail call is wrapped in its own try/catch,
 * mirroring user.ts:checkHealthAndFlagExpiry, because the adapter only turns
 * 401/403/429 into typed AdapterResult values — everything else (network
 * unreachable, DNS, timeout, HTTP 5xx) is still THROWN (T-11-08/D-31).
 */

type SyncOutcome = { status: 'ok' | 'partial' | 'failed' }

interface PartitionResult {
  newGamekeys: string[]
  nonTerminalGamekeys: string[]
  frozenGamekeys: string[]
}

/**
 * Three explicit buckets (Pitfall 3): a gamekey not yet in the cache at all
 * is ALWAYS fetched (newGamekeys), never conflated with an empty-keys
 * all-terminal check. A cached gamekey whose entry is not fully terminal is
 * also always fetched (nonTerminalGamekeys), so expirations recompute every
 * sync (HSYNC-03). Only a cached, fully-terminal entry is frozen/skipped.
 */
function partitionGamekeys(gamekeys: string[]): PartitionResult {
  const newGamekeys: string[] = []
  const nonTerminalGamekeys: string[] = []
  const frozenGamekeys: string[] = []

  for (const gamekey of gamekeys) {
    if (!humbleLibraryStore.has(gamekey)) {
      newGamekeys.push(gamekey)
      continue
    }
    const entry = humbleLibraryStore.get(gamekey)
    if (entry?.allTerminal) {
      frozenGamekeys.push(gamekey)
    } else {
      nonTerminalGamekeys.push(gamekey)
    }
  }

  return { newGamekeys, nonTerminalGamekeys, frozenGamekeys }
}

type OrderFetchOutcome =
  | 'ok'
  | 'schema_error'
  | 'access_denied'
  | 'session_expired'
  | 'transient'

interface OrderFetchResult {
  gamekey: string
  outcome: OrderFetchOutcome
}

/**
 * Fetches + classifies + commits a single order. Per-order isolation
 * (Pattern 2): a schema_error or a caught throw here keeps that gamekey's
 * PRIOR cache entry untouched and never aborts the rest of the pool — only
 * access_denied/session_expired signal an abort (handled by the caller /
 * runBounded). Redacted logging only (gamekey + status, never a raw key
 * value) per T-11-04.
 */
async function fetchAndCommitOrder(
  cookie: string,
  gamekey: string,
  now: Date
): Promise<OrderFetchResult> {
  let result: Awaited<ReturnType<typeof getOrderDetail>>
  try {
    result = await getOrderDetail(cookie, gamekey)
  } catch (_err) {
    // Transient/unexpected failure (network unreachable, DNS, timeout,
    // 5xx) — the adapter still rethrows this class (T-11-08). Caught here so
    // it never escapes as an unhandled rejection; the prior cache entry (if
    // any) for this gamekey is left exactly as-is.
    logWarning(
      [
        'Humble sync: order-detail fetch threw (transient), keeping cached entry:',
        gamekey
      ],
      LogPrefix.Backend
    )
    return { gamekey, outcome: 'transient' }
  }

  if (result.status === 'ok') {
    const entry = classifyOrder(
      result.data,
      (machineName) => humbleRevealedStore.has(machineName),
      now
    )
    // Committed immediately per resolve, never batched (D-34).
    humbleLibraryStore.set(gamekey, entry)
    return { gamekey, outcome: 'ok' }
  }

  if (result.status === 'schema_error') {
    logWarning(
      ['Humble sync: order schema_error, keeping cached entry:', gamekey],
      LogPrefix.Backend
    )
    return { gamekey, outcome: 'schema_error' }
  }

  // access_denied (incl. 429, D-25) or session_expired — bubble the signal
  // up so the pool stops dispatching new work.
  return { gamekey, outcome: result.status }
}

/**
 * Small hand-rolled bounded-concurrency pool (RESEARCH Pattern 3). Never more
 * than `limit` workers in flight. Stops DISPATCHING new work the moment any
 * worker resolves with 'access_denied' or 'session_expired' — in-flight
 * tasks still settle and commit (Pitfall 4); already-committed cache entries
 * are never touched by the abort itself.
 */
async function runBounded(
  items: string[],
  limit: number,
  worker: (item: string) => Promise<OrderFetchResult>
): Promise<OrderFetchResult[]> {
  const results: OrderFetchResult[] = []
  let aborted = false
  let index = 0

  async function runNext(): Promise<void> {
    if (aborted) return
    const i = index++
    if (i >= items.length) return
    const result = await worker(items[i])
    results.push(result)
    if (result.outcome === 'access_denied' || result.outcome === 'session_expired') {
      aborted = true
      return
    }
    return runNext()
  }

  const workerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => runNext()))
  return results
}

function getSyncState(): HumbleSyncState {
  return humbleSyncStore.get('state', { syncedAt: null, syncError: 'none' })
}

function setSyncState(patch: Partial<HumbleSyncState>): void {
  const current = getSyncState()
  humbleSyncStore.set('state', { ...current, ...patch })
}

function getKeys(): HumbleKey[] {
  const keys: HumbleKey[] = []
  for (const [, entry] of humbleLibraryStore.entries()) {
    keys.push(...entry.keys)
  }
  return keys
}

/**
 * Cache-then-render (mirrors SteamLibraryManager.init()'s cache load): reads
 * whatever is already on disk and pushes it to the renderer. No network call
 * — sync() is triggered separately per D-23.
 */
function loadCached(): void {
  sendFrontendMessage('humbleKeysUpdated', getKeys())
}

async function sync(): Promise<SyncOutcome> {
  const cookie = HumbleUser.getCredentials()
  if (!cookie) {
    return { status: 'failed' }
  }

  const now = new Date()

  let gamekeysResult: Awaited<ReturnType<typeof getGamekeys>>
  try {
    gamekeysResult = await getGamekeys(cookie)
  } catch (err) {
    // Thrown transient class (network/timeout/5xx) — mirrors
    // user.ts:checkHealthAndFlagExpiry's catch exactly (T-11-08/D-31).
    // Cache untouched, no cooldown (Humble did not actually deny us).
    logWarning(
      ['Humble sync: getGamekeys threw (transient), cache untouched:', err],
      LogPrefix.Backend
    )
    setSyncState({ syncError: 'network' })
    return { status: 'failed' }
  }

  if (gamekeysResult.status === 'session_expired') {
    // Phase 10 owns expiry (D-08/D-09) — no syncError/cooldown here.
    return { status: 'failed' }
  }

  if (gamekeysResult.status === 'access_denied') {
    logWarning(
      ['Humble sync: getGamekeys access_denied, cache untouched:', gamekeysResult.status],
      LogPrefix.Backend
    )
    setSyncState({
      syncError: 'denied',
      cooldownUntil: Date.now() + HUMBLE_COOLDOWN_MS
    })
    return { status: 'failed' }
  }

  if (gamekeysResult.status === 'schema_error') {
    logWarning(
      ['Humble sync: getGamekeys schema_error, cache untouched'],
      LogPrefix.Backend
    )
    setSyncState({ syncError: 'network' })
    return { status: 'failed' }
  }

  const { newGamekeys, nonTerminalGamekeys } = partitionGamekeys(
    gamekeysResult.data
  )
  const toFetch = [...newGamekeys, ...nonTerminalGamekeys]
  const total = toFetch.length
  let done = 0

  const results = await runBounded(
    toFetch,
    HUMBLE_SYNC_CONCURRENCY,
    async (gamekey) => {
      const outcome = await fetchAndCommitOrder(cookie, gamekey, now)
      done += 1
      sendFrontendMessage('humbleSyncProgress', { done, total })
      // D-26 progressive fill: push the updated key inventory as each order
      // commits, not just once at the end — the renderer's keys list fills
      // in live during a multi-order sync.
      sendFrontendMessage('humbleKeysUpdated', getKeys())
      return outcome
    }
  )

  const sawSessionExpired = results.some(
    (r) => r.outcome === 'session_expired'
  )
  if (sawSessionExpired) {
    // Phase 10 owns expiry — no syncError/cooldown, matches the
    // gamekeys-level session_expired branch above.
    return { status: 'failed' }
  }

  const sawAccessDenied = results.some((r) => r.outcome === 'access_denied')
  const sawFailure = results.some(
    (r) =>
      r.outcome === 'schema_error' ||
      r.outcome === 'transient' ||
      r.outcome === 'access_denied'
  )

  setSyncState({
    syncedAt: Date.now(),
    syncError: sawFailure ? 'partial' : 'none',
    cooldownUntil: sawAccessDenied
      ? Date.now() + HUMBLE_COOLDOWN_MS
      : undefined
  })

  return { status: sawFailure ? 'partial' : 'ok' }
}

export const HumbleLibrary = {
  loadCached,
  sync,
  getKeys,
  getSyncState
}
