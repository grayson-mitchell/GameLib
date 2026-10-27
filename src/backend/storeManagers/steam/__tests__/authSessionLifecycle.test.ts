/**
 * Phase 54 (54-03): the authenticated CM session lifecycle in SteamUser.
 *
 * Every authenticated cold connect runs inside withMacSteamOffline, the client
 * is built with autoRelogin false, a post-logon drop ENDS the session (it is
 * never silently re-logged on), and a logon that is still in flight at the
 * bound is abandoned before the wrap fires goonline.
 *
 * Mock boundaries: steam-user (EventEmitter-backed fake), ./macSteamOffline,
 * ./anonymousClient, ../tokenStore, backend/signInProbe/*, backend/ipc.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('backend/platform', () => ({
  safeStorage: {},
  app: { getPath: jest.fn(() => '/tmp/test') }
}))

jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn(),
  addHandler: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('graceful-fs', () => ({ existsSync: jest.fn(() => false) }))

const mockConfigStore = {
  get: jest.fn(),
  get_nodefault: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn()
}
jest.mock('../electronStores', () => ({ configStore: mockConfigStore }))

const mockReadTokenOutcome = jest.fn()
const mockTokenStore = {
  getToken: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
  isAvailable: jest.fn()
}
jest.mock('../tokenStore', () => ({
  getTokenStore: () => mockTokenStore,
  readTokenOutcome: (...args: unknown[]) => mockReadTokenOutcome(...args)
}))

jest.mock('../authTrigger', () => ({
  currentTriggerLabel: () => 'user-refresh',
  noteSteamAuthTrigger: jest.fn()
}))

const mockApplySignInVerdict = jest.fn()
jest.mock('backend/signInProbe/verdict', () => ({
  applySignInVerdict: (...args: unknown[]) => mockApplySignInVerdict(...args)
}))
jest.mock('backend/signInProbe/outcomes', () => ({
  noteSignInSucceeded: jest.fn(),
  noteSignedOut: jest.fn(),
  publishSignInProbeOutcomes: jest.fn(),
  recordSignInProbeOutcome: jest.fn()
}))

jest.mock('steam-session', () => ({
  LoginSession: jest.fn(),
  EAuthTokenPlatformType: { SteamClient: 2 }
}))

jest.mock('steam-user', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EventEmitter } = require('events')
  class FakeSteamUser extends EventEmitter {
    static instances: FakeSteamUser[] = []
    static ctorOpts: unknown[] = []
    // 'loggedOn' (default) | 'hang' | { error: eresult }
    static behaviour: any = 'loggedOn'
    static EPurchaseResult = {
      Unknown: -1,
      OK: 0,
      AlreadyOwned: 9,
      OnCooldown: 53
    }
    steamID: any = null
    cellID = 1
    publicIP = '203.0.113.1'
    logOn = jest.fn(() => {
      const behaviour = FakeSteamUser.behaviour
      if (behaviour === 'hang') return
      Promise.resolve().then(() => {
        if (behaviour === 'loggedOn') {
          this.steamID = { getSteamID64: () => '76561198000000000' }
          this.emit('loggedOn')
        } else {
          const err: any = new Error('AccessDenied')
          err.eresult = behaviour.error
          this.emit('error', err)
        }
      })
    })
    logOff = jest.fn()
    relog = jest.fn()
    getProductInfo = jest.fn().mockResolvedValue({ apps: {} })
    getPersonas = jest.fn().mockResolvedValue({ personas: {} })
    redeemKey = jest.fn()
    constructor(opts: unknown) {
      super()
      FakeSteamUser.instances.push(this)
      FakeSteamUser.ctorOpts.push(opts)
    }
  }
  return FakeSteamUser
})

const mockRestoreMacSteamOnlineIfOwed = jest.fn()
jest.mock('../macSteamOffline', () => {
  class GuidedOfflineRequiredError extends Error {
    cause: string
    constructor(cause: string) {
      super('guided')
      this.name = 'GuidedOfflineRequiredError'
      this.cause = cause
    }
  }
  return {
    withMacSteamOffline: jest.fn(),
    GuidedOfflineRequiredError,
    restoreMacSteamOnlineIfOwed: (...args: unknown[]) =>
      mockRestoreMacSteamOnlineIfOwed(...args)
  }
})

const mockReleaseAnonymousForShutdown = jest.fn()
const mockCloseAnonymousClient = jest.fn()
jest.mock('../anonymousClient', () => ({
  closeAnonymousClient: (...args: unknown[]) =>
    mockCloseAnonymousClient(...args),
  releaseAnonymousForShutdown: () => mockReleaseAnonymousForShutdown()
}))

import { SteamUser } from '../user'
import { logInfo, logWarning } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'

const FakeLib = jest.requireMock('steam-user') as any
const macMock = jest.requireMock('../macSteamOffline') as any

const internals = SteamUser as unknown as Record<string, any>

function instances(): any[] {
  return FakeLib.instances
}

function logInfoLines(): string[] {
  return (logInfo as jest.Mock).mock.calls.map((c) => String(c[0]))
}

function resetSteamUserState(): void {
  internals.client = null
  internals.connectingPromise = null
  internals.shuttingDown = false
  internals.logonFailure = null
  internals.leaseCount = 0
  if (internals.idleTimer) clearTimeout(internals.idleTimer)
  internals.idleTimer = null
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  FakeLib.instances = []
  FakeLib.ctorOpts = []
  FakeLib.behaviour = 'loggedOn'
  mockRestoreMacSteamOnlineIfOwed.mockImplementation(async () => 'not-owed')
  macMock.withMacSteamOffline.mockImplementation(
    async (connect: (wrap: string) => Promise<unknown>) => ({
      value: await connect('toggled'),
      wrap: 'toggled'
    })
  )
  mockConfigStore.get_nodefault.mockImplementation((key: string) =>
    key === 'isLoggedIn' ? true : undefined
  )
  mockReadTokenOutcome.mockResolvedValue({
    status: 'present',
    token: 'secret-refresh-token'
  })
  resetSteamUserState()
})

afterEach(() => {
  resetSteamUserState()
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('authenticated connect lifecycle', () => {
  it('builds the client with autoRelogin false and no PICS cache', async () => {
    expect(await SteamUser.ensureConnected()).toBe(true)
    expect(FakeLib.ctorOpts).toHaveLength(1)
    expect(FakeLib.ctorOpts[0]).toEqual(
      expect.objectContaining({ autoRelogin: false, enablePicsCache: false })
    )
  })

  it('runs one wrap per cold connect and logs on only inside it', async () => {
    const order: string[] = []
    macMock.withMacSteamOffline.mockImplementation(
      async (connect: (wrap: string) => Promise<unknown>) => {
        order.push('wrap-enter')
        const value = await connect('toggled')
        order.push('wrap-exit')
        return { value, wrap: 'toggled' }
      }
    )
    await SteamUser.ensureConnected()
    // logOn recorded relative to the wrap via the constructed instance
    expect(macMock.withMacSteamOffline).toHaveBeenCalledTimes(1)
    expect(instances()).toHaveLength(1)
    expect(instances()[0].logOn).toHaveBeenCalledTimes(1)
    expect(instances()[0].logOn).toHaveBeenCalledWith({
      refreshToken: 'secret-refresh-token'
    })
    expect(order).toEqual(['wrap-enter', 'wrap-exit'])
  })

  it('a wrap refusal means no client and no logOn', async () => {
    macMock.withMacSteamOffline.mockRejectedValue(
      new macMock.GuidedOfflineRequiredError('logoff-not-seen')
    )
    expect(await internals.ensureAuthenticatedSession('user-refresh')).toBe(
      'go-offline-required'
    )
    expect(instances()).toHaveLength(0)
    expect(await SteamUser.ensureConnected()).toBe(false)
    expect(instances()).toHaveLength(0)
  })

  it('a stale canary ends the old client and re-enters the wrapped connect, never relog()', async () => {
    expect(await SteamUser.ensureConnected()).toBe(true)
    const first = instances()[0]
    first.getProductInfo.mockRejectedValue(new Error('stale'))

    expect(await SteamUser.ensureConnected()).toBe(true)

    expect(first.relog).not.toHaveBeenCalled()
    expect(first.logOff).toHaveBeenCalled()
    expect(instances()).toHaveLength(2)
    expect(macMock.withMacSteamOffline).toHaveBeenCalledTimes(2)
    expect(instances()[1].relog).not.toHaveBeenCalled()
  })

  it('a post-logon error ends the session without throwing, and the next call logs on again through the wrap', async () => {
    await SteamUser.ensureConnected()
    const first = instances()[0]
    first.steamID = null
    const err: any = new Error('NoConnection')
    err.eresult = 3

    expect(() => first.emit('error', err)).not.toThrow()

    expect(SteamUser.getClient()).toBeNull()
    expect(logInfoLines()).toContain(
      '[Steam] CM session closed mode=authenticated cause=error'
    )
    expect(await SteamUser.ensureConnected()).toBe(true)
    expect(macMock.withMacSteamOffline).toHaveBeenCalledTimes(2)
    expect(instances()).toHaveLength(2)
  })

  it('a post-logon disconnect ends the session too', async () => {
    await SteamUser.ensureConnected()
    instances()[0].emit('disconnected', 1, 'gone')
    expect(SteamUser.getClient()).toBeNull()
    expect(logInfoLines()).toContain(
      '[Steam] CM session closed mode=authenticated cause=disconnected'
    )
  })

  it('abandons a logon still in flight at 35000 ms with logOff before the wrap returns', async () => {
    FakeLib.behaviour = 'hang'
    let wrapReturned = false
    macMock.withMacSteamOffline.mockImplementation(
      async (connect: (wrap: string) => Promise<unknown>) => {
        const value = await connect('toggled')
        wrapReturned = true
        return { value, wrap: 'toggled' }
      }
    )
    const pending = internals.ensureAuthenticatedSession('user-refresh')
    await jest.advanceTimersByTimeAsync(34999)
    expect(wrapReturned).toBe(false)
    expect(instances()[0].logOff).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(1)

    expect(await pending).toBe('client-not-ready')
    expect(instances()[0].logOff).toHaveBeenCalled()
    expect(wrapReturned).toBe(true)
    expect(SteamUser.getClient()).toBeNull()
  })

  it('maps a CM credential refusal to logon-rejected and reports an expired verdict', async () => {
    FakeLib.behaviour = { error: 15 }
    expect(await internals.ensureAuthenticatedSession('user-refresh')).toBe(
      'logon-rejected'
    )
    expect(mockApplySignInVerdict).toHaveBeenCalledWith(
      'steam',
      'expired',
      expect.anything()
    )
  })

  it('a refusal that is not about the credential reports no verdict', async () => {
    FakeLib.behaviour = { error: 34 }
    expect(await internals.ensureAuthenticatedSession('user-refresh')).toBe(
      'logon-rejected'
    )
    expect(mockApplySignInVerdict).not.toHaveBeenCalledWith(
      'steam',
      'expired',
      expect.anything()
    )
  })

  it('not signed in -> not-signed-in, no keyring read', async () => {
    mockConfigStore.get_nodefault.mockReturnValue(undefined)
    expect(await internals.ensureAuthenticatedSession('user-refresh')).toBe(
      'not-signed-in'
    )
    expect(mockReadTokenOutcome).not.toHaveBeenCalled()
  })

  it('unreadable keyring -> token-unreadable with the pinned wording', async () => {
    mockReadTokenOutcome.mockResolvedValue({
      status: 'unreadable',
      reason: 'timeout'
    })
    expect(await internals.ensureAuthenticatedSession('user-refresh')).toBe(
      'token-unreadable'
    )
    const text = (logWarning as jest.Mock).mock.calls
      .map((c) => String(c[0]))
      .join('\n')
    expect(text).toContain('refresh token read failed (timeout)')
    expect(text).not.toContain('no stored refresh token')
    expect(mockConfigStore.set).not.toHaveBeenCalledWith(
      'credentialsMissing',
      true
    )
  })

  it('absent keyring -> token-absent and credentialsMissing latched', async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'absent' })
    expect(await internals.ensureAuthenticatedSession('user-refresh')).toBe(
      'token-absent'
    )
    expect(mockConfigStore.set).toHaveBeenCalledWith('credentialsMissing', true)
  })

  it('logs the logon mode line, with reason and wrap kind and no token, immediately before logOn', async () => {
    await internals.ensureAuthenticatedSession('user-refresh')
    const line = logInfoLines().find((l) => l.includes('CM logon mode='))
    expect(line).toMatch(
      /^\[Steam\] CM logon mode=authenticated reason=user-refresh wrap=toggled$/
    )
    const lineOrder = (logInfo as jest.Mock).mock.invocationCallOrder[
      logInfoLines().indexOf(line as string)
    ]
    expect(lineOrder).toBeLessThan(
      instances()[0].logOn.mock.invocationCallOrder[0]
    )
    expect(logInfoLines().join('\n')).not.toContain('secret-refresh-token')
  })
})

describe('authenticated session lease', () => {
  const acquire = (
    opts: Record<string, unknown> = { reason: 'user-install' }
  ) => (SteamUser as any).acquireAuthenticated(opts)

  it('two concurrent acquires share one client and one logOn', async () => {
    const [a, b] = await Promise.all([acquire(), acquire()])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(a.client).toBe(b.client)
    expect(instances()).toHaveLength(1)
    expect(instances()[0].logOn).toHaveBeenCalledTimes(1)
    expect(instances()[0].logOn).toHaveBeenCalledWith({
      refreshToken: 'secret-refresh-token'
    })
  })

  it('a wrap refusal returns go-offline-required and pushes the guided action once', async () => {
    macMock.withMacSteamOffline.mockRejectedValue(
      new macMock.GuidedOfflineRequiredError('logoff-not-seen')
    )
    const lease = await acquire({
      reason: 'user-install',
      guidedAction: 'install',
      appName: '230070'
    })
    expect(lease).toEqual({ ok: false, reason: 'go-offline-required' })
    expect(sendFrontendMessage).toHaveBeenCalledWith('steamGoOfflineRequired', {
      action: 'install',
      appName: '230070'
    })
    expect(sendFrontendMessage).toHaveBeenCalledTimes(1)
  })

  it('a wrap refusal without a guidedAction pushes nothing', async () => {
    macMock.withMacSteamOffline.mockRejectedValue(
      new macMock.GuidedOfflineRequiredError('running-probe-failed')
    )
    const lease = await acquire({ reason: 'prescreen' })
    expect(lease).toEqual({ ok: false, reason: 'go-offline-required' })
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })

  it('callers sharing one in-flight refused connect push at most once each', async () => {
    macMock.withMacSteamOffline.mockRejectedValue(
      new macMock.GuidedOfflineRequiredError('logoff-not-seen')
    )
    await Promise.all([
      acquire({ reason: 'user-install', guidedAction: 'install' }),
      acquire({ reason: 'user-install', guidedAction: 'install' })
    ])
    const pushes = (sendFrontendMessage as jest.Mock).mock.calls.length
    expect(pushes).toBeGreaterThanOrEqual(1)
    expect(pushes).toBeLessThanOrEqual(2)
  })

  it('release is idempotent; the last release closes the session after 60000 ms idle', async () => {
    const a = await acquire()
    const b = await acquire()
    const client = instances()[0]
    a.release()
    a.release()
    b.release()
    await jest.advanceTimersByTimeAsync(59999)
    expect(client.logOff).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(client.logOff).toHaveBeenCalledTimes(1)
    expect(SteamUser.getClient()).toBeNull()
    expect(logInfoLines()).toContain(
      '[Steam] CM session closed mode=authenticated cause=idle'
    )
  })

  it('an acquire inside the grace window cancels the timer and does not log on again', async () => {
    const a = await acquire()
    a.release()
    await jest.advanceTimersByTimeAsync(30000)
    const b = await acquire()
    expect(b.ok).toBe(true)
    await jest.advanceTimersByTimeAsync(60000)
    expect(instances()[0].logOff).not.toHaveBeenCalled()
    expect(instances()[0].logOn).toHaveBeenCalledTimes(1)
    expect(instances()).toHaveLength(1)
  })

  it('a refused acquire leaves the lease count unchanged', async () => {
    mockConfigStore.get_nodefault.mockReturnValue(undefined)
    expect(await acquire()).toEqual({ ok: false, reason: 'not-signed-in' })
    expect(internals.leaseCount).toBe(0)

    mockConfigStore.get_nodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )
    const ok = await acquire()
    expect(internals.leaseCount).toBe(1)
    ok.release()
    expect(internals.leaseCount).toBe(0)
    await jest.advanceTimersByTimeAsync(60000)
    expect(instances()[0].logOff).toHaveBeenCalledTimes(1)
  })

  it('acquireOpenAuthenticated is null with no session and never reads the keyring or logs on', () => {
    expect(SteamUser.acquireOpenAuthenticated('shared-redist')).toBeNull()
    expect(mockReadTokenOutcome).not.toHaveBeenCalled()
    expect(instances()).toHaveLength(0)
  })

  it('acquireOpenAuthenticated reuses an open session and cancels the idle timer', async () => {
    const a = await acquire()
    a.release()
    const open = SteamUser.acquireOpenAuthenticated('shared-redist')
    expect(open).not.toBeNull()
    expect(open?.client).toBe(a.client)
    await jest.advanceTimersByTimeAsync(120000)
    expect(instances()[0].logOff).not.toHaveBeenCalled()
    open?.release()
    await jest.advanceTimersByTimeAsync(60000)
    expect(instances()[0].logOff).toHaveBeenCalledTimes(1)
    expect(instances()).toHaveLength(1)
  })

  it('a bare ensureConnected opens the session without arming an idle timer', async () => {
    expect(await SteamUser.ensureConnected()).toBe(true)
    await jest.advanceTimersByTimeAsync(120000)
    expect(instances()[0].logOff).not.toHaveBeenCalled()
    expect(SteamUser.getClient()).not.toBeNull()
  })

  it('releaseForShutdown closes both clients, clears the timer and refuses later acquires', async () => {
    const a = await acquire()
    a.release()
    SteamUser.releaseForShutdown()
    expect(instances()[0].logOff).toHaveBeenCalled()
    expect(mockReleaseAnonymousForShutdown).toHaveBeenCalledTimes(1)
    expect(internals.idleTimer).toBeNull()
    expect(await acquire()).toEqual({ ok: false, reason: 'shutting-down' })
    expect(instances()).toHaveLength(1)
  })

  it('releaseForShutdown releases the anonymous client even with no authenticated client', () => {
    SteamUser.releaseForShutdown()
    expect(mockReleaseAnonymousForShutdown).toHaveBeenCalledTimes(1)
  })

  it('releaseForShutdown pays the owed goonline after logOff', async () => {
    const a = await acquire()
    a.release()
    SteamUser.releaseForShutdown()
    expect(mockRestoreMacSteamOnlineIfOwed).toHaveBeenCalledWith('shutdown')
    expect(instances()[0].logOff.mock.invocationCallOrder[0]).toBeLessThan(
      mockRestoreMacSteamOnlineIfOwed.mock.invocationCallOrder[0]
    )
  })

  it('releaseForShutdown still restores exactly once with no authenticated client', () => {
    SteamUser.releaseForShutdown()
    expect(mockRestoreMacSteamOnlineIfOwed).toHaveBeenCalledTimes(1)
    expect(mockRestoreMacSteamOnlineIfOwed).toHaveBeenCalledWith('shutdown')
  })

  it('releaseForShutdown still restores when logOff throws', async () => {
    const a = await acquire()
    a.release()
    instances()[0].logOff.mockImplementation(() => {
      throw new Error('boom')
    })
    SteamUser.releaseForShutdown()
    expect(mockRestoreMacSteamOnlineIfOwed).toHaveBeenCalledTimes(1)
  })

  it('releaseForShutdown resolves to the restore outcome', async () => {
    mockRestoreMacSteamOnlineIfOwed.mockImplementation(async () => 'restored')
    await expect(SteamUser.releaseForShutdown()).resolves.toBe('restored')
  })

  it('getPersistedSteamId64 returns a numeric stored id and undefined otherwise', () => {
    const store = (steamId: unknown) =>
      mockConfigStore.get_nodefault.mockImplementation((key: string) =>
        key === 'userData' ? { username: 'x', steamId } : undefined
      )
    store('76561198000000000')
    expect((SteamUser as any).getPersistedSteamId64()).toBe('76561198000000000')
    store('')
    expect((SteamUser as any).getPersistedSteamId64()).toBeUndefined()
    store('not-a-number')
    expect((SteamUser as any).getPersistedSteamId64()).toBeUndefined()
    mockConfigStore.get_nodefault.mockReturnValue(undefined)
    expect((SteamUser as any).getPersistedSteamId64()).toBeUndefined()
  })
})
