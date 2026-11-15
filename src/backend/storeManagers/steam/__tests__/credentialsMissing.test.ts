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
 * '../tokenStore' unmocked (it exercises a config-backed test store for
 * logout), which has no `readToken` at all — so it can only
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

const mockReadTokenOutcome = jest.fn()
const mockTokenStore = {
  getToken: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
  isAvailable: jest.fn()
}
jest.mock('../tokenStore', () => ({
  createTokenStoreSlot: () => ({
    configure: () => undefined,
    current: () => mockTokenStore
  }),
  readTokenOutcome: (...args: unknown[]) => mockReadTokenOutcome(...args)
}))

// Phase 49 (49-06): sign-in / sign-out publish through the epoch fence.
const mockNoteSignInSucceeded = jest.fn()
const mockNoteSignedOut = jest.fn()
const mockSignIn = {
  outcomes: {
    noteSignInSucceeded: (...args: unknown[]) =>
      mockNoteSignInSucceeded(...args),
    noteSignedOut: (...args: unknown[]) => mockNoteSignedOut(...args),
    record: jest.fn(),
    publish: jest.fn()
  },
  epochs: { capture: () => 0, isCurrent: () => true, bump: jest.fn() }
}

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

import type { SteamUser, SteamUserDeps } from '../user'
import { createTestSteamUser } from 'backend/testUtils/testSteamUser'
import type { SteamStoresDeps } from '../library/installRoot'
import { createTestSteamSession } from 'backend/testUtils/testSteamSession'
import type { UserSignInDeps } from '../userSignIn'
import type { SignInNoteDeps } from 'backend/signInProbe/outcomes'

const realSession = createTestSteamSession()
const steamDeps = {
  stores: { steam: { configStore: mockConfigStore } },
  signIn: mockSignIn,
  anonymousClient: { close: jest.fn() },
  tokenStore: { current: () => mockTokenStore },
  steamSession: {
    signIn: realSession.signIn,
    authTrigger: {
      ...realSession.authTrigger,
      currentTriggerLabel: () => 'user-refresh'
    }
  }
} as unknown as SteamStoresDeps &
  SignInNoteDeps &
  Pick<SteamUserDeps, 'signIn' | 'steamSession'> &
  UserSignInDeps
// One fresh SteamUser per test (66.3-16), also handed to the sign-in flows through their deps.
let steamUser: SteamUser
beforeEach(() => {
  steamUser = createTestSteamUser(steamDeps as never)
  ;(steamDeps as unknown as { steamUser: SteamUser }).steamUser = steamUser
})

const CREDENTIALS_MISSING = 'credentialsMissing'

describe('credentialsMissing latch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Signed-in session, no live client — forces ensureConnected past the
    // fast path and into the token-read branch.
    mockConfigStore.get_nodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )
  })

  it('latches the flag when a successful read proves the token absent', async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'absent' })

    const connected = await steamUser.ensureConnected()

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

    const connected = await steamUser.ensureConnected()

    expect(connected).toBe(false)
    expect(mockConfigStore.set).not.toHaveBeenCalledWith(
      CREDENTIALS_MISSING,
      expect.anything()
    )
  })

  it('clears the flag on logout so it cannot survive into the next session', async () => {
    await steamUser.logout()

    expect(mockConfigStore.delete).toHaveBeenCalledWith(CREDENTIALS_MISSING)
  })

  it('never stores the verdict inside the persisted userData object', async () => {
    // userData is overwritten wholesale on login and deleted on logout, and
    // SteamSignOut.ts treats its absence as THE signed-out signal — a flag
    // living inside it would be destroyed on every login and would collide
    // with that signal. It must be a sibling key.
    mockReadTokenOutcome.mockResolvedValue({ status: 'absent' })

    await steamUser.ensureConnected()

    const userDataWrites = mockConfigStore.set.mock.calls.filter(
      ([key]) => key === 'userData'
    )
    expect(userDataWrites).toHaveLength(0)
  })

  // Phase 49 (49-06): the sign-in / sign-out epoch hooks. A probe that began
  // before a sign-in must not re-latch afterwards (R2 concurrency edge).
  describe('sign-in epoch hooks', () => {
    it('logout notes the sign-out', async () => {
      await steamUser.logout()

      expect(mockNoteSignedOut).toHaveBeenCalledTimes(1)
      expect(mockNoteSignedOut).toHaveBeenCalledWith('steam')
    })
  })
})

// Phase 79 (T-79-59): the same latch rules on the Rust engine.
describe('credentialsMissing latch on the Rust engine', () => {
  const rustInvoke = jest.fn()
  let savedEnv: string | undefined
  beforeEach(() => {
    jest.clearAllMocks()
    savedEnv = process.env.GAMELIB_STEAMCM_CM
    process.env.GAMELIB_STEAMCM_CM = 'rust'
    mockConfigStore.get_nodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )
    steamUser = createTestSteamUser({
      ...steamDeps,
      rustInvoke: { requestRustInvoke: rustInvoke }
    } as never)
  })
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.GAMELIB_STEAMCM_CM
    else process.env.GAMELIB_STEAMCM_CM = savedEnv
  })

  it('latches the flag on an absent token without touching Rust', async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'absent' })

    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })

    expect(lease).toEqual({ ok: false, reason: 'token-absent' })
    expect(mockConfigStore.set).toHaveBeenCalledWith(CREDENTIALS_MISSING, true)
    expect(rustInvoke).not.toHaveBeenCalled()
  })

  it('clears the flag when a live Rust session is proven by the canary', async () => {
    rustInvoke.mockImplementation(async (channel: string) =>
      channel === 'steamcm_session_status'
        ? { connected: true, leaseCount: 0, logonFailure: null }
        : { connected: true }
    )

    expect(await steamUser.ensureConnected()).toBe(true)

    expect(mockConfigStore.delete).toHaveBeenCalledWith(CREDENTIALS_MISSING)
    expect(mockConfigStore.set).not.toHaveBeenCalledWith(
      CREDENTIALS_MISSING,
      true
    )
  })

  it('does NOT latch on an unreadable token', async () => {
    mockReadTokenOutcome.mockResolvedValue({
      status: 'unreadable',
      reason: 'timeout'
    })

    await steamUser.acquireAuthenticated({ reason: 'user-refresh' })

    expect(mockConfigStore.set).not.toHaveBeenCalled()
    expect(rustInvoke).not.toHaveBeenCalled()
  })

  it.each([
    [15, true],
    [34, false]
  ])('eresult %i latches=%s', async (eresult, latches) => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'present', token: 't' })
    rustInvoke.mockResolvedValue({
      ok: false,
      refusal: 'logon-rejected',
      logonFailure: { kind: 'x', eresult }
    })

    await steamUser.acquireAuthenticated({ reason: 'user-refresh' })

    if (latches) {
      expect(mockConfigStore.set).toHaveBeenCalledWith(
        CREDENTIALS_MISSING,
        true
      )
    } else {
      expect(mockConfigStore.set).not.toHaveBeenCalledWith(
        CREDENTIALS_MISSING,
        true
      )
    }
  })
})
