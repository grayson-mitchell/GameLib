/**
 * Bidirectional registration-kind proof for the sidecar's 11 curated Epic/GOG/Amazon
 * auth/sign-out channels (Phase 34.5 Plan 06 — Task 3, extended by Plan 10 — Task 2,
 * REQ-34.5-04).
 *
 * Mirrors `humbleLoginFlows.test.ts`'s Describe 1 template (registration-kind cross-check,
 * both directions) plus `steamAuthFlows.test.ts`'s real-shim/disposable-homedir mock preamble —
 * this suite reaches the real `configStore` chain transitively through `../storeManagers`'s
 * load-bearing import (which eagerly constructs every store manager, including
 * `legendaryConfig`/`gogdlConfig`/`gog_store`/`nile_store`), so the homedir MUST be redirected
 * before any import runs (project memory: `tests-clobbering-real-steam-store.md`, "`afterAll`
 * is not a safety net").
 *
 * `../../storeManagers/legendary/user`, `../../storeManagers/gog/user`, and
 * `../../storeManagers/nile/user` are factory-mocked (not automocked) so
 * `LegendaryUser.login`/`GOGUser.login`/`GOGUser.logout`/`NileUser.login` are directly
 * controllable `jest.fn()`s — this suite proves *registration and the trust-boundary
 * validation/send-guard this plan adds*, not `LegendaryUser`/`GOGUser`/`NileUser`'s own internal
 * logic (covered by `storeManagers/legendary/__tests__/user.test.ts` and any future GOG/Nile
 * equivalent). `backend/logger` is factory-mocked so the validation-rejection and `logoutGOG`
 * failure paths (both of which log) never touch the real, uninitialized `heroicLogWriter`.
 *
 * Plan 10 additionally imports `matchOAuthRedirect` from the REAL (unmocked) `../oauthLoginCapture`
 * — a pure module with no seam/logger side effects requiring a mock — to prove the integration
 * between plan 34.5-02's host anchor and this plan's `authAmazon` mint (T-34.5-34).
 */

// ── os — disposable per-process homedir (mirrors steamAuthFlows.test.ts) ──────────────────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-runnerauth-test-home-${process.pid}`)
  }
})

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar shims ──
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — several storeManagers modules reached via `../storeManagers`'s load-bearing import
// touch axios at module scope (mirrors steamAuthFlows.test.ts) ────────────────────────────────
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      head: jest.fn(() => Promise.resolve({ status: 200 })),
      create: jest.fn(() => mockInstance)
    }
  }
})

// ── backend/utils — no real on-disk Steam install to scan in CI (mirrors steamAuthFlows.test.ts);
// also supplies isEpicServiceOffline/clearCache, both real exports of this same module that
// runnerAuthFlowRegistration.ts / legendary/user.ts import ─────────────────────────────────────
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn(),
  isEpicServiceOffline: jest.fn(async () => false),
  clearCache: jest.fn()
}))

// ── backend/constants/environment — deterministic branch regardless of host OS ────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── backend/logger — factory-mocked so validation-rejection / send-failure log calls never
// touch the real, uninitialized heroicLogWriter (this suite never calls bootstrap's init()) ───
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: {
    Legendary: 'Legendary',
    Gog: 'Gog',
    Backend: 'Backend'
  }
}))

// ── LegendaryUser / GOGUser — factory-mocked so login/logout are directly controllable and
// assertable. This suite proves registration + this plan's trust-boundary validation/send-guard,
// not the runners' own internal logic ──────────────────────────────────────────────────────────
const mockLegendaryLogin = jest.fn()
const mockLegendaryLogout = jest.fn()
const mockLegendaryIsLoggedIn = jest.fn()
const mockLegendaryGetUserInfo = jest.fn()
jest.mock('../../storeManagers/legendary/user', () => ({
  LegendaryUser: {
    login: (...args: unknown[]) => mockLegendaryLogin(...args),
    logout: (...args: unknown[]) => mockLegendaryLogout(...args),
    isLoggedIn: (...args: unknown[]) => mockLegendaryIsLoggedIn(...args),
    getUserInfo: (...args: unknown[]) => mockLegendaryGetUserInfo(...args)
  }
}))

const mockGOGLogin = jest.fn()
const mockGOGLogout = jest.fn()
jest.mock('../../storeManagers/gog/user', () => ({
  GOGUser: {
    login: (...args: unknown[]) => mockGOGLogin(...args),
    logout: (...args: unknown[]) => mockGOGLogout(...args)
  }
}))

