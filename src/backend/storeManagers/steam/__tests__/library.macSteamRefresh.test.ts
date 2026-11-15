/**
 * Phase 79-36: on macOS with cm=rust and a Refresh grant, refresh() tries the Mac Steam source
 * (steamcm_refresh with source macSteam) before any lease acquire and falls back to the CM path.
 */
import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
import { createInertTestSteamUser } from 'backend/testUtils/testSteamUser'
import type { SteamGameInfo } from 'common/types/steam'
import type { RefreshResult } from '../cm/steamCmTypes'

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
const env = { isMac: true }
jest.mock('backend/constants/environment', () => ({
  get isMac() {
    return env.isMac
  },
  isAppleSiliconMac: false,
  isWindows: false,
  isLinux: true
}))

jest.mock('../stores', () => ({
  steamLibraryStore: { get: jest.fn(), set: jest.fn() },
  steamMetadataStore: { get: jest.fn(), set: jest.fn(), entries: jest.fn() },
  steamSyncStore: { get: jest.fn(), set: jest.fn() }
}))
jest.mock('../bridge/allowlist', () => ({
  bridgeAllowlist: {
    has: jest.fn(),
    knownBadReason: jest.fn(),
    seedIds: jest.fn()
  }
}))
jest.mock('../bridgeBottle', () => ({
  createDrmBridgeRunners: () => ({}),
  listReadyBridgeBottleNames: jest.fn()
}))

jest.mock('../library/installedMap', () => ({
  buildInstalledMap: jest.fn(),
  buildIncompleteInstallSet: jest.fn(),
  buildBottleInstalledMap: jest.fn(),
  buildBridgeInstalledMap: jest.fn(),
  installVersionField: jest.fn()
}))

import { refresh } from '../library/refresh'
import { createRustCmClient } from '../cm/RustCmClient'
import { bridgeAllowlist } from '../bridge/allowlist'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import {
  buildIncompleteInstallSet,
  buildInstalledMap
} from '../library/installedMap'
import { RUST_STEAMCM_REFRESH } from 'common/types/sidecarTransport'
import { logInfo } from 'backend/logger'

const stores =
  jest.requireMock<
    Record<
      'steamLibraryStore' | 'steamSyncStore' | 'steamMetadataStore',
      Record<'get' | 'set' | 'entries', jest.Mock>
    >
  >('../stores')
const sendFrontendMessage = jest.fn()
const requestRustInvoke = jest.fn()
const release = jest.fn()
const getUserOwnedApps = jest.fn()

const rustClient = createRustCmClient({ requestRustInvoke } as never, {
  leaseId: 7,
  steamId: '76561198000000001',
  licenses: []
})
;(rustClient as unknown as Record<string, unknown>).getUserOwnedApps =
  getUserOwnedApps

const persistedId = jest.fn()
const steamUser = createInertTestSteamUser({
  acquireAuthenticated: jest.fn(),
  acquireOpenAuthenticated: jest.fn(),
  getPersistedSteamId64: persistedId
})
const deps = createTestManagerDeps({
  stores: createTestStores({ steam: stores as never }),
  sendFrontendMessage,
  requestRustInvoke: requestRustInvoke as never,
  steamBottle: { isSteamBottleProvisioned: () => false } as never,
  steamUser,
  paths: { steamBridgeHelperPath: '/helper/steam-bridge-helper' } as never
})

const game = (id: string): SteamGameInfo =>
  ({
    runner: 'steam',
    app_name: id,
    title: `Game ${id}`,
    art_cover: '',
    art_square: '',
    is_installed: false,
    install: {},
    extra: { reqs: [] },
    canRunOffline: true,
    installable: true
  }) as unknown as SteamGameInfo

const refreshResult = (games: SteamGameInfo[]): RefreshResult => ({
  games,
  metadataUpdates: {},
  ownedCount: games.length,
  demoCount: 0,
  demosFailed: false,
  capture: {
    platforms: { scoped: 0, captured: 0, skipped: 0, failed: false },
    metacritic: { scoped: 0, captured: 0, skipped: 0, failed: false },
    anonCount: 0,
    heldCount: 0
  },
  enrich: {
    attempted: 0,
    enriched: 0,
    delisted: 0,
    failed: 0,
    rateLimited: false,
    budgetHit: false,
    notReached: []
  },
  source: 'macSteam'
})

const syncEmits = () =>
  sendFrontendMessage.mock.calls
    .filter((c) => c[0] === 'steamSyncStatus')
    .map((c) => c[1] as unknown)

const arm = () => {
  deps.steamSession.authTrigger.resetSteamAuthTrigger()
  deps.steamSession.authTrigger.noteRefreshTrigger(
    'steam',
    'action-icons-refresh-button'
  )
}

const ID = '76561198000000001'

