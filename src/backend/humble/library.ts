import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'
import {
  ClaimAnnotation,
  HumbleKey,
  HumbleKeyState,
  RedeemOutcome,
  RevealOutcome,
  HumbleSyncState
} from 'common/types/humble'

import { getGamekeys, getOrderDetail, revealKey as adapterRevealKey } from './adapter'
import {
  classifyOrder,
  describeZeroKeyOrder,
  describeMissingExpirationTpks,
  describeSkippedEntitlements,
  isTerminal,
  isFreezeEligible
} from './classify'
import { recomputeOwnership as dedupRecomputeOwnership } from './dedup'
import { detectAndNotifyExpirationTransitions } from './expirationAlerts'
import {
  AuditRecord,
  HumbleKeyInternal,
  humbleAuditStore,
  humbleGiftedAtStore,
  humbleLibraryStore,
  humbleLocalRedeemedStore,
  humbleOwnershipOverrideStore,
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
import { steamLibraryStore } from 'backend/storeManagers/steam/electronStores'
import { SteamUser } from 'backend/storeManagers/steam/user'
import { GameInfo } from 'common/types'

// Phase 14 guided claim flow: composite-key discipline (Pattern 3) — every
// store keyed by `gamekey:machineName` uses this exact builder so two
// different gamekeys sharing a machineName never collide (WR-01 lesson).
const compositeKey = (gamekey: string, machineName: string): string =>
  `${gamekey}:${machineName}`

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
    // 14-08 gap closure (Fix 2): freezeEligible (server-terminality,
    // including REVEALED-without-pending-expiry) is the frozen decision when
    // present; a pre-v6 entry that hasn't been backfilled yet falls back to
    // the original allTerminal semantic (D-24) until its next re-fetch.
    const frozen = entry?.freezeEligible ?? entry?.allTerminal
    if (frozen) {
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
 * WR-01 (14-08 re-review): the D-48/T-12-02 Steam connectivity double-gate,
 * extracted into ONE shared helper so fetchAndCommitOrder's commit-time
 * branch selector and recomputeOwnership's end-of-sync no-op gate can never
 * drift apart — Fix 1's churn/C2-window guarantees depend on both sites
 * reading the EXACT same gate, and that parity is now enforced by code
 * rather than by comment (the same drift class Fix 2 eliminated for the
 * freeze predicate with the single-sourced isFreezeEligible).
 *
 * `open` is true only when Steam is logged in AND its cached library is
 * non-empty (Pitfall 3 / Assumption A3) — a Steam hiccup (disconnect, empty
 * cache mid-refresh) must read as CLOSED so no caller ever zeroes a
 * previously-computed `ownedElsewhere: true` (D-48 keep-last-known).
 * `steamGames` is the snapshot callers pass to dedupRecomputeOwnership when
 * the gate is open; it is only read from the store when logged in.
 */
function getSteamGate(): { open: boolean; steamGames: GameInfo[] } {
  if (!SteamUser.isLoggedIn()) {
    return { open: false, steamGames: [] }
  }
  const steamGames = steamLibraryStore.get('games', [])
  return { open: steamGames.length > 0, steamGames }
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
    // Phase 14 (D-77): the 4th positional arg is classifyOrder's
    // isLocallyRedeemed predicate, composite-keyed (gamekey:machineName, not
    // machineName-only — WR-01 non-collision) via humbleLocalRedeemedStore.
    const classified = classifyOrder(
      result.data,
      (machineName) => humbleRevealedStore.has(machineName),
      now,
      (gk, machineName) =>
        humbleLocalRedeemedStore.has(compositeKey(gk, machineName))
    )
    // Phase 14 (D-74): merge the freshly-classified order's keyindex
    // side-channel onto each cached key as the internal-only `keyindex`
    // field (persisted with the cache entry — no new store, survives
    // restarts without a sync). A fresh classify never regresses a
    // previously-revealed key's plaintext value to null — carry the prior
    // cached record's `revealedKeyValue` forward when the fresh record
    // lacks one (a re-sync must never un-reveal a key the user already
    // revealed in this session).
    const priorEntry = humbleLibraryStore.get(gamekey)
    const priorKeysByMachineName = new Map(
      (priorEntry?.keys ?? []).map((key) => [key.machineName, key])
    )

    // 14-08 gap closure (Fix 1 — UAT test 8 churn + T-14-03 C2 window):
    // classifyOrder always hard-resets ownedElsewhere:false/matchConfidence:
    // 'none' on every fresh classify (classify.ts has no Steam knowledge by
    // design). D-26 broadcasts humbleKeysUpdated after EVERY per-order
    // commit, but recomputeOwnership() below only runs once at sync END — so
    // committing classified.keys as-is would transiently reset an
    // already-owned key's overlay on every intermediate broadcast (the
    // fill-then-empty churn) AND let a mid-sync revealKey() call read a
    // transiently-false ownedElsewhere (the C2 bypass window). Fixed with a
    // merged two-branch strategy, gated on the shared getSteamGate() helper
    // (WR-01, 14-08 re-review) — the SAME gate recomputeOwnership() reads,
    // enforced structurally so the two sites can never drift:
    const steamGate = getSteamGate()
    const overlaidKeys: HumbleKey[] = steamGate.open
      ? // Branch A (gate PASSES): run the pure dedup recompute on the
        // freshly-classified keys BEFORE building the entry, for EVERY
        // order (including a brand-new never-cached one) — this fully
        // closes the T-14-03 window and eliminates the churn at its root.
        dedupRecomputeOwnership(
          classified.keys,
          steamGate.steamGames,
          (machineName) => humbleOwnershipOverrideStore.has(machineName)
        )
      : // Branch B (gate FAILS — Steam logged out, or logged in with an
        // empty cached library): carry forward each prior cached key's
        // ownedElsewhere/matchConfidence per-key, exactly like
        // revealedKeyValue is carried below (D-48 keep-last-known) — a
        // Steam hiccup mid-sync can never zero out a previously-computed
        // ownedElsewhere:true, so the C2 guard's data stays stale-but-safe.
        classified.keys.map((key) => {
          const priorKey = priorKeysByMachineName.get(key.machineName)
          return {
            ...key,
            ownedElsewhere: priorKey?.ownedElsewhere ?? key.ownedElsewhere,
            matchConfidence: priorKey?.matchConfidence ?? key.matchConfidence
          }
        })

    // Phase 14 (D-74): merge the freshly-classified order's keyindex
    // side-channel onto each cached key as the internal-only `keyindex`
    // field (persisted with the cache entry — no new store, survives
    // restarts without a sync). A fresh classify never regresses a
    // previously-revealed key's plaintext value to null — carry the prior
    // cached record's `revealedKeyValue` forward when the fresh record
    // lacks one (a re-sync must never un-reveal a key the user already
    // revealed in this session).
    const keysWithInternalFields: HumbleKeyInternal[] = overlaidKeys.map(
      (key) => {
        const priorKey = priorKeysByMachineName.get(key.machineName)
        const keyindex =
          classified.keyIndexByComposite[
            compositeKey(gamekey, key.machineName)
          ]
        // CR-01 (14-REVIEW re-review): a key revealed on Humble's WEBSITE has
        // no local reveal record and no prior revealedKeyValue — carry the
        // SERVER-provided value (classify.ts side-channel) onto the
        // internal-only field so the wizard's finish mode can show the key
        // on demand without ever re-firing the reveal POST (D-66). A prior
        // (GameLib-revealed) value still wins when present, preserving the
        // never-regress guarantee above.
        const revealedKeyValue =
          priorKey?.revealedKeyValue ??
          classified.revealedKeyValueByComposite[
            compositeKey(gamekey, key.machineName)
          ]
        return {
          ...key,
          ...(keyindex !== undefined ? { keyindex } : {}),
          ...(revealedKeyValue !== undefined ? { revealedKeyValue } : {})
        }
      }
    )
    // 14-08 gap closure (Fix 2), reworked for CR-01 (14-08 re-review):
    // freezeEligible is recomputed here over keysWithInternalFields — NOT
    // persisted from classified.freezeEligible — because the merged keys are
    // where the carried-forward `revealedKeyValue` lives: a GameLib-revealed
    // key whose value was carried forward from the prior entry must still
    // freeze even when the fresh server payload lacks the value. The
    // predicate itself stays single-sourced (classify.ts's isFreezeEligible,
    // same as classifyOrder/patchCachedState); only the value-present signal
    // is site-local. A flag-only REVEALED key (D-78 ambiguous /
    // rejected_by_server write-ahead — no value anywhere) therefore never
    // freezes and keeps re-fetching until the server value lands.
    const freezeEligible =
      keysWithInternalFields.length > 0 &&
      keysWithInternalFields.every((key) =>
        isFreezeEligible({
          state: key.state,
          expiration: key.expiration,
          revealedKeyValuePresent: key.revealedKeyValue !== undefined
        })
      )
    const entry = {
      gamekey: classified.gamekey,
      keys: keysWithInternalFields,
      allTerminal: classified.allTerminal,
      freezeEligible
    }
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

// D-74/C4/T-14-02: the internal-only fields (keyindex, revealedKeyValue) ride
// the existing humbleLibraryStore cache entries but must NEVER reach a
// humbleKeysUpdated broadcast — this is the one strip point every renderer
// push goes through (getKeys() itself, plus every function below that pushes
// via patchCachedState/recomputeOwnership, all of which call getKeys()).
function toDisplayKey(key: HumbleKeyInternal): HumbleKey {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { keyindex, revealedKeyValue, ...displayKey } = key
  return displayKey
}

function getKeys(): HumbleKey[] {
  const keys: HumbleKey[] = []
  for (const [, entry] of humbleLibraryStore.entries()) {
    keys.push(...entry.keys.map(toDisplayKey))
  }
  return keys
}

/**
 * HDEDUP-01 (D-44/D-45/D-48): recomputes the ownership overlay
 * (`ownedElsewhere`/`matchConfidence`) for every cached Humble key against
 * the current Steam owned-apps snapshot, then re-pushes the merged key
 * inventory to the renderer.
 *
 * Double-gated (T-12-02, Pitfall 3 / Assumption A3) via the shared
 * getSteamGate() helper (WR-01, 14-08 re-review — the same gate
 * fetchAndCommitOrder's commit-time branch selector reads): if Steam is not
 * connected OR its cached library is empty, this is a COMPLETE no-op — no
 * store write, no renderer push — so a Steam hiccup (disconnect, empty
 * cache mid-refresh) can never zero out a previously-computed
 * `ownedElsewhere: true` (D-48 keep-last-known). The pure `dedup.ts` module
 * has its own empty-array floor as a second, defense-in-depth safeguard —
 * the authoritative connectivity decision lives in the shared gate.
 *
 * Called as the final step of runSync() (after every order commits) and as
 * the exported entrypoint the Steam-refresh trigger (Plan 04) invokes
 * directly, so a Steam library sync can refresh Humble's ownership flags
 * without waiting for the next Humble sync.
 */
function recomputeOwnership(): void {
  const { open, steamGames } = getSteamGate()
  if (!open) {
    return
  }

  for (const [gamekey, entry] of humbleLibraryStore.entries()) {
    const mutatedKeys = dedupRecomputeOwnership(
      entry.keys,
      steamGames,
      (machineName) => humbleOwnershipOverrideStore.has(machineName)
    )
    humbleLibraryStore.set(gamekey, { ...entry, keys: mutatedKeys })
  }

  // Pitfall 5: this is a DISTINCT final push, not covered by the per-order
  // progressive push inside runSync's fetch loop (that loop only runs
  // during a Humble sync; this function is also called standalone from the
  // Steam-refresh entrypoint with no Humble fetch loop at all).
  sendFrontendMessage('humbleKeysUpdated', getKeys())
}

/**
 * D-42: records a user's "Not the same game" correction for a fuzzy match,
 * then immediately recomputes so the renderer reflects the cleared flag.
 * Ground-truth exact AppID matches are never overridable (enforced by
 * dedup.ts, not here).
 */
function setOwnershipOverride(machineName: string): void {
  humbleOwnershipOverrideStore.set(machineName, { overriddenAt: Date.now() })
  recomputeOwnership()
}

/**
 * D-42: clears a previously-recorded override, then recomputes so a
 * still-valid fuzzy match is restored.
 */
function clearOwnershipOverride(machineName: string): void {
  humbleOwnershipOverrideStore.delete(machineName)
  recomputeOwnership()
}

/**
 * WR-04 (14-REVIEW): returns every "Not the same game" override record as a
 * plain machineName->overriddenAt (ms) map (mirrors getAllGiftedAt). The
 * undo-override affordance must key off "an override RECORD exists" — an
 * overridden key recomputes to `ownedElsewhere: false, matchConfidence:
 * 'none'`, so any renderer gating on the current fuzzy/owned flags can never
 * show the undo control on the one row that actually needs it. Returns {}
 * when nothing is overridden.
 */
function getAllOwnershipOverrides(): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [machineName, entry] of humbleOwnershipOverrideStore.entries()) {
    result[machineName] = entry.overriddenAt
  }
  return result
}

/**
 * D-59 (reinterpreted per D-57 research — GameLib never possesses a
 * gift-link value; the deep-link is static): records that the user
 * confirmed the "Open Humble" gift action for a giftable-spares key, keyed
 * by machineName. No recomputeOwnership call — gifting does not affect
 * ownership/classification, only the double-gift guard the Spares view
 * reads via getAllGiftedAt().
 */
function recordGiftLinkOpened(machineName: string): void {
  humbleGiftedAtStore.set(machineName, { giftedAt: Date.now() })
}

/**
 * D-59: returns every gifted-at record as a plain machineName->timestamp
 * (ms) map for the Spares view to read. Returns {} when no key has been
 * gifted yet.
 */
function getAllGiftedAt(): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [machineName, entry] of humbleGiftedAtStore.entries()) {
    result[machineName] = entry.giftedAt
  }
  return result
}

