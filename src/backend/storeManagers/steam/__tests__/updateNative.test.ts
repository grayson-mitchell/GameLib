/** Phase 74 plan 08: updateRegisteredSteamGame (D-12) and the 'details' protocol verb. */
import { updateRegisteredSteamGame } from '../updateNative'
import { buildSteamProtocolUrl } from '../gameProtocolUrl'
import { isSteamExperimentalInstallAppEnabled } from '../experimentalInstallAppSetting'
import { requestSteamInstallApp } from '../steamInstallApp'
import { readRunningAppId } from '../library/runningPoll'
import { readAcfUpdateState } from '../library/acfUpdateState'
import { resolveSteamLibraryRoot } from '../installLocation'
import { startInstallPolling } from '../library/installPolling'
import {
  invalidateSteamUpdateState,
  getLastKnownSteamUpdateState
} from '../updateDetection'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_k: string, d: string) => d }
}))
jest.mock('../experimentalInstallAppSetting', () => ({
  isSteamExperimentalInstallAppEnabled: jest.fn()
}))
jest.mock('../steamInstallApp', () => ({
  requestSteamInstallApp: jest.fn(),
  createSteamInstallAppRun: () => 'run'
}))
jest.mock('../installLocation', () => ({
  resolveSteamLibraryRoot: jest.fn()
}))
jest.mock('../library/runningPoll', () => ({ readRunningAppId: jest.fn() }))
jest.mock('../library/acfUpdateState', () => ({
  ...jest.requireActual('../library/acfUpdateState'),
  readAcfUpdateState: jest.fn()
}))
jest.mock('../updateDetection', () => ({
  invalidateSteamUpdateState: jest.fn(),
  getLastKnownSteamUpdateState: jest.fn()
}))
jest.mock('../library/installPolling', () => ({
  startInstallPolling: jest.fn()
}))
jest.mock('../games', () => ({ __esModule: true, default: jest.fn() }))

const openExternal = jest.fn()
const activePolls = new Map<string, { awaitingUpdate?: unknown }>()
const game = {
  appId: '333300',
  deps: {
    steamInstallRuntime: { polls: { activePolls } },
    config: {},
    paths: {},
    runner: {},
    openExternal: { openExternal }
  }
} as never
const URL = 'steam://nav/games/details/333300'
const opts = {
  delegatedToSteamClient: true,
  awaitingUpdate: { fromBuild: '777', targetBuild: undefined }
}

