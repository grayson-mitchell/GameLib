import { readFileSync } from 'fs'
import { join } from 'path'
import * as logger from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import type { SteamInstalledInfo } from 'common/types/steam'
import * as lifecycle from '../bridgeBottleLifecycle'
import {
  enumerateSteamInstallCopies,
  findOtherManifestsWithInstalldir,
  readAcfState,
  removeSteamInstallCopy,
  scanDownloadingAppIds
} from '../library/acfState'
import {
  isAcfUpdatePending,
  readAcfUpdateFieldsFromDir,
  readAcfUpdateState,
  STATE_FLAG_FULLY_INSTALLED,
  type AcfUpdateFields
} from '../library/acfUpdateState'
import { verifyMacArchGroundTruth } from '../library/macArch'
import { breadcrumbAppIsFullyInstalledOnDisk } from '../library/resumeBreadcrumbs'

const FLAG = 'GAMELIB_STEAM_POLLS'

type Call = { channel: string; args: unknown[] }

function makeDeps(handler: (channel: string) => unknown = () => null) {
  const calls: Call[] = []
  const deps = {
    requestRustInvoke: jest.fn((channel: string, args: unknown[]) => {
      calls.push({ channel, args })
      return Promise.resolve().then(() => handler(channel))
    }),
    config: {
      getSettings: () => ({ defaultSteamPath: "'/steam'", wineVersion: {} })
    },
    paths: { userHome: '/home/u' },
    steamBottle: {
      resolveCrossoverWine: () => undefined,
      getSteamBottleSettings: () => ({ wineCrossoverBottle: 'GameLibSteam' })
    },
    steamSession: {
      libraryState: { library: new Map([['10', { title: 'Ten' }]]) }
    },
    stores: {
      steam: {
        steamMetadataStore: { get: () => undefined, set: jest.fn() },
        steamLibraryStore: { set: jest.fn() }
      }
    },
    engineRuntime: { registry: { getEngineSelection: () => undefined } },
    steamLaunchRuntime: {
      drmRunners: { getDrmBridgeRunner: () => undefined }
    },
    sendFrontendMessage: jest.fn()
  } as unknown as ManagerDeps
  return { deps, calls }
}

let prev: string | undefined
beforeEach(() => {
  prev = process.env[FLAG]
  process.env[FLAG] = 'rust'
  jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logInfo').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
})
afterEach(() => {
  jest.restoreAllMocks()
  if (prev === undefined) delete process.env[FLAG]
  else process.env[FLAG] = prev
})

describe('acfState rust arm', () => {
  it('readAcfState maps installed and downloading results', async () => {
    const { deps, calls } = makeDeps(() => ({
      state: 'installed',
      stateFlags: 4,
      installPath: '/lib/steamapps/common/G',
      sizeOnDisk: '9',
      buildid: null
    }))
    expect(await readAcfState(deps, '10')).toEqual({
      state: 'installed',
      stateFlags: 4,
      installPath: '/lib/steamapps/common/G',
      sizeOnDisk: '9',
      buildid: undefined
    })
    expect(calls[0]?.channel).toBe('steampoll_acf_read_state')
    const arg = calls[0]?.args[0] as Record<string, unknown>
    expect(arg.appId).toBe('10')
    expect(arg.source).toBe('native')

    const dl = makeDeps(() => ({
      state: 'downloading',
      stateFlags: null,
      bytesDownloaded: 1,
      bytesToDownload: 2,
      bytesStaged: 3,
      bytesToStage: 4
    }))
    const res = await readAcfState(dl.deps, '10')
    expect(res.state).toBe('downloading')
    expect(res.stateFlags).toBeNaN()
    expect(res.bytesToStage).toBe(4)
  })

  it('readAcfState maps a rejected invoke to unknown', async () => {
    const { deps } = makeDeps(() => {
      throw new Error('timeout')
    })
    expect(await readAcfState(deps, '10')).toEqual({ state: 'unknown' })
  })

  it('findOtherManifestsWithInstalldir passes the list and sentinels a rejection', async () => {
    const ok = makeDeps(() => ['5'])
    expect(
      await findOtherManifestsWithInstalldir(ok.deps, '/s', 'G', '10')
    ).toEqual(['5'])
    expect(ok.calls[0]?.args[0]).toEqual({
      steamappsDir: '/s',
      installdir: 'G',
      appId: '10'
    })
    const bad = makeDeps(() => {
      throw new Error('x')
    })
    expect(
      await findOtherManifestsWithInstalldir(bad.deps, '/s', 'G', '10')
    ).toEqual(['<unknown>'])
  })

  it('enumerateSteamInstallCopies returns the Rust list', async () => {
    const copy = { source: 'native', installPath: '/p', sizeOnDisk: '1' }
    const { deps, calls } = makeDeps(() => [copy])
    expect(await enumerateSteamInstallCopies(deps, '10')).toEqual([copy])
    expect(calls[0]?.channel).toBe('steampoll_acf_enumerate_copies')
  })

  it('scanDownloadingAppIds keeps only library appIds and returns [] on rejection', async () => {
    const { deps } = makeDeps(() => ['10', '99'])
    expect(await scanDownloadingAppIds(deps)).toEqual(['10'])
    const bad = makeDeps(() => {
      throw new Error('x')
    })
    expect(await scanDownloadingAppIds(bad.deps)).toEqual([])
  })
})

