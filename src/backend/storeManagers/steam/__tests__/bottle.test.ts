/**
 * Unit tests for the dedicated Steam CrossOver bottle foundation module
 * (Phase 17 Plan 02) — path resolution, the provisioned-state signal, the
 * T-17-01 sanitizer chokepoint, and the GameSettings composition helper.
 *
 * Mock strategy follows steam/__tests__/games.test.ts:
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in each test
 *  - graceful-fs mocked (existsSync) — no real filesystem access
 *  - electron mocked (app.getPath) — backend/constants/paths imports it
 */
import { existsSync } from 'graceful-fs'
import { userHome } from 'backend/constants/paths'
import { GlobalConfig } from 'backend/config'
import { steamBottleConfigStore } from '../electronStores'
import {
  getBottleDir,
  getBottleSteamappsDir,
  isBottleProvisioned,
  sanitizeBottleName,
  getSteamBottleSettings
} from '../bottle'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import type { WineInstallation, GameSettings } from 'common/types'

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path')
  }
}))

jest.mock('graceful-fs', () => ({
  existsSync: jest.fn()
}))

jest.mock('../electronStores', () => ({
  steamBottleConfigStore: {
    get: jest.fn(),
    get_nodefault: jest.fn(),
    set: jest.fn()
  }
}))

jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

const mockedExistsSync = existsSync as jest.Mock
const mockedGetNodefault = steamBottleConfigStore.get_nodefault as jest.Mock
const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock

const defaultWine: WineInstallation = {
  bin: '/usr/bin/wine',
  name: 'Default Wine',
  type: 'wine'
}

describe('bottle.ts', () => {
  beforeEach(() => {
    mockedExistsSync.mockReset()
    mockedGetNodefault.mockReset()
    mockedGlobalConfigGet.mockReset()
  })

  describe('getBottleDir / getBottleSteamappsDir', () => {
    test('getBottleDir joins userHome + CrossOver Bottles path + name', () => {
      const dir = getBottleDir('GameLibSteam')
      expect(dir).toBe(
        `${userHome}/Library/Application Support/CrossOver/Bottles/GameLibSteam`
      )
    })

    test('getBottleSteamappsDir contains the bottle-scoped steamapps root', () => {
      const dir = getBottleSteamappsDir('GameLibSteam')
      expect(dir).toContain(
        'drive_c/Program Files (x86)/Steam/steamapps'
      )
      expect(dir).toContain('GameLibSteam')
    })
  })

  describe('isBottleProvisioned', () => {
    test('returns true when cxbottle.conf exists', () => {
      mockedExistsSync.mockReturnValue(true)
      expect(isBottleProvisioned('GameLibSteam')).toBe(true)
      expect(mockedExistsSync).toHaveBeenCalledWith(
        expect.stringContaining('cxbottle.conf')
      )
    })

    test('returns false when cxbottle.conf does not exist', () => {
      mockedExistsSync.mockReturnValue(false)
      expect(isBottleProvisioned('GameLibSteam')).toBe(false)
    })

    test('defaults to the stored bottle name when none is passed', () => {
      mockedGetNodefault.mockReturnValue('StoredBottle')
      mockedExistsSync.mockReturnValue(true)
      isBottleProvisioned()
      expect(mockedExistsSync).toHaveBeenCalledWith(
        expect.stringContaining('StoredBottle')
      )
    })

    test('defaults to DEFAULT_STEAM_BOTTLE_NAME when nothing is stored', () => {
      mockedGetNodefault.mockReturnValue(undefined)
      mockedExistsSync.mockReturnValue(false)
      isBottleProvisioned()
      expect(mockedExistsSync).toHaveBeenCalledWith(
        expect.stringContaining(DEFAULT_STEAM_BOTTLE_NAME)
      )
    })
  })

  describe('sanitizeBottleName', () => {
    test('a clean name passes through unchanged', () => {
      expect(sanitizeBottleName('GameLibSteam')).toBe('GameLibSteam')
    })

    test('rejects a path-traversal sequence', () => {
      expect(sanitizeBottleName('a/../b')).toBeNull()
    })

    test('rejects forward slashes', () => {
      expect(sanitizeBottleName('foo/bar')).toBeNull()
    })

    test('rejects backslashes', () => {
      expect(sanitizeBottleName('foo\\bar')).toBeNull()
    })

    test('rejects a NUL byte', () => {
      expect(sanitizeBottleName('foo\0bar')).toBeNull()
    })

    test('rejects an empty/whitespace-only name', () => {
      expect(sanitizeBottleName('')).toBeNull()
      expect(sanitizeBottleName('   ')).toBeNull()
    })

    test('trims surrounding whitespace on an otherwise-clean name', () => {
      expect(sanitizeBottleName('  GameLibSteam  ')).toBe('GameLibSteam')
    })
  })

  describe('getSteamBottleSettings', () => {
    test('falls back to DEFAULT_STEAM_BOTTLE_NAME and the global default Wine when nothing is stored', () => {
      mockedGetNodefault.mockReturnValue(undefined)
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () =>
          ({
            wineVersion: defaultWine
          }) as GameSettings
      })

      const settings = getSteamBottleSettings()
      expect(settings.wineCrossoverBottle).toBe(DEFAULT_STEAM_BOTTLE_NAME)
      expect(settings.wineVersion).toEqual(defaultWine)
    })

    test('uses the stored wineVersion/wineCrossoverBottle when present', () => {
      const storedWine: WineInstallation = {
        bin: '/opt/crossover/bin/wine',
        name: 'CrossOver',
        type: 'crossover'
      }
      mockedGetNodefault.mockImplementation((key: string) => {
        if (key === 'wineVersion') return storedWine
        if (key === 'wineCrossoverBottle') return 'CustomBottle'
        return undefined
      })
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () =>
          ({
            wineVersion: defaultWine
          }) as GameSettings
      })

      const settings = getSteamBottleSettings()
      expect(settings.wineCrossoverBottle).toBe('CustomBottle')
      expect(settings.wineVersion).toEqual(storedWine)
    })
  })
})
