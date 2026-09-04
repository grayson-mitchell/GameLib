/**
 * D-15 cookie-jar leak fix for GOG logout (Phase 40 plan 04, T-40-04-07/-08).
 *
 * GOG's `logout()` used to clear only credentials -- the shared default cookie jar kept every
 * session cookie GOG ever set, silently surviving sign-out. The store/wiki embed this phase
 * adds is what makes that leak user-visible for the first time (a navigable GOG tab whose login
 * outlives an explicit sign-out).
 *
 * What this file proves, and why each half is load-bearing:
 *
 *  1. Credential-side cleanup (`configStore.clear()`, `gogdlAuthConfig` unlink, the in-memory
 *     credentials cache) runs FIRST and UNCONDITIONALLY -- even when the cookie-side step
 *     throws. A sign-out that revoked GOG credentials but skipped the cookie clear is a residual
 *     leak; a sign-out that let a cookie-clear failure block credential cleanup would be worse.
 *  2. `logout()` never rejects because of a cookie-side failure -- `ipcMain.on('logoutGOG', ...)`
 *     is a `send` channel whose rejection reaches no caller at all
 *     (`sidecar-send-channels-fail-silently`), so a rejecting `logout()` would be silently
 *     dropped rather than surfaced.
 *  3. On macOS, the clear is attempted, one domain at a time, against the sentinel
 *     `GOG_COOKIE_CLEAR_NO_WINDOW_LABEL` -- never a real window.
 *  4. A zero verified-delete count against a non-empty before-census WARNS (wry's cookie-delete
 *     is known to lie about deletion -- WebKit bug #184938 -- so the count consumed here is the
 *     Rust side's own independent before/after re-read, never the removal call's own signal).
 *  5. Off macOS, no seam call is attempted at all -- no Tauri leg ships on Windows/Linux yet
 *     (Phase 38), so there is no live target to clear cookies against.
 */

jest.mock('axios')

jest.mock('backend/platform', () => ({
  app: { getVersion: () => '1.0.0' }
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Gog: 'Gog' }
}))

jest.mock('backend/online_monitor', () => ({
  isOnline: () => true
}))

jest.mock('backend/storeManagers/index', () => ({
  libraryManagerMap: {
    gog: { runRunnerCommand: jest.fn() }
  }
}))

const mockConfigStoreClear = jest.fn<unknown, unknown[]>()
jest.mock('backend/storeManagers/gog/electronStores', () => ({
  configStore: {
    set: jest.fn(),
    get_nodefault: jest.fn(),
    clear: (...args: unknown[]) => mockConfigStoreClear(...args)
  }
}))

jest.mock('backend/storeManagers/gog/constants', () => ({
  gogdlAuthConfig: '/tmp/gamelib-gog-logout-cookies-test/does-not-exist.json'
}))

jest.mock('backend/utils', () => ({
  clearCache: jest.fn()
}))

// See `epicLogoutDomains.test.ts`'s copy of this mock for why it is a `defineProperty` and not
// an object-literal getter -- the literal form is silently inert under TypeScript's `__assign`
// spread helper and would make every platform branch below measure the real `process.platform`
// instead.
let mockIsMac = true
jest.mock('backend/constants/environment', () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    'backend/constants/environment'
  )
  return Object.defineProperty({ ...actual }, 'isMac', {
    get: () => mockIsMac
  })
})

import { logWarning, logInfo } from 'backend/logger'
import { GOGUser } from '../user'
import {
  setLoginWindowSeam,
  type LoginWindowSeam
} from '../../../humble/loginWindowSeam'

function makeMockSeam(
  overrides: Partial<LoginWindowSeam> = {}
): LoginWindowSeam & { clearCookies: jest.Mock; cookiesForDomain: jest.Mock } {
  return {
    open: jest.fn().mockResolvedValue('window-label-1'),
    cookies: jest.fn(),
    cookiesForDomain: jest.fn().mockResolvedValue({ total: 2, matched: [] }),
    takeEvents: jest.fn(),
    close: jest.fn().mockResolvedValue(true),
    clearCookies: jest.fn().mockResolvedValue(2),
    revealPost: jest.fn(),
    clearStorage: jest.fn(),
    ...overrides
  } as unknown as LoginWindowSeam & {
    clearCookies: jest.Mock
    cookiesForDomain: jest.Mock
  }
}

