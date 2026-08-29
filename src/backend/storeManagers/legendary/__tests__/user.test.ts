/**
 * Unit tests for LegendaryUser.logout() (Phase 34.5 Plan 06, T-34.5-19/T-34.5-20,
 * REQ-34.5-04).
 *
 * No test file existed for this module before this plan. These tests cover the defect this
 * plan fixes: under the Tauri sidecar, `session.fromPartition('persist:epicstore')` resolves
 * the sidecar's `{}` stub (electronStub.ts) which has no `clear*` methods, so the FIRST
 * `ses.clearStorageData()` call used to throw a TypeError and abort logout() before
 * `configStore.delete('userInfo')`/`clearCache('legendary')` ever ran — leaving the stored
 * profile behind despite CLI credential revocation succeeding.
 *
 * Mock boundaries:
 *  - electron                          -> session.fromPartition (electron-shaped)
 *  - backend/logger                    -> logInfo/logError/logWarning
 *  - ../../../utils                    -> clearCache
 *  - backend/constants/key_value_stores -> configStore
 *  - '..' (storeManagers/index)        -> libraryManagerMap['legendary'].runRunnerCommand
 *  - ../../../humble/userAgent         -> standardBrowserUserAgent (fixed string)
 *
 * `../../../humble/loginWindowSeam` is NOT mocked — it is a plain module-scoped holder +
 * pure classifier (no platform imports), so tests drive it directly via
 * `setLoginWindowSeam(seam | null)`/`getLoginWindowSeam()`, exactly as production code does.
 */

// ── electron mock ──────────────────────────────────────────────────────────────────────────
// NOTE: jest.config.js sets `resetMocks: true` project-wide, which strips BOTH the calls
// history AND any implementation (including one supplied at `jest.fn(impl)` construction time)
// before every test. All default behavior below is therefore (re-)established in `beforeEach`,
// never at module scope — see the "Re-arm default mock behavior" block.
const mockClearStorageData = jest.fn()
const mockClearCache = jest.fn()
const mockClearAuthCache = jest.fn()
const mockClearHostResolverCache = jest.fn()
const mockClearData = jest.fn()

// Default: a session object shaped like real Electron's Session (all 5 clear* methods
// present). Individual tests reassign this to simulate the sidecar's `{}` stub.
let mockFromPartitionReturn: Record<string, unknown> = {
  clearStorageData: mockClearStorageData,
  clearCache: mockClearCache,
  clearAuthCache: mockClearAuthCache,
  clearHostResolverCache: mockClearHostResolverCache,
  clearData: mockClearData
}

const mockFromPartition = jest.fn()

jest.mock('backend/platform', () => ({
  session: {
    fromPartition: (...args: unknown[]) => mockFromPartition(...args)
  }
}))

// `./constants` transitively pulls in `backend/constants/paths.ts`, which
// reads `app.getPath`/`app.getAppPath`/`app.isPackaged` at MODULE SCOPE
// (config-folder resolution + legacy-Heroic migration + `publicDir`
// anchoring) — none of it relevant to logout(), so the whole chain is
// mocked out rather than hand-stubbing electron's `app` surface.
jest.mock('../constants', () => ({
  legendaryUserInfo: '/tmp/gamelib-legendary-user-test/user.json'
}))

// ── backend/logger mock ───────────────────────────────────────────────────────────────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Legendary: 'Legendary',
    Backend: 'Backend'
  }
}))

// ── ../../../utils mock (clearCache) ──────────────────────────────────────────────────────
jest.mock('../../../utils', () => ({
  clearCache: jest.fn()
}))

// ── backend/constants/key_value_stores mock (configStore) ────────────────────────────────
const mockConfigStore = {
  get: jest.fn(),
  get_nodefault: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn()
}
jest.mock('backend/constants/key_value_stores', () => ({
  configStore: mockConfigStore
}))

// ── '..' mock (storeManagers/index -> libraryManagerMap) ─────────────────────────────────
const mockRunRunnerCommand = jest.fn()
jest.mock('../..', () => ({
  libraryManagerMap: {
    legendary: {
      runRunnerCommand: (...args: unknown[]) => mockRunRunnerCommand(...args)
    }
  }
}))

// ── ../../../humble/userAgent mock (standardBrowserUserAgent) ────────────────────────────
jest.mock('../../../humble/userAgent', () => ({
  standardBrowserUserAgent: () =>
    'Mozilla/5.0 (Test) Chrome/100.0 Safari/537.36'
}))

