/**
 * 66.3-16 (D-05, Pitfall 10): the per-instance SteamUser session state. Every case builds a fresh
 * instance, so single-flight connect, the idle timer on the injected clock, the shutdown latch and
 * the generation fence are proven per instance, never through module state.
 *
 * Mock boundaries: steam-user (EventEmitter-backed fake), ../tokenStore, backend/logger, backend/ipc.
 */

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

const mockReadTokenOutcome = jest.fn()
jest.mock('../tokenStore', () => ({
  getTokenStore: () => ({ clearToken: jest.fn() }),
  readTokenOutcome: (...args: unknown[]) => mockReadTokenOutcome(...args)
}))
jest.mock('backend/signInProbe/verdict', () => ({
  applySignInVerdict: jest.fn(() => 'unchanged')
}))
jest.mock('steam-session', () => ({
  LoginSession: jest.fn(),
  EAuthTokenPlatformType: { SteamClient: 2 }
}))

jest.mock('steam-user', () => {
  const { EventEmitter } = jest.requireActual<typeof import('events')>('events')
  class FakeSteamUser extends EventEmitter {
    static instances: FakeSteamUser[] = []
    static autoLogon = true
    steamID: unknown = null
    cellID = 1
    publicIP = '203.0.113.1'
    logOn = jest.fn(() => {
      if (!FakeSteamUser.autoLogon) return
      Promise.resolve().then(() => this.completeLogon())
    })
    logOff = jest.fn()
    getProductInfo = jest.fn().mockResolvedValue({ apps: {} })
    completeLogon() {
      this.steamID = { getSteamID64: () => '76561198000000000' }
      this.emit('loggedOn')
    }
    constructor() {
      super()
      FakeSteamUser.instances.push(this)
    }
  }
  return FakeSteamUser
})

import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createTestSteamUser } from 'backend/testUtils/testSteamUser'
import { AUTH_SESSION_IDLE_GRACE_MS } from '../userTypes'

interface FakeLogonClient {
  logOn: jest.Mock
  logOff: jest.Mock
  completeLogon(): void
}
const FakeLib = jest.requireMock('steam-user') as {
  instances: FakeLogonClient[]
  autoLogon: boolean
}

const stores = {
  steam: {
    configStore: {
      get_nodefault: (key: string) => (key === 'isLoggedIn' ? true : undefined),
      set: jest.fn(),
      delete: jest.fn()
    }
  }
} as never

function build(overrides: Record<string, unknown> = {}) {
  const clock = createFakeClock()
  const withMacSteamOffline = jest.fn(
    async (connect: (wrap: string) => Promise<void>) => ({
      value: await connect('not-darwin'),
      wrap: 'not-darwin'
    })
  )
  const steamUser = createTestSteamUser({
    stores,
    clock,
    macSteamOffline: {
      withMacSteamOffline,
      restoreMacSteamOnlineIfOwed: () => Promise.resolve('not-owed')
    } as never,
    ...overrides
  } as never)
  return { steamUser, clock, withMacSteamOffline }
}

beforeEach(() => {
  FakeLib.instances.length = 0
  FakeLib.autoLogon = true
  mockReadTokenOutcome.mockResolvedValue({ status: 'present', token: 'tok' })
})

describe('SteamUser instance state (66.3-16)', () => {
  it('two concurrent acquires on one instance share one connect (single-flight)', async () => {
    const { steamUser, withMacSteamOffline } = build()
    const [a, b] = await Promise.all([
      steamUser.acquireAuthenticated({ reason: 'user-refresh' }),
      steamUser.acquireAuthenticated({ reason: 'user-refresh' })
    ])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(withMacSteamOffline).toHaveBeenCalledTimes(1)
    expect(FakeLib.instances).toHaveLength(1)
    expect(FakeLib.instances[0]?.logOn).toHaveBeenCalledTimes(1)
  })

  it('arms the idle timer on the injected clock (unref by default) and logs off when it fires', async () => {
    const { steamUser, clock } = build()
    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })
    if (!lease.ok) throw new Error('lease refused')
    expect(clock.pendingCount()).toBe(0)
    lease.release()
    expect(clock.pendingCount()).toBe(1)
    clock.assertNoKeepAlive()
    clock.advance(AUTH_SESSION_IDLE_GRACE_MS)
    expect(FakeLib.instances[0]?.logOff).toHaveBeenCalledTimes(1)
    expect(steamUser.getClient()).toBeNull()
  })

  it('releaseForShutdown logs off, latches shutting-down and opens no new connect', async () => {
    const { steamUser } = build()
    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })
    expect(lease.ok).toBe(true)
    await steamUser.releaseForShutdown()
    expect(FakeLib.instances[0]?.logOff).toHaveBeenCalled()
    const after = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })
    expect(after).toEqual({ ok: false, reason: 'shutting-down' })
    expect(FakeLib.instances).toHaveLength(1)
  })

  it('abandons a logon that resolves after logout bumped the session generation', async () => {
    FakeLib.autoLogon = false
    const { steamUser } = build()
    const pending = steamUser.acquireAuthenticated({ reason: 'user-refresh' })
    await new Promise((resolve) => setImmediate(resolve))
    expect(FakeLib.instances).toHaveLength(1)
    await steamUser.logout()
    const lease = await pending
    expect(lease.ok).toBe(false)
    FakeLib.instances[0]?.completeLogon()
    expect(steamUser.getClient()).toBeNull()
  })

  it('two instances share no client, lease count or connect', async () => {
    const one = build().steamUser
    const two = build().steamUser
    const lease = await one.acquireAuthenticated({ reason: 'user-refresh' })
    expect(lease.ok).toBe(true)
    expect(one.getClient()).not.toBeNull()
    expect(two.getClient()).toBeNull()
    expect(two.acquireOpenAuthenticated('user-refresh')).toBeNull()
  })
})
