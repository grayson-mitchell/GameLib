/**
 * Phase 79-32 (D-12): the lazy per-game enrichment and the install-size estimate on cm=rust.
 */
import { createTestManagerDeps } from 'backend/testUtils/testServices'
import type { SteamGameInfo } from 'common/types/steam'

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

jest.mock('backend/utils', () => ({ getFileSize: jest.fn() }))
jest.mock('axios')
jest.mock('../macArchKnownFix', () => ({ knownFixSaysMac32: jest.fn() }))
jest.mock('../cm/steamCmFlags', () => ({ steamCmImpl: jest.fn() }))

import axios from 'axios'
import { getFileSize } from 'backend/utils'
import { fetchMetadataIfNeeded } from '../gameMetadata'
import { getSteamInstallSize } from '../gameRequirements'
import { knownFixSaysMac32 } from '../macArchKnownFix'
import { steamCmImpl } from '../cm/steamCmFlags'
import type SteamGame from '../games'

const APP_ID = '440'
const current = {
  app_name: APP_ID,
  title: 'Team Fortress 2',
  extra: { reqs: [] }
} as unknown as SteamGameInfo
const game = { ...current, art_cover: 'c', is_delisted: false } as SteamGameInfo
const entry = { art_cover: 'c', art_square: 's', extra: { reqs: [] } }

function setup(rust: unknown) {
  const metaStore = new Map<string, unknown>()
  const library = new Map<string, SteamGameInfo>()
  const pending = new Set<string>()
  const sent: Array<[string, unknown]> = []
  const requestRustInvoke = jest.fn().mockImplementation(() => rust)
  const base = createTestManagerDeps({
    requestRustInvoke: requestRustInvoke as never,
    sendFrontendMessage: ((ch: string, p: unknown) => {
      sent.push([ch, p])
    }) as never
  })
  const release = jest.fn()
  const deps = {
    ...base,
    stores: {
      ...base.stores,
      steam: {
        ...base.stores.steam,
        steamMetadataStore: {
          get: (k: string) => metaStore.get(k),
          set: (k: string, v: unknown) => metaStore.set(k, v)
        }
      }
    },
    steamSession: {
      ...base.steamSession,
      libraryState: {
        ...base.steamSession.libraryState,
        library,
        pendingFetches: pending,
        acquireMetadataSlot: async () => undefined,
        releaseMetadataSlot: release
      }
    }
  }
  const steamGame = { appId: APP_ID, deps } as unknown as SteamGame
  return {
    steamGame,
    deps,
    metaStore,
    library,
    pending,
    sent,
    release,
    requestRustInvoke
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getFileSize as jest.Mock).mockImplementation((n: number) => `${n}B`)
  ;(steamCmImpl as jest.Mock).mockReturnValue('rust')
  ;(knownFixSaysMac32 as jest.Mock).mockReturnValue(false)
})

describe('fetchMetadataIfNeeded on cm=rust', () => {
  it('persists and pushes an enriched result, without axios', async () => {
    const t = setup(
      Promise.resolve({ ok: true, result: { kind: 'enriched', entry, game } })
    )
    await fetchMetadataIfNeeded(t.steamGame, current)
    expect(t.metaStore.get(APP_ID)).toEqual(entry)
    expect(t.library.get(APP_ID)).toEqual(game)
    expect(t.sent).toContainEqual(['pushGameToLibrary', game])
    expect(axios.get).not.toHaveBeenCalled()
    expect(t.requestRustInvoke).toHaveBeenCalledWith('steamcm_store_enrich', [
      { appId: APP_ID, cached: null, current, knownFixMac32: false }
    ])
  })

  it('writes a delisted result the same way', async () => {
    const delisted = { ...game, is_delisted: true }
    const t = setup(
      Promise.resolve({
        ok: true,
        result: {
          kind: 'delisted',
          entry: { ...entry, is_delisted: true },
          game: delisted
        }
      })
    )
    await fetchMetadataIfNeeded(t.steamGame, current)
    expect(t.metaStore.get(APP_ID)).toEqual({ ...entry, is_delisted: true })
    expect(t.sent).toContainEqual(['pushGameToLibrary', delisted])
  })

  it('sends cached and knownFixMac32 to Rust', async () => {
    ;(knownFixSaysMac32 as jest.Mock).mockReturnValue(true)
    const t = setup(Promise.resolve({ ok: true, result: { kind: 'noData' } }))
    t.metaStore.set(APP_ID, entry)
    await fetchMetadataIfNeeded(t.steamGame, current)
    expect(t.requestRustInvoke).toHaveBeenCalledWith('steamcm_store_enrich', [
      { appId: APP_ID, cached: entry, current, knownFixMac32: true }
    ])
  })

  it.each([
    ['noData', Promise.resolve({ ok: true, result: { kind: 'noData' } })],
    ['failure', Promise.resolve({ ok: false, kind: 'httpError' })],
    ['rejection', Promise.reject(new Error('boom'))]
  ])('writes nothing on %s and still releases the slot', async (_n, rust) => {
    const t = setup(rust)
    await fetchMetadataIfNeeded(t.steamGame, current)
    expect(t.metaStore.size).toBe(0)
    expect(t.library.size).toBe(0)
    expect(t.release).toHaveBeenCalledTimes(1)
    expect(t.pending.size).toBe(0)
    expect(t.sent).toContainEqual(['steamMetadataSyncing', { syncing: false }])
  })
})

describe('getSteamInstallSize on cm=rust', () => {
  it('formats storageBytes from the appdetails op', async () => {
    const t = setup(
      Promise.resolve({ ok: true, result: { storageBytes: 2048 } })
    )
    await expect(getSteamInstallSize(APP_ID, undefined, t.deps)).resolves.toBe(
      '2048B'
    )
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('falls back to ?? MB without a figure or on failure', async () => {
    const a = setup(
      Promise.resolve({ ok: true, result: { storageBytes: null } })
    )
    await expect(getSteamInstallSize(APP_ID, undefined, a.deps)).resolves.toBe(
      '?? MB'
    )
    const b = setup(Promise.resolve({ ok: false, kind: 'httpError' }))
    await expect(getSteamInstallSize(APP_ID, undefined, b.deps)).resolves.toBe(
      '?? MB'
    )
    expect(axios.get).not.toHaveBeenCalled()
  })
})
