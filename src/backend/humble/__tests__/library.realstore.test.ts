/**
 * Regression tests for the Phase 11 live-UAT failure (debug session:
 * humble-sync-spinner-never-ends).
 *
 * Unlike library.test.ts (which mocks ../stores with clean Map-backed
 * doubles), these tests run HumbleLibrary against the REAL CacheStore +
 * electron-store (redirected to a tmp cwd by src/backend/__mocks__/
 * electron-store.ts). The live bug was invisible to any Map double:
 * CacheStore.set() writes a `__timestamp.${key}` bookkeeping key, which
 * electron-store's dot-notation nests under a top-level `__timestamp` object
 * on disk. CacheStore.entries() leaked that group as a pseudo-entry, so
 * HumbleLibrary.getKeys() threw `entry.keys is not iterable` after the FIRST
 * committed order — rejecting sync() after `humbleSyncProgress` but before
 * `humbleKeysUpdated` (renderer spinner stuck forever) and rejecting every
 * humbleGetKeys IPC call (keys never rendered, logout/login recreated it).
 */

jest.mock('backend/store_backend')

// ── adapter mock ─────────────────────────────────────────────────────────

const mockGetGamekeys = jest.fn()
const mockGetOrderDetail = jest.fn()
// getLibraryOrders is scripted through the two legacy-shaped doubles: the item
// ids (or a non-ok/throwing outcome for the whole fetch) and the per-item
// order-detail-shaped payload. The real adapter is all-or-nothing.
jest.mock('../adapter', () => ({
  getLibraryOrders: async (...args: unknown[]) => {
    const gamekeys = await mockGetGamekeys(...args)
    if (gamekeys.status !== 'ok') return gamekeys
    const orders: unknown[] = []
    for (const gamekey of gamekeys.data as string[]) {
      const detail = await mockGetOrderDetail(args[0], gamekey)
      if (detail.status !== 'ok') return detail
      orders.push(detail.data)
    }
    return { status: 'ok', data: orders }
  }
}))

// ── ipc / logger mocks ───────────────────────────────────────────────────

const mockSendFrontendMessage = jest.fn()

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

// ── expirationAlerts mock (HSTORE-03, Plan 03) ──────────────────────────────
// Mocked wholesale — the real module imports `backend/config` (GlobalConfig),
// which pulls in a large unrelated module graph (storeManagers/gog etc.) that
// this suite does not mock. Wiring/behavior are covered by library.test.ts
// and expirationAlerts.test.ts respectively.
jest.mock('../expirationAlerts', () => ({
  detectAndNotifyExpirationTransitions: jest.fn()
}))

// ── Imports (after mocks) — REAL stores/CacheStore ──────────────

import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { defined } from './defined'
import { createHumbleLibrary } from '../library'
import { createHumbleSyncFence } from '../syncFence'
import { createLoginWindowSeamSlot } from '../loginWindowSeam'
import { createTestSteamUser } from 'backend/testUtils/testSteamUser'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createHumbleStores } from '../stores'

const sendFrontendMessage = (...args: unknown[]) =>
  mockSendFrontendMessage(...args)

const humbleStoreModule = createHumbleStores({
  registry: createStoreRegistry(),
  root: createTestStoreRoot()
})

const { humbleLibraryStore, humbleSyncStore } = humbleStoreModule
// library.ts asks the Steam session isLoggedIn(); a signed-out Steam config store keeps it a pure read.
const steamUser = createTestSteamUser({
  stores: { steam: { configStore: { get_nodefault: () => undefined } } }
} as never)
// The library under test is one boot-style instance over the REAL stores (66.3-17).
const HumbleLibrary = createHumbleLibrary({
  sendFrontendMessage,
  stores: { humble: humbleStoreModule, steam: {} } as never,
  user: {
    getCredentials: async () => 'cookie-value',
    getLiveCsrfToken: async () => undefined
  },
  syncFence: createHumbleSyncFence(),
  steamUser,
  steamAppIdResolver: {
    lookupCached: () => undefined,
    resolvePending: async () => ({
      requested: 0,
      resolved: 0,
      cached: 0,
      misses: 0,
      errors: 0,
      deferred: 0
    })
  },
  loginWindowSeam: createLoginWindowSeamSlot(),
  appInfo: { userAgentFallback: 'Mozilla/5.0 (X11; Linux) Chrome/1.0' }
})

function makeRawOrder(gamekey: string) {
  return {
    gamekey,
    human_name: `Order ${gamekey}`,
    tpkd_dict: {
      all_tpks: [
        {
          machine_name: `${gamekey}_key`,
          human_name: `Key for ${gamekey}`,
          key_type: 'steam',
          redeemed_key_value: null,
          expiration: null
        }
      ]
    }
  }
}

import { createTestGlobalConfig } from 'backend/testUtils/testConfig'

// The expiration digest is mocked wholesale; sync only forwards these slices to it.
const syncDeps = {
  config: createTestGlobalConfig(),
  notifications: { show: jest.fn() }
}

