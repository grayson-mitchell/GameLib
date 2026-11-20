/** quick 261120-p2j: validateRegisteredSteamGame (Mac-native Verify). */
import { validateRegisteredSteamGame } from '../validateNative'
import { requestSteamValidateApp } from '../steamInstallApp'
import { readRunningAppId } from '../library/runningPoll'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../steamInstallApp', () => ({
  requestSteamValidateApp: jest.fn(),
  createSteamInstallAppRun: () => 'run'
}))
jest.mock('../library/runningPoll', () => ({ readRunningAppId: jest.fn() }))
jest.mock('../games', () => ({ __esModule: true, default: jest.fn() }))

const openExternal = jest.fn()
const controller = new AbortController()
const aborts = {
  has: jest.fn(),
  getSignal: jest.fn(),
  create: jest.fn(),
  delete: jest.fn()
}
const game = {
  appId: '333300',
  getGameInfo: () => ({ title: 'Test Game' }),
  deps: {
    paths: {},
    runner: {},
    aborts,
    openExternal: { openExternal }
  }
} as never

describe('validateRegisteredSteamGame', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(readRunningAppId).mockResolvedValue(0)
    aborts.has.mockReturnValue(false)
    aborts.create.mockReturnValue(controller)
    aborts.getSignal.mockReturnValue(controller.signal)
  })

  it('refuses a running game before any helper call', async () => {
    jest.mocked(readRunningAppId).mockResolvedValue(333300)
    await expect(validateRegisteredSteamGame(game)).rejects.toThrow(
      'Quit Test Game before verifying it.'
    )
    expect(requestSteamValidateApp).not.toHaveBeenCalled()
  })

  it('resolves without handedOffToSteam once Steam finished', async () => {
    jest.mocked(requestSteamValidateApp).mockResolvedValue({
      kind: 'ok',
      tracked: true,
      finished: true,
      installState: 4
    })
    const result = await validateRegisteredSteamGame(game)
    expect(result.handedOffToSteam).toBeUndefined()
    expect(result.stdout).toContain('installState 4')
    expect(requestSteamValidateApp).toHaveBeenCalledWith(
      '333300',
      { wait: true, signal: controller.signal },
      expect.anything()
    )
    expect(openExternal).not.toHaveBeenCalled()
  })

  it.each([0x20, 0x80])(
    'throws when installState keeps bit %i',
    async (bit) => {
      jest.mocked(requestSteamValidateApp).mockResolvedValue({
        kind: 'ok',
        tracked: true,
        finished: true,
        installState: 4 | bit
      })
      await expect(validateRegisteredSteamGame(game)).rejects.toThrow(
        'files still missing or corrupt'
      )
    }
  )

  it('hands off when the wait ended unfinished or untracked', async () => {
    jest.mocked(requestSteamValidateApp).mockResolvedValue({
      kind: 'ok',
      tracked: true,
      finished: false,
      installState: 516,
      reason: 'paused'
    })
    await expect(validateRegisteredSteamGame(game)).resolves.toMatchObject({
      handedOffToSteam: true
    })
  })

  it('throws when Steam refuses', async () => {
    jest.mocked(requestSteamValidateApp).mockResolvedValue({ kind: 'refused' })
    await expect(validateRegisteredSteamGame(game)).rejects.toThrow(
      'Steam refused to verify Test Game'
    )
  })

  it('falls back to steam://validate when the helper is unavailable', async () => {
    jest.mocked(requestSteamValidateApp).mockResolvedValue({
      kind: 'unavailable',
      reason: 'steam-not-running'
    })
    const result = await validateRegisteredSteamGame(game)
    expect(openExternal).toHaveBeenCalledWith('steam://validate/333300')
    expect(result.handedOffToSteam).toBe(true)
  })

  it('opens nothing and reports abort when the signal was aborted', async () => {
    const aborted = new AbortController()
    aborted.abort()
    aborts.create.mockReturnValue(aborted)
    aborts.getSignal.mockReturnValue(aborted.signal)
    jest.mocked(requestSteamValidateApp).mockResolvedValue({
      kind: 'unavailable',
      reason: 'helper-failed'
    })
    const result = await validateRegisteredSteamGame(game)
    expect(openExternal).not.toHaveBeenCalled()
    expect(result).toEqual({ stdout: '', stderr: '', abort: true })
  })

  it('deletes its abort controller afterwards, even on a throw', async () => {
    jest.mocked(requestSteamValidateApp).mockResolvedValue({ kind: 'refused' })
    await expect(validateRegisteredSteamGame(game)).rejects.toThrow()
    expect(aborts.delete).toHaveBeenCalledWith('333300')
  })
})
