/**
 * Behaviour of backend/online_monitor.ts's probe state machine
 * (debug session retrying-banner-windows-launch).
 *
 * The "Retrying (Ignore)" banner means the renderer holds `{status:'check-online',
 * retryIn:0}`. `onlineMonitorWiring.test.ts` proves the monitor is wired into the sidecar;
 * nothing before this file exercised the state machine itself: overlapping probe rounds,
 * the countdown chain, what the probe counts as "reachable", or the ordering stamps the
 * renderer needs to tell a stale snapshot from a newer push.
 *
 * Every network call is a controllable fake (never a real request). The fake emulates
 * axios's own contract: it settles per `validateStatus` and rejects with a cancel error when
 * the request's AbortSignal fires.
 */

// The import below makes this file a module: without an import/export its top-level names (`flush`, `pending`...)
// are global script declarations and collide with other test files under `tsc --noEmit`.
import { defined } from './helpers/defined'
import { createOnlineMonitor, type OnlineMonitor } from '../online_monitor'
import { createFakeClock, type FakeClock } from '../testUtils/fakeClock'
import { createIpcRegistry } from '../sidecar/ipcRegistry'

type Push = {
  status: string
  retryIn: number
  epoch?: string
  seq?: number
}

interface PendingPing {
  url: string
  signal: AbortSignal
  answer: (status: number) => void
  fail: (code: string) => void
}

const mockHead = jest.fn()
const mockLogInfo = jest.fn()
const mockLogError = jest.fn()

jest.mock('../logger', () => ({
  LogPrefix: { Connection: 'Connection' },
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
  logWarning: jest.fn()
}))

let pending: PendingPing[] = []

const installAxiosFake = () => {
  mockHead.mockImplementation(
    (
      url: string,
      config: {
        signal: AbortSignal
        validateStatus?: (status: number) => boolean
      }
    ) =>
      new Promise((resolve, reject) => {
        const accepts =
          config.validateStatus ?? ((s: number) => s >= 200 && s < 300)
        config.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }))
        )
        pending.push({
          url,
          signal: config.signal,
          answer: (status) =>
            accepts(status)
              ? resolve({ status })
              : reject(
                  Object.assign(
                    new Error(`Request failed with status code ${status}`),
                    { code: 'ERR_BAD_REQUEST' }
                  )
                ),
          fail: (code) => reject(Object.assign(new Error(code), { code }))
        })
      })
  )
}

/** The pings of the most recent probe round (four per round, newest last). */
const newestRound = () => pending.slice(-4)

let clock: FakeClock
let ipc: ReturnType<typeof createIpcRegistry>
let pushed: Array<[string, Push]> = []
let epochCounter = 0

const pushes = (): Push[] => pushed.map(([, payload]) => payload)

const lastPush = () => pushes().at(-1)

const listenerFor = (channel: string) => {
  const listener = ipc.getListeners(channel)[0]
  if (!listener) throw new Error(`no listener registered for ${channel}`)
  return listener as (event: unknown, ...args: unknown[]) => void
}

const handlerFor = (channel: string) => {
  const handler = ipc.getHandler(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler as () => Push
}

/** A fresh monitor with its own registry, clock and push log. Nothing is shared between calls. */
const loadMonitor = (): OnlineMonitor => {
  ipc = createIpcRegistry()
  clock = createFakeClock()
  pushed = []
  return createOnlineMonitor({
    clock,
    ipc,
    push: (channel, payload) => pushed.push([channel, payload as Push]),
    head: (url, opts) => mockHead(url, opts) as unknown,
    newEpoch: () => `epoch-${++epochCounter}`
  })
}

/** Lets settled probe promises run their continuations (real microtasks, fake clock). */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
const advance = async (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    clock.advance(Math.min(1000, ms - elapsed))
    await flush()
  }
}

beforeEach(() => {
  pending = []
  mockLogInfo.mockClear()
  mockLogError.mockClear()
  delete process.env.CI
  installAxiosFake()
})

describe('what the probe accepts as "reachable"', () => {
  it('treats an HTTP error answer as proof the network works', async () => {
    const monitor = loadMonitor()
    monitor.start()

    // store.epicgames.com answers the probe's HEAD with 403 on a healthy network
    // (measured 2026-11-01, repo axios 1.20), and Cloudflare-fronted hosts do the same to
    // any axios TLS fingerprint. A 4xx is still an answer from the far end.
    newestRound().forEach((ping) => ping.answer(403))
    await flush()

    expect(monitor.isOnline()).toBe(true)
    expect(lastPush()).toMatchObject({ status: 'online', retryIn: 0 })
  })

  it('still counts a transport failure on every host as a failed round', async () => {
    const monitor = loadMonitor()
    monitor.start()

    newestRound().forEach((ping) => ping.fail('ENOTFOUND'))
    await flush()

    expect(monitor.isOnline()).toBe(false)
    expect(lastPush()).toMatchObject({ status: 'check-online', retryIn: 5 })
  })
})

