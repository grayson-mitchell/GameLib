/** Phase 74 plan 10: SteamGame.update() dispatch by install kind. */
import SteamGame from '../games'
import { updateBridgeGame } from '../updateBridge'
import { updateRegisteredSteamGame } from '../updateNative'
import { findBridgeInstallBottle } from '../bridgeBottle'
import { readAcfUpdateState } from '../library/acfUpdateState'

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
jest.mock('../updateBridge', () => ({ updateBridgeGame: jest.fn() }))
jest.mock('../updateNative', () => ({ updateRegisteredSteamGame: jest.fn() }))
jest.mock('../library/acfUpdateState', () => ({
  readAcfUpdateState: jest.fn()
}))
jest.mock('../bridgeBottle', () => ({
  ...jest.requireActual('../bridgeBottle'),
  findBridgeInstallBottle: jest.fn()
}))

const note = jest.fn()
const self = {
  appId: '12345',
  deps: {
    paths: {},
    steamSession: { authTrigger: { noteSteamAuthTrigger: note } }
  }
}
const run = (o?: { unattended?: boolean }) =>
  SteamGame.prototype.update.call(self as never, o)

describe('SteamGame.update dispatch', () => {
  beforeEach(() => {
    jest.mocked(updateBridgeGame).mockResolvedValue({ status: 'done' })
    jest.mocked(updateRegisteredSteamGame).mockResolvedValue({ status: 'done' })
    jest.mocked(findBridgeInstallBottle).mockReturnValue(null)
    jest.mocked(readAcfUpdateState).mockResolvedValue(null)
  })

  beforeEach(() => note.mockClear())

  it('bridge install goes to updateBridgeGame', async () => {
    jest.mocked(findBridgeInstallBottle).mockReturnValue('b')
    await run()
    expect(note).toHaveBeenCalledWith('user-install')
    expect(updateBridgeGame).toHaveBeenCalledWith(self)
    expect(updateRegisteredSteamGame).not.toHaveBeenCalled()
  })

  it('registered install goes to Steam and never runs the delta', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue({ buildid: '1' } as never)
    await run()
    expect(updateRegisteredSteamGame).toHaveBeenCalledWith(self)
    expect(updateBridgeGame).not.toHaveBeenCalled()
  })

  it('neither kind is a clear error', async () => {
    expect(await run()).toMatchObject({ status: 'error' })
    expect(note).toHaveBeenCalledWith('user-install')
    expect(updateBridgeGame).not.toHaveBeenCalled()
    expect(updateRegisteredSteamGame).not.toHaveBeenCalled()
  })

  it('unattended bridge update skips the auth trigger and passes the flag', async () => {
    jest.mocked(findBridgeInstallBottle).mockReturnValue('b')
    await run({ unattended: true })
    expect(note).not.toHaveBeenCalled()
    expect(updateBridgeGame).toHaveBeenCalledWith(self, { unattended: true })
  })

  it('unattended registered update aborts and never calls Steam (D-02)', async () => {
    jest.mocked(readAcfUpdateState).mockResolvedValue({ buildid: '1' } as never)
    expect(await run({ unattended: true })).toEqual({ status: 'abort' })
    expect(note).not.toHaveBeenCalled()
    expect(updateRegisteredSteamGame).not.toHaveBeenCalled()
  })
})
