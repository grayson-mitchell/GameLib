/** Phase 74 plan 10: estimateBridgeUpdate sums the per-depot delta estimates (D-09/D-13/D-14). */
import { estimateBridgeUpdate, ESTIMATE_TIMEOUT_MS } from '../updateEstimate'
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
    jest.mocked(readAcfBetaKey).mockResolvedValue(undefined)
    jest.mocked(getBottleSteamappsDir).mockReturnValue('/b/steamapps')
    acquireAuthenticated.mockResolvedValue({ ok: true, release })
    jest.mocked(findBridgeInstallBottle).mockReturnValue('bottle')
    jest.mocked(readAcfInstalldir).mockResolvedValue('Game')
    jest.mocked(readAcfInstalledDepots).mockResolvedValue({
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

  it('quick 261120-tbr: passes the ACF installed depot ids to buildDepotRefs', async () => {
    jest.mocked(summarizeDepots).mockResolvedValue({
      skippedDepots: [],
      depots: [{ delta: delta(10 * GB, 600) }, { delta: delta(3 * GB, 300) }]
    } as never)
    await estimateBridgeUpdate(game, {})
    expect(buildDepotRefs).toHaveBeenCalledWith(
      '12345',
      expect.objectContaining({ installedDepotIds: new Set(['100', '101']) })
    )
  })

  it('261122-rgi: forwards chosenOptInDlc into buildDepotRefs, and omits it when absent', async () => {
    jest.mocked(summarizeDepots).mockResolvedValue({
      skippedDepots: [],
      depots: [{ delta: delta(10 * GB, 600) }, { delta: delta(3 * GB, 300) }]
    } as never)
    await estimateBridgeUpdate(game, { chosenOptInDlc: new Set(['313250']) })
    expect(buildDepotRefs).toHaveBeenLastCalledWith(
      '12345',
      expect.objectContaining({ chosenOptInDlc: new Set(['313250']) })
    )
    await estimateBridgeUpdate(game, {})
    expect(
      jest.mocked(buildDepotRefs).mock.calls.at(-1)?.[1]
    ).not.toHaveProperty('chosenOptInDlc')
  })

  it.each([[true], [false]])(
    'the lease opts are exactly the reason and appName (unattended=%s)',
    async (unattended) => {
      acquireAuthenticated.mockResolvedValue({
        ok: false,
        reason: 'no-session'
      })
      await estimateBridgeUpdate(game, { unattended })
      expect(acquireAuthenticated.mock.calls[0]?.[0]).toEqual({
        reason: 'user-install',
        appName: '12345'
      })
    }
  )

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
    expect(req.jobId).toMatch(/^summary-12345-/)
  })

  it('exports a 60 s timeout', () => {
    expect(ESTIMATE_TIMEOUT_MS).toBe(60_000)
  })

  it('concurrent estimates register distinct keys and each request carries its own', async () => {
    let release2!: () => void
    const gate = new Promise<void>((r) => (release2 = r))
    jest.mocked(summarizeDepots).mockImplementation(async () => {
      await gate
      return { skippedDepots: [], depots: [] } as never
    })
    const a = estimateBridgeUpdate(game, {})
    const b = estimateBridgeUpdate(game, {})
    while (jest.mocked(summarizeDepots).mock.calls.length < 2)
      await new Promise((r) => setImmediate(r))
    release2()
    await Promise.all([a, b])
    const keys = registerActiveDepotJob.mock.calls.map((c) => c[0] as string)
    expect(new Set(keys).size).toBe(2)
    for (const [i, k] of keys.entries()) {
      expect(k).toMatch(/^summary-12345-/)
      expect(jest.mocked(summarizeDepots).mock.calls[i]![1].jobId).toBe(k)
    }
  })

  it('a stalled summary times out, releasing the lease and disposing', async () => {
    jest.mocked(summarizeDepots).mockReturnValue(new Promise(() => {}))
    const r = await estimateBridgeUpdate(game, { timeoutMs: 20 })
    expect(r).toMatchObject({ error: expect.stringContaining('timed out') })
    expect(release).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(setEstimate).not.toHaveBeenCalled()
  })

  it('a caller abort mid-summary returns an error without claiming a timeout', async () => {
    jest.mocked(summarizeDepots).mockReturnValue(new Promise(() => {}))
    const ctrl = new AbortController()
    const p = estimateBridgeUpdate(game, { signal: ctrl.signal })
    while (jest.mocked(summarizeDepots).mock.calls.length < 1)
      await new Promise((r) => setImmediate(r))
    ctrl.abort(new Error('cancelled by user'))
    const r = await p
    expect(r).toHaveProperty('error')
    expect((r as { error: string }).error).not.toContain('timed out')
    expect(release).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('releases the lease and disposes the job when the summary throws', async () => {
    jest.mocked(summarizeDepots).mockRejectedValue(new Error('x'))
    expect(await estimateBridgeUpdate(game, {})).toEqual({ error: 'x' })
    expect(release).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
