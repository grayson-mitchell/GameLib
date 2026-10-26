import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSteamLibraries } from 'backend/utils'
import { library } from '../state'
import { isNativeInstallInFlight } from '../games'
import {
  clearSteamResumeBreadcrumb,
  findOtherManifestsWithInstalldir,
  getBridgeBottleSteamappsRoot
} from '../library'
import { getBottleSteamappsDir, getSteamBottleSettings } from '../bottle'
import { deleteCancelledSteamInstall } from '../cancelDelete'
import type { GameInfo } from 'common/types'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({ getSteamLibraries: jest.fn() }))
jest.mock('../games', () => ({ isNativeInstallInFlight: jest.fn() }))
jest.mock('../library', () => ({
  clearSteamResumeBreadcrumb: jest.fn(),
  findOtherManifestsWithInstalldir: jest.fn(),
  getBridgeBottleSteamappsRoot: jest.fn()
}))
jest.mock('../bottle', () => ({
  getBottleSteamappsDir: jest.fn(),
  getSteamBottleSettings: jest.fn()
}))
jest.mock('../user')
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
    jest.mocked(isNativeInstallInFlight).mockReturnValue(false)
    jest.mocked(findOtherManifestsWithInstalldir).mockReturnValue([])
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
    const r = await deleteCancelledSteamInstall('123', OPTS)
    expect(r.status).toBe('deleted')
    expect(existsSync(join(steamapps, 'common', 'Cool Game'))).toBe(false)
    expect(existsSync(join(steamapps, 'appmanifest_123.acf'))).toBe(false)
    expect(existsSync(join(steamapps, 'appmanifest_123.acf.tmp'))).toBe(false)
    expect(existsSync(join(steamapps, 'common'))).toBe(true)
    expect(clearSteamResumeBreadcrumb).toHaveBeenCalledTimes(1)
    expect(clearSteamResumeBreadcrumb).toHaveBeenCalledWith('123')
  })

  it('waits for the native run to settle before clearing', async () => {
    const inFlight = jest.mocked(isNativeInstallInFlight)
    inFlight
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false)
    const r = await deleteCancelledSteamInstall('123', OPTS)
    expect(r.status).toBe('deleted')
    const lastTrue = Math.max(
      ...inFlight.mock.results.map((res, i) =>
        res.value === true ? inFlight.mock.invocationCallOrder[i] : -1
      )
    )
    expect(
      jest.mocked(clearSteamResumeBreadcrumb).mock.invocationCallOrder[0]
    ).toBeGreaterThan(lastTrue)
  })

  it('refuses when the settle wait times out', async () => {
    jest.mocked(isNativeInstallInFlight).mockReturnValue(true)
    const r = await deleteCancelledSteamInstall('123', {
      pollMs: 1,
      timeoutMs: 20
    })
    expect(r.status).toBe('refused')
    expect(allPresent()).toBe(true)
    expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
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
      const r = await deleteCancelledSteamInstall(appId, OPTS)
      expect(r.status).toBe('refused')
      expect(allPresent()).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
    })

    it('non-numeric appId', async () => {
      const r = await deleteCancelledSteamInstall('../1', OPTS)
      expect(r.status).toBe('refused')
      expect(allPresent()).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
    })

    it('no library entry', async () => {
      library.clear()
      const r = await deleteCancelledSteamInstall('123', OPTS)
      expect(r.status).toBe('refused')
      expect(allPresent()).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
    })

    it('steamapps dir outside every allowed root', async () => {
      const other = join(tmp, 'elsewhere', 'steamapps')
      build(other)
      seed({ steamResumeTargetSteamappsDir: other })
      const r = await deleteCancelledSteamInstall('123', OPTS)
      expect(r.status).toBe('refused')
      expect(existsSync(join(other, 'common', 'Cool Game', 'a.bin'))).toBe(true)
      expect(existsSync(join(other, 'appmanifest_123.acf'))).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
    })

    it('ACF reports fully installed', async () => {
      build(steamapps, '4')
      const r = await deleteCancelledSteamInstall('123', OPTS)
      expect(r.status).toBe('refused')
      expect(allPresent()).toBe(true)
      expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
    })
  })

  it('keeps a shared installdir but removes this appId manifests', async () => {
    jest.mocked(findOtherManifestsWithInstalldir).mockReturnValue(['456'])
    const r = await deleteCancelledSteamInstall('123', OPTS)
    expect(r.status).toBe('deleted')
    expect(existsSync(join(steamapps, 'common', 'Cool Game', 'a.bin'))).toBe(
      true
    )
    expect(existsSync(join(steamapps, 'appmanifest_123.acf'))).toBe(false)
    expect(existsSync(join(steamapps, 'appmanifest_123.acf.tmp'))).toBe(false)
    expect(clearSteamResumeBreadcrumb).toHaveBeenCalledWith('123')
  })

  it('is fine with missing manifest files', async () => {
    rmSync(join(steamapps, 'appmanifest_123.acf'))
    rmSync(join(steamapps, 'appmanifest_123.acf.tmp'))
    const r = await deleteCancelledSteamInstall('123', OPTS)
    expect(r.status).toBe('deleted')
    expect(existsSync(join(steamapps, 'common', 'Cool Game'))).toBe(false)
  })

  it('never throws when getSteamLibraries rejects', async () => {
    jest.mocked(getSteamLibraries).mockRejectedValue(new Error('boom'))
    const r = await deleteCancelledSteamInstall('123', OPTS)
    expect(r.status).toBe('refused')
    expect(allPresent()).toBe(true)
  })
})
