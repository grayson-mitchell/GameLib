import * as utils from '../utils'
import { readFileSync, existsSync } from 'graceful-fs'
import { join } from 'path'

jest.mock('electron')
jest.mock('../logger')
jest.mock('../dialog/dialog')
jest.mock('../config')
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn()
}))

describe('backend/utils.ts', () => {
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
      const result = await utils.getCurrentChangelog()
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

      const result = await utils.getCurrentChangelog()

      expect(result).toEqual(mockRelease)
    })

    it('returns null on file read failure', async () => {
      ;(readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory')
      })

      const result = await utils.getCurrentChangelog()

      expect(result).toBeNull()
    })
  })

  describe('archSpecificBinary — existence-checked x64 fallback (Phase 34.5 G-1, plan 34.5-17)', () => {
    // Deviation from the plan's literal suggestion of `jest.isolateModules`:
    // this suite instead drives each behaviour row through a DIFFERENT
    // exported getter (getLegendaryBin / getGOGdlBin / getCometBin), each of
    // which memoises into its OWN module-scope `let` (defaultLegendaryPath /
    // defaultGogdlPath / defaultCometPath respectively) -- so no case can
    // ever observe another case's memoised result, without needing a fresh
    // module instance. `jest.isolateModules` was tried first and rejected:
    // forcing `../utils` through a fresh module registry re-evaluates
    // `constants/paths.ts`'s module-scope `app.getPath(...)` calls, and this
    // file's own top-level `import * as utils from '../utils'` had already
    // forced Electron's manual mock through Jest's mock resolution once
    // (before any test ran) -- `jest.requireActual`/`jest.doMock('electron',
    // ...)` inside the isolated sandbox kept returning that SAME, already
    // `resetMocks`-stripped `app.getPath` `jest.fn()` instance rather than an
    // independently-implemented copy, repeatably reproduced across several
    // isolation attempts. Reusing the already-successfully-loaded outer
    // `utils` module (whose `publicDir` was already computed correctly, once,
    // before the first reset) and varying only the mocked `existsSync` sidesteps
    // that Jest mock-identity behaviour entirely.
    it('returns the arch-native path when it exists (unchanged behaviour)', () => {
      ;(existsSync as jest.Mock).mockImplementation(() => true)

      const { dir, bin } = utils.getLegendaryBin()

      expect(join(dir, bin)).toContain(join('bin', process.arch))
    })

    it('falls back to the x64 path when the arch-native path is missing but x64 exists (unchanged behaviour -- the documented box64 compatibility-layer case)', () => {
      ;(existsSync as jest.Mock).mockImplementation((path: string) => {
        // Arch-native candidate absent, x64 candidate present.
        return !path.includes(join('bin', process.arch))
      })

      const { dir, bin } = utils.getGOGdlBin()

      expect(join(dir, bin)).toContain(join('bin', 'x64'))
      expect(join(dir, bin)).not.toContain(join('bin', process.arch))
    })

    it('throws naming both attempted paths and the binary name when both candidates are missing', () => {
      ;(existsSync as jest.Mock).mockImplementation(() => false)

      let thrown: unknown
      try {
        utils.getCometBin()
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
})
