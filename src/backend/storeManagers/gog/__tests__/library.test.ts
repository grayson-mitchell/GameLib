/**
 * Regression coverage for debug/gog-spawn-reduction.md fixes 2 and 4.
 *
 * Fix 2: `GOGLibraryManager.refresh()` used to fetch credentials, then call
 * `getGalaxyLibrary()`, which independently re-fetched them -- live-log-confirmed as
 * TWO `gogdl auth`-class spawns 4s apart in a single refresh cycle. `getGalaxyLibrary()`'s
 * pagination recursion also re-derived credentials on every page. These tests pin the
 * fix: credentials are fetched once by `refresh()` and threaded through
 * `getGalaxyLibrary()` (including every recursive pagination call), never re-fetched.
 *
 * Fix 4: `getInstallInfo()` used to call `GOGUser.getCredentials()` purely as a login
 * gate -- the returned value was never used anywhere else in the function, and the
 * downstream `gogdl info` CLI call manages its own auth independently from the same
 * auth-config-path file. These tests pin the fix: the gate is now `GOGUser.isLoggedIn()`
 * (a synchronous local config read, zero subprocess spawns), and `getCredentials()` is
 * never called from `getInstallInfo()`.
 *
 * Mock strategy mirrors user.test.ts: `resetMocks: true` in this project's jest.config
 * means all mock implementations must be re-established in beforeEach. `../index` (the
 * storeManagers map) is mocked out entirely -- importing it for real pulls in every
 * store manager (including SteamLibraryManager) and hits the circular-dependency trap
 * documented in gog/user.ts's own load-bearing comments.
 */

const mockGetCredentials = jest.fn()
const mockIsLoggedIn = jest.fn()

jest.mock('../user', () => ({
  GOGUser: {
    getCredentials: mockGetCredentials,
    isLoggedIn: mockIsLoggedIn,
    logout: jest.fn(),
    getUserDetails: jest.fn()
  }
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  getRunnerLogWriter: jest.fn(() => ({ logInfo: jest.fn() })),
  LogPrefix: { Gog: 'Gog', ExtraGameInfo: 'ExtraGameInfo' }
}))

jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

const mockIsOnline = jest.fn(() => true)
jest.mock('../../../online_monitor', () => ({
  isOnline: () => mockIsOnline(),
  runOnceWhenOnline: jest.fn()
}))

const mockCallRunner = jest.fn()
jest.mock('../../../launcher', () => ({
  callRunner: (...args: unknown[]) => mockCallRunner(...args)
}))

// See the note above `mockPrivateBranchesStoreGet` -- `resetMocks: true` wipes this
// factory-time default too. Default is (re)installed in beforeEach below instead.
const mockGetGOGdlBin = jest.fn()
jest.mock('../../../utils', () => ({
  getGOGdlBin: () => mockGetGOGdlBin(),
  getFileSize: jest.fn(() => 0),
  axiosClient: { get: jest.fn() }
}))

// Plain `jest.fn(() => ...)` defaults at factory time do NOT survive: this suite's
// jest.config.js sets `resetMocks: true`, which wipes any implementation configured at
// factory time before the FIRST test even runs (see user.test.ts's identical note on
// `mockConfigStoreGetNodefault`). Defaults are (re)installed in beforeEach below instead
// -- declared as bare `jest.fn()` here (rather than `jest.fn(() => [])`) so TS infers a
// variadic signature that `(...a) => mockX(...a)` can spread into below.
const mockLibraryStoreGet = jest.fn()
const mockInstalledGamesStoreGet = jest.fn()
const mockInstallInfoStoreHas = jest.fn()
const mockPrivateBranchesStoreGet = jest.fn()
jest.mock('../electronStores', () => ({
  libraryStore: {
    get: (...a: unknown[]) => mockLibraryStoreGet(...a),
    set: jest.fn()
  },
  installedGamesStore: {
    get: (...a: unknown[]) => mockInstalledGamesStoreGet(...a),
    set: jest.fn()
  },
  installInfoStore: {
    has: (...a: unknown[]) => mockInstallInfoStoreHas(...a),
    get: jest.fn(),
    set: jest.fn()
  },
  apiInfoCache: {
    get: jest.fn(),
    set: jest.fn(),
    use_in_memory: jest.fn(),
    commit: jest.fn()
  },
  privateBranchesStore: {
    get: (...a: unknown[]) => mockPrivateBranchesStoreGet(...a)
  },
  configStore: { get_nodefault: jest.fn(), set: jest.fn(), clear: jest.fn() },
  playtimeSyncQueue: {
    has: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  }
}))

