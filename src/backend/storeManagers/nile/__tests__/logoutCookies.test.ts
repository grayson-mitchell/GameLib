/**
 * D-15 cookie-jar leak fix for Amazon (Nile) logout (Phase 40 plan 04, T-40-04-07/-08).
 *
 * See the GOG sibling of this file (`gog/__tests__/logoutCookies.test.ts`) for the full
 * rationale -- this file proves the identical five properties against `NileUser.logout()`:
 * credential cleanup runs first and unconditionally, `logout()` never rejects on a cookie-side
 * failure, the clear targets the sentinel no-window label one domain at a time, a zero
 * verified-delete count against a non-empty before-census warns, and off macOS no seam call is
 * attempted at all.
 *
 * Also proves this supersedes the prior `accept` disposition against this exact path
 * (T-34.5-37) -- see `runnerAuthFlowRegistration.ts`'s `logoutAmazon` handler comment.
 */

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Nile: 'Nile' }
}))

const mockConfigStoreDelete = jest.fn<unknown, unknown[]>()
jest.mock('backend/storeManagers/nile/electronStores', () => ({
  configStore: {
    set: jest.fn(),
    get_nodefault: jest.fn(),
    delete: (...args: unknown[]) => mockConfigStoreDelete(...args)
  }
}))

const mockClearCache = jest.fn<unknown, unknown[]>()
jest.mock('backend/utils', () => ({
  clearCache: (...args: unknown[]) => mockClearCache(...args)
}))

jest.mock('backend/storeManagers/nile/constants', () => ({
  nileUserData: '/tmp/gamelib-nile-logout-cookies-test/does-not-exist.json'
}))

const mockRunRunnerCommand = jest.fn<Promise<unknown>, unknown[]>()
jest.mock('backend/storeManagers/index', () => ({
  libraryManagerMap: {
    nile: {
      runRunnerCommand: (...args: unknown[]) => mockRunRunnerCommand(...args)
    }
  }
}))

// See `epicLogoutDomains.test.ts`'s copy of this mock for why it must be a `defineProperty` and
// not an object-literal getter.
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
import { NileUser } from '../user'
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
  mockRunRunnerCommand.mockResolvedValue({
    abort: false,
    stdout: '',
    stderr: ''
  })
})

afterEach(() => {
  setLoginWindowSeam(null)
})

describe('NileUser.logout() credential cleanup runs first and unconditionally (D-15)', () => {
  it('clears credentials even when no login-window seam is installed at all', async () => {
    await expect(NileUser.logout()).resolves.toBeUndefined()

    expect(mockConfigStoreDelete).toHaveBeenCalledWith('userData')
    expect(mockClearCache).toHaveBeenCalledWith('nile')
  })

  it('clears credentials even when the cookie seam clearCookies() rejects', async () => {
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockRejectedValue(new Error('rust-side clear failed'))
    })
    setLoginWindowSeam(seam)

    await expect(NileUser.logout()).resolves.toBeUndefined()

    expect(mockConfigStoreDelete).toHaveBeenCalledWith('userData')
    expect(mockClearCache).toHaveBeenCalledWith('nile')
  })

  it('never rejects -- a cookie-side failure must never surface as a rejected logout() promise', async () => {
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockRejectedValue(new Error('census failed')),
      clearCookies: jest.fn().mockRejectedValue(new Error('clear failed'))
    })
    setLoginWindowSeam(seam)

    await expect(NileUser.logout()).resolves.toBeUndefined()
  })

  it('does not attempt the cookie clear at all when runRunnerCommand reports an abort', async () => {
    mockRunRunnerCommand.mockResolvedValue({
      abort: true,
      stdout: '',
      stderr: ''
    })
    const seam = makeMockSeam()
    setLoginWindowSeam(seam)

    await NileUser.logout()

    expect(seam.clearCookies).not.toHaveBeenCalled()
    expect(mockConfigStoreDelete).not.toHaveBeenCalled()
  })
})

describe('NileUser.logout() cookie clear (macOS)', () => {
  it('clears the Amazon apex domain against the sentinel no-window label, never a real window', async () => {
    const seam = makeMockSeam()
    setLoginWindowSeam(seam)

    await NileUser.logout()

    expect(seam.clearCookies).toHaveBeenCalledTimes(1)
    expect(seam.clearCookies).toHaveBeenCalledWith(
      'amazon-cookie-clear-no-window',
      'amazon.com'
    )
    expect((seam as unknown as { open: jest.Mock }).open).not.toHaveBeenCalled()
  })

  it('consumes the verified-delete count and logs it per domain', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(7)
    })
    setLoginWindowSeam(seam)

    await NileUser.logout()

    expect(allLoggedText()).toContain('amazon.com')
    expect(allLoggedText()).toContain('7')
  })

  it('warns on a zero verified-delete count against a non-empty before-census', async () => {
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockResolvedValue({ total: 4, matched: [] }),
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await NileUser.logout()

    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('amazon.com'),
      expect.anything()
    )
  })

  it('does NOT warn when a zero verified-delete count is against an EMPTY before-census', async () => {
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockResolvedValue({ total: 0, matched: [] }),
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await NileUser.logout()

    expect(logWarning).not.toHaveBeenCalled()
  })
})

describe('NileUser.logout() cookie clear (off macOS)', () => {
  it('attempts no seam call at all -- no Tauri leg ships off macOS yet', async () => {
    mockIsMac = false
    const seam = makeMockSeam()
    setLoginWindowSeam(seam)

    await NileUser.logout()

    expect(seam.clearCookies).not.toHaveBeenCalled()
    expect(seam.cookiesForDomain).not.toHaveBeenCalled()
    expect(mockConfigStoreDelete).toHaveBeenCalledWith('userData')
  })
})