describe('updateRegisteredSteamGame', () => {
  beforeEach(() => {
    activePolls.clear()
    jest.mocked(startInstallPolling).mockImplementation((_d, id) => {
      activePolls.set(id, { awaitingUpdate: {} })
    })
    jest.mocked(resolveSteamLibraryRoot).mockResolvedValue('/lib')
    jest.mocked(readRunningAppId).mockResolvedValue(0)
    jest
      .mocked(readAcfUpdateState)
      .mockResolvedValue({ buildid: '777' } as never)
    jest.mocked(isSteamExperimentalInstallAppEnabled).mockReturnValue(true)
    jest.mocked(getLastKnownSteamUpdateState).mockReturnValue(undefined)
  })

  it('InstallApp ok: no hand-off, polls as an update', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'ok', folderIndex: 0 } as never)
    expect(await updateRegisteredSteamGame(game)).toEqual({
      status: 'done',
      handedOffToSteam: true
    })
    expect(openExternal).not.toHaveBeenCalled()
    expect(startInstallPolling).toHaveBeenCalledWith(
      expect.anything(),
      '333300',
      opts
    )
  })

  it('openExternal hand-off sets handedOffToSteam; a no-op poll start does not', async () => {
    jest.mocked(isSteamExperimentalInstallAppEnabled).mockReturnValue(false)
    expect(await updateRegisteredSteamGame(game)).toEqual({
      status: 'done',
      handedOffToSteam: true
    })
    activePolls.clear()
    jest.mocked(startInstallPolling).mockImplementation((_d, id) => {
      activePolls.set(id, {})
    })
    expect(await updateRegisteredSteamGame(game)).toEqual({
      status: 'done',
      handedOffToSteam: false
    })
  })

  it('InstallApp error surfaces the code and does not poll', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'error', code: 9 } as never)
    const r = await updateRegisteredSteamGame(game)
    expect(r.status).toBe('error')
    expect(r.error).toContain('EAppUpdateError 9')
    expect(startInstallPolling).not.toHaveBeenCalled()
  })

  it('unavailable falls back to the details hand-off', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'unavailable', reason: 'x' } as never)
    await updateRegisteredSteamGame(game)
    expect(openExternal).toHaveBeenCalledWith(URL)
    expect(startInstallPolling).toHaveBeenCalledWith(
      expect.anything(),
      '333300',
      opts
    )
  })

  it('setting off hands off without InstallApp', async () => {
    jest.mocked(isSteamExperimentalInstallAppEnabled).mockReturnValue(false)
    await updateRegisteredSteamGame(game)
    expect(requestSteamInstallApp).not.toHaveBeenCalled()
    expect(openExternal).toHaveBeenCalledWith(URL)
  })

  it('already-current ACF: no hand-off, no poll, cache invalidated', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue({
      buildid: '777',
      stateFlags: 4,
      bytesToDownload: 0,
      bytesDownloaded: 0,
      scheduledAutoUpdate: 0
    } as never)
    expect(await updateRegisteredSteamGame(game)).toEqual({ status: 'done' })
    expect(requestSteamInstallApp).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
    expect(startInstallPolling).not.toHaveBeenCalled()
    expect(invalidateSteamUpdateState).toHaveBeenCalled()
  })

  const currentAcf = {
    buildid: '777',
    stateFlags: 4,
    bytesToDownload: 0,
    bytesDownloaded: 0,
    scheduledAutoUpdate: 0
  } as never
  const staleCache = (targetBuild: string) =>
    ({ kind: 'registered', state: 'stale', targetBuild }) as never

  it('ACF current but PICS stale: hands off via the details link and polls to the target', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue(currentAcf)
    jest.mocked(getLastKnownSteamUpdateState).mockReturnValue(staleCache('800'))
    jest.mocked(isSteamExperimentalInstallAppEnabled).mockReturnValue(false)
    expect(await updateRegisteredSteamGame(game)).toEqual({
      status: 'done',
      handedOffToSteam: true
    })
    expect(openExternal).toHaveBeenCalledWith(URL)
    expect(startInstallPolling).toHaveBeenCalledWith(
      expect.anything(),
      '333300',
      {
        delegatedToSteamClient: true,
        awaitingUpdate: { fromBuild: '777', targetBuild: '800' }
      }
    )
    expect(invalidateSteamUpdateState).not.toHaveBeenCalled()
  })

  it('ACF current but PICS stale, InstallApp on: requests InstallApp, no openExternal', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue(currentAcf)
    jest.mocked(getLastKnownSteamUpdateState).mockReturnValue(staleCache('800'))
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'ok', folderIndex: 0 } as never)
    await updateRegisteredSteamGame(game)
    expect(requestSteamInstallApp).toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
    expect(startInstallPolling).toHaveBeenCalledWith(
      expect.anything(),
      '333300',
      {
        delegatedToSteamClient: true,
        awaitingUpdate: { fromBuild: '777', targetBuild: '800' }
      }
    )
  })

  it('ACF current and cached target equal to the ACF build: already current', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue(currentAcf)
    jest.mocked(getLastKnownSteamUpdateState).mockReturnValue(staleCache('777'))
    expect(await updateRegisteredSteamGame(game)).toEqual({ status: 'done' })
    expect(openExternal).not.toHaveBeenCalled()
    expect(startInstallPolling).not.toHaveBeenCalled()
    expect(invalidateSteamUpdateState).toHaveBeenCalled()
  })

  it('pending ACF passes its target build to the poll', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue({
      buildid: '777',
      targetBuildId: '5820078',
      stateFlags: 6,
      bytesToDownload: 10,
      bytesDownloaded: 0,
      scheduledAutoUpdate: 0
    } as never)
    jest.mocked(isSteamExperimentalInstallAppEnabled).mockReturnValue(false)
    await updateRegisteredSteamGame(game)
    expect(startInstallPolling).toHaveBeenCalledWith(
      expect.anything(),
      '333300',
      {
        delegatedToSteamClient: true,
        awaitingUpdate: { fromBuild: '777', targetBuild: '5820078' }
      }
    )
  })

  it('UAT 19: ACF current with TargetBuildID equal to buildid waits for the PICS target', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue({
      buildid: '5820077',
      targetBuildId: '5820077',
      stateFlags: 4,
      bytesToDownload: 0,
      bytesDownloaded: 0,
      scheduledAutoUpdate: 0
    } as never)
    jest
      .mocked(getLastKnownSteamUpdateState)
      .mockReturnValue(staleCache('5820078'))
    jest.mocked(isSteamExperimentalInstallAppEnabled).mockReturnValue(false)
    await updateRegisteredSteamGame(game)
    expect(startInstallPolling).toHaveBeenCalledWith(
      expect.anything(),
      '333300',
      {
        delegatedToSteamClient: true,
        awaitingUpdate: { fromBuild: '5820077', targetBuild: '5820078' }
      }
    )
  })

  it('pending ACF with target 0 and no PICS target has no target build', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue({
      buildid: '777',
      targetBuildId: '0',
      stateFlags: 6,
      bytesToDownload: 10,
      bytesDownloaded: 0,
      scheduledAutoUpdate: 0
    } as never)
    jest.mocked(isSteamExperimentalInstallAppEnabled).mockReturnValue(false)
    await updateRegisteredSteamGame(game)
    expect(startInstallPolling).toHaveBeenCalledWith(
      expect.anything(),
      '333300',
      {
        delegatedToSteamClient: true,
        awaitingUpdate: { fromBuild: '777', targetBuild: undefined }
      }
    )
  })

  it('refuses while the game is running', async () => {
    jest.mocked(readRunningAppId).mockResolvedValue(333300)
    const r = await updateRegisteredSteamGame(game)
    expect(r.status).toBe('error')
    expect(requestSteamInstallApp).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })
})

describe("buildSteamProtocolUrl('details')", () => {
  it('builds the details URL and rejects non-numeric ids', () => {
    expect(buildSteamProtocolUrl('details', '333300')).toBe(URL)
    expect(buildSteamProtocolUrl('details', '1;rm')).toBeNull()
  })
})
