/**
 * `humbleUser.probeSession()` -- the Humble boot sign-in probe (Phase 49,
 * 49-06, D-15 / D-18).
 *
 * The probe does the `humble-session` read plus `getGamekeys` and nothing else:
 * it never reads the `humble-csrf` slot, never opens the hidden csrf-backfill
 * login window (P2), and writes and pushes nothing -- 49-08's pass applies the
 * verdict. Only `session_expired` is `expired`; an unreadable or absent slot,
 * a thrown request and every other status are `unknown` (P1, 260822-vov, A9).
 */

import { createTestSignInProbe } from 'backend/testUtils/testSignInProbe'
import type { HumbleSecretKey } from '../secretStore'

type ReadOutcome =
  | { status: 'present'; token: string }
  | { status: 'absent' }
  | { status: 'unreadable'; reason: string }

const SECRET_COOKIE = 'probe-session-cookie-xyz'

const mockConfigStore = {
  get: jest.fn(),
  get_nodefault: jest.fn(),
  set: jest.fn(),
  clear: jest.fn(),
  delete: jest.fn()
}
const mockLogWarning = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: { Backend: 'Backend' }
}))

const mockSendFrontendMessage = jest.fn()

const mockGetGamekeys = jest.fn()
jest.mock('../adapter', () => ({
  getGamekeys: (...args: unknown[]) => mockGetGamekeys(...args)
}))
const mockGetLoginWindowSeamOrThrow = jest.fn()

const mockReadSecret = jest.fn<
  Promise<ReadOutcome>,
  [HumbleSecretKey, string?]
>()
const mockGetSecret = jest.fn<Promise<string>, [HumbleSecretKey]>()
let mockStore: Record<string, unknown> = {}

import { HumbleUser } from '../user'

const sendFrontendMessage = (...args: unknown[]) =>
  mockSendFrontendMessage(...args)

// The user reads the CURRENT `mockStore` through this forwarding object, so a describe can swap the
// store's shape (with or without `readSecret`) after the user is built.
const secretStore = new Proxy(
  {},
  { get: (_target, prop) => mockStore[prop as string] }
) as never

const humbleUser = new HumbleUser({
  sendFrontendMessage,
  stores: {
    humble: {
      configStore: mockConfigStore,
      humbleLibraryStore: { clear: jest.fn() },
      humbleSyncStore: { clear: jest.fn() },
      humbleRevealedStore: { clear: jest.fn() }
    }
  } as never,
  secretStore,
  loginWindowSeam: { getOrThrow: () => mockGetLoginWindowSeamOrThrow() },
  syncFence: { invalidate: jest.fn() },
  signInOutcomes: createTestSignInProbe().outcomes,
  appInfo: { userAgentFallback: 'Mozilla/5.0 (X11; Linux) Chrome/1.0' }
})

function installStoreWithReadSecret(): void {
  mockStore = {
    readSecret: mockReadSecret,
    getSecret: mockGetSecret,
    setSecret: jest.fn(),
    clearSecrets: jest.fn(),
    isAvailable: jest.fn()
  }
}

function expectNoSideEffects(): void {
  expect(mockConfigStore.set).not.toHaveBeenCalled()
  expect(mockConfigStore.delete).not.toHaveBeenCalled()
  expect(mockConfigStore.clear).not.toHaveBeenCalled()
  expect(mockSendFrontendMessage).not.toHaveBeenCalled()
  expect(mockGetLoginWindowSeamOrThrow).not.toHaveBeenCalled()
}

function csrfReads(): unknown[][] {
  return [...mockReadSecret.mock.calls, ...mockGetSecret.mock.calls].filter(
    (c) => c[0] === 'csrfToken'
  )
}

