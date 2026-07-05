/**
 * Unit tests for HumbleUser static class.
 * Covers HACCT-01 (login/encryption), HACCT-02 (health check/reconnect),
 * HACCT-03 (disconnect), and the Pitfall 4/5 secrecy + degraded-encryption
 * requirements (T-10-04/T-10-05).
 *
 * Mock boundaries:
 *  - electron       → safeStorage, BrowserWindow, session.fromPartition
 *  - backend/logger  → logInfo/logError/logWarning
 *  - backend/ipc     → sendFrontendMessage
 *  - ../electronStores → configStore
 *  - ../adapter      → getAccountIdentity, getGamekeys
 */

// ── Electron mock (must be first, jest.mock is hoisted) ──────────────────────
const mockEncryptString = jest.fn((s: string) => Buffer.from(s))
const mockDecryptString = jest.fn((b: Buffer) => b.toString())
const mockIsEncryptionAvailable = jest.fn(() => true)

let windowHandlers: Record<string, (...args: any[]) => any> = {}
let webContentsHandlers: Record<string, (...args: any[]) => any> = {}

const mockWindowClose = jest.fn()
const mockWindowLoadURL = jest.fn()
const mockWindowInstance = {
  loadURL: mockWindowLoadURL,
  close: mockWindowClose,
  webContents: {
    on: jest.fn((event: string, cb: (...args: any[]) => any) => {
      webContentsHandlers[event] = cb
    })
  },
  on: jest.fn((event: string, cb: (...args: any[]) => any) => {
    windowHandlers[event] = cb
  })
}
const MockBrowserWindow = jest.fn(() => mockWindowInstance)

const mockCookiesGet = jest.fn()
const mockClearStorageData = jest.fn()
const mockClearCache = jest.fn()
const mockClearAuthCache = jest.fn()
const mockClearHostResolverCache = jest.fn()
const mockClearData = jest.fn()
const mockSessionInstance = {
  cookies: { get: mockCookiesGet },
  clearStorageData: mockClearStorageData,
  clearCache: mockClearCache,
  clearAuthCache: mockClearAuthCache,
  clearHostResolverCache: mockClearHostResolverCache,
  clearData: mockClearData
}
const mockFromPartition = jest.fn(() => mockSessionInstance)

jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: mockIsEncryptionAvailable,
    encryptString: mockEncryptString,
    decryptString: mockDecryptString
  },
  BrowserWindow: MockBrowserWindow,
  session: { fromPartition: mockFromPartition }
}))

// ── Logger mock (factory to prevent transitive module load failures) ────────
const mockLogInfo = jest.fn()
const mockLogError = jest.fn()
const mockLogWarning = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: { Backend: 'Backend' }
}))

// ── backend/ipc mock (sendFrontendMessage for humbleAuthState pushes) ───────
const mockSendFrontendMessage = jest.fn()
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: (...args: unknown[]) => mockSendFrontendMessage(...args)
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

