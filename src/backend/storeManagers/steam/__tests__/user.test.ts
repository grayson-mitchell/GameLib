// ── Logger mock (factory to prevent transitive module load failures) ──────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend',
    Gog: 'Gog',
    Legendary: 'Legendary',
    Nile: 'Nile',
    Sideload: 'Sideload'
  }
}))

// ── graceful-fs mock ──────────────────────────────────────────────────────────
const mockExistsSync = jest.fn(() => false)
jest.mock('graceful-fs', () => ({
  existsSync: mockExistsSync
}))

// ── Global config slice (Windows Default Steam path), injected into the SteamUser under test ──
const mockGetSettings = jest.fn()

// ── stores mock ───────────────────────────────────────────────────────
const mockConfigStore = {
  get: jest.fn(),
  get_nodefault: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn()
}
// NOTE: '../tokenStore' is intentionally NOT mocked here. logout() must
// route the refresh token through the real TokenStore seam
// (tokenStore.current().clearToken() -> configStore.delete(TOKEN_STORE_KEY)),
// exercised against the mocked configStore through the config-backed test
// store installed in beforeEach (the Electron-era production store is gone,
// D-12; the module default now fails closed) — same approach the pre-existing
// getCredentials()/finishAuth()/QR tests already use for setToken/getToken.

// ── steam-session mock ────────────────────────────────────────────────────────
// Capture on() handlers so tests can trigger events manually
let sessionOnHandlers: Record<string, (...args: any[]) => any> = {}
const mockSessionInstance = {
  startWithQR: jest.fn(),
  startWithCredentials: jest.fn(),
  submitSteamGuardCode: jest.fn(),
  cancelLoginAttempt: jest.fn(),
  on: jest.fn((event: string, cb: (...args: any[]) => any) => {
    sessionOnHandlers[event] = cb
  }),
  once: jest.fn((event: string, cb: (...args: any[]) => any) => {
    sessionOnHandlers[event] = cb
  }),
  // Mirrors the real LoginSession's writable loginTimeout field — startQRLogin()
  // assigns QR_LOGIN_TIMEOUT_MS here, and tests pin the assigned value.
  loginTimeout: 0,
  get refreshToken() {
    return 'mock-refresh-token'
  },
  get accountName() {
    return 'testuser'
  }
}
const MockLoginSession = jest.fn(() => mockSessionInstance)

jest.mock('steam-session', () => ({
  LoginSession: MockLoginSession,
  EAuthTokenPlatformType: { SteamClient: 2 }
}))

// ── steam-user mock ───────────────────────────────────────────────────────────
// Capture on() handlers so tests can trigger loggedOn manually
let steamUserOnHandlers: Record<string, (...args: any[]) => any> = {}
const mockSteamUserInstance = {
  logOn: jest.fn(),
  logOff: jest.fn(),
  steamID: { getSteamID64: () => '76561197900000000' } as any,
  getPersonas: jest.fn().mockResolvedValue({
    personas: { '76561197900000000': { player_name: 'TestUser' } }
  }),
  // D-02 (Phase 33-02): ensureConnected's canary probe + relog revalidation.
  // getProductInfo defaults to a healthy resolve (canary OK); individual
  // tests override with a rejection/hang to exercise the relog fallback.
  getProductInfo: jest.fn().mockResolvedValue({ apps: {} }),
  relog: jest.fn(),
  on: jest.fn((event: string, cb: (...args: any[]) => any) => {
    steamUserOnHandlers[event] = cb
  }),
  once: jest.fn((event: string, cb: (...args: any[]) => any) => {
    steamUserOnHandlers[event] = cb
  }),
  redeemKey: jest.fn()
}
const MockSteamUserLib = jest.fn(() => mockSteamUserInstance) as any
// EPurchaseResult is a plain namespaced object on the SteamUser constructor at
// runtime (SteamUser.EPurchaseResult = require('./resources/EPurchaseResult.js'),
// verified in RESEARCH.md) — mirror that shape on the mock constructor so
// classifyPurchaseResult's SteamUserLib.EPurchaseResult.Unknown reference
// resolves in tests exactly like it does against the real installed package.
MockSteamUserLib.EPurchaseResult = {
  Unknown: -1,
  OK: 0,
  AlreadyOwned: 9,
  RegionLockedKey: 13,
  InvalidKey: 14,
  DuplicatedKey: 15,
  BaseGameRequired: 24,
  OnCooldown: 53
}

jest.mock('steam-user', () => MockSteamUserLib)

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
const mockCloseAnonymousClient = jest.fn()

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import type { SteamUser } from '../user'
import { createTestSteamUser } from 'backend/testUtils/testSteamUser'
import { createTestSteamSession } from 'backend/testUtils/testSteamSession'
import type {
  SteamSessionServices,
  SteamUserSliceDeps
} from 'backend/services/types'
import type { UserSignInDeps } from '../userSignIn'

// One sign-in owner per case (D-05, D-66.3-13: no reset hooks); `steamDeps` reads it at call time.
let signInProbe: TestSignInProbe
let steamSession: SteamSessionServices
let tokenStore: TokenStoreSlot
const steamDeps = {
  stores: { steam: { configStore: mockConfigStore } },
  get signIn() {
    return signInProbe
  },
  get steamSession() {
    return steamSession
  },
  get tokenStore() {
    return tokenStore
  },
  get steamUser() {
    return steamUser
  }
} as unknown as UserSignInDeps & SteamUserSliceDeps<'acquireAuthenticated'>
// One fresh SteamUser per test (D-05, 66.3-16): no module state to reset. `steamDeps`
// reads the instance at call time so the sign-in / redeem flows reach the same one.
let steamUser: SteamUser
// The Rust CM session is the only engine: a plain-function fake of the shell's steamcm_* channels
// (not jest.fn: resetMocks would strip the implementation). Tests script `rustFake.*`.
const FAKE_STEAM_ID = '76561198111111111'
const rustCalls: Array<[string, unknown]> = []
const rustFake: {
  acquire: () => unknown
  personas: () => unknown
} = { acquire: () => ({}), personas: () => ({}) }
const rustInvoke = async (channel: string, args: unknown): Promise<unknown> => {
  rustCalls.push([channel, args])
  switch (channel) {
    case 'steamcm_session_acquire':
      return rustFake.acquire()
    case 'steamcm_licenses':
      return { ok: true, result: [] }
    case 'steamcm_personas':
      return rustFake.personas()
    case 'steamcm_session_acquire_open':
      return { ok: false }
    default:
      return {}
  }
}
const rustChannels = () => rustCalls.map(([channel]) => channel)
beforeEach(() => {
  signInProbe = createTestSignInProbe()
  steamSession = createTestSteamSession()
  tokenStore = createTestTokenStoreSlot()
  rustCalls.length = 0
  rustFake.acquire = () => ({
    ok: true,
    leaseId: 1,
    steamId: FAKE_STEAM_ID
  })
  rustFake.personas = () => ({
    ok: true,
    result: { personas: { [FAKE_STEAM_ID]: { player_name: 'TestUser' } } }
  })
  steamUser = createTestSteamUser({
    rustInvoke: { requestRustInvoke: rustInvoke as never },
    sendFrontendMessage,
    stores: steamDeps.stores,
    signIn: signInProbe,
    steamSession,
    tokenStore,
    config: { getSettings: mockGetSettings } as never,
    anonymousClient: {
      close: (...args: unknown[]) => mockCloseAnonymousClient(...args)
    }
  })
})
import { redeemKey } from '../userRedeem'
import {
  pollCredentialLogin,
  pollQRLogin,
  startCredentialLogin,
  startQRLogin,
  submitSteamGuardCode
} from '../userSignIn'
import { existsSync } from 'graceful-fs'
import { join } from 'path'
import { logInfo, logWarning, logError } from 'backend/logger'
import type { TokenStore, TokenStoreSlot } from '../tokenStore'
import { createTestTokenStoreSlot } from 'backend/testUtils/testTokenStore'
const sendFrontendMessage = jest.fn()
import {
  createTestSignInProbe,
  type TestSignInProbe
} from 'backend/testUtils/testSignInProbe'
import { defined } from './fixtures/indexed'