/**
 * Cache-then-render (mirrors SteamLibraryManager.init()'s cache load): reads
 * whatever is already on disk and pushes it to the renderer. No network call
 * — sync() is triggered separately per D-23.
 */
function loadCached(): void {
  sendFrontendMessage('humbleKeysUpdated', getKeys())
}

// ── Phase 14 guided claim flow: cache-projection + audit/annotation helpers ─

/**
 * Direct cache-projection patch (mirrors recomputeOwnership's
 * read-modify-write-then-push shape, Pattern 4): patches exactly ONE key's
 * `state` (plus an optional `revealedKeyValue` internal-only field, D-74) on
 * the cached entry, then re-pushes the display-safe `humbleKeysUpdated`
 * broadcast so the renderer reflects the reveal/redeem/undo outcome
 * immediately, without waiting for the next sync. A no-op if the
 * gamekey/machineName is not found in the cache.
 *
 * WR-01 (14-REVIEW re-review): `allTerminal` is RECOMPUTED from the patched
 * key set, never spread forward. The undo path made this load-bearing:
 * mark→sync commits `allTerminal: true` (the order freezes under D-24), and
 * an Undo that flips the key back to REVEALED must unfreeze it — otherwise
 * every later sync skips the order and HSYNC-03 retroactive-expiry recompute
 * can never reach it again. Uses classify.ts's exported isTerminal so the
 * predicate cannot drift from what a fresh sync computes.
 */