// ── NileUser (Amazon) — factory-mocked, mirrors LegendaryUser/GOGUser above (Plan 10) ──────────
const mockNileLogin = jest.fn()
const mockNileLogout = jest.fn()
const mockNileGetLoginData = jest.fn()
const mockNileGetUserData = jest.fn()
jest.mock('../../storeManagers/nile/user', () => ({
  NileUser: {
    login: (...args: unknown[]) => mockNileLogin(...args),
    logout: (...args: unknown[]) => mockNileLogout(...args),
    getLoginData: (...args: unknown[]) => mockNileGetLoginData(...args),
    getUserData: (...args: unknown[]) => mockNileGetUserData(...args)
  }
}))

// ── Imports (after mocks) ───────────────────────────────────────────────────────────────────────
import { registerRunnerAuthFlows } from '../runnerAuthFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import { logWarning } from 'backend/logger'
// REAL module — pure, no seam/logger side effects requiring a mock (T-34.5-34 integration proof).
import { matchOAuthRedirect } from '../oauthLoginCapture'

// ── Registered ONCE for this whole file (not per-test) — handlerRegistry/listenerRegistry are
// module-scope maps; calling registerRunnerAuthFlows() more than once would stack a duplicate
// listener onto logoutGOG (humbleLoginFlows.test.ts's own convention/warning, and the exact
// hazard this plan's own idempotence guard in runnerAuthFlowRegistration.ts now also protects
// against independently) ─────────────────────────────────────────────────────────────────────────
registerRunnerAuthFlows()

// ── Describe 1: Registration kind (bidirectional) ──────────────────────────────────────────────
describe('registration kind — all 11 auth channels are registered with the correct kind, both directions', () => {
  const HANDLE_CHANNELS = [
    'getEpicGamesStatus',
    'getUserInfo',
    'isLoggedIn',
    'login',
    'logoutLegendary',
    'authGOG',
    'getAmazonLoginData',
    'authAmazon',
    'getAmazonUserInfo',
    'logoutAmazon'
  ]
  const SEND_CHANNELS = ['logoutGOG']

  it.each(HANDLE_CHANNELS)(
    'REQ-34.5-04 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(SEND_CHANNELS)(
    'REQ-34.5-04 %s is registered as ipcMain.on, and NOT as ipcMain.handle',
    (channel) => {
      expect((listenerRegistry.get(channel) ?? []).length).toBe(1)
      expect(handlerRegistry.has(channel)).toBe(false)
    }
  )
})

// ── Describe 2: The send/handle asymmetry itself ───────────────────────────────────────────────
describe('T-34.5-18 — the sign-out asymmetry: logoutLegendary and logoutAmazon are handle-kind, logoutGOG is send-kind', () => {
  it('REQ-34.5-04 a regression that "tidied" logoutGOG into handle-kind (or the reverse for logoutLegendary/logoutAmazon) must fail this suite', () => {
    // Three sign-outs, three runners — now all provable at once, since plan 10 completes the
    // cluster: logoutLegendary and logoutAmazon are handle-kind siblings, and only GOG's is
    // send-kind. This is inherited Electron behaviour, deliberately preserved (main.ts:879
    // `addHandler('logoutLegendary', ...)` and main.ts:884 `addHandler('logoutAmazon', ...)` vs
    // main.ts:880 `addListener('logoutGOG', ...)`), not an inconsistency to "fix".
    expect(handlerRegistry.has('logoutLegendary')).toBe(true)
    expect((listenerRegistry.get('logoutLegendary') ?? []).length).toBe(0)

    expect(handlerRegistry.has('logoutAmazon')).toBe(true)
    expect((listenerRegistry.get('logoutAmazon') ?? []).length).toBe(0)

    expect(handlerRegistry.has('logoutGOG')).toBe(false)
    expect((listenerRegistry.get('logoutGOG') ?? []).length).toBe(1)
  })
})

