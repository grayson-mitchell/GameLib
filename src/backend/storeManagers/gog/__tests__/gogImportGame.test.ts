/**
 * Wiring tests for GOGGame.importGame -- quick task 260907-ppy, closing items 1, 3
 * and 4 of `.planning/todos/pending/2026-08-24-importgame-does-not-validate-the-folder-matches-the-selected-game.md`.
 *
 * Live evidence: selecting Balrum (GOG `1769415595`) and pointing `importGame` at a
 * folder containing Endless Sky (`1829678475`) wrote Endless Sky's install record,
 * Balrum's orphan `GamesConfig/1769415595.json`, and a SUCCESS toast. `gogdl import`
 * takes no app-id argument, so `GOGGame.importGame` never compares the product id
 * gogdl reports (`data.appName`) against `this.id` -- the only place identity can be
 * enforced.
 *
 * Mock strategy mirrors library.test.ts: `resetMocks: true` in this project's
 * jest.config means every mock implementation must be re-established in beforeEach.
 * `games.ts` has ~28 import statements; every one of them is mocked below so the
 * module can load without pulling in real fs, real child_process, or the real
 * storeManagers index (which would hit the gog/user.ts circular-dependency trap).
 *
 * The harness resolving every module and actually driving `GOGGame.importGame` is
 * proven by the POSITIVE test (must be GREEN against UNFIXED code) -- only once that
 * passes are the MISMATCH / UNPARSEABLE / THROWN tests' RED failures trustworthy.
 */

const mockRunRunnerCommand = jest.fn()
const mockLibraryManagerImportGame = jest.fn()
const mockLibraryManagerGetGameInfo = jest.fn()

jest.mock('../../index', () => ({
  libraryManagerMap: {
    gog: {
      runRunnerCommand: (...a: unknown[]) => mockRunRunnerCommand(...a),
      importGame: (...a: unknown[]) => mockLibraryManagerImportGame(...a),
      getGameInfo: (...a: unknown[]) => mockLibraryManagerGetGameInfo(...a)
    }
  }
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  createGameLogWriter: jest.fn(() => ({ logInfo: jest.fn() })),
  getRunnerLogWriter: jest.fn(() => ({ logInfo: jest.fn() })),
  LogPrefix: { Gog: 'Gog', Backend: 'Backend' }
}))

jest.mock('../../../game_config', () => ({
  GameConfig: { get: jest.fn(() => ({ config: {}, getSettings: jest.fn() })) }
}))

jest.mock('../../../config', () => ({
  GlobalConfig: { get: jest.fn(() => ({ config: {} })) }
}))

jest.mock('../../../utils', () => ({
  errorHandler: jest.fn(),
  getFileSize: jest.fn(() => 0),
  spawnAsync: jest.fn(),
  moveOnUnix: jest.fn(),
  moveOnWindows: jest.fn(),
  shutdownWine: jest.fn(),
  sendProgressUpdate: jest.fn(),
  sendGameStatusUpdate: jest.fn(),
  getPathDiskSize: jest.fn(),
  getCometBin: jest.fn(),
  axiosClient: { get: jest.fn() }
}))

jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(() => false),
  rmSync: jest.fn()
}))

jest.mock('../electronStores', () => ({
  achievementStore: { get: jest.fn(), set: jest.fn() },
  configStore: { get: jest.fn(), get_nodefault: jest.fn(), set: jest.fn() },
  installedGamesStore: { get: jest.fn(() => []), set: jest.fn() },
  playtimeSyncQueue: {
    has: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  },
  privateBranchesStore: { get: jest.fn(() => '') },
  syncStore: { get: jest.fn(), set: jest.fn() }
}))

jest.mock('../user', () => ({
  GOGUser: {
    isLoggedIn: jest.fn(() => false),
    getCredentials: jest.fn(),
    logout: jest.fn(),
    getUserDetails: jest.fn()
  }
}))

jest.mock('../../../launcher', () => ({
  getKnownFixesEnvVariables: jest.fn(),
  getWinePath: jest.fn(),
  launchCleanup: jest.fn(),
  prepareLaunch: jest.fn(),
  prepareWineLaunch: jest.fn(),
  runWineCommand: jest.fn(),
  setupEnvVars: jest.fn(),
  setupWrapperEnvVars: jest.fn(),
  setupWrappers: jest.fn()
}))

const mockAddShortcutsUtil = jest.fn()
jest.mock('../../../shortcuts/shortcuts/shortcuts', () => ({
  addShortcuts: (...a: unknown[]) => mockAddShortcutsUtil(...a),
  removeShortcuts: jest.fn()
}))

jest.mock('../setup', () => ({ __esModule: true, default: jest.fn() }))

jest.mock('../../../shortcuts/nonesteamgame/nonesteamgame', () => ({
  removeNonSteamGame: jest.fn()
}))

jest.mock('shlex', () => ({
  __esModule: true,
  default: { split: jest.fn(() => []), join: jest.fn(() => '') }
}))

jest.mock('i18next', () => ({
  t: (_key: string, fallback: string) => fallback
}))

jest.mock('../../../dialog/dialog', () => ({
  showDialogBoxModalAuto: jest.fn()
}))

jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

jest.mock('backend/utils/compatibility_layers', () => ({
  getWineFlagsArray: jest.fn(),
  isUmuSupported: jest.fn()
}))

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() }
}))

jest.mock('backend/online_monitor', () => ({
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn()
}))

jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
  readFile: jest.fn()
}))