describe('refresh() Mac Steam path', () => {
  const prev = process.env.GAMELIB_STEAMCM_CM
  const prevMac = process.env.GAMELIB_STEAM_MAC_PATH
  beforeAll(() => {
    process.env.GAMELIB_STEAMCM_CM = 'rust'
    process.env.GAMELIB_STEAM_MAC_PATH = 'on'
  })
  afterAll(() => {
    if (prev === undefined) delete process.env.GAMELIB_STEAMCM_CM
    else process.env.GAMELIB_STEAMCM_CM = prev
    if (prevMac === undefined) delete process.env.GAMELIB_STEAM_MAC_PATH
    else process.env.GAMELIB_STEAM_MAC_PATH = prevMac
  })

  beforeEach(() => {
    jest.clearAllMocks()
    env.isMac = true
    persistedId.mockReturnValue(ID)
    deps.steamSession.libraryState.library.clear()
    arm()
    stores.steamMetadataStore.entries.mockReturnValue([])
    stores.steamLibraryStore.get.mockReturnValue([])
    jest.mocked(buildInstalledMap).mockResolvedValue(new Map())
    jest.mocked(buildIncompleteInstallSet).mockResolvedValue(new Set())
    jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
    jest.mocked(bridgeAllowlist.seedIds).mockReturnValue([])
    jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
      ok: true,
      client: rustClient,
      release
    } as never)
  })

  it('ok: applies the result, never acquires a lease, logs the no-logon line', async () => {
    requestRustInvoke.mockResolvedValue({
      ok: true,
      result: refreshResult([game('1'), game('2')])
    })

    const out = await refresh(deps)

    expect(out?.stdout).toBe('2 games synced')
    expect(steamUser.acquireAuthenticated).not.toHaveBeenCalled()
    expect(requestRustInvoke).toHaveBeenCalledTimes(1)
    expect(requestRustInvoke).toHaveBeenCalledWith(RUST_STEAMCM_REFRESH, [
      expect.objectContaining({
        source: {
          kind: 'macSteam',
          helperPath: '/helper/steam-bridge-helper',
          steamId: ID
        },
        isMac: true
      })
    ])
    expect(logInfo).toHaveBeenCalledWith(
      'Steam Refresh: Mac Steam path ok games=2 demos=0 (no CM logon)',
      'Steam'
    )
    expect(stores.steamLibraryStore.set).toHaveBeenCalledWith('games', [
      expect.objectContaining({ app_name: '1' }),
      expect.objectContaining({ app_name: '2' })
    ])
    expect(syncEmits()).toEqual([{ status: 'syncing' }, { status: 'idle' }])
  })

  it('macFallback: logs the reason, then runs the CM path with source cm', async () => {
    requestRustInvoke
      .mockResolvedValueOnce({
        ok: false,
        kind: 'macFallback',
        reason: 'account-mismatch'
      })
      .mockResolvedValueOnce({ ok: true, result: refreshResult([game('1')]) })

    const out = await refresh(deps)

    expect(out?.stdout).toBe('1 games synced')
    expect(logInfo).toHaveBeenCalledWith(
      'Steam Refresh: Mac Steam path unavailable (account-mismatch), using CM',
      'Steam'
    )
    expect(steamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
    expect(requestRustInvoke).toHaveBeenCalledTimes(2)
    expect(requestRustInvoke).toHaveBeenLastCalledWith(RUST_STEAMCM_REFRESH, [
      expect.objectContaining({
        source: { kind: 'cm', leaseId: 7, steamId: ID }
      })
    ])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('a transport rejection on the Mac attempt also falls back to CM', async () => {
    requestRustInvoke
      .mockRejectedValueOnce(new Error('sidecar gone'))
      .mockResolvedValueOnce({ ok: true, result: refreshResult([]) })
    await refresh(deps)
    expect(steamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
  })

  const sentSources = () =>
    requestRustInvoke.mock.calls.map(
      (c) =>
        (
          (c[1] as Array<{ source: { kind: string } }>)[0] as never as {
            source: { kind: string }
          }
        ).source.kind
    )

  it('never sends macSteam off macOS, with cm=ts, without a stored SteamID or without a grant', async () => {
    requestRustInvoke.mockResolvedValue({ ok: true, result: refreshResult([]) })

    env.isMac = false
    await refresh(deps)
    expect(sentSources()).toEqual(['cm'])

    jest.clearAllMocks()
    env.isMac = true
    arm()
    persistedId.mockReturnValue(undefined)
    requestRustInvoke.mockResolvedValue({ ok: true, result: refreshResult([]) })
    await refresh(deps)
    expect(sentSources()).toEqual(['cm'])

    jest.clearAllMocks()
    persistedId.mockReturnValue(ID)
    deps.steamSession.authTrigger.resetSteamAuthTrigger()
    jest.mocked(steamUser.acquireOpenAuthenticated).mockResolvedValue(null)
    await refresh(deps)
    expect(requestRustInvoke).not.toHaveBeenCalled()

    jest.clearAllMocks()
    process.env.GAMELIB_STEAMCM_CM = 'ts'
    try {
      arm()
      getUserOwnedApps.mockRejectedValue(new Error('ts path'))
      jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
        ok: true,
        client: rustClient,
        release
      } as never)
      await refresh(deps)
      expect(requestRustInvoke).not.toHaveBeenCalled()
    } finally {
      process.env.GAMELIB_STEAMCM_CM = 'rust'
    }
  })

  it('is off by default: without GAMELIB_STEAM_MAC_PATH=on a Mac Refresh goes straight to CM', async () => {
    // UAT-B item 14: the helper shows "playing Spacewar" in Friends, so the Mac path is opt-in.
    delete process.env.GAMELIB_STEAM_MAC_PATH
    try {
      requestRustInvoke.mockResolvedValue({
        ok: true,
        result: refreshResult([])
      })
      await refresh(deps)
      expect(sentSources()).toEqual(['cm'])
    } finally {
      process.env.GAMELIB_STEAM_MAC_PATH = 'on'
    }
  })
})
