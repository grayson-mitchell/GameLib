/** Phase 74 plan 10: estimateBridgeUpdate sums the per-depot delta estimates (D-09/D-13/D-14). */
import { estimateBridgeUpdate } from '../updateEstimate'
import { summarizeDepots } from '../rustDepot'
import { buildDepotRefs, getDepotClient } from '../../depot/plan'
import { getContentServerHosts } from '../../depot/contentServers'
import { readAcfBetaKey } from '../../depot/betaBranch'
import { getBottleSteamappsDir } from '../../bottle'
import { findBridgeInstallBottle } from '../../bridgeBottle'
import { readAcfInstalledDepots } from '../../acfInstalledDepots'
import { readAcfInstalldir } from '../../acfInstalldir'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../rustDepot', () => ({ summarizeDepots: jest.fn() }))
jest.mock('../install', () => ({ requestCodeRefresher: jest.fn() }))
jest.mock('../../depot/cdnAuth', () => ({ CdnAuthTokenCache: jest.fn() }))
jest.mock('../../depot/contentServers', () => ({
  getContentServerHosts: jest.fn()
}))
jest.mock('../../depot/plan', () => ({
  assertNumericAppId: jest.fn(),
  buildDepotRefs: jest.fn(),
  getDepotClient: jest.fn(),
  throwIfAborted: jest.fn()
}))
jest.mock('../../depot/betaBranch', () => ({
  readAcfBetaKey: jest.fn()
}))
jest.mock('../../acfInstalldir', () => ({ readAcfInstalldir: jest.fn() }))
jest.mock('../../acfInstalledDepots', () => ({
  readAcfInstalledDepots: jest.fn()
}))
jest.mock('../../bridgeBottle', () => ({ findBridgeInstallBottle: jest.fn() }))
jest.mock('../../bottle', () => ({
  getBottleSteamappsDir: jest.fn()
}))

const GB = 1024 ** 3
const OLD_GID = '7234567890123456789'
const release = jest.fn()
const dispose = jest.fn()
const setEstimate = jest.fn()
const acquireAuthenticated = jest.fn()
const registerActiveDepotJob = jest.fn()
const game = {
  appId: '12345',
  deps: {
    paths: {},
    config: {},
    steamUser: { acquireAuthenticated },
    steamInstallRuntime: {
      cdnSchema: {},
      updateStates: { setEstimate },
      depotJobs: {
        transport: {},
        registerActiveDepotJob
      }
    }
  }
} as never

const delta = (changedBytes: number, maxDownloadBytes: number, old = true) => ({
  oldManifestAvailable: old,
  changedBytes,
  maxDownloadBytes,
  changedFiles: 1,
  removedFiles: 0
})

