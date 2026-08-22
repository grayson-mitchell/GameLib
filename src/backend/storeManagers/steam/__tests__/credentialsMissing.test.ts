/**
 * `steamConfigStore.credentialsMissing` — the latched verdict the Manage
 * Accounts tile reads so it stops claiming a clean signed-in state.
 *
 * Observed live 2026-08-22: `isLoggedIn: true` + `userData` in config, an EMPTY
 * Keychain slot, and a tile reading "signed in" while every install failed with
 * "You are not signed in to Steam". The library refresh had already proven the
 * condition four times (`trigger=user-refresh`) and discarded it each time.
 *
 * The load-bearing distinction under test is `absent` vs `unreadable`:
 *   - `absent`     — a SUCCESSFUL read returned empty. Proof. Latch it.
 *   - `unreadable` — the read FAILED (Keychain deny, timeout). NOT proof.
 *                    `user.ts`'s own comment records that reporting this as
 *                    signed-out is a false state a previous fix deliberately
 *                    closed. Latching it here would reopen exactly that.
 *
 * A separate file from user.test.ts because that suite deliberately leaves
 * '../tokenStore' unmocked (it exercises the real ElectronTokenStore seam for
 * logout), and `ElectronTokenStore` has no `readToken` at all — so it can only
 * ever produce `absent`, never `unreadable`. Driving both outcomes requires
 * mocking the seam, which would change the meaning of that suite's other tests.
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

jest.mock('../authTrigger', () => ({
  currentTriggerLabel: () => 'user-refresh'
}))

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('graceful-fs', () => ({ existsSync: jest.fn(() => false) }))
jest.mock('steam-session', () => ({
  LoginSession: jest.fn(),
  EAuthTokenPlatformType: {}
}))
jest.mock('steam-user', () => jest.fn())

import { SteamUser } from '../user'

const CREDENTIALS_MISSING = 'credentialsMissing'

describe('credentialsMissing latch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Signed-in session, no live client — forces ensureConnected past the
    // fast path and into the token-read branch.
    mockConfigStore.get_nodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )
    ;(SteamUser as unknown as { client: unknown }).client = null
  })

  it('latches the flag when a successful read proves the token absent', async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'absent' })

    const connected = await SteamUser.ensureConnected()

    expect(connected).toBe(false)
    expect(mockConfigStore.set).toHaveBeenCalledWith(CREDENTIALS_MISSING, true)
  })

  it('does NOT latch the flag when the read itself failed', async () => {
    // The regression that matters. A denied/timed-out Keychain read is not
    // evidence of a missing credential, and presenting it as one is the false
    // signed-out state a previous fix closed on purpose.
    mockReadTokenOutcome.mockResolvedValue({
      status: 'unreadable',
      reason: 'timeout'
    })

    const connected = await SteamUser.ensureConnected()

    expect(connected).toBe(false)
    expect(mockConfigStore.set).not.toHaveBeenCalledWith(
      CREDENTIALS_MISSING,
      expect.anything()
    )
  })

  it('clears the flag when a live connection is proven by the canary', async () => {
    const getProductInfo = jest.fn().mockResolvedValue({})
    ;(SteamUser as unknown as { client: unknown }).client = {
      steamID: { getSteamID64: () => '76561197960287930' },
      getProductInfo
    }

    const connected = await SteamUser.ensureConnected()

    expect(connected).toBe(true)
    expect(mockConfigStore.delete).toHaveBeenCalledWith(CREDENTIALS_MISSING)
    // Never latched on the success path.
    expect(mockConfigStore.set).not.toHaveBeenCalledWith(
      CREDENTIALS_MISSING,
      true
    )
  })

  it('clears the flag on logout so it cannot survive into the next session', async () => {
    await SteamUser.logout()

    expect(mockConfigStore.delete).toHaveBeenCalledWith(CREDENTIALS_MISSING)
  })

  it('never stores the verdict inside the persisted userData object', async () => {
    // userData is overwritten wholesale on login and deleted on logout, and
    // SteamSignOut.ts treats its absence as THE signed-out signal — a flag
    // living inside it would be destroyed on every login and would collide
    // with that signal. It must be a sibling key.
    mockReadTokenOutcome.mockResolvedValue({ status: 'absent' })

    await SteamUser.ensureConnected()

    const userDataWrites = mockConfigStore.set.mock.calls.filter(
      ([key]) => key === 'userData'
    )
    expect(userDataWrites).toHaveLength(0)
  })
})
