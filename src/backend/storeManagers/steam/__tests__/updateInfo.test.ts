/** Phase 74 plan 11: getSteamUpdateInfo (cheap read, explicit size). */
import { getSteamUpdateInfo } from '../updateInfo'
import { detectSteamUpdates } from '../updateDetection'
import { estimateBridgeUpdate } from '../depotRust/updateEstimate'
import { getDiskInfo } from 'backend/utils/filesystem'
import { readAcfUpdateState } from '../library/acfUpdateState'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../games', () => ({
  __esModule: true,
  default: function SteamGame(this: { appId: string }, appId: string) {
    this.appId = appId
  }
}))
jest.mock('../updateDetection', () => ({
  detectSteamUpdates: jest.fn(),
  getLastKnownSteamUpdateState: (
    deps: { states: Map<string, unknown> },
    id: string
  ) => deps.states.get(id),
  STEAM_UPDATE_REFRESH_TIMEOUT_MS: 20000
}))
jest.mock('../library/acfUpdateState', () => ({
  ...jest.requireActual('../library/acfUpdateState'),
  readAcfUpdateState: jest.fn()
}))
jest.mock('../depotRust/updateEstimate', () => ({
  estimateBridgeUpdate: jest.fn(),
  resolveBridgeUpdateContext: () =>
    Promise.resolve({ steamappsDir: '/b/steamapps' })
}))
jest.mock('backend/utils/filesystem', () => ({ getDiskInfo: jest.fn() }))

const APP = '1603180'
const est = jest.mocked(estimateBridgeUpdate)
const disk = jest.mocked(getDiskInfo)
const detect = jest.mocked(detectSteamUpdates)

function deps(state?: Record<string, unknown>) {
  const states = new Map<string, unknown>()
  if (state) states.set(APP, { appId: APP, ...state })
  return { states, steamInstallRuntime: { updateStates: {} } } as never
}

const stale = {
  kind: 'bridge',
  state: 'stale',
  installedBuild: '1',
  targetBuild: '2',
  branch: 'public'
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(readAcfUpdateState).mockResolvedValue(null as never)
})