function patchCachedState(
  gamekey: string,
  machineName: string,
  newState: HumbleKeyState,
  extra?: { revealedKeyValue?: string }
): void {
  const entry = humbleLibraryStore.get(gamekey)
  if (!entry) return
  const index = entry.keys.findIndex((key) => key.machineName === machineName)
  if (index === -1) return

  const priorKey = entry.keys[index]
  const patchedKey: HumbleKeyInternal = {
    ...priorKey,
    state: newState,
    ...(extra?.revealedKeyValue !== undefined
      ? { revealedKeyValue: extra.revealedKeyValue }
      : {})
  }
  const newKeys = [...entry.keys]
  newKeys[index] = patchedKey
  const allTerminal =
    newKeys.length > 0 && newKeys.every((key) => isTerminal(key.state))
  // 14-08 gap closure (Fix 2, WR-01 undo consistency): recomputed via the
  // SAME single-sourced isFreezeEligible helper classifyOrder uses — undo
  // (or mark) can never leave partitionGamekeys' next-sync frozen decision
  // disagreeing with what this patch just computed. CR-01 (14-08
  // re-review): the value-present signal here is the internal
  // `revealedKeyValue` field — a successful reveal (value just persisted via
  // `extra`) freezes; an ambiguous/rejected reveal (no patch ever reaches
  // this function, no value) never does.
  const freezeEligible =
    newKeys.length > 0 &&
    newKeys.every((key) =>
      isFreezeEligible({
        state: key.state,
        expiration: key.expiration,
        revealedKeyValuePresent: key.revealedKeyValue !== undefined
      })
    )
  humbleLibraryStore.set(gamekey, {
    ...entry,
    keys: newKeys,
    allTerminal,
    freezeEligible
  })
  sendFrontendMessage('humbleKeysUpdated', getKeys())
}

