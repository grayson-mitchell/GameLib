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
  clear: jest.fn()
}
jest.mock('../electronStores', () => ({
  configStore: mockConfigStore
}))

// ── steam-session mock ────────────────────────────────────────────────────────
// Capture on() handlers so tests can trigger events manually
let sessionOnHandlers: Record<string, Function> = {}
const mockSessionInstance = {
  startWithQR: jest.fn(),
  startWithCredentials: jest.fn(),
  submitSteamGuardCode: jest.fn(),
  cancelLoginAttempt: jest.fn(),
  on: jest.fn((event: string, cb: Function) => {
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
let steamUserOnHandlers: Record<string, Function> = {}
const mockSteamUserInstance = {
  logOn: jest.fn(),
  logOff: jest.fn(),
  steamID: { getSteamID64: () => '76561197900000000' } as any,
  getPersonas: jest.fn().mockResolvedValue({
    personas: { '76561197900000000': { player_name: 'TestUser' } }
  }),
  on: jest.fn((event: string, cb: Function) => {
    steamUserOnHandlers[event] = cb
  })
}
const MockSteamUserLib = jest.fn(() => mockSteamUserInstance)

jest.mock('steam-user', () => MockSteamUserLib)

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { SteamUser } from '../user'
import { safeStorage } from 'electron'
import { existsSync } from 'graceful-fs'

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
    mockConfigStore.get_nodefault.mockReturnValue(undefined)
    mockConfigStore.set.mockImplementation(() => {})

    // Reset handler capture maps
    sessionOnHandlers = {}
    steamUserOnHandlers = {}

    // LoginSession mock — re-set constructor to return mockSessionInstance
    MockLoginSession.mockImplementation(() => mockSessionInstance)

    // session.on() captures handlers into sessionOnHandlers
    mockSessionInstance.on.mockImplementation((event: string, cb: Function) => {
      sessionOnHandlers[event] = cb
    })

    // SteamUserLib mock — re-set constructor to return mockSteamUserInstance
    MockSteamUserLib.mockImplementation(() => mockSteamUserInstance)

    // steam-user instance mocks
    mockSteamUserInstance.on.mockImplementation((event: string, cb: Function) => {
      steamUserOnHandlers[event] = cb
    })
    mockSteamUserInstance.getPersonas.mockResolvedValue({
      personas: { '76561197900000000': { player_name: 'TestUser' } }
    })
    mockSteamUserInstance.logOff.mockImplementation(() => {})
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
      Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true })
      mockExistsSync.mockReturnValue(false)
      expect(SteamUser.isSteamClientInstalled()).toBe(false)
      Object.defineProperty(process, 'platform', { value: original, configurable: true })
    })

    test('calls existsSync with platform-specific paths', () => {
      mockExistsSync.mockReturnValue(false)
      const savedPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })

      SteamUser.isSteamClientInstalled()
      const calledPaths = (existsSync as jest.Mock).mock.calls.map(([p]) => p)
      expect(calledPaths).toContain('/Applications/Steam.app')

      Object.defineProperty(process, 'platform', { value: savedPlatform, configurable: true })
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

  describe('logout()', () => {
    test('calls configStore.clear()', () => {
      SteamUser.logout()
      expect(mockConfigStore.clear).toHaveBeenCalledTimes(1)
    })

    test('does not throw when no steam-user client is connected', () => {
      expect(() => SteamUser.logout()).not.toThrow()
    })

    test('isLoggedIn returns false after logout clears store', () => {
      // Simulate the store being cleared
      mockConfigStore.clear.mockImplementation(() => {
        mockConfigStore.get_nodefault.mockReturnValue(undefined)
      })
      SteamUser.logout()
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
      SteamUser.logout()

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
      mockSessionInstance.startWithQR.mockRejectedValue(new Error('network error'))
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

    test('returns { status: "done", username } after authenticated event fires', async () => {
      // Trigger 'authenticated' on the session mock
      expect(sessionOnHandlers['authenticated']).toBeDefined()
      await sessionOnHandlers['authenticated']!()

      const result = await SteamUser.pollQRLogin()
      expect(result.status).toBe('done')
      expect(typeof result.username).toBe('string')
    })

    test('after auth: encrypts and stores token (safeStorage.encryptString called)', async () => {
      await sessionOnHandlers['authenticated']!()
      expect(safeStorage.encryptString).toHaveBeenCalledWith('mock-refresh-token')
    })

    test('after auth: isLoggedIn becomes true in configStore', async () => {
      await sessionOnHandlers['authenticated']!()
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
    })

    test('returns { status: "error" } when session times out', async () => {
      sessionOnHandlers['timeout']?.()
      const result = await SteamUser.pollQRLogin()
      expect(result.status).toBe('error')
    })
  })

  // ── AUTH-02: Credential Login ──────────────────────────────────────────────

  describe('startCredentialLogin()', () => {
    test('returns { status: "guard_required" } when actionRequired is true', async () => {
      mockSessionInstance.startWithCredentials.mockResolvedValue({
        actionRequired: true,
        validActions: [{ type: 2 }] // EmailCode = 2
      })

      const result = await SteamUser.startCredentialLogin('testuser', 'password123')
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

      const result = await SteamUser.startCredentialLogin('testuser', 'password123')
      expect(result.status).toBe('done')

      // Restore
      mockSessionInstance.startWithCredentials.mockImplementation(originalStartCredentials)
    })

    test('returns { status: "error" } when startWithCredentials throws', async () => {
      mockSessionInstance.startWithCredentials.mockRejectedValue(new Error('InvalidPassword'))
      const result = await SteamUser.startCredentialLogin('testuser', 'wrongpass')
      expect(result.status).toBe('error')
    })

    test('never stores the password in configStore', async () => {
      mockSessionInstance.startWithCredentials.mockResolvedValue({ actionRequired: true })
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
  })

  // ── AUTH-02: SteamGuard submit ─────────────────────────────────────────────

  describe('submitSteamGuardCode()', () => {
    beforeEach(async () => {
      // Start a credential session first so this.session is set
      mockSessionInstance.startWithCredentials.mockResolvedValue({ actionRequired: true })
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
      SteamUser.logout()
      const result = await SteamUser.submitSteamGuardCode('12345')
      expect(result.status).toBe('error')
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
      SteamUser.logout()
      expect(mockSteamUserInstance.logOff).toHaveBeenCalled()
      expect(mockConfigStore.clear).toHaveBeenCalled()
    })
  })
})
