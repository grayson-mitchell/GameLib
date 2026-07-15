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
 */
import { existsSync, mkdirSync } from 'graceful-fs'
import { GlobalConfig } from 'backend/config'
import { downloadFile, openUrlOrFile, spawnAsync } from 'backend/utils'
import { sendFrontendMessage } from '../../../ipc'
import { SteamUser } from '../user'
import { STEAM_DOWNLOAD_URL, STEAM_SETUP_EXE_URL } from '../constants'
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

jest.mock('backend/utils', () => ({
  downloadFile: jest.fn(),
  openUrlOrFile: jest.fn(),
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
const mockedOpenUrlOrFile = openUrlOrFile as jest.Mock
const mockedSpawnAsync = spawnAsync as jest.Mock
const mockedIsSteamClientInstalled =
  SteamUser.isSteamClientInstalled as jest.Mock
const mockedSendFrontendMessage = sendFrontendMessage as jest.Mock

describe('clientSetup.ts', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    mockedExistsSync.mockReset()
    mockedMkdirSync.mockReset()
    mockedGlobalConfigGet.mockReset()
    mockedDownloadFile.mockReset()
    mockedOpenUrlOrFile.mockReset()
    mockedSpawnAsync.mockReset()
    mockedIsSteamClientInstalled.mockReset()
    mockedSendFrontendMessage.mockReset()

    envMock = jest.requireMock('backend/constants/environment')
    envMock.isWindows = true
    envMock.isMac = false
    envMock.isLinux = false

    mockedGlobalConfigGet.mockReturnValue({
      getSettings: () => ({ defaultSteamPath: '/home/user/.steam/steam' })
    })
    mockedDownloadFile.mockResolvedValue(undefined)
    mockedOpenUrlOrFile.mockResolvedValue(undefined)
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

  describe('startGuidedClientInstall', () => {
    it('D-10/T-21-20: Windows downloads the official SteamSetup.exe over HTTPS and spawns it with no silent/quiet flag', async () => {
      mockedExistsSync.mockReturnValue(false)

      const result = await startGuidedClientInstall()

      expect(result).toEqual({ status: 'started' })
      expect(mockedDownloadFile).toHaveBeenCalledWith(
        expect.objectContaining({ url: STEAM_SETUP_EXE_URL })
      )
      expect(STEAM_SETUP_EXE_URL.startsWith('https://')).toBe(true)
      const [spawnedCommand, spawnedArgs] = mockedSpawnAsync.mock.calls[0]
      expect(spawnedCommand).toContain('SteamSetup.exe')
      // No /S, /VERYSILENT, or any other unattended flag — the user sees the
      // real Valve installer window (T-21-20).
      expect(spawnedArgs).toEqual([])
      expect(mockedOpenUrlOrFile).not.toHaveBeenCalled()
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
      expect(mockedOpenUrlOrFile).not.toHaveBeenCalled()
    })

    it('D-10: Linux never downloads/spawns anything — opens the official Steam download page instead', async () => {
      envMock.isWindows = false
      envMock.isMac = false
      envMock.isLinux = true

      const result = await startGuidedClientInstall()

      expect(result).toEqual({ status: 'link-opened' })
      expect(mockedOpenUrlOrFile).toHaveBeenCalledWith(STEAM_DOWNLOAD_URL)
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