/**
 * Reads the persistent internal `keyindex` field (D-74, Phase 14) off the
 * cached entry for a given key. Returns undefined for a pre-Phase-14 cached
 * row that has not yet been backfilled by a version-bumped sync (Pitfall C)
 * — callers must treat this as "not eligible to reveal", never coerce/guess.
 */
function lookupKeyindex(
  gamekey: string,
  machineName: string
): string | number | undefined {
  const entry = humbleLibraryStore.get(gamekey)
  return entry?.keys.find((key) => key.machineName === machineName)?.keyindex
}

/**
 * Reads the persisted plaintext reveal value (D-74) off the cached entry for
 * a given key — the ONLY function in the backend that surfaces a raw key
 * value, and only on explicit on-demand read (never broadcast, C4/T-14-02).
 * Returns null both when the key was never revealed AND when it was revealed
 * but the outcome was ambiguous (Pitfall B) — the two cases are
 * indistinguishable to a caller and both correctly render as "not confirmed
 * yet".
 */
function getRevealedKeyValue(
  gamekey: string,
  machineName: string
): string | null {
  const entry = humbleLibraryStore.get(gamekey)
  const key = entry?.keys.find((k) => k.machineName === machineName)
  return key?.revealedKeyValue ?? null
}

/**
 * Appends one identity+outcome record to the composite-keyed audit trail
 * (D-76). NEVER accepts or persists a key value — only what happened
 * (`event`), when (`at`), and redacted display context (`title`/`platform`)
 * plus an optional machine-readable `outcome` (e.g. an AdapterResult status
 * literal). humbleAuditStore is disconnect-exempt (D-04 exemption) so the
 * trail survives a disconnect/reconnect cycle.
 */