describe('getSteamUpdateInfo', () => {
  it('returns null for a non-numeric appId', async () => {
    expect(await getSteamUpdateInfo(deps(), 'abc')).toBeNull()
  })

  it('without computeSize never estimates', async () => {
    const info = await getSteamUpdateInfo(deps(stale), APP)
    expect(est).not.toHaveBeenCalled()
    expect(info).toMatchObject({ state: 'stale', targetBuild: '2' })
    expect(info?.estimate).toBeUndefined()
  })

  it('returns a cached estimate only for the matching target build', async () => {
    const e = {
      downloadBytes: 5,
      peakBytes: 9,
      oldManifestAvailable: true,
      computedAt: 1
    }
    const ok = await getSteamUpdateInfo(
      deps({ ...stale, estimate: { ...e, targetBuild: '2' } }),
      APP
    )
    expect(ok?.estimate).toEqual({
      downloadBytes: 5,
      peakBytes: 9,
      oldManifestAvailable: true,
      isEstimate: true
    })
    const old = await getSteamUpdateInfo(
      deps({ ...stale, estimate: { ...e, targetBuild: '1' } }),
      APP
    )
    expect(old?.estimate).toBeUndefined()
  })

  it('computeSize on a stale bridge game estimates once and fills freeBytes', async () => {
    est.mockResolvedValue({
      targetBuild: '2',
      downloadBytes: 10,
      peakBytes: 20,
      oldManifestAvailable: false,
      computedAt: 1
    })
    disk.mockResolvedValue({ freeSpace: 999, totalSpace: 1000 })
    const info = await getSteamUpdateInfo(deps(stale), APP, {
      computeSize: true
    })
    expect(est).toHaveBeenCalledTimes(1)
    expect(disk).toHaveBeenCalledTimes(1)
    expect(info?.estimate).toEqual({
      downloadBytes: 10,
      peakBytes: 20,
      oldManifestAvailable: false,
      isEstimate: true,
      freeBytes: 999
    })
  })

  it('leaves freeBytes undefined when getDiskInfo fails', async () => {
    est.mockResolvedValue({
      targetBuild: '2',
      downloadBytes: 1,
      peakBytes: 2,
      oldManifestAvailable: true,
      computedAt: 1
    })
    disk.mockRejectedValue(new Error('x'))
    const info = await getSteamUpdateInfo(deps(stale), APP, {
      computeSize: true
    })
    expect(info?.estimate?.freeBytes).toBeUndefined()
  })

  it('reports sizeError and no estimate on an estimate error', async () => {
    est.mockResolvedValue({ error: 'nope' })
    const info = await getSteamUpdateInfo(deps(stale), APP, {
      computeSize: true
    })
    expect(info?.sizeError).toBe('nope')
    expect(info?.estimate).toBeUndefined()
  })

  it('never estimates a registered game', async () => {
    detect.mockResolvedValue([
      { appId: APP, checkedAt: 1, ...stale, kind: 'registered' } as never
    ])
    const info = await getSteamUpdateInfo(
      deps({ ...stale, kind: 'registered' }),
      APP,
      { computeSize: true }
    )
    expect(est).not.toHaveBeenCalled()
    expect(info?.kind).toBe('registered')
  })

  it('re-reads a cached registered state from the ACF', async () => {
    detect.mockResolvedValue([
      {
        appId: APP,
        checkedAt: 1,
        ...stale,
        kind: 'registered',
        state: 'current'
      } as never
    ])
    const info = await getSteamUpdateInfo(
      deps({ ...stale, kind: 'registered' }),
      APP
    )
    expect(detect).toHaveBeenCalledWith(expect.anything(), {
      appIds: [APP],
      timeoutMs: 20000
    })
    expect(info?.state).toBe('current')
  })

  it('serves a cached registered state without detection while the ACF is unchanged', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue({
      buildid: '1',
      stateFlags: 4,
      bytesToDownload: 0,
      bytesDownloaded: 0,
      scheduledAutoUpdate: 0
    } as never)
    const info = await getSteamUpdateInfo(
      deps({ ...stale, kind: 'registered' }),
      APP
    )
    expect(detect).not.toHaveBeenCalled()
    expect(info).toMatchObject({ state: 'stale', targetBuild: '2' })
  })

  it('re-detects when the ACF build changed (Steam finished)', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue({
      buildid: '2',
      stateFlags: 4,
      bytesToDownload: 0,
      bytesDownloaded: 0,
      scheduledAutoUpdate: 0
    } as never)
    detect.mockResolvedValue([
      {
        appId: APP,
        checkedAt: 1,
        ...stale,
        kind: 'registered',
        state: 'current'
      } as never
    ])
    const info = await getSteamUpdateInfo(
      deps({ ...stale, kind: 'registered' }),
      APP
    )
    expect(detect).toHaveBeenCalledTimes(1)
    expect(detect).toHaveBeenCalledWith(expect.anything(), {
      appIds: [APP],
      timeoutMs: 20000
    })
    expect(info?.state).toBe('current')
  })

  it('serves a cached bridge state without detection', async () => {
    await getSteamUpdateInfo(deps(stale), APP)
    expect(detect).not.toHaveBeenCalled()
  })

  it('reports unknown with its reason', async () => {
    const info = await getSteamUpdateInfo(
      deps({
        kind: 'bridge',
        state: 'unknown',
        installedBuild: '1',
        branch: 'beta',
        reason: 'branch-unresolved'
      }),
      APP
    )
    expect(info).toMatchObject({
      state: 'unknown',
      reason: 'branch-unresolved'
    })
  })

  it('falls back to anonymous detection when nothing is cached', async () => {
    detect.mockResolvedValue([{ appId: APP, checkedAt: 1, ...stale } as never])
    const info = await getSteamUpdateInfo(deps(), APP)
    expect(detect).toHaveBeenCalledWith(expect.anything(), {
      appIds: [APP],
      timeoutMs: 20000
    })
    expect(info?.state).toBe('stale')
  })

  it('returns null when detection finds nothing', async () => {
    detect.mockResolvedValue([])
    expect(await getSteamUpdateInfo(deps(), APP)).toBeNull()
  })
})
