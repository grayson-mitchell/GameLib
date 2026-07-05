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
})