jest.mock('ini', () => ({
  __esModule: true,
  default: { parse: jest.fn(), stringify: jest.fn() }
}))

jest.mock('../redist', () => ({
  getRequiredRedistList: jest.fn(),
  updateRedist: jest.fn()
}))

jest.mock('child_process', () => ({
  spawn: jest.fn()
}))

jest.mock('backend/wiki_game_info/umu/utils', () => ({
  getUmuId: jest.fn()
}))

jest.mock('../constants', () => ({
  gogdlConfigPath: '/fake/gog_store/gogdlConfig',
  gogSupportPath: '/fake/gog_store/gogdlConfig/gog-support'
}))

jest.mock('backend/constants/environment', () => ({
  isLinux: false,
  isMac: false,
  isWindows: false
}))

jest.mock('backend/longLivedChildren', () => ({
  registerLongLivedChild: jest.fn()
}))

import GOGGame from '../games'
import type { GOGImportData } from 'common/types'

const GAME_ID = '1769415595' // Balrum -- the SELECTED game
const FOLDER_APP_ID = '1829678475' // Endless Sky -- the folder's actual game
const FOLDER_PATH = '/Users/u/GameLib/Endless Sky.app'

function importData(appName: string): GOGImportData {
  return {
    appName,
    buildId: 'build-1',
    title: 'Balrum',
    tasks: [],
    installedLanguage: 'en-US',
    platform: 'osx',
    versionName: '1.0.0',
    dlcs: []
  }
}

describe('GOGGame.importGame -- identity guard (260907-ppy)', () => {
  beforeEach(() => {
    mockRunRunnerCommand.mockResolvedValue({
      stdout: JSON.stringify(importData(GAME_ID)),
      stderr: '',
      abort: false
    })
    mockLibraryManagerImportGame.mockResolvedValue(undefined)
    mockLibraryManagerGetGameInfo.mockReturnValue(undefined)
    mockAddShortcutsUtil.mockResolvedValue(undefined)
  })

  // POSITIVE -- must be GREEN against UNFIXED code. This is the load-bearing test:
  // it proves the harness resolves every module and actually drives
  // GOGGame.importGame. Only once this passes are the RED failures below trustworthy.
  it('matching folder (this.id === data.appName) imports successfully', async () => {
    const data = importData(GAME_ID)
    mockRunRunnerCommand.mockResolvedValue({
      stdout: JSON.stringify(data),
      stderr: '',
      abort: false
    })

    const game = new GOGGame(GAME_ID)
    const result = await game.importGame(FOLDER_PATH)

    expect(mockLibraryManagerImportGame).toHaveBeenCalledTimes(1)
    expect(mockLibraryManagerImportGame).toHaveBeenCalledWith(
      data,
      FOLDER_PATH
    )
    expect(mockAddShortcutsUtil).toHaveBeenCalledTimes(1)
    expect(result.error).toBeUndefined()
    expect(result.abort).toBeFalsy()
  })

  // MISMATCH -- must be RED against unfixed code. Balrum selected, Endless Sky's
  // folder chosen.
  it('mismatched folder (this.id !== data.appName) is rejected and writes nothing', async () => {
    mockRunRunnerCommand.mockResolvedValue({
      stdout: JSON.stringify(importData(FOLDER_APP_ID)),
      stderr: '',
      abort: false
    })

    const game = new GOGGame(GAME_ID)
    const result = await game.importGame(FOLDER_PATH)

    expect(result.error).toEqual(expect.any(String))
    expect(result.error).not.toBe('')
    expect(mockLibraryManagerImportGame).not.toHaveBeenCalled()
    expect(mockAddShortcutsUtil).not.toHaveBeenCalled()
  })

  // UNPARSEABLE STDOUT -- must be RED against unfixed code. Today JSON.parse throws,
  // the catch logs, and a success-shaped res is returned.
  it('unparseable gogdl stdout is reported as a failure, not silently swallowed', async () => {
    mockRunRunnerCommand.mockResolvedValue({
      stdout: 'not json',
      stderr: '',
      abort: false
    })

    const game = new GOGGame(GAME_ID)
    const result = await game.importGame(FOLDER_PATH)

    expect(result.error).toEqual(expect.any(String))
    expect(mockLibraryManagerImportGame).not.toHaveBeenCalled()
  })

  // THROWN INSTALL-RECORD WRITE -- must be RED against unfixed code: the failure must
  // reach the user instead of being logged and reported as success. Also pins the
  // sibling case in the same test, per the plan: when addShortcuts rejects but the
  // record write SUCCEEDED, the result must have NO error -- expected GREEN-by-
  // accident today, kept as the regression pin for Task 2.
  it('a thrown install-record write surfaces as a failed import, but a thrown addShortcuts after a successful write does not', async () => {
    mockRunRunnerCommand.mockResolvedValue({
      stdout: JSON.stringify(importData(GAME_ID)),
      stderr: '',
      abort: false
    })
    mockLibraryManagerImportGame.mockRejectedValue(new Error('disk full'))

    const game = new GOGGame(GAME_ID)
    const throwingWriteResult = await game.importGame(FOLDER_PATH)

    expect(throwingWriteResult.error).toEqual(expect.any(String))

    // Sibling scenario: record write succeeds, addShortcuts throws.
    mockLibraryManagerImportGame.mockResolvedValue(undefined)
    mockAddShortcutsUtil.mockRejectedValue(new Error('icon conversion failed'))

    const shortcutFailureResult = await game.importGame(FOLDER_PATH)

    expect(shortcutFailureResult.error).toBeUndefined()
  })
})