import { LegendaryUser } from '../user'
import { clearCache } from '../../../utils'
import { logError, logInfo, logWarning } from 'backend/logger'
import {
  setLoginWindowSeam,
  type LoginWindowSeam
} from '../../../humble/loginWindowSeam'

function makeMockSeam(
  overrides: Partial<LoginWindowSeam> = {}
): LoginWindowSeam & {
  open: jest.Mock
  clearCookies: jest.Mock
  close: jest.Mock
  clearStorage: jest.Mock
} {
  return {
    open: jest.fn().mockResolvedValue('window-label-1'),
    cookies: jest.fn(),
    cookiesForDomain: jest.fn(),
    takeEvents: jest.fn(),
    close: jest.fn().mockResolvedValue(true),
    clearCookies: jest.fn().mockResolvedValue(3),
    revealPost: jest.fn(),
    // Phase 34.4.1 gap-cycle plan 16 (F-6's verbatim twin): LoginWindowSeam
    // gained clearStorage in plan 15; logout()'s Tauri branch now calls it
    // (this task). Default a healthy, fully-numeric report.
    clearStorage: jest.fn().mockResolvedValue({
      localStorage: 0,
      sessionStorage: 0,
      indexedDB: 0,
      caches: 0,
      serviceWorkers: 0
    }),
    ...overrides
  } as LoginWindowSeam & {
    open: jest.Mock
    clearCookies: jest.Mock
    close: jest.Mock
    clearStorage: jest.Mock
  }
}