/** Every string that reached any of the two relevant log sinks, flattened. */
function allLoggedText(): string {
  const sinks = [logInfo, logWarning] as unknown as jest.Mock<
    unknown,
    unknown[]
  >[]
  return sinks
    .flatMap((sink) => sink.mock.calls)
    .map((call) => JSON.stringify(call))
    .join('\n')
}

beforeEach(() => {
  jest.clearAllMocks()
  mockIsMac = true
  setLoginWindowSeam(null)
  GOGUser.__resetCredentialsCacheForTests()
})

afterEach(() => {
  setLoginWindowSeam(null)
})

describe('GOGUser.logout() credential cleanup runs first and unconditionally (D-15)', () => {
  it('clears credentials even when no login-window seam is installed at all (cookie step throws synchronously)', async () => {
    // No seam installed -- `getLoginWindowSeamOrThrow()` throws synchronously the instant the
    // cookie-side step calls it.
    await expect(GOGUser.logout()).resolves.toBeUndefined()

    expect(mockConfigStoreClear).toHaveBeenCalledTimes(1)
  })

  it('clears credentials even when the cookie seam clearCookies() rejects', async () => {
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockRejectedValue(new Error('rust-side clear failed'))
    })
    setLoginWindowSeam(seam)

    await expect(GOGUser.logout()).resolves.toBeUndefined()

    expect(mockConfigStoreClear).toHaveBeenCalledTimes(1)
  })

  it('never rejects -- a cookie-side failure must never surface as a rejected logout() promise', async () => {
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockRejectedValue(new Error('census failed')),
      clearCookies: jest.fn().mockRejectedValue(new Error('clear failed'))
    })
    setLoginWindowSeam(seam)

    await expect(GOGUser.logout()).resolves.toBeUndefined()
  })
})

describe('GOGUser.logout() cookie clear (macOS)', () => {
  it('clears the GOG apex domain against the sentinel no-window label, never a real window', async () => {
    const seam = makeMockSeam()
    setLoginWindowSeam(seam)

    await GOGUser.logout()

    expect(seam.clearCookies).toHaveBeenCalledTimes(1)
    expect(seam.clearCookies).toHaveBeenCalledWith(
      'gog-cookie-clear-no-window',
      'gog.com'
    )
    // No real window is ever opened for this clear.
    expect((seam as unknown as { open: jest.Mock }).open).not.toHaveBeenCalled()
  })

  it('consumes the verified-delete count and logs it per domain', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(5)
    })
    setLoginWindowSeam(seam)

    await GOGUser.logout()

    expect(allLoggedText()).toContain('gog.com')
    expect(allLoggedText()).toContain('5')
  })

  it('warns (does not silently succeed) on a zero verified-delete count against a non-empty before-census', async () => {
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockResolvedValue({ total: 3, matched: [] }),
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await GOGUser.logout()

    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('gog.com'),
      expect.anything()
    )
  })

  it('does NOT warn when a zero verified-delete count is against an EMPTY before-census (nothing to remove)', async () => {
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockResolvedValue({ total: 0, matched: [] }),
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await GOGUser.logout()

    expect(logWarning).not.toHaveBeenCalled()
  })
})

describe('GOGUser.logout() cookie clear (off macOS)', () => {
  it('attempts no seam call at all -- no Tauri leg ships off macOS yet', async () => {
    mockIsMac = false
    const seam = makeMockSeam()
    setLoginWindowSeam(seam)

    await GOGUser.logout()

    expect(seam.clearCookies).not.toHaveBeenCalled()
    expect(seam.cookiesForDomain).not.toHaveBeenCalled()
    // Credential cleanup still runs.
    expect(mockConfigStoreClear).toHaveBeenCalledTimes(1)
  })
})