describe('estimateBridgeUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    registerActiveDepotJob.mockReturnValue(dispose)
    jest.mocked(getDepotClient).mockReturnValue({} as never)
    jest.mocked(getContentServerHosts).mockResolvedValue({
      hosts: [],
      weightedLoads: new Map(),
      hostMeta: new Map()
    })
    jest.mocked(readAcfBetaKey).mockReturnValue(undefined)
    jest.mocked(getBottleSteamappsDir).mockReturnValue('/b/steamapps')
    acquireAuthenticated.mockResolvedValue({ ok: true, release })
    jest.mocked(findBridgeInstallBottle).mockReturnValue('bottle')
    jest.mocked(readAcfInstalldir).mockResolvedValue('Game')
    jest.mocked(readAcfInstalledDepots).mockReturnValue({
      buildid: '1',
      installedDepots: [
        { depotId: '100', manifest: OLD_GID, size: '1' },
        { depotId: '101', manifest: '2', size: '1' }
      ]
    })
    jest.mocked(buildDepotRefs).mockResolvedValue({
      buildid: '999',
      branch: 'public',
      depots: [
        {
          depotId: '100',
          gid: '9',
          key: Buffer.alloc(32),
          ownerAppId: '12345'
        },
        { depotId: '101', gid: '8', key: Buffer.alloc(32), ownerAppId: '12345' }
      ]
    } as never)
  })

  it('sums peak over a manifest pair and records the estimate', async () => {
    jest.mocked(summarizeDepots).mockResolvedValue({
      skippedDepots: [],
      depots: [{ delta: delta(10 * GB, 600) }, { delta: delta(3 * GB, 300) }]
    } as never)
    const r = await estimateBridgeUpdate(game, {})
    expect(r).toMatchObject({
      peakBytes: 13 * GB,
      downloadBytes: 900,
      oldManifestAvailable: true,
      targetBuild: '999'
    })
    expect(setEstimate).toHaveBeenCalledWith(
      '12345',
      expect.objectContaining({ targetBuild: '999' })
    )
  })

  it('unattended omits guidedAction from the lease; a user run asks for install', async () => {
    acquireAuthenticated.mockResolvedValue({ ok: false, reason: 'no-session' })
    await estimateBridgeUpdate(game, { unattended: true })
    expect(acquireAuthenticated.mock.calls[0]?.[0]).not.toHaveProperty(
      'guidedAction'
    )
    expect(acquireAuthenticated.mock.calls[0]?.[0]).toMatchObject({
      reason: 'user-install'
    })
    acquireAuthenticated.mockClear()
    await estimateBridgeUpdate(game, {})
    expect(acquireAuthenticated.mock.calls[0]?.[0]).toMatchObject({
      guidedAction: 'install'
    })
  })

  it('a missing old manifest degrades to max-changed and flags it', async () => {
    jest.mocked(summarizeDepots).mockResolvedValue({
      skippedDepots: [],
      depots: [
        { delta: delta(10 * GB, 600) },
        { delta: delta(3 * GB, 300, false) }
      ]
    } as never)
    const r = await estimateBridgeUpdate(game, {})
    expect(r).toMatchObject({
      oldManifestAvailable: false,
      peakBytes: 10 * GB,
      downloadBytes: 900
    })
  })

  it('adds a depot new in this build to download and peak', async () => {
    jest.mocked(summarizeDepots).mockResolvedValue({
      skippedDepots: [],
      depots: [
        { delta: delta(10 * GB, 600) },
        { delta: delta(3 * GB, 300) },
        { totalBytes: 1000 }
      ]
    } as never)
    const r = await estimateBridgeUpdate(game, {})
    expect(r).toMatchObject({
      downloadBytes: 1900,
      peakBytes: 13 * GB + 1000,
      oldManifestAvailable: true
    })
  })

  it('a new depot alongside a missing old manifest still flags it', async () => {
    jest.mocked(summarizeDepots).mockResolvedValue({
      skippedDepots: [],
      depots: [{ delta: delta(10 * GB, 600, false) }, { totalBytes: 500 }]
    } as never)
    const r = await estimateBridgeUpdate(game, {})
    expect(r).toMatchObject({
      oldManifestAvailable: false,
      peakBytes: 10 * GB + 500,
      downloadBytes: 1100
    })
  })

  it('a summary error returns the error and stores nothing', async () => {
    jest
      .mocked(summarizeDepots)
      .mockResolvedValue({ error: { kind: 'x', message: 'boom' } } as never)
    expect(await estimateBridgeUpdate(game, {})).toEqual({ error: 'boom' })
    expect(setEstimate).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('sends the exact ACF GID strings as fromManifest', async () => {
    jest
      .mocked(summarizeDepots)
      .mockResolvedValue({ skippedDepots: [], depots: [] } as never)
    await estimateBridgeUpdate(game, {})
    const req = jest.mocked(summarizeDepots).mock.calls[0]![1]
    expect(req.depots.map((d) => d.fromManifest)).toEqual([OLD_GID, '2'])
  })

  it('releases the lease and disposes the job when the summary throws', async () => {
    jest.mocked(summarizeDepots).mockRejectedValue(new Error('x'))
    expect(await estimateBridgeUpdate(game, {})).toEqual({ error: 'x' })
    expect(release).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