describe('CR-01: getConnectivityStatus', () => {
  it('CR-01: reads check-online at boot before any ping answers, online after one does', async () => {
    const monitor = loadMonitor()
    monitor.start()
    expect(monitor.getConnectivityStatus()).toBe('check-online')
    expect(monitor.isOnline()).toBe(false)

    defined(newestRound()[0], 'first ping').answer(200)
    await flush()

    expect(monitor.getConnectivityStatus()).toBe('online')
  })
})

describe('overlapping probe rounds', () => {
  it('does not report the newer round as failed once an older round proved online', async () => {
    const monitor = loadMonitor()
    monitor.start()
    const round1 = newestRound()

    // The renderer's DOM `online` event echoes `check-online` while round 1 is in flight.
    listenerFor('connectivity-changed')({}, 'check-online')
    const round2 = newestRound()
    expect(round2).not.toEqual(round1)
    // one round at a time: the new request replaced the running one
    expect(round1.every((ping) => ping.signal.aborted)).toBe(true)
    expect(round2.some((ping) => ping.signal.aborted)).toBe(false)

    // Round 1's host answers anyway. The old monitor accepted that, went online, and in doing
    // so aborted the module-level controller, which by then belonged to round 2: round 2 then
    // "failed" with a cancel error and pushed a "retrying in 5 seconds" countdown after the
    // monitor was already online.
    defined(round1[0], 'first ping').answer(200)
    await flush()
    defined(round2[1], 'second ping').answer(200)
    await flush()
    await advance(60_000)

    expect(monitor.isOnline()).toBe(true)
    const firstOnline = pushes().findIndex((push) => push.status === 'online')
    expect(firstOnline).toBeGreaterThan(-1)
    expect(
      pushes()
        .slice(firstOnline)
        .every((push) => push.status === 'online')
    ).toBe(true)
    expect(
      mockLogInfo.mock.calls.some(([message]) =>
        /ping requests failed|failed on every host/.test(String(message))
      )
    ).toBe(false)
  })

  it('a DOM offline event cancels probing and leaves no retry countdown behind', async () => {
    const monitor = loadMonitor()
    monitor.start()

    const round = newestRound()
    listenerFor('connectivity-changed')({}, 'offline')
    await flush()
    await advance(60_000)

    expect(round.every((ping) => ping.signal.aborted)).toBe(true)

    expect(lastPush()).toMatchObject({ status: 'offline', retryIn: 0 })
    expect(
      pushes().filter((push) => push.status === 'check-online')
    ).toHaveLength(1) // only the boot push, nothing after the offline event
    expect(pending.length).toBe(4) // and no further round was started
  })

  it('a DOM online event during a countdown stops that countdown and probes once', async () => {
    const monitor = loadMonitor()
    monitor.start()
    newestRound().forEach((ping) => ping.fail('ENOTFOUND'))
    await flush()
    await advance(2000) // countdown now at 3
    expect(lastPush()).toMatchObject({ status: 'check-online', retryIn: 3 })
    const roundsBefore = pending.length / 4

    listenerFor('connectivity-changed')({}, 'check-online')
    await flush()
    expect(lastPush()).toMatchObject({ status: 'check-online', retryIn: 0 })
    const pushesAtRestart = pushes().length

    // The old countdown must not keep ticking next to the new round (that would push
    // retryIn 2, 1, 0 over the new round's "Retrying" and then start yet another round).
    await advance(10_000)
    expect(pending.length / 4).toBe(roundsBefore + 1)
    expect(pushes()).toHaveLength(pushesAtRestart)
  })
})

