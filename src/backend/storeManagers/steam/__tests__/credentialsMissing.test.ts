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

// Phase 54 (54-03): every authenticated cold connect runs inside the Mac Steam
// go-offline wrap. The default double is a pass-through that reports 'toggled';
// individual tests make it reject with GuidedOfflineRequiredError.
jest.mock('../macSteamOffline', () => {
  class GuidedOfflineRequiredError extends Error {
    cause: string
    constructor(cause: string) {
      super('guided')
      this.name = 'GuidedOfflineRequiredError'
      this.cause = cause
    }
  }
  return {
    withMacSteamOffline: jest.fn(),
    GuidedOfflineRequiredError,
    restoreMacSteamOnlineIfOwed: async () => 'not-owed'
  }
})
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn(),
  addHandler: jest.fn()
}))

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
import { finishAuth, startQRLogin } from '../userSignIn'
import { defined } from './fixtures/indexed'

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

  it('clears the flag when a live connection is proven by the canary', async () => {
    const getProductInfo = jest.fn().mockResolvedValue({})
    ;(steamUser as unknown as { client: unknown }).client = {
      steamID: { getSteamID64: () => '76561197960287930' },
      getProductInfo
    }

    const connected = await steamUser.ensureConnected()

    expect(connected).toBe(true)
    expect(mockConfigStore.delete).toHaveBeenCalledWith(CREDENTIALS_MISSING)
    // Never latched on the success path.
    expect(mockConfigStore.set).not.toHaveBeenCalledWith(
      CREDENTIALS_MISSING,
      true
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
    type Internals = {
      acquireAuthenticatedWithToken: (
        opts: unknown,
        token: string
      ) => Promise<unknown>
    }
    // No CM logon in these tests: the lease is refused (wrap refusal), which
    // is the profile fallback path and still completes the sign-in.
    const refuseLease = (internals: Internals) =>
      jest
        .spyOn(internals, 'acquireAuthenticatedWithToken')
        .mockResolvedValue({ ok: false, reason: 'go-offline-required' })

    it('finishAuth notes the sign-in after clearing credentialsMissing', async () => {
      const internals = steamUser as unknown as Internals
      refuseLease(internals)

      await finishAuth(steamDeps, {
        refreshToken: 'refresh-token',
        accountName: 'Persona'
      } as never)

      expect(mockConfigStore.delete).toHaveBeenCalledWith(CREDENTIALS_MISSING)
      expect(mockNoteSignInSucceeded).toHaveBeenCalledTimes(1)
      expect(mockNoteSignInSucceeded).toHaveBeenCalledWith('steam')
    })

    it('the QR success path notes the sign-in', async () => {
      const internals = steamUser as unknown as Internals
      refuseLease(internals)
      const handlers: Record<string, () => Promise<void> | void> = {}
      const fakeSession = {
        refreshToken: 'qr-refresh-token',
        loginTimeout: 0,
        startWithQR: jest
          .fn()
          .mockResolvedValue({ qrChallengeUrl: 'https://s.team/q/1' }),
        once: jest.fn((event: string, cb: () => Promise<void> | void) => {
          handlers[event] = cb
        })
      }
      const { LoginSession } = jest.requireMock<{ LoginSession: jest.Mock }>(
        'steam-session'
      )
      LoginSession.mockImplementation(() => fakeSession)

      await startQRLogin(steamDeps)
      await defined(handlers['authenticated'], 'authenticated handler')()

      expect(mockConfigStore.delete).toHaveBeenCalledWith(CREDENTIALS_MISSING)
      expect(mockNoteSignInSucceeded).toHaveBeenCalledTimes(1)
      expect(mockNoteSignInSucceeded).toHaveBeenCalledWith('steam')
    })

    it('logout notes the sign-out', async () => {
      await steamUser.logout()

      expect(mockNoteSignedOut).toHaveBeenCalledTimes(1)
      expect(mockNoteSignedOut).toHaveBeenCalledWith('steam')
    })
  })
})
