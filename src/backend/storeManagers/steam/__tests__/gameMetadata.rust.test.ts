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
jest.mock('../macArchKnownFix', () => ({ knownFixSaysMac32: jest.fn() }))

import { getFileSize } from 'backend/utils'
import { fetchMetadataIfNeeded } from '../gameMetadata'
import { getSteamInstallSize } from '../gameRequirements'
import { knownFixSaysMac32 } from '../macArchKnownFix'
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
        acquireMetadataSlot: () => Promise.resolve(undefined),
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
  ;(knownFixSaysMac32 as jest.Mock).mockReturnValue(false)
})

describe('fetchMetadataIfNeeded on cm=rust', () => {
  it('WR-03/T-06-01: a non-numeric appId is rejected before any Rust call', async () => {
    const t = setup(Promise.resolve({ ok: true, result: { kind: 'noData' } }))
    ;(t.steamGame as unknown as { appId: string }).appId = '../../etc/passwd'
    await fetchMetadataIfNeeded(t.steamGame, current)
    expect(t.requestRustInvoke).not.toHaveBeenCalled()
  })

  it('persists and pushes an enriched result', async () => {
    const t = setup(
      Promise.resolve({ ok: true, result: { kind: 'enriched', entry, game } })
    )
    await fetchMetadataIfNeeded(t.steamGame, current)
    expect(t.metaStore.get(APP_ID)).toEqual(entry)
    expect(t.library.get(APP_ID)).toEqual(game)
    expect(t.sent).toContainEqual(['pushGameToLibrary', game])
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

describe('fetchMetadataIfNeeded against a concurrent metadata write (C1/WR-04)', () => {
  const captured = { ...entry, platformsCaptured: true, mac_arch: '64' }
  const enriched = (e: unknown) =>
    Promise.resolve({ ok: true, result: { kind: 'enriched', entry: e, game } })

  it('does not write a merge built before a Refresh capture landed, and re-runs it on the captured entry', async () => {
    const t = setup(undefined)
    const merged = { ...captured, art_cover: 'merged' }
    t.requestRustInvoke
      .mockImplementationOnce(() => {
        // A Refresh's PICS capture writes the entry while the fetch is out.
        t.metaStore.set(APP_ID, captured)
        return enriched({ ...entry, art_cover: 'from-stale-snapshot' })
      })
      .mockImplementationOnce(() => enriched(merged))

    await fetchMetadataIfNeeded(t.steamGame, current)

    expect(t.metaStore.get(APP_ID)).toEqual(merged)
    expect(t.requestRustInvoke).toHaveBeenCalledTimes(2)
    expect(t.requestRustInvoke).toHaveBeenLastCalledWith(
      'steamcm_store_enrich',
      [expect.objectContaining({ cached: captured })]
    )
  })

  it('gives up without writing when the entry keeps changing', async () => {
    const t = setup(undefined)
    let n = 0
    t.requestRustInvoke.mockImplementation(() => {
      n++
      t.metaStore.set(APP_ID, { ...captured, art_cover: `refresh-${n}` })
      return enriched({ ...entry, art_cover: 'stale' })
    })

    await fetchMetadataIfNeeded(t.steamGame, current)

    expect(t.requestRustInvoke).toHaveBeenCalledTimes(2)
    expect(t.metaStore.get(APP_ID)).toEqual({
      ...captured,
      art_cover: 'refresh-2'
    })
    expect(t.library.size).toBe(0)
    expect(t.release).toHaveBeenCalledTimes(1)
  })

  it('checks and writes inside the platform-capture lock', async () => {
    const t = setup(enriched(entry))
    const lock = jest.spyOn(
      t.deps.steamLaunchRuntime.platformCapture,
      'withPlatformCaptureLock'
    )
    await fetchMetadataIfNeeded(t.steamGame, current)
    expect(lock).toHaveBeenCalledTimes(1)
    expect(t.metaStore.get(APP_ID)).toEqual(entry)
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
  })
})