describe('LegendaryUser.logout()', () => {
  beforeEach(() => {
    // Re-arm default mock behavior. Jest's project-wide `resetMocks: true` (jest.config.js)
    // already stripped every mock's calls history AND implementation before this hook ran, so
    // everything the module-under-test needs a resolved value/return value for must be
    // (re-)established here, not relied on from module-scope `jest.fn(impl)`/`mockResolvedValue`
    // calls (those are stripped too).
    mockFromPartitionReturn = {
      clearStorageData: mockClearStorageData,
      clearCache: mockClearCache,
      clearAuthCache: mockClearAuthCache,
      clearHostResolverCache: mockClearHostResolverCache,
      clearData: mockClearData
    }
    mockFromPartition.mockImplementation(() => mockFromPartitionReturn)
    mockClearStorageData.mockResolvedValue(undefined)
    mockClearCache.mockResolvedValue(undefined)
    mockClearAuthCache.mockResolvedValue(undefined)
    mockClearHostResolverCache.mockResolvedValue(undefined)
    mockClearData.mockResolvedValue(undefined)
    setLoginWindowSeam(null)
    mockRunRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: undefined,
      abort: false
    })
  })

  afterEach(() => {
    setLoginWindowSeam(null)
  })

  it('REQ-34.5-04: the CLI-error early return is unchanged — no cookie step or configStore.delete runs', async () => {
    mockRunRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: 'boom',
      abort: false
    })

    await LegendaryUser.logout()

    expect(logError).toHaveBeenCalledWith(
      ['Failed to logout:', 'boom'],
      'Legendary'
    )
    expect(mockFromPartition).not.toHaveBeenCalled()
    expect(mockConfigStore.delete).not.toHaveBeenCalled()
    expect(clearCache).not.toHaveBeenCalled()
  })

  it('REQ-34.5-04 (T-34.5-19, the defect this task fixes): with a session object exposing no clear* methods, logout() does NOT throw and configStore.delete("userInfo") STILL runs', async () => {
    // Simulates electronStub.ts's session.fromPartition() stub under the sidecar: `{}`, no
    // clear* methods at all. Reverting the fix (removing the guarded step loop / moving
    // configStore.delete back above an unguarded call) makes this test fail with an unhandled
    // TypeError.
    mockFromPartitionReturn = {}

    await expect(LegendaryUser.logout()).resolves.toBeUndefined()

    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
    expect(clearCache).toHaveBeenCalledWith('legendary')
    expect(logWarning).toHaveBeenCalled()
  })

  it('REQ-34.5-04: asserts call ORDER — auth --delete runs before any cookie step, and cookie steps run before configStore.delete', async () => {
    const callOrder: string[] = []
    mockRunRunnerCommand.mockImplementation(async () => {
      callOrder.push('auth-delete')
      return { stdout: '', stderr: '', error: undefined, abort: false }
    })
    mockClearStorageData.mockImplementation(async () => {
      callOrder.push('clearStorageData')
    })
    mockConfigStore.delete.mockImplementation((key: string) => {
      callOrder.push(`configStore.delete:${key}`)
    })

    await LegendaryUser.logout()

    const authIdx = callOrder.indexOf('auth-delete')
    const cookieIdx = callOrder.indexOf('clearStorageData')
    const deleteIdx = callOrder.indexOf('configStore.delete:userInfo')

    expect(authIdx).toBeGreaterThanOrEqual(0)
    expect(cookieIdx).toBeGreaterThan(authIdx)
    expect(deleteIdx).toBeGreaterThan(cookieIdx)
  })

  it('REQ-34.5-04: with a full Electron-shaped session, all five clear calls run in order', async () => {
    const callOrder: string[] = []
    mockClearStorageData.mockImplementation(async () => {
      callOrder.push('clearStorageData')
    })
    mockClearCache.mockImplementation(async () => {
      callOrder.push('clearCache')
    })
    mockClearAuthCache.mockImplementation(async () => {
      callOrder.push('clearAuthCache')
    })
    mockClearHostResolverCache.mockImplementation(async () => {
      callOrder.push('clearHostResolverCache')
    })
    mockClearData.mockImplementation(async () => {
      callOrder.push('clearData')
    })

    await LegendaryUser.logout()

    expect(mockFromPartition).toHaveBeenCalledWith('persist:epicstore')
    expect(callOrder).toEqual([
      'clearStorageData',
      'clearCache',
      'clearAuthCache',
      'clearHostResolverCache',
      'clearData'
    ])
  })

  it('REQ-34.5-04 (T-34.5-20): with a seam installed, clearCookies is called with the Epic host and the window is closed even when the clear rejects', async () => {
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockRejectedValue(new Error('rust-side clear failed'))
    })
    setLoginWindowSeam(seam)

    // Phase 35 plan 09 (T-35-39): a FAILED cookie clear is now fatal to
    // logout()'s reported outcome — it used to resolve, swallowing the
    // failure. This test's original subject is unchanged and still asserted
    // below: the window is closed and the credential-side cleanup still runs
    // regardless.
    await expect(LegendaryUser.logout()).rejects.toThrow(
      'rust-side clear failed'
    )

    expect(mockFromPartition).not.toHaveBeenCalled()
    expect(seam.open).toHaveBeenCalledWith(
      expect.stringContaining('epicgames.com'),
      expect.objectContaining({ visible: false })
    )
    expect(seam.clearCookies).toHaveBeenCalledWith(
      'window-label-1',
      'epicgames.com'
    )
    expect(seam.close).toHaveBeenCalledWith('window-label-1')
    // Credential-side cleanup still ran despite the rejected clear.
    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
    expect(clearCache).toHaveBeenCalledWith('legendary')
  })

  it('REQ-34.5-04 (T-34.5-20): with a seam installed and a healthy clear, the domain passed is never a blanket/empty value', async () => {
    const seam = makeMockSeam()
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    const [, domainArg] = seam.clearCookies.mock.calls[0]
    expect(domainArg).toBe('epicgames.com')
    expect(domainArg).not.toBe('')
    // T-34.5-20: never a blanket clear — this repo-wide invariant is also grep-asserted at the
    // phase level against the forbidden Rust-side blanket-wipe method name (see 34.5-06-PLAN.md's
    // verification block).
  })

  // ── Phase 34.4.1 gap-cycle plan 16 (F-6's verbatim twin, BLOCKING closure) ──────────────
  // The Tauri wipeSteps array now has MORE THAN ONE entry — the same shape plan 16 closed in
  // humble/user.ts's disconnect(), mirrored here so the two test files can be diffed for parity.

  it('F-6 twin: the Tauri wipeSteps run BOTH a cookie step and a storage step (more than one entry)', async () => {
    const seam = makeMockSeam({
      clearStorage: jest.fn().mockResolvedValue({
        localStorage: 4,
        sessionStorage: 2,
        indexedDB: 1,
        caches: 0,
        serviceWorkers: 0
      })
    })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    expect(seam.clearCookies).toHaveBeenCalled()
    expect(seam.clearStorage).toHaveBeenCalledWith(
      expect.stringContaining('epicgames.com'),
      expect.any(String)
    )
  })

  it('F-6 twin: the credential-side cleanup runs even when BOTH the cookie step and the storage step reject', async () => {
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockRejectedValue(new Error('rust cookie clear failed')),
      clearStorage: jest
        .fn()
        .mockRejectedValue(new Error('rust storage clear failed'))
    })
    setLoginWindowSeam(seam)

    // Phase 35 plan 09: logout REJECTS now (the cookie step is fatal), but the
    // credential-side cleanup — this test's actual subject, T-34.5-19's
    // security boundary — still runs unconditionally before the rethrow.
    await expect(LegendaryUser.logout()).rejects.toThrow(
      'rust cookie clear failed'
    )

    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
    expect(clearCache).toHaveBeenCalledWith('legendary')
    // The NON-fatal storage step keeps its warn-and-continue behaviour.
    expect(logWarning).toHaveBeenCalled()
    // The fatal step is logged at ERROR, not merely warned about.
    expect(logError).toHaveBeenCalled()
  })

  it('F-6 twin: a rejecting clearStorage step still leaves logout() resolving, and the cookie step ran anyway', async () => {
    const seam = makeMockSeam({
      clearStorage: jest
        .fn()
        .mockRejectedValue(new Error('rust storage clear failed'))
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).resolves.toBeUndefined()

    expect(seam.clearCookies).toHaveBeenCalled()
    expect(logWarning).toHaveBeenCalled()
  })

  it('F-6 twin: a rejecting clearCookies step does not prevent the storage step from running', async () => {
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockRejectedValue(new Error('rust cookie clear failed'))
    })
    setLoginWindowSeam(seam)

    // Phase 35 plan 09: the fatal cookie step is captured and rethrown AFTER
    // the loop, so the remaining steps still run — that is this test's subject
    // and it survives the change intact.
    await expect(LegendaryUser.logout()).rejects.toThrow(
      'rust cookie clear failed'
    )

    expect(seam.clearStorage).toHaveBeenCalledWith(
      expect.stringContaining('epicgames.com'),
      expect.any(String)
    )
  })

  it('REQ-34.5-04: with a full Electron-shaped session, all five clear calls still run in order (unchanged by plan 16)', async () => {
    const callOrder: string[] = []
    mockClearStorageData.mockImplementation(async () => {
      callOrder.push('clearStorageData')
    })
    mockClearCache.mockImplementation(async () => {
      callOrder.push('clearCache')
    })
    mockClearAuthCache.mockImplementation(async () => {
      callOrder.push('clearAuthCache')
    })
    mockClearHostResolverCache.mockImplementation(async () => {
      callOrder.push('clearHostResolverCache')
    })
    mockClearData.mockImplementation(async () => {
      callOrder.push('clearData')
    })

    await LegendaryUser.logout()

    expect(callOrder).toEqual([
      'clearStorageData',
      'clearCache',
      'clearAuthCache',
      'clearHostResolverCache',
      'clearData'
    ])
  })

  // ── Phase 34.4.1 Plan 23 (F-6 Defect B): Epic's clearEpicCookies step is the second, ──────
  // already-shipped caller of the SAME humble_login_clear_cookies Rust arm humble/user.ts's
  // disconnect() uses. It carried Defect B verbatim since Phase 34.5 plan 06 and was never
  // independently verified -- these tests give it the same observability Humble already had.

  it('REQ-34.4.1-06 (Plan 23, F-6 Defect B): clearEpicCookies logs the measured count the clear returned', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(4)
    })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('cleared 4 epicgames.com cookie(s)'),
      'Legendary'
    )
    // States the count is a measured post-removal delta, not an attempted count.
    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('measured post-removal delta'),
      'Legendary'
    )
  })

  it('REQ-34.4.1-06 (Plan 23, F-6 Defect B) / T-35-39: a clearCookies total of 0 FAILS the logout (it used to be a swallowed warning)', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    // Phase 35 plan 09 (operator decision D-09-CORRECTED): this used to
    // `logWarning('... removed nothing for epicgames.com')` and let the wipe
    // loop swallow it, which is the defect class that produced the original
    // lying self-report. It is now a rejection.
    await expect(LegendaryUser.logout()).rejects.toThrow(
      /removed nothing across all 5 Epic-owned domains/
    )

    // The credential-side security boundary still ran (T-34.5-19).
    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
    expect(clearCache).toHaveBeenCalledWith('legendary')
  })

  it('REQ-34.4.1-06 (Plan 23, F-6 Defect B) / T-35-39: a healthy non-zero total resolves and warns about nothing', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(2)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).resolves.toBeUndefined()

    const removedNothingCall = (logWarning as jest.Mock).mock.calls.find((c) =>
      String(c[0]).includes('removed nothing')
    )
    expect(removedNothingCall).toBeUndefined()
    expect(logError).not.toHaveBeenCalled()
  })
})
