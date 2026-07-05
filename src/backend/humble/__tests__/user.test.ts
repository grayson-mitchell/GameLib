/**
 * Unit tests for HumbleUser static class.
 * Covers HACCT-01 (login/encryption), HACCT-02 (health check/reconnect),
 * HACCT-03 (disconnect), and the Pitfall 4/5 secrecy + degraded-encryption
 * requirements (T-10-04/T-10-05).
 *
 * Login is now a main-process WATCH over the shared `persist:humble`
 * partition (D-05/D-17) rather than a BrowserWindow — tests drive the watch
 * via `HumbleUser.notifyLoginNavigated()` (the D-17 forced-revalidation
 * relay, analogous to the retired did-navigate handler) and
 * `HumbleUser.stopLogin()` (the D-06 silent-cancel relay, analogous to the
 * retired window 'closed' handler).
 *
 * Mock boundaries:
 *  - electron       → safeStorage, session.fromPartition
 *  - backend/logger  → logInfo/logError/logWarning
 *  - backend/ipc     → sendFrontendMessage
 *  - ../electronStores → configStore
 *  - ../adapter      → getAccountIdentity, getGamekeys
 */

// ── Electron mock (must be first, jest.mock is hoisted) ──────────────────────
const mockEncryptString = jest.fn((s: string) => Buffer.from(s))
const mockDecryptString = jest.fn((b: Buffer) => b.toString())
const mockIsEncryptionAvailable = jest.fn(() => true)

// Typical Electron default UA shape: platform + Chrome version + the
// Electron-/app-identifying tokens standardBrowserUserAgent() must strip.
const mockUserAgentFallback =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) GameLib/1.0.0 Chrome/142.0.7444.52 Electron/41.1.1 Safari/537.36'

const mockCookiesGet = jest.fn()
const mockSetUserAgent = jest.fn()
const mockClearStorageData = jest.fn()
const mockClearCache = jest.fn()
const mockClearAuthCache = jest.fn()
const mockClearHostResolverCache = jest.fn()
const mockClearData = jest.fn()
const mockSessionInstance = {
  cookies: { get: mockCookiesGet },
  setUserAgent: mockSetUserAgent,
  clearStorageData: mockClearStorageData,
  clearCache: mockClearCache,
  clearAuthCache: mockClearAuthCache,
  clearHostResolverCache: mockClearHostResolverCache,
  clearData: mockClearData
}
const mockFromPartition = jest.fn(() => mockSessionInstance)

