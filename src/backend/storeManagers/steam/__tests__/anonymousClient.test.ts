/**
 * Phase 54 (54-01): the shared anonymous steam-user client used for public
 * PICS reads (ROADMAP SC2).
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

// A real class (not a jest.fn) so the backend project's `resetMocks: true`
// cannot wipe the constructor between tests. `instances` records every
// construction; the per-instance methods are fresh jest.fn()s each time.
jest.mock('steam-user', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EventEmitter } = require('events')
  class FakeSteamUser extends EventEmitter {
    static instances: FakeSteamUser[] = []
    options: Record<string, unknown>
    logOn = jest.fn()
    logOff = jest.fn()
    getProductInfo = jest.fn().mockResolvedValue({ apps: {} })
    constructor(options: Record<string, unknown>) {
      super()
      this.options = options
      FakeSteamUser.instances.push(this)
    }
  }
  return FakeSteamUser
})

import SteamUserLib from 'steam-user'
import { logInfo } from 'backend/logger'
import {
  ANON_CONNECT_TIMEOUT_MS,
  ANON_IDLE_CLOSE_MS,
  __resetAnonymousClientForTests,
  closeAnonymousClient,
  getAnonymousPicsClient,
  isPublicOnlyEntry,
  releaseAnonymousForShutdown
} from '../anonymousClient'

type Fake = {
  instances: Array<{
    options: Record<string, unknown>
    logOn: jest.Mock
    logOff: jest.Mock
    getProductInfo: jest.Mock
    emit: (event: string, ...args: unknown[]) => boolean
  }>
}
const fake = SteamUserLib as unknown as Fake

beforeEach(() => {
  jest.useFakeTimers()
  fake.instances.length = 0
  __resetAnonymousClientForTests()
})

afterEach(() => {
  __resetAnonymousClientForTests()
  jest.useRealTimers()
})

describe('getAnonymousPicsClient', () => {
  it('shares one in-flight connect and logs on with exactly { anonymous: true }', async () => {
    const a = getAnonymousPicsClient('platform-capture')
    const b = getAnonymousPicsClient('platform-capture')
    expect(fake.instances).toHaveLength(1)
    const inst = fake.instances[0]
    expect(inst.logOn).toHaveBeenCalledTimes(1)
    expect(inst.logOn).toHaveBeenCalledWith({ anonymous: true })
    expect(inst.options).toMatchObject({
      autoRelogin: false,
      enablePicsCache: false
    })
    inst.emit('loggedOn')
    const [ca, cb] = await Promise.all([a, b])
    expect(ca).not.toBeNull()
    expect(ca).toBe(cb)
    const logs = (logInfo as jest.Mock).mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes('CM logon mode=anonymous'))
    expect(logs).toEqual([
      '[Steam] CM logon mode=anonymous reason=platform-capture'
    ])
  })

  it('forwards getProductInfo arguments unchanged', async () => {
    const p = getAnonymousPicsClient('x')
    fake.instances[0].emit('loggedOn')
    const client = await p
    await client?.getProductInfo([1, 2], [3], true)
    expect(fake.instances[0].getProductInfo).toHaveBeenCalledWith(
      [1, 2],
      [3],
      true
    )
  })

  it('times out after 15s: callers get null, logOff once, next call builds a fresh client', async () => {
    const a = getAnonymousPicsClient('x')
    const b = getAnonymousPicsClient('x')
    jest.advanceTimersByTime(ANON_CONNECT_TIMEOUT_MS)
    expect(await a).toBeNull()
    expect(await b).toBeNull()
    expect(fake.instances[0].logOff).toHaveBeenCalledTimes(1)
    void getAnonymousPicsClient('x')
    expect(fake.instances).toHaveLength(2)
  })

  it('an error before loggedOn resolves null and logs off', async () => {
    const p = getAnonymousPicsClient('x')
    fake.instances[0].emit('error', new Error('nope'))
    expect(await p).toBeNull()
    expect(fake.instances[0].logOff).toHaveBeenCalled()
  })

  it('a later error or disconnect does not throw, drops the cache and the next call reconnects', async () => {
    const p = getAnonymousPicsClient('x')
    fake.instances[0].emit('loggedOn')
    await p
    expect(() =>
      fake.instances[0].emit('error', new Error('drop'))
    ).not.toThrow()
    void getAnonymousPicsClient('x')
    expect(fake.instances).toHaveLength(2)
    fake.instances[1].emit('loggedOn')
    expect(() => fake.instances[1].emit('disconnected')).not.toThrow()
    void getAnonymousPicsClient('x')
    expect(fake.instances).toHaveLength(3)
  })

  it('closes itself after 60s idle, and a call at 59s re-arms the timer', async () => {
    const p = getAnonymousPicsClient('x')
    fake.instances[0].emit('loggedOn')
    await p
    jest.advanceTimersByTime(ANON_IDLE_CLOSE_MS - 1000)
    expect(await getAnonymousPicsClient('x')).not.toBeNull()
    expect(fake.instances).toHaveLength(1)
    jest.advanceTimersByTime(ANON_IDLE_CLOSE_MS - 1000)
    expect(fake.instances[0].logOff).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1000)
    expect(fake.instances[0].logOff).toHaveBeenCalledTimes(1)
  })
})

describe('shutdown and close', () => {
  it('releaseAnonymousForShutdown logs off and every later call resolves null', async () => {
    const p = getAnonymousPicsClient('x')
    fake.instances[0].emit('loggedOn')
    await p
    releaseAnonymousForShutdown()
    expect(fake.instances[0].logOff).toHaveBeenCalled()
    expect(await getAnonymousPicsClient('x')).toBeNull()
    expect(fake.instances).toHaveLength(1)
  })

  it("closeAnonymousClient('logout') logs off and a later call reconnects", async () => {
    const p = getAnonymousPicsClient('x')
    fake.instances[0].emit('loggedOn')
    await p
    closeAnonymousClient('logout')
    expect(fake.instances[0].logOff).toHaveBeenCalledTimes(1)
    void getAnonymousPicsClient('x')
    expect(fake.instances).toHaveLength(2)
  })
})

describe('isPublicOnlyEntry', () => {
  it('detects missingToken and public_only entries only', () => {
    expect(isPublicOnlyEntry({ missingToken: true })).toBe(true)
    expect(isPublicOnlyEntry({ appinfo: { public_only: '1' } })).toBe(true)
    expect(isPublicOnlyEntry({ appinfo: { common: {}, config: {} } })).toBe(
      false
    )
    expect(isPublicOnlyEntry(undefined)).toBe(false)
  })
})