describe('removeSteamInstallCopy rust arm', () => {
  it('rejects a non-numeric appId without invoking Rust', async () => {
    const { deps, calls } = makeDeps()
    const res = await removeSteamInstallCopy(deps, '../x', 'native')
    expect(res.status).toBe('refused')
    expect(calls).toHaveLength(0)
  })

  it('passes refused and absent through', async () => {
    const refused = makeDeps(() => ({
      status: 'refused',
      source: 'native',
      reason: 'install in progress'
    }))
    expect(await removeSteamInstallCopy(refused.deps, '10', 'native')).toEqual({
      status: 'refused',
      source: 'native',
      reason: 'install in progress'
    })
    const absent = makeDeps(() => ({ status: 'absent', source: 'native' }))
    expect(await removeSteamInstallCopy(absent.deps, '10', 'native')).toEqual({
      status: 'absent',
      source: 'native'
    })
  })

  it('maps a rejection to refused', async () => {
    const { deps } = makeDeps(() => {
      throw new Error('x')
    })
    expect(await removeSteamInstallCopy(deps, '10', 'native')).toEqual({
      status: 'refused',
      source: 'native',
      reason: 'install state unknown'
    })
  })

  it('removes the per-game bridge bottle only when Rust returned one', async () => {
    const spy = jest
      .spyOn(lifecycle, 'removePerGameBridgeBottle')
      .mockResolvedValue({ status: 'removed' } as never)
    const withBottle = makeDeps(() => ({
      status: 'removed',
      source: 'bridge',
      manifestOnly: false,
      bridgeBottle: 'GameLibSteamBridge-10'
    }))
    expect(
      await removeSteamInstallCopy(withBottle.deps, '10', 'bridge')
    ).toEqual({
      status: 'removed',
      source: 'bridge',
      manifestOnly: false,
      bottleRemoved: true
    })
    expect(spy).toHaveBeenCalledTimes(1)

    spy.mockClear()
    const noBottle = makeDeps(() => ({
      status: 'removed',
      source: 'native',
      manifestOnly: false,
      bridgeBottle: null
    }))
    expect(await removeSteamInstallCopy(noBottle.deps, '10', 'native')).toEqual(
      {
        status: 'removed',
        source: 'native',
        manifestOnly: false
      }
    )
    expect(spy).not.toHaveBeenCalled()
  })

  it('folds a failed bottle removal into bottleRemoved false', async () => {
    jest
      .spyOn(lifecycle, 'removePerGameBridgeBottle')
      .mockResolvedValue({ status: 'refused' } as never)
    const { deps } = makeDeps(() => ({
      status: 'removed',
      source: 'bridge',
      manifestOnly: false,
      bridgeBottle: 'GameLibSteamBridge-10'
    }))
    const res = await removeSteamInstallCopy(deps, '10', 'bridge')
    expect(res).toMatchObject({ status: 'removed', bottleRemoved: false })
  })
})

