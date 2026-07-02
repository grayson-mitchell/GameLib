import * as utils from '../utils'
import { readFileSync } from 'graceful-fs'

jest.mock('electron')
jest.mock('../logger')
jest.mock('../dialog/dialog')
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  readFileSync: jest.fn()
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
})
