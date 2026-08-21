/**
 * Unit tests for HumbleLibrary sync orchestration (library.ts).
 * Covers HSYNC-01 (concurrency-bounded, cache-aggressive sync), HSYNC-03
 * (skip-terminal partitioning so expirations recompute), and HSYNC-04
 * (fail-soft: BOTH the typed access_denied/schema_error results AND the
 * thrown network/timeout/5xx class, per D-31, are caught at every adapter
 * call site and never wipe the cache).
 *
 * Mock boundaries:
 *  - ../adapter        -> getGamekeys, getOrderDetail
 *  - ../user           -> HumbleUser.getCredentials
 *  - ../electronStores -> humbleLibraryStore, humbleSyncStore, humbleRevealedStore,
 *                         humbleOwnershipOverrideStore
 *  - backend/storeManagers/steam/electronStores -> steamLibraryStore
 *  - backend/storeManagers/steam/user -> SteamUser.isLoggedIn
 *  - backend/ipc       -> sendFrontendMessage
 *  - backend/logger    -> logInfo/logError/logWarning
 *
 * classify.ts is NOT mocked — real classification runs against small
 * fixture-shaped raw orders so partition/commit assertions exercise the real
 * 5-state precedence rather than a stub. dedup.ts is likewise NOT mocked —
 * the Phase 12 ownership-recompute tests exercise the real two-tier matcher.
 */

import type {
  HumbleKey,
  HumbleKeyState,
  HumbleOrderCacheEntry,
  HumbleSyncState
} from 'common/types/humble'
import type { HumbleKeyInternal } from '../electronStores'

// ── electronStores mock (in-memory Map/Set-backed CacheStore doubles) ──────
// NOTE: jest.config's `resetMocks: true` strips mock implementations before
// EVERY test, so the has/get/set/entries/clear implementations below are
// re-established in beforeEach() (resetStoreMocks()), not just once here —
// only the plain jest.fn() shells are declared at module scope.

const libraryData = new Map<string, HumbleOrderCacheEntry>()
const mockLibraryStore = {
  has: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  entries: jest.fn(),
  clear: jest.fn()
}

const syncData = new Map<string, HumbleSyncState>()
const mockSyncStore = {
  get: jest.fn(),
  set: jest.fn(),
  has: jest.fn(),
  clear: jest.fn()
}

const revealedData = new Map<string, { revealedAt: number }>()
const mockRevealedStore = {
  has: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn()
}

// D-42/D-43 override store: keyed by machine_name. Map-backed (WR-04) so
// getAllOwnershipOverrides can read the overriddenAt timestamps.
const overrideData = new Map<string, { overriddenAt: number }>()
const mockOverrideStore = {
  has: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
  entries: jest.fn()
}

// Phase 14 (D-77): local-redeemed store, composite-keyed `gamekey:machineName`.
const localRedeemedData = new Map<string, { redeemedAt: number }>()
const mockLocalRedeemedStore = {
  has: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn()
}

// Phase 14 (D-76): audit trail store, composite-keyed `gamekey:machineName`,
// value is an append-only array of AuditRecord.
const auditData = new Map<string, Array<Record<string, unknown>>>()
const mockAuditStore = {
  get: jest.fn(),
  set: jest.fn(),
  clear: jest.fn()
}

function resetStoreMocks() {
  mockLibraryStore.has.mockImplementation((k: string) => libraryData.has(k))
  mockLibraryStore.get.mockImplementation((k: string) => libraryData.get(k))
  mockLibraryStore.set.mockImplementation(
    (k: string, v: HumbleOrderCacheEntry) => {
      libraryData.set(k, v)
    }
  )
  mockLibraryStore.entries.mockImplementation(() =>
    Array.from(libraryData.entries())
  )
  mockLibraryStore.clear.mockImplementation(() => libraryData.clear())

  mockSyncStore.get.mockImplementation(
    (k: string, fallback?: HumbleSyncState) =>
      syncData.has(k) ? syncData.get(k) : fallback
  )
  mockSyncStore.set.mockImplementation((k: string, v: HumbleSyncState) => {
    syncData.set(k, v)
  })
  mockSyncStore.has.mockImplementation((k: string) => syncData.has(k))
  mockSyncStore.clear.mockImplementation(() => syncData.clear())

  mockRevealedStore.has.mockImplementation((k: string) => revealedData.has(k))
  mockRevealedStore.get.mockImplementation((k: string) => revealedData.get(k))
  mockRevealedStore.set.mockImplementation(
    (k: string, v: { revealedAt: number }) => {
      revealedData.set(k, v)
    }
  )
  mockRevealedStore.delete.mockImplementation((k: string) => {
    revealedData.delete(k)
  })
  mockRevealedStore.clear.mockImplementation(() => revealedData.clear())

  mockOverrideStore.has.mockImplementation((k: string) => overrideData.has(k))
  mockOverrideStore.set.mockImplementation(
    (k: string, v: { overriddenAt: number }) => {
      overrideData.set(k, v)
    }
  )
  mockOverrideStore.delete.mockImplementation((k: string) => {
    overrideData.delete(k)
  })
  mockOverrideStore.clear.mockImplementation(() => overrideData.clear())
  mockOverrideStore.entries.mockImplementation(() =>
    Array.from(overrideData.entries())
  )

  mockLocalRedeemedStore.has.mockImplementation((k: string) =>
    localRedeemedData.has(k)
  )
  mockLocalRedeemedStore.get.mockImplementation((k: string) =>
    localRedeemedData.get(k)
  )
  mockLocalRedeemedStore.set.mockImplementation(
    (k: string, v: { redeemedAt: number }) => {
      localRedeemedData.set(k, v)
    }
  )
  mockLocalRedeemedStore.delete.mockImplementation((k: string) => {
    localRedeemedData.delete(k)
  })
  mockLocalRedeemedStore.clear.mockImplementation(() =>
    localRedeemedData.clear()
  )

  mockAuditStore.get.mockImplementation(
    (k: string, fallback?: Array<Record<string, unknown>>) =>
      auditData.has(k) ? auditData.get(k) : fallback
  )
  mockAuditStore.set.mockImplementation(
    (k: string, v: Array<Record<string, unknown>>) => {
      auditData.set(k, v)
    }
  )
  mockAuditStore.clear.mockImplementation(() => auditData.clear())
}

jest.mock('../electronStores', () => ({
  humbleLibraryStore: mockLibraryStore,
  humbleSyncStore: mockSyncStore,
  humbleRevealedStore: mockRevealedStore,
  humbleOwnershipOverrideStore: mockOverrideStore,
  humbleLocalRedeemedStore: mockLocalRedeemedStore,
  humbleAuditStore: mockAuditStore
}))

// ── Steam store manager mocks (D-48 connectivity double-gate) ──────────────

const mockSteamLibraryStoreGet = jest.fn()
jest.mock('backend/storeManagers/steam/electronStores', () => ({
  steamLibraryStore: {
    get: (...args: unknown[]) => mockSteamLibraryStoreGet(...args)
  }
}))

const mockSteamIsLoggedIn = jest.fn()
jest.mock('backend/storeManagers/steam/user', () => ({
  SteamUser: { isLoggedIn: () => mockSteamIsLoggedIn() }
}))

// ── adapter mock ─────────────────────────────────────────────────────────

const mockGetGamekeys = jest.fn()
const mockGetOrderDetail = jest.fn()
const mockAdapterRevealKey = jest.fn()
jest.mock('../adapter', () => ({
  getGamekeys: (...args: unknown[]) => mockGetGamekeys(...args),
  getOrderDetail: (...args: unknown[]) => mockGetOrderDetail(...args),
  revealKey: (...args: unknown[]) => mockAdapterRevealKey(...args)
}))

// ── user mock (credentials/csrf only — auth flows are Plan 02's caller) ─────
// Round 6 (debug session humble-reveal-key-fails): getFullCookieHeader() was
// removed from HumbleUser — the reveal POST's electron-net transport now
// sources the live partition's cookie jar natively (see adapter.ts).

const mockGetCredentials = jest.fn(() => 'cookie-value')
const mockGetCsrfToken = jest.fn(() => 'csrf-token-value')
// WR-03: revealKey now sources the csrf token from the LIVE partition cookie
// (getLiveCsrfToken) rather than the stored login-time snapshot.
const mockGetLiveCsrfToken = jest.fn(async () => 'csrf-token-value')
jest.mock('../user', () => ({
  HumbleUser: {
    getCredentials: () => mockGetCredentials(),
    getCsrfToken: () => mockGetCsrfToken(),
    getLiveCsrfToken: () => mockGetLiveCsrfToken()
  }
}))

// ── ipc / logger mocks ───────────────────────────────────────────────────

const mockSendFrontendMessage = jest.fn()
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: (...args: unknown[]) => mockSendFrontendMessage(...args)
}))

const mockLogInfo = jest.fn()
const mockLogError = jest.fn()
const mockLogWarning = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: { Backend: 'Backend' }
}))

// ── expirationAlerts mock (HSTORE-03, Plan 03) ──────────────────────────────
// Mocked wholesale rather than exercised for real: the real module imports
// `backend/config` (GlobalConfig), which pulls in a large unrelated module
// graph (storeManagers/gog etc.) that this suite does not otherwise mock.
// The wiring itself (called after recomputeOwnership, with the correct
// suppressNotifications value) is asserted below; digest/dedup/notification
// behavior is fully covered by expirationAlerts.test.ts.
const mockDetectAndNotifyExpirationTransitions = jest.fn()
jest.mock('../expirationAlerts', () => ({
  detectAndNotifyExpirationTransitions: (...args: unknown[]) =>
    mockDetectAndNotifyExpirationTransitions(...args)
}))

// ── Imports (after mocks) ────────────────────────────────────────────────

import { HumbleLibrary } from '../library'
import { invalidateSyncGeneration } from '../syncFence'
import {
  HUMBLE_SYNC_CONCURRENCY,
  HUMBLE_CLASSIFIER_VERSION
} from '../constants'
import { selectKeysWaiting } from 'common/humble/viewFilters'
import { setLoginWindowSeam, type LoginWindowSeam } from '../loginWindowSeam'

const flushAsync = async () => new Promise((r) => setImmediate(r))

function makeRawOrder(
  gamekey: string,
  opts: {
    machineName?: string
    redeemed?: boolean
    expiration?: string | null
    title?: string
    steamAppId?: string | number
  } = {}
) {
  return {
    gamekey,
    human_name: `Order ${gamekey}`,
    tpkd_dict: {
      all_tpks: [
        {
          machine_name: opts.machineName ?? `${gamekey}_key`,
          human_name: opts.title ?? `Key for ${gamekey}`,
          key_type: 'steam',
          redeemed_key_value: opts.redeemed ? 'REDEEMED-VALUE' : null,
          expiration: opts.expiration ?? null,
          ...(opts.steamAppId !== undefined
            ? { steam_app_id: opts.steamAppId }
            : {})
        }
      ]
    }
  }
}

function makeTerminalEntry(gamekey: string): HumbleOrderCacheEntry {
  const key: HumbleKey = {
    gamekey,
    machineName: `${gamekey}_key`,
    state: 'REDEEMED',
    title: `Key for ${gamekey}`,
    platform: 'steam',
    expiration: null,
    origin: `Order ${gamekey}`,
    ownedElsewhere: false,
    matchConfidence: 'none'
  }
  return { gamekey, keys: [key], allTerminal: true }
}

function makeNonTerminalEntry(gamekey: string): HumbleOrderCacheEntry {
  const key: HumbleKey = {
    gamekey,
    machineName: `${gamekey}_key`,
    state: 'UNREVEALED',
    title: `Key for ${gamekey}`,
    platform: 'steam',
    expiration: null,
    origin: `Order ${gamekey}`,
    ownedElsewhere: false,
    matchConfidence: 'none'
  }
  return { gamekey, keys: [key], allTerminal: false }
}

// Phase 14 guided claim flow: a cached entry carrying the internal-only
// `keyindex` field (D-74) — the shape a real sync would have produced after
// classifyOrder's keyIndexByComposite merge (library.ts, Task 1).
function makeRevealableEntry(
  gamekey: string,
  opts: {
    machineName?: string
    keyindex?: string | number
    ownedElsewhere?: boolean
    matchConfidence?: 'exact' | 'fuzzy' | 'none'
    state?: HumbleKeyState
    revealedKeyValue?: string
  } = {}
): HumbleOrderCacheEntry {
  const key: HumbleKeyInternal = {
    gamekey,
    machineName: opts.machineName ?? `${gamekey}_key`,
    state: opts.state ?? 'UNREVEALED',
    title: `Key for ${gamekey}`,
    platform: 'steam',
    expiration: null,
    origin: `Order ${gamekey}`,
    ownedElsewhere: opts.ownedElsewhere ?? false,
    matchConfidence: opts.matchConfidence ?? 'none',
    ...(opts.keyindex !== undefined ? { keyindex: opts.keyindex } : {}),
    ...(opts.revealedKeyValue !== undefined
      ? { revealedKeyValue: opts.revealedKeyValue }
      : {})
  }
  return { gamekey, keys: [key], allTerminal: false }
}

