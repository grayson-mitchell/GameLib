/**
 * Phase 79-31: refresh() on cm=rust is one steamcm_refresh call plus TS persistence.
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
const env = { isMac: false }
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
jest.mock('../bridge/launchTarget', () => ({
  backfillBridgeLaunchTargets: jest.fn()
}))
jest.mock('../platformCapture', () => ({
  createPlatformCaptureQueue: () => ({
    withPlatformCaptureLock: <T>(section: () => Promise<T>) => section()
  })
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
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { bridgeAllowlist } from '../bridge/allowlist'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import {
  buildBridgeInstalledMap,
  buildIncompleteInstallSet,
  buildInstalledMap
} from '../library/installedMap'
import { RUST_STEAMCM_REFRESH } from 'common/types/sidecarTransport'

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

const steamUser = createInertTestSteamUser({
  acquireAuthenticated: jest.fn(),
  acquireOpenAuthenticated: jest.fn()
})

// Typed jest.fn handles for the double's methods and the mocked allowlist: reading them off the
// typed objects trips @typescript-eslint/unbound-method at every use.
const steamUserMocks = steamUser as unknown as Record<
  'acquireAuthenticated' | 'acquireOpenAuthenticated',
  jest.Mock
>
const allowlistMocks = bridgeAllowlist as unknown as { seedIds: jest.Mock }
const deps = createTestManagerDeps({
  stores: createTestStores({ steam: stores as never }),
  sendFrontendMessage,
  requestRustInvoke: requestRustInvoke as never,
  steamBottle: { isSteamBottleProvisioned: () => false } as never,
  steamUser
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
  source: 'cm'
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

describe('refresh() with cm=rust', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    env.isMac = false
    deps.steamSession.libraryState.library.clear()
    arm()
    stores.steamMetadataStore.entries.mockReturnValue([])
    stores.steamLibraryStore.get.mockReturnValue([])
    jest.mocked(buildInstalledMap).mockResolvedValue(new Map())
    jest.mocked(buildIncompleteInstallSet).mockResolvedValue(new Set())
    jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
    allowlistMocks.seedIds.mockReturnValue([])
    steamUserMocks.acquireAuthenticated.mockResolvedValue({
      ok: true,
      client: rustClient,
      release
    } as never)
  })

  it('acquires the lease, makes one steamcm_refresh call and persists the replayed games', async () => {
    requestRustInvoke.mockResolvedValue({
      ok: true,
      result: refreshResult([game('1'), game('2')])
    })

    const out = await refresh(deps)

    expect(out?.stdout).toBe('2 games synced')
    expect(requestRustInvoke).toHaveBeenCalledTimes(1)
    expect(requestRustInvoke).toHaveBeenCalledWith(RUST_STEAMCM_REFRESH, [
      expect.objectContaining({
        source: { kind: 'cm', leaseId: 7, steamId: '76561198000000001' },
        isMac: false
      })
    ])
    expect(stores.steamLibraryStore.set).toHaveBeenCalledWith('games', [
      expect.objectContaining({ app_name: '1' }),
      expect.objectContaining({ app_name: '2' })
    ])
    expect(syncEmits()).toEqual([{ status: 'syncing' }, { status: 'idle' }])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('does no TS-side CM work', async () => {
    requestRustInvoke.mockResolvedValue({
      ok: true,
      result: refreshResult([])
    })
    await refresh(deps)
    expect(getUserOwnedApps).not.toHaveBeenCalled()
  })

  it('{ok:false} restores the cached library and emits failed/owned-apps-failed, releasing the lease', async () => {
    stores.steamLibraryStore.get.mockReturnValue([game('9')])
    requestRustInvoke.mockResolvedValue({ ok: false, kind: 'ownedFailed' })

    const out = await refresh(deps)

    expect(out).toEqual({ stdout: '', stderr: 'ownedFailed' })
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: '9' })
    )
    expect(syncEmits()).toEqual([
      { status: 'syncing' },
      { status: 'failed', reason: 'owned-apps-failed' }
    ])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('a throw while applying emits failed/sync-failed, rethrows and never emits idle', async () => {
    requestRustInvoke.mockResolvedValue({
      ok: true,
      result: refreshResult([game('1')])
    })
    stores.steamSyncStore.set.mockImplementation(() => {
      throw new Error('disk full')
    })

    await expect(refresh(deps)).rejects.toThrow('disk full')

    expect(syncEmits()).toEqual([
      { status: 'syncing' },
      { status: 'failed', reason: 'sync-failed' }
    ])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('no grant and no open session: deferral with no op call', async () => {
    deps.steamSession.authTrigger.resetSteamAuthTrigger()
    steamUserMocks.acquireOpenAuthenticated.mockResolvedValue(null)

    const out = await refresh(deps)

    expect(out).toBeNull()
    expect(requestRustInvoke).not.toHaveBeenCalled()
    expect(syncEmits()).toEqual([{ status: 'idle' }])
  })

  it('backfills bridge launch targets after the op on the same lease, and a rejection never fails Refresh', async () => {
    env.isMac = true
    jest.mocked(listReadyBridgeBottleNames).mockReturnValue(['b'])
    jest
      .mocked(buildBridgeInstalledMap)
      .mockResolvedValue(new Map([[5, { installPath: '/p', sizeOnDisk: '1' }]]))
    jest
      .mocked(backfillBridgeLaunchTargets)
      .mockRejectedValue(new Error('backfill boom'))
    requestRustInvoke.mockResolvedValue({
      ok: true,
      result: refreshResult([])
    })

    const out = await refresh(deps)

    expect(out?.stderr).toBe('')
    expect(backfillBridgeLaunchTargets).toHaveBeenCalledWith(deps, rustClient, [
      '5'
    ])
    expect(requestRustInvoke.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      jest.mocked(backfillBridgeLaunchTargets).mock.invocationCallOrder[0] ?? 0
    )
  })
})

// Plan 80-26: the polls flag now defaults to rust; this file exercises the ts arm, so pin it.
const prevPollsImpl = process.env.GAMELIB_STEAM_POLLS
beforeAll(() => {
  process.env.GAMELIB_STEAM_POLLS = 'ts'
})
afterAll(() => {
  if (prevPollsImpl === undefined) delete process.env.GAMELIB_STEAM_POLLS
  else process.env.GAMELIB_STEAM_POLLS = prevPollsImpl
})
