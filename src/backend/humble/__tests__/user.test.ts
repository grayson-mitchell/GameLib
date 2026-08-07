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
  clear: jest.fn(),
  // Phase 34.4.1 gap-cycle plan 13 (F-1 closure): the real (unmocked)
  // ElectronHumbleSecretStore.clearSecrets() calls configStore.delete() twice
  // -- disconnect() now invokes it via getHumbleSecretStore(), which this
  // file does NOT mock (it exercises the real secretStore.ts module against
  // this same electronStores mock, matching the rest of this file's
  // convention).
  delete: jest.fn()
}
// Phase 11 (HSYNC-02/D-04/D-30): disconnect() must clear these two but never
// humbleRevealedStore (Pitfall 1 — a disconnect must not regress a
// previously-revealed key back to UNREVEALED).
const mockHumbleLibraryStore = { clear: jest.fn() }
const mockHumbleSyncStore = { clear: jest.fn() }
const mockHumbleRevealedStore = { clear: jest.fn() }
jest.mock('../electronStores', () => ({
  configStore: mockConfigStore,
  humbleLibraryStore: mockHumbleLibraryStore,
  humbleSyncStore: mockHumbleSyncStore,
  humbleRevealedStore: mockHumbleRevealedStore
}))

// ── adapter mock ───────────────────────────────────────────────────────────
const mockGetAccountIdentity = jest.fn()
const mockGetGamekeys = jest.fn()
jest.mock('../adapter', () => ({
  getAccountIdentity: (...args: unknown[]) => mockGetAccountIdentity(...args),
  getGamekeys: (...args: unknown[]) => mockGetGamekeys(...args)
}))

