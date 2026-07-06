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
 *  - ../electronStores -> humbleLibraryStore, humbleSyncStore, humbleRevealedStore
 *  - backend/ipc       -> sendFrontendMessage
 *  - backend/logger    -> logInfo/logError/logWarning
 *
 * classify.ts is NOT mocked — real classification runs against small
 * fixture-shaped raw orders so partition/commit assertions exercise the real
 * 5-state precedence rather than a stub.
 */

import type { HumbleKey, HumbleOrderCacheEntry, HumbleSyncState } from 'common/types/humble'

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

const revealedData = new Set<string>()
const mockRevealedStore = {
  has: jest.fn(),
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
  mockRevealedStore.set.mockImplementation((k: string) => {
    revealedData.add(k)
  })
  mockRevealedStore.clear.mockImplementation(() => revealedData.clear())
}

jest.mock('../electronStores', () => ({
  humbleLibraryStore: mockLibraryStore,
  humbleSyncStore: mockSyncStore,
  humbleRevealedStore: mockRevealedStore
}))

// ── adapter mock ─────────────────────────────────────────────────────────

const mockGetGamekeys = jest.fn()
const mockGetOrderDetail = jest.fn()
jest.mock('../adapter', () => ({
  getGamekeys: (...args: unknown[]) => mockGetGamekeys(...args),
  getOrderDetail: (...args: unknown[]) => mockGetOrderDetail(...args)
}))

// ── user mock (credentials only — auth flows are Plan 02's caller, not owner) ─

const mockGetCredentials = jest.fn(() => 'cookie-value')
jest.mock('../user', () => ({
  HumbleUser: {
    getCredentials: () => mockGetCredentials()
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

// ── Imports (after mocks) ────────────────────────────────────────────────

import { HumbleLibrary } from '../library'
import { HUMBLE_SYNC_CONCURRENCY } from '../constants'

const flushAsync = async () => new Promise((r) => setImmediate(r))

function makeRawOrder(
  gamekey: string,
  opts: {
    machineName?: string
    redeemed?: boolean
    expiration?: string | null
  } = {}
) {
  return {
    gamekey,
    human_name: `Order ${gamekey}`,
    tpkd_dict: {
      all_tpks: [
        {
          machine_name: opts.machineName ?? `${gamekey}_key`,
          human_name: `Key for ${gamekey}`,
          key_type: 'steam',
          redeemed_key_value: opts.redeemed ? 'REDEEMED-VALUE' : null,
          expiration: opts.expiration ?? null
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
    origin: `Order ${gamekey}`
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
    origin: `Order ${gamekey}`
  }
  return { gamekey, keys: [key], allTerminal: false }
}

describe('HumbleLibrary', () => {
  beforeEach(() => {
    libraryData.clear()
    syncData.clear()
    revealedData.clear()
    resetStoreMocks()
    mockGetCredentials.mockReturnValue('cookie-value')
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
    test('one getOrderDetail REJECTING keeps that order\'s cached entry, the pool finishes the others, sync ends partial', async () => {
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
      expect(keys[0].state).toBe('REDEEMED')
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

  // Live-UAT round 4: every key row showed "No expiration" because the real
  // Humble date field name was not extracted. The expiration-field discovery
  // diagnostic logs (field NAMES only, C5) the candidate fields on active keys
  // we could not date, so the true field is confirmable from the next run.
  describe('sync() — expiration-field discovery diagnostic (round 4)', () => {
    test('an active key with no extractable expiration logs its candidate field names (info, redacted)', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['undatable-gk'] })
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
})
