import { axiosClient } from 'backend/utils'
import { app } from 'electron'
import { logError } from '../logger'
import * as utils from '../utils'
import { test_data } from './test_data/github-api-heroic-test-data.json'
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
    test('Simple version', async () => {
      jest.spyOn(axiosClient, 'get').mockResolvedValue(test_data)
      jest.spyOn(app, 'getVersion').mockReturnValueOnce('2.4.0')

      const releases = await utils.getLatestReleases()
      expect(releases).toMatchInlineSnapshot(`
        [
          {
            "body": "2.5.2 HOTFIX #2 Release",
            "html_url": "https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/releases/tag/v2.5.2",
            "id": 200,
            "name": "2.5.2 HOTFIX #2",
            "prerelease": false,
            "published_at": "2022-12-14T10:53:29Z",
            "tag_name": "v2.5.2",
            "type": "stable",
          },
          {
            "body": "2.6.0 Beta Release",
            "html_url": "https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/releases/tag/v2.6.0-beta.1",
            "id": 100,
            "name": "2.6.0 Beta",
            "prerelease": true,
            "published_at": "2022-13-14T10:53:29Z",
            "tag_name": "v2.6.0-beta.1",
            "type": "beta",
          },
        ]
      `)
    })

    test('Complex version', async () => {
      jest.spyOn(axiosClient, 'get').mockResolvedValue(test_data)
      jest.spyOn(app, 'getVersion').mockReturnValueOnce('2.5.5-beta.3')

      const releases = await utils.getLatestReleases()
      expect(releases).toMatchInlineSnapshot(`
        [
          {
            "body": "2.6.0 Beta Release",
            "html_url": "https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/releases/tag/v2.6.0-beta.1",
            "id": 100,
            "name": "2.6.0 Beta",
            "prerelease": true,
            "published_at": "2022-13-14T10:53:29Z",
            "tag_name": "v2.6.0-beta.1",
            "type": "beta",
          },
        ]
      `)
    })

    test('Empty version', async () => {
      jest.spyOn(axiosClient, 'get').mockResolvedValue(test_data)
      jest.spyOn(app, 'getVersion').mockReturnValueOnce('')

      const releases = await utils.getLatestReleases()
      expect(releases).toMatchInlineSnapshot(`[]`)
    })

    test('Fetching available releases fails', async () => {
      jest.spyOn(axiosClient, 'get').mockRejectedValue('Failed to fetch!')

      const releases = await utils.getLatestReleases()
      expect(logError).toBeCalledWith(
        ['Error when checking for Heroic updates', 'Failed to fetch!'],
        'Backend'
      )
      expect(releases).toMatchInlineSnapshot(`[]`)
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