jest.mock('../redist', () => ({ checkForRedistUpdates: jest.fn() }))
jest.mock('../e2eMock', () => ({ runGogdlCommandStub: jest.fn() }))
jest.mock('../constants', () => ({
  gogdlConfigPath: '/fake/gog_store/gogdlConfig',
  gogdlAuthConfig: '/fake/gog_store/auth.json'
}))
jest.mock('backend/constants/paths', () => ({ userDataPath: '/fake/userData' }))
jest.mock('../games', () => ({ __esModule: true, default: class GOGGame {} }))
jest.mock('../../index', () => ({ libraryManagerMap: {} }))
jest.mock('i18next', () => ({ languages: ['en'], language: 'en' }))

const mockedAxiosGet = jest.fn()
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: (...a: unknown[]) => mockedAxiosGet(...a) }
}))

import GOGLibraryManager from '../library'
import { GOGUser } from '../user'
import type { GOGCredentials, Library } from 'common/types/gog'

const fakeCredentials: GOGCredentials = {
  access_token: 'test-access-token',
  expires_in: 3600,
  token_type: 'bearer',
  scope: 'read',
  session_id: 'session-1',
  refresh_token: 'refresh-1',
  user_id: 'user-1',
  loginType: 1
}

function libraryPage(
  items: Library['items'],
  next_page_token?: string
): { data: Library } {
  return {
    data: { total_count: items.length, limit: 50, items, next_page_token }
  }
}

describe('debug/gog-spawn-reduction fix 2 -- credentials threaded through getGalaxyLibrary', () => {
  let manager: GOGLibraryManager

  beforeEach(() => {
    manager = new GOGLibraryManager()
    mockIsOnline.mockReturnValue(true)
    mockLibraryStoreGet.mockReturnValue([])
    mockInstalledGamesStoreGet.mockReturnValue([])
  })

  it('getGalaxyLibrary(credentials) never calls GOGUser.getCredentials() -- it uses the credentials passed in', async () => {
    mockedAxiosGet.mockResolvedValueOnce(libraryPage([]))

    // getGalaxyLibrary is private; cast to call it directly, mirroring the
    // class's own internal recursive call shape.
    const result = await (
      manager as unknown as {
        getGalaxyLibrary: (
          credentials: GOGCredentials,
          page_token?: string
        ) => Promise<unknown[]>
      }
    ).getGalaxyLibrary(fakeCredentials)

    expect(result).toEqual([])
    expect(mockGetCredentials).not.toHaveBeenCalled()
    expect(mockedAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining(`/users/${fakeCredentials.user_id}/releases`),
      expect.objectContaining({
        headers: { Authorization: `Bearer ${fakeCredentials.access_token}` }
      })
    )
  })

  it('pagination recursion reuses the SAME credentials across every page -- no re-fetch per page', async () => {
    const pageOneEntry = {
      platform_id: 'gog',
      external_id: '1',
      origin: 'galaxy',
      owned: true,
      date_created: 0,
      owned_since: null,
      certificate: 'cert1'
    }
    const pageTwoEntry = { ...pageOneEntry, external_id: '2' }

    mockedAxiosGet
      .mockResolvedValueOnce(libraryPage([pageOneEntry], 'page-2-token'))
      .mockResolvedValueOnce(libraryPage([pageTwoEntry]))

    const result = await (
      manager as unknown as {
        getGalaxyLibrary: (
          credentials: GOGCredentials,
          page_token?: string
        ) => Promise<unknown[]>
      }
    ).getGalaxyLibrary(fakeCredentials)

    expect(result).toHaveLength(2)
    expect(mockedAxiosGet).toHaveBeenCalledTimes(2)
    // Every page's request used the same passed-in credentials -- proves the
    // recursive call threaded them through rather than re-deriving them.
    for (const call of mockedAxiosGet.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          headers: { Authorization: `Bearer ${fakeCredentials.access_token}` }
        })
      )
    }
    expect(mockedAxiosGet).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('page_token=page-2-token'),
      expect.anything()
    )
    expect(mockGetCredentials).not.toHaveBeenCalled()
  })

  it('refresh() fetches credentials exactly once and passes them directly into getGalaxyLibrary()', async () => {
    mockIsLoggedIn.mockReturnValue(true)
    mockGetCredentials.mockResolvedValueOnce(fakeCredentials)
    mockLibraryStoreGet.mockReturnValue([])
    mockInstalledGamesStoreGet.mockReturnValue([])

    const getGalaxyLibrarySpy = jest
      .spyOn(
        GOGLibraryManager.prototype as unknown as {
          getGalaxyLibrary: (credentials: GOGCredentials) => Promise<unknown[]>
        },
        'getGalaxyLibrary'
      )
      .mockResolvedValueOnce([])

    await manager.refresh()

    // THE regression this test exists to catch: exactly ONE getCredentials()
    // call per refresh cycle, not two (the previous back-to-back live-log-
    // confirmed defect), and getGalaxyLibrary() receives that SAME object.
    expect(GOGUser.getCredentials).toHaveBeenCalledTimes(1)
    expect(getGalaxyLibrarySpy).toHaveBeenCalledWith(fakeCredentials)

    getGalaxyLibrarySpy.mockRestore()
  })
})

