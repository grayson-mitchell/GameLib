import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'
import { HumbleKey, HumbleSyncState } from 'common/types/humble'

import { getGamekeys, getOrderDetail } from './adapter'
import {
  classifyOrder,
  describeZeroKeyOrder,
  describeMissingExpirationTpks,
  describeSkippedEntitlements
} from './classify'
import {
  humbleLibraryStore,
  humbleRevealedStore,
  humbleSyncStore
} from './electronStores'
import {
  HUMBLE_SYNC_CONCURRENCY,
  HUMBLE_COOLDOWN_MS,
  HUMBLE_CLASSIFIER_VERSION
} from './constants'
import { currentSyncGeneration } from './syncFence'
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
  /** true when an 'ok' fetch classified to ZERO HumbleKeys (diagnosed). */
  zeroKeys?: boolean
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
  now: Date,
  isStale: () => boolean
): Promise<OrderFetchResult> {
  // CR-01: disconnect() bumped the generation — the credential was revoked
  // and the stores wiped. Issue NO further authenticated requests; the
  // in-flight pool drains without touching the network again.
  if (isStale()) {
    return { gamekey, outcome: 'transient' }
  }

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
    // CR-01: re-check AFTER the await — a disconnect that landed while this
    // fetch was in flight already wiped humbleLibraryStore; committing now
    // would silently repopulate it with the pre-disconnect account's data.
    if (isStale()) {
      return { gamekey, outcome: 'transient' }
    }
    const entry = classifyOrder(
      result.data,
      (machineName) => humbleRevealedStore.has(machineName),
      now
    )
    // Committed immediately per resolve, never batched (D-34).
    humbleLibraryStore.set(gamekey, entry)

    if (entry.keys.length === 0) {
      // Live-UAT round 3 diagnosability (debug session:
      // humble-zero-keys-from-valid-orders): an order that parses ok but
      // yields ZERO keys must be structurally self-diagnosing in
      // gamelib.log — field NAMES/types/skip reasons only, never values
      // (C5/T-11-04). Anomalous shapes (tpkd_dict/all_tpks absent, or a
      // non-empty tpk array whose entries should have classified) log as
      // warnings; the legitimate D-29 shapes (explicit empty all_tpks, or
      // — round 5 — an array of download entitlements only, e.g. a
      // PDF/ebook bundle) log as info.
      const diagnosis = describeZeroKeyOrder(result.data)
      const log = diagnosis.anomalous ? logWarning : logInfo
      log(
        [
          'Humble sync: order classified to zero keys:',
          gamekey,
          diagnosis.detail
        ],
        LogPrefix.Backend
      )
      return { gamekey, outcome: 'ok', zeroKeys: true }
    }

    // Live-UAT round 5 (D-29): a MIXED order (keys + download entitlements)
    // bypasses the zero-key diagnosis above, so the skipped no-key_type
    // entries are logged here instead — field NAMES only (C5) — keeping a
    // legitimate key with a weird shape (missing key_type) discoverable on
    // the next live run. logInfo — skipping entitlements is expected D-29
    // behavior, not a failure.
    const skippedEntitlements = describeSkippedEntitlements(result.data)
    if (skippedEntitlements) {
      logInfo(
        [
          'Humble sync: order had download entitlements excluded (D-29):',
          gamekey,
          skippedEntitlements
        ],
        LogPrefix.Backend
      )
    }

    // Live-UAT round 4 expiration-field discovery: keys extracted, but if any
    // active key still could not be dated (the "every row shows No expiration"
    // bug), log the redacted candidate field NAMES only (C5) so the next live
    // run confirms the real Humble date field. logInfo — a key with no
    // expiration is often legitimate; this is a discovery aid, not a failure.
    const missingExpiration = describeMissingExpirationTpks(result.data, now)
    if (missingExpiration) {
      logInfo(
        [
          'Humble sync: order has keys with no extractable expiration:',
          gamekey,
          missingExpiration
        ],
        LogPrefix.Backend
      )
    }
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
  // up so the pool stops dispatching new work. Logged (gamekey + status
  // only, never a cookie/key value) — live-UAT round 2 showed a denied
  // abort was otherwise COMPLETELY silent in the log file.
  logWarning(
    [
      'Humble sync: order-detail fetch denied, aborting remaining fetches:',
      gamekey,
      result.status
    ],
    LogPrefix.Backend
  )
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

/**
 * Terminal sync-state push (D-31/D-32, live-UAT round 2): the renderer's
 * syncedAt/syncError were previously populated ONLY by a mount-time fetch, so
 * a completed sync's fresh timestamp — and a partial/denied sync's banner —
 * never reached the UI in-session. Every sync() exit path now pushes the
 * authoritative HumbleSyncState; GlobalState treats this event as the single
 * end-of-sync signal (it also clears `syncing`, covering aborted syncs whose
 * last humbleSyncProgress had done < total).
 */
function emitSyncState(): void {
  sendFrontendMessage('humbleSyncStateChanged', getSyncState())
}

// Single-flight guard: startup (health-check chain), login, and the manual
// refresh button can all trigger sync() — concurrent syncs would double the
// request pressure on Humble (C5) and interleave progress counters in the
// renderer. A second call while one is running joins the in-flight promise.
let syncInFlight: Promise<SyncOutcome> | null = null

async function sync(): Promise<SyncOutcome> {
  if (syncInFlight) {
    return syncInFlight
  }
  // WR-01: the humbleSync IPC contract is "returns the overall outcome —
  // never throws" (common/types/ipc.ts), and every renderer call site is
  // fire-and-forget with no .catch. runSync() guards the adapter calls, but
  // an unexpected throw anywhere else (getKeys, setSyncState disk I/O,
  // sendFrontendMessage) would otherwise reject this promise straight into
  // the renderer as an unhandled rejection with the outcome never recorded.
  // Enforce the contract at the boundary: catch, log, record, resolve failed.
  const generation = currentSyncGeneration()
  // The terminal state push happens on EVERY exit path — success, fail-soft
  // AND an unexpected rejection (so the renderer's `syncing` can never get
  // stuck true again; cf. debug session humble-sync-spinner-never-ends).
  syncInFlight = runSync()
    .catch((err) => {
      logError(['Humble sync: unexpected failure:', err], LogPrefix.Backend)
      // CR-01: never write into a store a mid-sync disconnect just wiped.
      if (generation === currentSyncGeneration()) {
        setSyncState({ syncError: 'network' })
      }
      return { status: 'failed' as const }
    })
    .finally(() => {
      syncInFlight = null
      emitSyncState()
    })
  return syncInFlight
}

async function runSync(): Promise<SyncOutcome> {
  // CR-01 disconnect fence: capture the store generation at sync start.
  // HumbleUser.disconnect() bumps it BEFORE wiping the stores — any mismatch
  // from that point on marks this sync stale: no store commit, no sync-state
  // write, no renderer push, and no further authenticated requests.
  const generation = currentSyncGeneration()
  const isStale = () => generation !== currentSyncGeneration()

  const cookie = HumbleUser.getCredentials()
  if (!cookie) {
    return { status: 'failed' }
  }

  // D-33: a 403/429 denial gates EVERY sync — including manual refresh —
  // until the cooldown elapses. Enforced here in the backend, not just via
  // the renderer's (possibly stale) disabled-button state: live-UAT round 2
  // showed the renderer's stale syncError left the refresh button enabled
  // during a backend cooldown, hammering Humble on every click.
  const currentState = getSyncState()
  if (currentState.cooldownUntil && currentState.cooldownUntil > Date.now()) {
    logWarning(
      [
        'Humble sync: skipped — denial cooldown active until',
        new Date(currentState.cooldownUntil).toISOString()
      ],
      LogPrefix.Backend
    )
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
    // CR-01: never write into a store a mid-sync disconnect just wiped.
    if (!isStale()) {
      setSyncState({ syncError: 'network' })
    }
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
    // CR-01: never write into a store a mid-sync disconnect just wiped.
    if (!isStale()) {
      setSyncState({
        syncError: 'denied',
        cooldownUntil: Date.now() + HUMBLE_COOLDOWN_MS
      })
    }
    return { status: 'failed' }
  }

  if (gamekeysResult.status === 'schema_error') {
    logWarning(
      ['Humble sync: getGamekeys schema_error, cache untouched'],
      LogPrefix.Backend
    )
    // CR-01: never write into a store a mid-sync disconnect just wiped.
    if (!isStale()) {
      setSyncState({ syncError: 'network' })
    }
    return { status: 'failed' }
  }

  // Live-UAT round 6 (propagation bug): D-24 freezes fully-terminal cached
  // orders — they are never re-fetched, so a classifier fix can never reach
  // their cached rows (the tester's stale PDF-entitlement rows survived the
  // round-5 filter exactly this way, 19/25 orders frozen). When the stored
  // classifier version differs from HUMBLE_CLASSIFIER_VERSION, bypass the
  // frozen-order skip ONCE: re-fetch and re-classify EVERY order. Version-
  // matched syncs keep full D-24 semantics. Pre-versioning caches (rounds
  // 1-5) never stored a version — read them as 1.
  const storedClassifierVersion = currentState.classifierVersion ?? 1
  const reclassifyAll = storedClassifierVersion !== HUMBLE_CLASSIFIER_VERSION
  if (reclassifyAll) {
    logInfo(
      [
        `Humble sync: classifier version changed (${storedClassifierVersion} -> ${HUMBLE_CLASSIFIER_VERSION}), full re-classification sync`
      ],
      LogPrefix.Backend
    )
  }

  const { newGamekeys, nonTerminalGamekeys } = partitionGamekeys(
    gamekeysResult.data
  )
  const toFetch = reclassifyAll
    ? [...gamekeysResult.data]
    : [...newGamekeys, ...nonTerminalGamekeys]
  const total = toFetch.length
  let done = 0

  // WR-05: initial progress push BEFORE any order resolves. The renderer
  // derives `syncing` from done < total, and per-order events only fire
  // AFTER each order settles — so without this, 0/1-order syncs never show
  // as syncing at all, and multi-order syncs leave the refresh button
  // enabled/un-spinning until the first order completes (up to the full
  // request timeout). CR-01: skip when a disconnect landed during the
  // gamekeys fetch.
  if (!isStale()) {
    sendFrontendMessage('humbleSyncProgress', { done: 0, total })
  }

  const results = await runBounded(
    toFetch,
    HUMBLE_SYNC_CONCURRENCY,
    async (gamekey) => {
      const outcome = await fetchAndCommitOrder(cookie, gamekey, now, isStale)
      // CR-01: a fenced-off sync must never push to the renderer — each
      // humbleKeysUpdated would overwrite the `keys: []` the renderer just
      // set on disconnect.
      if (isStale()) {
        return outcome
      }
      done += 1
      sendFrontendMessage('humbleSyncProgress', { done, total })
      // D-26 progressive fill: push the updated key inventory as each order
      // commits, not just once at the end — the renderer's keys list fills
      // in live during a multi-order sync.
      sendFrontendMessage('humbleKeysUpdated', getKeys())
      return outcome
    }
  )

  // Redacted per-sync outcome summary (live-UAT round 2 diagnosability):
  // counts only — never cookie/key values. THE line to look for in
  // gamelib.log when keys don't appear: any non-zero schema_error /
  // access_denied / transient count names the per-order failure mode.
  const outcomeCounts: Record<OrderFetchOutcome, number> = {
    ok: 0,
    schema_error: 0,
    access_denied: 0,
    session_expired: 0,
    transient: 0
  }
  let zeroKeyOrders = 0
  for (const r of results) {
    outcomeCounts[r.outcome] += 1
    if (r.zeroKeys) zeroKeyOrders += 1
  }
  logInfo(
    [
      `Humble sync finished: gamekeys=${gamekeysResult.data.length}`,
      `fetched=${results.length}/${total} frozen=${gamekeysResult.data.length - total}`,
      `ok=${outcomeCounts.ok} schema_error=${outcomeCounts.schema_error}`,
      `denied=${outcomeCounts.access_denied} expired=${outcomeCounts.session_expired}`,
      `transient=${outcomeCounts.transient} zeroKeyOrders=${zeroKeyOrders}`,
      `keysCached=${getKeys().length}`
    ],
    LogPrefix.Backend
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

  // CR-01: a disconnect landed mid-sync — the terminal setSyncState below
  // would repopulate the humbleSyncStore the disconnect just wiped.
  if (isStale()) {
    return { status: 'failed' }
  }

  setSyncState({
    syncedAt: Date.now(),
    syncError: sawFailure ? 'partial' : 'none',
    cooldownUntil: sawAccessDenied
      ? Date.now() + HUMBLE_COOLDOWN_MS
      : undefined,
    // Round 6: stamp the classifier version only after a CLEAN pass. A
    // partial sync keeps the old version — a failed order retains its PRIOR
    // (possibly stale-classified, all-terminal) cache entry, and stamping
    // now would re-freeze it forever; the next sync retries the full
    // re-classification instead. (!sawFailure implies every order fetched
    // ok: the only mid-sync aborts, denied/expired, set sawFailure or
    // return early above.)
    ...(sawFailure ? {} : { classifierVersion: HUMBLE_CLASSIFIER_VERSION })
  })

  return { status: sawFailure ? 'partial' : 'ok' }
}

export const HumbleLibrary = {
  loadCached,
  sync,
  getKeys,
  getSyncState
}