describe('acfUpdateState rust arm', () => {
  const rustFields = {
    steamappsDir: '/s',
    buildid: '1',
    targetBuildId: null,
    stateFlags: 4,
    bytesToDownload: 0,
    bytesDownloaded: 0,
    scheduledAutoUpdate: 0,
    betaKey: null
  }

  it('readAcfUpdateState turns nulls into absent optionals', async () => {
    const { deps, calls } = makeDeps(() => rustFields)
    const res = await readAcfUpdateState(deps, '10')
    expect(res).toEqual({
      steamappsDir: '/s',
      buildid: '1',
      stateFlags: 4,
      bytesToDownload: 0,
      bytesDownloaded: 0,
      scheduledAutoUpdate: 0
    })
    expect(calls[0]?.channel).toBe('steampoll_acf_read_update')
  })

  it('readAcfUpdateState keeps target and beta, null for bad id or rejection', async () => {
    const { deps } = makeDeps(() => ({
      ...rustFields,
      targetBuildId: '2',
      betaKey: 'b'
    }))
    expect(await readAcfUpdateState(deps, '10')).toMatchObject({
      targetBuildId: '2',
      betaKey: 'b'
    })
    expect(await readAcfUpdateState(deps, '../1')).toBeNull()
    const bad = makeDeps(() => {
      throw new Error('x')
    })
    expect(await readAcfUpdateState(bad.deps, '10')).toBeNull()
  })

  it('readAcfUpdateFieldsFromDir invokes the from_dir op', async () => {
    const { deps, calls } = makeDeps(() => null)
    expect(await readAcfUpdateFieldsFromDir(deps, '/s', '10')).toBeNull()
    expect(calls[0]).toEqual({
      channel: 'steampoll_acf_read_update_from_dir',
      args: [{ steamappsDir: '/s', appId: '10' }]
    })
  })

  it('isAcfUpdatePending matches the Rust acf_update.rs vectors', () => {
    const base: AcfUpdateFields = {
      steamappsDir: '/x',
      buildid: '100',
      targetBuildId: '100',
      stateFlags: 4,
      bytesToDownload: 100,
      bytesDownloaded: 100,
      scheduledAutoUpdate: 0
    }
    const vectors: Array<[Partial<AcfUpdateFields>, boolean]> = [
      [{ stateFlags: 6 }, true],
      [{ targetBuildId: '200' }, true],
      [{ targetBuildId: '0' }, false],
      [{ targetBuildId: undefined }, false],
      [{}, false],
      [
        { scheduledAutoUpdate: 5, bytesToDownload: 200, bytesDownloaded: 0 },
        true
      ],
      [{ scheduledAutoUpdate: 5 }, false]
    ]
    for (const [over, expected] of vectors) {
      expect(isAcfUpdatePending({ ...base, ...over })).toBe(expected)
    }
  })

  it('STATE_FLAG_FULLY_INSTALLED equals the Rust constant', () => {
    const src = readFileSync(
      join(
        __dirname,
        '../../../../../src-tauri/crates/gamelib-steampoll/src/constants.rs'
      ),
      'utf8'
    )
    const m =
      /STATE_FLAG_FULLY_INSTALLED:\s*\w+\s*=\s*(0x[0-9a-fA-F]+|\d+)/.exec(src)
    expect(m).not.toBeNull()
    expect(Number(m?.[1])).toBe(STATE_FLAG_FULLY_INSTALLED)
  })
})

describe('mac arch and breadcrumb rust arms', () => {
  it('breadcrumbAppIsFullyInstalledOnDisk calls the Rust op and is false on rejection', async () => {
    const install = {
      steamResumeTargetSteamappsDir: '/s/steamapps'
    } as Partial<SteamInstalledInfo>
    const ok = makeDeps(() => true)
    expect(
      await breadcrumbAppIsFullyInstalledOnDisk(ok.deps, '10', install)
    ).toBe(true)
    expect(ok.calls[0]).toEqual({
      channel: 'steampoll_breadcrumb_installed_on_disk',
      args: [{ steamappsDir: '/s/steamapps', appId: '10' }]
    })
    const bad = makeDeps(() => {
      throw new Error('x')
    })
    expect(
      await breadcrumbAppIsFullyInstalledOnDisk(bad.deps, '10', install)
    ).toBe(false)
    expect(
      await breadcrumbAppIsFullyInstalledOnDisk(ok.deps, '10', undefined)
    ).toBe(false)
  })

  it('verifyMacArchGroundTruth keeps the source gate before calling Rust', async () => {
    const { deps, calls } = makeDeps(() => '64')
    await verifyMacArchGroundTruth(deps, '10', '/p', 'bottle')
    expect(calls).toHaveLength(0)
  })

  it('verifyMacArchGroundTruth applies a Rust verdict and no-ops on null', async () => {
    // The host gate is isMac; skip the rust call assertions off macOS.
    if (process.platform !== 'darwin') return
    const ok = makeDeps(() => '64')
    await verifyMacArchGroundTruth(ok.deps, '10', '/p', 'native')
    expect(ok.calls[0]).toEqual({
      channel: 'steampoll_mac_arch_verdict',
      args: [{ installPath: '/p' }]
    })
    expect(
      (
        ok.deps.stores.steam.steamMetadataStore as unknown as {
          set: jest.Mock
        }
      ).set
    ).toHaveBeenCalled()

    const none = makeDeps(() => null)
    await verifyMacArchGroundTruth(none.deps, '10', '/p', 'native')
    expect(
      (
        none.deps.stores.steam.steamMetadataStore as unknown as {
          set: jest.Mock
        }
      ).set
    ).not.toHaveBeenCalled()
  })
})