function appendAudit(
  gamekey: string,
  machineName: string,
  event: string,
  fields: { title: string; platform: string; outcome?: string }
): void {
  const key = compositeKey(gamekey, machineName)
  const existing = humbleAuditStore.get(key, [])
  const record: AuditRecord = {
    event,
    at: Date.now(),
    title: fields.title,
    platform: fields.platform,
    outcome: fields.outcome
  }
  humbleAuditStore.set(key, [...existing, record])
}

/**
 * Per-key row annotations for the guided claim flow's IPC surface
 * (`humbleGetClaimAnnotations`). Returns an entry for EVERY cached key —
 * even one with no timestamps at all — because the renderer needs
 * `keyindexResolved` to proactively show the Pitfall C disabled state for a
 * pre-Phase-14 cached row that has not yet been backfilled with a keyindex.
 * `revealedAt` is machineName-keyed (humbleRevealedStore) — an accepted
 * pre-existing limitation (Open Q4); `redeemedAt` is the WR-01-safe
 * composite-keyed local-redeemed timestamp. Never includes a key value.
 */
function getClaimAnnotations(): Record<string, ClaimAnnotation> {
  const result: Record<string, ClaimAnnotation> = {}
  for (const [gamekey, entry] of humbleLibraryStore.entries()) {
    for (const key of entry.keys) {
      const composite = compositeKey(gamekey, key.machineName)
      result[composite] = {
        revealedAt: humbleRevealedStore.get(key.machineName)?.revealedAt,
        redeemedAt: humbleLocalRedeemedStore.get(composite)?.redeemedAt,
        keyindexResolved:
          lookupKeyindex(gamekey, key.machineName) !== undefined
      }
    }
  }
  return result
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

  const cookie = await HumbleUser.getCredentials()
  if (!cookie) {
    return { status: 'failed' }
  }

  // D-33: a 403/429 denial gates EVERY sync — including manual refresh —
  // until the cooldown elapses. Enforced here in the backend, not just via
  // the renderer's (possibly stale) disabled-button state: live-UAT round 2
  // showed the renderer's stale syncError left the refresh button enabled
  // during a backend cooldown, hammering Humble on every click.
  const currentState = getSyncState()

  // HSTORE-03 (locked decision 3): captured NOW, before any per-order fetch
  // mutates humbleSyncStore below — a null `syncedAt` means this is the
  // first-ever sync for this connection (or the first since a disconnect
  // wiped humbleSyncStore, D-04/D-07). Passed to
  // detectAndNotifyExpirationTransitions()'s `suppressNotifications` at the
  // very end of this function so a fresh connect seeds the notified-state
  // baseline silently instead of firing a notification storm for every key
  // that already has an expiration.
  const hadPriorSyncSnapshot = currentState.syncedAt !== null

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

  // HDEDUP-01: recompute the ownership overlay against the current Steam
  // library at the end of EVERY sync (not just clean ones — a partial sync
  // still committed whatever orders it could, and those newly-captured
  // steamAppIds deserve an immediate match attempt). Placed after the
  // isStale() fence above, so a disconnect mid-sync never re-populates the
  // wiped humbleLibraryStore here either. Itself a no-op when Steam is
  // disconnected/empty (D-48, see recomputeOwnership's own double-gate).
  recomputeOwnership()

  // HSTORE-03 (D-90/D-91/D-92): detect expiration transitions AFTER
  // recomputeOwnership() and AFTER the isStale() fence above — so a
  // disconnect landing mid-sync never fires a notification for a cache
  // state that was just wiped. `suppressNotifications` uses the
  // `hadPriorSyncSnapshot` captured at the TOP of this function (before any
  // per-order fetch mutated humbleSyncStore): a first-ever sync silently
  // seeds every current expiration into humbleNotifiedExpirationStore
  // instead of firing a notification storm (locked decision 3).
  detectAndNotifyExpirationTransitions(getKeys(), {
    suppressNotifications: !hadPriorSyncSnapshot
  })

  return { status: sawFailure ? 'partial' : 'ok' }
}