describe('HumbleLibrary against the real CacheStore (electron-store backed)', () => {
  beforeEach(() => {
    humbleLibraryStore.clear()
    humbleSyncStore.clear()
  })

  test('sync() completes: final humbleSyncProgress reaches done===total and is followed by a humbleKeysUpdated push (spinner-clearing contract)', async () => {
    mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1', 'gk2'] })
    mockGetOrderDetail.mockImplementation((_cookie: string, gk: string) =>
      Promise.resolve({ status: 'ok', data: makeRawOrder(gk) })
    )

    // Pre-fix this rejected with `TypeError: entry.keys is not iterable`
    // as soon as the first order committed.
    await expect(HumbleLibrary.sync(syncDeps)).resolves.toEqual({
      status: 'ok'
    })

    const calls = mockSendFrontendMessage.mock.calls
    const progressIndexes = calls
      .map((c, i) => (c[0] === 'humbleSyncProgress' ? i : -1))
      .filter((i) => i >= 0)
    const lastProgressIndex = defined(
      progressIndexes[progressIndexes.length - 1],
      'last humbleSyncProgress index'
    )

    // The terminal progress event must reach done === total — the renderer
    // computes `syncing = done < total` from exactly this payload.
    expect(defined(calls[lastProgressIndex], 'last progress call')[1]).toEqual({
      done: 2,
      total: 2
    })

    // …and a humbleKeysUpdated (which also clears `syncing`) must follow it.
    const keysUpdatedAfterLastProgress = calls
      .slice(lastProgressIndex + 1)
      .filter((c) => c[0] === 'humbleKeysUpdated')
    expect(keysUpdatedAfterLastProgress).toHaveLength(1)

    // The pushed inventory contains BOTH real keys and no bookkeeping
    // pseudo-entry.
    const pushedKeys = keysUpdatedAfterLastProgress[0][1] as Array<{
      gamekey: string
    }>
    expect(pushedKeys.map((k) => k.gamekey).sort()).toEqual(['gk1', 'gk2'])
  })

  test('getKeys() returns the committed keys after a sync — never throws on the on-disk __timestamp bookkeeping group', async () => {
    mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['steam-gk'] })
    mockGetOrderDetail.mockResolvedValue({
      status: 'ok',
      data: makeRawOrder('steam-gk')
    })

    await HumbleLibrary.sync(syncDeps)

    // Pre-fix this threw (humbleGetKeys IPC rejected on every call, so the
    // purchased key never rendered).
    const keys = HumbleLibrary.getKeys()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({
      gamekey: 'steam-gk',
      machineName: 'steam-gk_key',
      state: 'UNREVEALED',
      platform: 'steam'
    })
  })

  // ── Live-UAT round 2 (debug: humble-keys-empty-list-flashing-sync) ──────
  // Event-payload shape contract: the renderer derives the freshness line +
  // fail-soft banner from humbleSyncStateChanged and `syncing` from
  // humbleSyncProgress; humbleKeysUpdated carries keys ONLY. These assertions
  // run against the REAL file-backed stores.

  test('round 2: a clean sync ends with a humbleSyncStateChanged push carrying a fresh syncedAt and syncError=none, AFTER the last keys push', async () => {
    mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1', 'gk2'] })
    mockGetOrderDetail.mockImplementation((_cookie: string, gk: string) =>
      Promise.resolve({ status: 'ok', data: makeRawOrder(gk) })
    )
    const before = Date.now()

    await HumbleLibrary.sync(syncDeps)

    const calls = mockSendFrontendMessage.mock.calls
    // Terminal event is the LAST event of the sync.
    expect(calls[calls.length - 1][0]).toBe('humbleSyncStateChanged')
    const state = calls[calls.length - 1][1] as {
      syncedAt: number | null
      syncError: string
    }
    expect(state.syncError).toBe('none')
    expect(state.syncedAt).toBeGreaterThanOrEqual(before)

    // humbleKeysUpdated payloads are pure HumbleKey[] — never carry
    // sync-state fields (the renderer must not derive syncing/syncedAt from
    // them).
    const keysPushes = calls.filter((c) => c[0] === 'humbleKeysUpdated')
    expect(keysPushes.length).toBeGreaterThan(0)
    for (const [, payload] of keysPushes) {
      expect(Array.isArray(payload)).toBe(true)
      for (const key of payload as Array<Record<string, unknown>>) {
        expect(key).toEqual(
          expect.objectContaining({
            gamekey: expect.any(String),
            machineName: expect.any(String),
            state: expect.any(String),
            platform: expect.any(String)
          })
        )
        expect(key).not.toHaveProperty('redeemed_key_value')
        expect(key).not.toHaveProperty('syncedAt')
      }
    }
  })

  test('a library fetch that fails schema parse commits nothing and records syncError=network (a failed fetch is never a silent empty success)', async () => {
    mockGetGamekeys.mockResolvedValue({
      status: 'schema_error',
      raw: '<html>challenge</html>'
    })

    await expect(HumbleLibrary.sync(syncDeps)).resolves.toEqual({
      status: 'failed'
    })

    expect(HumbleLibrary.getKeys()).toEqual([])
    const stateEvents = mockSendFrontendMessage.mock.calls.filter(
      (c) => c[0] === 'humbleSyncStateChanged'
    )
    expect(stateEvents).toHaveLength(1)
    expect(stateEvents[0][1]).toEqual(
      expect.objectContaining({ syncError: 'network' })
    )
  })

  test('loadCached() pushes only real cached keys from the file-backed store', async () => {
    mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
    mockGetOrderDetail.mockResolvedValue({
      status: 'ok',
      data: makeRawOrder('gk1')
    })
    await HumbleLibrary.sync(syncDeps)
    mockSendFrontendMessage.mockClear()

    HumbleLibrary.loadCached()

    expect(mockSendFrontendMessage).toHaveBeenCalledTimes(1)
    const [channel, keys] = mockSendFrontendMessage.mock.calls[0]
    expect(channel).toBe('humbleKeysUpdated')
    expect((keys as Array<{ gamekey: string }>).map((k) => k.gamekey)).toEqual([
      'gk1'
    ])
  })
})
