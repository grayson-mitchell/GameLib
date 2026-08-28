/**
 * Regression tests for the Phase 11 live-UAT failure (debug session:
 * humble-sync-spinner-never-ends).
 *
 * Unlike library.test.ts (which mocks ../electronStores with clean Map-backed
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
jest.mock('../adapter', () => ({
  getGamekeys: (...args: unknown[]) => mockGetGamekeys(...args),
  getOrderDetail: (...args: unknown[]) => mockGetOrderDetail(...args)
}))

// ── user mock (credentials only) ─────────────────────────────────────────

jest.mock('../user', () => ({
  HumbleUser: {
    getCredentials: () => 'cookie-value'
  }
}))

// ── ipc / logger mocks ───────────────────────────────────────────────────

const mockSendFrontendMessage = jest.fn()
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: (...args: unknown[]) => mockSendFrontendMessage(...args)
}))

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

// ── Imports (after mocks) — REAL electronStores/CacheStore ──────────────

import { HumbleLibrary } from '../library'
import { humbleLibraryStore, humbleSyncStore } from '../electronStores'

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
    await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'ok' })

    const calls = mockSendFrontendMessage.mock.calls
    const progressIndexes = calls
      .map((c, i) => (c[0] === 'humbleSyncProgress' ? i : -1))
      .filter((i) => i >= 0)
    const lastProgressIndex = progressIndexes[progressIndexes.length - 1]

    // The terminal progress event must reach done === total — the renderer
    // computes `syncing = done < total` from exactly this payload.
    expect(calls[lastProgressIndex][1]).toEqual({ done: 2, total: 2 })

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

    await HumbleLibrary.sync()

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

    await HumbleLibrary.sync()

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

  test('round 2: a sync where EVERY order fails schema parse commits nothing but pushes syncError=partial (empty list is never a silent success)', async () => {
    mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['drifted-gk'] })
    mockGetOrderDetail.mockResolvedValue({
      status: 'schema_error',
      raw: '<html>challenge</html>'
    })

    await expect(HumbleLibrary.sync()).resolves.toEqual({ status: 'partial' })

    expect(HumbleLibrary.getKeys()).toEqual([])
    const stateEvents = mockSendFrontendMessage.mock.calls.filter(
      (c) => c[0] === 'humbleSyncStateChanged'
    )
    expect(stateEvents).toHaveLength(1)
    expect(stateEvents[0][1]).toEqual(
      expect.objectContaining({
        syncError: 'partial',
        syncedAt: expect.any(Number)
      })
    )
  })

  test('loadCached() pushes only real cached keys from the file-backed store', async () => {
    mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['gk1'] })
    mockGetOrderDetail.mockResolvedValue({
      status: 'ok',
      data: makeRawOrder('gk1')
    })
    await HumbleLibrary.sync()
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