// ── Phase 14 guided claim flow: reveal / mark-redeemed / undo orchestration ─

/**
 * The ONLY function in the entire backend that calls the adapter's reveal
 * write (C1/T-14-05) — no loop, no retry wrapper. Exact step order below is
 * load-bearing, not stylistic:
 *
 * 1. eligibility (must be a known UNREVEALED key)
 * 2. C2 re-check (D-69/D-70): backend re-reads ownedElsewhere from the LIVE
 *    key set — a fuzzy match blocks exactly like an exact match, the only
 *    escape hatch is the existing D-42 override (which clears ownedElsewhere
 *    itself, upstream of this check)
 * 3. D-79 cooldown gate (reused from D-33 — no separate reveal-specific timer)
 * 4. keyindex resolution (Pitfall C: never call the adapter with a missing
 *    keyindex — an un-backfilled pre-Phase-14 cached row is ineligible)
 * 5. credentials
 * 6. WRITE-AHEAD (SC4): the audit record AND the REVEALED flag are persisted
 *    BEFORE the network call — a crash/unexpected termination right after the
 *    call leaves the flag set rather than silently losing that the key may
 *    already have been redeemed server-side.
 * 7. the single adapter call
 * 8. outcome reconciliation (D-78): a definitive failure (schema_error /
 *    access_denied / session_expired) rolls the write-ahead flag BACK; an
 *    ambiguous (thrown/transient) outcome KEEPS it and never auto-resubmits.
 *
 * WR-01 (14-REVIEW): the eligibility check alone (state !== 'UNREVEALED')
 * cannot stop a SECOND revealKey call that arrives while the first is still
 * in flight — the cached state only flips to REVEALED after the adapter call
 * resolves. The renderer's `busy` flag is renderer-side and untrusted
 * (T-14-03), so the backend keeps its own composite-keyed in-flight set:
 * a concurrent duplicate returns `failed` without ever reaching the adapter,
 * guaranteeing the irreversible reveal POST can never double-fire.
 */
const revealsInFlight = new Set<string>()

async function revealKey(
  gamekey: string,
  machineName: string
): Promise<RevealOutcome> {
  const composite = compositeKey(gamekey, machineName)
  if (revealsInFlight.has(composite)) {
    logWarning(
      [
        'Humble reveal: rejected concurrent duplicate (reveal already in flight):',
        gamekey,
        machineName
      ],
      LogPrefix.Backend
    )
    return { status: 'failed' }
  }
  revealsInFlight.add(composite)
  try {
    return await doRevealKey(gamekey, machineName)
  } finally {
    revealsInFlight.delete(composite)
  }
}

