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

jest.mock('electron-store')

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
    expect((keys as Array<{ gamekey: string }>).map((k) => k.gamekey)).toEqual(
      ['gk1']
    )
  })
})
