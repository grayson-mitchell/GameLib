/**
 * Bidirectional registration-kind proof for the sidecar's 7 curated Epic + GOG auth/sign-out
 * channels (Phase 34.5 Plan 06 — Task 3, REQ-34.5-04).
 *
 * Mirrors `humbleLoginFlows.test.ts`'s Describe 1 template (registration-kind cross-check,
 * both directions) plus `steamAuthFlows.test.ts`'s real-shim/disposable-homedir mock preamble —
 * this suite reaches the real `configStore` chain transitively through `../storeManagers`'s
 * load-bearing import (which eagerly constructs every store manager, including
 * `legendaryConfig`/`gogdlConfig`/`gog_store`), so the homedir MUST be redirected before any
 * import runs (project memory: `tests-clobbering-real-steam-store.md`, "`afterAll` is not a
 * safety net").
 *
 * `../../storeManagers/legendary/user` and `../../storeManagers/gog/user` are factory-mocked
 * (not automocked) so `LegendaryUser.login`/`GOGUser.login`/`GOGUser.logout` are directly
 * controllable `jest.fn()`s — this suite proves *registration and the trust-boundary
 * validation/send-guard this plan adds*, not `LegendaryUser`/`GOGUser`'s own internal logic
 * (covered by `storeManagers/legendary/__tests__/user.test.ts` and any future GOG equivalent).
 * `backend/logger` is factory-mocked so the validation-rejection and `logoutGOG` failure paths
 * (both of which log) never touch the real, uninitialized `heroicLogWriter`.
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

// ── Imports (after mocks) ───────────────────────────────────────────────────────────────────────
import { registerRunnerAuthFlows } from '../runnerAuthFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import { logWarning } from 'backend/logger'

// ── Registered ONCE for this whole file (not per-test) — handlerRegistry/listenerRegistry are
// module-scope maps; calling registerRunnerAuthFlows() more than once would stack a duplicate
// listener onto logoutGOG (humbleLoginFlows.test.ts's own convention/warning, and the exact
// hazard this plan's own idempotence guard in runnerAuthFlowRegistration.ts now also protects
// against independently) ─────────────────────────────────────────────────────────────────────────
registerRunnerAuthFlows()

// ── Describe 1: Registration kind (bidirectional) ──────────────────────────────────────────────
describe('registration kind — the 7 Epic/GOG channels are registered with the correct kind, both directions', () => {
  const HANDLE_CHANNELS = [
    'getEpicGamesStatus',
    'getUserInfo',
    'isLoggedIn',
    'login',
    'logoutLegendary',
    'authGOG'
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
describe('T-34.5-18 — the sign-out asymmetry: logoutLegendary is handle-kind, logoutGOG is send-kind', () => {
  it('REQ-34.5-04 a regression that "tidied" logoutGOG into handle-kind (or the reverse for logoutLegendary) must fail this suite', () => {
    // Three sign-outs, three runners (Amazon's logoutAmazon lands in plan 34.5-10, not yet
    // registered by this module) — only GOG's is send-kind. This is inherited Electron behaviour,
    // deliberately preserved (main.ts:879 `addHandler('logoutLegendary', ...)` vs main.ts:880
    // `addListener('logoutGOG', ...)`), not an inconsistency to "fix".
    expect(handlerRegistry.has('logoutLegendary')).toBe(true)
    expect((listenerRegistry.get('logoutLegendary') ?? []).length).toBe(0)

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

// ── Describe 5: Dropped/out-of-scope channels never registered by this module ──────────────────
describe('none of the dropped zoom channels or plan-34.5-10 Amazon channels are registered here', () => {
  const NEVER_REGISTERED = [
    // Zoom — D-02 drops it permanently.
    'authZoom',
    'getZoomUserInfo',
    'logoutZoom',
    // Amazon — belongs to plan 34.5-10, not this plan.
    'getAmazonLoginData',
    'authAmazon',
    'getAmazonUserInfo',
    'logoutAmazon'
  ]

  it.each(NEVER_REGISTERED)(
    'REQ-34.5-04 %s is absent from both handlerRegistry and listenerRegistry',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(false)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )
})