jest.mock('electron', () => ({
  app: { userAgentFallback: mockUserAgentFallback },
  safeStorage: {
    isEncryptionAvailable: mockIsEncryptionAvailable,
    encryptString: mockEncryptString,
    decryptString: mockDecryptString
  },
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
import { HumbleUser, standardBrowserUserAgent } from '../user'

const flushAsync = async () => new Promise((r) => setImmediate(r))

// ─────────────────────────────────────────────────────────────────────────────
describe('HumbleUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // ── Re-establish mock implementations (resetMocks: true clears them) ────

    mockIsEncryptionAvailable.mockReturnValue(true)
    mockEncryptString.mockImplementation((s: string) => Buffer.from(s))
    mockDecryptString.mockImplementation((b: Buffer) => b.toString())

    mockConfigStore.get_nodefault.mockReturnValue(undefined)
    mockConfigStore.set.mockImplementation(() => {})
    mockConfigStore.clear.mockImplementation(() => {})

    mockFromPartition.mockImplementation(() => mockSessionInstance)
    mockCookiesGet.mockResolvedValue([])

    mockGetGamekeys.mockResolvedValue({ status: 'ok', data: [] })
    mockGetAccountIdentity.mockResolvedValue({
      status: 'ok',
      data: { username: 'tester' }
    })
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

  // ── HACCT-01: startLogin() — D-06 silent cancel via stopLogin() ──────────

  describe('startLogin() — D-06 silent cancel', () => {
    test('stopLogin() resolves { status: "waiting" } and stays disconnected when no cookie was ever accepted', async () => {
      mockCookiesGet.mockResolvedValue([])

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.stopLogin()
      const result = await loginPromise

      expect(result).toEqual({ status: 'waiting' })
      expect(mockConfigStore.set).not.toHaveBeenCalled()
    })

    test('does not throw and does not log an error for a plain cancel', async () => {
      const loginPromise = HumbleUser.startLogin()
      HumbleUser.stopLogin()

      await expect(loginPromise).resolves.toEqual({ status: 'waiting' })
      expect(mockLogError).not.toHaveBeenCalled()
    })

    test('stopLogin() is a no-op when no watch is active', () => {
      expect(() => HumbleUser.stopLogin()).not.toThrow()
    })
  })

  // ── HACCT-01: startLogin() — cookie capture + encryption (D-16 gamekeys) ─

  describe('startLogin() — cookie capture + encryption', () => {
    test('accepts on gamekeys "ok", encrypts the cookie, and stores it under HUMBLE_TOKEN_STORE_KEY with the HUMBLE_TOKEN_PREFIX (not raw plaintext) when encryption is available', async () => {
      mockIsEncryptionAvailable.mockReturnValue(true)
      mockCookiesGet.mockResolvedValue([{ value: 'raw-cookie-value' }])

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      const result = await loginPromise

      expect(result.status).toBe('done')
      expect(result.username).toBe('tester')

      // Login completion must be gated on the gamekeys endpoint (D-16), not
      // identity.
      expect(mockGetGamekeys).toHaveBeenCalledWith('raw-cookie-value')
      expect(mockGetAccountIdentity).toHaveBeenCalledWith('raw-cookie-value')

      const sessionCookieCall = mockConfigStore.set.mock.calls.find(
        ([key]) => key === 'sessionCookie'
      )
      expect(sessionCookieCall).toBeDefined()
      expect(sessionCookieCall![1]).toMatch(/^humble:v1:/)
      expect(sessionCookieCall![1]).not.toBe('raw-cookie-value')
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
      expect(mockConfigStore.set).toHaveBeenCalledWith('expired', false)
      expect(mockConfigStore.set).toHaveBeenCalledWith('userData', {
        username: 'tester'
      })
    })
  })

  // ── D-16: gamekeys 'ok' but identity fails/throws — best-effort (D-02) ──

  describe('startLogin() — best-effort identity after gamekeys acceptance (D-02/D-16)', () => {
    test('gamekeys "ok" but getAccountIdentity resolves non-ok: login still resolves done with no username and NO userData written', async () => {
      mockCookiesGet.mockResolvedValue([{ value: 'raw-cookie-value' }])
      mockGetAccountIdentity.mockResolvedValue({ status: 'schema_error' })

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      const result = await loginPromise

      expect(result).toEqual({ status: 'done', username: undefined })
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
      expect(mockConfigStore.set).not.toHaveBeenCalledWith(
        'userData',
        expect.anything()
      )
    })

    test('gamekeys "ok" but getAccountIdentity throws: login still resolves done with no username and NO userData written', async () => {
      mockCookiesGet.mockResolvedValue([{ value: 'raw-cookie-value' }])
      mockGetAccountIdentity.mockRejectedValue(new Error('network down'))

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      const result = await loginPromise

      expect(result).toEqual({ status: 'done', username: undefined })
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
      expect(mockConfigStore.set).not.toHaveBeenCalledWith(
        'userData',
        expect.anything()
      )
    })
  })

  // ── HACCT-01: standard-Chrome UA reinforcement on the partition session ──
  // Google SSO restricts embedded browsers detected via Electron/app UA
  // tokens (forcing uncompletable passkey prompts or disallowed_useragent).

  describe('standardBrowserUserAgent()', () => {
    test('derives a plain Chrome UA from the runtime fallback: platform + Chrome version kept, Electron/app tokens stripped', () => {
      const ua = standardBrowserUserAgent()
      expect(ua).toBe(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.52 Safari/537.36'
      )
      expect(ua).not.toContain('Electron')
      expect(ua).not.toContain('GameLib')
    })

    test('the persist:humble partition session receives the standard UA when the watch starts', async () => {
      const loginPromise = HumbleUser.startLogin()

      expect(mockFromPartition).toHaveBeenCalledWith('persist:humble')
      expect(mockSetUserAgent).toHaveBeenCalledWith(standardBrowserUserAgent())

      HumbleUser.stopLogin()
      await loginPromise
    })
  })

  // ── HACCT-01: startLogin() — anonymous-cookie validation ─────────────────
  // Humble sets `_simpleauth_sess` for ANONYMOUS visitors too: the login
  // page's first navigation already carries one. An unvalidated cookie must
  // never be treated as a successful login (UAT failure 2026-07-05: the login
  // window closed after ~1s having stored an anonymous cookie).

  describe('startLogin() — anonymous-cookie validation (HACCT-01/D-16)', () => {
    test('anonymous cookie on first forced revalidation does NOT complete login: nothing stored, watch stays active', async () => {
      mockCookiesGet.mockResolvedValue([{ value: 'anon-cookie-value' }])
      mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()

      // Gamekeys validation ran, but NOTHING was stored — the user still
      // needs to complete the real login.
      expect(mockGetGamekeys).toHaveBeenCalledWith('anon-cookie-value')
      expect(mockConfigStore.set).not.toHaveBeenCalled()

      // User gives up → still the D-06 silent-cancel path.
      HumbleUser.stopLogin()
      await expect(loginPromise).resolves.toEqual({ status: 'waiting' })
    })

    test('REGRESSION: the SAME cookie value rejected once is re-validated on a later forced revalidation and login completes (anonymous → authenticated with an UNCHANGED value)', async () => {
      // Humble may keep the identical _simpleauth_sess value across the
      // anonymous → authenticated transition. A permanent value-blacklist
      // made the login window never close (UAT failure 2026-07-05 #3).
      mockCookiesGet.mockResolvedValue([{ value: 'same-cookie-value' }])
      mockGetGamekeys.mockResolvedValueOnce({ status: 'session_expired' })

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()
      expect(mockConfigStore.set).not.toHaveBeenCalled()

      // User completes the real login; the SSO redirect back to
      // humblebundle.com fires did-navigate → relayed via
      // notifyLoginNavigated(). Same cookie VALUE, but the server-side
      // session is now authenticated.
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: [] })
      HumbleUser.notifyLoginNavigated()
      const result = await loginPromise

      expect(result.status).toBe('done')
      expect(result.username).toBe('tester')
      expect(mockGetGamekeys).toHaveBeenCalledTimes(2)
      expect(mockGetGamekeys).toHaveBeenLastCalledWith('same-cookie-value')
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
    })

    test('poll ticks within the throttle window do NOT re-validate an unchanged rejected value; a later tick outside the window does', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
      try {
        mockCookiesGet.mockResolvedValue([{ value: 'anon-cookie-value' }])
        mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

        const loginPromise = HumbleUser.startLogin()

        // Forced validation via navigation relay → rejected, throttle
        // starts.
        HumbleUser.notifyLoginNavigated()
        await flushAsync()
        expect(mockGetGamekeys).toHaveBeenCalledTimes(1)

        // Poll tick at t=1500ms: same value, inside the 3000ms throttle.
        jest.advanceTimersByTime(1500)
        await flushAsync()
        expect(mockGetGamekeys).toHaveBeenCalledTimes(1)

        // Poll tick at t=3000ms: outside the throttle window → re-validated.
        jest.advanceTimersByTime(1500)
        await flushAsync()
        expect(mockGetGamekeys).toHaveBeenCalledTimes(2)

        HumbleUser.stopLogin()
        await loginPromise
      } finally {
        jest.useRealTimers()
      }
    })

    test('overlapping checks are deduped while a validation is in flight', async () => {
      mockCookiesGet.mockResolvedValue([{ value: 'cookie-value' }])
      let resolveGamekeys!: (v: unknown) => void
      mockGetGamekeys.mockImplementation(
        async () => new Promise((r) => (resolveGamekeys = r))
      )

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()

      // Second check bailed on the in-flight flag — one validation only.
      expect(mockGetGamekeys).toHaveBeenCalledTimes(1)

      resolveGamekeys({ status: 'ok', data: [] })
      const result = await loginPromise
      expect(result.status).toBe('done')
      expect(mockGetGamekeys).toHaveBeenCalledTimes(1)
    })

    test('a CHANGED cookie value (anonymous → authenticated) is re-checked and completes login when gamekeys is ok', async () => {
      // First tick: anonymous value, rejected.
      mockCookiesGet.mockResolvedValue([{ value: 'anon-cookie-value' }])
      mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()
      expect(mockConfigStore.set).not.toHaveBeenCalledWith('isLoggedIn', true)

      // User logs in for real: cookie VALUE changes, gamekeys now validates.
      mockCookiesGet.mockResolvedValue([{ value: 'authed-cookie-value' }])
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: [] })

      HumbleUser.notifyLoginNavigated()
      const result = await loginPromise

      expect(result.status).toBe('done')
      expect(result.username).toBe('tester')
      expect(mockGetGamekeys).toHaveBeenCalledTimes(2)
      expect(mockGetGamekeys).toHaveBeenLastCalledWith('authed-cookie-value')
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
    })

    test('a thrown gamekeys validation error is transient: nothing stored, same value retried on the next check', async () => {
      mockCookiesGet.mockResolvedValue([{ value: 'cookie-value-x' }])
      mockGetGamekeys.mockRejectedValueOnce(new Error('network down'))

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()

      expect(mockConfigStore.set).not.toHaveBeenCalled()

      // Retry with the SAME value succeeds (not permanently blacklisted).
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: [] })
      HumbleUser.notifyLoginNavigated()
      const result = await loginPromise

      expect(result.status).toBe('done')
      expect(mockGetGamekeys).toHaveBeenCalledTimes(2)
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
    })
  })

  // ── Pitfall 5 / success criterion 5: degraded-encryption signal ──────────

  describe('startLogin() — degraded encryption (Pitfall 5 / success criterion 5)', () => {
    test('when encryption is unavailable, records a user-visible encryptionDegraded flag AND calls logWarning, then still stores the session', async () => {
      mockIsEncryptionAvailable.mockReturnValue(false)
      mockCookiesGet.mockResolvedValue([{ value: 'raw-cookie-value' }])

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
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
    test('watches the persist:humble partition WITHOUT clearing it', async () => {
      mockCookiesGet.mockResolvedValue([])

      const reconnectPromise = HumbleUser.reconnect()
      HumbleUser.stopLogin()
      await reconnectPromise

      expect(mockFromPartition).toHaveBeenCalledWith('persist:humble')
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

      expect(mockFromPartition).toHaveBeenCalledWith('persist:humble')
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
      HumbleUser.notifyLoginNavigated()
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
