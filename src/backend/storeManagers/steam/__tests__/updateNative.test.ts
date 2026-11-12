/** Phase 74 plan 08: updateRegisteredSteamGame (D-12) and the 'details' protocol verb. */
import { updateRegisteredSteamGame } from '../updateNative'
import { buildSteamProtocolUrl } from '../gameProtocolUrl'
import { isSteamExperimentalInstallAppEnabled } from '../experimentalInstallAppSetting'
import { requestSteamInstallApp } from '../steamInstallApp'
import { readRunningAppId } from '../library/runningPoll'
import { readAcfUpdateState } from '../library/acfUpdateState'
import { resolveSteamLibraryRoot } from '../installLocation'
import { startInstallPolling } from '../library/installPolling'

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
  readAcfUpdateState: jest.fn()
}))
jest.mock('../library/installPolling', () => ({
  startInstallPolling: jest.fn()
}))
jest.mock('../games', () => ({ __esModule: true, default: jest.fn() }))

const openExternal = jest.fn()
const game = {
  appId: '333300',
  deps: {
    config: {},
    paths: {},
    runner: {},
    openExternal: { openExternal }
  }
} as never
const URL = 'steam://nav/games/details/333300'
const opts = {
  delegatedToSteamClient: true,
  awaitingUpdate: { fromBuild: '777' }
}

describe('updateRegisteredSteamGame', () => {
  beforeEach(() => {
    jest.mocked(resolveSteamLibraryRoot).mockResolvedValue('/lib')
    jest.mocked(readRunningAppId).mockResolvedValue(0)
    jest
      .mocked(readAcfUpdateState)
      .mockResolvedValue({ buildid: '777' } as never)
    jest.mocked(isSteamExperimentalInstallAppEnabled).mockReturnValue(true)
  })

  it('InstallApp ok: no hand-off, polls as an update', async () => {
    jest
      .mocked(requestSteamInstallApp)
      .mockResolvedValue({ kind: 'ok', folderIndex: 0 } as never)
    expect(await updateRegisteredSteamGame(game)).toEqual({ status: 'done' })
    expect(openExternal).not.toHaveBeenCalled()
    expect(startInstallPolling).toHaveBeenCalledWith(
      expect.anything(),
      '333300',
      opts
    )
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