describe('debug/gog-spawn-reduction fix 4 -- getInstallInfo() login gate is isLoggedIn(), not getCredentials()', () => {
  let manager: GOGLibraryManager

  beforeEach(() => {
    manager = new GOGLibraryManager()
    mockIsOnline.mockReturnValue(true)
    mockInstallInfoStoreHas.mockReturnValue(false)
    mockInstalledGamesStoreGet.mockReturnValue([])
    mockPrivateBranchesStoreGet.mockReturnValue('')
    mockGetGOGdlBin.mockReturnValue({ dir: '/fake', bin: 'gogdl' })
  })

  it('returns early via isLoggedIn() when not logged in -- never calls GOGUser.getCredentials()', async () => {
    mockIsLoggedIn.mockReturnValue(false)

    const result = await manager.getInstallInfo('123')

    expect(result).toBeUndefined()
    expect(mockIsLoggedIn).toHaveBeenCalled()
    expect(mockGetCredentials).not.toHaveBeenCalled()
    expect(mockCallRunner).not.toHaveBeenCalled()
  })

  it('when logged in, proceeds to the gogdl info CLI call without ever calling GOGUser.getCredentials()', async () => {
    mockIsLoggedIn.mockReturnValue(true)
    mockLibraryStoreGet.mockReturnValue([
      { app_name: '123', title: 'Test Game', install: {} }
    ])
    // Simulate the CLI call aborting so the function returns cleanly right
    // after the credentials-free login gate + the runRunnerCommand call --
    // the size-calculation code below is out of scope for this regression.
    mockCallRunner.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      abort: true
    })

    const result = await manager.getInstallInfo('123')

    expect(result).toBeUndefined()
    expect(mockIsLoggedIn).toHaveBeenCalled()
    expect(mockGetCredentials).not.toHaveBeenCalled()
    expect(mockCallRunner).toHaveBeenCalledWith(
      expect.arrayContaining(['info', '123']),
      expect.objectContaining({ name: 'gog' }),
      expect.anything()
    )
  })
})

