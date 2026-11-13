import { createTestStoreRoot } from '../../../testUtils/testStoreRoot'
import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSteamLibraries, sendProgressUpdate } from 'backend/utils'
import { clearSteamResumeBreadcrumb } from '../library/resumeBreadcrumbs'
import { findOtherManifestsWithInstalldir } from '../library/acfState'
import { getBridgeBottleSteamappsRoot } from '../library/installRoot'
import { getBottleSteamappsDir } from '../bottle'
import { deleteCancelledSteamInstall } from '../cancelDelete'
import type { GameInfo } from 'common/types'
import {
  fsBackedSteamFiles,
  stubRustSteamFiles
} from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import type { AcfReadResult } from '../localFiles/steamFilesTypes'
import { at } from './fixtures/indexed'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createSteamStores } from '../stores'

const steamStoresModule = createSteamStores({
  registry: createStoreRegistry(),
  root: createTestStoreRoot()
})

// 66.3-15: the bottle settings are read through the deps slice, not a module import.
const getSteamBottleSettings = jest.fn()

const steamTestDeps = createTestManagerDeps({
  requestRustInvoke: fsBackedSteamFiles().requestRustInvoke,
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
jest.mock('../library/resumeBreadcrumbs', () => ({
  clearSteamResumeBreadcrumb: jest.fn()
}))
jest.mock('../library/acfState', () => ({
  findOtherManifestsWithInstalldir: jest.fn()
}))
jest.mock('../library/installRoot', () => ({
  getBridgeBottleSteamappsRoot: jest.fn()
}))
jest.mock('../bottle', () => ({
  getBottleSteamappsDir: jest.fn()
}))
jest.mock('../withTimeout', () => ({
  withTimeout: jest.fn(),
  STEAM_PICS_TIMEOUT_MS: 1,
  STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS: 1
}))

const OPTS = { pollMs: 1 }

describe('deleteCancelledSteamInstall', () => {
  let tmp: string
  let steamapps: string

  function build(dir: string, flags = '1026') {
    mkdirSync(join(dir, 'common', 'Cool Game'), { recursive: true })
    writeFileSync(join(dir, 'common', 'Cool Game', 'a.bin'), 'x')
    writeFileSync(
      join(dir, 'appmanifest_123.acf'),
      `"AppState"\n{\n\t"appid"\t"123"\n\t"StateFlags"\t"${flags}"\n\t"installdir"\t"Cool Game"\n}\n`
    )
    writeFileSync(join(dir, 'appmanifest_123.acf.tmp'), 'x')
  }

  function seed(install: Record<string, unknown> = {}) {
    library.set('123', {
      app_name: '123',
      install: {
        steamResumePending: true,
        steamResumeTargetSteamappsDir: steamapps,
        steamResumeInstalldir: 'Cool Game',
        ...install
      }
    } as unknown as GameInfo)
  }

  function allPresent() {
    return (
      existsSync(join(steamapps, 'common', 'Cool Game', 'a.bin')) &&
      existsSync(join(steamapps, 'appmanifest_123.acf')) &&
      existsSync(join(steamapps, 'appmanifest_123.acf.tmp'))
    )
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'cancelDelete-'))
    steamapps = join(tmp, 'lib', 'steamapps')
    build(steamapps)
    library.clear()
    seed()
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
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('deletes install dir, acf and tmp, then clears breadcrumb', async () => {
    const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
    expect(r.status).toBe('deleted')
    expect(existsSync(join(steamapps, 'common', 'Cool Game'))).toBe(false)
    expect(existsSync(join(steamapps, 'appmanifest_123.acf'))).toBe(false)
    expect(existsSync(join(steamapps, 'appmanifest_123.acf.tmp'))).toBe(false)
    expect(existsSync(join(steamapps, 'common'))).toBe(true)
    expect(clearSteamResumeBreadcrumb).toHaveBeenCalledTimes(1)
    expect(clearSteamResumeBreadcrumb).toHaveBeenCalledWith(
      steamTestDeps,
      '123'
    )
  })

  it('resets the frontend progress to 0 once the partial install is deleted (D-UAT-11)', async () => {
    const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
    expect(r.status).toBe('deleted')
    expect(sendProgressUpdate).toHaveBeenCalledTimes(1)
    expect(sendProgressUpdate).toHaveBeenCalledWith(expect.anything(), {
      appName: '123',
      runner: 'steam',
      status: 'done',
      progress: { percent: 0, bytes: '0.00MB', eta: '' }
    })
    expect(
      at(jest.mocked(sendProgressUpdate).mock.invocationCallOrder, 0)
    ).toBeGreaterThan(
      at(jest.mocked(clearSteamResumeBreadcrumb).mock.invocationCallOrder, 0)
    )
  })

  it('still deletes when installedAtStart is false and the ACF reads 1026', async () => {
    seed({ steamResumeInstalledAtStart: false })
    const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
    expect(r.status).toBe('deleted')
  })

  it('waits for the native run to settle before clearing', async () => {
    const inFlight = inFlightSpy()
    inFlight
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false)
    const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
    expect(r.status).toBe('deleted')
    const lastTrue = Math.max(
      ...inFlight.mock.results.map((res, i) =>
        res.value === true ? at(inFlight.mock.invocationCallOrder, i) : -1
      )
    )
    expect(
      at(jest.mocked(clearSteamResumeBreadcrumb).mock.invocationCallOrder, 0)
    ).toBeGreaterThan(lastTrue)
  })

  it('refuses when the settle wait times out', async () => {
    inFlightSpy().mockReturnValue(true)
    const r = await deleteCancelledSteamInstall(steamTestDeps, '123', {
      pollMs: 1,
      timeoutMs: 20
    })
    expect(r.status).toBe('refused')
    expect(allPresent()).toBe(true)
    expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
    expect(sendProgressUpdate).not.toHaveBeenCalled()
  })

  describe('refusals keep everything', () => {
    const cases: Array<[string, string, Record<string, unknown>?]> = [
      ['empty installdir', '123', { steamResumeInstalldir: '' }],
      ['blank installdir', '123', { steamResumeInstalldir: '   ' }],
      ['undefined installdir', '123', { steamResumeInstalldir: undefined }],
      ['dotdot installdir', '123', { steamResumeInstalldir: '..' }],
      ['slash installdir', '123', { steamResumeInstalldir: 'a/b' }],
      ['hidden installdir', '123', { steamResumeInstalldir: '.hidden' }],
      ['resume not pending', '123', { steamResumePending: false }]
    ]
    it.each(cases)('%s', async (_n, appId, install) => {
      seed(install)
      const r = await deleteCancelledSteamInstall(steamTestDeps, appId, OPTS)
      expect(r.status).toBe('refused')
      expect(allPresent()).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
      expect(sendProgressUpdate).not.toHaveBeenCalled()
    })

    it('installed at job start, manifest already downgraded to 1026', async () => {
      seed({ steamResumeInstalledAtStart: true })
      const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
      expect(r.status).toBe('refused')
      expect(r.reason).toMatch(/installed when the job started/)
      expect(allPresent()).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
    })

    it('non-numeric appId', async () => {
      const r = await deleteCancelledSteamInstall(steamTestDeps, '../1', OPTS)
      expect(r.status).toBe('refused')
      expect(allPresent()).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
      expect(sendProgressUpdate).not.toHaveBeenCalled()
    })

    it('no library entry', async () => {
      library.clear()
      const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
      expect(r.status).toBe('refused')
      expect(allPresent()).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
      expect(sendProgressUpdate).not.toHaveBeenCalled()
    })

    it('steamapps dir outside every allowed root', async () => {
      const other = join(tmp, 'elsewhere', 'steamapps')
      build(other)
      seed({ steamResumeTargetSteamappsDir: other })
      const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
      expect(r.status).toBe('refused')
      expect(existsSync(join(other, 'common', 'Cool Game', 'a.bin'))).toBe(true)
      expect(existsSync(join(other, 'appmanifest_123.acf'))).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
      expect(sendProgressUpdate).not.toHaveBeenCalled()
    })

    it('ACF reports fully installed', async () => {
      build(steamapps, '4')
      const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
      expect(r.status).toBe('refused')
      expect(allPresent()).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
      expect(sendProgressUpdate).not.toHaveBeenCalled()
    })
  })

  it('keeps a shared installdir but removes this appId manifests', async () => {
    jest.mocked(findOtherManifestsWithInstalldir).mockResolvedValue(['456'])
    const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
    expect(r.status).toBe('deleted')
    expect(existsSync(join(steamapps, 'common', 'Cool Game', 'a.bin'))).toBe(
      true
    )
    expect(existsSync(join(steamapps, 'appmanifest_123.acf'))).toBe(false)
    expect(existsSync(join(steamapps, 'appmanifest_123.acf.tmp'))).toBe(false)
    expect(clearSteamResumeBreadcrumb).toHaveBeenCalledWith(
      steamTestDeps,
      '123'
    )
  })

  it('is fine with missing manifest files', async () => {
    rmSync(join(steamapps, 'appmanifest_123.acf'))
    rmSync(join(steamapps, 'appmanifest_123.acf.tmp'))
    const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
    expect(r.status).toBe('deleted')
    expect(existsSync(join(steamapps, 'common', 'Cool Game'))).toBe(false)
  })

  it('never throws when getSteamLibraries rejects', async () => {
    jest.mocked(getSteamLibraries).mockRejectedValue(new Error('boom'))
    const r = await deleteCancelledSteamInstall(steamTestDeps, '123', OPTS)
    expect(r.status).toBe('refused')
    expect(allPresent()).toBe(true)
  })
})

