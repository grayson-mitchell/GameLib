/**
 * Phase 79 (D-03, D-07, D-18): SteamUser on the Rust engine, its only engine. The Rust session is a
 * mocked requestRustInvoke; the policy layer (token read, verdict, guided push) is the real one.
 */

const mockConfigValues: Record<string, unknown> = {}
const mockConfigStore = {
  get: jest.fn(),
  get_nodefault: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn()
}

const mockReadTokenOutcome = jest.fn()
const mockTokenStore = {
  getToken: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
  isAvailable: jest.fn()
}
jest.mock('../tokenStore', () => ({
  createTokenStoreSlot: () => ({
    configure: () => undefined,
    current: () => mockTokenStore
  }),
  readTokenOutcome: (...args: unknown[]) => mockReadTokenOutcome(...args)
}))

const mockLogInfo = jest.fn()
const mockLogWarning = jest.fn()
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logDebug: jest.fn(),
  logInfo: (...a: unknown[]) => mockLogInfo(...a),
  logWarning: (...a: unknown[]) => mockLogWarning(...a),
  LogPrefix: { Steam: 'Steam' }
}))

import type { SteamUser } from '../user'
import { createTestSteamUser } from 'backend/testUtils/testSteamUser'
import { createTestSteamSession } from 'backend/testUtils/testSteamSession'
import { createAnonymousClient } from '../anonymousClient'

const SECRET = 'rust-secret-refresh-token'
const realSession = createTestSteamSession()
const mockSignIn = {
  outcomes: {
    noteSignInSucceeded: jest.fn(),
    noteSignedOut: jest.fn(),
    record: jest.fn(),
    publish: jest.fn()
  },
  epochs: { capture: () => 0, isCurrent: () => true, bump: jest.fn() }
}

type Handler = (args: unknown[]) => unknown
let handlers: Record<string, Handler>
const calls: Array<{ channel: string; args: unknown[] }> = []
const sendFrontendMessage = jest.fn(() => true)
let anonClose: jest.Mock

const recordingInvoke = ((channel: string, args: unknown[]) => {
  calls.push({ channel, args })
  const h = handlers[channel]
  if (!h) return Promise.reject(new Error(`unmocked ${channel}`))
  return Promise.resolve(h(args))
}) as never

/** `realAnonClient`: the boot's anonymous client on the same transport, not a close() mock. */
function makeUser(opts: { realAnonClient?: boolean } = {}): SteamUser {
  anonClose = jest.fn()
  return createTestSteamUser({
    stores: { steam: { configStore: mockConfigStore } },
    signIn: mockSignIn,
    anonymousClient: opts.realAnonClient
      ? createAnonymousClient({ requestRustInvoke: recordingInvoke })
      : { close: anonClose },
    tokenStore: { current: () => mockTokenStore },
    steamSession: {
      signIn: realSession.signIn,
      authTrigger: {
        ...realSession.authTrigger,
        currentTriggerLabel: () => 'user-refresh'
      }
    },
    sendFrontendMessage,
    rustInvoke: { requestRustInvoke: recordingInvoke }
  } as never)
}

const channelsCalled = (): string[] => calls.map((c) => c.channel)

let steamUser: SteamUser
beforeEach(() => {
  jest.clearAllMocks()
  for (const k of Object.keys(mockConfigValues)) delete mockConfigValues[k]
  calls.length = 0
  mockConfigStore.get.mockImplementation((k: string) => mockConfigValues[k])
  mockConfigStore.get_nodefault.mockImplementation(
    (k: string) => mockConfigValues[k]
  )
  mockConfigStore.set.mockImplementation((k: string, v: unknown) => {
    mockConfigValues[k] = v
  })
  mockConfigStore.delete.mockImplementation((k: string) => {
    delete mockConfigValues[k]
  })
  mockConfigValues['isLoggedIn'] = true
  mockReadTokenOutcome.mockResolvedValue({ status: 'present', token: SECRET })
  handlers = {
    steamcm_session_acquire: () => ({
      ok: true,
      leaseId: 7,
      steamId: '76561197960287930'
    }),
    steamcm_licenses: () => ({ ok: true, result: [{ package_id: 1 }] }),
    steamcm_session_release: () => ({}),
    steamcm_session_logout: () => ({}),
    steamcm_anon_close: () => ({}),
    steamcm_session_acquire_open: () => ({
      ok: true,
      leaseId: 9,
      steamId: '76561197960287930'
    })
  }
  steamUser = makeUser()
})