/**
 * D-35-19-16 regression coverage.
 *
 * `changeGameInstallPath` is reached by two callers with DIFFERENT path contracts:
 * `moveInstall` (`gog/games.ts:794`) passes `moveResult.installPath`, which `moveOnUnix`
 * has already completed to `join(newInstallPath, basename(install_path))`; whereas
 * `changeInstallPath` (`gamedetails/dispatch.ts:230`) passes the raw directory the user
 * picked, which on macOS can only ever be the PARENT because a directory picker cannot
 * select a `.app` bundle. The `osx` branch appended `folder_name` unconditionally, which
 * is right for the second caller and doubled the bundle name for the first -- recording
 * `.../Endless Sky.app/Endless Sky.app`, a path that does not exist, so the moved game
 * could not launch.
 *
 * Tests 1 and 4 fail against the pre-fix source; 2 and 3 pin the behaviour the guard must
 * NOT disturb, so a guard that simply never appends would fail them.
 */
describe('D-35-19-16 -- changeGameInstallPath does not double the macOS bundle name', () => {
  const APP_NAME = '1829678475'
  const FOLDER_NAME = 'Endless Sky.app'

  let manager: GOGLibraryManager
  let installedArray: Array<Record<string, unknown>>

  /** Seed both stores and load the in-memory library the way the app does. */
  async function seedInstalledGame(install_path: string, platform: string) {
    manager = new GOGLibraryManager()
    // Offline so loadLocalLibrary skips checkForOfflineInstallerChanges.
    mockIsOnline.mockReturnValue(false)

    installedArray = [{ appName: APP_NAME, install_path, platform }]
    mockInstalledGamesStoreGet.mockReturnValue(installedArray)
    mockLibraryStoreGet.mockReturnValue([
      {
        app_name: APP_NAME,
        title: 'Endless Sky',
        folder_name: FOLDER_NAME,
        runner: 'gog',
        is_installed: false,
        install: {}
      }
    ])

    manager.refreshInstalled()
    await (
      manager as unknown as { loadLocalLibrary: () => Promise<void> }
    ).loadLocalLibrary()
  }

  const recordedPath = () => manager.getGameInfo(APP_NAME)?.install.install_path

  it('the move caller (already-complete path) records it unchanged', async () => {
    await seedInstalledGame('/Users/u/GameLib/Endless Sky.app', 'osx')

    // What moveOnUnix returns as `installPath`: the destination it actually
    // rsynced to, basename already appended.
    await manager.changeGameInstallPath(
      APP_NAME,
      '/Users/u/Dest/Endless Sky.app'
    )

    expect(recordedPath()).toBe('/Users/u/Dest/Endless Sky.app')
    expect(installedArray[0].install_path).toBe('/Users/u/Dest/Endless Sky.app')
  })

  it('the change-install-path caller (parent directory) still gets folder_name appended', async () => {
    await seedInstalledGame('/Users/u/GameLib/Endless Sky.app', 'osx')

    // What the directory picker yields on macOS: the parent, because a `.app`
    // bundle is not selectable as a directory.
    await manager.changeGameInstallPath(APP_NAME, '/Users/u/Dest')

    expect(recordedPath()).toBe('/Users/u/Dest/Endless Sky.app')
    expect(installedArray[0].install_path).toBe('/Users/u/Dest/Endless Sky.app')
  })

  it('non-osx installs are recorded verbatim, with no append at all', async () => {
    await seedInstalledGame('/games/Endless Sky', 'windows')

    await manager.changeGameInstallPath(APP_NAME, '/games2/Endless Sky')

    expect(recordedPath()).toBe('/games2/Endless Sky')
  })

  it('no recorded path ever contains the bundle name twice', async () => {
    await seedInstalledGame('/Users/u/GameLib/Endless Sky.app', 'osx')

    for (const candidate of [
      '/Users/u/Dest/Endless Sky.app',
      '/Users/u/Dest'
    ]) {
      await manager.changeGameInstallPath(APP_NAME, candidate)
      expect(recordedPath()).not.toContain(`${FOLDER_NAME}/${FOLDER_NAME}`)
    }
  })
})