// Phase 75-20: the installed refusal on the rust branch (T-75-56). Parsing is proven by the crate
// tests and the replay harness; here the wrapper is driven by programmed read results.
describe('deleteCancelledSteamInstall, rust branch', () => {
  let tmp: string
  let steamapps: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'cancelDeleteRust-'))
    steamapps = join(tmp, 'lib', 'steamapps')
    mkdirSync(join(steamapps, 'common', 'Cool Game'), { recursive: true })
    writeFileSync(join(steamapps, 'common', 'Cool Game', 'a.bin'), 'x')
    writeFileSync(join(steamapps, 'appmanifest_123.acf'), 'x')
    library.clear()
    library.set('123', {
      app_name: '123',
      install: {
        steamResumePending: true,
        steamResumeTargetSteamappsDir: steamapps,
        steamResumeInstalldir: 'Cool Game'
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
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  const readResult = (
    over: Partial<AcfReadResult> & { stateFlags?: number | null }
  ): AcfReadResult =>
    ({
      exists: true,
      parsed: true,
      readError: null,
      record: { stateFlags: over.stateFlags ?? null },
      ...over
    }) as AcfReadResult

  const run = (reply: () => AcfReadResult) => {
    const stub = stubRustSteamFiles({ steamfiles_read_acf: reply })
    return {
      stub,
      result: deleteCancelledSteamInstall(
        { ...steamTestDeps, ...stub },
        '123',
        OPTS
      )
    }
  }

  it('refuses when the manifest reports installed (bit 4)', async () => {
    const { stub, result } = run(() => readResult({ stateFlags: 4 }))
    expect(await result).toEqual({
      status: 'refused',
      reason: 'manifest reports installed'
    })
    expect(stub.calls[0]).toEqual({
      channel: 'steamfiles_read_acf',
      args: { path: join(steamapps, 'appmanifest_123.acf') }
    })
    expect(existsSync(join(steamapps, 'common', 'Cool Game'))).toBe(true)
  })

  it('treats an unparseable manifest as residue and deletes', async () => {
    const { result } = run(() =>
      readResult({ parsed: false, record: null, readError: 'bad' })
    )
    expect((await result).status).toBe('deleted')
    expect(existsSync(join(steamapps, 'common', 'Cool Game'))).toBe(false)
  })

  it('deletes a downloading manifest (bit 4 unset)', async () => {
    const { result } = run(() => readResult({ stateFlags: 1026 }))
    expect((await result).status).toBe('deleted')
  })

  it('refuses with "manifest unreadable" when the invoke rejects and keeps every file', async () => {
    const { result } = run(() => {
      throw new Error('transport down')
    })
    expect(await result).toEqual({
      status: 'refused',
      reason: 'manifest unreadable'
    })
    expect(existsSync(join(steamapps, 'common', 'Cool Game', 'a.bin'))).toBe(
      true
    )
    expect(existsSync(join(steamapps, 'appmanifest_123.acf'))).toBe(true)
  })
})
