import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createSteamUpdateStateCache,
  detectSteamUpdates,
  getLastKnownSteamUpdateState,
  invalidateSteamUpdateState,
  type SteamUpdateDeps
} from '../updateDetection'
import { fsBackedSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import { findBridgeInstallBottle } from '../bridgeBottle'
import { listSteamClientPids } from '../steamClientProcess'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('../bridgeBottle', () => ({ findBridgeInstallBottle: jest.fn() }))
jest.mock('../bottle', () => ({
  getBottleSteamappsDir: (_p: unknown, name: string) =>
    (globalThis as { __bottleDirs?: Record<string, string> }).__bottleDirs?.[
      name
    ] ?? '/nonexistent'
}))
jest.mock('../steamClientProcess', () => ({ listSteamClientPids: jest.fn() }))

const mockedBottle = findBridgeInstallBottle as jest.Mock
const mockedPids = listSteamClientPids as jest.Mock

const acf = (appId: string, build: string, extra = '', flags = 4) =>
  `"AppState"\n{\n"appid" "${appId}"\n"StateFlags" "${flags}"\n"buildid" "${build}"\n${extra}\n}\n`

describe('detectSteamUpdates', () => {
  let root: string
  let bridgeDir: string
  let getProductInfo: jest.Mock
  let deps: SteamUpdateDeps

  const addBridge = (appId: string, build: string, beta?: string) => {
    writeFileSync(
      join(bridgeDir, `appmanifest_${appId}.acf`),
      acf(appId, build, beta ? `"UserConfig"\n{\n"BetaKey" "${beta}"\n}` : '')
    )
  }
  const addNative = (appId: string, build: string, extra = '', flags = 4) =>
    writeFileSync(
      join(root, 'steamapps', `appmanifest_${appId}.acf`),
      acf(appId, build, extra, flags)
    )
  const lib = (...ids: string[]) =>
    ids.forEach((id) =>
      deps.steamSession.libraryState.library.set(id, {
        is_installed: true
      } as never)
    )
  const pics = (m: Record<string, Record<string, unknown>>) =>
    getProductInfo.mockResolvedValue({
      apps: Object.fromEntries(
        Object.entries(m).map(([id, branches]) => [
          id,
          { appinfo: { depots: { branches } } }
        ])
      )
    })

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'upd-'))
    mkdirSync(join(root, 'steamapps'))
    bridgeDir = join(root, 'bridge')
    mkdirSync(bridgeDir)
    ;(globalThis as { __bottleDirs?: unknown }).__bottleDirs = {
      b: bridgeDir
    }
    writeFileSync(
      join(root, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders"\n{\n"0"\n{\n"path" "${root}"\n}\n}\n`
    )
    getProductInfo = jest.fn()
    mockedBottle.mockReset()
    mockedBottle.mockImplementation((_p: unknown, id: string) =>
      id.startsWith('1') ? 'b' : null
    )
    mockedPids.mockReset()
    mockedPids.mockResolvedValue([1])
    deps = {
      config: { getSettings: () => ({ defaultSteamPath: root }) },
      paths: { userHome: root },
      steamSession: { libraryState: { library: new Map() } },
      anonymousClient: {
        get: jest.fn().mockResolvedValue({ getProductInfo })
      },
      runner: { run: jest.fn() },
      ...fsBackedSteamFiles(),
      steamInstallRuntime: { updateStates: createSteamUpdateStateCache() }
    } as unknown as SteamUpdateDeps
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('bridge stale vs current', async () => {
    addBridge('101', '100')
    addBridge('102', '200')
    lib('101', '102')
    pics({
      '101': { public: { buildid: '200' } },
      '102': { public: { buildid: '200' } }
    })
    const r = await detectSteamUpdates(deps)
    expect(r.find((s) => s.appId === '101')).toMatchObject({
      kind: 'bridge',
      state: 'stale',
      targetBuild: '200'
    })
    expect(r.find((s) => s.appId === '102')?.state).toBe('current')
    expect(getProductInfo).toHaveBeenCalledTimes(1)
  })

  it('compares against the BetaKey branch; unresolved or gated is unknown', async () => {
    addBridge('101', '100', 'beta')
    addBridge('102', '100', 'private')
    addBridge('103', '100', 'beta')
    lib('101', '102', '103')
    pics({
      '101': { public: { buildid: '9' }, beta: { buildid: '300' } },
      '102': { public: { buildid: '9' } },
      '103': { beta: { buildid: '300', pwdrequired: '1' } }
    })
    const r = await detectSteamUpdates(deps)
    expect(r.find((s) => s.appId === '101')).toMatchObject({
      state: 'stale',
      branch: 'beta',
      targetBuild: '300'
    })
    expect(r.find((s) => s.appId === '102')).toMatchObject({
      state: 'unknown',
      reason: 'branch-unresolved'
    })
    expect(r.find((s) => s.appId === '103')).toMatchObject({
      state: 'unknown',
      reason: 'branch-unresolved'
    })
  })

  it('timeout and failure keep the last known state or report unknown', async () => {
    addBridge('101', '100')
    lib('101')
    getProductInfo.mockReturnValue(new Promise(() => undefined))
    let r = await detectSteamUpdates(deps, { timeoutMs: 20 })
    expect(r[0]).toMatchObject({ state: 'unknown', reason: 'pics-timeout' })

    pics({ '101': { public: { buildid: '200' } } })
    await detectSteamUpdates(deps, { force: true })
    getProductInfo.mockRejectedValue(new Error('boom'))
    r = await detectSteamUpdates(deps, { force: true })
    expect(r[0]).toMatchObject({
      state: 'stale',
      reason: 'pics-failed'
    })
    ;(deps.anonymousClient.get as jest.Mock).mockResolvedValue(null)
    invalidateSteamUpdateState(deps, '101')
    r = await detectSteamUpdates(deps, { force: true })
    expect(r[0]).toMatchObject({ state: 'unknown', reason: 'pics-failed' })
  })

  it('bounds a hung anonymous connect at timeoutMs with pics-timeout', async () => {
    addBridge('101', '100')
    lib('101')
    let rejectGet: (e: Error) => void = () => undefined
    ;(deps.anonymousClient.get as jest.Mock).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectGet = reject
      })
    )
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    try {
      const pending = detectSteamUpdates(deps, { force: true, timeoutMs: 3000 })
      await jest.advanceTimersByTimeAsync(3000)
      const r = await pending
      expect(r[0]).toMatchObject({ state: 'unknown', reason: 'pics-timeout' })
      // a late rejection after the timeout must not surface as unhandled
      rejectGet(new Error('late'))
      await jest.advanceTimersByTimeAsync(10)
    } finally {
      jest.useRealTimers()
    }
  })

  it('batches into one call, reuses within TTL, and force refetches', async () => {
    addBridge('101', '1')
    addBridge('102', '1')
    addBridge('103', '1')
    lib('101', '102', '103')
    pics({
      '101': { public: { buildid: '2' } },
      '102': { public: { buildid: '2' } },
      '103': { public: { buildid: '2' } }
    })
    await detectSteamUpdates(deps)
    expect(getProductInfo).toHaveBeenCalledTimes(1)
    await detectSteamUpdates(deps)
    expect(getProductInfo).toHaveBeenCalledTimes(1)
    await detectSteamUpdates(deps, { force: true })
    expect(getProductInfo).toHaveBeenCalledTimes(2)
  })

  it('registered installs decide from the ACF; PICS only when Steam is not running', async () => {
    addNative('201', '100', '"TargetBuildID" "300"', 6)
    addNative('202', '100')
    lib('201', '202')
    let r = await detectSteamUpdates(deps)
    expect(r.find((s) => s.appId === '201')).toMatchObject({
      kind: 'registered',
      state: 'stale',
      pending: { bytesToDownload: 0 }
    })
    expect(r.find((s) => s.appId === '202')?.state).toBe('current')
    expect(getProductInfo).not.toHaveBeenCalled()

    mockedPids.mockResolvedValue([])
    pics({ '202': { public: { buildid: '999' } } })
    r = await detectSteamUpdates(deps, { appIds: ['202'] })
    expect(r[0]).toMatchObject({ state: 'stale', targetBuild: '999' })
    expect(getProductInfo).toHaveBeenCalledTimes(1)

    mockedPids.mockResolvedValue(undefined)
    getProductInfo.mockClear()
    r = await detectSteamUpdates(deps, { appIds: ['202'], force: true })
    expect(r[0]?.state).toBe('current')
    expect(getProductInfo).not.toHaveBeenCalled()
  })

  describe('registered PICS failure (WR-02)', () => {
    const seedStale = async () => {
      addNative('202', '777')
      lib('202')
      mockedPids.mockResolvedValue([])
      pics({ '202': { public: { buildid: '800' } } })
      const [seed] = await detectSteamUpdates(deps, { appIds: ['202'] })
      expect(seed).toMatchObject({ state: 'stale', targetBuild: '800' })
    }
    const failTimeout = () =>
      getProductInfo.mockReturnValue(new Promise(() => undefined))

    it('A: unchanged ACF keeps the prior stale state on a timeout', async () => {
      await seedStale()
      failTimeout()
      const [r] = await detectSteamUpdates(deps, {
        appIds: ['202'],
        force: true,
        timeoutMs: 20
      })
      expect(r).toMatchObject({
        state: 'stale',
        installedBuild: '777',
        targetBuild: '800',
        reason: 'pics-timeout'
      })
    })

    it('A: unchanged ACF keeps the prior stale state when PICS fails', async () => {
      await seedStale()
      ;(deps.anonymousClient.get as jest.Mock).mockResolvedValue(null)
      const [r] = await detectSteamUpdates(deps, {
        appIds: ['202'],
        force: true
      })
      expect(r).toMatchObject({
        state: 'stale',
        installedBuild: '777',
        targetBuild: '800',
        reason: 'pics-failed'
      })
    })

    it('B: an ACF at the known target is current even when PICS fails', async () => {
      await seedStale()
      addNative('202', '800')
      failTimeout()
      const [r] = await detectSteamUpdates(deps, {
        appIds: ['202'],
        force: true,
        timeoutMs: 20
      })
      expect(r).toMatchObject({
        state: 'current',
        installedBuild: '800',
        targetBuild: '800'
      })
    })

    it('C: an ACF moved elsewhere keeps prior state with the build corrected', async () => {
      await seedStale()
      addNative('202', '790')
      failTimeout()
      const [r] = await detectSteamUpdates(deps, {
        appIds: ['202'],
        force: true,
        timeoutMs: 20
      })
      expect(r).toMatchObject({
        state: 'stale',
        installedBuild: '790',
        targetBuild: '800',
        reason: 'pics-timeout'
      })
    })

    it('no prior: falls back to the ACF (current)', async () => {
      addNative('202', '777')
      lib('202')
      mockedPids.mockResolvedValue([])
      failTimeout()
      const [r] = await detectSteamUpdates(deps, {
        appIds: ['202'],
        timeoutMs: 20
      })
      expect(r?.state).toBe('current')
    })
  })

  it('skips installs that are neither bridge nor native-registered', async () => {
    lib('301')
    expect(await detectSteamUpdates(deps)).toEqual([])
  })

  it('exposes last-known state and estimates through the cache', async () => {
    addBridge('101', '1')
    lib('101')
    pics({ '101': { public: { buildid: '2' } } })
    await detectSteamUpdates(deps)
    expect(getLastKnownSteamUpdateState(deps, '101')?.state).toBe('stale')
    deps.steamInstallRuntime.updateStates.setEstimate('101', {
      targetBuild: '2',
      downloadBytes: 1,
      peakBytes: 2,
      oldManifestAvailable: true,
      computedAt: 0
    })
    await detectSteamUpdates(deps, { force: true })
    expect(
      getLastKnownSteamUpdateState(deps, '101')?.estimate?.downloadBytes
    ).toBe(1)
  })
})
