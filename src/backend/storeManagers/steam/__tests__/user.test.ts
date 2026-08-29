/**
 * Unit tests for SteamUser static class.
 * Covers AUTH-01 through AUTH-05.
 *
 * Mock boundaries:
 *  - electron   → safeStorage (encrypt/decrypt/availability)
 *  - steam-session → LoginSession constructor + instance methods
 *  - steam-user    → SteamUser constructor + instance methods (aliased as SteamUserLib)
 *  - graceful-fs   → existsSync
 *  - backend/logger
 *  - ../electronStores → configStore
 */

// ── Electron mock (must be first, jest.mock is hoisted) ──────────────────────
const mockEncryptString = jest.fn((s: string) => Buffer.from(s))
const mockDecryptString = jest.fn((b: Buffer) => b.toString())
const mockIsEncryptionAvailable = jest.fn(() => true)

jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: mockIsEncryptionAvailable,
    encryptString: mockEncryptString,
    decryptString: mockDecryptString
  },
  app: { getPath: jest.fn(() => '/tmp/test') }
}))

// ── Logger mock (factory to prevent transitive module load failures) ──────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend',
    Gog: 'Gog',
    Legendary: 'Legendary',
    Nile: 'Nile',
    Sideload: 'Sideload',
    Zoom: 'Zoom'
  }
}))

// ── graceful-fs mock ──────────────────────────────────────────────────────────
const mockExistsSync = jest.fn(() => false)
jest.mock('graceful-fs', () => ({
  existsSync: mockExistsSync
}))

// ── electronStores mock ───────────────────────────────────────────────────────
const mockConfigStore = {
  get: jest.fn(),
  get_nodefault: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn()
}
jest.mock('../electronStores', () => ({
  configStore: mockConfigStore
}))
// NOTE: '../tokenStore' is intentionally NOT mocked here. logout() must
// route the refresh token through the real TokenStore seam
// (getTokenStore().clearToken() -> ElectronTokenStore.clearToken() ->
// configStore.delete(TOKEN_STORE_KEY)), exercised against the mocked
// configStore/safeStorage above — same approach the pre-existing
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

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { SteamUser } from '../user'
import { safeStorage } from 'backend/platform'
import { existsSync } from 'graceful-fs'
import { logInfo, logWarning, logError } from 'backend/logger'
import { setTokenStore, ElectronTokenStore, TokenStore } from '../tokenStore'