describe('the retry countdown', () => {
  it('counts down, probes again, and goes quiet once a round succeeds', async () => {
    const monitor = loadMonitor()
    monitor.start()
    newestRound().forEach((ping) => ping.fail('ECONNABORTED'))
    await flush()
    expect(lastPush()).toMatchObject({ status: 'check-online', retryIn: 5 })

    await advance(5000)
    expect(lastPush()).toMatchObject({ status: 'check-online', retryIn: 0 })
    expect(pending.length).toBe(8) // a second round

    defined(newestRound()[1], 'second ping').answer(200)
    await flush()
    expect(lastPush()).toMatchObject({ status: 'online', retryIn: 0 })

    const count = pushes().length
    await advance(120_000)
    expect(pushes()).toHaveLength(count)
    expect(clock.pendingCount()).toBe(0)
  })

  it('does not keep the sidecar alive: the countdown timer is a plain clock timer, never keepAlive', async () => {
    const monitor = loadMonitor()
    monitor.start()
    newestRound().forEach((ping) => ping.fail('ENOTFOUND'))
    await flush()
    expect(lastPush()).toMatchObject({ retryIn: 5 })

    // Exactly the countdown is pending, on the injected clock, and none of it holds the loop.
    expect(clock.pendingCount()).toBe(1)
    expect(clock.keepAliveReasons()).toEqual([])
    clock.assertNoKeepAlive()
  })

  it('drives the countdown from the injected clock, one tick per second', async () => {
    const monitor = loadMonitor()
    monitor.start()
    newestRound().forEach((ping) => ping.fail('ENOTFOUND'))
    await flush()

    clock.advance(1000)
    expect(lastPush()).toMatchObject({ status: 'check-online', retryIn: 4 })
    clock.advance(1000)
    expect(lastPush()).toMatchObject({ retryIn: 3 })
  })

  it('leaves no timer behind once the status leaves check-online', async () => {
    const monitor = loadMonitor()
    monitor.start()
    newestRound().forEach((ping) => ping.fail('ENOTFOUND'))
    await flush()
    expect(clock.pendingCount()).toBe(1)

    listenerFor('set-connectivity-online')({})
    expect(clock.pendingCount()).toBe(0)
  })
})

describe('construction', () => {
  it('does nothing observable until start(): no push, no probe, nothing registered', () => {
    const monitor = loadMonitor()

    expect(pushes()).toHaveLength(0)
    expect(mockHead).not.toHaveBeenCalled()
    expect(ipc.has('get-connectivity-status')).toBe(false)
    expect(ipc.has('connectivity-changed')).toBe(false)
    expect(clock.pendingCount()).toBe(0)
    expect(monitor.isOnline()).toBe(false)
  })

  it('start() registers the handler and both listeners on the injected registry', () => {
    const monitor = loadMonitor()
    monitor.start()

    expect(ipc.has('get-connectivity-status')).toBe(true)
    expect(ipc.getListeners('connectivity-changed')).toHaveLength(1)
    expect(ipc.getListeners('set-connectivity-online')).toHaveLength(1)
  })
})

describe('onConnectivityChange / runOnceWhenOnline', () => {
  it('onConnectivityChange sees each transition; runOnceWhenOnline waits for the next online', async () => {
    const monitor = loadMonitor()
    const seen: string[] = []
    monitor.onConnectivityChange((status) => seen.push(status))
    const once = jest.fn()
    monitor.runOnceWhenOnline(once)
    monitor.start()
    expect(once).not.toHaveBeenCalled()

    defined(newestRound()[0], 'first ping').answer(200)
    await flush()
    expect(seen).toEqual(['check-online', 'online'])
    expect(once).toHaveBeenCalledTimes(1)

    // online already: runs immediately, and the earlier registration does not run again
    const now = jest.fn()
    monitor.runOnceWhenOnline(now)
    expect(now).toHaveBeenCalledTimes(1)
    listenerFor('connectivity-changed')({}, 'check-online')
    listenerFor('set-connectivity-online')({})
    expect(once).toHaveBeenCalledTimes(1)
  })
})

describe('listeners', () => {
  it('a throwing connectivity listener is not reported as a failed probe', async () => {
    const monitor = loadMonitor()
    monitor.onConnectivityChange(() => {
      throw new Error('listener bug')
    })
    monitor.start()

    defined(newestRound()[0], 'first ping').answer(200)
    await flush()
    await advance(60_000)

    expect(monitor.isOnline()).toBe(true)
    expect(lastPush()).toMatchObject({ status: 'online', retryIn: 0 })
    expect(
      mockLogInfo.mock.calls.some(([message]) =>
        /ping requests failed|failed on every host/.test(String(message))
      )
    ).toBe(false)
    expect(mockLogError).toHaveBeenCalledWith(
      [expect.stringContaining("'online'"), expect.any(Error)],
      'Connection'
    )
  })
})

