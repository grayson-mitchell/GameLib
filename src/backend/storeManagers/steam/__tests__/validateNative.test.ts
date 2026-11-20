/** quick 261120-p2j: validateRegisteredSteamGame (Mac-native Verify). */
import { validateRegisteredSteamGame } from '../validateNative'
import { initHeadless } from 'backend/logger'

// The real logger needs a writer; jest.setupContainment keeps the log file under a fake HOME.
beforeAll(() => initHeadless())

const requestSteamValidateApp = jest.fn()
const readRunningAppId = jest.fn()
const collab = {
  requestValidate: requestSteamValidateApp,
  readRunningApp: readRunningAppId,
  createRun: () => 'run' as never
}

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
    readRunningAppId.mockResolvedValue(0)
    aborts.has.mockReturnValue(false)
    aborts.create.mockReturnValue(controller)
    aborts.getSignal.mockReturnValue(controller.signal)
  })

  it('refuses a running game before any helper call', async () => {
    readRunningAppId.mockResolvedValue(333300)
    await expect(validateRegisteredSteamGame(game, collab)).rejects.toThrow(
      'Quit Test Game before verifying it.'
    )
    expect(requestSteamValidateApp).not.toHaveBeenCalled()
  })

  it('resolves without handedOffToSteam once Steam finished', async () => {
    requestSteamValidateApp.mockResolvedValue({
      kind: 'ok',
      tracked: true,
      finished: true,
      installState: 4
    })
    const result = await validateRegisteredSteamGame(game, collab)
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
      requestSteamValidateApp.mockResolvedValue({
        kind: 'ok',
        tracked: true,
        finished: true,
        installState: 4 | bit
      })
      await expect(validateRegisteredSteamGame(game, collab)).rejects.toThrow(
        'files still missing or corrupt'
      )
    }
  )

  it('hands off when the wait ended unfinished or untracked', async () => {
    requestSteamValidateApp.mockResolvedValue({
      kind: 'ok',
      tracked: true,
      finished: false,
      installState: 516,
      reason: 'paused'
    })
    await expect(
      validateRegisteredSteamGame(game, collab)
    ).resolves.toMatchObject({
      handedOffToSteam: true
    })
  })

  it('throws when Steam refuses', async () => {
    requestSteamValidateApp.mockResolvedValue({ kind: 'refused' })
    await expect(validateRegisteredSteamGame(game, collab)).rejects.toThrow(
      'Steam refused to verify Test Game'
    )
  })

  it('falls back to steam://validate when the helper is unavailable', async () => {
    requestSteamValidateApp.mockResolvedValue({
      kind: 'unavailable',
      reason: 'steam-not-running'
    })
    const result = await validateRegisteredSteamGame(game, collab)
    expect(openExternal).toHaveBeenCalledWith('steam://validate/333300')
    expect(result.handedOffToSteam).toBe(true)
  })

  it('opens nothing and reports abort when the signal was aborted', async () => {
    const aborted = new AbortController()
    aborted.abort()
    aborts.create.mockReturnValue(aborted)
    aborts.getSignal.mockReturnValue(aborted.signal)
    requestSteamValidateApp.mockResolvedValue({
      kind: 'unavailable',
      reason: 'helper-failed'
    })
    const result = await validateRegisteredSteamGame(game, collab)
    expect(openExternal).not.toHaveBeenCalled()
    expect(result).toEqual({ stdout: '', stderr: '', abort: true })
  })

  it('deletes its abort controller afterwards, even on a throw', async () => {
    requestSteamValidateApp.mockResolvedValue({ kind: 'refused' })
    await expect(validateRegisteredSteamGame(game, collab)).rejects.toThrow()
    expect(aborts.delete).toHaveBeenCalledWith('333300')
  })
})