// Lets every pending microtask chain (wrap -> logon -> lease -> persona) settle.
const flushAsync = () => new Promise<void>((resolve) => setImmediate(resolve))

// Test-only TokenStore backed by the mocked configStore. Production installs the
// keyring / dev-vault store at bootstrap; the module default fails closed (D-12),
// so suites that drive user.ts install this in beforeEach. It stores the value as
// given: encryption is not what these suites are about.
function makeConfigBackedTokenStore(): TokenStore {
  return {
    isAvailable: async () => true,
    getToken: async () => {
      const stored = mockConfigStore.get_nodefault('refreshToken')
      return typeof stored === 'string' ? stored : ''
    },
    setToken: async (token: string) => {
      mockConfigStore.set('refreshToken', token)
    },
    clearToken: async () => {
      mockConfigStore.delete('refreshToken')
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('SteamUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // ── Re-establish mock implementations (resetMocks: true clears them) ──────

    // graceful-fs mocks
    mockExistsSync.mockReturnValue(false)

    // configStore mocks
    mockConfigStore.clear.mockImplementation(() => {})
    mockConfigStore.delete.mockImplementation(() => {})
    mockConfigStore.get_nodefault.mockReturnValue(undefined)
    mockConfigStore.set.mockImplementation(() => {})
    tokenStore.configure(makeConfigBackedTokenStore())

    // Reset handler capture maps
    sessionOnHandlers = {}
    steamUserOnHandlers = {}

    // LoginSession mock — re-set constructor to return mockSessionInstance
    MockLoginSession.mockImplementation(() => mockSessionInstance)

    // session.on/once() captures handlers into sessionOnHandlers
    mockSessionInstance.on.mockImplementation(
      (event: string, cb: (...args: any[]) => any) => {
        sessionOnHandlers[event] = cb
      }
    )
    mockSessionInstance.once.mockImplementation(
      (event: string, cb: (...args: any[]) => any) => {
        sessionOnHandlers[event] = cb
      }
    )

    // Phase 54: re-arm the wrap double (resetMocks: true clears it every test).
    jest
      .requireMock('../macSteamOffline')
      .withMacSteamOffline.mockImplementation(
        async (connect: (wrap: string) => Promise<unknown>) => ({
          value: await connect('toggled'),
          wrap: 'toggled'
        })
      )

    // SteamUserLib mock — re-set constructor to return mockSteamUserInstance
    MockSteamUserLib.mockImplementation(() => mockSteamUserInstance)

    // steam-user instance mocks
    mockSteamUserInstance.on.mockImplementation(
      (event: string, cb: (...args: any[]) => any) => {
        steamUserOnHandlers[event] = cb
      }
    )
    mockSteamUserInstance.once.mockImplementation(
      (event: string, cb: (...args: any[]) => any) => {
        steamUserOnHandlers[event] = cb
      }
    )
    mockSteamUserInstance.getPersonas.mockResolvedValue({
      personas: { '76561197900000000': { player_name: 'TestUser' } }
    })
    mockSteamUserInstance.logOff.mockImplementation(() => {})
    // resetMocks: true clears redeemKey's mock implementation every test —
    // re-arm the mock function itself (individual tests set their own
    // mockResolvedValue/mockRejectedValue).
    mockSteamUserInstance.redeemKey.mockReset()
    // D-02 (Phase 33-02): re-arm the canary probe to its healthy default
    // (resetMocks: true clears it every test) — individual ensureConnected
    // canary/relog tests override with a rejection to exercise the stale
    // path. relog() defaults to a no-op; tests assert it was/wasn't called.
    mockSteamUserInstance.getProductInfo.mockResolvedValue({ apps: {} })
    mockSteamUserInstance.relog.mockImplementation(() => {})
  })

  // ── AUTH-05: Steam client detection ────────────────────────────────────────

  describe('isSteamClientInstalled()', () => {
    let savedPlatform: NodeJS.Platform

    const setPlatform = (value: string) =>
      Object.defineProperty(process, 'platform', {
        value,
        configurable: true
      })
    const armWindowsRoot = (defaultSteamPath: string) =>
      mockGetSettings.mockReturnValue({ defaultSteamPath })
    const existsOnly = (...present: string[]) =>
      (existsSync as jest.Mock).mockImplementation((p: string) =>
        present.includes(p)
      )
    const probedPaths = () =>
      (existsSync as jest.Mock).mock.calls.map(([p]) => p)

    beforeEach(() => {
      savedPlatform = process.platform
    })

    afterEach(() => {
      setPlatform(savedPlatform)
    })

    test('returns false when no platform paths exist', () => {
      setPlatform('linux')
      mockExistsSync.mockReturnValue(false)
      expect(steamUser.isSteamClientInstalled()).toBe(false)
    })

    test('returns true when a matching path exists', () => {
      setPlatform('linux')
      // Make existsSync return true for any path
      mockExistsSync.mockReturnValue(true)
      expect(steamUser.isSteamClientInstalled()).toBe(true)
    })

    test('returns false on unknown platform (no paths)', () => {
      setPlatform('freebsd')
      mockExistsSync.mockReturnValue(false)
      expect(steamUser.isSteamClientInstalled()).toBe(false)
    })

    test('darwin calls existsSync with the Steam.app path and never reads GlobalConfig', () => {
      setPlatform('darwin')
      mockExistsSync.mockReturnValue(false)

      steamUser.isSteamClientInstalled()
      expect(probedPaths()).toContain('/Applications/Steam.app')
      expect(mockGetSettings).not.toHaveBeenCalled()
    })

    test('linux calls existsSync with /usr/bin/steam and never reads GlobalConfig', () => {
      setPlatform('linux')
      mockExistsSync.mockReturnValue(false)

      steamUser.isSteamClientInstalled()
      expect(probedPaths()).toContain('/usr/bin/steam')
      expect(mockGetSettings).not.toHaveBeenCalled()
    })

    test('win32 is true when steam.exe exists under the Default Steam path (and only that is probed)', () => {
      setPlatform('win32')
      armWindowsRoot('D:\\Steam')
      existsOnly(join('D:\\Steam', 'steam.exe'))

      expect(steamUser.isSteamClientInstalled()).toBe(true)
      expect(existsSync as jest.Mock).toHaveBeenCalledTimes(1)
      expect(probedPaths()).toEqual([join('D:\\Steam', 'steam.exe')])
    })

    test('win32 ignores a Steam at Program Files when the Default Steam path is empty of one', () => {
      const programFilesSteam = 'C:\\Program Files (x86)\\Steam\\Steam.exe'
      setPlatform('win32')
      armWindowsRoot('C:\\SteamUAT')
      existsOnly(programFilesSteam)

      expect(steamUser.isSteamClientInstalled()).toBe(false)
      expect(probedPaths()).toEqual([join('C:\\SteamUAT', 'steam.exe')])
      expect(probedPaths()).not.toContain(programFilesSteam)
    })

    test('win32 strips the single quotes the Default Steam path setting can carry', () => {
      setPlatform('win32')
      armWindowsRoot("'D:\\Games\\Steam'")
      existsOnly(join('D:\\Games\\Steam', 'steam.exe'))

      expect(steamUser.isSteamClientInstalled()).toBe(true)
      expect(probedPaths()).toEqual([join('D:\\Games\\Steam', 'steam.exe')])
      expect(probedPaths().join('')).not.toContain("'")
    })

    test('win32 with a blank Default Steam path is false and probes nothing', () => {
      setPlatform('win32')
      armWindowsRoot('')
      mockExistsSync.mockReturnValue(true)

      expect(steamUser.isSteamClientInstalled()).toBe(false)
      expect(existsSync as jest.Mock).not.toHaveBeenCalled()
    })
  })

  // ── Token read ────────────────────────────────────────────

  describe('getCredentials() — token read', () => {
    test('returns undefined when no token stored', async () => {
      mockConfigStore.get_nodefault.mockReturnValue(undefined)
      const result = await steamUser.getCredentials()
      expect(result).toBeUndefined()
    })

    test('returns undefined when stored value is not a string', async () => {
      mockConfigStore.get_nodefault.mockReturnValue(42)
      const result = await steamUser.getCredentials()
      expect(result).toBeUndefined()
    })
  })

  // ── AUTH-03: isLoggedIn ────────────────────────────────────────────────────

  describe('isLoggedIn()', () => {
    test('returns false when configStore has no isLoggedIn', () => {
      mockConfigStore.get_nodefault.mockReturnValue(undefined)
      expect(steamUser.isLoggedIn()).toBe(false)
    })

    test('returns false when isLoggedIn is false in store', () => {
      mockConfigStore.get_nodefault.mockReturnValue(false)
      expect(steamUser.isLoggedIn()).toBe(false)
    })

    test('returns true when isLoggedIn is true in store', () => {
      mockConfigStore.get_nodefault.mockReturnValue(true)
      expect(steamUser.isLoggedIn()).toBe(true)
    })
  })

  // ── AUTH-04: logout ────────────────────────────────────────────────────────
  //
  // D-09 gap fix (28-03): logout() must route the refresh token through the
  // TokenStore seam (tokenStore.current().clearToken() -> configStore.delete(
  // TOKEN_STORE_KEY), TOKEN_STORE_KEY === 'refreshToken' per constants.ts)
  // instead of a blanket configStore.clear() — and must still clear the
  // remaining session keys (isLoggedIn, userData) explicitly so Electron's
  // observable behavior is unchanged. logout() is now async because
  // clearToken() may be an RPC round-trip to Rust in the sidecar build.

  describe('logout()', () => {
    test('does NOT call configStore.clear() (D-09 — must go through the seam, never a blanket wipe)', async () => {
      await steamUser.logout()
      expect(mockConfigStore.clear).not.toHaveBeenCalled()
    })

    test('clears the refresh token via configStore.delete("refreshToken") — the TokenStore seam target key', async () => {
      await steamUser.logout()
      expect(mockConfigStore.delete).toHaveBeenCalledWith('refreshToken')
    })

    // Regression guard for the naive one-line swap
    // (configStore.clear() -> tokenStore.current().clearToken()): that swap alone
    // stops clearing isLoggedIn/userData, so the user would appear to stay
    // "logged in" after logout. This test fails under that naive fix and
    // only passes when isLoggedIn/userData are ALSO explicitly cleared.
    test('also explicitly clears isLoggedIn and userData session keys (not just the token)', async () => {
      await steamUser.logout()
      expect(mockConfigStore.delete).toHaveBeenCalledWith('isLoggedIn')
      expect(mockConfigStore.delete).toHaveBeenCalledWith('userData')
    })

    test('does not throw when no steam-user client is connected', async () => {
      await expect(steamUser.logout()).resolves.not.toThrow()
    })

    test('isLoggedIn returns false after logout clears the isLoggedIn key', async () => {
      // Simulate the targeted delete removing the key from the store
      mockConfigStore.delete.mockImplementation((key: string) => {
        if (key === 'isLoggedIn') {
          mockConfigStore.get_nodefault.mockReturnValue(undefined)
        }
      })
      await steamUser.logout()
      expect(steamUser.isLoggedIn()).toBe(false)
    })

    test('locks the auth-trigger gate and clears an armed refresh grant (quick 261112-7wv)', async () => {
      steamSession.authTrigger.noteRefreshTrigger(
        'steam',
        'action-icons-refresh-button'
      )
      expect(steamSession.authTrigger.isSteamAuthUnlocked()).toBe(true)
      await steamUser.logout()
      expect(steamSession.authTrigger.isSteamAuthUnlocked()).toBe(false)
      expect(
        steamSession.authTrigger.consumeSteamRefreshLogonGrant()
      ).toBeNull()
      expect(steamSession.authTrigger.currentTriggerLabel()).toBe('startup')
    })

    test('resets the auth trigger before the first await (slow clearToken cannot leak a grant)', async () => {
      let releaseClear!: () => void
      const gate = new Promise<void>((resolve) => {
        releaseClear = resolve
      })
      tokenStore.configure({
        ...makeConfigBackedTokenStore(),
        clearToken: () => gate
      })
      steamSession.authTrigger.noteRefreshTrigger(
        'steam',
        'action-icons-refresh-button'
      )
      const p = steamUser.logout()
      expect(steamSession.authTrigger.isSteamAuthUnlocked()).toBe(false)
      expect(
        steamSession.authTrigger.consumeSteamRefreshLogonGrant()
      ).toBeNull()
      releaseClear()
      await p
    })
  })

  // ── getUserDetails ─────────────────────────────────────────────────────────

  describe('getUserDetails()', () => {
    test('returns undefined when no userData in store', async () => {
      mockConfigStore.get_nodefault.mockReturnValue(undefined)
      const result = await steamUser.getUserDetails()
      expect(result).toBeUndefined()
    })

    test('returns stored userData', async () => {
      const userData = { username: 'TestUser', steamId: '76561197900000000' }
      mockConfigStore.get_nodefault.mockReturnValue(userData)
      const result = await steamUser.getUserDetails()
      expect(result).toEqual(userData)
    })
  })

  // ── Password is never stored ───────────────────────────────────────────────

  describe('password storage safety', () => {
    test('configStore.set is never called with password or credentials keys', async () => {
      // This is asserted across all test methods that call set
      // We verify no call used 'password' as a key
      await steamUser.logout()

      const setCalls = mockConfigStore.set.mock.calls
      for (const [key] of setCalls) {
        expect(key).not.toBe('password')
        expect(key).not.toBe('credentials')
        expect(key).not.toMatch(/password/i)
      }
    })
  })

  // ── AUTH-01: QR Login ──────────────────────────────────────────────────────

  describe('startQRLogin()', () => {
    beforeEach(() => {
      mockSessionInstance.startWithQR.mockResolvedValue({
        qrChallengeUrl: 'steam://...qr_url_here',
        actionRequired: true
      })
    })

    test('returns { status: "done", challengeUrl } on success', async () => {
      const result = await startQRLogin(steamDeps)
      expect(result.status).toBe('done')
      expect(result.challengeUrl).toBe('steam://...qr_url_here')
    })

    test('creates a new LoginSession for each attempt', async () => {
      MockLoginSession.mockClear()
      await startQRLogin(steamDeps)
      expect(MockLoginSession).toHaveBeenCalledTimes(1)
    })

    test('returns { status: "error" } when startWithQR throws', async () => {
      mockSessionInstance.startWithQR.mockRejectedValue(
        new Error('network error')
      )
      const result = await startQRLogin(steamDeps)
      expect(result.status).toBe('error')
    })

    // ── T-HD0: observability lines (todo: a failed Steam QR login leaves no
    // trace in gamelib.log) ────────────────────────────────────────────────

    test('emits a logInfo line when a login attempt starts', async () => {
      await startQRLogin(steamDeps)

      const lines = jest
        .mocked(logInfo)
        .mock.calls.flat(Infinity)
        .map((arg) => String(arg))
      expect(
        lines.some(
          (line) =>
            line.includes('Steam QR login:') &&
            line.includes('attempt starting')
        )
      ).toBe(true)
    })

    test('emits a logInfo line when cancelling a previous login session', async () => {
      await startQRLogin(steamDeps)
      await startQRLogin(steamDeps)

      const lines = jest
        .mocked(logInfo)
        .mock.calls.flat(Infinity)
        .map((arg) => String(arg))
      expect(
        lines.some((line) =>
          line.includes('cancelling a previous login session')
        )
      ).toBe(true)
      expect(mockSessionInstance.cancelLoginAttempt).toHaveBeenCalled()
    })

    test('emits a logInfo line naming the loginTimeout when the challenge is issued', async () => {
      await startQRLogin(steamDeps)

      expect(mockSessionInstance.loginTimeout).toBe(120000)
      const lines = jest
        .mocked(logInfo)
        .mock.calls.flat(Infinity)
        .map((arg) => String(arg))
      expect(
        lines.some(
          (line) => line.includes('challenge issued') && line.includes('120000')
        )
      ).toBe(true)
    })

    test('emits a logInfo line when the authenticated event is received', async () => {
      await startQRLogin(steamDeps)
      await defined(
        sessionOnHandlers['authenticated'],
        'authenticated handler'
      )()

      const lines = jest
        .mocked(logInfo)
        .mock.calls.flat(Infinity)
        .map((arg) => String(arg))
      expect(
        lines.some((line) => line.includes('authenticated event received'))
      ).toBe(true)
    })

    test('never logs the QR challenge URL or the refresh token across the whole QR flow', async () => {
      await startQRLogin(steamDeps)
      await defined(
        sessionOnHandlers['authenticated'],
        'authenticated handler'
      )()
      await pollQRLogin(steamDeps)
      await pollQRLogin(steamDeps)

      const allLogArgs = [
        ...jest.mocked(logInfo).mock.calls,
        ...jest.mocked(logWarning).mock.calls,
        ...jest.mocked(logError).mock.calls
      ]
        .flat(Infinity)
        .map((arg) => String(arg))

      expect(
        allLogArgs.some((arg) => arg.includes('steam://...qr_url_here'))
      ).toBe(false)
      expect(allLogArgs.some((arg) => arg.includes('mock-refresh-token'))).toBe(
        false
      )
    })

    test('still logs a warning when the session times out (regression, D-01)', async () => {
      await startQRLogin(steamDeps)
      sessionOnHandlers['timeout']?.()

      const lines = jest
        .mocked(logWarning)
        .mock.calls.flat(Infinity)
        .map((arg) => String(arg))
      expect(
        lines.some((line) => line.includes('Steam QR session timed out'))
      ).toBe(true)
    })
  })

  // ── AUTH-01: QR Poll ───────────────────────────────────────────────────────

  describe('pollQRLogin(steamDeps)', () => {
    beforeEach(async () => {
      mockSessionInstance.startWithQR.mockResolvedValue({
        qrChallengeUrl: 'steam://...qr_url_here',
        actionRequired: true
      })
      mockSteamUserInstance.logOn.mockImplementation(() => {
        // Immediately trigger loggedOn after logOn is called
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })
      await startQRLogin(steamDeps)
    })

    test('returns { status: "waiting" } before authenticated event fires', async () => {
      const result = await pollQRLogin(steamDeps)
      expect(result.status).toBe('waiting')
    })

    test('returns { status: "done", username: undefined } after authenticated event fires', async () => {
      // Trigger 'authenticated' on the session mock.
      // After the fix, qrSessionState is set to done synchronously (before the CM
      // connection resolves), so username is undefined at poll time.
      expect(sessionOnHandlers['authenticated']).toBeDefined()
      await defined(
        sessionOnHandlers['authenticated'],
        'authenticated handler'
      )()

      const result = await pollQRLogin(steamDeps)
      expect(result.status).toBe('done')
      expect(result.username).toBeUndefined()
    })

    test('after auth: hands the refresh token to the TokenStore', async () => {
      const setTokenSpy = jest.spyOn(tokenStore.current(), 'setToken')
      await defined(
        sessionOnHandlers['authenticated'],
        'authenticated handler'
      )()
      expect(setTokenSpy).toHaveBeenCalledWith('mock-refresh-token')
    })

    test('after auth: isLoggedIn becomes true in configStore', async () => {
      await defined(
        sessionOnHandlers['authenticated'],
        'authenticated handler'
      )()
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
    })

    test('returns { status: "error" } when session times out', async () => {
      sessionOnHandlers['timeout']?.()
      const result = await pollQRLogin(steamDeps)
      expect(result.status).toBe('error')
    })

    // ── T-HD0: change-only status-transition logging (D-01, D-02, D-03) ──────

    function pollLines(): string[] {
      return jest
        .mocked(logInfo)
        .mock.calls.flat(Infinity)
        .map((arg) => String(arg))
        .filter((line) => line.includes('Steam QR poll:'))
    }

    test('logs the first observation of a fresh attempt as none -> waiting', async () => {
      await pollQRLogin(steamDeps)

      expect(pollLines().some((line) => line.includes('none -> waiting'))).toBe(
        true
      )
    })

    test('three consecutive polls with no state change emit exactly one line (flood guard, D-02)', async () => {
      await pollQRLogin(steamDeps)
      await pollQRLogin(steamDeps)
      await pollQRLogin(steamDeps)

      expect(pollLines()).toHaveLength(1)
    })

    test('a status change from waiting to error emits a second line', async () => {
      await pollQRLogin(steamDeps)
      sessionOnHandlers['timeout']?.()
      await pollQRLogin(steamDeps)

      const lines = pollLines()
      expect(lines).toHaveLength(2)
      expect(lines[1]).toContain('waiting -> error')
    })

    test('a status change from waiting to done emits a second line', async () => {
      await pollQRLogin(steamDeps)
      await defined(
        sessionOnHandlers['authenticated'],
        'authenticated handler'
      )()
      await pollQRLogin(steamDeps)

      const lines = pollLines()
      expect(lines).toHaveLength(2)
      expect(lines[1]).toContain('waiting -> done')
    })

    test('never logs the persona name on a poll transition line (D-03)', async () => {
      await pollQRLogin(steamDeps)
      await defined(
        sessionOnHandlers['authenticated'],
        'authenticated handler'
      )()

      // Flush the background profile read (acquire -> licenses -> getPersonas) so the persona
      // name resolves before the next poll — the transition line must still omit it (D-03).
      await new Promise((resolve) => process.nextTick(resolve))
      await flushAsync()

      const result = await pollQRLogin(steamDeps)
      expect(result.username).toBe('TestUser')
      expect(pollLines().some((line) => line.includes('TestUser'))).toBe(false)
    })

    test('the tracker resets across attempts so a second attempt logs its own first observation', async () => {
      await pollQRLogin(steamDeps)
      sessionOnHandlers['timeout']?.()
      await pollQRLogin(steamDeps)

      mockSessionInstance.startWithQR.mockResolvedValue({
        qrChallengeUrl: 'steam://...qr_url_here',
        actionRequired: true
      })
      await startQRLogin(steamDeps)
      await pollQRLogin(steamDeps)

      const lines = pollLines()
      expect(lines).toHaveLength(3)
      expect(lines[2]).toContain('none -> waiting')
    })
  })

  // ── connectSteamUserClient — timeout guard ────────────────────────────────

  // ── AUTH-02: Credential Login ──────────────────────────────────────────────

  describe('startCredentialLogin()', () => {
    test('returns { status: "guard_required" } when actionRequired is true', async () => {
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: true,
        validActions: [{ type: 2 }] // EmailCode = 2
      })

      const result = await startCredentialLogin(
        steamDeps,
        'testuser',
        'password123'
      )
      expect(result.status).toBe('guard_required')
    })

    test('waits for authenticated and returns { status: "done" } when no guard needed', async () => {
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: false
      })
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })

      // Fire authenticated event slightly after startCredentialLogin resolves
      let authFired = false
      const originalStartCredentials = mockSessionInstance.startWithCredentials
      mockSessionInstance.startWithCredentials.mockImplementation(async () => {
        setTimeout(() => {
          if (sessionOnHandlers['authenticated'] && !authFired) {
            authFired = true
            void sessionOnHandlers['authenticated']()
          }
        }, 10)
        return { actionRequired: false }
      })

      const result = await startCredentialLogin(
        steamDeps,
        'testuser',
        'password123'
      )
      expect(result.status).toBe('done')

      // Restore
      mockSessionInstance.startWithCredentials.mockImplementation(
        originalStartCredentials
      )
    })

    test('returns { status: "error" } when startWithCredentials throws', async () => {
      mockSessionInstance.startWithCredentials.mockRejectedValue(
        new Error('InvalidPassword')
      )
      const result = await startCredentialLogin(
        steamDeps,
        'testuser',
        'wrongpass'
      )
      expect(result.status).toBe('error')
    })

    test('never stores the password in configStore', async () => {
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: true
      })
      await startCredentialLogin(steamDeps, 'testuser', 'mysecretpassword')

      for (const [key, value] of mockConfigStore.set.mock.calls) {
        expect(key).not.toBe('password')
        expect(key).not.toBe('credentials')
        if (typeof value === 'object' && value !== null) {
          expect(JSON.stringify(value)).not.toContain('mysecretpassword')
        } else {
          expect(String(value)).not.toContain('mysecretpassword')
        }
      }
    })

    // ── loginTimeout regression (email-steamguard-still-invalid) ─────────────
    // Root cause: credential session inherited steam-session's 30 s default polling
    // timeout. Email SteamGuard retrieval reliably exceeds 30 s, so the session was
    // auto-canceled before the user could submit the code. Fix: set loginTimeout to
    // 180 000 ms before startWithCredentials() so polling runs long enough.
    test('sets loginTimeout >= 120000 on the credential session before startWithCredentials is called', async () => {
      let loginTimeoutAtCallTime: number | undefined

      mockSessionInstance.startWithCredentials.mockImplementation(async () => {
        // Capture whatever loginTimeout was assigned to the session instance at
        // the moment startWithCredentials() is invoked. This verifies ORDER —
        // the timeout must be set before polling begins (steam-session throws
        // if loginTimeout is changed after polling starts, LoginSession.js:107).

        loginTimeoutAtCallTime = (mockSessionInstance as any).loginTimeout
        return { actionRequired: true }
      })

      await startCredentialLogin(steamDeps, 'testuser', 'password123')

      expect(loginTimeoutAtCallTime).toBeGreaterThanOrEqual(120000)
    })

    // ── DeviceConfirmation listener fix (email-steamguard-still-invalid) ──────
    // Root cause: when actionRequired=true + DeviceConfirmation (type 4) is in
    // validActions, steam-session auto-starts polling via setImmediate(_doPoll).
    // If 'authenticated' fires during the guard-waiting period (phone approval)
    // and no listener is attached, cancelLoginAttempt() sets _pollingCanceled=true
    // silently. submitSteamGuardCode then throws "Login attempt has been canceled".
    // Fix: attach 'authenticated'/'error'/'timeout' listeners BEFORE returning
    // guard_required, via the new persistent listener pattern.

    test('guard_required: registers authenticated/error/timeout listeners on the credential session', async () => {
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: true,
        validActions: [{ type: 3 }, { type: 4 }] // DeviceCode + DeviceConfirmation
      })

      await startCredentialLogin(steamDeps, 'testuser', 'password123')

      // All three listeners must be registered so the session is handled for
      // its full lifetime — DeviceConfirmation polling starts automatically
      // (setImmediate in steam-session) and can fire any of these events.
      expect(sessionOnHandlers['authenticated']).toBeDefined()
      expect(sessionOnHandlers['error']).toBeDefined()
      expect(sessionOnHandlers['timeout']).toBeDefined()
    })

    test('guard_required: authenticated event before submitSteamGuardCode calls finishAuth and settles pollCredentialLogin as done', async () => {
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: true,
        validActions: [{ type: 3 }, { type: 4 }] // DeviceCode + DeviceConfirmation
      })
      // logOn triggers loggedOn (persona name resolution for finishAuth)
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })

      // Start the credential login — returns guard_required
      const result = await startCredentialLogin(
        steamDeps,
        'testuser',
        'password123'
      )
      expect(result.status).toBe('guard_required')

      // Simulate DeviceConfirmation phone approval: 'authenticated' fires on
      // the session BEFORE the user calls submitSteamGuardCode.
      expect(sessionOnHandlers['authenticated']).toBeDefined()
      await defined(
        sessionOnHandlers['authenticated'],
        'authenticated handler'
      )()

      // finishAuth must have been called: token stored and isLoggedIn set
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)

      // pollCredentialLogin must reflect the done state so the frontend can
      // navigate away (out-of-band completion — no submitSteamGuardCode needed)
      const poll = await pollCredentialLogin(steamDeps)
      expect(poll.status).toBe('done')

      // submitSteamGuardCode was NOT called — this is the phone-approval path
      expect(mockSessionInstance.submitSteamGuardCode).not.toHaveBeenCalled()
    })
  })

  // ── AUTH-02: SteamGuard submit ─────────────────────────────────────────────

  describe('submitSteamGuardCode(steamDeps, )', () => {
    beforeEach(async () => {
      // Start a credential session first so this.session is set
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: true
      })
      await startCredentialLogin(steamDeps, 'testuser', 'pass')
    })

    test('returns { status: "done" } on successful code submission', async () => {
      mockSessionInstance.submitSteamGuardCode.mockResolvedValue(undefined)
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })

      // The 'authenticated' event fires after submitSteamGuardCode resolves
      mockSessionInstance.submitSteamGuardCode.mockImplementation(async () => {
        setTimeout(() => sessionOnHandlers['authenticated']?.(), 10)
      })

      const result = await submitSteamGuardCode(steamDeps, '12345')
      expect(result.status).toBe('done')
    })

    test('returns { status: "error" } when code submission fails', async () => {
      mockSessionInstance.submitSteamGuardCode.mockRejectedValue(
        new Error('TwoFactorCodeMismatch')
      )
      const result = await submitSteamGuardCode(steamDeps, '99999')
      expect(result.status).toBe('error')
    })

    test('returns { status: "error" } when no active session', async () => {
      // Call logout to clear the session — logout() sets this.session = null
      await steamUser.logout()
      const result = await submitSteamGuardCode(steamDeps, '12345')
      expect(result.status).toBe('error')
    })

    // ── Alphanumeric EmailCode path + normalization regression tests ──────────

    test('alphanumeric EmailCode: submits normalized KQM4F to session and resolves done', async () => {
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })
      mockSessionInstance.submitSteamGuardCode.mockImplementation(async () => {
        setTimeout(() => sessionOnHandlers['authenticated']?.(), 10)
      })

      const result = await submitSteamGuardCode(steamDeps, 'KQM4F')
      expect(result.status).toBe('done')
      expect(mockSessionInstance.submitSteamGuardCode).toHaveBeenCalledWith(
        'KQM4F'
      )
    })

    test('normalization: lowercase kqm4f is uppercased to KQM4F before reaching session', async () => {
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })
      mockSessionInstance.submitSteamGuardCode.mockImplementation(async () => {
        setTimeout(() => sessionOnHandlers['authenticated']?.(), 10)
      })

      await submitSteamGuardCode(steamDeps, 'kqm4f')
      expect(mockSessionInstance.submitSteamGuardCode).toHaveBeenCalledWith(
        'KQM4F'
      )
    })

    test('normalization: padded "  kqm4f  " is trimmed+uppercased to KQM4F before reaching session', async () => {
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })
      mockSessionInstance.submitSteamGuardCode.mockImplementation(async () => {
        setTimeout(() => sessionOnHandlers['authenticated']?.(), 10)
      })

      await submitSteamGuardCode(steamDeps, '  kqm4f  ')
      expect(mockSessionInstance.submitSteamGuardCode).toHaveBeenCalledWith(
        'KQM4F'
      )
    })

    test('numeric TOTP code 12345 passes through unchanged (normalization is no-op for digits)', async () => {
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })
      mockSessionInstance.submitSteamGuardCode.mockImplementation(async () => {
        setTimeout(() => sessionOnHandlers['authenticated']?.(), 10)
      })

      await submitSteamGuardCode(steamDeps, '12345')
      expect(mockSessionInstance.submitSteamGuardCode).toHaveBeenCalledWith(
        '12345'
      )
    })
  })

  // ── QR race fix (260629-9ly): connectingPromise dedupe + username gating ─────

  // ── logout with connected client ───────────────────────────────────────────

  // ── LIB-01: reconnect on startup ───────────────────────────────────────────

  // ── steam-sync-false-failed-banner: a terminal CM logon rejection ──────────
  //
  // steam-user 5.3.0 `_handleLogOnResponse`'s default arm (AccessDenied et al.)
  // does `_disconnect(true)` + `emit('error')` and schedules NO retry. Before
  // this fix ensureConnected() attached its post-cold-connect grace listeners
  // AFTER that 'error' had already fired -- they could only time out, so every
  // rejected logon cost exactly 20 s (gamelib.log: "grace-window wait took an
  // additional 20002ms, connected=false") and was then reported as a generic
  // "client not ready".
  // ── quick 261011-rj0: a CM credential refusal reaches the sign-in surface ──
  //
  // Phase 49 D-21 made the Steam boot probe presence-only (it reads the keyring
  // and never opens the CM), so a token that is PRESENT but REFUSED by the CM
  // (AccessDenied for a revoked/expired refresh token) left `credentialsMissing`
  // unset and the Library showed the generic "Couldn't sync / Retry" banner --
  // wrong on both counts: Steam is reachable and Retry replays the refusal.
  // ensureConnected() now reports the CM's own verdict through the same fenced
  // `applySignInVerdict` the probe pass uses, so the D-19 expired row renders
  // and `resolveSteamSyncIndicator` suppresses the banner.
  // ── quick-260814-r2d: unreadable read is not logged-out ────────────────────
  //
  // Installs a fake TokenStore through the real tokenStore.configure() seam, matching
  // production's adapter exactly: readToken() resolves the outcome under test,
  // getToken() resolves '' (the lossy adapter's collapse for both absent and
  // unreadable). tokenStore.configure() mutates module-global state, so every test in
  // this describe restores the config-backed test store in afterEach --
  // leaving the fake installed would make the OTHER describe blocks in this
  // file (which assume the config-backed store routed through
  // mockConfigStore) order-dependent on whichever test ran last.
  // ── D-02 (Phase 33-02): ensureConnected canary + relog revalidation ────────
  //
  // Establishes a connected client (steamID truthy) via QR login — matching
  // the "does not reconnect..." setup above — then drives the
  // getProductInfo/relog()/once('loggedOn'|'error') seams to exercise the
  // four behaviors from the plan: healthy short-circuit, stale-canary
  // self-heal via relog, bounded (never-hangs) grace timeout, and error
  // during relog.

  // ── REQ-26-02/04/05/06: redeemKey() ────────────────────────────────────────

  describe('redeemKey()', () => {
    let acquireSpy: jest.SpyInstance
    let releaseLease: jest.Mock

    beforeEach(() => {
      // Isolate redeemKey()'s own logic from the connection-establishment
      // flow (covered by the lifecycle suite and the describe blocks above):
      // spy the one seam redeemKey() consults so each test exercises only the
      // resolve/reject classification behavior.
      releaseLease = jest.fn()
      acquireSpy = jest
        .spyOn(steamUser, 'acquireAuthenticated')
        .mockResolvedValue({
          ok: true,
          client: mockSteamUserInstance as any,
          release: releaseLease
        })
    })

    afterEach(() => {
      acquireSpy.mockRestore()
    })

    test('OK (0): resolves and classifies as success, carries store + packageList', async () => {
      mockSteamUserInstance.redeemKey.mockResolvedValue({
        purchaseResultDetails: 0,
        packageList: { '123': 'Some Game' }
      })

      const result = await redeemKey(steamDeps, 'steam', 'TEST-KEY-VALUE')

      expect(result).toEqual({
        store: 'steam',
        outcome: 'success',
        packageList: { '123': 'Some Game' }
      })
      expect(releaseLease).toHaveBeenCalledTimes(1)
      expect(acquireSpy).toHaveBeenCalledWith({
        reason: 'redeem',
        guidedAction: 'redeem'
      })
    })

    test('releases the lease when client.redeemKey rejects', async () => {
      mockSteamUserInstance.redeemKey.mockRejectedValue(new Error('boom'))

      await redeemKey(steamDeps, 'steam', 'TEST-KEY-VALUE')

      expect(releaseLease).toHaveBeenCalledTimes(1)
    })

    test('a go-offline-required refusal maps to the go-offline-required message', async () => {
      acquireSpy.mockResolvedValue({
        ok: false,
        reason: 'go-offline-required'
      })

      const result = await redeemKey(steamDeps, 'steam', 'TEST-KEY-VALUE')

      expect(result).toEqual({
        store: 'steam',
        outcome: 'error',
        message: 'go-offline-required'
      })
      expect(mockSteamUserInstance.redeemKey).not.toHaveBeenCalled()
    })

    const rejectCases: Array<{
      name: string
      details: number
      bucket: 'already-owned' | 'invalid' | 'rate-limited'
    }> = [
      { name: 'AlreadyOwned', details: 9, bucket: 'already-owned' },
      { name: 'RegionLockedKey', details: 13, bucket: 'invalid' },
      { name: 'InvalidKey', details: 14, bucket: 'invalid' },
      { name: 'DuplicatedKey', details: 15, bucket: 'invalid' },
      { name: 'BaseGameRequired', details: 24, bucket: 'invalid' },
      { name: 'OnCooldown', details: 53, bucket: 'rate-limited' },
      { name: 'Unknown', details: -1, bucket: 'invalid' }
    ]

    test.each(rejectCases)(
      '$name ($details): rejects and classifies as $bucket',
      async ({ details, bucket, name }) => {
        const err = Object.assign(new Error(name), {
          purchaseResultDetails: details,
          packageList: {}
        })
        mockSteamUserInstance.redeemKey.mockRejectedValue(err)

        const result = await redeemKey(steamDeps, 'steam', 'TEST-KEY-VALUE')

        expect(result.store).toBe('steam')
        expect(result.outcome).toBe(bucket)
      }
    )

    // WR-01: a rejection with NO purchaseResultDetails is a transport/timeout/
    // unexpected failure, NOT a purchase verdict. It must map to 'error' (the
    // connectivity copy) rather than 'invalid' — otherwise a network drop while
    // redeeming a valid key wrongly tells the user the key "doesn't look right".
    test('rejected Error with no purchaseResultDetails -> transport failure classified as "error"', async () => {
      mockSteamUserInstance.redeemKey.mockRejectedValue(new Error('boom'))

      const result = await redeemKey(steamDeps, 'steam', 'TEST-KEY-VALUE')

      expect(result.store).toBe('steam')
      expect(result.outcome).toBe('error')
      expect(result.message).toBe('redeem-failed')
    })

    // WR-01: a non-numeric purchaseResultDetails is also not a genuine
    // EPurchaseResult verdict — treat it as a transport failure, not 'invalid'.
    test('rejected Error with non-numeric purchaseResultDetails -> "error"', async () => {
      const err = Object.assign(new Error('weird'), {
        purchaseResultDetails: 'not-a-number'
      })
      mockSteamUserInstance.redeemKey.mockRejectedValue(err)

      const result = await redeemKey(steamDeps, 'steam', 'TEST-KEY-VALUE')

      expect(result.store).toBe('steam')
      expect(result.outcome).toBe('error')
    })

    test('not connected (lease refused): returns outcome "error" and never calls client.redeemKey', async () => {
      acquireSpy.mockResolvedValue({ ok: false, reason: 'not-signed-in' })

      const result = await redeemKey(steamDeps, 'steam', 'TEST-KEY-VALUE')

      expect(result).toEqual({
        store: 'steam',
        outcome: 'error',
        message: 'not-connected'
      })
      expect(mockSteamUserInstance.redeemKey).not.toHaveBeenCalled()
    })

    test('not connected (client not ready): returns outcome "error" and never calls client.redeemKey', async () => {
      acquireSpy.mockResolvedValue({ ok: false, reason: 'client-not-ready' })

      const result = await redeemKey(steamDeps, 'steam', 'TEST-KEY-VALUE')

      expect(result.outcome).toBe('error')
      expect(mockSteamUserInstance.redeemKey).not.toHaveBeenCalled()
    })

    test('never logs the raw key value', async () => {
      const secretKey = 'SUPER-SECRET-KEY-VALUE-12345'
      mockSteamUserInstance.redeemKey.mockResolvedValue({
        purchaseResultDetails: 0,
        packageList: {}
      })

      await redeemKey(steamDeps, 'steam', secretKey)

      const mockedLogInfo = jest.mocked(logInfo)
      const mockedLogWarning = jest.mocked(logWarning)
      const mockedLogError = jest.mocked(logError)
      const allLogArgs = [
        ...mockedLogInfo.mock.calls,
        ...mockedLogWarning.mock.calls,
        ...mockedLogError.mock.calls
      ]
        .flat(Infinity)
        .map((arg) => String(arg))

      expect(allLogArgs.some((arg) => arg.includes(secretKey))).toBe(false)
    })
  })

  // ── Phase 54 (54-03): sign-in, redeem and logout via the gated entry point ──

  describe('Phase 54 sign-in and redeem through the gated entry point', () => {
    const SESSION_STEAM_ID = FAKE_STEAM_ID

    beforeEach(() => {
      // steam-session's LoginSession.steamID needs no CM: derived from the token.
      Object.defineProperty(mockSessionInstance, 'steamID', {
        configurable: true,
        get: () => ({ getSteamID64: () => SESSION_STEAM_ID })
      })
    })

    afterEach(() => {
      delete (mockSessionInstance as any).steamID
      jest.useRealTimers()
    })

    async function signInWithCredentials(): Promise<{ status: string }> {
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: false
      })
      const pending = startCredentialLogin(steamDeps, 'testuser', 'pw')
      await flushAsync()
      void sessionOnHandlers['authenticated']?.()
      return pending
    }

    test('credentials sign-in: one Rust acquire with the in-memory token, no keyring re-read, steamId from the LoginSession, lease released', async () => {
      const getTokenSpy = jest.spyOn(tokenStore.current(), 'getToken')

      const result = await signInWithCredentials()

      expect(result.status).toBe('done')
      const acquires = rustCalls.filter(
        ([channel]) => channel === 'steamcm_session_acquire'
      )
      expect(acquires).toEqual([
        [
          'steamcm_session_acquire',
          [
            {
              refreshToken: 'mock-refresh-token',
              reason: 'login',
              logonId: 0
            }
          ]
        ]
      ])
      expect(getTokenSpy).not.toHaveBeenCalled()
      getTokenSpy.mockRestore()
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
      expect(mockConfigStore.set).toHaveBeenCalledWith('userData', {
        username: 'TestUser',
        steamId: SESSION_STEAM_ID
      })
      expect(rustChannels()).toContain('steamcm_session_release')
    })

    test('sign-in when the wrap refuses: no lease, account-name fallback, no guided push, still done', async () => {
      rustFake.acquire = () => ({ ok: false, refusal: 'go-offline-required' })

      const result = await signInWithCredentials()

      expect(result.status).toBe('done')
      expect(rustChannels()).not.toContain('steamcm_personas')
      expect(mockConfigStore.set).toHaveBeenCalledWith('userData', {
        username: 'testuser',
        steamId: SESSION_STEAM_ID
      })
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamGoOfflineRequired',
        expect.anything()
      )
    })

    test('a getPersonas that hangs is bounded at 5000 ms and falls back to the account name', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
      rustFake.personas = () => new Promise(() => {})
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: false
      })
      const pending = startCredentialLogin(steamDeps, 'testuser', 'pw')
      await flushAsync()
      void sessionOnHandlers['authenticated']?.()
      await flushAsync()

      await jest.advanceTimersByTimeAsync(4999)
      expect(
        mockConfigStore.set.mock.calls.find(([key]) => key === 'userData')
      ).toBeUndefined()
      await jest.advanceTimersByTimeAsync(1)

      expect((await pending).status).toBe('done')
      expect(mockConfigStore.set).toHaveBeenCalledWith('userData', {
        username: 'testuser',
        steamId: SESSION_STEAM_ID
      })
    })

    test('redeemKey with a go-offline refusal pushes steamGoOfflineRequired { action: "redeem" } and reports go-offline-required', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'isLoggedIn') return true
        if (key === 'refreshToken') return 'stored-plaintext-token'
        return undefined
      })
      rustFake.acquire = () => ({ ok: false, refusal: 'go-offline-required' })

      const result = await redeemKey(steamDeps, 'steam', 'TEST-KEY-VALUE')

      expect(result).toEqual({
        store: 'steam',
        outcome: 'error',
        message: 'go-offline-required'
      })
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'steamGoOfflineRequired',
        { action: 'redeem', appName: undefined }
      )
      expect(rustChannels()).not.toContain('steamcm_redeem_key')
    })

    test('redeemKey with any other refusal reports not-connected and pushes nothing', async () => {
      // not signed in: get_nodefault stays undefined
      const result = await redeemKey(steamDeps, 'steam', 'TEST-KEY-VALUE')

      expect(result).toEqual({
        store: 'steam',
        outcome: 'error',
        message: 'not-connected'
      })
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamGoOfflineRequired',
        expect.anything()
      )
    })

    test('logout fences the Rust session, closes the anonymous client and refuses reuse', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'isLoggedIn') return true
        if (key === 'refreshToken') return 'stored-plaintext-token'
        return undefined
      })
      const lease = await steamUser.acquireAuthenticated({
        reason: 'user-install'
      })
      expect(lease.ok).toBe(true)
      if (lease.ok) lease.release()

      await steamUser.logout()

      expect(rustChannels()).toContain('steamcm_session_logout')
      expect(mockCloseAnonymousClient).toHaveBeenCalledWith('logout')
      expect(
        await steamUser.acquireOpenAuthenticated('shared-redist')
      ).toBeNull()
    })
  })
})
