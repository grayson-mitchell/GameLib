import { fsBackedSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * Regression for the 73-18 incident chain (todo
 * 2026-11-09-stale-steam-queue-head-cancel-deletes-complete-install, quick
 * 261110-9db): a queued head whose manifest flips to StateFlags 4 while it is
 * queued, started, cancelled with Delete Files, must leave the tree and the
 * manifest in place.
 *
 * Real: resumeBreadcrumbs, cancelDelete, runNativeDepotDownloadLeased,
 * queueHeadRevalidation. Mocked: boundaries only. downloadSteamDepots is
 * mocked to rewrite the ACF to 1026 and report cancelled, simulating a
 * finalize that bypassed layer 3, so layer 2 alone is what saves the tree.
 */
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSteamLibraries } from 'backend/utils'
import { downloadSteamDepots } from '../depot'
import { resolveSteamInstallTarget } from '../installLocation'
import { getBottleSteamappsDir } from '../bottle'
import { getBridgeBottleSteamappsRoot } from '../library/installRoot'
import { findOtherManifestsWithInstalldir } from '../library/acfState'
import { runNativeDepotDownloadLeased } from '../gameInstallDepot'
import { deleteCancelledSteamInstall } from '../cancelDelete'
import { steamQueueHeadAlreadyInstalled } from '../queueHeadRevalidation'
import type { GameInfo } from 'common/types'
import type SteamGame from '../games'
import type { Stores } from 'backend/services/types'

const steamStoresModule = jest.requireMock<Stores['steam']>('../stores')

// 66.3-15: the bottle settings are read through the deps slice, not a module import.
const getSteamBottleSettings = jest.fn()

// The abort registry is injected into the manager deps (66.4-13).
const createAbortController = jest.fn()

const steamTestDeps = createTestManagerDeps({
  requestRustInvoke: fsBackedSteamFiles().requestRustInvoke,
  aborts: {
    create: (id: string) => createAbortController(id),
    delete: () => undefined,
    getSignal: () => undefined,
    has: () => false,
    call: () => undefined,
    abortAll: () => undefined
  },
  steamBottle: { getSteamBottleSettings } as never,
  stores: createTestStores({ steam: steamStoresModule })
})

// The boot-owned Steam library state the code under test reads (D-66.3-13): one instance per file.
const library = steamTestDeps.steamSession.libraryState.library
// The boot-owned in-flight map is a plain object, so the per-session probe is spied on the instance (D-66.3-13).
const inFlightSpy = () =>
  jest.spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  sendProgressUpdate: jest.fn()
}))
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))
jest.mock('../stores', () => ({
  steamLibraryStore: { get: jest.fn(), set: jest.fn() }
}))
jest.mock('../depot', () => ({ downloadSteamDepots: jest.fn() }))
jest.mock('../installLocation', () => ({
  ...jest.requireActual('../installLocation'),
  resolveSteamInstallTarget: jest.fn()
}))
jest.mock('../bottle', () => ({
  getBottleSteamappsDir: jest.fn()
}))
jest.mock('../library/installRoot', () => ({
  getBridgeBottleSteamappsRoot: jest.fn()
}))
jest.mock('../library/acfState', () => ({
  findOtherManifestsWithInstalldir: jest.fn()
}))
jest.mock('../library/installPolling', () => ({
  startInstallPolling: jest.fn()
}))
jest.mock('../macSteamAdoption')
jest.mock('../clientSetup')
jest.mock('../experimentalInstallAppSetting')
jest.mock('../steamInstallApp')
jest.mock('../gameRequirements')
jest.mock('../withTimeout', () => ({
  // Plain function: resetMocks would wipe a jest.fn implementation.
  withTimeout: (p: Promise<unknown>) => p,
  STEAM_PICS_TIMEOUT_MS: 1,
  STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS: 1
}))

const APP_ID = '108600'

