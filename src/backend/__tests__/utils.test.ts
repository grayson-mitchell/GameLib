import * as utils from '../utils'
import { readFileSync, existsSync } from 'graceful-fs'
import { join } from 'path'
import { rm } from 'fs/promises'

import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { createTestHostServices } from 'backend/testUtils/testHostServices'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { stubRustSteamFiles } from 'backend/storeManagers/steam/localFiles/__tests__/fixtures/stubRustSteamFiles'
import type { LibraryFoldersResult } from 'backend/storeManagers/steam/localFiles/steamFilesTypes'
import { logDebug } from '../logger'
jest.mock('../logger')
jest.mock('../dialog/dialog')
jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  rm: jest.fn()
}))
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn()
}))

const paths = createTestAppPaths('/fake/root')
const cfgDeps = { config: createTestGlobalConfig(), paths }

describe('backend/utils.ts', () => {
  describe('removeFolder', () => {
    it('removes the contained target once, with retries and no timer', async () => {
      jest.mocked(rm).mockResolvedValue(undefined)
      const timer = jest.spyOn(global, 'setTimeout')
      await utils.removeFolder(cfgDeps, '/abs/root', 'Game')
      expect(rm).toHaveBeenCalledTimes(1)
      expect(rm).toHaveBeenCalledWith(join('/abs/root', 'Game'), {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200
      })
      expect(timer).not.toHaveBeenCalled()
      timer.mockRestore()
    })

    it('rejects a relative parent path', async () => {
      await expect(
        utils.removeFolder(cfgDeps, 'relative', 'Game')
      ).rejects.toThrow()
      expect(rm).not.toHaveBeenCalled()
    })

    it('refuses a folder name that escapes the root', async () => {
      await utils.removeFolder(cfgDeps, '/abs/root', '../escape')
      expect(rm).not.toHaveBeenCalled()
    })
  })

  test('quoteIfNeccessary', () => {
    const testCases = new Map<string, string>([
      ['path/without/spaces', 'path/without/spaces'],
      ['path/with /spaces', '"path/with /spaces"'],
      ['"path/quoted/without/spaces"', '"path/quoted/without/spaces"'],
      ['"path/quoted/with /spaces"', '"path/quoted/with /spaces"']
    ])

    testCases.forEach((expectString, inputString) => {
      expect(utils.quoteIfNecessary(inputString)).toStrictEqual(expectString)
    })
  })

  test('removeQuotesIfNeccessary', () => {
    const testCases = new Map<string, string>([
      ['path/without/quotes', 'path/without/quotes'],
      ['"path/with/quotes"', 'path/with/quotes']
    ])

    testCases.forEach((expectString, inputString) => {
      expect(utils.removeQuoteIfNecessary(inputString)).toStrictEqual(
        expectString
      )
    })
  })

  test('semverGt', () => {
    // target: vx.x.x or vx.x.x-beta.x
    // base: x.x.x or x.x.x-beta.x

    const testCases = new Map<{ target: string; base: string }, boolean>([
      [{ target: 'v2.3.10', base: '2.4.0-beta.1' }, false],
      [{ target: 'v2.3.10', base: '2.4.0' }, false],
      [{ target: 'v2.3.10', base: '2.3.9' }, true],
      [{ target: 'v2.3.10', base: '2.3.9-beta.3' }, true],
      [{ target: 'v2.4.0-beta.1', base: '2.3.10' }, true],
      [{ target: 'v2.4.0-beta.1', base: '2.4.0' }, false],
      [{ target: 'v2.4.0-beta.2', base: '2.4.0-beta.1' }, true],
      [{ target: 'v2.4.0-beta.1', base: '2.4.0-beta.2' }, false],
      [{ target: undefined as any, base: undefined as any }, false]
    ])

    testCases.forEach((expectValue, versions) => {
      expect(
        utils.testingExportsUtils.semverGt(versions.target, versions.base)
      ).toBe(expectValue)
    })
  })

  describe('getLatestReleases', () => {
    it('returns empty array (update check suppressed until GameLib release pipeline ships)', async () => {
      const result = await utils.getLatestReleases()
      expect(result).toEqual([])
    })
  })

  describe('getCurrentChangelog', () => {
    it('returns null in e2e CI mode', async () => {
      const originalCI = process.env.CI
      process.env.CI = 'e2e'
      const result = await utils.getCurrentChangelog({ paths })
      expect(result).toBeNull()
      process.env.CI = originalCI
    })

    it('reads Release from local bundled file (not GitHub API)', async () => {
      const mockRelease = {
        id: 1,
        type: 'stable',
        tag_name: 'gamelib-v1.0.0',
        name: 'GameLib 1.0.0',
        html_url:
          'https://github.com/grayson-mitchell/GameLib/releases/tag/gamelib-v1.0.0',
        published_at: '2026-06-30T00:00:00Z',
        prerelease: false,
        body: '## GameLib 1.0.0\n\nTest changelog body'
      }
      ;(readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockRelease))

      const result = await utils.getCurrentChangelog({ paths })

      expect(result).toEqual(mockRelease)
    })

    it('returns null on file read failure', async () => {
      ;(readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory')
      })

      const result = await utils.getCurrentChangelog({ paths })

      expect(result).toBeNull()
    })
  })

  describe('archSpecificBinary — existence-checked x64 fallback (Phase 34.5 G-1, plan 34.5-17)', () => {
    // The binary path is computed on every call from the injected paths slice (66.4-12): no
    // module-scope memo, so each case is independent of the others.
    const originalArch = process.arch
    const setArch = (arch: string) =>
      Object.defineProperty(process, 'arch', {
        value: arch,
        configurable: true
      })

    afterEach(() => setArch(originalArch))

    it('returns the arch-native path when it exists (unchanged behaviour)', () => {
      ;(existsSync as jest.Mock).mockImplementation(() => true)

      const { dir, bin } = utils.getLegendaryBin(cfgDeps)

      expect(join(dir, bin)).toContain(join('bin', process.arch))
    })

    // The premise ("arch-native missing, x64 present") is UNCONSTRUCTIBLE on an x64 host: on
    // x64, `archSpecificBinary`'s arch-native candidate (built from process.arch, utils.ts:544)
    // and its x64 fallback (built from the literal 'x64') are the SAME path, so the mock below
    // denies both and the production code correctly throws "neither exists on disk" -- the
    // Linux CI runner is x64, and the 2026-09-15 log's failure printed those two byte-identical
    // paths. This is therefore NOT a darwin-vs-linux (process.platform) defect, it is a
    // non-x64-vs-x64 (process.arch) one, and would fail identically on an x64 Mac while passing
    // on arm64 Linux. Pinning a non-x64 arch makes the two candidates distinct on every host.
    // A process.platform guard here would be WRONG: it would be a green check proving nothing on
    // every Intel Mac, and would silently stop exercising the documented box64 x64-fallback case
    // on arm64 Linux -- the exact platform this case is about (quick-260921-o95).
    it('falls back to the x64 path when the arch-native path is missing but x64 exists (unchanged behaviour -- the documented box64 compatibility-layer case)', () => {
      setArch('arm64')
      ;(existsSync as jest.Mock).mockImplementation((path: string) => {
        // Arch-native candidate absent, x64 candidate present.
        return !path.includes(join('bin', process.arch))
      })

      const { dir, bin } = utils.getGOGdlBin(cfgDeps)

      expect(join(dir, bin)).toContain(join('bin', 'x64'))
      expect(join(dir, bin)).not.toContain(join('bin', process.arch))
    })

    it('throws naming both attempted paths and the binary name when both candidates are missing', () => {
      ;(existsSync as jest.Mock).mockImplementation(() => false)

      let thrown: unknown
      try {
        utils.getCometBin(cfgDeps)
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(Error)
      const message = (thrown as Error).message
      expect(message).toContain('comet')
      expect(message).toContain(join('bin', process.arch, process.platform))
      expect(message).toContain(join('bin', 'x64', process.platform))
    })
  })

  describe('archSpecificBinary — macOS onedir layout (Phase 34.9)', () => {
    // Calls `archSpecificBinary` DIRECTLY, not through a getter: each call is independent.
    const originalPlatform = process.platform
    const originalArch = process.arch

    const setPlatform = (platform: string) => {
      Object.defineProperty(process, 'platform', {
        value: platform,
        configurable: true
      })
    }
    const setArch = (arch: string) => {
      Object.defineProperty(process, 'arch', {
        value: arch,
        configurable: true
      })
    }

    afterEach(() => {
      setPlatform(originalPlatform)
      setArch(originalArch)
    })

    it.each(['nile', 'legendary', 'gogdl'])(
      'darwin + arm64, all paths exist -- %s resolves to the nested path',
      (runner) => {
        setPlatform('darwin')
        setArch('arm64')
        ;(existsSync as jest.Mock).mockImplementation(() => true)

        const result = utils.archSpecificBinary(runner, paths)

        expect(
          result.endsWith(join('bin', 'arm64', 'darwin', runner, runner))
        ).toBe(true)
      }
    )

    it('darwin + arm64, all paths exist -- comet stays flat, no nested segment', () => {
      setPlatform('darwin')
      setArch('arm64')
      ;(existsSync as jest.Mock).mockImplementation(() => true)

      const result = utils.archSpecificBinary('comet', paths)

      expect(result.endsWith(join('bin', 'arm64', 'darwin', 'comet'))).toBe(
        true
      )
      expect(result.endsWith(join('comet', 'comet'))).toBe(false)
    })

    it('linux + x64, all paths exist -- nile stays flat, unchanged', () => {
      setPlatform('linux')
      setArch('x64')
      ;(existsSync as jest.Mock).mockImplementation(() => true)

      const result = utils.archSpecificBinary('nile', paths)

      expect(result.endsWith(join('bin', 'x64', 'linux', 'nile'))).toBe(true)
    })

    it('win32 + x64, all paths exist -- nile stays flat with .exe, unchanged', () => {
      setPlatform('win32')
      setArch('x64')
      ;(existsSync as jest.Mock).mockImplementation(() => true)

      const result = utils.archSpecificBinary('nile', paths)

      expect(result.endsWith(join('bin', 'x64', 'win32', 'nile.exe'))).toBe(
        true
      )
    })

    it('darwin + arm64, only the x64 nested candidate exists -- falls back to the x64 NESTED path (shape preserved)', () => {
      setPlatform('darwin')
      setArch('arm64')
      ;(existsSync as jest.Mock).mockImplementation((path: string) =>
        path.includes(join('bin', 'x64'))
      )

      const result = utils.archSpecificBinary('gogdl', paths)

      expect(
        result.endsWith(join('bin', 'x64', 'darwin', 'gogdl', 'gogdl'))
      ).toBe(true)
    })

    it('darwin + arm64, only the stale FLAT layout exists -- throws naming the fix and both paths', () => {
      setPlatform('darwin')
      setArch('arm64')
      ;(existsSync as jest.Mock).mockImplementation((path: string) => {
        // Only the flat pre-34.9 path exists; neither nested candidate
        // (which ends `.../nile/nile`) exists.
        return (
          path.endsWith(join('darwin', 'nile')) &&
          !path.endsWith(join('nile', 'nile'))
        )
      })

      let thrown: unknown
      try {
        utils.archSpecificBinary('nile', paths)
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(Error)
      const message = (thrown as Error).message
      expect(message).toContain('pnpm download-helper-binaries')
      expect(message).toContain(join('arm64', 'darwin', 'nile'))
      expect(message).toContain(join('arm64', 'darwin', 'nile', 'nile'))
    })

    it('darwin + arm64, nothing exists -- throws the generic not-found message naming both nested candidates', () => {
      setPlatform('darwin')
      setArch('arm64')
      ;(existsSync as jest.Mock).mockImplementation(() => false)

      let thrown: unknown
      try {
        utils.archSpecificBinary('nile', paths)
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(Error)
      const message = (thrown as Error).message
      expect(message).toContain('nile')
      expect(message).toContain(join('arm64', 'darwin', 'nile', 'nile'))
      expect(message).toContain(join('x64', 'darwin', 'nile', 'nile'))
    })
  })

  describe('get*Bin resolution without a memo (66.4-12)', () => {
    afterEach(() => {
      cfgDeps.config.resetToDefaults()
    })

    it.each([
      ['getLegendaryBin', utils.getLegendaryBin, 'legendary'],
      ['getGOGdlBin', utils.getGOGdlBin, 'gogdl'],
      ['getCometBin', utils.getCometBin, 'comet'],
      ['getNileBin', utils.getNileBin, 'nile']
    ] as const)(
      '%s resolves under paths.publicDir and returns the same value twice',
      (_name, getter, runner) => {
        ;(existsSync as jest.Mock).mockImplementation(() => true)

        const first = getter(cfgDeps)
        const second = getter(cfgDeps)

        expect(first).toEqual(second)
        expect(join(first.dir, first.bin)).toContain(
          join(paths.publicDir, 'bin')
        )
        expect(first.bin).toContain(runner)
      }
    )

    it('follows a different publicDir on the next call (nothing is remembered)', () => {
      ;(existsSync as jest.Mock).mockImplementation(() => true)
      const other = createTestAppPaths('/fake/other', {
        publicDir: '/elsewhere/public'
      })

      const a = utils.getLegendaryBin({ ...cfgDeps, paths })
      const b = utils.getLegendaryBin({ ...cfgDeps, paths: other })

      expect(join(a.dir, a.bin)).toContain(paths.publicDir)
      expect(join(b.dir, b.bin)).toContain('/elsewhere/public')
    })
  })

  describe('alt*Bin overrides bypass archSpecificBinary (Phase 34.9 REQ-34.9-07)', () => {
    // altLegendaryBin/altGogdlBin/altNileBin are a power-user escape hatch:
    // they bypass archSpecificBinary entirely and may point at the user's
    // own flat onefile binary. This phase's onedir branch lives entirely
    // inside archSpecificBinary, so these overrides must never touch it --
    // asserted here as existsSync never being called during the getter.
    afterEach(() => {
      cfgDeps.config.resetToDefaults()
    })

    it('altNileBin bypasses archSpecificBinary entirely', () => {
      cfgDeps.config.setSetting(
        'altNileBin',
        '/Users/dev/custom/nile',
        undefined as never
      )
      jest.clearAllMocks()

      const { dir, bin } = utils.getNileBin(cfgDeps)

      expect(dir).toBe('/Users/dev/custom')
      expect(bin).toBe('nile')
      expect((existsSync as jest.Mock).mock.calls.length).toBe(0)
    })

    it('altLegendaryBin bypasses archSpecificBinary entirely', () => {
      cfgDeps.config.setSetting(
        'altLegendaryBin',
        '/Users/dev/custom/legendary',
        undefined as never
      )
      jest.clearAllMocks()

      const { dir, bin } = utils.getLegendaryBin(cfgDeps)

      expect(dir).toBe('/Users/dev/custom')
      expect(bin).toBe('legendary')
      expect((existsSync as jest.Mock).mock.calls.length).toBe(0)
    })

    it('altGogdlBin bypasses archSpecificBinary entirely', () => {
      cfgDeps.config.setSetting(
        'altGogdlBin',
        '/Users/dev/custom/gogdl',
        undefined as never
      )
      jest.clearAllMocks()

      const { dir, bin } = utils.getGOGdlBin(cfgDeps)

      expect(dir).toBe('/Users/dev/custom')
      expect(bin).toBe('gogdl')
      expect((existsSync as jest.Mock).mock.calls.length).toBe(0)
    })
  })
})

describe('errorHandler takes its manager table by deps (66.1-23)', () => {
  const host = createTestHostServices()
  const throwingTable = {
    sendFrontendMessage: jest.fn(),
    dialogs: host.dialogs,
    appState: host.appState,
    get libraryManagers(): never {
      throw new Error(
        'errorHandler read libraryManagers on a branch that never needs it'
      )
    }
  }

  it('resolves without reading the manager table when no deleted-folder branch is hit', async () => {
    await expect(
      utils.errorHandler(
        throwingTable,
        'RequestsDependencyWarning',
        'g1',
        'gog'
      )
    ).resolves.toBeUndefined()
    await expect(
      utils.errorHandler(
        throwingTable,
        'Process terminated with signal SIGTERM',
        'g1',
        'gog'
      )
    ).resolves.toBeUndefined()
  })

  it('the deleted-folder branch looks the game up once, by runner and appName', async () => {
    const getGame = jest.fn(() => ({
      getGameInfo: () => ({ title: 'Gone' }),
      forceUninstall: jest.fn()
    }))
    let reads = 0
    const deps = {
      sendFrontendMessage: jest.fn(),
      dialogs: host.dialogs,
      appState: host.appState,
      get libraryManagers() {
        reads++
        return { gog: { getGame } } as never
      }
    }

    // askForceUninstall's dialog is the platform mock here (not scripted), so it may reject
    // after the lookup; the lookup itself is the contract under test.
    await utils
      .errorHandler(deps, 'x appears to be deleted', 'g1', 'gog')
      .catch(() => undefined)

    expect(reads).toBe(1)
    expect(getGame).toHaveBeenCalledTimes(1)
    expect(getGame).toHaveBeenCalledWith('g1')
  })
})

describe('getSteamLibraries, rust branch', () => {
  const steamConfig = () =>
    createTestGlobalConfig({ defaultSteamPath: "'/home/u/.steam/steam'" })
  const libs = (over: Partial<LibraryFoldersResult>): LibraryFoldersResult => ({
    exists: true,
    parsed: true,
    readError: null,
    paths: [],
    ...over
  })

  it('reads libraryfolders.vdf through Rust, system path first, filtering paths that do not exist', async () => {
    jest
      .mocked(existsSync)
      .mockImplementation((p) => p === '/usr/share/steam' || p === '/lib/a')
    const stub = stubRustSteamFiles({
      steamfiles_read_library_folders: () =>
        libs({ paths: ['/lib/a', '/lib/gone'] })
    })

    const result = await utils.getSteamLibraries({
      config: steamConfig(),
      ...stub
    })

    expect(result).toEqual(['/usr/share/steam', '/lib/a'])
    expect(stub.calls).toEqual([
      {
        channel: 'steamfiles_read_library_folders',
        args: {
          path: join('/home/u/.steam/steam', 'steamapps', 'libraryfolders.vdf')
        }
      }
    ])
  })

  it('returns only the system path and logs when the file is missing', async () => {
    const stub = stubRustSteamFiles({
      steamfiles_read_library_folders: () =>
        libs({ exists: false, parsed: false })
    })

    const result = await utils.getSteamLibraries({
      config: steamConfig(),
      ...stub
    })

    expect(result).toEqual(['/usr/share/steam'])
    expect(logDebug).toHaveBeenCalledWith(
      'Unable to load Steam Libraries, libraryfolders.vdf not found',
      expect.anything()
    )
  })

  it('returns only the system path for an unparsable file and when the invoke rejects', async () => {
    const unparsed = stubRustSteamFiles({
      steamfiles_read_library_folders: () =>
        libs({ parsed: false, readError: 'bad' })
    })
    await expect(
      utils.getSteamLibraries({ config: steamConfig(), ...unparsed })
    ).resolves.toEqual(['/usr/share/steam'])

    const rejecting = stubRustSteamFiles({})
    await expect(
      utils.getSteamLibraries({ config: steamConfig(), ...rejecting })
    ).resolves.toEqual(['/usr/share/steam'])
  })
})