describe('HumbleLibrary', () => {
  beforeEach(() => {
    libraryData.clear()
    syncData.clear()
    revealedData.clear()
    overrideData.clear()
    localRedeemedData.clear()
    auditData.clear()
    resetStoreMocks()
    mockGetCredentials.mockReturnValue('cookie-value')
    mockGetCsrfToken.mockReturnValue('csrf-token-value')
    mockGetLiveCsrfToken.mockResolvedValue('csrf-token-value')
    mockAdapterRevealKey.mockReset()
    // Default: Steam disconnected / no owned games — existing (pre-Phase-12)
    // tests must see zero ownership-recompute activity unless a test opts in.
    mockSteamIsLoggedIn.mockReturnValue(false)
    mockSteamLibraryStoreGet.mockReturnValue([])
  })

  // ── loadCached() / getKeys() / getSyncState() ───────────────────────────

  describe('loadCached()', () => {
    test('reads the cache, pushes the flattened humbleKeysUpdated, and makes no network call', () => {
      libraryData.set('gk1', makeNonTerminalEntry('gk1'))
      libraryData.set('gk2', makeTerminalEntry('gk2'))

      HumbleLibrary.loadCached()

      expect(mockGetGamekeys).not.toHaveBeenCalled()
      expect(mockGetOrderDetail).not.toHaveBeenCalled()
      expect(mockSendFrontendMessage).toHaveBeenCalledWith(
        'humbleKeysUpdated',
        [...makeNonTerminalEntry('gk1').keys, ...makeTerminalEntry('gk2').keys]
      )
    })
  })

  describe('getKeys()', () => {
    test('returns the flattened key list across all cached orders', () => {
      libraryData.set('gk1', makeNonTerminalEntry('gk1'))
      libraryData.set('gk2', makeTerminalEntry('gk2'))

      const keys = HumbleLibrary.getKeys()

      expect(keys).toHaveLength(2)
      expect(keys.map((k) => k.gamekey).sort()).toEqual(['gk1', 'gk2'])
    })

    test('returns an empty array when the cache is empty', () => {
      expect(HumbleLibrary.getKeys()).toEqual([])
    })
  })

  describe('getSyncState()', () => {
    test('defaults to syncedAt=null, syncError=none when nothing has synced yet', () => {
      expect(HumbleLibrary.getSyncState()).toEqual({
        syncedAt: null,
        syncError: 'none'
      })
    })
  })

  // ── sync(): partitioning (Pitfall 3) ─────────────────────────────────────

  describe('sync() — skip-terminal partitioning', () => {
    test('a never-cached gamekey is always fetched', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['new-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('new-gk')
      })

      const result = await HumbleLibrary.sync()

      expect(mockGetOrderDetail).toHaveBeenCalledWith('cookie-value', 'new-gk')
      expect(result).toEqual({ status: 'ok' })
    })

    test('an all-terminal cached gamekey is never re-fetched', async () => {
      libraryData.set('frozen-gk', makeTerminalEntry('frozen-gk'))
      // Freezing requires a version-matched cache (round 6): a mismatch
      // triggers the one-off full re-classification instead.
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: HUMBLE_CLASSIFIER_VERSION
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['frozen-gk'] })

      const result = await HumbleLibrary.sync()

      expect(mockGetOrderDetail).not.toHaveBeenCalled()
      expect(result).toEqual({ status: 'ok' })
    })

    test('a non-terminal cached gamekey IS re-fetched (HSYNC-03 recompute)', async () => {
      libraryData.set('pending-gk', makeNonTerminalEntry('pending-gk'))
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['pending-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('pending-gk', { expiration: '2020-01-01T00:00:00Z' })
      })

      await HumbleLibrary.sync()

      expect(mockGetOrderDetail).toHaveBeenCalledWith(
        'cookie-value',
        'pending-gk'
      )
      expect(libraryData.get('pending-gk')?.allTerminal).toBe(true)
    })

    test('mixed new/non-terminal/frozen: fetches only the union of new+non-terminal', async () => {
      libraryData.set('frozen-gk', makeTerminalEntry('frozen-gk'))
      libraryData.set('pending-gk', makeNonTerminalEntry('pending-gk'))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: HUMBLE_CLASSIFIER_VERSION
      })
      mockGetGamekeys.mockResolvedValue({
        status: 'ok',
        data: ['frozen-gk', 'pending-gk', 'new-gk']
      })
      mockGetOrderDetail.mockImplementation((_cookie: string, gk: string) =>
        Promise.resolve({ status: 'ok', data: makeRawOrder(gk) })
      )

      await HumbleLibrary.sync()

      expect(mockGetOrderDetail).toHaveBeenCalledTimes(2)
      const fetched = mockGetOrderDetail.mock.calls.map((c) => c[1]).sort()
      expect(fetched).toEqual(['new-gk', 'pending-gk'])
    })
  })

  // ── sync(): HSTORE-03 expiration-transition-detection wiring ────────────

  describe('sync() — expiration transition detection wiring (HSTORE-03)', () => {
    test('calls detectAndNotifyExpirationTransitions after a clean sync, with suppressNotifications=false when a prior sync snapshot exists', async () => {
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: HUMBLE_CLASSIFIER_VERSION
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['new-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('new-gk')
      })

      await HumbleLibrary.sync()

      expect(mockDetectAndNotifyExpirationTransitions).toHaveBeenCalledTimes(1)
      expect(mockDetectAndNotifyExpirationTransitions).toHaveBeenCalledWith(
        HumbleLibrary.getKeys(),
        { suppressNotifications: false }
      )
    })

    test('suppressNotifications=true on a first-ever sync (no prior syncedAt)', async () => {
      // syncData starts empty in beforeEach -> getSyncState() falls back to
      // { syncedAt: null, syncError: 'none' } (first-ever sync/connection).
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['new-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('new-gk')
      })

      await HumbleLibrary.sync()

      expect(mockDetectAndNotifyExpirationTransitions).toHaveBeenCalledWith(
        expect.anything(),
        { suppressNotifications: true }
      )
    })

    test('a fully-failed sync (getGamekeys denied) never calls detectAndNotifyExpirationTransitions', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'access_denied' })

      await HumbleLibrary.sync()

      expect(mockDetectAndNotifyExpirationTransitions).not.toHaveBeenCalled()
    })
  })

  // ── sync(): concurrency bound (Pattern 3) ───────────────────────────────

  describe('sync() — bounded concurrency', () => {
    test(`never dispatches more than HUMBLE_SYNC_CONCURRENCY (${HUMBLE_SYNC_CONCURRENCY}) order-detail fetches concurrently`, async () => {
      const gamekeys = ['gk1', 'gk2', 'gk3', 'gk4', 'gk5', 'gk6', 'gk7']
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: gamekeys })

      let inFlight = 0
      let maxInFlight = 0
      let resolvers: Array<() => void> = []

      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) => {
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          return new Promise((resolve) => {
            resolvers.push(() => {
              inFlight--
              resolve({ status: 'ok', data: makeRawOrder(gamekey) })
            })
          })
        }
      )

      const syncPromise = HumbleLibrary.sync()
      await flushAsync()
      expect(mockGetOrderDetail.mock.calls.length).toBeLessThanOrEqual(
        HUMBLE_SYNC_CONCURRENCY
      )

      for (let i = 0; i < 20 && resolvers.length; i++) {
        const wave = resolvers
        resolvers = []
        wave.forEach((r) => r())
        await flushAsync()
      }

      const result = await syncPromise

      expect(maxInFlight).toBeLessThanOrEqual(HUMBLE_SYNC_CONCURRENCY)
      expect(mockGetOrderDetail).toHaveBeenCalledTimes(gamekeys.length)
      expect(result).toEqual({ status: 'ok' })
    })
  })

  // ── sync(): getGamekeys typed-result fail-soft (HSYNC-04) ───────────────

  describe('sync() — getGamekeys typed-result fail-soft', () => {
    test('access_denied (incl. 429): cache untouched, syncError=denied + cooldown set, returns failed', async () => {
      libraryData.set('existing-gk', makeNonTerminalEntry('existing-gk'))
      mockGetGamekeys.mockResolvedValue({ status: 'access_denied' })

      const result = await HumbleLibrary.sync()

      expect(result).toEqual({ status: 'failed' })
      expect(mockGetOrderDetail).not.toHaveBeenCalled()
      expect(mockLibraryStore.clear).not.toHaveBeenCalled()
      expect(libraryData.get('existing-gk')).toEqual(
        makeNonTerminalEntry('existing-gk')
      )

      const state = HumbleLibrary.getSyncState()
      expect(state.syncError).toBe('denied')
      expect(state.cooldownUntil).toBeDefined()
      expect(state.cooldownUntil as number).toBeGreaterThan(Date.now())
    })

    test('schema_error: cache untouched, syncError=network, NO cooldown, returns failed', async () => {
      libraryData.set('existing-gk', makeNonTerminalEntry('existing-gk'))
      mockGetGamekeys.mockResolvedValue({ status: 'schema_error', raw: {} })

      const result = await HumbleLibrary.sync()

      expect(result).toEqual({ status: 'failed' })
      expect(mockGetOrderDetail).not.toHaveBeenCalled()
      expect(mockLibraryStore.clear).not.toHaveBeenCalled()
      expect(libraryData.get('existing-gk')).toEqual(
        makeNonTerminalEntry('existing-gk')
      )

      const state = HumbleLibrary.getSyncState()
      expect(state.syncError).toBe('network')
      expect(state.cooldownUntil).toBeUndefined()
    })

    test('session_expired: returns failed WITHOUT setting syncError/cooldown (Phase 10 owns expiry)', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

      const result = await HumbleLibrary.sync()

      expect(result).toEqual({ status: 'failed' })
      const state = HumbleLibrary.getSyncState()
      expect(state.syncError).toBe('none')
      expect(state.cooldownUntil).toBeUndefined()
    })
  })

  // ── sync(): getGamekeys THROWN rejection fail-soft (HSYNC-04 / D-31) ────

  describe('sync() — getGamekeys thrown-rejection fail-soft (D-31)', () => {
    test('a thrown network/timeout/5xx error is CAUGHT: cache untouched, syncError=network, no cooldown, returns failed (never an unhandled rejection)', async () => {
      libraryData.set('existing-gk', makeNonTerminalEntry('existing-gk'))
      mockGetGamekeys.mockRejectedValue(new Error('ECONNRESET'))

      await expect(HumbleLibrary.sync()).resolves.toEqual({
        status: 'failed'
      })

      expect(mockGetOrderDetail).not.toHaveBeenCalled()
      expect(mockLibraryStore.clear).not.toHaveBeenCalled()
      expect(libraryData.get('existing-gk')).toEqual(
        makeNonTerminalEntry('existing-gk')
      )

      const state = HumbleLibrary.getSyncState()
      expect(state.syncError).toBe('network')
      expect(state.cooldownUntil).toBeUndefined()
    })
  })

  // ── sync(): per-order isolation (Pattern 2) ─────────────────────────────

  describe('sync() — per-order isolation', () => {
    test("one getOrderDetail REJECTING keeps that order's cached entry, the pool finishes the others, sync ends partial", async () => {
      const priorEntry = makeNonTerminalEntry('flaky-gk')
      libraryData.set('flaky-gk', priorEntry)
      mockGetGamekeys.mockResolvedValue({
        status: 'ok',
        data: ['flaky-gk', 'good-gk']
      })
      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) => {
          if (gamekey === 'flaky-gk') {
            return Promise.reject(new Error('timeout'))
          }
          return Promise.resolve({ status: 'ok', data: makeRawOrder(gamekey) })
        }
      )

      const result = await HumbleLibrary.sync()

      expect(result).toEqual({ status: 'partial' })
      expect(libraryData.get('flaky-gk')).toEqual(priorEntry)
      expect(libraryData.has('good-gk')).toBe(true)
    })

    test('one order schema_error keeps its prior cache entry, continues the rest, sync ends partial', async () => {
      const priorEntry = makeNonTerminalEntry('bad-gk')
      libraryData.set('bad-gk', priorEntry)
      mockGetGamekeys.mockResolvedValue({
        status: 'ok',
        data: ['bad-gk', 'good-gk']
      })
      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) => {
          if (gamekey === 'bad-gk') {
            return Promise.resolve({ status: 'schema_error', raw: {} })
          }
          return Promise.resolve({ status: 'ok', data: makeRawOrder(gamekey) })
        }
      )

      const result = await HumbleLibrary.sync()

      expect(result).toEqual({ status: 'partial' })
      expect(libraryData.get('bad-gk')).toEqual(priorEntry)
      expect(libraryData.has('good-gk')).toBe(true)
    })
  })

  // ── sync(): mid-sync abort keeps committed work (D-34 / Pitfall 4) ──────

  describe('sync() — mid-sync 403/429 abort (D-34)', () => {
    test('commits orders already resolved before the abort, leaves never-dispatched gamekeys untouched, returns partial', async () => {
      mockGetGamekeys.mockResolvedValue({
        status: 'ok',
        data: ['gk1', 'gk2', 'gk3', 'gk4', 'gk5']
      })

      let resolveGk1!: (v: unknown) => void
      let resolveGk3!: (v: unknown) => void
      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) => {
          if (gamekey === 'gk1') {
            return new Promise((r) => {
              resolveGk1 = r
            })
          }
          if (gamekey === 'gk2') {
            // Resolves immediately as the denial — the other two initial
            // dispatches (gk1, gk3) are already in flight and must still
            // settle, but gk4/gk5 must never be dispatched.
            return Promise.resolve({ status: 'access_denied' })
          }
          if (gamekey === 'gk3') {
            return new Promise((r) => {
              resolveGk3 = r
            })
          }
          return Promise.resolve({ status: 'ok', data: makeRawOrder(gamekey) })
        }
      )

      const syncPromise = HumbleLibrary.sync()
      await flushAsync()

      // Only the initial HUMBLE_SYNC_CONCURRENCY dispatches happened.
      expect(mockGetOrderDetail).toHaveBeenCalledTimes(3)

      resolveGk1({ status: 'ok', data: makeRawOrder('gk1') })
      resolveGk3({ status: 'ok', data: makeRawOrder('gk3') })
      await flushAsync()

      const result = await syncPromise

      expect(result).toEqual({ status: 'partial' })
      // Never dispatched beyond the initial wave.
      expect(mockGetOrderDetail).toHaveBeenCalledTimes(3)
      // In-flight tasks still settle and commit.
      expect(libraryData.has('gk1')).toBe(true)
      expect(libraryData.has('gk3')).toBe(true)
      // Never-dispatched gamekeys keep prior (absent) cache.
      expect(libraryData.has('gk4')).toBe(false)
      expect(libraryData.has('gk5')).toBe(false)

      const state = HumbleLibrary.getSyncState()
      expect(state.syncError).toBe('partial')
    })
  })

  // CR-01: disconnect must fence the in-flight sync. HumbleUser.disconnect()
  // bumps the sync generation BEFORE wiping the stores; a sync started under
  // the old generation must never commit to the (wiped) library store, never
  // write the (wiped) sync store, never push keys/progress to the renderer,
  // and must stop issuing authenticated requests at its next dispatch.
  describe('sync() — CR-01 disconnect fence', () => {
    // Simulates exactly what HumbleUser.disconnect() does to library state:
    // bump the generation FIRST, then wipe the stores.
    function simulateDisconnect() {
      invalidateSyncGeneration()
      libraryData.clear()
      syncData.clear()
    }

    test('disconnect mid-sync: wiped stores stay wiped — no store commits, no sync-state write, no keys/progress pushes after the fence', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1', 'gk2'] })
      const resolvers = new Map<string, (v: unknown) => void>()
      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) =>
          new Promise((r) => {
            resolvers.set(gamekey, r)
          })
      )

      const syncPromise = HumbleLibrary.sync()
      await flushAsync()
      expect(resolvers.size).toBe(2) // both orders in flight pre-disconnect

      simulateDisconnect()
      mockSendFrontendMessage.mockClear()
      mockLibraryStore.set.mockClear()
      mockSyncStore.set.mockClear()

      // The pre-disconnect fetches now settle successfully — none of their
      // results may survive the wipe.
      resolvers.get('gk1')!({ status: 'ok', data: makeRawOrder('gk1') })
      resolvers.get('gk2')!({ status: 'ok', data: makeRawOrder('gk2') })
      await flushAsync()
      const result = await syncPromise

      expect(result).toEqual({ status: 'failed' })
      expect(mockLibraryStore.set).not.toHaveBeenCalled()
      expect(mockSyncStore.set).not.toHaveBeenCalled()
      expect(libraryData.size).toBe(0)
      expect(syncData.size).toBe(0)
      expect(HumbleLibrary.getKeys()).toEqual([])

      // No humbleKeysUpdated/humbleSyncProgress push may overwrite the
      // renderer's cleared state. The terminal humbleSyncStateChanged push
      // still fires (from sync()'s finally) but reads the WIPED store —
      // never pre-disconnect data.
      const staleEvents = mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleKeysUpdated' || c[0] === 'humbleSyncProgress'
      )
      expect(staleEvents).toEqual([])
      const terminal = mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleSyncStateChanged'
      )
      expect(terminal).toHaveLength(1)
      expect(terminal[0][1]).toEqual({ syncedAt: null, syncError: 'none' })
    })

    test('disconnect mid-sync: still-to-be-dispatched workers stop issuing authenticated requests', async () => {
      const gamekeys = ['gk1', 'gk2', 'gk3', 'gk4', 'gk5']
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: gamekeys })
      const resolvers: Array<(v: unknown) => void> = []
      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) =>
          new Promise((r) => {
            resolvers.push(() =>
              r({ status: 'ok', data: makeRawOrder(gamekey) })
            )
          })
      )

      const syncPromise = HumbleLibrary.sync()
      await flushAsync()
      // Only the initial concurrency-bound wave is in flight.
      expect(mockGetOrderDetail).toHaveBeenCalledTimes(HUMBLE_SYNC_CONCURRENCY)

      simulateDisconnect()

      // Drain the in-flight wave — the pool would normally dispatch gk4/gk5
      // next, but the fence must prevent any further authenticated request.
      resolvers.forEach((r) => r(undefined))
      await flushAsync()
      await syncPromise

      expect(mockGetOrderDetail).toHaveBeenCalledTimes(HUMBLE_SYNC_CONCURRENCY)
    })

    test('a sync started AFTER the disconnect (new generation) commits normally', async () => {
      simulateDisconnect()
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['fresh-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('fresh-gk')
      })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })

      expect(libraryData.has('fresh-gk')).toBe(true)
      expect(HumbleLibrary.getSyncState().syncedAt).toEqual(expect.any(Number))
    })
  })

  // ── Live-UAT round 2 (debug: humble-keys-empty-list-flashing-sync) ──────

  describe('sync() — terminal humbleSyncStateChanged push (D-31/D-32, round 2)', () => {
    function syncStateEvents() {
      return mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleSyncStateChanged'
      )
    }

    test('clean completion: pushes the fresh HumbleSyncState AFTER the final progress event', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1')
      })

      await HumbleLibrary.sync()

      const events = syncStateEvents()
      expect(events).toHaveLength(1)
      expect(events[0][1]).toEqual(
        expect.objectContaining({
          syncedAt: expect.any(Number),
          syncError: 'none'
        })
      )

      // Ordering: the terminal state push is the LAST humble event — the
      // renderer relies on it as the single authoritative end-of-sync signal.
      const calls = mockSendFrontendMessage.mock.calls
      expect(calls[calls.length - 1][0]).toBe('humbleSyncStateChanged')
    })

    test('partial completion (one order schema_error): pushed state carries syncError=partial AND a fresh syncedAt', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['bad-gk'] })
      mockGetOrderDetail.mockResolvedValue({ status: 'schema_error', raw: {} })

      await HumbleLibrary.sync()

      const events = syncStateEvents()
      expect(events).toHaveLength(1)
      expect(events[0][1]).toEqual(
        expect.objectContaining({
          syncedAt: expect.any(Number),
          syncError: 'partial'
        })
      )
    })

    test('gamekeys access_denied: pushed state carries syncError=denied + cooldownUntil', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'access_denied' })

      await HumbleLibrary.sync()

      const events = syncStateEvents()
      expect(events).toHaveLength(1)
      expect(events[0][1]).toEqual(
        expect.objectContaining({
          syncError: 'denied',
          cooldownUntil: expect.any(Number)
        })
      )
    })

    test('gamekeys thrown (network): pushed state carries syncError=network', async () => {
      mockGetGamekeys.mockRejectedValue(new Error('ECONNRESET'))

      await HumbleLibrary.sync()

      const events = syncStateEvents()
      expect(events).toHaveLength(1)
      expect(events[0][1]).toEqual(
        expect.objectContaining({ syncError: 'network' })
      )
    })

    test('session_expired at gamekeys: state push STILL emitted (renderer must always converge), syncError untouched', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

      await HumbleLibrary.sync()

      const events = syncStateEvents()
      expect(events).toHaveLength(1)
      expect(events[0][1]).toEqual(
        expect.objectContaining({ syncError: 'none' })
      )
    })

    test('no stored credentials: state push still emitted', async () => {
      mockGetCredentials.mockReturnValue(undefined as unknown as string)

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'failed' })

      expect(syncStateEvents()).toHaveLength(1)
    })
  })

  describe('sync() — backend D-33 cooldown guard (round 2)', () => {
    test('an active denial cooldown skips the sync entirely: no network call, failed outcome, state still pushed', async () => {
      syncData.set('state', {
        syncedAt: 12345,
        syncError: 'denied',
        cooldownUntil: Date.now() + 60_000
      })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'failed' })

      expect(mockGetGamekeys).not.toHaveBeenCalled()
      expect(mockGetOrderDetail).not.toHaveBeenCalled()
      const events = mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleSyncStateChanged'
      )
      expect(events).toHaveLength(1)
      expect(events[0][1]).toEqual(
        expect.objectContaining({ syncedAt: 12345, syncError: 'denied' })
      )
    })

    test('an ELAPSED cooldown does not gate the sync', async () => {
      syncData.set('state', {
        syncedAt: 12345,
        syncError: 'denied',
        cooldownUntil: Date.now() - 1
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: [] })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })

      expect(mockGetGamekeys).toHaveBeenCalledTimes(1)
    })
  })

  // WR-05: the renderer derives `syncing` from done < total, and per-order
  // progress only fired AFTER each order resolved — so 0/1-order syncs never
  // showed as syncing, and multi-order syncs gave no feedback until the
  // first order completed (up to the 15s request timeout).
  describe('sync() — WR-05 initial progress push', () => {
    function progressEvents() {
      return mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleSyncProgress'
      )
    }

    test('an initial { done: 0, total } event fires before any order resolves', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      let resolveOrder!: (v: unknown) => void
      mockGetOrderDetail.mockImplementation(
        () =>
          new Promise((r) => {
            resolveOrder = r
          })
      )

      const syncPromise = HumbleLibrary.sync()
      await flushAsync()

      // The order is still in flight, yet progress already reads 0/1 —
      // done < total, so the renderer's `syncing` engages immediately.
      expect(progressEvents()).toEqual([
        ['humbleSyncProgress', { done: 0, total: 1 }]
      ])

      resolveOrder({ status: 'ok', data: makeRawOrder('gk1') })
      await expect(syncPromise).resolves.toEqual({ status: 'ok' })

      const events = progressEvents()
      expect(events[events.length - 1]).toEqual([
        'humbleSyncProgress',
        { done: 1, total: 1 }
      ])
    })

    test('an all-frozen sync (total 0) still emits { done: 0, total: 0 } and the terminal state push', async () => {
      libraryData.set('frozen-gk', makeTerminalEntry('frozen-gk'))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: HUMBLE_CLASSIFIER_VERSION
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['frozen-gk'] })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })

      expect(progressEvents()).toEqual([
        ['humbleSyncProgress', { done: 0, total: 0 }]
      ])
      const terminal = mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleSyncStateChanged'
      )
      expect(terminal).toHaveLength(1)
    })
  })

  // WR-01: the humbleSync IPC contract says "never throws", and every
  // renderer call site is fire-and-forget with no .catch — an escaped
  // rejection would surface as an unhandled promise rejection in the
  // renderer with the sync outcome never recorded.
  describe('sync() — WR-01 never-throws boundary', () => {
    test('an unexpected throw OUTSIDE the guarded adapter calls resolves { status: failed }, records syncError=network, and still pushes the terminal state', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1')
      })
      // The per-order worker also runs sendFrontendMessage — a throw there
      // previously rejected the whole pool and escaped sync() unhandled.
      mockSendFrontendMessage.mockImplementation((event: string) => {
        if (event === 'humbleSyncProgress') {
          throw new Error('renderer channel gone')
        }
      })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'failed' })

      expect(mockLogError).toHaveBeenCalled()
      expect(HumbleLibrary.getSyncState().syncError).toBe('network')
      // Terminal humbleSyncStateChanged still fires (spinner can never stick).
      const terminal = mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleSyncStateChanged'
      )
      expect(terminal).toHaveLength(1)

      // The single-flight guard cleared: a follow-up sync runs fresh.
      mockSendFrontendMessage.mockImplementation(() => {})
      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })
    })
  })

  describe('sync() — single-flight guard (round 2)', () => {
    test('a second sync() while one is in flight joins it: getGamekeys called once, both resolve to the same outcome', async () => {
      let resolveGamekeys!: (v: unknown) => void
      mockGetGamekeys.mockImplementation(
        () =>
          new Promise((r) => {
            resolveGamekeys = r
          })
      )

      const first = HumbleLibrary.sync()
      const second = HumbleLibrary.sync()

      // Phase 34.4.1 Plan 12: HumbleUser.getCredentials() is now async
      // (routed through the seam), inserting one microtask tick before
      // runSync() reaches its getGamekeys() call — flush it before resolving,
      // or resolveGamekeys is still the pre-call closure variable.
      await flushAsync()

      resolveGamekeys({ status: 'ok', data: [] })

      await expect(first).resolves.toEqual({ status: 'ok' })
      await expect(second).resolves.toEqual({ status: 'ok' })
      expect(mockGetGamekeys).toHaveBeenCalledTimes(1)

      // The guard clears after settle: a THIRD sync runs fresh.
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: [] })
      await HumbleLibrary.sync()
      expect(mockGetGamekeys).toHaveBeenCalledTimes(2)
    })
  })

  describe('sync() — redacted outcome summary log (round 2)', () => {
    test('a completed sync logs per-outcome counts (counts only — never key values)', async () => {
      mockGetGamekeys.mockResolvedValue({
        status: 'ok',
        data: ['ok-gk', 'bad-gk']
      })
      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) => {
          if (gamekey === 'bad-gk') {
            return Promise.resolve({ status: 'schema_error', raw: {} })
          }
          return Promise.resolve({ status: 'ok', data: makeRawOrder(gamekey) })
        }
      )

      await HumbleLibrary.sync()

      const summary = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('Humble sync finished')
      )
      expect(summary).toBeDefined()
      const logged = JSON.stringify(summary)
      expect(logged).toContain('ok=1')
      expect(logged).toContain('schema_error=1')
      expect(logged).toContain('keysCached=1')
      expect(logged).not.toContain('cookie-value')
    })
  })

  // Live-UAT round 3 (debug: humble-zero-keys-from-valid-orders): 25/25
  // orders parsed ok yet keysCached=0 with NOTHING in the logs saying why.
  // Any order that classifies to zero keys must now be structurally
  // self-diagnosing (field names/types/skip reasons only — never values).
  describe('sync() — zero-key order diagnostics (round 3)', () => {
    test('an ok order with NO tpkd_dict logs an anomalous zero-key warning naming the absence', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['stripped-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'stripped-gk',
          uid: 'uid-1',
          product: { category: 'bundle', human_name: 'Stripped' },
          subproducts: []
        }
      })

      await HumbleLibrary.sync()

      const zeroKeyWarning = mockLogWarning.mock.calls.find((call) =>
        JSON.stringify(call).includes('zero keys')
      )
      expect(zeroKeyWarning).toBeDefined()
      const logged = JSON.stringify(zeroKeyWarning)
      expect(logged).toContain('stripped-gk')
      expect(logged).toContain('tpkd_dict=absent')
      expect(logged).toContain('order_fields=')
      expect(logged).not.toContain('cookie-value')
    })

    test('an ok order with a non-empty all_tpks of non-object elements logs per-element skip reasons', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['weird-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'weird-gk',
          tpkd_dict: { all_tpks: ['not-an-object'] }
        }
      })

      await HumbleLibrary.sync()

      const zeroKeyWarning = mockLogWarning.mock.calls.find((call) =>
        JSON.stringify(call).includes('zero keys')
      )
      expect(zeroKeyWarning).toBeDefined()
      const logged = JSON.stringify(zeroKeyWarning)
      expect(logged).toContain('all_tpks=array(1)')
      expect(logged).toContain('[0]:non-object(string)')
    })

    test('a legitimately empty all_tpks array (DRM-free, D-29) logs info — not a warning', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['drmfree-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'drmfree-gk',
          tpkd_dict: { all_tpks: [] },
          product: { category: 'bundle', human_name: 'DRM Free' }
        }
      })

      await HumbleLibrary.sync()

      const zeroKeyInfo = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('zero keys')
      )
      expect(zeroKeyInfo).toBeDefined()
      expect(JSON.stringify(zeroKeyInfo)).toContain('all_tpks=array(0)')
      const zeroKeyWarning = mockLogWarning.mock.calls.find((call) =>
        JSON.stringify(call).includes('zero keys')
      )
      expect(zeroKeyWarning).toBeUndefined()
    })

    test('the sync summary line carries a zeroKeyOrders count', async () => {
      mockGetGamekeys.mockResolvedValue({
        status: 'ok',
        data: ['stripped-gk', 'good-gk']
      })
      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) => {
          if (gamekey === 'stripped-gk') {
            return Promise.resolve({
              status: 'ok',
              data: { gamekey: 'stripped-gk' }
            })
          }
          return Promise.resolve({ status: 'ok', data: makeRawOrder(gamekey) })
        }
      )

      await HumbleLibrary.sync()

      const summary = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('Humble sync finished')
      )
      expect(summary).toBeDefined()
      const logged = JSON.stringify(summary)
      expect(logged).toContain('zeroKeyOrders=1')
      expect(logged).toContain('keysCached=1')
    })

    test('a pure ebook/PDF bundle (entries without key_type) commits zero rows and logs the skip diagnostic as info (D-29, round 5)', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['ebook-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'ebook-gk',
          product: { category: 'bundle', human_name: 'Book Bundle' },
          tpkd_dict: {
            all_tpks: [
              { machine_name: 'cookbook_pdf', human_name: 'Cook Book (PDF)' },
              { machine_name: 'novel_epub', human_name: 'Novel (EPUB)' }
            ]
          }
        }
      })

      await HumbleLibrary.sync()

      expect(HumbleLibrary.getKeys()).toHaveLength(0)
      // Legitimate D-29 exclusion shape — informational, never a warning.
      const zeroKeyInfo = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('zero keys')
      )
      expect(zeroKeyInfo).toBeDefined()
      const logged = JSON.stringify(zeroKeyInfo)
      expect(logged).toContain('ebook-gk')
      expect(logged).toContain('no-key_type')
      expect(logged).toContain('machine_name')
      const zeroKeyWarning = mockLogWarning.mock.calls.find((call) =>
        JSON.stringify(call).includes('zero keys')
      )
      expect(zeroKeyWarning).toBeUndefined()
    })

    test('a mixed order (1 steam key + 2 download entitlements) commits exactly 1 row and logs the skipped-entitlement diagnostic', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['mixed-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'mixed-gk',
          product: { category: 'bundle', human_name: 'Mixed Bundle' },
          tpkd_dict: {
            all_tpks: [
              {
                machine_name: 'actualgame_steam',
                key_type: 'steam',
                human_name: 'Actual Game',
                is_expired: false
              },
              { machine_name: 'artbook_pdf', human_name: 'Art Book (PDF)' },
              { machine_name: 'soundtrack_flac', human_name: 'Soundtrack' }
            ]
          }
        }
      })

      await HumbleLibrary.sync()

      const keys = HumbleLibrary.getKeys()
      expect(keys).toHaveLength(1)
      expect(keys[0].machineName).toBe('actualgame_steam')
      const skipDiag = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('skippedNoKeyType')
      )
      expect(skipDiag).toBeDefined()
      const logged = JSON.stringify(skipDiag)
      expect(logged).toContain('mixed-gk')
      expect(logged).toContain('skippedNoKeyType=2')
      expect(logged).toContain('no-key_type')
    })

    test('a direct-redeem download entitlement WITH key_type commits zero rows, logs the type VALUES, and never logs its redeemed value (D-29 v2, round 6)', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['pdf-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'pdf-gk',
          product: { category: 'bundle', human_name: 'PDF Bundle' },
          tpkd_dict: {
            all_tpks: [
              {
                machine_name: 'bigbook_pdf_download',
                key_type: 'download',
                key_type_human_name: 'Download',
                human_name: 'Big Book (PDF)',
                is_expired: false,
                direct_redeem: true,
                custom_instructions_html: '<p>In your library.</p>',
                show_custom_instructions_in_user_libraries: true,
                redeemed_key_val: 'ENTITLEMENT-VALUE-MUST-NOT-LEAK'
              }
            ]
          }
        }
      })

      await HumbleLibrary.sync()

      expect(HumbleLibrary.getKeys()).toHaveLength(0)
      // Legitimate D-29 exclusion shape — informational, never a warning.
      const zeroKeyInfo = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('zero keys')
      )
      expect(zeroKeyInfo).toBeDefined()
      const logged = JSON.stringify(zeroKeyInfo)
      expect(logged).toContain('pdf-gk')
      expect(logged).toContain('direct-redeem-entitlement')
      // C5 permits the type-label VALUES (they make round 7 conclusive)...
      expect(logged).toContain('key_type=download')
      expect(logged).toContain('key_type_human_name=Download')
      const zeroKeyWarning = mockLogWarning.mock.calls.find((call) =>
        JSON.stringify(call).includes('zero keys')
      )
      expect(zeroKeyWarning).toBeUndefined()
      // ...but NEVER the redeemed key value of the skipped entitlement.
      for (const call of [
        ...mockLogInfo.mock.calls,
        ...mockLogWarning.mock.calls,
        ...mockLogError.mock.calls
      ]) {
        expect(JSON.stringify(call)).not.toContain(
          'ENTITLEMENT-VALUE-MUST-NOT-LEAK'
        )
      }
    })

    test('a mixed order (1 steam key + 1 direct-redeem entitlement) commits exactly 1 row and logs the skipped-entitlement type VALUES (round 6)', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['mixed-dr-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'mixed-dr-gk',
          product: { category: 'bundle', human_name: 'Mixed PDF Bundle' },
          tpkd_dict: {
            all_tpks: [
              {
                machine_name: 'actualgame2_steam',
                key_type: 'steam',
                human_name: 'Actual Game 2',
                is_expired: false
              },
              {
                machine_name: 'artbook2_pdf_download',
                key_type: 'download',
                key_type_human_name: 'Download',
                human_name: 'Art Book 2 (PDF)',
                direct_redeem: true,
                redeemed_key_val: 'ENTITLEMENT-VALUE-MUST-NOT-LEAK'
              }
            ]
          }
        }
      })

      await HumbleLibrary.sync()

      const keys = HumbleLibrary.getKeys()
      expect(keys).toHaveLength(1)
      expect(keys[0].machineName).toBe('actualgame2_steam')
      const skipDiag = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('skippedDirectRedeem')
      )
      expect(skipDiag).toBeDefined()
      const logged = JSON.stringify(skipDiag)
      expect(logged).toContain('mixed-dr-gk')
      expect(logged).toContain('skippedDirectRedeem=1')
      expect(logged).toContain('key_type=download')
      expect(logged).not.toContain('ENTITLEMENT-VALUE-MUST-NOT-LEAK')
    })

    test('real-world tpk field names (redeemed_key_val + is_expired) commit keys — never a zero-key order', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['real-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'real-gk',
          tpkd_dict: {
            all_tpks: [
              {
                machine_name: 'realgame_steam',
                gamekey: 'real-gk',
                key_type: 'steam',
                human_name: 'Real Game',
                steam_app_id: '220',
                is_expired: false,
                redeemed_key_val: 'redeemed-value-string'
              }
            ]
          }
        }
      })

      await HumbleLibrary.sync()

      const keys = HumbleLibrary.getKeys()
      expect(keys).toHaveLength(1)
      // 14-07 gap closure: redeemed_key_val presence means REVEALED, not
      // REDEEMED (REDEEMED is local-only, via markRedeemed).
      expect(keys[0].state).toBe('REVEALED')
      const summary = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('Humble sync finished')
      )
      expect(JSON.stringify(summary)).toContain('zeroKeyOrders=0')
      // C5: the redeemed key value must never reach a log line.
      for (const call of [
        ...mockLogInfo.mock.calls,
        ...mockLogWarning.mock.calls,
        ...mockLogError.mock.calls
      ]) {
        expect(JSON.stringify(call)).not.toContain('redeemed-value-string')
      }
    })
  })

  // Live-UAT round 6 (propagation bug): D-24 freezes fully-terminal cached
  // orders — they are never re-fetched, so classifier fixes (like round 5/6's
  // entitlement filters) could NEVER reach their cached rows. The tester's 19
  // frozen orders kept serving stale PDF-entitlement rows. A classifier
  // version stamp in humbleSyncStore forces ONE full re-classification sync
  // whenever the classification logic version changes.
  describe('sync() — classifier-version cache re-classification (round 6)', () => {
    // A stale cached entry the OLD classifier produced from a direct-redeem
    // PDF entitlement: auto-redeemed -> REDEEMED -> allTerminal -> frozen
    // forever under D-24.
    function makeStaleEntitlementEntry(gamekey: string): HumbleOrderCacheEntry {
      return {
        gamekey,
        keys: [
          {
            gamekey,
            machineName: 'bigbook_pdf_download',
            state: 'REDEEMED',
            title: 'Big Book (PDF)',
            platform: 'download',
            expiration: null,
            origin: 'PDF Bundle',
            ownedElsewhere: false,
            matchConfidence: 'none'
          }
        ],
        allTerminal: true
      }
    }

    const directRedeemEntitlementResponse = {
      gamekey: 'stale-gk',
      product: { category: 'bundle', human_name: 'PDF Bundle' },
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: 'bigbook_pdf_download',
            key_type: 'download',
            key_type_human_name: 'Download',
            human_name: 'Big Book (PDF)',
            direct_redeem: true,
            redeemed_key_val: 'ENTITLEMENT-VALUE-MUST-NOT-LEAK'
          }
        ]
      }
    }

    test('stored version ≠ current: frozen all-terminal orders ARE re-fetched, stale entitlement rows removed, and the re-classification log fires', async () => {
      libraryData.set('stale-gk', makeStaleEntitlementEntry('stale-gk'))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: 1
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['stale-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: directRedeemEntitlementResponse
      })

      await HumbleLibrary.sync()

      // The frozen order WAS re-fetched and its stale rows re-classified away.
      expect(mockGetOrderDetail).toHaveBeenCalledWith(
        'cookie-value',
        'stale-gk'
      )
      expect(libraryData.get('stale-gk')?.keys).toHaveLength(0)
      expect(HumbleLibrary.getKeys()).toHaveLength(0)

      const versionLog = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('classifier version changed')
      )
      expect(versionLog).toBeDefined()
      expect(JSON.stringify(versionLog)).toContain(
        `classifier version changed (1 -> ${HUMBLE_CLASSIFIER_VERSION}), full re-classification sync`
      )
    })

    test('a pre-versioning cache (no stored classifierVersion) also triggers the full re-classification', async () => {
      libraryData.set('stale-gk', makeStaleEntitlementEntry('stale-gk'))
      // syncData deliberately left empty — rounds 1-5 never stored a version.
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['stale-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: directRedeemEntitlementResponse
      })

      await HumbleLibrary.sync()

      expect(mockGetOrderDetail).toHaveBeenCalledWith(
        'cookie-value',
        'stale-gk'
      )
      expect(libraryData.get('stale-gk')?.keys).toHaveLength(0)
    })

    // 14-07 gap closure: a server redeemed_key_val alone no longer produces
    // a terminal (REDEEMED) state — only expiry (UNREDEEMABLE) or a local
    // "Mark as redeemed" (REDEEMED) do. So this D-24 freeze test now uses an
    // EXPIRED order — a genuinely terminal state unaffected by the
    // realignment — rather than a bare server-redeemed one.
    test('a clean full re-classification persists the new version; the NEXT sync freezes terminal (expired) orders again', async () => {
      libraryData.set('frozen-gk', makeTerminalEntry('frozen-gk'))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: 1
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['frozen-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('frozen-gk', { expiration: '2020-01-01T00:00:00Z' })
      })

      await HumbleLibrary.sync()

      expect(mockGetOrderDetail).toHaveBeenCalledTimes(1)
      expect(libraryData.get('frozen-gk')?.keys[0].state).toBe('UNREDEEMABLE')
      expect(syncData.get('state')?.classifierVersion).toBe(
        HUMBLE_CLASSIFIER_VERSION
      )

      // Second sync: version now matches — D-24 freeze semantics restored.
      mockGetOrderDetail.mockClear()
      mockLogInfo.mockClear()
      await HumbleLibrary.sync()

      expect(mockGetOrderDetail).not.toHaveBeenCalled()
      const versionLog = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('classifier version changed')
      )
      expect(versionLog).toBeUndefined()
    })

    // 14-08 gap closure (Fix 2) SUPERSEDES this test's original 14-07
    // expectation: a REVEALED-only key (server redeemed_key_val present, no
    // local mark) is server-terminal (isServerTerminal — REVEALED is
    // server-final, Humble never un-populates/changes a redeemed_key_val),
    // so with no pending expiration it is now freeze-eligible and skipped on
    // the NEXT sync — restoring the D-24 freeze benefit 14-07's realignment
    // had lost (this plan's own root-cause diagnosis identified the
    // resulting standing 19-orders-per-sync re-fetch as a Cloudflare/WAF
    // exposure risk; see 14-07-SUMMARY "Known UX consequences" for the
    // original tradeoff this fixes).
    test('14-08: a server-revealed (not locally-redeemed) key with no pending expiration now freezes — skipped on the next sync', async () => {
      libraryData.set('frozen-gk', makeTerminalEntry('frozen-gk'))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: 1
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['frozen-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('frozen-gk', { redeemed: true })
      })

      await HumbleLibrary.sync()
      expect(libraryData.get('frozen-gk')?.keys[0].state).toBe('REVEALED')
      expect(libraryData.get('frozen-gk')?.allTerminal).toBe(false)
      expect(libraryData.get('frozen-gk')?.freezeEligible).toBe(true)

      mockGetOrderDetail.mockClear()
      await HumbleLibrary.sync()
      expect(mockGetOrderDetail).not.toHaveBeenCalled()
    })

    // 14-08 gap closure: the SAME REVEALED key, but carrying a LIVE FUTURE
    // expiration, must NOT freeze — retroactive expiry recompute is
    // re-fetch-driven only (no standalone recompute exists), so a frozen
    // REVEALED(future-exp) key would never flip to UNREDEEMABLE once its
    // expiration passes.
    test('14-08: a server-revealed key with a LIVE FUTURE expiration does NOT freeze — keeps re-fetching (retroactive expiry preserved)', async () => {
      libraryData.set('expiring-gk', makeTerminalEntry('expiring-gk'))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: 1
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['expiring-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('expiring-gk', {
          redeemed: true,
          expiration: '2099-01-01T00:00:00Z'
        })
      })

      await HumbleLibrary.sync()
      expect(libraryData.get('expiring-gk')?.keys[0].state).toBe('REVEALED')
      expect(libraryData.get('expiring-gk')?.freezeEligible).toBe(false)

      mockGetOrderDetail.mockClear()
      await HumbleLibrary.sync()
      expect(mockGetOrderDetail).toHaveBeenCalledTimes(1)
    })

    // CR-01 (14-08 re-review): a key REVEALED purely by the local write-ahead
    // flag (the D-78 ambiguous outcome — adapter threw, flag kept, NO key
    // value anywhere) must NOT freeze. Its "unconfirmed — sync to check"
    // reconciliation AND the D-66 website-reveal value pickup both depend on
    // every-sync re-fetch; there is no thaw path for a wrongly-frozen order
    // short of a classifier-version bump. Only once the server value
    // actually lands does the order become freeze-eligible.
    test('CR-01: an ambiguous reveal (flag-only REVEALED, no value) never freezes — the order keeps re-fetching until the server value lands, THEN freezes', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: HUMBLE_CLASSIFIER_VERSION
      })
      // Reveal ends AMBIGUOUS (adapter threw — network/timeout/5xx class):
      // the write-ahead REVEALED flag is kept, the cache is NOT patched, and
      // no key value is persisted.
      mockAdapterRevealKey.mockRejectedValue(new Error('socket hang up'))
      await expect(HumbleLibrary.revealKey('gk1', 'gk1_key')).resolves.toEqual({
        status: 'ambiguous'
      })
      expect(revealedData.has('gk1_key')).toBe(true)

      // Sync 1: Humble never processed the reveal — the payload carries no
      // redeemed value. The key classifies REVEALED off the local flag
      // alone; the order must commit freezeEligible:false.
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1')
      })
      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })
      expect(libraryData.get('gk1')?.keys[0].state).toBe('REVEALED')
      expect(libraryData.get('gk1')?.freezeEligible).toBe(false)
      expect(HumbleLibrary.getRevealedKeyValue('gk1', 'gk1_key')).toBe(null)

      // Sync 2: the order IS re-fetched (not frozen) — and this time the
      // server value is present (the reveal did land after all, or the user
      // revealed on Humble's website): the value is picked up via the
      // side-channel and the order NOW becomes freeze-eligible.
      mockGetOrderDetail.mockClear()
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1', { redeemed: true })
      })
      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })
      expect(mockGetOrderDetail).toHaveBeenCalledWith('cookie-value', 'gk1')
      expect(HumbleLibrary.getRevealedKeyValue('gk1', 'gk1_key')).toBe(
        'REDEEMED-VALUE'
      )
      expect(libraryData.get('gk1')?.freezeEligible).toBe(true)

      // Sync 3: the now value-backed REVEALED(no expiration) order is frozen
      // — skipped entirely.
      mockGetOrderDetail.mockClear()
      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })
      expect(mockGetOrderDetail).not.toHaveBeenCalled()
    })

    test('a PARTIAL re-classification sync does NOT persist the new version (the next sync retries the full pass)', async () => {
      libraryData.set('stale-gk', makeStaleEntitlementEntry('stale-gk'))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: 1
      })
      mockGetGamekeys.mockResolvedValue({
        status: 'ok',
        data: ['stale-gk', 'flaky-gk']
      })
      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) => {
          if (gamekey === 'flaky-gk') {
            return Promise.reject(new Error('timeout'))
          }
          return Promise.resolve({
            status: 'ok',
            data: directRedeemEntitlementResponse
          })
        }
      )

      const result = await HumbleLibrary.sync()

      expect(result).toEqual({ status: 'partial' })
      // flaky-gk kept whatever (absent) cache it had; version must stay old
      // so the NEXT sync bypasses the freeze again and reaches it.
      expect(syncData.get('state')?.classifierVersion).not.toBe(
        HUMBLE_CLASSIFIER_VERSION
      )
    })

    test('version match: frozen orders stay frozen and no re-classification log fires', async () => {
      libraryData.set('frozen-gk', makeTerminalEntry('frozen-gk'))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: HUMBLE_CLASSIFIER_VERSION
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['frozen-gk'] })

      await HumbleLibrary.sync()

      expect(mockGetOrderDetail).not.toHaveBeenCalled()
      const versionLog = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('classifier version changed')
      )
      expect(versionLog).toBeUndefined()
    })

    test('non-terminal orders still re-fetch on a version-matched sync (HSYNC-03 untouched)', async () => {
      libraryData.set('pending-gk', makeNonTerminalEntry('pending-gk'))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'none',
        classifierVersion: HUMBLE_CLASSIFIER_VERSION
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['pending-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('pending-gk')
      })

      await HumbleLibrary.sync()

      expect(mockGetOrderDetail).toHaveBeenCalledWith(
        'cookie-value',
        'pending-gk'
      )
    })
  })

  // Live-UAT round 4: every key row showed "No expiration" because the real
  // Humble date field name was not extracted. The expiration-field discovery
  // diagnostic logs (field NAMES only, C5) the candidate fields on active keys
  // we could not date, so the true field is confirmable from the next run.
  describe('sync() — expiration-field discovery diagnostic (round 4)', () => {
    test('an active key with no extractable expiration logs its candidate field names (info, redacted)', async () => {
      mockGetGamekeys.mockResolvedValue({
        status: 'ok',
        data: ['undatable-gk']
      })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'undatable-gk',
          tpkd_dict: {
            all_tpks: [
              {
                machine_name: 'undatable_steam',
                gamekey: 'undatable-gk',
                key_type: 'steam',
                human_name: 'Undatable Game',
                is_expired: false,
                mystery_date_field: 'SECRET-DATE-MUST-NOT-LEAK'
              }
            ]
          }
        }
      })

      await HumbleLibrary.sync()

      const diag = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('no extractable expiration')
      )
      expect(diag).toBeDefined()
      const logged = JSON.stringify(diag)
      expect(logged).toContain('undatable-gk')
      expect(logged).toContain('mystery_date_field')
      // C5: field NAMES only — never the field VALUE.
      expect(logged).not.toContain('SECRET-DATE-MUST-NOT-LEAK')
    })

    // WR-02: extractExpiration's relative-days branch used to throw
    // RangeError on a drifted num_days_until_expired beyond the ECMAScript
    // time range; describeMissingExpirationTpks calls it OUTSIDE
    // fetchAndCommitOrder's try block, so one hostile tpk value rejected the
    // worker, the pool, and the whole sync() promise.
    test('WR-02: a drifted num_days_until_expired beyond the Date range never rejects the sync — the key commits with expiration null', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['drift-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'drift-gk',
          tpkd_dict: {
            all_tpks: [
              {
                machine_name: 'drifted_steam',
                key_type: 'steam',
                human_name: 'Drifted Game',
                is_expired: false,
                num_days_until_expired: 1e12
              }
            ]
          }
        }
      })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })

      const keys = HumbleLibrary.getKeys()
      expect(keys).toHaveLength(1)
      expect(keys[0].expiration).toBe(null)
      // The undatable active key still surfaces in the round-4 discovery
      // diagnostic instead of crashing it.
      const diag = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('no extractable expiration')
      )
      expect(diag).toBeDefined()
    })

    test('a key with an extractable expiry_date does NOT trigger the discovery diagnostic', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['dated-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: {
          gamekey: 'dated-gk',
          tpkd_dict: {
            all_tpks: [
              {
                machine_name: 'dated_steam',
                gamekey: 'dated-gk',
                key_type: 'steam',
                human_name: 'Dated Game',
                is_expired: false,
                expiry_date: '2026-08-03T00:00:00Z'
              }
            ]
          }
        }
      })

      await HumbleLibrary.sync()

      const keys = HumbleLibrary.getKeys()
      expect(keys).toHaveLength(1)
      expect(keys[0].expiration).toBe('2026-08-03T00:00:00.000Z')
      const diag = mockLogInfo.mock.calls.find((call) =>
        JSON.stringify(call).includes('no extractable expiration')
      )
      expect(diag).toBeUndefined()
    })
  })

  // ── Phase 12 (HDEDUP-01/02): ownership recompute wiring ─────────────────

  function makeSteamGame(appId: string, title: string) {
    return {
      runner: 'steam' as const,
      app_name: appId,
      title,
      art_cover: '',
      art_square: '',
      install: {},
      is_installed: false,
      canRunOffline: false
    }
  }

  function makeLegacyEntry(gamekey: string): HumbleOrderCacheEntry {
    // Pre-Phase-12 shape: an already-frozen (allTerminal) order committed by
    // the OLD classifier — no steamAppId was ever captured (the field did
    // not exist yet).
    const key: HumbleKey = {
      gamekey,
      machineName: `${gamekey}_key`,
      state: 'REDEEMED',
      title: `Key for ${gamekey}`,
      platform: 'steam',
      expiration: null,
      origin: `Order ${gamekey}`,
      ownedElsewhere: false,
      matchConfidence: 'none'
    }
    return { gamekey, keys: [key], allTerminal: true }
  }

  function makeOwnedEntry(gamekey: string): HumbleOrderCacheEntry {
    const key: HumbleKey = {
      gamekey,
      machineName: `${gamekey}_key`,
      state: 'REDEEMED',
      title: `Key for ${gamekey}`,
      platform: 'steam',
      expiration: null,
      origin: `Order ${gamekey}`,
      steamAppId: '440',
      ownedElsewhere: true,
      matchConfidence: 'exact'
    }
    return { gamekey, keys: [key], allTerminal: true }
  }

  function makeFuzzyMatchableEntry(
    gamekey: string,
    title: string
  ): HumbleOrderCacheEntry {
    // No steamAppId — must be matched via the fuzzy tier, and cross-platform
    // (D-45) so a GOG key is a valid override target.
    const key: HumbleKey = {
      gamekey,
      machineName: `${gamekey}_key`,
      state: 'REDEEMED',
      title,
      platform: 'gog',
      expiration: null,
      origin: `Order ${gamekey}`,
      ownedElsewhere: false,
      matchConfidence: 'none'
    }
    return { gamekey, keys: [key], allTerminal: true }
  }

  describe('sync() — Phase 12 ownership-overlay backfill (classifier v3)', () => {
    test('a pre-Phase-12 frozen order (no steamAppId, no stored classifierVersion) is re-fetched once, steamAppId backfilled, and classifierVersion stamps to 3', async () => {
      libraryData.set('legacy-gk', makeLegacyEntry('legacy-gk'))
      // syncData deliberately left empty — pre-versioning caches never
      // stored a version (read as 1 per round-6 semantics).
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['legacy-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('legacy-gk', { steamAppId: '440' })
      })

      await HumbleLibrary.sync()

      expect(mockGetOrderDetail).toHaveBeenCalledWith(
        'cookie-value',
        'legacy-gk'
      )
      const key = libraryData.get('legacy-gk')?.keys[0]
      expect(key?.steamAppId).toBe('440')
      expect(HumbleLibrary.getSyncState().classifierVersion).toBe(
        HUMBLE_CLASSIFIER_VERSION
      )
    })
  })

  describe('sync() — ownership recompute at sync end (HDEDUP-01)', () => {
    test('Steam owns a matching AppID: the committed key is flagged ownedElsewhere/exact, and humbleKeysUpdated re-pushes the mutated key AFTER the dedup pass', async () => {
      mockSteamIsLoggedIn.mockReturnValue(true)
      mockSteamLibraryStoreGet.mockReturnValue([
        makeSteamGame('440', 'Team Fortress 2')
      ])
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1', { steamAppId: '440' })
      })

      await HumbleLibrary.sync()

      const key = libraryData.get('gk1')?.keys[0]
      expect(key?.ownedElsewhere).toBe(true)
      expect(key?.matchConfidence).toBe('exact')

      const keysUpdatedCalls = mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleKeysUpdated'
      )
      expect(keysUpdatedCalls.length).toBeGreaterThan(0)
      const lastPushed = keysUpdatedCalls[
        keysUpdatedCalls.length - 1
      ][1] as HumbleKey[]
      expect(lastPushed.find((k) => k.gamekey === 'gk1')?.ownedElsewhere).toBe(
        true
      )
    })
  })

  // ── 14-08 gap closure (Task 1): ownership-overlay integrity at COMMIT
  // time — UAT test 8 churn root cause + T-14-03 mid-sync C2 window. ──────

  function makeOwnedNonTerminalEntry(
    gamekey: string,
    steamAppId: string
  ): HumbleOrderCacheEntry {
    const key: HumbleKey = {
      gamekey,
      machineName: `${gamekey}_key`,
      state: 'UNREVEALED',
      title: `Key for ${gamekey}`,
      platform: 'steam',
      expiration: null,
      origin: `Order ${gamekey}`,
      steamAppId,
      ownedElsewhere: true,
      matchConfidence: 'exact'
    }
    return { gamekey, keys: [key], allTerminal: false }
  }

  describe('sync() — 14-08 gap closure: ownership-overlay integrity at commit time (Fix 1)', () => {
    test('churn regression: an owned key keeps ownedElsewhere:true in EVERY intermediate humbleKeysUpdated broadcast during a re-sync (UAT test 8) — never appears in selectKeysWaiting', async () => {
      libraryData.set('gk1', makeOwnedNonTerminalEntry('gk1', '440'))
      mockSteamIsLoggedIn.mockReturnValue(true)
      mockSteamLibraryStoreGet.mockReturnValue([
        makeSteamGame('440', 'Team Fortress 2')
      ])
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1', 'gk2'] })
      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) =>
          Promise.resolve({
            status: 'ok',
            data: makeRawOrder(gamekey, {
              steamAppId: gamekey === 'gk1' ? '440' : undefined
            })
          })
      )

      await HumbleLibrary.sync()

      const keysUpdatedCalls = mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleKeysUpdated'
      )
      // D-26 progressive fill preserved: at least one push per committed
      // order, never batched/deferred/debounced.
      expect(keysUpdatedCalls.length).toBeGreaterThanOrEqual(2)
      for (const call of keysUpdatedCalls) {
        const pushedKeys = call[1] as HumbleKey[]
        const ownedKey = pushedKeys.find((k) => k.machineName === 'gk1_key')
        expect(ownedKey?.ownedElsewhere).toBe(true)
        const waiting = selectKeysWaiting(pushedKeys)
        expect(waiting.find((k) => k.machineName === 'gk1_key')).toBeUndefined()
      }
    })

    test('C2 mid-sync security (T-14-03): a reveal on a key whose order was just re-committed mid-sync is still owned_blocked — never reads a transiently-false ownedElsewhere', async () => {
      libraryData.set('gk1', makeOwnedNonTerminalEntry('gk1', '440'))
      mockSteamIsLoggedIn.mockReturnValue(true)
      mockSteamLibraryStoreGet.mockReturnValue([
        makeSteamGame('440', 'Team Fortress 2')
      ])
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1', 'gk2'] })

      let resolveGk2!: (v: unknown) => void
      mockGetOrderDetail.mockImplementation(
        (_cookie: string, gamekey: string) => {
          if (gamekey === 'gk2') {
            return new Promise((r) => {
              resolveGk2 = r
            })
          }
          return Promise.resolve({
            status: 'ok',
            data: makeRawOrder('gk1', { steamAppId: '440' })
          })
        }
      )

      const syncPromise = HumbleLibrary.sync()
      await flushAsync()

      // gk1 has committed mid-sync; gk2 is still in flight, so the
      // end-of-sync recomputeOwnership() has NOT run yet.
      const midSyncKey = libraryData.get('gk1')?.keys[0]
      expect(midSyncKey?.ownedElsewhere).toBe(true)

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')
      expect(outcome).toEqual({ status: 'owned_blocked' })
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()

      resolveGk2({ status: 'ok', data: makeRawOrder('gk2') })
      await syncPromise
    })

    describe('gated-off Steam carry-forward (D-48)', () => {
      test("SteamUser.isLoggedIn() false: a previously-owned order re-committed mid-sync KEEPS ownedElsewhere:true / matchConfidence — never classify's hard-reset false", async () => {
        libraryData.set('gk1', makeOwnedNonTerminalEntry('gk1', '440'))
        mockSteamIsLoggedIn.mockReturnValue(false)
        mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
        mockGetOrderDetail.mockResolvedValue({
          status: 'ok',
          data: makeRawOrder('gk1', { steamAppId: '440' })
        })

        await HumbleLibrary.sync()

        const key = libraryData.get('gk1')?.keys[0]
        expect(key?.ownedElsewhere).toBe(true)
        expect(key?.matchConfidence).toBe('exact')
      })

      test('logged in but steamLibraryStore games empty: a previously-owned order re-committed mid-sync KEEPS ownedElsewhere:true / matchConfidence', async () => {
        libraryData.set('gk1', makeOwnedNonTerminalEntry('gk1', '440'))
        mockSteamIsLoggedIn.mockReturnValue(true)
        mockSteamLibraryStoreGet.mockReturnValue([])
        mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
        mockGetOrderDetail.mockResolvedValue({
          status: 'ok',
          data: makeRawOrder('gk1', { steamAppId: '440' })
        })

        await HumbleLibrary.sync()

        const key = libraryData.get('gk1')?.keys[0]
        expect(key?.ownedElsewhere).toBe(true)
        expect(key?.matchConfidence).toBe('exact')
      })
    })

    test('new-owned-order coverage: an order not previously cached whose game IS owned on Steam commits ownedElsewhere:true on the FIRST commit (not only after end-of-sync recompute)', async () => {
      mockSteamIsLoggedIn.mockReturnValue(true)
      mockSteamLibraryStoreGet.mockReturnValue([
        makeSteamGame('440', 'Team Fortress 2')
      ])
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['new-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('new-gk', { steamAppId: '440' })
      })

      await HumbleLibrary.sync()

      const keysUpdatedCalls = mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleKeysUpdated'
      )
      expect(keysUpdatedCalls.length).toBeGreaterThan(0)
      // The FIRST push (fired from the per-order commit, before the final
      // end-of-sync recompute push) already carries ownedElsewhere:true.
      const firstPush = keysUpdatedCalls[0][1] as HumbleKey[]
      expect(
        firstPush.find((k) => k.gamekey === 'new-gk')?.ownedElsewhere
      ).toBe(true)
    })

    test('regression guard: end-of-sync recomputeOwnership() STILL runs and stays authoritative — a key that becomes owned only after Steam connects mid-sync still gets ownedElsewhere:true', async () => {
      let calls = 0
      mockSteamIsLoggedIn.mockImplementation(() => {
        calls += 1
        // false for the per-order commit's own gate check (Branch B — no
        // prior entry, stays unowned at commit time); true from then on, so
        // the unconditional end-of-sync recomputeOwnership() catches up.
        return calls > 1
      })
      mockSteamLibraryStoreGet.mockReturnValue([
        makeSteamGame('440', 'Team Fortress 2')
      ])
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['new-gk'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('new-gk', { steamAppId: '440' })
      })

      await HumbleLibrary.sync()

      const key = libraryData.get('new-gk')?.keys[0]
      expect(key?.ownedElsewhere).toBe(true)
      expect(key?.matchConfidence).toBe('exact')
    })
  })

  describe('HumbleLibrary.recomputeOwnership() — keep-last-known (D-48)', () => {
    test('no-ops (no store write) when Steam is disconnected', () => {
      libraryData.set('gk1', makeOwnedEntry('gk1'))
      mockSteamIsLoggedIn.mockReturnValue(false)
      mockLibraryStore.set.mockClear()

      HumbleLibrary.recomputeOwnership()

      expect(mockLibraryStore.set).not.toHaveBeenCalled()
      expect(libraryData.get('gk1')?.keys[0].ownedElsewhere).toBe(true)
    })

    test('no-ops (no store write) when Steam is connected but the owned-games array is empty', () => {
      libraryData.set('gk1', makeOwnedEntry('gk1'))
      mockSteamIsLoggedIn.mockReturnValue(true)
      mockSteamLibraryStoreGet.mockReturnValue([])
      mockLibraryStore.set.mockClear()

      HumbleLibrary.recomputeOwnership()

      expect(mockLibraryStore.set).not.toHaveBeenCalled()
      expect(libraryData.get('gk1')?.keys[0].ownedElsewhere).toBe(true)
    })

    test('recomputes normally once Steam is connected with a non-empty library', () => {
      libraryData.set('gk1', makeOwnedEntry('gk1'))
      mockSteamIsLoggedIn.mockReturnValue(true)
      mockSteamLibraryStoreGet.mockReturnValue([
        makeSteamGame('440', 'Team Fortress 2')
      ])

      HumbleLibrary.recomputeOwnership()

      expect(mockLibraryStore.set).toHaveBeenCalled()
      expect(libraryData.get('gk1')?.keys[0].ownedElsewhere).toBe(true)
      expect(libraryData.get('gk1')?.keys[0].matchConfidence).toBe('exact')
    })
  })

  describe('HumbleLibrary.setOwnershipOverride() / clearOwnershipOverride() (D-42)', () => {
    test('an override clears a fuzzy match; clearing the override restores the computed match', () => {
      const entry = makeFuzzyMatchableEntry('gk1', 'Team Fortress 2')
      libraryData.set('gk1', entry)
      mockSteamIsLoggedIn.mockReturnValue(true)
      mockSteamLibraryStoreGet.mockReturnValue([
        makeSteamGame('440', 'Team Fortress 2')
      ])

      HumbleLibrary.recomputeOwnership()
      expect(libraryData.get('gk1')?.keys[0].matchConfidence).toBe('fuzzy')

      HumbleLibrary.setOwnershipOverride(entry.keys[0].machineName)
      expect(overrideData.has(entry.keys[0].machineName)).toBe(true)
      expect(libraryData.get('gk1')?.keys[0].ownedElsewhere).toBe(false)
      expect(libraryData.get('gk1')?.keys[0].matchConfidence).toBe('none')

      HumbleLibrary.clearOwnershipOverride(entry.keys[0].machineName)
      expect(overrideData.has(entry.keys[0].machineName)).toBe(false)
      expect(libraryData.get('gk1')?.keys[0].matchConfidence).toBe('fuzzy')
      expect(libraryData.get('gk1')?.keys[0].ownedElsewhere).toBe(true)
    })

    // WR-04 (14-REVIEW): the undo affordance must key off "an override
    // record exists" — the flags themselves are cleared by the override, so
    // the renderer needs this map to find the overridden row.
    test('WR-04: getAllOwnershipOverrides returns the machineName->overriddenAt map, {} when empty', () => {
      expect(HumbleLibrary.getAllOwnershipOverrides()).toEqual({})

      const entry = makeFuzzyMatchableEntry('gk1', 'Team Fortress 2')
      libraryData.set('gk1', entry)
      mockSteamIsLoggedIn.mockReturnValue(true)
      mockSteamLibraryStoreGet.mockReturnValue([
        makeSteamGame('440', 'Team Fortress 2')
      ])
      HumbleLibrary.recomputeOwnership()
      HumbleLibrary.setOwnershipOverride(entry.keys[0].machineName)

      const overrides = HumbleLibrary.getAllOwnershipOverrides()
      expect(Object.keys(overrides)).toEqual([entry.keys[0].machineName])
      expect(overrides[entry.keys[0].machineName]).toEqual(expect.any(Number))

      HumbleLibrary.clearOwnershipOverride(entry.keys[0].machineName)
      expect(HumbleLibrary.getAllOwnershipOverrides()).toEqual({})
    })
  })

  // ── Phase 14 guided claim flow: revealKey/markRedeemed/undoRedeemed ────────
  // C1 (single call site), C2 (backend hard block, D-69/D-70), SC4
  // (write-ahead audit ordering), D-78 (rollback split), D-79 (cooldown
  // reuse), D-77 (undoable local redeem).

  describe('HumbleLibrary.revealKey()', () => {
    test('ineligible: unknown gamekey/machineName', async () => {
      const outcome = await HumbleLibrary.revealKey('no-such-gk', 'no-such-key')
      expect(outcome).toEqual({ status: 'ineligible' })
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()
    })

    test('ineligible: a non-UNREVEALED key (e.g. already REDEEMED) is rejected', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { state: 'REDEEMED' }))

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'ineligible' })
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()
    })

    test('C2 (D-69): an EXACT ownedElsewhere match is hard-blocked, audits c2_block, makes no adapter call, sets no REVEALED flag', async () => {
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', {
          ownedElsewhere: true,
          matchConfidence: 'exact',
          keyindex: 'idx-1'
        })
      )

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'owned_blocked' })
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()
      expect(revealedData.has('gk1_key')).toBe(false)
      const audit = auditData.get('gk1:gk1_key')
      expect(audit).toHaveLength(1)
      expect(audit?.[0].event).toBe('c2_block')
    })

    test('C2 (D-70): a FUZZY ownedElsewhere match blocks exactly like an exact match', async () => {
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', {
          ownedElsewhere: true,
          matchConfidence: 'fuzzy',
          keyindex: 'idx-1'
        })
      )

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'owned_blocked' })
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()
    })

    test('cooldown: an active denial cooldown short-circuits before any adapter call', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'denied',
        cooldownUntil: Date.now() + 60_000
      })

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual(expect.objectContaining({ status: 'cooldown' }))
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()
    })

    test('Pitfall C: an eligible key with NO resolved keyindex is ineligible, never reaches the adapter', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1')) // no keyindex

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'ineligible' })
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()
    })

    test('no stored credentials: returns failed, no adapter call, no write-ahead', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockGetCredentials.mockReturnValue(undefined as unknown as string)

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'failed' })
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()
      expect(revealedData.has('gk1_key')).toBe(false)
    })

    test('SC4 write-ahead: the REVEALED flag and reveal_attempt audit exist BEFORE the adapter call resolves', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      let flagSeenDuringCall = false
      let auditSeenDuringCall = false
      mockAdapterRevealKey.mockImplementation(async () => {
        flagSeenDuringCall = revealedData.has('gk1_key')
        auditSeenDuringCall = Boolean(auditData.get('gk1:gk1_key')?.length)
        return { status: 'ok', data: { key: 'REAL-KEY-VALUE' } }
      })

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(flagSeenDuringCall).toBe(true)
      expect(auditSeenDuringCall).toBe(true)
    })

    test('happy path (ok): persists the key value internally, marks REVEALED, audits reveal_success, returns the key — never logs the raw value', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValue({
        status: 'ok',
        data: { key: 'REAL-KEY-VALUE' }
      })

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'revealed', key: 'REAL-KEY-VALUE' })
      expect(mockAdapterRevealKey).toHaveBeenCalledTimes(1)
      // Round 6: no cookie/fullCookieHeader argument — the reveal POST's
      // electron-net transport sources the live partition's cookie jar
      // natively (see adapter.ts).
      expect(mockAdapterRevealKey).toHaveBeenCalledWith('csrf-token-value', {
        gamekey: 'gk1',
        machineName: 'gk1_key',
        keyindex: 'idx-1'
      })
      expect(libraryData.get('gk1')?.keys[0].state).toBe('REVEALED')
      expect(HumbleLibrary.getRevealedKeyValue('gk1', 'gk1_key')).toBe(
        'REAL-KEY-VALUE'
      )
      const audit = auditData.get('gk1:gk1_key')
      expect(audit?.map((a) => a.event)).toEqual([
        'reveal_attempt',
        'reveal_success'
      ])
      // C4: never a raw key value in a display-safe HumbleKey / broadcast.
      const pushedKeys = mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleKeysUpdated'
      )
      for (const call of pushedKeys) {
        expect(JSON.stringify(call)).not.toContain('REAL-KEY-VALUE')
      }
    })

    test('D-78 definitive failure (schema_error): rolls back the write-ahead REVEALED flag, audits reveal_failed, returns failed', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValue({
        status: 'schema_error',
        raw: {}
      })

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'failed' })
      expect(revealedData.has('gk1_key')).toBe(false)
      expect(libraryData.get('gk1')?.keys[0].state).toBe('UNREVEALED')
      const audit = auditData.get('gk1:gk1_key')
      expect(audit?.map((a) => a.event)).toEqual([
        'reveal_attempt',
        'reveal_failed'
      ])
    })

    test('D-78/D-79 definitive failure (access_denied): rolls back the flag AND sets the shared D-33 cooldown', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValue({ status: 'access_denied' })

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'failed' })
      expect(revealedData.has('gk1_key')).toBe(false)
      const state = HumbleLibrary.getSyncState()
      expect(state.syncError).toBe('denied')
      expect(state.cooldownUntil).toBeGreaterThan(Date.now())
    })

    test('WR-06 rejected_by_server: KEEPS the write-ahead REVEALED flag, audits reveal_rejected, no cooldown, returns rejected_by_server', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValue({ status: 'rejected_by_server' })

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'rejected_by_server' })
      // Truthful state is "unconfirmed — sync to check": an already-redeemed
      // denial means the key IS consumed server-side, so the write-ahead
      // flag must NOT roll back (rolling back would misreport "nothing was
      // used up" and invite retries against a consumed key).
      expect(revealedData.has('gk1_key')).toBe(true)
      expect(HumbleLibrary.getRevealedKeyValue('gk1', 'gk1_key')).toBeNull()
      const audit = auditData.get('gk1:gk1_key')
      expect(audit?.map((a) => a.event)).toEqual([
        'reveal_attempt',
        'reveal_rejected'
      ])
      expect(audit?.[1].outcome).toBe('rejected_by_server')
      // Not an access_denied — the shared D-33 cooldown must NOT engage.
      expect(HumbleLibrary.getSyncState().cooldownUntil).toBeUndefined()
    })

    test('D-78 ambiguous (adapter throws): KEEPS the write-ahead REVEALED flag, persists no key value, audits reveal_ambiguous', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockRejectedValue(new Error('ECONNRESET'))

      const outcome = await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'ambiguous' })
      expect(revealedData.has('gk1_key')).toBe(true)
      expect(HumbleLibrary.getRevealedKeyValue('gk1', 'gk1_key')).toBeNull()
      const audit = auditData.get('gk1:gk1_key')
      expect(audit?.map((a) => a.event)).toEqual([
        'reveal_attempt',
        'reveal_ambiguous'
      ])
    })

    test('single call site (C1): exactly one adapter call per revealKey() invocation, never a loop/retry', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValue({
        status: 'ok',
        data: { key: 'K' }
      })

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(mockAdapterRevealKey).toHaveBeenCalledTimes(1)
    })

    // WR-01 (14-REVIEW): the cached state only flips to REVEALED after the
    // adapter call resolves, so the state-based eligibility check cannot
    // stop a concurrent duplicate — the backend's own in-flight set must.
    test('WR-01: a second revealKey while one is in flight returns failed and NEVER double-fires the adapter', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      let resolveAdapter!: (v: unknown) => void
      mockAdapterRevealKey.mockImplementation(
        () =>
          new Promise((r) => {
            resolveAdapter = r
          })
      )

      const first = HumbleLibrary.revealKey('gk1', 'gk1_key')
      await flushAsync()
      expect(mockAdapterRevealKey).toHaveBeenCalledTimes(1)

      const second = await HumbleLibrary.revealKey('gk1', 'gk1_key')
      expect(second).toEqual({ status: 'failed' })
      expect(mockAdapterRevealKey).toHaveBeenCalledTimes(1)

      resolveAdapter({ status: 'ok', data: { key: 'K' } })
      await expect(first).resolves.toEqual({ status: 'revealed', key: 'K' })
    })

    test('WR-01: the in-flight guard is per-composite-key — a different key reveals concurrently', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      libraryData.set(
        'gk2',
        makeRevealableEntry('gk2', {
          machineName: 'gk2_key',
          keyindex: 'idx-2'
        })
      )
      const resolvers: Array<(v: unknown) => void> = []
      mockAdapterRevealKey.mockImplementation(
        () =>
          new Promise((r) => {
            resolvers.push(r)
          })
      )

      const first = HumbleLibrary.revealKey('gk1', 'gk1_key')
      const second = HumbleLibrary.revealKey('gk2', 'gk2_key')
      await flushAsync()
      expect(mockAdapterRevealKey).toHaveBeenCalledTimes(2)

      resolvers.forEach((r) => r({ status: 'ok', data: { key: 'K' } }))
      await expect(first).resolves.toEqual({ status: 'revealed', key: 'K' })
      await expect(second).resolves.toEqual({ status: 'revealed', key: 'K' })
    })

    test('WR-01: the guard releases after settle — a retry after a definitive failure reaches the adapter again', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValueOnce({
        status: 'schema_error',
        raw: {}
      })

      await expect(HumbleLibrary.revealKey('gk1', 'gk1_key')).resolves.toEqual({
        status: 'failed'
      })

      mockAdapterRevealKey.mockResolvedValue({
        status: 'ok',
        data: { key: 'K' }
      })
      await expect(HumbleLibrary.revealKey('gk1', 'gk1_key')).resolves.toEqual({
        status: 'revealed',
        key: 'K'
      })
      expect(mockAdapterRevealKey).toHaveBeenCalledTimes(2)
    })

    test('WR-01: the guard releases even when the adapter throws (ambiguous path)', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockRejectedValue(new Error('ECONNRESET'))

      await expect(HumbleLibrary.revealKey('gk1', 'gk1_key')).resolves.toEqual({
        status: 'ambiguous'
      })

      // A follow-up EXPLICIT user retry is not blocked by a stuck guard
      // (state is still UNREVEALED in the cache — the ambiguous path never
      // patched it — so eligibility passes and the adapter is reached).
      mockAdapterRevealKey.mockResolvedValue({
        status: 'ok',
        data: { key: 'K' }
      })
      await expect(HumbleLibrary.revealKey('gk1', 'gk1_key')).resolves.toEqual({
        status: 'revealed',
        key: 'K'
      })
    })
  })

  // Debug session humble-reveal-key-fails (round 2): every early-return
  // branch of revealKey() was previously COMPLETELY silent in gamelib.log —
  // indistinguishable from a live Humble 401/403/429 denial (mapAxiosError's
  // own silent mapping for those statuses) once the wizard collapses both
  // into the same generic 'failed' step text. Each branch now logs a
  // status-only line (gamekey/machineName/state — never a key VALUE) so a
  // future reveal failure is self-diagnosing without another live-UAT round.
  describe('HumbleLibrary.revealKey() — self-diagnosing silent gaps (debug session humble-reveal-key-fails)', () => {
    test('ineligible (unknown gamekey/machineName) logs a status-only warning', async () => {
      await HumbleLibrary.revealKey('no-such-gk', 'no-such-key')

      const call = mockLogWarning.mock.calls.find((c) =>
        String(c[0][0]).includes(
          'Humble reveal: ineligible (target missing or not UNREVEALED)'
        )
      )
      expect(call).toBeDefined()
      expect(JSON.stringify(call)).toContain('no-such-gk')
      expect(JSON.stringify(call)).toContain('state=not_found')
    })

    test('ineligible (non-UNREVEALED state) logs the actual state', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { state: 'REDEEMED' }))

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogWarning.mock.calls.find((c) =>
        String(c[0][0]).includes(
          'Humble reveal: ineligible (target missing or not UNREVEALED)'
        )
      )
      expect(call).toBeDefined()
      expect(JSON.stringify(call)).toContain('state=REDEEMED')
    })

    test('cooldown short-circuit logs the retry timestamp before returning', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      const retryAt = Date.now() + 60_000
      syncData.set('state', {
        syncedAt: 1,
        syncError: 'denied',
        cooldownUntil: retryAt
      })

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogWarning.mock.calls.find((c) =>
        String(c[0][0]).includes('Humble reveal: blocked by cooldown until')
      )
      expect(call).toBeDefined()
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()
    })

    test('ineligible (unresolved keyindex) logs distinctly from the general ineligible branch', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1')) // no keyindex

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogWarning.mock.calls.find((c) =>
        String(c[0][0]).includes(
          'Humble reveal: ineligible (keyindex unresolved)'
        )
      )
      expect(call).toBeDefined()
    })

    test('logs csrfTokenPresent=true right before the adapter call when a token is cached', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValue({
        status: 'ok',
        data: { key: 'K' }
      })

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogInfo.mock.calls.find((c) =>
        String(c[0][0]).includes('csrfTokenPresent=true')
      )
      expect(call).toBeDefined()
    })

    test('logs csrfTokenPresent=false when no token is available — never blocks the call (opportunistic header)', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockGetLiveCsrfToken.mockResolvedValue(undefined as unknown as string)
      mockAdapterRevealKey.mockResolvedValue({
        status: 'ok',
        data: { key: 'K' }
      })

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogInfo.mock.calls.find((c) =>
        String(c[0][0]).includes('csrfTokenPresent=false')
      )
      expect(call).toBeDefined()
      // Round 6: no cookie/fullCookieHeader argument — see adapter.ts.
      expect(mockAdapterRevealKey).toHaveBeenCalledWith(undefined, {
        gamekey: 'gk1',
        machineName: 'gk1_key',
        keyindex: 'idx-1'
      })
    })

    // Round 6 (debug session humble-reveal-key-fails): round 5's
    // fullCookieJarPresent log field and HumbleUser.getFullCookieHeader()
    // mechanism were both removed — the reveal POST's electron-net transport
    // sources the live partition's cookie jar natively (see adapter.ts's
    // humblePostRequest doc comment). This asserts the log line's new,
    // simpler shape and that the adapter call no longer carries a 3rd/4th
    // cookie-shaped argument.
    test('WR-03: the adapter receives the LIVE partition csrf token, never the stale stored snapshot', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockGetCsrfToken.mockReturnValue('stale-stored-token')
      mockGetLiveCsrfToken.mockResolvedValue('live-rotated-token')
      mockAdapterRevealKey.mockResolvedValue({
        status: 'ok',
        data: { key: 'K' }
      })

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      expect(mockAdapterRevealKey).toHaveBeenCalledWith('live-rotated-token', {
        gamekey: 'gk1',
        machineName: 'gk1_key',
        keyindex: 'idx-1'
      })
    })

    test('round 6: calling-adapter log line names the electron-net transport and carries no fullCookieJarPresent field', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValue({
        status: 'ok',
        data: { key: 'K' }
      })

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogInfo.mock.calls.find((c) =>
        String(c[0][0]).includes('electron-net transport')
      )
      expect(call).toBeDefined()
      expect(String(call?.[0][0])).not.toContain('fullCookieJarPresent')
      expect(mockAdapterRevealKey).toHaveBeenCalledWith('csrf-token-value', {
        gamekey: 'gk1',
        machineName: 'gk1_key',
        keyindex: 'idx-1'
      })
    })

    // ── Phase 34.4.1 gap-cycle plan 17 (F-8) ──────────────────────────────
    // The literal "electron-net transport" used to be stamped unconditionally.
    // These two cases prove the label is now DERIVED from
    // `getLoginWindowSeam()` at log time — the same condition
    // `humblePostRequest` (`adapter.ts`) branches its dispatch on — so the
    // log can never again contradict which transport actually ran.

    test('F-8: with a login-window seam installed, the calling-adapter log line names the seam transport, not electron-net', async () => {
      // adapterRevealKey is mocked in this file (see jest.mock('../adapter', ...)
      // above) — this test only proves library.ts's LOG LABEL derivation,
      // not the real adapter.ts dispatch (covered by adapter.test.ts).
      setLoginWindowSeam({} as LoginWindowSeam)
      try {
        libraryData.set(
          'gk1',
          makeRevealableEntry('gk1', { keyindex: 'idx-1' })
        )
        mockAdapterRevealKey.mockResolvedValue({
          status: 'ok',
          data: { key: 'K' }
        })

        await HumbleLibrary.revealKey('gk1', 'gk1_key')

        const call = mockLogInfo.mock.calls.find((c) =>
          String(c[0][0]).includes('login-window seam transport')
        )
        expect(call).toBeDefined()
        expect(String(call?.[0][0])).not.toContain('electron-net transport')
      } finally {
        setLoginWindowSeam(null)
      }
    })

    test('F-8: with no seam installed, the calling-adapter log line still names the electron-net transport (regression)', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValue({
        status: 'ok',
        data: { key: 'K' }
      })

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogInfo.mock.calls.find((c) =>
        String(c[0][0]).includes('electron-net transport')
      )
      expect(call).toBeDefined()
      expect(String(call?.[0][0])).not.toContain('login-window seam transport')
    })

    test('definitive failure (access_denied) logs the exact adapter status — the previously-silent 401/403/429 mapAxiosError gap', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValue({ status: 'access_denied' })

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogWarning.mock.calls.find((c) =>
        String(c[0][0]).includes(
          'Humble reveal: definitive failure, status=access_denied'
        )
      )
      expect(call).toBeDefined()
    })

    test('definitive failure (schema_error) logs the exact adapter status', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockResolvedValue({
        status: 'schema_error',
        raw: {}
      })

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogWarning.mock.calls.find((c) =>
        String(c[0][0]).includes(
          'Humble reveal: definitive failure, status=schema_error'
        )
      )
      expect(call).toBeDefined()
    })

    test('ambiguous outcome (adapter throws) does NOT log a "definitive failure" line — the D-78 distinction is preserved', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockAdapterRevealKey.mockRejectedValue(new Error('ECONNRESET'))

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogWarning.mock.calls.find((c) =>
        String(c[0][0]).includes('Humble reveal: definitive failure')
      )
      expect(call).toBeUndefined()
    })

    test('no stored credentials logs a status-only warning, never the adapter call', async () => {
      libraryData.set('gk1', makeRevealableEntry('gk1', { keyindex: 'idx-1' }))
      mockGetCredentials.mockReturnValue(undefined as unknown as string)

      await HumbleLibrary.revealKey('gk1', 'gk1_key')

      const call = mockLogWarning.mock.calls.find((c) =>
        String(c[0][0]).includes(
          'Humble reveal: failed (no stored credentials)'
        )
      )
      expect(call).toBeDefined()
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()
    })
  })

  describe('HumbleLibrary.markRedeemed() / undoRedeemed() (D-77, realigned by 14-07)', () => {
    test('markRedeemed on a REVEALED key sets the local-redeemed mark, audits mark_redeemed, patches to REDEEMED', async () => {
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', { state: 'REVEALED', keyindex: 'idx-1' })
      )

      const outcome = await HumbleLibrary.markRedeemed('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'ok' })
      expect(localRedeemedData.has('gk1:gk1_key')).toBe(true)
      expect(libraryData.get('gk1')?.keys[0].state).toBe('REDEEMED')
      const audit = auditData.get('gk1:gk1_key')
      expect(audit?.map((a) => a.event)).toEqual(['mark_redeemed'])
    })

    test('markRedeemed on a non-REVEALED key is ineligible, no store writes', async () => {
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', { state: 'UNREVEALED' })
      )

      const outcome = await HumbleLibrary.markRedeemed('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'ineligible' })
      expect(localRedeemedData.has('gk1:gk1_key')).toBe(false)
    })

    // 14-07 gap closure: REDEEMED is now local-only — there is no
    // server-confirmed tier to acknowledge, so an already-REDEEMED key is
    // simply ineligible for a second mark (Undo is the only affordance).
    test('14-07: markRedeemed on an already-REDEEMED key stays ineligible (nothing to re-mark — Undo is the affordance)', async () => {
      localRedeemedData.set('gk1:gk1_key', { redeemedAt: 111 })
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', {
          state: 'REDEEMED',
          keyindex: 'idx-1'
        })
      )

      const outcome = await HumbleLibrary.markRedeemed('gk1', 'gk1_key')

      expect(outcome).toEqual({ status: 'ineligible' })
      // The pre-existing mark is untouched.
      expect(localRedeemedData.get('gk1:gk1_key')).toEqual({ redeemedAt: 111 })
    })

    test('undoRedeemed on a REDEEMED key clears the mark, audits undo_redeemed, reverts to REVEALED', async () => {
      localRedeemedData.set('gk1:gk1_key', { redeemedAt: Date.now() })
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', {
          state: 'REDEEMED',
          keyindex: 'idx-1'
        })
      )

      await HumbleLibrary.undoRedeemed('gk1', 'gk1_key')

      expect(localRedeemedData.has('gk1:gk1_key')).toBe(false)
      expect(libraryData.get('gk1')?.keys[0].state).toBe('REVEALED')
      const audit = auditData.get('gk1:gk1_key')
      expect(audit?.map((a) => a.event)).toEqual(['undo_redeemed'])
    })

    test('undoRedeemed is a no-op when the key is not currently REDEEMED', async () => {
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', {
          state: 'REVEALED',
          keyindex: 'idx-1'
        })
      )

      await HumbleLibrary.undoRedeemed('gk1', 'gk1_key')

      expect(libraryData.get('gk1')?.keys[0].state).toBe('REVEALED')
      expect(auditData.get('gk1:gk1_key')).toBeUndefined()
    })
  })

  // 14-07 gap closure: a sync must never reclassify a locally-marked-REDEEMED
  // key away from REDEEMED (classifyTpk's isLocallyRedeemed tier now wins
  // over server redeemedKeyValuePresent), and a GameLib-revealed key (no
  // local mark) must stay REVEALED — not REDEEMED — across sync, since
  // Humble's reveal endpoint populating redeemed_key_val only means revealed.
  describe('sync() — 14-07: claim state survives a re-sync', () => {
    test('re-syncing a locally-marked order (no server redeemed value) keeps REDEEMED and Undo stays reachable', async () => {
      // The user marked this key redeemed locally (D-77): store mark set by
      // markRedeemed, cache patched to REDEEMED.
      localRedeemedData.set('gk1:gk1_key', { redeemedAt: Date.now() })
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', {
          state: 'REDEEMED',
          keyindex: 'idx-1'
        })
      )
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      // Server still shows NO redeemed value — the redeem is local-only.
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1')
      })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })

      const key = libraryData.get('gk1')?.keys[0]
      expect(key?.state).toBe('REDEEMED')

      // The D-77 Undo path is still reachable AFTER the sync.
      await HumbleLibrary.undoRedeemed('gk1', 'gk1_key')
      expect(localRedeemedData.has('gk1:gk1_key')).toBe(false)
      expect(libraryData.get('gk1')?.keys[0].state).toBe('REVEALED')
    })

    test('re-syncing a locally-marked order that ALSO now shows a server redeemed value still keeps REDEEMED (local mark wins)', async () => {
      localRedeemedData.set('gk1:gk1_key', { redeemedAt: Date.now() })
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', {
          state: 'REDEEMED',
          keyindex: 'idx-1'
        })
      )
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1', { redeemed: true })
      })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })

      const key = libraryData.get('gk1')?.keys[0]
      expect(key?.state).toBe('REDEEMED')

      // Undo remains reachable — every REDEEMED key is local-only now.
      await HumbleLibrary.undoRedeemed('gk1', 'gk1_key')
      expect(libraryData.get('gk1')?.keys[0].state).toBe('REVEALED')
    })

    test('a sync that finds a server redeemed value with NO local mark classifies REVEALED, not REDEEMED', async () => {
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', {
          state: 'UNREVEALED',
          keyindex: 'idx-1'
        })
      )
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1', { redeemed: true })
      })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })

      const key = libraryData.get('gk1')?.keys[0]
      expect(key?.state).toBe('REVEALED')

      // markRedeemed is now reachable from this REVEALED state.
      const outcome = await HumbleLibrary.markRedeemed('gk1', 'gk1_key')
      expect(outcome).toEqual({ status: 'ok' })
      expect(libraryData.get('gk1')?.keys[0].state).toBe('REDEEMED')
    })

    // CR-01 (14-REVIEW re-review): the website-revealed key path. A key the
    // user revealed on Humble's WEBSITE carries redeemed_key_val server-side
    // but has no local reveal record and no locally-persisted value — the
    // sync must carry the SERVER value onto the internal revealedKeyValue
    // field so the wizard's finish mode can show the key on demand, without
    // ever firing a reveal POST (D-66 never-re-reveal).
    test('CR-01: a website-revealed key (server value, no local record) exposes the key value to finish mode without any reveal call', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1', { redeemed: true })
      })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })

      const key = libraryData.get('gk1')?.keys[0]
      expect(key?.state).toBe('REVEALED')
      // Finish mode's on-demand read returns the SERVER-provided value.
      expect(HumbleLibrary.getRevealedKeyValue('gk1', 'gk1_key')).toBe(
        'REDEEMED-VALUE'
      )
      // D-66: the reveal adapter was never touched.
      expect(mockAdapterRevealKey).not.toHaveBeenCalled()
      // C5/C4: the server value never reaches a log line or the display
      // broadcast — only the explicit getRevealedKeyValue read surfaces it.
      for (const call of [
        ...mockLogInfo.mock.calls,
        ...mockLogWarning.mock.calls,
        ...mockLogError.mock.calls
      ]) {
        expect(JSON.stringify(call)).not.toContain('REDEEMED-VALUE')
      }
      const broadcasts = mockSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'humbleKeysUpdated'
      )
      expect(broadcasts.length).toBeGreaterThan(0)
      expect(JSON.stringify(broadcasts)).not.toContain('REDEEMED-VALUE')
    })

    // WR-01 (14-REVIEW re-review), UPDATED by the 14-08 gap closure: patchCachedState
    // must RECOMPUTE allTerminal AND (14-08) freezeEligible. Sequence under
    // test: mark (order becomes all-terminal and freezes under D-24 after a
    // sync) → undo (key reverts to REVEALED, expiration:null — allTerminal
    // recomputes false, but freezeEligible recomputes TRUE per 14-08's
    // server-terminal predicate: a VALUE-BACKED REVEALED key with no pending
    // expiration is freeze-eligible; CR-01, 14-08 re-review, added the
    // value-present requirement — this key was GameLib-revealed, so its
    // internal revealedKeyValue is present and carried across the sync) —
    // partitionGamekeys' next-sync frozen decision must read the SAME value
    // patchCachedState just wrote, so the order stays frozen (no needless
    // re-fetch), never disagreeing between the two sites.
    test('WR-01: mark → sync → undo → second sync does NOT needlessly re-fetch a still-server-terminal (value-backed REVEALED, no expiration) order (14-08: undo recomputes freezeEligible via the same single-sourced predicate)', async () => {
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', {
          state: 'REVEALED',
          keyindex: 'idx-1',
          // GameLib-revealed: the value was persisted by doRevealKey's ok
          // patch (D-74) — the CR-01 value-present freeze requirement is met.
          revealedKeyValue: 'LOCAL-REVEALED-VALUE'
        })
      )
      await HumbleLibrary.markRedeemed('gk1', 'gk1_key')

      // First sync: the only key stays REDEEMED (local mark wins) — the
      // order commits allTerminal: true and freezes. The prior key's
      // revealedKeyValue is carried forward onto the merged entry.
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1')
      })
      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })
      expect(libraryData.get('gk1')?.allTerminal).toBe(true)

      // Undo: the mark clears, the key reverts to REVEALED, and the frozen
      // entry's allTerminal is recomputed — not spread forward as true. Its
      // freezeEligible, however, recomputes TRUE (server-terminal,
      // value-backed, no pending expiration) via the exact same
      // isFreezeEligible helper partitionGamekeys reads.
      await HumbleLibrary.undoRedeemed('gk1', 'gk1_key')
      expect(libraryData.get('gk1')?.keys[0].state).toBe('REVEALED')
      expect(libraryData.get('gk1')?.allTerminal).toBe(false)
      expect(libraryData.get('gk1')?.freezeEligible).toBe(true)

      // Second sync (classifier version already stamped by the first sync,
      // so nothing else bypasses the freeze): the order stays frozen and is
      // NOT re-fetched — freezeEligible wins over the allTerminal fallback,
      // and undo never left the two computation sites disagreeing.
      mockGetOrderDetail.mockClear()
      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })
      expect(mockGetOrderDetail).not.toHaveBeenCalled()
    })

    // 14-08 gap closure: the WR-01 predicate-consistency guarantee proven
    // with a FUTURE-expiring REVEALED key instead — here undo genuinely
    // UNFREEZES the order (freezeEligible:false, since a pending expiration
    // is present), so the next sync legitimately re-fetches it; re-marking
    // REDEEMED then REFREEZES it. partitionGamekeys and patchCachedState
    // never disagree about the same key set across this full cycle.
    test('WR-01 (14-08): mark → sync (freezes) → undo(future-exp REVEALED, thaws) → sync (re-fetches) → mark (refreezes)', async () => {
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', { state: 'REVEALED', keyindex: 'idx-1' })
      )
      // A prior actual reveal recorded the local flag — needed so the
      // second sync's fresh classify (after undo clears the local-redeemed
      // mark) still reads REVEALED rather than defaulting to UNREVEALED.
      revealedData.set('gk1_key', { revealedAt: Date.now() })
      await HumbleLibrary.markRedeemed('gk1', 'gk1_key')

      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1', { expiration: '2099-01-01T00:00:00Z' })
      })
      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })
      expect(libraryData.get('gk1')?.allTerminal).toBe(true)
      expect(libraryData.get('gk1')?.freezeEligible).toBe(true)

      // Undo: reverts to REVEALED, but this key's fresh classify carried a
      // future expiration — patchCachedState's patched key inherits the
      // PRIOR key's fields (including `expiration`), so freezeEligible
      // recomputes to false: the order genuinely UNFREEZES.
      await HumbleLibrary.undoRedeemed('gk1', 'gk1_key')
      expect(libraryData.get('gk1')?.keys[0].state).toBe('REVEALED')
      expect(libraryData.get('gk1')?.allTerminal).toBe(false)
      expect(libraryData.get('gk1')?.freezeEligible).toBe(false)

      // Second sync: the order IS re-fetched (thawed, not frozen).
      mockGetOrderDetail.mockClear()
      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })
      expect(mockGetOrderDetail).toHaveBeenCalledWith('cookie-value', 'gk1')

      // Re-mark REDEEMED: the order REFREEZES (freezeEligible has no expiry
      // guard for REDEEMED).
      const outcome = await HumbleLibrary.markRedeemed('gk1', 'gk1_key')
      expect(outcome).toEqual({ status: 'ok' })
      expect(libraryData.get('gk1')?.freezeEligible).toBe(true)
    })

    test('CR-01: a GameLib-revealed key keeps its own persisted value across a re-sync (prior value wins over the server copy)', async () => {
      libraryData.set(
        'gk1',
        makeRevealableEntry('gk1', {
          state: 'REVEALED',
          keyindex: 'idx-1',
          revealedKeyValue: 'LOCAL-REVEALED-VALUE'
        })
      )
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
      mockGetOrderDetail.mockResolvedValue({
        status: 'ok',
        data: makeRawOrder('gk1', { redeemed: true })
      })

      await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })

      expect(HumbleLibrary.getRevealedKeyValue('gk1', 'gk1_key')).toBe(
        'LOCAL-REVEALED-VALUE'
      )
    })
  })
})
