/**
 * Unit tests for ensureSteamClientReady + startGuidedClientInstall
 * (Phase 21 Plan 10) — Steam-client presence detection, D-11
 * prompt-to-launch, D-10 guided-install trigger.
 *
 * Mock strategy follows steam/__tests__/bottle.test.ts and games.test.ts:
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in each test
 *  - graceful-fs mocked (existsSync/mkdirSync) — no real filesystem access
 *  - ../user auto-mocked (SteamUser.isSteamClientInstalled becomes jest.fn())
 *  - backend/constants/environment mocked as a mutable double
 *    (jest.requireMock, mirrors games.test.ts's own envMock pattern) so the
 *    D-10 Windows/macOS/Linux installer branches can each be exercised
 *    within the same file.
 *  - the win32 cross-gate describe delegates the automocked
 *    isSteamClientInstalled to jest.requireActual('../user'), so the D-10 and
 *    D-11 gates are driven through the REAL Windows install probe.
 */
import { existsSync, mkdirSync } from 'graceful-fs'
import { join } from 'path'
import { GlobalConfig } from 'backend/config'
import { downloadFile, spawnAsync } from 'backend/utils'
import { shell } from 'backend/platform'
import { logError, logInfo } from 'backend/logger'
import { sendFrontendMessage } from '../../../ipc'
import { SteamUser } from '../user'
import {
  STEAM_DOWNLOAD_URL,
  STEAM_SETUP_EXE_URL,
  steamSupportPath
} from '../constants'
import {
  ensureSteamClientReady,
  startGuidedClientInstall
} from '../clientSetup'

jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn()
}))

jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

jest.mock('backend/platform', () => ({
  ...jest.requireActual('backend/platform'),
  shell: { openExternal: jest.fn() }
}))