describe('ordering stamps (a pull reply and a push take different routes to the renderer)', () => {
  it('stamps every push with one epoch and a strictly increasing seq', async () => {
    const monitor = loadMonitor()
    monitor.start()
    newestRound().forEach((ping) => ping.fail('ENOTFOUND'))
    await flush()
    await advance(5000)
    defined(newestRound()[0], 'first ping').answer(200)
    await flush()

    const all = pushes()
    expect(all.length).toBeGreaterThan(3)
    expect(new Set(all.map((push) => push.epoch)).size).toBe(1)
    expect(typeof defined(all[0], 'first push').epoch).toBe('string')
    all.slice(1).forEach((push, i) => {
      expect(push.seq).toBeGreaterThan(
        defined(all[i], 'earlier push').seq as number
      )
    })
  })

  it('answers the renderer pull with the newest stamp it has published', async () => {
    const monitor = loadMonitor()
    monitor.start()
    defined(newestRound()[0], 'first ping').answer(200)
    await flush()

    const snapshot = handlerFor('get-connectivity-status')()
    expect(snapshot).toEqual(lastPush())
    expect(snapshot).toMatchObject({ status: 'online', retryIn: 0 })
  })

  it('stamps are scoped per process: a new monitor instance gets a new epoch', async () => {
    const first = loadMonitor()
    first.start()
    const epochA = lastPush()?.epoch

    const second = loadMonitor()
    second.start()
    expect(lastPush()?.epoch).not.toBe(epochA)
  })

  it('two instances share no status, seq or listeners', async () => {
    const first = loadMonitor()
    const firstClock = clock
    first.start()
    defined(newestRound()[0], 'first ping').answer(200)
    await flush()
    expect(first.isOnline()).toBe(true)

    const second = loadMonitor()
    expect(second.isOnline()).toBe(false)
    expect(second.getConnectivityStatus()).toBe('check-online')
    second.start()
    expect(pushes()).toHaveLength(1) // only the second monitor's own boot push
    expect(clock).not.toBe(firstClock)
    expect(first.isOnline()).toBe(true)
  })
})

describe('G25: recheckConnectivity', () => {
  const goOnline = async () => {
    const monitor = loadMonitor()
    monitor.start()
    defined(newestRound()[0], 'first ping').answer(200)
    await flush()
    expect(monitor.isOnline()).toBe(true)
    return monitor
  }

  it('G25: moves an online monitor to check-online, publishes it and starts a round', async () => {
    const monitor = await goOnline()
    const rounds = pending.length / 4

    monitor.recheckConnectivity('launch', 'no-interface')
    await flush()

    expect(monitor.isOnline()).toBe(false)
    expect(lastPush()).toMatchObject({ status: 'check-online', retryIn: 0 })
    expect(pending.length / 4).toBe(rounds + 1)
    expect(mockLogInfo).toHaveBeenCalledWith(
      'Connectivity: check-online (fresh check at launch found no-interface)',
      'Connection'
    )
  })

  it('G25: recovers to online on its own when a later round answers', async () => {
    const monitor = await goOnline()
    monitor.recheckConnectivity('launch', 'dns-failed')
    newestRound().forEach((ping) => ping.fail('ENOTFOUND'))
    await flush()
    expect(lastPush()).toMatchObject({ status: 'check-online', retryIn: 5 })

    await advance(5000)
    defined(newestRound()[0], 'first ping').answer(200)
    await flush()

    expect(monitor.isOnline()).toBe(true)
    expect(lastPush()).toMatchObject({ status: 'online', retryIn: 0 })
  })

  it('G25: is a no-op when the monitor is offline or already checking', async () => {
    const monitor = loadMonitor()
    monitor.start()
    // check-online (boot round in flight)
    let count = pushes().length
    let rounds = pending.length
    monitor.recheckConnectivity('launch', 'no-interface')
    expect(pushes()).toHaveLength(count)
    expect(pending).toHaveLength(rounds)

    listenerFor('connectivity-changed')({}, 'offline')
    count = pushes().length
    rounds = pending.length
    monitor.recheckConnectivity('launch', 'no-interface')
    expect(pushes()).toHaveLength(count)
    expect(pending).toHaveLength(rounds)
    expect(lastPush()).toMatchObject({ status: 'offline' })
  })

  it('G25: status-change log lines name their source', async () => {
    const monitor = loadMonitor()
    monitor.start()
    listenerFor('connectivity-changed')({}, 'offline')
    listenerFor('set-connectivity-online')({})
    expect(monitor.isOnline()).toBe(true)

    const lines = mockLogInfo.mock.calls.map(([m]) => String(m))
    expect(lines).toContain('Connectivity: offline (from renderer)')
    expect(lines).toContain('Connectivity: online (from renderer)')
    expect(lines).toContain('Connectivity: check-online')
  })
})
