/**
 * `SteamUser.probeCredentialPresence()` -- the Steam boot probe (Phase 49,
 * 49-06, D-14 / D-21).
 *
 * The probe is a keyring read and nothing else: one `readTokenOutcome` call
 * labelled `boot-probe`, no CM connection, no store write. A denied or
 * timed-out read is `unknown`, never `expired` (P1, 260822-vov). `authTrigger`
 * is deliberately NOT mocked here, so the sticky unlock (the recorded reversal
 * of quick task 260817-d61) is observed on the real module.
 */

const mockConfigStore = {
  get: jest.fn(),
  get_nodefault: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn()
}
jest.mock('../electronStores', () => ({ configStore: mockConfigStore }))

const mockReadTokenOutcome = jest.fn()
const mockTokenStore = {
  getToken: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
  isAvailable: jest.fn()
}
jest.mock('../tokenStore', () => ({
  getTokenStore: () => mockTokenStore,
  readTokenOutcome: (...args: unknown[]) => mockReadTokenOutcome(...args)
}))

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/signInProbe/outcomes', () => ({
  noteSignInSucceeded: jest.fn(),
  noteSignedOut: jest.fn()
}))

jest.mock('graceful-fs', () => ({ existsSync: jest.fn(() => false) }))
jest.mock('steam-session', () => ({
  LoginSession: jest.fn(),
  EAuthTokenPlatformType: {}
}))
const mockSteamUserCtor = jest.fn()
jest.mock('steam-user', () => mockSteamUserCtor)

import { SteamUser } from '../user'
import {
  isSteamAuthUnlocked,
  currentTriggerLabel,
  resetSteamAuthTrigger
} from '../authTrigger'

function setLoggedIn(loggedIn: boolean) {
  mockConfigStore.get_nodefault.mockImplementation((key: string) =>
    key === 'isLoggedIn' ? loggedIn : undefined
  )
}

describe('SteamUser.probeCredentialPresence', () => {
  let ensureConnected: jest.SpyInstance

  beforeEach(() => {
    resetSteamAuthTrigger()
    ;(SteamUser as unknown as { client: unknown }).client = null
    ensureConnected = jest.spyOn(SteamUser, 'ensureConnected')
    setLoggedIn(true)
  })

  afterEach(() => {
    ensureConnected.mockRestore()
  })

  it('a logged-out account is unknown with no keyring read and the gate still locked', async () => {
    setLoggedIn(false)

    await expect(SteamUser.probeCredentialPresence()).resolves.toBe('unknown')

    expect(mockReadTokenOutcome).not.toHaveBeenCalled()
    expect(isSteamAuthUnlocked()).toBe(false)
    expect(currentTriggerLabel()).toBe('startup')
  })

  it('a present token is healthy', async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'present', token: 'tok' })
    await expect(SteamUser.probeCredentialPresence()).resolves.toBe('healthy')
  })

  it('an absent slot behind a logged-in account is expired', async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'absent' })
    await expect(SteamUser.probeCredentialPresence()).resolves.toBe('expired')
  })

  it.each(['timeout', 'denied'] as const)(
    'an unreadable read (%s) is unknown, never expired',
    async (reason) => {
      mockReadTokenOutcome.mockResolvedValue({ status: 'unreadable', reason })
      await expect(SteamUser.probeCredentialPresence()).resolves.toBe('unknown')
    }
  )

  it('a thrown read is unknown', async () => {
    mockReadTokenOutcome.mockRejectedValue(new Error('keyring exploded'))
    await expect(SteamUser.probeCredentialPresence()).resolves.toBe('unknown')
  })

  it("reads the keyring exactly once, labelled 'boot-probe'", async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'present', token: 'tok' })

    await SteamUser.probeCredentialPresence()

    expect(mockReadTokenOutcome).toHaveBeenCalledTimes(1)
    expect(mockReadTokenOutcome).toHaveBeenCalledWith(
      mockTokenStore,
      'boot-probe'
    )
  })

  it('never opens a CM connection (D-21)', async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'present', token: 'tok' })

    await SteamUser.probeCredentialPresence()

    expect(ensureConnected).not.toHaveBeenCalled()
    expect(mockSteamUserCtor).not.toHaveBeenCalled()
  })

  it('writes nothing: the pass applies the verdict, not the probe', async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'absent' })

    await SteamUser.probeCredentialPresence()

    expect(mockConfigStore.set).not.toHaveBeenCalled()
    expect(mockConfigStore.delete).not.toHaveBeenCalled()
    expect(mockConfigStore.clear).not.toHaveBeenCalled()
  })

  it('unlocks the gate for a logged-in account (the recorded reversal of 260817-d61)', async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'present', token: 'tok' })

    await SteamUser.probeCredentialPresence()

    expect(isSteamAuthUnlocked()).toBe(true)
    expect(currentTriggerLabel()).toBe('boot-probe')
  })
})