// ── adapter mock ───────────────────────────────────────────────────────────
const mockGetAccountIdentity = jest.fn()
const mockGetGamekeys = jest.fn()
jest.mock('../adapter', () => ({
  getAccountIdentity: (...args: unknown[]) => mockGetAccountIdentity(...args),
  getGamekeys: (...args: unknown[]) => mockGetGamekeys(...args)
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { HumbleUser } from '../user'

// ─────────────────────────────────────────────────────────────────────────────
describe('HumbleUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    windowHandlers = {}
    webContentsHandlers = {}

    // ── Re-establish mock implementations (resetMocks: true clears them) ────

    mockIsEncryptionAvailable.mockReturnValue(true)
    mockEncryptString.mockImplementation((s: string) => Buffer.from(s))
    mockDecryptString.mockImplementation((b: Buffer) => b.toString())

    mockConfigStore.get_nodefault.mockReturnValue(undefined)
    mockConfigStore.set.mockImplementation(() => {})
    mockConfigStore.clear.mockImplementation(() => {})

    MockBrowserWindow.mockImplementation(() => mockWindowInstance)
    mockWindowInstance.on.mockImplementation(
      (event: string, cb: (...args: any[]) => any) => {
        windowHandlers[event] = cb
      }
    )
    mockWindowInstance.webContents.on.mockImplementation(
      (event: string, cb: (...args: any[]) => any) => {
        webContentsHandlers[event] = cb
      }
    )

    mockFromPartition.mockImplementation(() => mockSessionInstance)
    mockCookiesGet.mockResolvedValue([])

    mockGetAccountIdentity.mockResolvedValue({
      status: 'ok',
      data: { username: 'tester' }
    })
    mockGetGamekeys.mockResolvedValue({ status: 'ok', data: [] })
  })

  // ── isLoggedIn / getUserDetails ───────────────────────────────────────────

  describe('isLoggedIn()', () => {
    test('returns false when configStore has no isLoggedIn', () => {
      mockConfigStore.get_nodefault.mockReturnValue(undefined)
      expect(HumbleUser.isLoggedIn()).toBe(false)
    })

    test('returns true when isLoggedIn is true in store', () => {
      mockConfigStore.get_nodefault.mockReturnValue(true)
      expect(HumbleUser.isLoggedIn()).toBe(true)
    })
  })

  describe('getUserDetails()', () => {
    test('returns stored userData', () => {
      const userData = { username: 'TestUser' }
      mockConfigStore.get_nodefault.mockReturnValue(userData)
      expect(HumbleUser.getUserDetails()).toEqual(userData)
    })
  })

  // ── HACCT-01: startLogin() — D-06 silent cancel ──────────────────────────

  describe('startLogin() — D-06 silent cancel', () => {
    test('resolves { status: "waiting" } and stays disconnected when the window closes before any cookie appears', async () => {
      mockCookiesGet.mockResolvedValue([])

      const loginPromise = HumbleUser.startLogin()
      windowHandlers['closed']()
      const result = await loginPromise

      expect(result.status).toBe('waiting')
      expect(mockConfigStore.set).not.toHaveBeenCalledWith('isLoggedIn', true)
    })

    test('does not throw and does not log an error for a plain cancel', async () => {
      const loginPromise = HumbleUser.startLogin()
      windowHandlers['closed']()

      await expect(loginPromise).resolves.toEqual({ status: 'waiting' })
      expect(mockLogError).not.toHaveBeenCalled()
    })
  })

  // ── HACCT-01: startLogin() — cookie capture + encryption ─────────────────

  describe('startLogin() — cookie capture + encryption', () => {
    test('captures a cookie, encrypts it, and stores it under HUMBLE_TOKEN_STORE_KEY with the HUMBLE_TOKEN_PREFIX (not raw plaintext) when encryption is available', async () => {
      mockIsEncryptionAvailable.mockReturnValue(true)
      mockCookiesGet.mockResolvedValue([{ value: 'raw-cookie-value' }])

      const loginPromise = HumbleUser.startLogin()
      await webContentsHandlers['did-navigate']()
      const result = await loginPromise

      expect(result.status).toBe('done')
      expect(result.username).toBe('tester')

      const sessionCookieCall = mockConfigStore.set.mock.calls.find(
        ([key]) => key === 'sessionCookie'
      )
      expect(sessionCookieCall).toBeDefined()
      expect(sessionCookieCall![1]).toMatch(/^humble:v1:/)
      expect(sessionCookieCall![1]).not.toBe('raw-cookie-value')
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
      expect(mockWindowClose).toHaveBeenCalled()
    })
  })

  // ── Pitfall 5 / success criterion 5: degraded-encryption signal ──────────

  describe('startLogin() — degraded encryption (Pitfall 5 / success criterion 5)', () => {
    test('when encryption is unavailable, records a user-visible encryptionDegraded flag AND calls logWarning, then still stores the session', async () => {
      mockIsEncryptionAvailable.mockReturnValue(false)
      mockCookiesGet.mockResolvedValue([{ value: 'raw-cookie-value' }])

      const loginPromise = HumbleUser.startLogin()
      await webContentsHandlers['did-navigate']()
      await loginPromise

      expect(mockConfigStore.set).toHaveBeenCalledWith(
        'encryptionDegraded',
        true
      )
      expect(mockLogWarning).toHaveBeenCalled()
    })
  })

  // ── HACCT-02: checkHealthAndFlagExpiry() — D-08 401 vs 403 ───────────────

  describe('checkHealthAndFlagExpiry()', () => {
    test('marks expired and pushes humbleAuthState when the adapter returns session_expired (401)', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'sessionCookie') {
          return 'humble:v1:' + Buffer.from('cookie').toString('base64')
        }
        if (key === 'userData') return { username: 'tester' }
        return undefined
      })
      mockDecryptString.mockReturnValue('cookie')
      mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

      await HumbleUser.checkHealthAndFlagExpiry()

      expect(mockConfigStore.set).toHaveBeenCalledWith('expired', true)
      expect(mockSendFrontendMessage).toHaveBeenCalledWith(
        'humbleAuthState',
        expect.objectContaining({
          isLoggedIn: true,
          username: 'tester',
          expired: true
        })
      )
    })

    test('does NOT mark expired on access_denied (403) — C5 backoff, not a re-login trigger', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'sessionCookie') {
          return 'humble:v1:' + Buffer.from('cookie').toString('base64')
        }
        return undefined
      })
      mockDecryptString.mockReturnValue('cookie')
      mockGetGamekeys.mockResolvedValue({ status: 'access_denied' })

      await HumbleUser.checkHealthAndFlagExpiry()

      expect(mockConfigStore.set).not.toHaveBeenCalledWith('expired', true)
      expect(mockSendFrontendMessage).not.toHaveBeenCalled()
    })

    test('does nothing (no adapter call) when there is no stored session cookie', async () => {
      mockConfigStore.get_nodefault.mockReturnValue(undefined)
      await HumbleUser.checkHealthAndFlagExpiry()
      expect(mockGetGamekeys).not.toHaveBeenCalled()
    })
  })

  // ── HACCT-02: reconnect() — D-11 partition kept ──────────────────────────

  describe('reconnect() — D-11 partition kept', () => {
    test('reopens the login window against the humble-login partition WITHOUT clearing it', async () => {
      mockCookiesGet.mockResolvedValue([])

      const reconnectPromise = HumbleUser.reconnect()
      windowHandlers['closed']()
      await reconnectPromise

      expect(mockFromPartition).toHaveBeenCalledWith('humble-login')
      expect(mockClearStorageData).not.toHaveBeenCalled()
      expect(mockClearCache).not.toHaveBeenCalled()
      expect(mockClearAuthCache).not.toHaveBeenCalled()
      expect(mockClearHostResolverCache).not.toHaveBeenCalled()
      expect(mockClearData).not.toHaveBeenCalled()
    })
  })

  // ── HACCT-03: disconnect() — D-07 full partition wipe ────────────────────

  describe('disconnect() — D-07 full partition wipe', () => {
    test('clears all five partition caches and clears configStore', async () => {
      await HumbleUser.disconnect()

      expect(mockFromPartition).toHaveBeenCalledWith('humble-login')
      expect(mockClearStorageData).toHaveBeenCalled()
      expect(mockClearCache).toHaveBeenCalled()
      expect(mockClearAuthCache).toHaveBeenCalled()
      expect(mockClearHostResolverCache).toHaveBeenCalled()
      expect(mockClearData).toHaveBeenCalled()
      expect(mockConfigStore.clear).toHaveBeenCalled()
    })
  })

  // ── Pitfall 4: cookie is never logged or stored in the clear ─────────────

  describe('cookie secrecy (Pitfall 4)', () => {
    test('no logger call and no configStore.set call ever receives the raw cookie value', async () => {
      const SECRET = 'super-secret-cookie-value-xyz'
      mockCookiesGet.mockResolvedValue([{ value: SECRET }])

      const loginPromise = HumbleUser.startLogin()
      await webContentsHandlers['did-navigate']()
      await loginPromise

      const loggerCalls = [
        ...mockLogInfo.mock.calls,
        ...mockLogError.mock.calls,
        ...mockLogWarning.mock.calls
      ]
      for (const call of loggerCalls) {
        expect(JSON.stringify(call)).not.toContain(SECRET)
      }

      for (const [, value] of mockConfigStore.set.mock.calls) {
        expect(JSON.stringify(value)).not.toContain(SECRET)
      }

      for (const call of mockSendFrontendMessage.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SECRET)
      }
    })
  })
})