// ─────────────────────────────────────────────────────────────────────────────
describe('SteamUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // ── Re-establish mock implementations (resetMocks: true clears them) ──────

    // safeStorage mocks
    mockIsEncryptionAvailable.mockReturnValue(true)
    mockEncryptString.mockImplementation((s: string) => Buffer.from(s))
    mockDecryptString.mockImplementation((b: Buffer) => b.toString())

    // graceful-fs mocks
    mockExistsSync.mockReturnValue(false)

    // configStore mocks
    mockConfigStore.clear.mockImplementation(() => {})
    mockConfigStore.delete.mockImplementation(() => {})
    mockConfigStore.get_nodefault.mockReturnValue(undefined)
    mockConfigStore.set.mockImplementation(() => {})

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
    test('returns false when no platform paths exist', () => {
      mockExistsSync.mockReturnValue(false)
      expect(SteamUser.isSteamClientInstalled()).toBe(false)
    })

    test('returns true when a matching path exists', () => {
      // Make existsSync return true for any path
      mockExistsSync.mockReturnValue(true)
      expect(SteamUser.isSteamClientInstalled()).toBe(true)
    })

    test('returns false on unknown platform (no paths)', () => {
      const original = process.platform
      Object.defineProperty(process, 'platform', {
        value: 'freebsd',
        configurable: true
      })
      mockExistsSync.mockReturnValue(false)
      expect(SteamUser.isSteamClientInstalled()).toBe(false)
      Object.defineProperty(process, 'platform', {
        value: original,
        configurable: true
      })
    })

    test('calls existsSync with platform-specific paths', () => {
      mockExistsSync.mockReturnValue(false)
      const savedPlatform = process.platform
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true
      })

      SteamUser.isSteamClientInstalled()
      const calledPaths = (existsSync as jest.Mock).mock.calls.map(([p]) => p)
      expect(calledPaths).toContain('/Applications/Steam.app')

      Object.defineProperty(process, 'platform', {
        value: savedPlatform,
        configurable: true
      })
    })
  })

  // ── Token encryption/decryption ────────────────────────────────────────────

  describe('getCredentials() — token decrypt', () => {
    test('returns undefined when no token stored', async () => {
      mockConfigStore.get_nodefault.mockReturnValue(undefined)
      const result = await SteamUser.getCredentials()
      expect(result).toBeUndefined()
    })

    test('returns undefined when stored value is not a string', async () => {
      mockConfigStore.get_nodefault.mockReturnValue(42)
      const result = await SteamUser.getCredentials()
      expect(result).toBeUndefined()
    })

    test('decrypts steam:v1: prefixed token and returns refreshToken', async () => {
      const token = 'my-refresh-token'
      const encoded = 'steam:v1:' + Buffer.from(token).toString('base64')
      mockConfigStore.get_nodefault.mockReturnValue(encoded)
      mockDecryptString.mockReturnValue(token)

      const result = await SteamUser.getCredentials()
      expect(result).toEqual({ refreshToken: token })
      expect(safeStorage.decryptString).toHaveBeenCalled()
    })

    test('returns empty string token when encryption unavailable and prefix present', async () => {
      const encoded = 'steam:v1:' + Buffer.from('token').toString('base64')
      mockConfigStore.get_nodefault.mockReturnValue(encoded)
      mockIsEncryptionAvailable.mockReturnValue(false)

      const result = await SteamUser.getCredentials()
      // When encryption unavailable and prefix present, decryptToken returns ''
      expect(result).toBeUndefined()
    })

    test('handles legacy plaintext token (no prefix)', async () => {
      // Legacy value stored without 'steam:v1:' prefix — returned as-is
      const plainToken = 'legacy-plaintext-token'
      mockConfigStore.get_nodefault.mockReturnValue(plainToken)

      const result = await SteamUser.getCredentials()
      expect(result).toEqual({ refreshToken: plainToken })
      // decryptString should NOT be called for legacy plaintext
      expect(safeStorage.decryptString).not.toHaveBeenCalled()
    })
  })

  // ── AUTH-03: isLoggedIn ────────────────────────────────────────────────────

  describe('isLoggedIn()', () => {
    test('returns false when configStore has no isLoggedIn', () => {
      mockConfigStore.get_nodefault.mockReturnValue(undefined)
      expect(SteamUser.isLoggedIn()).toBe(false)
    })

    test('returns false when isLoggedIn is false in store', () => {
      mockConfigStore.get_nodefault.mockReturnValue(false)
      expect(SteamUser.isLoggedIn()).toBe(false)
    })

    test('returns true when isLoggedIn is true in store', () => {
      mockConfigStore.get_nodefault.mockReturnValue(true)
      expect(SteamUser.isLoggedIn()).toBe(true)
    })
  })

  // ── AUTH-04: logout ────────────────────────────────────────────────────────
  //
  // D-09 gap fix (28-03): logout() must route the refresh token through the
  // TokenStore seam (getTokenStore().clearToken() -> configStore.delete(
  // TOKEN_STORE_KEY), TOKEN_STORE_KEY === 'refreshToken' per constants.ts)
  // instead of a blanket configStore.clear() — and must still clear the
  // remaining session keys (isLoggedIn, userData) explicitly so Electron's
  // observable behavior is unchanged. logout() is now async because
  // clearToken() may be an RPC round-trip to Rust in the sidecar build.

  describe('logout()', () => {
    test('does NOT call configStore.clear() (D-09 — must go through the seam, never a blanket wipe)', async () => {
      await SteamUser.logout()
      expect(mockConfigStore.clear).not.toHaveBeenCalled()
    })

    test('clears the refresh token via configStore.delete("refreshToken") — the TokenStore seam target key', async () => {
      await SteamUser.logout()
      expect(mockConfigStore.delete).toHaveBeenCalledWith('refreshToken')
    })

    // Regression guard for the naive one-line swap
    // (configStore.clear() -> getTokenStore().clearToken()): that swap alone
    // stops clearing isLoggedIn/userData, so the user would appear to stay
    // "logged in" after logout. This test fails under that naive fix and
    // only passes when isLoggedIn/userData are ALSO explicitly cleared.
    test('also explicitly clears isLoggedIn and userData session keys (not just the token)', async () => {
      await SteamUser.logout()
      expect(mockConfigStore.delete).toHaveBeenCalledWith('isLoggedIn')
      expect(mockConfigStore.delete).toHaveBeenCalledWith('userData')
    })

    test('does not throw when no steam-user client is connected', async () => {
      await expect(SteamUser.logout()).resolves.not.toThrow()
    })

    test('isLoggedIn returns false after logout clears the isLoggedIn key', async () => {
      // Simulate the targeted delete removing the key from the store
      mockConfigStore.delete.mockImplementation((key: string) => {
        if (key === 'isLoggedIn') {
          mockConfigStore.get_nodefault.mockReturnValue(undefined)
        }
      })
      await SteamUser.logout()
      expect(SteamUser.isLoggedIn()).toBe(false)
    })
  })

  // ── getUserDetails ─────────────────────────────────────────────────────────

  describe('getUserDetails()', () => {
    test('returns undefined when no userData in store', async () => {
      mockConfigStore.get_nodefault.mockReturnValue(undefined)
      const result = await SteamUser.getUserDetails()
      expect(result).toBeUndefined()
    })

    test('returns stored userData', async () => {
      const userData = { username: 'TestUser', steamId: '76561197900000000' }
      mockConfigStore.get_nodefault.mockReturnValue(userData)
      const result = await SteamUser.getUserDetails()
      expect(result).toEqual(userData)
    })
  })

  // ── Password is never stored ───────────────────────────────────────────────

  describe('password storage safety', () => {
    test('configStore.set is never called with password or credentials keys', async () => {
      // This is asserted across all test methods that call set
      // We verify no call used 'password' as a key
      await SteamUser.logout()

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
      const result = await SteamUser.startQRLogin()
      expect(result.status).toBe('done')
      expect(result.challengeUrl).toBe('steam://...qr_url_here')
    })

    test('creates a new LoginSession for each attempt', async () => {
      MockLoginSession.mockClear()
      await SteamUser.startQRLogin()
      expect(MockLoginSession).toHaveBeenCalledTimes(1)
    })

    test('returns { status: "error" } when startWithQR throws', async () => {
      mockSessionInstance.startWithQR.mockRejectedValue(
        new Error('network error')
      )
      const result = await SteamUser.startQRLogin()
      expect(result.status).toBe('error')
    })
  })

  // ── AUTH-01: QR Poll ───────────────────────────────────────────────────────

  describe('pollQRLogin()', () => {
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
      await SteamUser.startQRLogin()
    })

    test('returns { status: "waiting" } before authenticated event fires', async () => {
      const result = await SteamUser.pollQRLogin()
      expect(result.status).toBe('waiting')
    })

    test('returns { status: "done", username: undefined } after authenticated event fires', async () => {
      // Trigger 'authenticated' on the session mock.
      // After the fix, qrSessionState is set to done synchronously (before the CM
      // connection resolves), so username is undefined at poll time.
      expect(sessionOnHandlers['authenticated']).toBeDefined()
      await sessionOnHandlers['authenticated']()

      const result = await SteamUser.pollQRLogin()
      expect(result.status).toBe('done')
      expect(result.username).toBeUndefined()
    })

    test('after auth: encrypts and stores token (safeStorage.encryptString called)', async () => {
      await sessionOnHandlers['authenticated']()
      expect(safeStorage.encryptString).toHaveBeenCalledWith(
        'mock-refresh-token'
      )
    })

    test('after auth: isLoggedIn becomes true in configStore', async () => {
      await sessionOnHandlers['authenticated']()
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
    })

    test('returns { status: "error" } when session times out', async () => {
      sessionOnHandlers['timeout']?.()
      const result = await SteamUser.pollQRLogin()
      expect(result.status).toBe('error')
    })
  })

  // ── connectSteamUserClient — timeout guard ────────────────────────────────

  describe('connectSteamUserClient() — timeout guard', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    test('resolves pollQRLogin as done immediately (before CM loggedOn fires)', async () => {
      // logOn() never triggers loggedOn — simulates a slow CM connection
      mockSteamUserInstance.logOn.mockImplementation(() => {
        // intentionally does nothing
      })

      mockSessionInstance.startWithQR.mockResolvedValue({
        qrChallengeUrl: 'steam://test',
        actionRequired: true
      })
      await SteamUser.startQRLogin()

      // Trigger authenticated — stores credentials and sets qrSessionState=done,
      // then fires background CM connect (which never resolves in this test)
      await sessionOnHandlers['authenticated']?.()

      // pollQRLogin must be 'done' immediately — not blocked on CM loggedOn
      const result = await SteamUser.pollQRLogin()
      expect(result.status).toBe('done')
      expect(result.username).toBeUndefined()
    })

    test('resolves with "Steam User" fallback when CM loggedOn never fires (15s timeout)', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })

      // logOn() never triggers loggedOn — CM hangs indefinitely
      mockSteamUserInstance.logOn.mockImplementation(() => {
        // intentionally does nothing
      })

      mockSessionInstance.startWithQR.mockResolvedValue({
        qrChallengeUrl: 'steam://test',
        actionRequired: true
      })
      await SteamUser.startQRLogin()

      // Kick off the background CM connect
      void sessionOnHandlers['authenticated']?.()
      // Flush so connectSteamUserClient starts and registers the timeout
      await Promise.resolve()
      await Promise.resolve()

      // Capture the configStore.set call count before the timeout resolves
      const setCallsBefore = mockConfigStore.set.mock.calls.length

      // Advance past the 15s guard — the timeout resolves the CM promise
      jest.advanceTimersByTime(15001)
      // Flush the resolved .then() that writes userData
      await Promise.resolve()
      await Promise.resolve()

      // userData should have been written via the background .then()
      const setCallsAfter = mockConfigStore.set.mock.calls.length
      expect(setCallsAfter).toBeGreaterThan(setCallsBefore)

      const userDataCall = mockConfigStore.set.mock.calls.find(
        ([key]) => key === 'userData'
      )
      expect(userDataCall).toBeDefined()
      expect(userDataCall![1]).toMatchObject({ username: 'Steam User' })
    })
  })

  // ── AUTH-02: Credential Login ──────────────────────────────────────────────

  describe('startCredentialLogin()', () => {
    test('returns { status: "guard_required" } when actionRequired is true', async () => {
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: true,
        validActions: [{ type: 2 }] // EmailCode = 2
      })

      const result = await SteamUser.startCredentialLogin(
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

      const result = await SteamUser.startCredentialLogin(
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
      const result = await SteamUser.startCredentialLogin(
        'testuser',
        'wrongpass'
      )
      expect(result.status).toBe('error')
    })

    test('never stores the password in configStore', async () => {
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: true
      })
      await SteamUser.startCredentialLogin('testuser', 'mysecretpassword')

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

      await SteamUser.startCredentialLogin('testuser', 'password123')

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

      await SteamUser.startCredentialLogin('testuser', 'password123')

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
      const result = await SteamUser.startCredentialLogin(
        'testuser',
        'password123'
      )
      expect(result.status).toBe('guard_required')

      // Simulate DeviceConfirmation phone approval: 'authenticated' fires on
      // the session BEFORE the user calls submitSteamGuardCode.
      expect(sessionOnHandlers['authenticated']).toBeDefined()
      await sessionOnHandlers['authenticated']()

      // finishAuth must have been called: token stored and isLoggedIn set
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)

      // pollCredentialLogin must reflect the done state so the frontend can
      // navigate away (out-of-band completion — no submitSteamGuardCode needed)
      const poll = await SteamUser.pollCredentialLogin()
      expect(poll.status).toBe('done')

      // submitSteamGuardCode was NOT called — this is the phone-approval path
      expect(mockSessionInstance.submitSteamGuardCode).not.toHaveBeenCalled()
    })
  })

  // ── AUTH-02: SteamGuard submit ─────────────────────────────────────────────

  describe('submitSteamGuardCode()', () => {
    beforeEach(async () => {
      // Start a credential session first so this.session is set
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: true
      })
      await SteamUser.startCredentialLogin('testuser', 'pass')
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

      const result = await SteamUser.submitSteamGuardCode('12345')
      expect(result.status).toBe('done')
    })

    test('returns { status: "error" } when code submission fails', async () => {
      mockSessionInstance.submitSteamGuardCode.mockRejectedValue(
        new Error('TwoFactorCodeMismatch')
      )
      const result = await SteamUser.submitSteamGuardCode('99999')
      expect(result.status).toBe('error')
    })

    test('returns { status: "error" } when no active session', async () => {
      // Call logout to clear the session — logout() sets this.session = null
      await SteamUser.logout()
      const result = await SteamUser.submitSteamGuardCode('12345')
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

      const result = await SteamUser.submitSteamGuardCode('KQM4F')
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

      await SteamUser.submitSteamGuardCode('kqm4f')
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

      await SteamUser.submitSteamGuardCode('  kqm4f  ')
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

      await SteamUser.submitSteamGuardCode('12345')
      expect(mockSessionInstance.submitSteamGuardCode).toHaveBeenCalledWith(
        '12345'
      )
    })
  })

  // ── QR race fix (260629-9ly): connectingPromise dedupe + username gating ─────

  describe('QR race fix (260629-9ly)', () => {
    beforeEach(async () => {
      mockSessionInstance.startWithQR.mockResolvedValue({
        qrChallengeUrl: 'steam://...qr_url_here',
        actionRequired: true
      })
      // logOn does NOT fire loggedOn immediately — simulates slow CM connection.
      // Each test resolves it manually to control timing.
      mockSteamUserInstance.logOn.mockImplementation(() => {
        // intentionally does nothing — loggedOn fires later in each test
      })
      await SteamUser.startQRLogin()
    })

    test('(a) username is undefined immediately after authenticated, then populated when CM loggedOn fires', async () => {
      // Fire authenticated — stores creds via the awaited TokenStore seam, sets
      // qrSessionState='done', and (with the fix) assigns this.connectingPromise.
      // The handler is async (getTokenStore().setToken() is awaited), so the
      // test must await it before asserting on qrSessionState/pollQRLogin.
      await sessionOnHandlers['authenticated']()

      // pollQRLogin must return 'done' with username undefined — the background
      // CM connect is still in-flight so the persona name has not arrived yet.
      const poll1 = await SteamUser.pollQRLogin()
      expect(poll1.status).toBe('done')
      expect(poll1.username).toBeUndefined()

      // Now resolve the CM connect by firing loggedOn (getPersonas returns 'TestUser')
      steamUserOnHandlers['loggedOn']?.({}, {})

      // Flush microtasks: getPersonas resolution → resolve('TestUser') → .then() sets qrSessionState.username
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      // pollQRLogin should now carry the real persona name
      const poll2 = await SteamUser.pollQRLogin()
      expect(poll2.status).toBe('done')
      expect(poll2.username).toBe('TestUser')

      // configStore.set('userData', ...) must have been called with the real name
      const userDataCall = mockConfigStore.set.mock.calls.find(
        ([key]) => key === 'userData'
      )
      expect(userDataCall).toBeDefined()
      expect(userDataCall![1]).toMatchObject({ username: 'TestUser' })
    })

    test('(b) concurrent ensureConnected dedupes on connectingPromise (no second client, no Steam User overwrite)', async () => {
      // Temporarily null steamID so ensureConnected cannot take the
      // early-return path `if (this.client?.steamID) return true`.
      // This mirrors real Steam client behavior: steamID is null until loggedOn fires.
      const origSteamID = mockSteamUserInstance.steamID
      mockSteamUserInstance.steamID = null as any

      // Fire authenticated — with the fix, this.connectingPromise is set once the
      // awaited TokenStore seam's setToken() resolves. The handler is async, so
      // await it before asserting on connectingPromise/qrSessionState below.
      await sessionOnHandlers['authenticated']()

      // Clear construction/call counts so we can assert "no new client" below.
      MockSteamUserLib.mockClear()
      mockSteamUserInstance.logOn.mockClear()
      mockSteamUserInstance.logOff.mockClear()

      // Stub isLoggedIn + refreshToken for ensureConnected's credential lookup.
      // TOKEN_STORE_KEY = 'refreshToken' (constants.ts). Legacy plaintext path
      // is used here so decryptToken returns the value directly.
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'isLoggedIn') return true
        if (key === 'refreshToken') return 'stored-plaintext-token'
        return undefined
      })

      // Call ensureConnected while the QR connect is still in-flight.
      // With the fix it sees this.connectingPromise non-null and awaits it —
      // it does NOT call connectSteamUserClient again (no second client, no logOff).
      // Assertion via logOn call count: dedupe guarantees a single logOn total;
      // we cleared counts after authenticated, so 0 logOn calls from ensureConnected.
      const connectResultPromise = SteamUser.ensureConnected()

      // Restore steamID so the loggedOn handler and ensureConnected's final
      // Boolean(this.client?.steamID) check both see a connected client.
      mockSteamUserInstance.steamID = origSteamID

      // Resolve the CM connect by firing loggedOn — getPersonas returns 'TestUser'.
      steamUserOnHandlers['loggedOn']?.({}, {})

      // Await ensureConnected; this drains all pending microtasks from the
      // loggedOn handler + .then() + .finally() chain before returning.
      const result = await connectResultPromise

      // ── Dedupe assertions ─────────────────────────────────────────────────
      // logOn was NOT called by ensureConnected (counts cleared after authenticated).
      // A single logOn was made during QR auth; ensureConnected reused that promise.
      expect(mockSteamUserInstance.logOn).not.toHaveBeenCalled()

      // No second SteamUserLib client was constructed.
      expect(MockSteamUserLib).not.toHaveBeenCalled()

      // No logOff on the existing client (no second connectSteamUserClient attempted).
      expect(mockSteamUserInstance.logOff).not.toHaveBeenCalled()

      // ensureConnected resolved to true (client is now connected).
      expect(result).toBe(true)

      // ── No 'Steam User' overwrite assertion ───────────────────────────────
      // userData was written with the real persona name, not the fallback.
      const userDataCall = mockConfigStore.set.mock.calls.find(
        ([key]) => key === 'userData'
      )
      expect(userDataCall).toBeDefined()
      expect(userDataCall![1]).toMatchObject({ username: 'TestUser' })

      // Note: frontend SteamLogin poll-handler gating (poll.username truthy check)
      // is a React component — not feasible to unit-test in this backend Jest harness.
      // Covered by manual re-audit per plan 260629-9ly task 3 constraint.
    })
  })

  // ── logout with connected client ───────────────────────────────────────────

  describe('logout() with active steam-user client', () => {
    test('calls logOff() on the steam-user client when connected', async () => {
      // First login via QR to get a client
      mockSessionInstance.startWithQR.mockResolvedValue({
        qrChallengeUrl: 'steam://test',
        actionRequired: true
      })
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })

      await SteamUser.startQRLogin()
      await sessionOnHandlers['authenticated']?.()

      // Now logout
      await SteamUser.logout()
      expect(mockSteamUserInstance.logOff).toHaveBeenCalled()
      expect(mockConfigStore.delete).toHaveBeenCalledWith('refreshToken')
      expect(mockConfigStore.delete).toHaveBeenCalledWith('isLoggedIn')
      expect(mockConfigStore.delete).toHaveBeenCalledWith('userData')
    })
  })

  // ── LIB-01: reconnect on startup ───────────────────────────────────────────

  describe('ensureConnected()', () => {
    beforeEach(async () => {
      // Reset the in-memory client to null so we exercise the reconnect path
      await SteamUser.logout()
    })

    test('returns false when not logged in', async () => {
      mockConfigStore.get_nodefault.mockReturnValue(undefined) // isLoggedIn false
      const result = await SteamUser.ensureConnected()
      expect(result).toBe(false)
      expect(mockSteamUserInstance.logOn).not.toHaveBeenCalled()
    })

    test('returns false when logged in but no stored refresh token', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'isLoggedIn' ? true : undefined
      )
      const result = await SteamUser.ensureConnected()
      expect(result).toBe(false)
      expect(mockSteamUserInstance.logOn).not.toHaveBeenCalled()
    })

    test('reconnects with the stored refresh token and returns true when CM logs on', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'isLoggedIn') return true
        if (key === 'refreshToken') return 'stored-plaintext-token'
        return undefined
      })
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })

      const result = await SteamUser.ensureConnected()

      expect(mockSteamUserInstance.logOn).toHaveBeenCalledWith({
        refreshToken: 'stored-plaintext-token'
      })
      expect(result).toBe(true)
    })

    test('does not reconnect when a live client is already connected', async () => {
      // Establish a connected client via QR login
      mockSessionInstance.startWithQR.mockResolvedValue({
        qrChallengeUrl: 'steam://test',
        actionRequired: true
      })
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })
      await SteamUser.startQRLogin()
      await sessionOnHandlers['authenticated']?.()
      await new Promise((r) => process.nextTick(r)) // let background CM connect settle
      mockSteamUserInstance.logOn.mockClear()

      const result = await SteamUser.ensureConnected()
      expect(result).toBe(true)
      expect(mockSteamUserInstance.logOn).not.toHaveBeenCalled()
    })
  })

  // ── quick-260814-r2d: unreadable read is not logged-out ────────────────────
  //
  // Installs a fake TokenStore through the real setTokenStore() seam, matching
  // production's adapter exactly: readToken() resolves the outcome under test,
  // getToken() resolves '' (the lossy adapter's collapse for both absent and
  // unreadable). setTokenStore() mutates module-global state, so every test in
  // this describe restores the default ElectronTokenStore in afterEach --
  // leaving the fake installed would make the OTHER describe blocks in this
  // file (which assume the real ElectronTokenStore routed through
  // mockConfigStore) order-dependent on whichever test ran last.
  describe('ensureConnected() — unreadable read is not logged-out (quick-260814-r2d)', () => {
    afterEach(() => {
      setTokenStore(new ElectronTokenStore())
    })

    function installFakeStore(outcome: {
      status: 'present' | 'absent' | 'unreadable'
      token?: string
      reason?: 'timeout' | 'unavailable'
    }): TokenStore {
      const fake: TokenStore = {
        isAvailable: jest.fn().mockResolvedValue(true),
        // Matches production's adapter exactly: getToken() collapses both
        // absent AND unreadable to '', only present resolves the token.
        getToken: jest
          .fn()
          .mockResolvedValue(outcome.status === 'present' ? outcome.token : ''),
        setToken: jest.fn().mockResolvedValue(undefined),
        clearToken: jest.fn().mockResolvedValue(undefined),
        readToken: jest
          .fn()
          .mockResolvedValue(
            outcome.status === 'present'
              ? { status: 'present', token: outcome.token }
              : outcome.status === 'absent'
                ? { status: 'absent' }
                : { status: 'unreadable', reason: outcome.reason }
          )
      }
      setTokenStore(fake)
      return fake
    }

    test('does NOT log "no stored refresh token" on an unreadable read, and DOES log a distinct retryable warning naming the reason', async () => {
      await SteamUser.logout()
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'isLoggedIn' ? true : undefined
      )
      installFakeStore({ status: 'unreadable', reason: 'timeout' })

      const result = await SteamUser.ensureConnected()

      expect(result).toBe(false)
      const warningLines = (logWarning as jest.Mock).mock.calls.map((c) =>
        String(c[0])
      )
      expect(
        warningLines.some((l) => l.includes('no stored refresh token'))
      ).toBe(false)
      expect(
        warningLines.some((l) => /retry/i.test(l) && /timeout/.test(l))
      ).toBe(true)
    })

    test('an unreadable read calls neither clearToken() on the store nor configStore.delete for isLoggedIn/userData — the session survives', async () => {
      await SteamUser.logout()
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'isLoggedIn' ? true : undefined
      )
      mockConfigStore.delete.mockClear()
      const fake = installFakeStore({
        status: 'unreadable',
        reason: 'unavailable'
      })

      await SteamUser.ensureConnected()

      expect(fake.clearToken).not.toHaveBeenCalled()
      expect(mockConfigStore.delete).not.toHaveBeenCalledWith('isLoggedIn')
      expect(mockConfigStore.delete).not.toHaveBeenCalledWith('userData')
    })

    // Regression guard: the absent branch is unchanged -- still the original
    // warning, still returns false. Already true pre-fix.
    test('the absent branch still logs the original "no stored refresh token" warning and returns false', async () => {
      await SteamUser.logout()
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'isLoggedIn' ? true : undefined
      )
      installFakeStore({ status: 'absent' })

      const result = await SteamUser.ensureConnected()

      expect(result).toBe(false)
      const warningLines = (logWarning as jest.Mock).mock.calls.map((c) =>
        String(c[0])
      )
      expect(
        warningLines.some((l) => l.includes('no stored refresh token'))
      ).toBe(true)
    })

    // Regression guard: the present branch is unchanged -- still reaches the
    // connect path with the token. Already true pre-fix.
    test('the present branch still reaches the connect path with the token', async () => {
      await SteamUser.logout()
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'isLoggedIn' ? true : undefined
      )
      installFakeStore({ status: 'present', token: 'fake-outcome-token' })
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })

      const result = await SteamUser.ensureConnected()

      expect(mockSteamUserInstance.logOn).toHaveBeenCalledWith({
        refreshToken: 'fake-outcome-token'
      })
      expect(result).toBe(true)
    })

    // Regression guard: getCredentials()'s signature and mapping are
    // unchanged -- present maps to { refreshToken }, both absent and
    // unreadable map to undefined. Already true pre-fix.
    test('getCredentials() still maps present to { refreshToken } and both absent/unreadable to undefined', async () => {
      installFakeStore({ status: 'present', token: 'present-token' })
      await expect(SteamUser.getCredentials()).resolves.toEqual({
        refreshToken: 'present-token'
      })

      installFakeStore({ status: 'absent' })
      await expect(SteamUser.getCredentials()).resolves.toBeUndefined()

      installFakeStore({ status: 'unreadable', reason: 'timeout' })
      await expect(SteamUser.getCredentials()).resolves.toBeUndefined()
    })
  })

  // ── D-02 (Phase 33-02): ensureConnected canary + relog revalidation ────────
  //
  // Establishes a connected client (steamID truthy) via QR login — matching
  // the "does not reconnect..." setup above — then drives the
  // getProductInfo/relog()/once('loggedOn'|'error') seams to exercise the
  // four behaviors from the plan: healthy short-circuit, stale-canary
  // self-heal via relog, bounded (never-hangs) grace timeout, and error
  // during relog.

  describe('ensureConnected() — canary + relog revalidation (D-02)', () => {
    beforeEach(async () => {
      // Reset to a clean, connected client before each test in this block.
      await SteamUser.logout()
      mockSessionInstance.startWithQR.mockResolvedValue({
        qrChallengeUrl: 'steam://test',
        actionRequired: true
      })
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })
      await SteamUser.startQRLogin()
      await sessionOnHandlers['authenticated']?.()
      await new Promise((r) => process.nextTick(r)) // let background CM connect settle
      mockSteamUserInstance.logOn.mockClear()
    })

    test('Test 1 — healthy fast path preserved: canary resolves within bound -> returns true without calling relog()', async () => {
      mockSteamUserInstance.getProductInfo.mockResolvedValue({ apps: {} })

      const result = await SteamUser.ensureConnected()

      expect(result).toBe(true)
      expect(mockSteamUserInstance.getProductInfo).toHaveBeenCalledWith(
        [753],
        [],
        true
      )
      expect(mockSteamUserInstance.relog).not.toHaveBeenCalled()
    })

    test('Test 2 — stale socket self-heals: canary rejects -> relog() called -> loggedOn within grace -> returns true', async () => {
      mockSteamUserInstance.getProductInfo.mockRejectedValue(
        new Error('canary timeout')
      )
      mockSteamUserInstance.relog.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })

      const result = await SteamUser.ensureConnected()

      expect(mockSteamUserInstance.relog).toHaveBeenCalledTimes(1)
      expect(result).toBe(true)
    })

    test('Test 3 — bounded, never hangs: canary rejects, relog() called, neither loggedOn nor error fires within grace -> returns false', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
      try {
        mockSteamUserInstance.getProductInfo.mockRejectedValue(
          new Error('canary timeout')
        )
        mockSteamUserInstance.relog.mockImplementation(() => {
          // intentionally never fires 'loggedOn' or 'error' — simulates a
          // relog attempt that never settles within the grace window.
        })

        const resultPromise = SteamUser.ensureConnected()
        // Flush the canary rejection's microtasks so relog() has been
        // called and the grace-window setTimeout has been scheduled.
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()

        expect(mockSteamUserInstance.relog).toHaveBeenCalledTimes(1)

        jest.advanceTimersByTime(20001)
        const result = await resultPromise

        expect(result).toBe(false)
      } finally {
        jest.useRealTimers()
      }
    })

    test('Test 4 — error during relog: canary rejects, relog() called, error fires -> returns false', async () => {
      mockSteamUserInstance.getProductInfo.mockRejectedValue(
        new Error('canary timeout')
      )
      mockSteamUserInstance.relog.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['error']?.(new Error('relog failed'))
        })
      })

      const result = await SteamUser.ensureConnected()

      expect(result).toBe(false)
    })

    test('relog() throws synchronously -> falls through to the cold-connect path instead of crashing', async () => {
      mockSteamUserInstance.getProductInfo.mockRejectedValue(
        new Error('canary timeout')
      )
      mockSteamUserInstance.relog.mockImplementation(() => {
        throw new Error('Cannot relog if not already connected')
      })
      // Cold-connect path needs isLoggedIn + a stored refresh token.
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'isLoggedIn') return true
        if (key === 'refreshToken') return 'stored-plaintext-token'
        return undefined
      })
      mockSteamUserInstance.logOn.mockImplementation(() => {
        process.nextTick(() => {
          steamUserOnHandlers['loggedOn']?.({}, {})
        })
      })

      const result = await SteamUser.ensureConnected()
      expect(result).toBe(true)
    })
  })

  // ── REQ-26-02/04/05/06: redeemKey() ────────────────────────────────────────

  describe('redeemKey()', () => {
    let ensureConnectedSpy: jest.SpyInstance
    let getClientSpy: jest.SpyInstance

    beforeEach(() => {
      // Isolate redeemKey()'s own logic from the connection-establishment
      // flow already covered by the ensureConnected()/startQRLogin() describe
      // blocks above — spy the two seams redeemKey() consults so each test
      // exercises only the resolve/reject classification behavior.
      ensureConnectedSpy = jest
        .spyOn(SteamUser, 'ensureConnected')
        .mockResolvedValue(true)
      getClientSpy = jest
        .spyOn(SteamUser, 'getClient')
        .mockReturnValue(mockSteamUserInstance as any)
    })

    afterEach(() => {
      ensureConnectedSpy.mockRestore()
      getClientSpy.mockRestore()
    })

    test('OK (0): resolves and classifies as success, carries store + packageList', async () => {
      mockSteamUserInstance.redeemKey.mockResolvedValue({
        purchaseResultDetails: 0,
        packageList: { '123': 'Some Game' }
      })

      const result = await SteamUser.redeemKey('steam', 'TEST-KEY-VALUE')

      expect(result).toEqual({
        store: 'steam',
        outcome: 'success',
        packageList: { '123': 'Some Game' }
      })
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

        const result = await SteamUser.redeemKey('steam', 'TEST-KEY-VALUE')

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

      const result = await SteamUser.redeemKey('steam', 'TEST-KEY-VALUE')

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

      const result = await SteamUser.redeemKey('steam', 'TEST-KEY-VALUE')

      expect(result.store).toBe('steam')
      expect(result.outcome).toBe('error')
    })

    test('not connected (ensureConnected false): returns outcome "error" and never calls client.redeemKey', async () => {
      ensureConnectedSpy.mockResolvedValue(false)

      const result = await SteamUser.redeemKey('steam', 'TEST-KEY-VALUE')

      expect(result).toEqual({
        store: 'steam',
        outcome: 'error',
        message: 'not-connected'
      })
      expect(mockSteamUserInstance.redeemKey).not.toHaveBeenCalled()
    })

    test('not connected (null client): returns outcome "error" and never calls client.redeemKey', async () => {
      getClientSpy.mockReturnValue(null)

      const result = await SteamUser.redeemKey('steam', 'TEST-KEY-VALUE')

      expect(result.outcome).toBe('error')
      expect(mockSteamUserInstance.redeemKey).not.toHaveBeenCalled()
    })

    test('never logs the raw key value', async () => {
      const secretKey = 'SUPER-SECRET-KEY-VALUE-12345'
      mockSteamUserInstance.redeemKey.mockResolvedValue({
        purchaseResultDetails: 0,
        packageList: {}
      })

      await SteamUser.redeemKey('steam', secretKey)

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
})