async function doRevealKey(
  gamekey: string,
  machineName: string
): Promise<RevealOutcome> {
  const target = getKeys().find(
    (key) => key.gamekey === gamekey && key.machineName === machineName
  )
  if (!target || target.state !== 'UNREVEALED') {
    // Debug session humble-reveal-key-fails: every early-return branch below
    // used to be COMPLETELY silent in gamelib.log — indistinguishable from a
    // live network 403/401 (mapAxiosError's own silent mapping) once the
    // wizard collapses both into the same generic 'failed' step text.
    // Status-only (gamekey/machineName/state — never a key VALUE) mirrors the
    // exact redaction discipline already used for the sync-side silent-abort
    // gap fixed at fetchAndCommitOrder's access_denied/session_expired log.
    logWarning(
      [
        'Humble reveal: ineligible (target missing or not UNREVEALED):',
        gamekey,
        machineName,
        `state=${target?.state ?? 'not_found'}`
      ],
      LogPrefix.Backend
    )
    return { status: 'ineligible' }
  }

  // C2 (D-69/D-70): the backend is the sole authority — a fuzzy match blocks
  // exactly like an exact match. The renderer's view of ownedElsewhere is
  // never trusted (adversarial "renderer says unowned" case, T-14-03).
  if (target.ownedElsewhere === true) {
    appendAudit(gamekey, machineName, 'c2_block', {
      title: target.title,
      platform: target.platform
    })
    return { status: 'owned_blocked' }
  }

  const syncState = getSyncState()
  if (syncState.cooldownUntil && syncState.cooldownUntil > Date.now()) {
    // Same silent-shortcircuit gap as above — this branch never reaches the
    // adapter at all, yet the wizard's 'failed'-vs-'cooldown' distinction
    // depends on the renderer actually receiving 'cooldown' (T-14 wizard
    // switch). Logging here removes all doubt about whether a reveal attempt
    // was locally gated vs actually sent to Humble.
    logWarning(
      [
        'Humble reveal: blocked by cooldown until',
        new Date(syncState.cooldownUntil).toISOString(),
        gamekey,
        machineName
      ],
      LogPrefix.Backend
    )
    return { status: 'cooldown', retryAtMs: syncState.cooldownUntil }
  }

  const keyindex = lookupKeyindex(gamekey, machineName)
  if (keyindex === undefined) {
    // Pitfall C: a pre-Phase-14 cached row not yet backfilled with a
    // keyindex (the HUMBLE_CLASSIFIER_VERSION bump forces this on next sync)
    // must never reach the adapter call — surfaced as ineligible so the
    // wizard can show "Sync to enable claiming".
    logWarning(
      ['Humble reveal: ineligible (keyindex unresolved):', gamekey, machineName],
      LogPrefix.Backend
    )
    return { status: 'ineligible' }
  }

  // Debug session humble-reveal-key-fails: this gate only asks "did we ever
  // successfully log in / do we have a stored session at all" — the actual
  // cookie VALUE is no longer threaded into the adapter call (round 6: the
  // reveal POST's electron-net transport sources the live `persist:humble`
  // partition's cookie jar natively; see adapterRevealKey/humblePostRequest).
  if (!(await HumbleUser.getCredentials())) {
    logWarning(
      ['Humble reveal: failed (no stored credentials):', gamekey, machineName],
      LogPrefix.Backend
    )
    return { status: 'failed' }
  }
  // WR-03 (14-REVIEW): source the csrf-prevention-token from the LIVE
  // `persist:humble` partition cookie (the same jar humblePostRequest
  // attaches natively) so header and cookie can never diverge after a
  // csrf_cookie rotation; the stored login-time snapshot is only the
  // fallback inside getLiveCsrfToken().
  const csrfToken = await HumbleUser.getLiveCsrfToken()

  // WRITE-AHEAD (SC4): both the audit record and the REVEALED flag are
  // persisted BEFORE the adapter call — never after.
  appendAudit(gamekey, machineName, 'reveal_attempt', {
    title: target.title,
    platform: target.platform
  })
  humbleRevealedStore.set(machineName, { revealedAt: Date.now() })

  // Debug session humble-reveal-key-fails: presence-only (never the token
  // value) — the open question of whether a given reveal attempt actually
  // carried the csrf-prevention-token header can otherwise only be answered
  // by re-deriving it from unrelated config.json timestamps. Round 6:
  // "electron-net transport" is stamped into this line so the NEXT gamelib.log
  // capture is unambiguous about which round's fix actually ran (round 5's
  // fullCookieJarPresent field is retired along with getFullCookieHeader —
  // superseded by the transport's native cookie attachment, see user.ts).
  logInfo(
    [
      'Humble reveal: calling adapter (electron-net transport), csrfTokenPresent=' +
        String(csrfToken !== undefined),
      gamekey,
      machineName
    ],
    LogPrefix.Backend
  )

  try {
    const result = await adapterRevealKey(csrfToken, {
      gamekey,
      machineName,
      keyindex
    })

    if (result.status === 'ok') {
      // D-74: persist the plaintext value onto the existing cache entry's
      // internal field — no new secret-surface store.
      patchCachedState(gamekey, machineName, 'REVEALED', {
        revealedKeyValue: result.data.key
      })
      appendAudit(gamekey, machineName, 'reveal_success', {
        title: target.title,
        platform: target.platform,
        outcome: 'ok'
      })
      return { status: 'revealed', key: result.data.key }
    }

    if (result.status === 'rejected_by_server') {
      // WR-06 (14-REVIEW): a definitive server DENIAL (e.g. already
      // redeemed / expired) is not a transport failure — the request reached
      // Humble and was processed. KEEP the write-ahead REVEALED flag (the
      // truthful local state is "unconfirmed — sync to check", same as the
      // ambiguous path): an "already redeemed" denial means the key IS
      // consumed server-side, so rolling back to UNREVEALED would misreport
      // "nothing was used up" and invite an endless retry loop against a
      // consumed key. Never auto-resubmit (T-14-05).
      appendAudit(gamekey, machineName, 'reveal_rejected', {
        title: target.title,
        platform: target.platform,
        outcome: 'rejected_by_server'
      })
      logWarning(
        [
          'Humble reveal: rejected by server (definitive denial, keeping REVEALED flag):',
          gamekey,
          machineName
        ],
        LogPrefix.Backend
      )
      return { status: 'rejected_by_server' }
    }

    // Definitive failure (D-78): roll back the write-ahead REVEALED flag —
    // this key was never actually revealed server-side.
    humbleRevealedStore.delete(machineName)
    appendAudit(gamekey, machineName, 'reveal_failed', {
      title: target.title,
      platform: target.platform,
      outcome: result.status
    })
    // Debug session humble-reveal-key-fails: mapAxiosError is SILENT for
    // 401/403/429 (access_denied/session_expired never log a line on their
    // own) — this was the reason "no reveal log lines" could not previously
    // distinguish a live Humble denial from any of the local silent
    // shortcircuits above. Status only (never a body/cookie/key value).
    logWarning(
      ['Humble reveal: definitive failure, status=' + result.status, gamekey, machineName],
      LogPrefix.Backend
    )
    if (result.status === 'access_denied') {
      // D-79: reuse the existing D-33 shared cooldown — no separate
      // reveal-specific timer.
      setSyncState({
        syncError: 'denied',
        cooldownUntil: Date.now() + HUMBLE_COOLDOWN_MS
      })
    }
    return { status: 'failed' }
  } catch (err) {
    // Ambiguous (D-78): the adapter threw (network/timeout/5xx class, same
    // as getGamekeys/getOrderDetail's D-31 throw contract) — we genuinely do
    // not know whether Humble processed the reveal. KEEP the write-ahead
    // flag and persist NO key value (getRevealedKeyValue stays null — the
    // Pitfall B signal the wizard surfaces as "unconfirmed"). Never
    // auto-resubmit (T-14-05) — only an explicit user retry may call
    // revealKey again.
    logWarning(
      [
        'Humble reveal: adapter threw (ambiguous), keeping REVEALED flag:',
        gamekey,
        machineName,
        err
      ],
      LogPrefix.Backend
    )
    appendAudit(gamekey, machineName, 'reveal_ambiguous', {
      title: target.title,
      platform: target.platform
    })
    return { status: 'ambiguous' }
  }
}