// ── Describe 3: Trust-boundary validation (login / authGOG) ───────────────────────────────────
describe('T-34.5-21/T-34.5-22 — login and authGOG reject a non-string/empty payload at the boundary', () => {
  const loginHandler = () => handlerRegistry.get('login')!
  const authGOGHandler = () => handlerRegistry.get('authGOG')!

  it('REQ-34.5-04 login rejects a non-string payload without invoking LegendaryUser.login, and never logs the payload value', async () => {
    const secretValue = 'super-secret-sid-value-12345'
    const result = await loginHandler()(undefined, { not: 'a string' })

    expect(result).toEqual({ status: 'failed', data: undefined })
    expect(mockLegendaryLogin).not.toHaveBeenCalled()
    for (const call of (logWarning as jest.Mock).mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretValue)
    }
  })

  it('REQ-34.5-04 login rejects an empty string without invoking LegendaryUser.login', async () => {
    const result = await loginHandler()(undefined, '')

    expect(result).toEqual({ status: 'failed', data: undefined })
    expect(mockLegendaryLogin).not.toHaveBeenCalled()
  })

  it('REQ-34.5-04 login calls LegendaryUser.login for a valid non-empty string payload', async () => {
    mockLegendaryLogin.mockResolvedValue({ status: 'done', data: undefined })

    await loginHandler()(undefined, 'valid-sid')

    expect(mockLegendaryLogin).toHaveBeenCalledWith('valid-sid')
  })

  it('REQ-34.5-04 authGOG rejects a non-string payload without invoking GOGUser.login, and never logs the payload value', async () => {
    const secretValue = 'super-secret-gog-code-67890'
    const result = await authGOGHandler()(undefined, 12345)

    expect(result).toEqual({ status: 'error' })
    expect(mockGOGLogin).not.toHaveBeenCalled()
    for (const call of (logWarning as jest.Mock).mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretValue)
    }
  })

  it('REQ-34.5-04 authGOG rejects an empty string without invoking GOGUser.login', async () => {
    const result = await authGOGHandler()(undefined, '')

    expect(result).toEqual({ status: 'error' })
    expect(mockGOGLogin).not.toHaveBeenCalled()
  })

  it('REQ-34.5-04 authGOG calls GOGUser.login for a valid non-empty string payload', async () => {
    mockGOGLogin.mockResolvedValue({ status: 'done', data: undefined })

    await authGOGHandler()(undefined, 'valid-code')

    expect(mockGOGLogin).toHaveBeenCalledWith('valid-code')
  })
})

// ── Describe 3b: Trust-boundary validation (authAmazon) — Plan 10, T-34.5-34/35/36 ────────────
describe('T-34.5-35/T-34.5-36 — authAmazon rejects a malformed NileRegisterData payload at the boundary', () => {
  const authAmazonHandler = () => handlerRegistry.get('authAmazon')!
  const VALID_PAYLOAD = {
    code: 'valid-nile-code',
    code_verifier: 'valid-verifier',
    serial: 'valid-serial',
    client_id: 'valid-client-id'
  }

  it('REQ-34.5-04 authAmazon rejects a non-object payload without invoking NileUser.login, and never logs the payload value', async () => {
    const secretValue = 'super-secret-amazon-code-13579'
    const result = await authAmazonHandler()(undefined, secretValue)

    expect(result).toEqual({ status: 'failed', user: undefined })
    expect(mockNileLogin).not.toHaveBeenCalled()
    for (const call of (logWarning as jest.Mock).mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretValue)
    }
  })

  it('REQ-34.5-04 authAmazon rejects a payload missing code_verifier without invoking NileUser.login', async () => {
    const { code_verifier: _drop, ...incomplete } = VALID_PAYLOAD
    const result = await authAmazonHandler()(undefined, incomplete)

    expect(result).toEqual({ status: 'failed', user: undefined })
    expect(mockNileLogin).not.toHaveBeenCalled()
  })

  it('REQ-34.5-04 authAmazon rejects a payload whose code is an empty string without invoking NileUser.login', async () => {
    const result = await authAmazonHandler()(undefined, {
      ...VALID_PAYLOAD,
      code: ''
    })

    expect(result).toEqual({ status: 'failed', user: undefined })
    expect(mockNileLogin).not.toHaveBeenCalled()
  })

  it('REQ-34.5-04 authAmazon rejects null and undefined payloads without invoking NileUser.login', async () => {
    expect(await authAmazonHandler()(undefined, null)).toEqual({
      status: 'failed',
      user: undefined
    })
    expect(await authAmazonHandler()(undefined, undefined)).toEqual({
      status: 'failed',
      user: undefined
    })
    expect(mockNileLogin).not.toHaveBeenCalled()
  })

  it('REQ-34.5-04 authAmazon calls NileUser.login for a valid NileRegisterData payload', async () => {
    mockNileLogin.mockResolvedValue({ status: 'done', user: undefined })

    await authAmazonHandler()(undefined, VALID_PAYLOAD)

    expect(mockNileLogin).toHaveBeenCalledWith(VALID_PAYLOAD)
  })
})