describe('HumbleUser.probeSession', () => {
  beforeEach(() => {
    installStoreWithReadSecret()
  })

  describe('verdict mapping', () => {
    beforeEach(() => {
      mockReadSecret.mockResolvedValue({
        status: 'present',
        token: SECRET_COOKIE
      })
    })

    it('ok is healthy', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: ['k1'] })
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'healthy'
      )
    })

    it('session_expired is the only expired verdict', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'expired'
      )
    })

    it('access_denied (403 / 429 backoff) is unknown', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'access_denied' })
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'unknown'
      )
    })

    it('schema_error is unknown', async () => {
      mockGetGamekeys.mockResolvedValue({ status: 'schema_error', raw: {} })
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'unknown'
      )
    })

    it('a thrown getGamekeys (offline start) is unknown, never expired', async () => {
      mockGetGamekeys.mockRejectedValue(new Error('ECONNREFUSED'))
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'unknown'
      )
    })

    it('a thrown getGamekeys never logs the cookie', async () => {
      mockGetGamekeys.mockRejectedValue(new Error('ECONNREFUSED'))
      await humbleUser.probeSession('boot-probe')
      for (const call of mockLogWarning.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SECRET_COOKIE)
      }
    })
  })

  describe('the session slot read', () => {
    it('an unreadable read is unknown and getGamekeys is not called', async () => {
      mockReadSecret.mockResolvedValue({
        status: 'unreadable',
        reason: 'denied'
      })
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'unknown'
      )
      expect(mockGetGamekeys).not.toHaveBeenCalled()
    })

    it('a timed-out read is unknown and getGamekeys is not called', async () => {
      mockReadSecret.mockResolvedValue({
        status: 'unreadable',
        reason: 'timeout'
      })
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'unknown'
      )
      expect(mockGetGamekeys).not.toHaveBeenCalled()
    })

    it('an absent slot is unknown (A9: an empty slot behind a connected flag is not proof of expiry)', async () => {
      mockReadSecret.mockResolvedValue({ status: 'absent' })
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'unknown'
      )
      expect(mockGetGamekeys).not.toHaveBeenCalled()
    })

    it('a thrown readSecret is unknown', async () => {
      mockReadSecret.mockRejectedValue(new Error('rpc closed'))
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'unknown'
      )
      expect(mockGetGamekeys).not.toHaveBeenCalled()
    })

    it('reads the session slot exactly once, with the caller context', async () => {
      mockReadSecret.mockResolvedValue({
        status: 'present',
        token: SECRET_COOKIE
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: [] })

      await humbleUser.probeSession('boot-probe')

      expect(mockReadSecret).toHaveBeenCalledTimes(1)
      expect(mockReadSecret).toHaveBeenCalledWith('sessionCookie', 'boot-probe')
      expect(mockGetSecret).not.toHaveBeenCalled()
      expect(mockGetGamekeys).toHaveBeenCalledWith(SECRET_COOKIE)
    })

    it('forwards a different context verbatim', async () => {
      mockReadSecret.mockResolvedValue({ status: 'absent' })
      await humbleUser.probeSession('humble-health-check')
      expect(mockReadSecret).toHaveBeenCalledWith(
        'sessionCookie',
        'humble-health-check'
      )
    })
  })

  describe('a store without readSecret (dev-vault shape)', () => {
    beforeEach(() => {
      mockStore = {
        getSecret: mockGetSecret,
        setSecret: jest.fn(),
        clearSecrets: jest.fn(),
        isAvailable: jest.fn()
      }
    })

    it("falls back to getSecret and treats '' as unknown", async () => {
      mockGetSecret.mockResolvedValue('')
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'unknown'
      )
      expect(mockGetSecret).toHaveBeenCalledTimes(1)
      expect(mockGetSecret).toHaveBeenCalledWith('sessionCookie')
      expect(mockGetGamekeys).not.toHaveBeenCalled()
    })

    it('falls back to getSecret and decides from getGamekeys when a cookie is present', async () => {
      mockGetSecret.mockResolvedValue(SECRET_COOKIE)
      mockGetGamekeys.mockResolvedValue({ status: 'session_expired' })
      await expect(humbleUser.probeSession('boot-probe')).resolves.toBe(
        'expired'
      )
    })
  })

  describe('what the probe must never do (D-18, P2, P3)', () => {
    const cases: Array<[string, ReadOutcome, unknown]> = [
      [
        'healthy',
        { status: 'present', token: SECRET_COOKIE },
        { status: 'ok', data: [] }
      ],
      [
        'expired',
        { status: 'present', token: SECRET_COOKIE },
        { status: 'session_expired' }
      ],
      ['absent', { status: 'absent' }, undefined],
      ['unreadable', { status: 'unreadable', reason: 'denied' }, undefined]
    ]

    it.each(cases)(
      'case %s: no csrf read, no hidden webview, no store write, no push',
      async (_name, readOutcome, gamekeys) => {
        mockReadSecret.mockResolvedValue(readOutcome)
        if (gamekeys) mockGetGamekeys.mockResolvedValue(gamekeys)

        await humbleUser.probeSession('boot-probe')

        expect(csrfReads()).toHaveLength(0)
        expectNoSideEffects()
      }
    )

    it('healthy with no stored csrf token still opens no webview (the backfill is not part of the probe)', async () => {
      mockReadSecret.mockResolvedValue({
        status: 'present',
        token: SECRET_COOKIE
      })
      mockGetGamekeys.mockResolvedValue({ status: 'ok', data: [] })
      mockGetSecret.mockResolvedValue('')

      await humbleUser.probeSession('boot-probe')

      expect(mockGetLoginWindowSeamOrThrow).not.toHaveBeenCalled()
      expect(csrfReads()).toHaveLength(0)
    })
  })
})