/**
 * D-77, realigned by the Phase 14 gap closure (14-07): marks a REVEALED key
 * as locally redeemed. This is the SOLE source of the REDEEMED state — the
 * server has no knowledge of Steam activation, so REDEEMED can never be
 * derived from sync data (see classify.ts). Every mark made here is
 * therefore always undoable; there is no second, non-undoable
 * "server-confirmed" tier.
 */
async function markRedeemed(
  gamekey: string,
  machineName: string
): Promise<RedeemOutcome> {
  const target = getKeys().find(
    (key) => key.gamekey === gamekey && key.machineName === machineName
  )
  if (!target || target.state !== 'REVEALED') {
    return { status: 'ineligible' }
  }

  humbleLocalRedeemedStore.set(compositeKey(gamekey, machineName), {
    redeemedAt: Date.now()
  })
  appendAudit(gamekey, machineName, 'mark_redeemed', {
    title: target.title,
    platform: target.platform
  })
  patchCachedState(gamekey, machineName, 'REDEEMED')
  return { status: 'ok' }
}

/**
 * D-77, realigned by the Phase 14 gap closure (14-07): undoes a local "Mark
 * as redeemed" action, reverting the key back to REVEALED. Every REDEEMED
 * key is local-only (there is no server-confirmed tier to protect), so this
 * is a no-op only when there is nothing to undo (key missing or not
 * currently REDEEMED).
 */
async function undoRedeemed(
  gamekey: string,
  machineName: string
): Promise<void> {
  const target = getKeys().find(
    (key) => key.gamekey === gamekey && key.machineName === machineName
  )
  if (!target || target.state !== 'REDEEMED') {
    return
  }

  humbleLocalRedeemedStore.delete(compositeKey(gamekey, machineName))
  appendAudit(gamekey, machineName, 'undo_redeemed', {
    title: target.title,
    platform: target.platform
  })
  patchCachedState(gamekey, machineName, 'REVEALED')
}

export const HumbleLibrary = {
  loadCached,
  sync,
  getKeys,
  getSyncState,
  recomputeOwnership,
  setOwnershipOverride,
  clearOwnershipOverride,
  getAllOwnershipOverrides,
  recordGiftLinkOpened,
  getAllGiftedAt,
  revealKey,
  markRedeemed,
  undoRedeemed,
  getRevealedKeyValue,
  getClaimAnnotations
}