describe('SteamUser on the Rust engine', () => {
  it('acquires through the Rust session with the stored token, logonId 0, then licenses', async () => {
    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })

    expect(lease.ok).toBe(true)
    if (!lease.ok) return
    expect(lease.client.steamID?.getSteamID64()).toBe('76561197960287930')
    expect(lease.client.licenses).toEqual([{ package_id: 1 }])
    expect(calls[0]).toEqual({
      channel: 'steamcm_session_acquire',
      args: [{ refreshToken: SECRET, reason: 'user-refresh', logonId: 0 }]
    })
    expect(calls[1]).toEqual({
      channel: 'steamcm_licenses',
      args: [{ leaseId: 7 }]
    })
    expect(steamUser.getClient()?.steamID?.getSteamID64()).toBe(
      '76561197960287930'
    )
  })

  it('C1/WR-05: a failed licence read leaves the licence list unknown (null), not empty', async () => {
    handlers['steamcm_licenses'] = () => ({ ok: false, kind: 'closed' })
    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })
    expect(lease.ok).toBe(true)
    if (!lease.ok) return
    expect(lease.client.licenses).toBeNull()
    expect(steamUser.getClient()?.licenses).toBeNull()
  })

  it('getClient() follows a held lease, so releasing another lease never strands its caller', async () => {
    // Review 79 C1/CR-01: an install handed a concurrent Refresh's client failed once that
    // Refresh released its lease.
    let next = 7
    handlers['steamcm_session_acquire'] = () => ({
      ok: true,
      leaseId: next++,
      steamId: '76561197960287930'
    })
    handlers['steamcm_depot_key'] = () => ({
      ok: true,
      result: { keyHex: 'ab' }
    })
    const install = await steamUser.acquireAuthenticated({
      reason: 'user-install'
    })
    const refresh = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })
    if (!install.ok || !refresh.ok) throw new Error('expected two leases')

    const client = steamUser.getClient()
    if (!client) throw new Error('expected a client')
    refresh.release()

    await new Promise<void>((resolve, reject) =>
      client.getDepotDecryptionKey(1, 2, (err) =>
        err ? reject(err) : resolve()
      )
    )
    const keyCall = calls.find((c) => c.channel === 'steamcm_depot_key')
    expect(keyCall?.args).toEqual([{ leaseId: 7, appId: 1, depotId: 2 }])

    install.release()
    expect(steamUser.getClient()).toBeNull()
  })

  it('release() invokes steamcm_session_release exactly once even when called twice', async () => {
    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })
    if (!lease.ok) throw new Error('expected a lease')

    lease.release()
    lease.release()

    expect(
      calls.filter((c) => c.channel === 'steamcm_session_release')
    ).toEqual([{ channel: 'steamcm_session_release', args: [{ leaseId: 7 }] }])
    expect(steamUser.getClient()).toBeNull()
  })

  it('a logon-rejected refusal reports the failure and latches credentialsMissing for eresult 15', async () => {
    handlers['steamcm_session_acquire'] = () => ({
      ok: false,
      refusal: 'logon-rejected',
      logonFailure: { kind: 'AccessDenied', eresult: 15 }
    })

    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })

    expect(lease).toEqual({ ok: false, reason: 'logon-rejected' })
    expect(steamUser.getLogonFailure()).toEqual({
      message: 'AccessDenied',
      eresult: 15
    })
    expect(mockConfigStore.set).toHaveBeenCalledWith('credentialsMissing', true)
  })

  it('eresult 34 (session replaced) latches nothing', async () => {
    handlers['steamcm_session_acquire'] = () => ({
      ok: false,
      refusal: 'logon-rejected',
      logonFailure: { kind: 'LogonSessionReplaced', eresult: 34 }
    })

    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })

    expect(lease).toEqual({ ok: false, reason: 'logon-rejected' })
    expect(steamUser.getLogonFailure()).toEqual({
      message: 'LogonSessionReplaced',
      eresult: 34
    })
    expect(mockConfigStore.set).not.toHaveBeenCalledWith(
      'credentialsMissing',
      true
    )
  })

  it('go-offline-required with a guided install action pushes steamGoOfflineRequired', async () => {
    handlers['steamcm_session_acquire'] = () => ({
      ok: false,
      refusal: 'go-offline-required'
    })

    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-install',
      guidedAction: 'install',
      appName: '440',
      installPath: '/games'
    })

    expect(lease).toEqual({ ok: false, reason: 'go-offline-required' })
    expect(sendFrontendMessage).toHaveBeenCalledWith('steamGoOfflineRequired', {
      action: 'install',
      appName: '440',
      installPath: '/games'
    })
  })

  it('an absent token is token-absent, latches credentialsMissing and issues no rustInvoke', async () => {
    mockReadTokenOutcome.mockResolvedValue({ status: 'absent' })

    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })

    expect(lease).toEqual({ ok: false, reason: 'token-absent' })
    expect(mockConfigStore.set).toHaveBeenCalledWith('credentialsMissing', true)
    expect(calls).toHaveLength(0)
  })

  it('an unreadable token is token-unreadable and latches nothing', async () => {
    mockReadTokenOutcome.mockResolvedValue({
      status: 'unreadable',
      reason: 'timeout'
    })

    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })

    expect(lease).toEqual({ ok: false, reason: 'token-unreadable' })
    expect(mockConfigStore.set).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('acquireAuthenticatedWithToken passes the supplied token and skips the keyring', async () => {
    const lease = await steamUser.acquireAuthenticatedWithToken(
      { reason: 'login' },
      'in-memory-token'
    )

    expect(lease.ok).toBe(true)
    expect(mockReadTokenOutcome).not.toHaveBeenCalled()
    expect(calls[0]?.args).toEqual([
      { refreshToken: 'in-memory-token', reason: 'login', logonId: 0 }
    ])
  })

  it('acquireOpenAuthenticated is async and invokes the open-acquire channel', async () => {
    const open = await steamUser.acquireOpenAuthenticated('shared-redist')

    expect(open?.client.steamID?.getSteamID64()).toBe('76561197960287930')
    expect(calls[0]).toEqual({
      channel: 'steamcm_session_acquire_open',
      args: [{ reason: 'shared-redist' }]
    })
    open?.release()
    expect(channelsCalled()).toContain('steamcm_session_release')
  })

  it('acquireOpenAuthenticated is null when the Rust session has no open session', async () => {
    handlers['steamcm_session_acquire_open'] = () => ({ ok: false })

    expect(await steamUser.acquireOpenAuthenticated('user-refresh')).toBeNull()
  })

  it('ensureConnected canaries a live Rust session through ensure_connected', async () => {
    handlers['steamcm_session_status'] = () => ({
      connected: true,
      leaseCount: 0,
      logonFailure: null
    })
    handlers['steamcm_session_ensure_connected'] = () => ({ connected: true })

    expect(await steamUser.ensureConnected()).toBe(true)
    expect(channelsCalled()).toEqual([
      'steamcm_session_status',
      'steamcm_session_ensure_connected'
    ])
    expect(mockConfigStore.delete).toHaveBeenCalledWith('credentialsMissing')
  })

  it('logout invokes session_logout and anon_close then runs the store cleanup', async () => {
    steamUser = makeUser({ realAnonClient: true })
    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })
    expect(lease.ok).toBe(true)

    await steamUser.logout()

    expect(channelsCalled()).toEqual(
      expect.arrayContaining(['steamcm_session_logout', 'steamcm_anon_close'])
    )
    // C1/IN-02: the anonymous client's own close is the only one; logout() sends no second.
    const anonCloses = calls.filter((c) => c.channel === 'steamcm_anon_close')
    expect(anonCloses).toEqual([
      { channel: 'steamcm_anon_close', args: [{ reason: 'logout' }] }
    ])
    expect(steamUser.getClient()).toBeNull()
    expect(mockTokenStore.clearToken).toHaveBeenCalled()
    expect(mockConfigStore.delete).toHaveBeenCalledWith('isLoggedIn')
    expect(mockConfigStore.delete).toHaveBeenCalledWith('credentialsMissing')
  })

  it('releaseForShutdown resolves without any rustInvoke and refuses later acquires', async () => {
    await expect(steamUser.releaseForShutdown()).resolves.toBeUndefined()
    expect(calls).toHaveLength(0)

    const lease = await steamUser.acquireAuthenticated({
      reason: 'user-refresh'
    })
    expect(lease).toEqual({ ok: false, reason: 'shutting-down' })
    expect(calls).toHaveLength(0)
  })

  it('never logs the refresh token', async () => {
    handlers['steamcm_session_acquire'] = () => ({
      ok: false,
      refusal: 'logon-rejected',
      logonFailure: { kind: 'AccessDenied', eresult: 15 }
    })
    await steamUser.acquireAuthenticated({ reason: 'user-refresh' })
    await steamUser.acquireAuthenticatedWithToken(
      { reason: 'login' },
      'another-secret'
    )

    const logged = JSON.stringify([
      ...mockLogInfo.mock.calls,
      ...mockLogWarning.mock.calls
    ])
    expect(logged).not.toContain(SECRET)
    expect(logged).not.toContain('another-secret')
  })
})