// ── Describe 3c: The anchor-plus-mint integration (T-34.5-34, closes T-34.4.1-44b) ─────────────
describe('T-34.5-34 — the nile host anchor and the authAmazon mint are only meaningful together', () => {
  it('REQ-34.5-04 a URL that would have matched the OLD host-free nile matcher does not match the anchored one, and therefore never reaches authAmazon', () => {
    // Before plan 34.5-02's host anchor, `matchOAuthRedirect('nile', ...)` matched ANY origin
    // carrying `openid.oa2.authorization_code` — exactly the exposure T-34.4.1-44b describes. This
    // hostile URL would have matched that old, host-free shape; it must now yield `null`, proving
    // a code captured from a non-Amazon origin can never reach `authAmazon`'s mint. If plan
    // 34.5-02's anchor is ever reverted, this assertion fails alongside `oauthLoginCapture.test.ts`'s
    // own anchor coverage — two independent tripwires on the same regression.
    const hostileUrl =
      'https://evil.example/phishing?openid.oa2.authorization_code=STOLEN-CODE'

    expect(matchOAuthRedirect('nile', hostileUrl)).toBeNull()
  })

  it('REQ-34.5-04 a genuine www.amazon.com redirect matches, and its captured code is exactly what authAmazon would receive', async () => {
    const genuineUrl =
      'https://www.amazon.com/ap/oa?openid.oa2.authorization_code=NILE-REAL-CODE'
    const match = matchOAuthRedirect('nile', genuineUrl)

    expect(match).toEqual({
      code: 'NILE-REAL-CODE',
      redirectUrl: genuineUrl
    })

    // The captured code alone is not authAmazon's full payload shape (NileRegisterData also
    // needs code_verifier/serial/client_id, supplied by the renderer's own PKCE state) — this
    // assertion proves only that the anchor's output is the exact code authAmazon's validation
    // would accept as `data.code`, not that the two seams are wired end-to-end at runtime.
    const authAmazonHandler = handlerRegistry.get('authAmazon')!
    mockNileLogin.mockResolvedValue({ status: 'done', user: undefined })
    await authAmazonHandler(undefined, {
      code: match!.code,
      code_verifier: 'verifier',
      serial: 'serial',
      client_id: 'client-id'
    })

    expect(mockNileLogin).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NILE-REAL-CODE' })
    )
  })
})

// ── Describe 4: logoutGOG's fire-and-forget guard (T-34.5-18) ─────────────────────────────────
describe('T-34.5-18 — logoutGOG never lets a synchronous GOGUser.logout() throw escape the listener', () => {
  it('REQ-34.5-04 a synchronously-throwing GOGUser.logout() does not escape the registered listener, and a failure is logged', () => {
    mockGOGLogout.mockImplementation(() => {
      throw new Error('gogdl auth --delete failed')
    })

    const listeners = listenerRegistry.get('logoutGOG') ?? []
    expect(listeners.length).toBe(1)

    expect(() => listeners[0](undefined)).not.toThrow()
    expect(mockGOGLogout).toHaveBeenCalled()
    expect(logWarning).toHaveBeenCalled()
  })

  it('REQ-34.5-04 a healthy GOGUser.logout() runs without any failure log', () => {
    mockGOGLogout.mockImplementation(() => undefined)
    ;(logWarning as jest.Mock).mockClear()

    const listeners = listenerRegistry.get('logoutGOG') ?? []
    expect(() => listeners[0](undefined)).not.toThrow()
    expect(mockGOGLogout).toHaveBeenCalled()
    expect(logWarning).not.toHaveBeenCalled()
  })
})

// ── Describe 5: Dropped channels never registered by this module ──────────────────────────────
describe('none of the dropped zoom channels are registered here — the cluster is complete at 11, no twelfth channel belongs', () => {
  // Zoom — D-02 drops it permanently. Amazon's 4 channels (previously listed here as
  // "belongs to plan 34.5-10, not this plan") are now registered above by this same plan — the
  // auth cluster is complete at 11 channels (6 Epic/GOG invoke + 1 GOG send + 4 Amazon invoke).
  // No twelfth channel belongs in this module.
  const NEVER_REGISTERED = ['authZoom', 'getZoomUserInfo', 'logoutZoom']

  it.each(NEVER_REGISTERED)(
    'REQ-34.5-04 %s is absent from both handlerRegistry and listenerRegistry',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(false)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )
})