describe('stale queue head cancel regression (73-18)', () => {
  let tmp: string
  let steamapps: string
  const acfPath = () => join(steamapps, `appmanifest_${APP_ID}.acf`)
  const treeFile = () => join(steamapps, 'common', 'ProjectZomboid', 'game.bin')
  const acfText = (flags: string) =>
    `"AppState"\n{\n\t"appid"\t"${APP_ID}"\n\t"StateFlags"\t"${flags}"\n\t"buildid"\t"25485521"\n\t"installdir"\t"ProjectZomboid"\n}\n`

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'staleHead-'))
    steamapps = join(tmp, 'lib', 'steamapps')
    mkdirSync(join(steamapps, 'common', 'ProjectZomboid'), { recursive: true })
    writeFileSync(treeFile(), 'x')
    // The queue-time state: GameLib's own 1026 manifest, breadcrumb set.
    writeFileSync(acfPath(), acfText('1026'))
    library.clear()
    library.set(APP_ID, {
      app_name: APP_ID,
      is_installed: false,
      install: {
        steamResumePending: true,
        steamResumeTargetSteamappsDir: steamapps,
        steamResumeInstalldir: 'ProjectZomboid'
      }
    } as unknown as GameInfo)
    jest.mocked(getSteamLibraries).mockResolvedValue([join(tmp, 'lib')])
    inFlightSpy().mockReturnValue(false)
    jest.mocked(findOtherManifestsWithInstalldir).mockResolvedValue([])
    jest
      .mocked(getBridgeBottleSteamappsRoot)
      .mockReturnValue(join(tmp, 'nobridge', 'steamapps'))
    jest
      .mocked(getBottleSteamappsDir)
      .mockReturnValue(join(tmp, 'nobottle', 'steamapps'))
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'b' } as never)
    jest.mocked(resolveSteamInstallTarget).mockResolvedValue({
      targetSteamappsDir: steamapps,
      installdir: 'ProjectZomboid'
    } as never)
    // Steam finishes the download itself while the head is queued.
    writeFileSync(acfPath(), acfText('4'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('layer 1 would have dropped the flipped head', async () => {
    expect(
      await steamQueueHeadAlreadyInstalled(steamTestDeps, APP_ID, {})
    ).toBe(true)
  })

  it('start then cancel with Delete Files leaves the tree and manifest in place (layer 2 alone)', async () => {
    jest.mocked(downloadSteamDepots).mockImplementation(async () => {
      // A finalize that bypassed layer 3 downgrades Steam's manifest.
      writeFileSync(acfPath(), acfText('1026'))
      return { status: 'cancelled' } as never
    })
    const controller = new AbortController()
    createAbortController.mockReturnValue(controller)

    const result = await runNativeDepotDownloadLeased(
      { appId: APP_ID, deps: steamTestDeps } as unknown as SteamGame,
      {} as never,
      { os: 'linux' },
      controller as never,
      Date.now(),
      {}
    )
    expect(result.status).toBe('abort')
    expect(library.get(APP_ID)?.install?.steamResumeInstalledAtStart).toBe(true)

    const r = await deleteCancelledSteamInstall(steamTestDeps, APP_ID, {
      pollMs: 1
    })
    expect(r.status).toBe('refused')
    expect(existsSync(treeFile())).toBe(true)
    expect(existsSync(acfPath())).toBe(true)
  })

  it('a first-time install cancel still deletes its partial tree', async () => {
    writeFileSync(acfPath(), acfText('1026')) // never installed
    jest.mocked(downloadSteamDepots).mockResolvedValue({
      status: 'cancelled'
    } as never)
    const controller = new AbortController()

    await runNativeDepotDownloadLeased(
      { appId: APP_ID, deps: steamTestDeps } as unknown as SteamGame,
      {} as never,
      { os: 'linux' },
      controller as never,
      Date.now(),
      {}
    )
    expect(library.get(APP_ID)?.install?.steamResumeInstalledAtStart).toBe(
      false
    )
    const r = await deleteCancelledSteamInstall(steamTestDeps, APP_ID, {
      pollMs: 1
    })
    expect(r).toEqual({ status: 'deleted' })
    expect(existsSync(treeFile())).toBe(false)
  })
})