// ── syncFence mock (CR-01: disconnect must fence the in-flight sync) ───────
const mockInvalidateSyncGeneration = jest.fn()
jest.mock('../syncFence', () => ({
  currentSyncGeneration: () => 0,
  invalidateSyncGeneration: (...args: unknown[]) =>
    mockInvalidateSyncGeneration(...args)
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import {
  HumbleUser,
  standardBrowserUserAgent,
  LOGIN_WATCH_TIMEOUT_MS,
  VALIDATION_THROTTLE_MS,
  COOKIE_POLL_INTERVAL_MS
} from '../user'
import {
  setLoginWindowSeam,
  type LoginWindowSeam
} from '../loginWindowSeam'
import { HUMBLE_BASE_URL, HUMBLE_LOGIN_URL } from '../constants'

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
    mockHumbleLibraryStore.clear.mockImplementation(() => {})
    mockHumbleSyncStore.clear.mockImplementation(() => {})
    mockHumbleRevealedStore.clear.mockImplementation(() => {})

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

    test('WR-03: stopLogin() DURING an in-flight validation prevents ALL store writes even when the validation then succeeds (D-06 cancel race)', async () => {
      mockCookiesGet.mockResolvedValue([{ value: 'raw-cookie-value' }])
      let resolveGamekeys!: (v: unknown) => void
      mockGetGamekeys.mockImplementation(
        async () => new Promise((r) => (resolveGamekeys = r))
      )

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()
      expect(mockGetGamekeys).toHaveBeenCalledTimes(1)

      // User cancels while getGamekeys is still pending...
      HumbleUser.stopLogin()
      await expect(loginPromise).resolves.toEqual({ status: 'waiting' })

      // ...and the in-flight validation then succeeds. NOTHING may be
      // stored — the D-06 contract is 'silent cancel, no store writes'.
      resolveGamekeys({ status: 'ok', data: [] })
      await flushAsync()

      expect(mockConfigStore.set).not.toHaveBeenCalled()
      expect(mockGetAccountIdentity).not.toHaveBeenCalled()
    })

    // Phase 11 WR-03: the only external teardown is the renderer's
    // humbleStopLogin — which never fires across window.location.reload() or
    // a renderer crash, previously orphaning the watch into an INDEFINITE
    // cookie poll + Humble validation loop (C5).
    test('WR-03 (Phase 11): the watch deadline settles { status: "waiting" } with no store writes when the login never completes', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      try {
        mockCookiesGet.mockResolvedValue([])

        const loginPromise = HumbleUser.startLogin()
        jest.advanceTimersByTime(LOGIN_WATCH_TIMEOUT_MS)

        await expect(loginPromise).resolves.toEqual({ status: 'waiting' })
        expect(mockConfigStore.set).not.toHaveBeenCalled()

        // The watch is fully torn down — no further poll ticks fire.
        mockCookiesGet.mockClear()
        jest.advanceTimersByTime(60_000)
        expect(mockCookiesGet).not.toHaveBeenCalled()
      } finally {
        jest.useRealTimers()
      }
    })

    test('WR-03 (Phase 11): notifyLoginNavigated() re-arms the deadline so an actively-navigating user is never cut off', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      try {
        mockCookiesGet.mockResolvedValue([])

        const loginPromise = HumbleUser.startLogin()

        // Just before the deadline, the user navigates (SSO redirect etc.).
        jest.advanceTimersByTime(LOGIN_WATCH_TIMEOUT_MS - 1000)
        HumbleUser.notifyLoginNavigated()

        // The original deadline instant passes without settling…
        jest.advanceTimersByTime(2000)
        let settled = false
        void loginPromise.then(() => {
          settled = true
        })
        await flushAsync()
        expect(settled).toBe(false)

        // …and the RE-ARMED deadline settles the watch later.
        jest.advanceTimersByTime(LOGIN_WATCH_TIMEOUT_MS)
        await expect(loginPromise).resolves.toEqual({ status: 'waiting' })
      } finally {
        jest.useRealTimers()
      }
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

    test('WR-06: a successful login pushes the authoritative humbleAuthState so the renderer converges even if the login route already unmounted', async () => {
      mockCookiesGet.mockResolvedValue([{ value: 'raw-cookie-value' }])

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      await loginPromise

      expect(mockSendFrontendMessage).toHaveBeenCalledWith('humbleAuthState', {
        isLoggedIn: true,
        username: 'tester',
        expired: false
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

  // ── F-2 fix: state-change rejection logging (Phase 34.4.1 Plan 18) ───────

  describe('startLogin() — rejection-log collapse (F-2, Phase 34.4.1 Plan 18)', () => {
    test('N consecutive identical-status rejections produce ONE warning, not N', async () => {
      mockCookiesGet.mockResolvedValue([{ value: 'anon-cookie-value' }])
      mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()

      expect(mockGetGamekeys).toHaveBeenCalledTimes(3)
      const rejectionLines = mockLogWarning.mock.calls.filter((c) =>
        String(c[0]).includes('rejected candidate session')
      )
      expect(rejectionLines.length).toBe(1)
      expect(String(rejectionLines[0][0])).not.toContain('status changed')

      HumbleUser.stopLogin()
      await loginPromise
    })

    test('a status CHANGE logs again, reporting the suppressed count from the PREVIOUS status', async () => {
      mockCookiesGet.mockResolvedValue([{ value: 'anon-cookie-value' }])
      mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

      const loginPromise = HumbleUser.startLogin()
      // Three identical rejections under 'session_expired' — one logged,
      // two suppressed.
      HumbleUser.notifyLoginNavigated()
      await flushAsync()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()

      // Status changes to 'access_denied' — must log again, never be
      // silently absorbed into the prior suppression count.
      mockGetGamekeys.mockResolvedValue({ status: 'access_denied' })
      HumbleUser.notifyLoginNavigated()
      await flushAsync()

      const rejectionLines = mockLogWarning.mock.calls.filter((c) =>
        String(c[0]).includes('rejected candidate session')
      )
      expect(rejectionLines.length).toBe(2)
      expect(String(rejectionLines[0][0])).not.toContain('status changed')
      expect(String(rejectionLines[1][0])).toContain('status changed')
      expect(String(rejectionLines[1][0])).toContain(
        '2 prior identical rejection(s) suppressed'
      )
      expect(rejectionLines[1][0][1]).toBe('access_denied')

      HumbleUser.stopLogin()
      await loginPromise
    })

    test('a long wait under the SAME status still produces periodic liveness evidence instead of total silence', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
      try {
        mockCookiesGet.mockResolvedValue([{ value: 'still-anon-value' }])
        mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

        const loginPromise = HumbleUser.startLogin()
        HumbleUser.notifyLoginNavigated()
        await flushAsync()

        // Advance well past the liveness heartbeat interval (30s) while the
        // SAME value keeps being rejected with the SAME status — poll ticks
        // re-validate at each throttle-window boundary.
        for (let i = 0; i < 24; i++) {
          jest.advanceTimersByTime(1500)
          await flushAsync()
        }

        const heartbeats = mockLogWarning.mock.calls.filter((c) =>
          String(c[0]).includes('still waiting')
        )
        expect(heartbeats.length).toBeGreaterThan(0)

        HumbleUser.stopLogin()
        await loginPromise
      } finally {
        jest.useRealTimers()
      }
    })

    test('acceptance is unaffected — a subsequent "ok" validation still completes login normally after prior suppressed rejections', async () => {
      mockCookiesGet.mockResolvedValue([{ value: 'anon-cookie-value' }])
      mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()
      HumbleUser.notifyLoginNavigated()
      await flushAsync()

      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: [] })
      HumbleUser.notifyLoginNavigated()
      const result = await loginPromise

      expect(result.status).toBe('done')
      expect(mockConfigStore.set).toHaveBeenCalledWith('isLoggedIn', true)
    })

    test('the forced-revalidation path still bypasses the throttle even with the collapsed logging', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
      try {
        mockCookiesGet.mockResolvedValue([{ value: 'anon-cookie-value' }])
        mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

        const loginPromise = HumbleUser.startLogin()
        HumbleUser.notifyLoginNavigated()
        await flushAsync()
        expect(mockGetGamekeys).toHaveBeenCalledTimes(1)

        // Well INSIDE the 3000ms throttle window — a forced revalidation
        // must still re-check (D-17), unlike an ordinary poll tick.
        jest.advanceTimersByTime(500)
        HumbleUser.notifyLoginNavigated()
        await flushAsync()
        expect(mockGetGamekeys).toHaveBeenCalledTimes(2)

        HumbleUser.stopLogin()
        await loginPromise
      } finally {
        jest.useRealTimers()
      }
    })

    test('pins the login-watch timing constants — a logging fix must never alter timing under cover', () => {
      expect(LOGIN_WATCH_TIMEOUT_MS).toBe(10 * 60_000)
      expect(VALIDATION_THROTTLE_MS).toBe(3000)
      expect(COOKIE_POLL_INTERVAL_MS).toBe(1500)
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

    test('WR-07: a later login with encryption available clears the sticky encryptionDegraded flag', async () => {
      mockIsEncryptionAvailable.mockReturnValue(true)
      mockCookiesGet.mockResolvedValue([{ value: 'raw-cookie-value' }])

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      await loginPromise

      expect(mockConfigStore.set).toHaveBeenCalledWith(
        'encryptionDegraded',
        false
      )
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

    test('WR-01: a thrown adapter error (offline start) resolves without state change instead of rejecting', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'sessionCookie') {
          return 'humble:v1:' + Buffer.from('cookie').toString('base64')
        }
        return undefined
      })
      mockDecryptString.mockReturnValue('secret-health-cookie-xyz')
      mockGetGamekeys.mockRejectedValue(new Error('ECONNREFUSED'))

      // Must NOT reject — health is unknown, not expired.
      await expect(HumbleUser.checkHealthAndFlagExpiry()).resolves.toBeUndefined()

      expect(mockConfigStore.set).not.toHaveBeenCalled()
      expect(mockSendFrontendMessage).not.toHaveBeenCalled()
      // Redaction: the warning must never carry the cookie value.
      for (const call of mockLogWarning.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('secret-health-cookie-xyz')
      }
    })

    // Debug session humble-reveal-key-fails: csrf_cookie was previously only
    // ever captured inside finishLogin() — an account already connected
    // before that capture code existed would permanently have no csrfToken.
    // checkHealthAndFlagExpiry() now backfills it opportunistically on a
    // confirmed-healthy ('ok') session.
    test('backfills a missing csrfToken from the partition when the session is healthy (ok)', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'sessionCookie') {
          return 'humble:v1:' + Buffer.from('cookie').toString('base64')
        }
        // csrfToken never seen — models a pre-Phase-14 account.
        return undefined
      })
      mockDecryptString.mockReturnValue('cookie')
      mockGetGamekeys.mockResolvedValue({ status: 'ok' })
      mockCookiesGet.mockImplementation(
        async (opts: { name: string; url: string }) => {
          if (opts.name === 'csrf_cookie') {
            return [{ value: 'backfilled-csrf-value' }]
          }
          return []
        }
      )

      await HumbleUser.checkHealthAndFlagExpiry()

      const csrfCall = mockConfigStore.set.mock.calls.find(
        ([key]) => key === 'csrfToken'
      )
      expect(csrfCall).toBeDefined()
      expect(csrfCall![1]).toMatch(/^humble:v1:/)
      expect(csrfCall![1]).not.toBe('backfilled-csrf-value')

      // Redaction: the raw token value must never reach a log call.
      for (const call of [...mockLogWarning.mock.calls, ...mockLogInfo.mock.calls]) {
        expect(JSON.stringify(call)).not.toContain('backfilled-csrf-value')
      }
    })

    test('does NOT re-fetch/overwrite csrfToken when one is already cached', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'sessionCookie') {
          return 'humble:v1:' + Buffer.from('cookie').toString('base64')
        }
        if (key === 'csrfToken') {
          return 'humble:v1:' + Buffer.from('already-cached').toString('base64')
        }
        return undefined
      })
      mockDecryptString.mockReturnValue('cookie')
      mockGetGamekeys.mockResolvedValue({ status: 'ok' })

      await HumbleUser.checkHealthAndFlagExpiry()

      const csrfCookieCalls = mockCookiesGet.mock.calls.filter(
        ([opts]) => opts?.name === 'csrf_cookie'
      )
      expect(csrfCookieCalls).toHaveLength(0)
      expect(mockConfigStore.set).not.toHaveBeenCalledWith(
        'csrfToken',
        expect.anything()
      )
    })

    test('backfill is non-fatal when the partition has no csrf_cookie or the read throws', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) => {
        if (key === 'sessionCookie') {
          return 'humble:v1:' + Buffer.from('cookie').toString('base64')
        }
        return undefined
      })
      mockDecryptString.mockReturnValue('cookie')
      mockGetGamekeys.mockResolvedValue({ status: 'ok' })
      mockCookiesGet.mockRejectedValue(new Error('partition unavailable'))

      await expect(
        HumbleUser.checkHealthAndFlagExpiry()
      ).resolves.toBeUndefined()
      expect(mockConfigStore.set).not.toHaveBeenCalledWith(
        'csrfToken',
        expect.anything()
      )
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

    test('WR-02: credential store is cleared FIRST, and a rejected partition-clear step neither aborts the remaining steps nor rejects disconnect()', async () => {
      const callOrder: string[] = []
      mockConfigStore.clear.mockImplementation(() => {
        callOrder.push('configStore.clear')
      })
      mockClearStorageData.mockImplementation(async () => {
        callOrder.push('clearStorageData')
        throw new Error('session API failure')
      })
      mockClearCache.mockImplementation(async () => {
        callOrder.push('clearCache')
      })

      await expect(HumbleUser.disconnect()).resolves.toBeUndefined()

      // Credential wipe cannot be skipped: it runs before any partition step.
      expect(callOrder[0]).toBe('configStore.clear')
      // The failed step did not abort the rest of the wipe.
      expect(mockClearCache).toHaveBeenCalled()
      expect(mockClearAuthCache).toHaveBeenCalled()
      expect(mockClearHostResolverCache).toHaveBeenCalled()
      expect(mockClearData).toHaveBeenCalled()
      // Partial failure is logged, not thrown.
      expect(mockLogWarning).toHaveBeenCalled()
    })

    test('HSYNC-02/D-04/D-30: clears humbleLibraryStore + humbleSyncStore but NEVER humbleRevealedStore', async () => {
      await HumbleUser.disconnect()

      expect(mockHumbleLibraryStore.clear).toHaveBeenCalled()
      expect(mockHumbleSyncStore.clear).toHaveBeenCalled()
      expect(mockHumbleRevealedStore.clear).not.toHaveBeenCalled()
    })

    test('CR-01: bumps the sync-generation fence BEFORE any store wipe (an in-flight sync must never repopulate the wiped stores)', async () => {
      const callOrder: string[] = []
      mockInvalidateSyncGeneration.mockImplementation(() => {
        callOrder.push('invalidateSyncGeneration')
      })
      mockConfigStore.clear.mockImplementation(() => {
        callOrder.push('configStore.clear')
      })
      mockHumbleLibraryStore.clear.mockImplementation(() => {
        callOrder.push('humbleLibraryStore.clear')
      })
      mockHumbleSyncStore.clear.mockImplementation(() => {
        callOrder.push('humbleSyncStore.clear')
      })

      await HumbleUser.disconnect()

      expect(callOrder[0]).toBe('invalidateSyncGeneration')
      expect(callOrder).toEqual(
        expect.arrayContaining([
          'configStore.clear',
          'humbleLibraryStore.clear',
          'humbleSyncStore.clear'
        ])
      )
    })

    // ── Phase 34.4.1 gap-cycle plan 13 (F-1 BLOCKING closure) ────────────────
    // disconnect() now also clears the keyring-backed session/csrf secrets via
    // getHumbleSecretStore().clearSecrets() -- these tests exercise the REAL
    // (unmocked) secretStore.ts module against this file's own electronStores
    // mock, same convention the rest of this describe block already uses.

    test('F-1: disconnect() clears configStore BEFORE clearing the keyring-backed secrets', async () => {
      const callOrder: string[] = []
      mockConfigStore.clear.mockImplementation(() => {
        callOrder.push('configStore.clear')
      })
      mockConfigStore.delete.mockImplementation((key: string) => {
        callOrder.push(`configStore.delete:${key}`)
      })

      await HumbleUser.disconnect()

      expect(callOrder[0]).toBe('configStore.clear')
      expect(callOrder).toEqual(
        expect.arrayContaining([
          'configStore.delete:sessionCookie',
          'configStore.delete:csrfToken'
        ])
      )
    })

    test('F-1: a rejecting keyring/configStore secret clear does not throw out of disconnect() and is logged', async () => {
      mockConfigStore.delete.mockImplementation(() => {
        throw new Error('delete failed')
      })

      await expect(HumbleUser.disconnect()).resolves.toBeUndefined()
      expect(mockLogWarning).toHaveBeenCalled()
    })
  })

  // ── Phase 14 (T-14-04): csrf_cookie capture + getCsrfToken() ─────────────

  describe('csrf_cookie capture + getCsrfToken() (Phase 14)', () => {
    test('captures csrf_cookie at the same login moment as _simpleauth_sess, encrypted under a new csrfToken key', async () => {
      mockCookiesGet.mockImplementation(
        async (opts: { name: string; url: string }) => {
          if (opts.name === 'csrf_cookie') {
            return [{ value: 'raw-csrf-value' }]
          }
          return [{ value: 'raw-cookie-value' }]
        }
      )

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      const result = await loginPromise
      expect(result.status).toBe('done')

      const csrfCall = mockConfigStore.set.mock.calls.find(
        ([key]) => key === 'csrfToken'
      )
      expect(csrfCall).toBeDefined()
      expect(csrfCall![1]).toMatch(/^humble:v1:/)
      expect(csrfCall![1]).not.toBe('raw-csrf-value')

      // Round-trip through getCsrfToken(): configStore is mocked, so wire
      // get_nodefault to return exactly what was set() above.
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'csrfToken' ? csrfCall![1] : undefined
      )
      await expect(HumbleUser.getCsrfToken()).resolves.toBe('raw-csrf-value')
    })

    test('csrf_cookie absent at login: nothing stored, login still completes, getCsrfToken() returns undefined (no crash)', async () => {
      mockCookiesGet.mockImplementation(
        async (opts: { name: string; url: string }) => {
          if (opts.name === 'csrf_cookie') return []
          return [{ value: 'raw-cookie-value' }]
        }
      )

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      const result = await loginPromise
      expect(result.status).toBe('done')

      const csrfCall = mockConfigStore.set.mock.calls.find(
        ([key]) => key === 'csrfToken'
      )
      expect(csrfCall).toBeUndefined()

      // configStore never had a csrfToken written — get_nodefault's default
      // beforeEach() wiring (returns undefined) models this correctly.
      await expect(HumbleUser.getCsrfToken()).resolves.toBeUndefined()
    })

    test('getCsrfToken() returns undefined when configStore has never seen a csrfToken key at all', async () => {
      mockConfigStore.get_nodefault.mockReturnValue(undefined)
      expect(() => HumbleUser.getCsrfToken()).not.toThrow()
      await expect(HumbleUser.getCsrfToken()).resolves.toBeUndefined()
    })

    test('csrfToken lives on configStore and is wiped by disconnect() alongside the session cookie', async () => {
      await HumbleUser.disconnect()
      // csrfToken is not a separate CacheStore (Pitfall 1 exclusion list is
      // for humbleRevealedStore/humbleOwnershipOverrideStore/
      // humbleGiftedAtStore — none of which apply here) — it is a
      // session-scoped secret on configStore, which disconnect() already
      // clears wholesale.
      expect(mockConfigStore.clear).toHaveBeenCalled()
    })

    test('never logs the raw csrf cookie value', async () => {
      const CSRF_SECRET = 'super-secret-csrf-value-xyz'
      mockCookiesGet.mockImplementation(
        async (opts: { name: string; url: string }) => {
          if (opts.name === 'csrf_cookie') return [{ value: CSRF_SECRET }]
          return [{ value: 'raw-cookie-value' }]
        }
      )

      const loginPromise = HumbleUser.startLogin()
      HumbleUser.notifyLoginNavigated()
      await loginPromise

      const loggerCalls = [
        ...mockLogInfo.mock.calls,
        ...mockLogError.mock.calls,
        ...mockLogWarning.mock.calls
      ]
      for (const call of loggerCalls) {
        expect(JSON.stringify(call)).not.toContain(CSRF_SECRET)
      }
      for (const call of mockSendFrontendMessage.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(CSRF_SECRET)
      }
    })
  })

  // ── WR-03 (14-REVIEW): live csrf_cookie read at reveal time ──────────────
  // The stored csrfToken snapshot can go stale after a csrf_cookie rotation
  // while humblePostRequest attaches the LIVE partition jar natively — the
  // reveal path must therefore read the live cookie, with the stored
  // snapshot only as a fallback.

  describe('getLiveCsrfToken() (WR-03)', () => {
    test('returns the live partition csrf_cookie value when present (never the stored snapshot)', async () => {
      // A stale stored snapshot exists...
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'csrfToken' ? 'stale-stored-token' : undefined
      )
      // ...but the live partition carries a rotated value.
      mockCookiesGet.mockImplementation(
        async (opts: { name: string; url: string }) => {
          if (opts.name === 'csrf_cookie') {
            return [{ value: 'live-rotated-value' }]
          }
          return []
        }
      )

      await expect(HumbleUser.getLiveCsrfToken()).resolves.toBe(
        'live-rotated-value'
      )
    })

    test('falls back to the stored snapshot when the partition has no csrf_cookie', async () => {
      mockCookiesGet.mockResolvedValue([])
      // Stored snapshot round-trips through decryptCookie's plaintext
      // fallback (no humble:v1: prefix).
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'csrfToken' ? 'stored-snapshot-token' : undefined
      )

      await expect(HumbleUser.getLiveCsrfToken()).resolves.toBe(
        'stored-snapshot-token'
      )
    })

    test('falls back to the stored snapshot when the partition read throws (non-fatal)', async () => {
      mockCookiesGet.mockRejectedValue(new Error('partition gone'))
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'csrfToken' ? 'stored-snapshot-token' : undefined
      )

      await expect(HumbleUser.getLiveCsrfToken()).resolves.toBe(
        'stored-snapshot-token'
      )
      expect(mockLogWarning).toHaveBeenCalled()
    })

    test('returns undefined when neither a live cookie nor a stored snapshot exists', async () => {
      mockCookiesGet.mockResolvedValue([])
      mockConfigStore.get_nodefault.mockReturnValue(undefined)

      await expect(HumbleUser.getLiveCsrfToken()).resolves.toBeUndefined()
    })

    test('never logs the live csrf value — even on the throwing fallback path', async () => {
      const LIVE_SECRET = 'live-csrf-secret-abc'
      mockCookiesGet.mockImplementation(
        async (opts: { name: string; url: string }) => {
          if (opts.name === 'csrf_cookie') return [{ value: LIVE_SECRET }]
          return []
        }
      )

      await HumbleUser.getLiveCsrfToken()

      const loggerCalls = [
        ...mockLogInfo.mock.calls,
        ...mockLogError.mock.calls,
        ...mockLogWarning.mock.calls
      ]
      for (const call of loggerCalls) {
        expect(JSON.stringify(call)).not.toContain(LIVE_SECRET)
      }
    })
  })

  // ── Phase 34.4.1 Plan 03: login-window seam path ─────────────────────────
  // watchForLogin()/finishLogin()/getLiveCsrfToken() drive a Rust-owned login
  // window through LoginWindowSeam when one is installed (Tauri sidecar)
  // instead of session.fromPartition (Electron). A fake seam is installed
  // via setLoginWindowSeam() for this describe block only, and cleared in
  // afterEach so it can never leak into the Electron-path tests above/below.

  describe('login window seam path (Phase 34.4.1 Plan 03)', () => {
    const mockSeamOpen = jest.fn()
    const mockSeamCookies = jest.fn()
    const mockSeamTakeEvents = jest.fn()
    const mockSeamClose = jest.fn()
    const mockSeamClearCookies = jest.fn()
    // Phase 34.4.1 Plan 04 (D-07): LoginWindowSeam gained revealPost. This describe block
    // never exercises it (that path is covered by adapter.test.ts's seam-path describe) — the
    // mock exists purely so this fake object still satisfies the (now five-plus-one-method)
    // interface at compile time.
    const mockSeamRevealPost = jest.fn()
    // 34.4.1 gap cycle plan 15 (F-6): LoginWindowSeam gained clearStorage. Same reasoning as
    // mockSeamRevealPost above — this describe block never exercises it (plan 16 wires the real
    // call site), the mock exists purely so this fixture still satisfies the widened interface.
    const mockSeamClearStorage = jest.fn()
    // Phase 34.4.1 Plan 22 (F-6 Defect A): LoginWindowSeam gained cookiesForDomain. The
    // disconnect-census tests below (Plan 22 Task 3) drive this directly; every other test in
    // this describe block gets the same healthy default `mockSeamCookies` already gets.
    const mockSeamCookiesForDomain = jest.fn()

    const fakeSeam: LoginWindowSeam = {
      open: (...args: Parameters<LoginWindowSeam['open']>) =>
        mockSeamOpen(...args),
      cookies: (...args: Parameters<LoginWindowSeam['cookies']>) =>
        mockSeamCookies(...args),
      cookiesForDomain: (
        ...args: Parameters<LoginWindowSeam['cookiesForDomain']>
      ) => mockSeamCookiesForDomain(...args),
      takeEvents: (...args: Parameters<LoginWindowSeam['takeEvents']>) =>
        mockSeamTakeEvents(...args),
      close: (...args: Parameters<LoginWindowSeam['close']>) =>
        mockSeamClose(...args),
      clearCookies: (...args: Parameters<LoginWindowSeam['clearCookies']>) =>
        mockSeamClearCookies(...args),
      revealPost: (...args: Parameters<LoginWindowSeam['revealPost']>) =>
        mockSeamRevealPost(...args),
      clearStorage: (...args: Parameters<LoginWindowSeam['clearStorage']>) =>
        mockSeamClearStorage(...args)
    }

    beforeEach(() => {
      // resetMocks:true already cleared these (top-of-file convention) —
      // re-establish default implementations the same way the outer
      // beforeEach does for the Electron-path mocks.
      mockSeamOpen.mockResolvedValue('login-humble-0')
      mockSeamCookies.mockResolvedValue({ total: 0, matched: [] })
      mockSeamCookiesForDomain.mockResolvedValue({ total: 0, matched: [] })
      mockSeamTakeEvents.mockResolvedValue([])
      mockSeamClose.mockResolvedValue(true)
      mockSeamClearCookies.mockResolvedValue(0)
      // Phase 34.4.1 gap-cycle plan 16 (F-6): default a healthy, fully-numeric
      // report so tests that don't care about clearStorage's exact shape
      // still exercise a realistic resolved value rather than undefined.
      mockSeamClearStorage.mockResolvedValue({
        localStorage: 0,
        sessionStorage: 0,
        indexedDB: 0,
        caches: 0,
        serviceWorkers: 0
      })
      setLoginWindowSeam(fakeSeam)
    })

    afterEach(() => {
      setLoginWindowSeam(null)
    })

    test('opens the login window once with HUMBLE_LOGIN_URL, visible: true, and the standard Chrome UA', async () => {
      mockSeamCookies.mockResolvedValue({ total: 5, matched: [] })

      const loginPromise = HumbleUser.startLogin()
      await flushAsync()

      expect(mockSeamOpen).toHaveBeenCalledTimes(1)
      expect(mockSeamOpen).toHaveBeenCalledWith(HUMBLE_LOGIN_URL, {
        visible: true,
        userAgent: standardBrowserUserAgent()
      })

      HumbleUser.stopLogin()
      await loginPromise
    })

    test('UNDECIDABLE (a first read with total === 0) settles { status: "error" } and does NOT tick again', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      try {
        mockSeamCookies.mockResolvedValue({ total: 0, matched: [] })

        const loginPromise = HumbleUser.startLogin()
        await flushAsync() // seam.open() resolves, seamLabel gets set

        jest.advanceTimersByTime(1500)
        await flushAsync()

        await expect(loginPromise).resolves.toEqual({ status: 'error' })
        expect(mockLogWarning).toHaveBeenCalled()
        expect(mockGetGamekeys).not.toHaveBeenCalled()

        // The watch is fully torn down — no further poll ticks fire.
        mockSeamCookies.mockClear()
        jest.advanceTimersByTime(10_000)
        await flushAsync()
        expect(mockSeamCookies).not.toHaveBeenCalled()
      } finally {
        jest.useRealTimers()
      }
    })

    test('total > 0 with no matched _simpleauth_sess cookie keeps polling (liveness proven, still "not logged in yet"); a later matched value reaches finishLogin', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      try {
        mockSeamCookies.mockResolvedValue({ total: 5, matched: [] })

        const loginPromise = HumbleUser.startLogin()
        await flushAsync()

        jest.advanceTimersByTime(1500)
        await flushAsync()
        expect(mockGetGamekeys).not.toHaveBeenCalled()

        mockSeamCookies.mockResolvedValue({
          total: 6,
          matched: [
            {
              name: '_simpleauth_sess',
              domain: 'humblebundle.com',
              value: 'seam-cookie-value'
            }
          ]
        })
        jest.advanceTimersByTime(1500)
        await flushAsync()

        const result = await loginPromise
        expect(result.status).toBe('done')
        expect(mockGetGamekeys).toHaveBeenCalledWith('seam-cookie-value')
      } finally {
        jest.useRealTimers()
      }
    })

    test("a { event: 'finished' } nav event forces revalidation of the current candidate and re-arms the deadline", async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      try {
        // Liveness proven, but no matched candidate yet — cheap ticks (no
        // gamekeys call) while time is advanced toward the deadline.
        mockSeamCookies.mockResolvedValue({ total: 3, matched: [] })

        const loginPromise = HumbleUser.startLogin()
        await flushAsync()

        // Advance to a few poll ticks short of the ORIGINAL deadline —
        // deliberately NOT to the exact deadline instant, since both land on
        // multiples of the 1500ms poll interval up to LOGIN_WATCH_TIMEOUT_MS
        // (a 600000ms/1500ms boundary) and an exact-instant collision would
        // let the deadline settle the watch before the forced tick below
        // ever runs.
        jest.advanceTimersByTime(LOGIN_WATCH_TIMEOUT_MS - 4500)
        await flushAsync()
        expect(mockGetGamekeys).not.toHaveBeenCalled()

        // A 'finished' nav event arrives WITH a matched candidate cookie on
        // the next tick — re-arms the deadline and forces validation.
        mockSeamTakeEvents.mockResolvedValueOnce([
          { event: 'finished', url: 'https://www.humblebundle.com/' }
        ])
        mockSeamCookies.mockResolvedValueOnce({
          total: 3,
          matched: [
            {
              name: '_simpleauth_sess',
              domain: 'humblebundle.com',
              value: 'late-cookie-value'
            }
          ]
        })
        mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })

        jest.advanceTimersByTime(1500)
        await flushAsync()
        expect(mockGetGamekeys).toHaveBeenCalledWith('late-cookie-value')

        // The ORIGINAL deadline instant (3000ms further on from here) has
        // now passed without settling — proof the nav event re-armed it.
        let settled = false
        void loginPromise.then(() => {
          settled = true
        })
        jest.advanceTimersByTime(4000)
        await flushAsync()
        expect(settled).toBe(false)

        HumbleUser.stopLogin()
        await expect(loginPromise).resolves.toEqual({ status: 'waiting' })
      } finally {
        jest.useRealTimers()
      }
    })

    // F-34.4.2-19 fix: a { event: 'closed' } nav event -- pushed by main.rs's
    // WindowEvent::Destroyed handler whenever the Rust-owned login window is destroyed, for
    // ANY reason (user action, an OS-level teardown, or anything else) -- must settle the
    // watch immediately rather than being silently dropped (the pre-fix behavior: the poll
    // discovered the window's absence only one tick later, indirectly, via the NEXT
    // seam.cookies() call throwing a stringly-typed `humble_login:no-window:*` error).
    test("a { event: 'closed' } nav event settles { status: 'error' } immediately, without waiting for the next cookie-read tick", async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      try {
        // Liveness proven, no matched candidate yet -- an ordinary in-progress wait right up
        // until the window is destroyed out from under it.
        mockSeamCookies.mockResolvedValue({ total: 3, matched: [] })

        const loginPromise = HumbleUser.startLogin()
        await flushAsync()

        mockSeamTakeEvents.mockResolvedValueOnce([
          { event: 'closed', url: '' }
        ])
        jest.advanceTimersByTime(1500)
        await flushAsync()

        await expect(loginPromise).resolves.toEqual({ status: 'error' })
        // No cookie read was ever needed to reach this outcome -- the 'closed' event alone
        // was sufficient, proving this is the DIRECT signal, not the indirect no-window
        // inference from a cookies() call.
        expect(mockSeamCookies).not.toHaveBeenCalled()
        expect(mockLogWarning).toHaveBeenCalledWith(
          expect.stringContaining('closed before login completed'),
          expect.anything()
        )

        // The watch is fully torn down -- no further poll ticks fire.
        mockSeamTakeEvents.mockClear()
        jest.advanceTimersByTime(10_000)
        await flushAsync()
        expect(mockSeamTakeEvents).not.toHaveBeenCalled()
      } finally {
        jest.useRealTimers()
      }
    })

    test('close(label) is called exactly once when the watch settles via a completed (done) login', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      try {
        mockSeamCookies.mockResolvedValue({
          total: 3,
          matched: [
            {
              name: '_simpleauth_sess',
              domain: 'humblebundle.com',
              value: 'close-done-cookie-value'
            }
          ]
        })

        const loginPromise = HumbleUser.startLogin()
        await flushAsync()
        jest.advanceTimersByTime(1500)
        await flushAsync()

        const result = await loginPromise
        expect(result.status).toBe('done')
        expect(mockSeamClose).toHaveBeenCalledTimes(1)
        expect(mockSeamClose).toHaveBeenCalledWith('login-humble-0')
      } finally {
        jest.useRealTimers()
      }
    })

    test('close(label) is called exactly once when the watch settles via stopLogin() (silent cancel)', async () => {
      const loginPromise = HumbleUser.startLogin()
      await flushAsync() // seam.open() resolves, seamLabel gets set

      HumbleUser.stopLogin()

      await expect(loginPromise).resolves.toEqual({ status: 'waiting' })
      expect(mockSeamClose).toHaveBeenCalledTimes(1)
      expect(mockSeamClose).toHaveBeenCalledWith('login-humble-0')
    })

    test('a close() rejection is swallowed — the watch still resolves', async () => {
      mockSeamClose.mockRejectedValue(new Error('close failed'))

      const loginPromise = HumbleUser.startLogin()
      await flushAsync()

      HumbleUser.stopLogin()

      await expect(loginPromise).resolves.toEqual({ status: 'waiting' })
      expect(mockLogWarning).toHaveBeenCalled()
    })

    test('captures csrf_cookie through the seam during a completed login, using the SAME window label as the session-cookie read', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      try {
      mockSeamCookies.mockImplementation(
        async (_label: string, _host: string, names: string[]) => {
          if (names.includes('csrf_cookie')) {
            return {
              total: 4,
              matched: [
                {
                  name: 'csrf_cookie',
                  domain: 'humblebundle.com',
                  value: 'seam-csrf-value'
                }
              ]
            }
          }
          return {
            total: 4,
            matched: [
              {
                name: '_simpleauth_sess',
                domain: 'humblebundle.com',
                value: 'seam-session-value'
              }
            ]
          }
        }
      )

      const loginPromise = HumbleUser.startLogin()
      await flushAsync()
      jest.advanceTimersByTime(1500)
      await flushAsync()
      const result = await loginPromise
      expect(result.status).toBe('done')

      const csrfCall = mockConfigStore.set.mock.calls.find(
        ([key]) => key === 'csrfToken'
      )
      expect(csrfCall).toBeDefined()
      expect(csrfCall![1]).toMatch(/^humble:v1:/)

      // Same window label used for every seam.cookies() call in this login.
      const labelsUsed = new Set(
        mockSeamCookies.mock.calls.map(([label]) => label)
      )
      expect(labelsUsed.size).toBe(1)
      expect(labelsUsed.has('login-humble-0')).toBe(true)

      // Never logs the raw csrf value.
      const loggerCalls = [
        ...mockLogInfo.mock.calls,
        ...mockLogError.mock.calls,
        ...mockLogWarning.mock.calls
      ]
      for (const call of loggerCalls) {
        expect(JSON.stringify(call)).not.toContain('seam-csrf-value')
      }
      } finally {
        jest.useRealTimers()
      }
    })

    test('getLiveCsrfToken() returns the stored snapshot directly when a seam is installed, without touching session.fromPartition', async () => {
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'csrfToken' ? 'stored-snapshot-under-seam' : undefined
      )

      await expect(HumbleUser.getLiveCsrfToken()).resolves.toBe(
        'stored-snapshot-under-seam'
      )
      expect(mockFromPartition).not.toHaveBeenCalled()
    })

    // Phase 34.4.1 Plan 22 (F-6 Defect A, REQ-34.4.1-GAP-07): adjacent-already-present
    // regression pin (binding constraint 1) -- watchForLogin()'s poll must keep calling
    // `cookies()`, the page-host-first direction spike 014a proved correct, and must NEVER be
    // repointed at `cookiesForDomain()` (the census-only, opposite direction). Both mocks are
    // distinct jest.fn()s installed on the same fakeSeam, so a call landing on the wrong one is
    // directly observable.
    test('F-6 Defect A regression: the login-watch poll calls cookies() with the page host, never cookiesForDomain()', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      try {
        mockSeamCookies.mockResolvedValue({
          total: 4,
          matched: [
            {
              name: '_simpleauth_sess',
              domain: 'humblebundle.com',
              value: 'seam-session-value'
            }
          ]
        })

        const loginPromise = HumbleUser.startLogin()
        await flushAsync()
        jest.advanceTimersByTime(1500)
        await flushAsync()
        await loginPromise

        expect(mockSeamCookies).toHaveBeenCalledWith(
          expect.any(String),
          'www.humblebundle.com',
          expect.any(Array)
        )
        expect(mockSeamCookiesForDomain).not.toHaveBeenCalled()
      } finally {
        jest.useRealTimers()
      }
    })

    test('Electron regression: with NO seam installed, the existing session-based watch still runs unchanged', async () => {
      setLoginWindowSeam(null)
      mockCookiesGet.mockResolvedValue([])

      const loginPromise = HumbleUser.startLogin()

      expect(mockFromPartition).toHaveBeenCalledWith('persist:humble')
      expect(mockSeamOpen).not.toHaveBeenCalled()

      HumbleUser.stopLogin()
      await expect(loginPromise).resolves.toEqual({ status: 'waiting' })
    })

    // ── S-09 fix (Phase 34.4.1 Plan 18 gap-cycle closure, D-GAP-03) ─────────
    // checkHealthAndFlagExpiry()'s csrf_cookie backfill previously called
    // session.fromPartition() unconditionally with NO getLoginWindowSeam()
    // guard anywhere in the function -- under Tauri this silently no-op'd
    // every health check. It now opens a temporary HIDDEN window through the
    // seam (the same shape disconnect()'s clearHumbleCookies step uses), the
    // same way finishLogin captures csrf_cookie during an active login.

    describe('checkHealthAndFlagExpiry() — csrf_cookie backfill seam path (S-09, Plan 18)', () => {
      function primeHealthyNoCsrfConfig() {
        mockConfigStore.get_nodefault.mockImplementation((key: string) => {
          if (key === 'sessionCookie') {
            return 'humble:v1:' + Buffer.from('cookie').toString('base64')
          }
          // csrfToken never seen — models a pre-existing/missed-capture account.
          return undefined
        })
        mockDecryptString.mockReturnValue('cookie')
        mockGetGamekeys.mockResolvedValue({ status: 'ok' })
      }

      test('opens a temporary hidden window, reads csrf_cookie through the seam, stores it, and closes the window', async () => {
        primeHealthyNoCsrfConfig()
        mockSeamOpen.mockResolvedValue('csrf-backfill-window-0')
        mockSeamCookies.mockResolvedValue({
          total: 1,
          matched: [
            {
              name: 'csrf_cookie',
              domain: 'www.humblebundle.com',
              value: 'seam-backfilled-csrf-value'
            }
          ]
        })

        await HumbleUser.checkHealthAndFlagExpiry()

        expect(mockSeamOpen).toHaveBeenCalledWith(HUMBLE_BASE_URL, {
          visible: false,
          userAgent: standardBrowserUserAgent()
        })
        expect(mockSeamCookies).toHaveBeenCalledWith(
          'csrf-backfill-window-0',
          'www.humblebundle.com',
          ['csrf_cookie']
        )
        const csrfCall = mockConfigStore.set.mock.calls.find(
          ([key]) => key === 'csrfToken'
        )
        expect(csrfCall).toBeDefined()
        expect(csrfCall![1]).toMatch(/^humble:v1:/)
        expect(csrfCall![1]).not.toBe('seam-backfilled-csrf-value')
        expect(mockSeamClose).toHaveBeenCalledWith('csrf-backfill-window-0')

        // Redaction: the raw token value must never reach a log call.
        for (const call of [
          ...mockLogWarning.mock.calls,
          ...mockLogInfo.mock.calls
        ]) {
          expect(JSON.stringify(call)).not.toContain(
            'seam-backfilled-csrf-value'
          )
        }
      })

      test('never touches session.fromPartition under the seam path', async () => {
        primeHealthyNoCsrfConfig()
        mockSeamOpen.mockResolvedValue('csrf-backfill-window-1')
        mockSeamCookies.mockResolvedValue({ total: 0, matched: [] })

        await HumbleUser.checkHealthAndFlagExpiry()

        expect(mockFromPartition).not.toHaveBeenCalled()
      })

      test('a rejecting cookie read is non-fatal, and the window is still closed exactly once', async () => {
        primeHealthyNoCsrfConfig()
        mockSeamOpen.mockResolvedValue('csrf-backfill-window-2')
        mockSeamCookies.mockRejectedValue(new Error('window jar read failed'))

        await expect(
          HumbleUser.checkHealthAndFlagExpiry()
        ).resolves.toBeUndefined()

        expect(mockSeamClose).toHaveBeenCalledTimes(1)
        expect(mockSeamClose).toHaveBeenCalledWith('csrf-backfill-window-2')
        expect(mockConfigStore.set).not.toHaveBeenCalledWith(
          'csrfToken',
          expect.anything()
        )
        expect(mockLogWarning).toHaveBeenCalled()
      })

      test('a rejecting seam.open() is non-fatal and never attempts a close (no window to leak)', async () => {
        primeHealthyNoCsrfConfig()
        mockSeamOpen.mockRejectedValue(new Error('window build failed'))

        await expect(
          HumbleUser.checkHealthAndFlagExpiry()
        ).resolves.toBeUndefined()

        expect(mockSeamClose).not.toHaveBeenCalled()
        expect(mockConfigStore.set).not.toHaveBeenCalledWith(
          'csrfToken',
          expect.anything()
        )
      })

      test('does NOT open a window when csrfToken is already cached (parity with the Electron path)', async () => {
        mockConfigStore.get_nodefault.mockImplementation((key: string) => {
          if (key === 'sessionCookie') {
            return 'humble:v1:' + Buffer.from('cookie').toString('base64')
          }
          if (key === 'csrfToken') {
            return 'humble:v1:' + Buffer.from('already-cached').toString('base64')
          }
          return undefined
        })
        mockDecryptString.mockReturnValue('cookie')
        mockGetGamekeys.mockResolvedValue({ status: 'ok' })

        await HumbleUser.checkHealthAndFlagExpiry()

        expect(mockSeamOpen).not.toHaveBeenCalled()
        expect(mockConfigStore.set).not.toHaveBeenCalledWith(
          'csrfToken',
          expect.anything()
        )
      })
    })

    // ── Phase 34.4.1 Plan 06 (D-08): disconnect() seam path ─────────────────
    // Closes 34.4 D-05's declared partial — under the Tauri seam, disconnect's
    // cookie wipe goes through a hidden window + domain-scoped clearCookies
    // instead of session.fromPartition (which has no shape under Tauri).

    describe('disconnect() — seam path (Phase 34.4.1 Plan 06, D-08)', () => {
      test('credential store is cleared BEFORE the cookie step runs', async () => {
        const callOrder: string[] = []
        mockConfigStore.clear.mockImplementation(() => {
          callOrder.push('configStore.clear')
        })
        mockSeamClearCookies.mockImplementation(async () => {
          callOrder.push('clearCookies')
          return 0
        })

        await HumbleUser.disconnect()

        expect(callOrder).toEqual(['configStore.clear', 'clearCookies'])
      })

      test('opens a HIDDEN window on HUMBLE_BASE_URL and clears cookies scoped to exactly humblebundle.com', async () => {
        mockSeamOpen.mockResolvedValue('disconnect-window-0')
        mockSeamClearCookies.mockResolvedValue(3)

        await HumbleUser.disconnect()

        expect(mockSeamOpen).toHaveBeenCalledWith(HUMBLE_BASE_URL, {
          visible: false,
          userAgent: standardBrowserUserAgent()
        })
        expect(mockSeamClearCookies).toHaveBeenCalledWith(
          'disconnect-window-0',
          'humblebundle.com'
        )
      })

      test('a rejecting clearCookies does not throw out of disconnect(), and the hidden window is still closed', async () => {
        mockSeamOpen.mockResolvedValue('disconnect-window-1')
        mockSeamClearCookies.mockRejectedValue(new Error('rust clear failed'))

        await expect(HumbleUser.disconnect()).resolves.toBeUndefined()

        expect(mockSeamClose).toHaveBeenCalledWith('disconnect-window-1')
        expect(mockLogWarning).toHaveBeenCalled()
      })

      test('a rejecting seam.close() after a successful clear does not throw out of disconnect()', async () => {
        mockSeamOpen.mockResolvedValue('disconnect-window-2')
        mockSeamClearCookies.mockResolvedValue(1)
        mockSeamClose.mockRejectedValue(new Error('close failed'))

        await expect(HumbleUser.disconnect()).resolves.toBeUndefined()

        expect(mockSeamClose).toHaveBeenCalledWith('disconnect-window-2')
      })

      test('a rejecting seam.open() is caught by the outer guarded step and does not throw out of disconnect()', async () => {
        mockSeamOpen.mockRejectedValue(new Error('open failed'))

        await expect(HumbleUser.disconnect()).resolves.toBeUndefined()

        // No window was ever obtained, so clearCookies/close must not run.
        expect(mockSeamClearCookies).not.toHaveBeenCalled()
        expect(mockSeamClose).not.toHaveBeenCalled()
        expect(mockLogWarning).toHaveBeenCalled()
      })

      test('with no seam installed, the original five Electron wipe steps still run instead', async () => {
        setLoginWindowSeam(null)

        await HumbleUser.disconnect()

        expect(mockFromPartition).toHaveBeenCalledWith('persist:humble')
        expect(mockClearStorageData).toHaveBeenCalled()
        expect(mockSeamOpen).not.toHaveBeenCalled()
        expect(mockSeamClearCookies).not.toHaveBeenCalled()
      })

      // ── Phase 34.4.1 gap-cycle plan 16 (F-6 BLOCKING closure) ───────────────
      // The Tauri wipeSteps array now has MORE THAN ONE entry — the direct
      // inverse of the 5-vs-1 asymmetry F-6 named. These tests exercise the
      // new 'clearHumbleStorage' step alongside the existing cookie step.

      test('F-6: the Tauri wipeSteps run BOTH a cookie step and a storage step (more than one entry)', async () => {
        mockSeamClearStorage.mockResolvedValue({
          localStorage: 4,
          sessionStorage: 2,
          indexedDB: 1,
          caches: 0,
          serviceWorkers: 0
        })

        await HumbleUser.disconnect()

        expect(mockSeamClearCookies).toHaveBeenCalled()
        expect(mockSeamClearStorage).toHaveBeenCalledWith(
          HUMBLE_BASE_URL,
          standardBrowserUserAgent()
        )
      })

      test('F-6: a rejecting clearStorage step still leaves disconnect() resolving, and the cookie step ran anyway', async () => {
        mockSeamClearStorage.mockRejectedValue(new Error('rust storage clear failed'))
        mockSeamClearCookies.mockResolvedValue(2)

        await expect(HumbleUser.disconnect()).resolves.toBeUndefined()

        expect(mockSeamClearCookies).toHaveBeenCalled()
        expect(mockLogWarning).toHaveBeenCalled()
      })

      test('F-6: a rejecting clearCookies step does not prevent the storage step from running', async () => {
        mockSeamClearCookies.mockRejectedValue(new Error('rust cookie clear failed'))
        mockSeamClearStorage.mockResolvedValue({
          localStorage: 0,
          sessionStorage: 0,
          indexedDB: 0,
          caches: 0,
          serviceWorkers: 0
        })

        await expect(HumbleUser.disconnect()).resolves.toBeUndefined()

        expect(mockSeamClearStorage).toHaveBeenCalledWith(
          HUMBLE_BASE_URL,
          standardBrowserUserAgent()
        )
      })

      test('F-6: only counts are logged for the storage step, never a storage key or value', async () => {
        mockSeamClearStorage.mockResolvedValue({
          localStorage: 3,
          sessionStorage: 1,
          indexedDB: 'unsupported',
          caches: 0,
          serviceWorkers: 0
        })

        await HumbleUser.disconnect()

        const loggerCalls = [
          ...mockLogInfo.mock.calls,
          ...mockLogError.mock.calls,
          ...mockLogWarning.mock.calls
        ]
        const storageLogCall = mockLogInfo.mock.calls.find(([msg]) =>
          typeof msg === 'string' ? msg.includes('cleared storage') : false
        )
        expect(storageLogCall).toBeDefined()
        for (const call of loggerCalls) {
          const serialized = JSON.stringify(call)
          // No raw storage key/value ever appears -- only the numeric/'unsupported' counts.
          expect(serialized).not.toMatch(/localStorage-key|session-storage-value/)
        }
      })

      // ── Phase 34.4.1 gap-cycle plan 17 (F-5, item 3(b)) ───────────────────
      // A paired before/after cookie-jar census, taken from INSIDE the
      // cookie-clear step, proving (or loudly disproving) that the clear was
      // domain-scoped -- without ever reading or naming another origin's
      // cookie (the planted-control-cookie precondition is genuinely moot).

      describe('cookie census (Plan 17, F-5, item 3(b))', () => {
        const humbleCookie = (name: string) => ({
          name,
          domain: '.humblebundle.com',
          value: 'redacted-in-test-too'
        })

        test('census log line carries before/after totals, matched counts, deleted, and survivingNonHumble', async () => {
          mockSeamCookiesForDomain
            .mockResolvedValueOnce({
              total: 5,
              matched: [
                humbleCookie('_simpleauth_sess'),
                humbleCookie('csrf_cookie'),
                humbleCookie('other_humble_cookie')
              ]
            })
            .mockResolvedValueOnce({ total: 2, matched: [] })
          mockSeamClearCookies.mockResolvedValue(3)

          await HumbleUser.disconnect()

          const censusCall = mockLogInfo.mock.calls.find(([msg]) =>
            typeof msg === 'string' ? msg.includes('cookie census') : false
          )
          expect(censusCall).toBeDefined()
          const line = String(censusCall?.[0])
          expect(line).toContain('before(total=5, matched=3')
          expect(line).toContain('after(total=2, matched=0')
          expect(line).toContain('deleted=3')
          expect(line).toContain('survivingNonHumble=2')

          // Arithmetic holds -- no discrepancy warning.
          const discrepancyCall = mockLogWarning.mock.calls.find((c) =>
            String(c[0]).includes('discrepancy')
          )
          expect(discrepancyCall).toBeUndefined()
        })

        test('a simulated blanket wipe (jar drops further than the matched Humble count) triggers the discrepancy warning', async () => {
          mockSeamCookiesForDomain
            .mockResolvedValueOnce({
              total: 5,
              matched: [
                humbleCookie('_simpleauth_sess'),
                humbleCookie('csrf_cookie'),
                humbleCookie('other_humble_cookie')
              ]
            })
            // Blanket wipe: ALL 5 cookies gone, not just the 3 Humble ones --
            // the 2 non-Humble cookies that should have survived did not.
            .mockResolvedValueOnce({ total: 0, matched: [] })
          mockSeamClearCookies.mockResolvedValue(3)

          await HumbleUser.disconnect()

          const discrepancyCall = mockLogWarning.mock.calls.find((c) =>
            String(c[0]).includes('discrepancy')
          )
          expect(discrepancyCall).toBeDefined()
          expect(String(discrepancyCall?.[0])).toContain(
            'may not have been domain-scoped'
          )
        })

        test('Phase 34.4.1 Plan 23 (F-6 Defect B): a deleted count that disagrees with matched-before still triggers the discrepancy warning, now that deleted is a MEASURED count rather than an attempted one', async () => {
          // Jar totals stay perfectly consistent (before=5,matched=3 -> after=2) -- the
          // Plan 22 jarDelta check alone would PASS. Only seam.clearCookies' own returned
          // count disagrees with matched-before, isolating the `deleted !== before.matched`
          // branch this plan re-asserts: a re-read-derived count can still legitimately
          // diverge from the census's own matched-before count (e.g. a cookie set
          // concurrently by the still-open login window between the census read and the
          // clear), and that divergence must still be surfaced loudly.
          mockSeamCookiesForDomain
            .mockResolvedValueOnce({
              total: 5,
              matched: [
                humbleCookie('_simpleauth_sess'),
                humbleCookie('csrf_cookie'),
                humbleCookie('other_humble_cookie')
              ]
            })
            .mockResolvedValueOnce({ total: 2, matched: [] })
          // Measured delete count (2) disagrees with matched-before (3), even though the
          // jar arithmetic (before.total - after.total === 3) still checks out.
          mockSeamClearCookies.mockResolvedValue(2)

          await HumbleUser.disconnect()

          const discrepancyCall = mockLogWarning.mock.calls.find((c) =>
            String(c[0]).includes('discrepancy')
          )
          expect(discrepancyCall).toBeDefined()
          expect(String(discrepancyCall?.[0])).toContain(
            'deleted=2, expected matched-before=3'
          )
        })

        test('a rejecting census read does not block the clear and disconnect() still resolves', async () => {
          mockSeamCookiesForDomain.mockRejectedValue(new Error('census read failed'))
          mockSeamClearCookies.mockResolvedValue(0)

          await expect(HumbleUser.disconnect()).resolves.toBeUndefined()

          expect(mockSeamClearCookies).toHaveBeenCalled()
          const incompleteCall = mockLogWarning.mock.calls.find((c) =>
            String(c[0]).includes('census incomplete')
          )
          expect(incompleteCall).toBeDefined()
        })

        test('the census log line contains no cookie name, domain, or value -- only integers and fixed text', async () => {
          mockSeamCookiesForDomain
            .mockResolvedValueOnce({
              total: 5,
              matched: [
                humbleCookie('_simpleauth_sess'),
                humbleCookie('csrf_cookie'),
                humbleCookie('other_humble_cookie')
              ]
            })
            .mockResolvedValueOnce({ total: 2, matched: [] })
          mockSeamClearCookies.mockResolvedValue(3)

          await HumbleUser.disconnect()

          const censusCall = mockLogInfo.mock.calls.find(([msg]) =>
            typeof msg === 'string' ? msg.includes('cookie census') : false
          )
          expect(censusCall).toBeDefined()
          const line = String(censusCall?.[0])
          expect(line).not.toMatch(
            /_simpleauth_sess|csrf_cookie|other_humble_cookie|redacted-in-test-too/
          )
          // Only the fixed vocabulary + digits should appear after the label.
          expect(line).toMatch(
            /^Humble disconnect: cookie census before\(total=\d+, matched=\d+, verdict=\w+\) after\(total=\d+, matched=\d+, verdict=\w+\) deleted=\d+ survivingNonHumble=\d+$/
          )
        })

        test('the window is closed exactly once, after the census, on the census-failure path too', async () => {
          mockSeamOpen.mockResolvedValue('disconnect-window-census')
          mockSeamCookiesForDomain.mockRejectedValue(new Error('census read failed'))
          mockSeamClearCookies.mockResolvedValue(0)

          await HumbleUser.disconnect()

          expect(mockSeamClose).toHaveBeenCalledTimes(1)
          expect(mockSeamClose).toHaveBeenCalledWith('disconnect-window-census')
        })

        test('an UNDECIDABLE read (jar never proven live) is reported as undecidable, never collapsed to a clean zero', async () => {
          // Both before/after reads return total=0 -- the jar's cookie API
          // was never proven live within this census, so classifyCookieRead
          // must return UNDECIDABLE, never a false-positive SUPPORTED_BUT_EMPTY.
          mockSeamCookiesForDomain.mockResolvedValue({ total: 0, matched: [] })
          mockSeamClearCookies.mockResolvedValue(0)

          await HumbleUser.disconnect()

          const censusCall = mockLogInfo.mock.calls.find(([msg]) =>
            typeof msg === 'string' ? msg.includes('cookie census') : false
          )
          expect(censusCall).toBeDefined()
          expect(String(censusCall?.[0])).toContain('verdict=UNDECIDABLE')
        })
      })
    })
  })

  // Round 5 added getFullCookieHeader() (a main-process read of the live
  // persist:humble partition's full cookie jar) here. Round 6 (debug session
  // humble-reveal-key-fails) removed it: round 5's checkpoint evidence
  // (fullCookieJarPresent=true, still a live Cloudflare HTML 403) falsified
  // the mechanism as sufficient — the reveal POST now routes through
  // Electron's own net.request transport, which sources the partition's
  // cookies NATIVELY (see adapter.ts's humblePostRequest), making a
  // hand-built mirror of the jar redundant. Its test coverage was removed
  // alongside it rather than left exercising dead code.

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