jest.mock('backend/utils', () => ({
  downloadFile: jest.fn(),
  spawnAsync: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

jest.mock('../user')

// Pin steamSupportPath to a path holding a space AND an apostrophe so the
// PowerShell single-quote escaping is exercised (T-0yc-01). The spread keeps
// STEAM_INSTALL_PATHS / STEAM_DOWNLOAD_URL / STEAM_SETUP_EXE_URL real.
jest.mock('../constants', () => ({
  ...jest.requireActual('../constants'),
  steamSupportPath: "/Users/Jane O'Brien/AppData/Roaming/gamelib/steam_store"
}))

// Mutable double, defaults to Windows (mirrors games.test.ts's envMock
// pattern) — individual tests flip isMac/isLinux via jest.requireMock.
jest.mock('backend/constants/environment', () => ({
  isWindows: true,
  isMac: false,
  isLinux: false
}))

const mockedExistsSync = existsSync as jest.Mock
const mockedMkdirSync = mkdirSync as jest.Mock
const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockedDownloadFile = downloadFile as jest.Mock
const mockedOpenExternal = shell.openExternal as jest.Mock
const mockedSpawnAsync = spawnAsync as jest.Mock
const mockedIsSteamClientInstalled =
  SteamUser.isSteamClientInstalled as jest.Mock
const mockedSendFrontendMessage = sendFrontendMessage as jest.Mock
const mockedLogError = logError as jest.Mock
const mockedLogInfo = logInfo as jest.Mock

const WINDOWS_LAUNCH_FAILED =
  'The Steam installer did not open (administrator permission was declined or the launch failed)'
const MAC_LAUNCH_FAILED = 'The Steam installer disk image did not open'

describe('clientSetup.ts', () => {
  let envMock: any

  beforeEach(() => {
    mockedExistsSync.mockReset()
    mockedMkdirSync.mockReset()
    mockedGlobalConfigGet.mockReset()
    mockedDownloadFile.mockReset()
    mockedOpenExternal.mockReset()
    mockedSpawnAsync.mockReset()
    mockedIsSteamClientInstalled.mockReset()
    mockedSendFrontendMessage.mockReset()
    mockedLogError.mockReset()
    mockedLogInfo.mockReset()

    envMock = jest.requireMock('backend/constants/environment')
    envMock.isWindows = true
    envMock.isMac = false
    envMock.isLinux = false

    mockedGlobalConfigGet.mockReturnValue({
      getSettings: () => ({ defaultSteamPath: '/home/user/.steam/steam' })
    })
    mockedDownloadFile.mockResolvedValue(undefined)
    mockedOpenExternal.mockResolvedValue(undefined)
    mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
  })

  describe('ensureSteamClientReady', () => {
    it('SNI-06: Steam present + libraryfolders.vdf present -> ready, no install/prompt', async () => {
      mockedIsSteamClientInstalled.mockReturnValue(true)
      mockedExistsSync.mockReturnValue(true)

      const result = await ensureSteamClientReady('123')

      expect(result).toEqual({ status: 'ready', ready: true })
      expect(mockedSendFrontendMessage).not.toHaveBeenCalled()
    })

    it('SNI-06/D-11: Steam present but libraryfolders.vdf absent -> needs-launch, emits steamClientSetupRequired(reason=launch-once), never writes the vdf', async () => {
      mockedIsSteamClientInstalled.mockReturnValue(true)
      mockedExistsSync.mockReturnValue(false)

      const result = await ensureSteamClientReady('123')

      expect(result).toEqual({ status: 'needs-launch', ready: false })
      expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
        'steamClientSetupRequired',
        { appName: '123', reason: 'launch-once' }
      )
      // D-11/T-21-21: GameLib must never author libraryfolders.vdf itself.
      // This readiness path only ever calls existsSync (a read) — mkdirSync
      // is imported solely for the D-10 installer-download branch below and
      // must never fire from a readiness check.
      expect(mockedMkdirSync).not.toHaveBeenCalled()
    })

    it('SNI-06/D-10: Steam absent -> needs-install, emits steamClientSetupRequired(reason=install)', async () => {
      mockedIsSteamClientInstalled.mockReturnValue(false)

      const result = await ensureSteamClientReady('123')

      expect(result).toEqual({ status: 'needs-install', ready: false })
      expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
        'steamClientSetupRequired',
        { appName: '123', reason: 'install' }
      )
      // Short-circuits before ever probing libraryfolders.vdf.
      expect(mockedExistsSync).not.toHaveBeenCalled()
    })

    it('T-21-05: a non-numeric appId is rejected before any check and never emits the event', async () => {
      const result = await ensureSteamClientReady('../etc/passwd')

      expect(result.status).toBe('needs-install')
      expect(result.ready).toBe(false)
      expect(result.error).toContain('Invalid appId')
      expect(mockedIsSteamClientInstalled).not.toHaveBeenCalled()
      expect(mockedSendFrontendMessage).not.toHaveBeenCalled()
    })
  })

  describe('on win32 the D-10 and D-11 gates share the Default Steam path root (quick 261101-whs)', () => {
    const root = 'C:\\SteamUAT'
    const programFilesSteam = 'C:\\Program Files (x86)\\Steam\\Steam.exe'
    let savedPlatform: NodeJS.Platform

    const existsOnly = (...present: string[]) =>
      mockedExistsSync.mockImplementation((p: string) => present.includes(p))

    beforeEach(() => {
      savedPlatform = process.platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true
      })
      const ActualSteamUser =
        jest.requireActual<typeof import('../user')>('../user').SteamUser
      mockedIsSteamClientInstalled.mockImplementation(() =>
        ActualSteamUser.isSteamClientInstalled()
      )
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () => ({ defaultSteamPath: root })
      })
    })

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: savedPlatform,
        configurable: true
      })
    })

    it('steam.exe under the root but no libraryfolders.vdf -> needs-launch', async () => {
      existsOnly(join(root, 'steam.exe'))

      const result = await ensureSteamClientReady('123')

      expect(result).toEqual({ status: 'needs-launch', ready: false })
      expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
        'steamClientSetupRequired',
        { appName: '123', reason: 'launch-once' }
      )
    })

    it('only the old Program Files Steam.exe exists -> needs-install', async () => {
      existsOnly(programFilesSteam)

      const result = await ensureSteamClientReady('123')

      expect(result).toEqual({ status: 'needs-install', ready: false })
      expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
        'steamClientSetupRequired',
        { appName: '123', reason: 'install' }
      )
    })

    it('steam.exe and libraryfolders.vdf under the root -> ready, no frontend message', async () => {
      existsOnly(
        join(root, 'steam.exe'),
        join(root, 'steamapps', 'libraryfolders.vdf')
      )

      const result = await ensureSteamClientReady('123')

      expect(result).toEqual({ status: 'ready', ready: true })
      expect(mockedSendFrontendMessage).not.toHaveBeenCalled()
    })
  })

  describe('startGuidedClientInstall', () => {
    it('D-10/D-UAT-17: Windows downloads the official SteamSetup.exe over HTTPS and launches it elevated through PowerShell RunAs', async () => {
      mockedExistsSync.mockReturnValue(false)

      const result = await startGuidedClientInstall()

      expect(result).toEqual({ status: 'started' })
      expect(mockedDownloadFile).toHaveBeenCalledWith(
        expect.objectContaining({ url: STEAM_SETUP_EXE_URL })
      )
      expect(STEAM_SETUP_EXE_URL.startsWith('https://')).toBe(true)
      const installerPath = join(steamSupportPath, 'redist', 'SteamSetup.exe')
      expect(mockedSpawnAsync).toHaveBeenCalledTimes(1)
      const [spawnedCommand, spawnedArgs, spawnedOptions] =
        mockedSpawnAsync.mock.calls[0]
      expect(spawnedCommand).toBe('powershell')
      expect(spawnedArgs).toEqual([
        '-NoProfile',
        '-NonInteractive',
        'Start-Process',
        '-FilePath',
        `'${installerPath.replaceAll("'", "''")}'`,
        '-Verb',
        'RunAs',
        '-ErrorAction',
        'Stop'
      ])
      expect(spawnedOptions).toEqual(
        expect.objectContaining({ windowsHide: true })
      )
      expect(spawnedOptions).not.toHaveProperty('env')
      expect(mockedLogInfo).toHaveBeenCalledWith(
        expect.stringContaining('launched'),
        'Steam'
      )
      expect(mockedLogError).not.toHaveBeenCalled()
      expect(mockedOpenExternal).not.toHaveBeenCalled()
    })

    it('D-UAT-17/T-0yc-01: the installer path reaches PowerShell as one single-quoted literal with apostrophes doubled', async () => {
      mockedExistsSync.mockReturnValue(true)

      await startGuidedClientInstall()

      const [, spawnedArgs] = mockedSpawnAsync.mock.calls[0]
      const filePath: string = spawnedArgs[spawnedArgs.indexOf('-FilePath') + 1]
      expect(filePath.startsWith("'")).toBe(true)
      expect(filePath.endsWith("'")).toBe(true)
      expect(filePath).toContain("Jane O''Brien")
      // Every apostrophe inside the quotes is doubled, so none can close the
      // literal early.
      expect(filePath.slice(1, -1).replaceAll("''", '')).not.toContain("'")
    })

    it('D-10/T-21-20: the Windows launch passes no wait, argument-list or silent/quiet flag', async () => {
      mockedExistsSync.mockReturnValue(true)

      await startGuidedClientInstall()

      const [, spawnedArgs] = mockedSpawnAsync.mock.calls[0]
      for (const forbidden of [
        '-Wait',
        '-ArgumentList',
        '/S',
        '/SILENT',
        '/VERYSILENT',
        '/quiet',
        '/q',
        '/passive'
      ]) {
        expect(spawnedArgs).not.toContain(forbidden)
      }
    })

    it('D-UAT-17: a declined UAC prompt returns status "error" and never logs "launched"', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedSpawnAsync.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr:
          'Start-Process : This command cannot be run due to the error: The operation was canceled by the user.'
      })

      const result = await startGuidedClientInstall()

      expect(result).toEqual({
        status: 'error',
        error: WINDOWS_LAUNCH_FAILED
      })
      expect(mockedLogError).toHaveBeenCalled()
      expect(mockedLogInfo).not.toHaveBeenCalledWith(
        expect.stringContaining('launched'),
        expect.anything()
      )
    })

    it('D-UAT-17: a PowerShell spawn rejection returns status "error" and never logs "launched"', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedSpawnAsync.mockRejectedValue(new Error('spawn powershell ENOENT'))

      const result = await startGuidedClientInstall()

      expect(result).toEqual({
        status: 'error',
        error: WINDOWS_LAUNCH_FAILED
      })
      expect(mockedLogError).toHaveBeenCalled()
      expect(mockedLogInfo).not.toHaveBeenCalledWith(
        expect.stringContaining('launched'),
        expect.anything()
      )
    })

    it('D-UAT-17: a null exit code (launcher killed by a signal) returns status "error"', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedSpawnAsync.mockResolvedValue({ code: null, stdout: '', stderr: '' })

      const result = await startGuidedClientInstall()

      expect(result).toEqual({
        status: 'error',
        error: WINDOWS_LAUNCH_FAILED
      })
    })

    it('D-10: macOS downloads the official .dmg over HTTPS and opens it (mount + Finder), never spawns it directly', async () => {
      envMock.isWindows = false
      envMock.isMac = true
      envMock.isLinux = false
      mockedExistsSync.mockReturnValue(false)

      const result = await startGuidedClientInstall()

      expect(result).toEqual({ status: 'started' })
      const [downloadArgs] = mockedDownloadFile.mock.calls[0]
      expect(downloadArgs.url.startsWith('https://')).toBe(true)
      expect(downloadArgs.url).toContain('.dmg')
      const [spawnedCommand, spawnedArgs] = mockedSpawnAsync.mock.calls[0]
      expect(spawnedCommand).toBe('open')
      expect(spawnedArgs[0]).toContain('.dmg')
      expect(mockedOpenExternal).not.toHaveBeenCalled()
    })

    it('D-UAT-17: macOS reports a failed `open` as status "error"', async () => {
      envMock.isWindows = false
      envMock.isMac = true
      envMock.isLinux = false
      mockedExistsSync.mockReturnValue(true)
      mockedSpawnAsync.mockResolvedValue({ code: 1, stdout: '', stderr: '' })

      const result = await startGuidedClientInstall()

      expect(result).toEqual({ status: 'error', error: MAC_LAUNCH_FAILED })
      expect(mockedLogError).toHaveBeenCalled()
      expect(mockedLogInfo).not.toHaveBeenCalledWith(
        expect.stringContaining('launched'),
        expect.anything()
      )
    })

    it('D-10: Linux never downloads/spawns anything — opens the official Steam download page instead', async () => {
      envMock.isWindows = false
      envMock.isMac = false
      envMock.isLinux = true

      const result = await startGuidedClientInstall()

      expect(result).toEqual({ status: 'link-opened' })
      expect(mockedOpenExternal).toHaveBeenCalledWith(STEAM_DOWNLOAD_URL)
      expect(mockedDownloadFile).not.toHaveBeenCalled()
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
    })

    it('reuses an already-downloaded installer instead of re-fetching it', async () => {
      mockedExistsSync.mockReturnValue(true)

      await startGuidedClientInstall()

      expect(mockedDownloadFile).not.toHaveBeenCalled()
      expect(mockedSpawnAsync).toHaveBeenCalled()
    })

    it('D-10: a download failure surfaces status "error" and never spawns anything', async () => {
      mockedExistsSync.mockReturnValue(false)
      mockedDownloadFile.mockRejectedValue(new Error('network down'))

      const result = await startGuidedClientInstall()

      expect(result.status).toBe('error')
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
    })
  })
})
