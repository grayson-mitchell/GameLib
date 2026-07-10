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
import { checkWineBeforeLaunch, downloadFile, spawnAsync } from 'backend/utils'
import { runWineCommand } from 'backend/launcher'
import { steamBottleConfigStore } from '../electronStores'
import {
  getBottleDir,
  getBottleSteamappsDir,
  getBottleSteamExePath,
  isBottleProvisioned,
  sanitizeBottleName,
  getSteamBottleSettings,
  provisionBottle,
  tellBottledSteamToInstall,
  tellBottledSteamToLaunch,
  tellBottledSteamToUninstall
} from '../bottle'
import { DEFAULT_STEAM_BOTTLE_NAME, STEAM_SETUP_EXE_URL } from '../constants'
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

jest.mock('backend/utils', () => ({
  checkWineBeforeLaunch: jest.fn(),
  downloadFile: jest.fn(),
  spawnAsync: jest.fn()
}))

jest.mock('backend/launcher', () => ({
  runWineCommand: jest.fn()
}))

jest.mock('backend/logger', () => ({
  getRunnerLogWriter: jest.fn().mockReturnValue({}),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

const mockedExistsSync = existsSync as jest.Mock
const mockedGetNodefault = steamBottleConfigStore.get_nodefault as jest.Mock
const mockedSet = steamBottleConfigStore.set as jest.Mock
const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockedSpawnAsync = spawnAsync as jest.Mock
const mockedDownloadFile = downloadFile as jest.Mock
const mockedCheckWineBeforeLaunch = checkWineBeforeLaunch as jest.Mock
const mockedRunWineCommand = runWineCommand as jest.Mock

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
    mockedSet.mockReset()
    mockedSpawnAsync.mockReset()
    mockedDownloadFile.mockReset()
    mockedCheckWineBeforeLaunch.mockReset()
    mockedRunWineCommand.mockReset()

    // Sensible defaults so provisionBottle()/dispatch tests that don't care
    // about GlobalConfig still have a valid GameSettings to compose from.
    mockedGlobalConfigGet.mockReturnValue({
      getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
    })
    mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    mockedDownloadFile.mockResolvedValue(undefined)
    mockedCheckWineBeforeLaunch.mockResolvedValue(true)
    mockedRunWineCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
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

  describe('provisionBottle', () => {
    test('rejects an unsafe bottle name and does NOT call downloadFile', async () => {
      mockedGetNodefault.mockReturnValue(undefined)

      const result = await provisionBottle({ bottleName: 'a/../b' })

      expect(result.status).toBe('error')
      expect(mockedDownloadFile).not.toHaveBeenCalled()
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
    })

    test('short-circuits to {status:"done"} when the bottle is already provisioned (no download, no create)', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      // isBottleProvisioned() reads existsSync — mock true so the
      // idempotent short-circuit fires before create/download.
      mockedExistsSync.mockReturnValue(true)

      const result = await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(result).toEqual({ status: 'done' })
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
      expect(mockedDownloadFile).not.toHaveBeenCalled()
    })

    test('downloads SteamSetup.exe from the HTTPS STEAM_SETUP_EXE_URL when un-provisioned', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      // First existsSync check (isBottleProvisioned pre-create) -> false so
      // we proceed to create; subsequent calls (cxbottle.conf post-create,
      // cached SteamSetup.exe check, final Steam.exe check) also false so
      // the create step runs and the download is attempted.
      mockedExistsSync.mockReturnValueOnce(false) // pre-create idempotent check
      mockedExistsSync.mockReturnValueOnce(true) // post-create cxbottle.conf confirm
      mockedExistsSync.mockReturnValueOnce(false) // cached SteamSetup.exe check
      mockedExistsSync.mockReturnValue(false) // final Steam.exe check

      const result = await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(result.status).toBe('done')
      expect(mockedDownloadFile).toHaveBeenCalledWith(
        expect.objectContaining({ url: STEAM_SETUP_EXE_URL })
      )
      expect(STEAM_SETUP_EXE_URL.startsWith('https://')).toBe(true)
    })

    test('runs SteamSetup.exe non-silently via runWineCommand with skipPrefixCheckIKnowWhatImDoing', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      mockedExistsSync.mockReturnValueOnce(false) // pre-create idempotent check
      mockedExistsSync.mockReturnValue(true) // everything after: provisioned/exists

      await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(mockedRunWineCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          commandParts: expect.arrayContaining([
            expect.stringContaining('SteamSetup.exe')
          ]),
          skipPrefixCheckIKnowWhatImDoing: true,
          wait: false
        })
      )
      const call = mockedRunWineCommand.mock.calls[0][0]
      expect(call.commandParts.some((p: string) => p === '/VERYSILENT')).toBe(
        false
      )
      expect(call.commandParts.some((p: string) => p === '/S')).toBe(false)
    })
  })

  describe('tellBottledSteamTo{Install,Launch,Uninstall}', () => {
    const BAD_APP_ID = '123; rm -rf /'
    const GOOD_APP_ID = '440'

    test('rejects a non-numeric appId for install without calling runWineCommand', async () => {
      const result = await tellBottledSteamToInstall(BAD_APP_ID)
      expect(result.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('rejects a non-numeric appId for launch without calling runWineCommand', async () => {
      const result = await tellBottledSteamToLaunch(BAD_APP_ID)
      expect(result.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('rejects a non-numeric appId for uninstall without calling runWineCommand', async () => {
      const result = await tellBottledSteamToUninstall(BAD_APP_ID)
      expect(result.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('returns an error (no spawn) when the bottle is not provisioned', async () => {
      mockedExistsSync.mockReturnValue(false) // isBottleProvisioned() -> false

      const installResult = await tellBottledSteamToInstall(GOOD_APP_ID)
      const launchResult = await tellBottledSteamToLaunch(GOOD_APP_ID)
      const uninstallResult = await tellBottledSteamToUninstall(GOOD_APP_ID)

      expect(installResult.status).toBe('error')
      expect(launchResult.status).toBe('error')
      expect(uninstallResult.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('launch dispatches -applaunch <appId> as discrete argv elements targeting the bottle Steam.exe', async () => {
      mockedExistsSync.mockReturnValue(true) // isBottleProvisioned() -> true
      mockedGetNodefault.mockReturnValue(undefined)

      const result = await tellBottledSteamToLaunch(GOOD_APP_ID)

      expect(result.status).toBe('done')
      const { commandParts } = mockedRunWineCommand.mock.calls[0][0]
      expect(commandParts[0]).toBe(getBottleSteamExePath(DEFAULT_STEAM_BOTTLE_NAME))
      expect(commandParts).toContain('-applaunch')
      expect(commandParts).toContain(GOOD_APP_ID)
    })

    test('install dispatches steam://install/<appId> targeting the bottle Steam.exe', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(undefined)

      const result = await tellBottledSteamToInstall(GOOD_APP_ID)

      expect(result.status).toBe('done')
      const { commandParts } = mockedRunWineCommand.mock.calls[0][0]
      expect(commandParts[0]).toBe(getBottleSteamExePath(DEFAULT_STEAM_BOTTLE_NAME))
      expect(
        commandParts.some((p: string) => p.includes(GOOD_APP_ID))
      ).toBe(true)
    })

    test('uninstall dispatches steam://uninstall/<appId> targeting the bottle Steam.exe', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(undefined)

      const result = await tellBottledSteamToUninstall(GOOD_APP_ID)

      expect(result.status).toBe('done')
      const { commandParts } = mockedRunWineCommand.mock.calls[0][0]
      expect(commandParts[0]).toBe(getBottleSteamExePath(DEFAULT_STEAM_BOTTLE_NAME))
      expect(
        commandParts.some((p: string) => p.includes(GOOD_APP_ID))
      ).toBe(true)
    })
  })
})
