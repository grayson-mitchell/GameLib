/**
 * 49-08 Task 1 (R3, D-01..D-04, D-08, D-21, P3, T-49-22..T-49-24): the bounded
 * boot probe pass is parallel, single-flight, edge-triggered, deterministic at
 * its bound, and leaves no referenced handle behind.
 *
 * Collaborators, and why each is real or fake:
 *   - REAL: `applySignInVerdict`, `outcomes`, `sessionEpoch` -- the pass's
 *     contract with them (write only through the verdict, record only a
 *     non-stale result, publish once) is the thing under test. The five
 *     persisted-flag stores are plain fakes, as in `verdict.test.ts`.
 *   - FAKE: `backend/online_monitor` (captures the connectivity listener),
 *     `backend/utils/aborthandler/aborthandler` (records abort ids), the logger
 *     and `backend/ipc`, and the five store user modules (default registrations
 *     only).
 *
 * Plain functions, not `jest.fn()`, wherever a behaviour must survive
 * `resetMocks: true`.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { logInfo, logWarning } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { legendaryConfigStore } from 'backend/storeManagers/legendary/electronStores'
import { configStore as gogConfigStore } from 'backend/storeManagers/gog/electronStores'
import { configStore as nileConfigStore } from 'backend/storeManagers/nile/electronStores'
import { configStore as steamConfigStore } from 'backend/storeManagers/steam/electronStores'
import { configStore as humbleConfigStore } from 'backend/humble/electronStores'
import type { SignInProbeOutcome, SignInStore } from 'common/signInState'
import { SIGN_IN_STORES } from 'common/signInState'
import { __resetSignInEpochsForTests, bumpSignInEpoch } from '../sessionEpoch'
import {
  __resetSignInProbeOutcomesForTests,
  getSignInProbeOutcomes
} from '../outcomes'
import { SIGN_IN_PROBE_ABORT_IDS } from '../runnerProbes'
import {
  __resetSignInProbePassForTests,
  boundedSignInProbe,
  requestSignInProbePass,
  runSignInProbePass,
  SIGN_IN_PROBE_BOUND_MS,
  startSignInProbePass
} from '../pass'
import type { SignInProbePassDeps, SignInProbeRegistration } from '../pass'
import type { FakeFlagStore } from './fakeFlagStore'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn(),
  addHandler: jest.fn()
}))
jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  callAbortController: jest.fn()
}))

// The connectivity listener the pass registers, captured so a test can fire
// `online` / `offline` / `check-online` itself.
const mockConnectivity: {
  online: boolean
  listeners: Array<(status: string) => unknown>
} = { online: false, listeners: [] }
jest.mock('backend/online_monitor', () => ({
  isOnline: () => mockConnectivity.online,
  onConnectivityChange: (callback: (status: string) => unknown) => {
    mockConnectivity.listeners.push(callback)
  }
}))

// Default-registration doubles. `mockUsers` is read lazily by plain functions.
const mockUsers: {
  loggedIn: Record<SignInStore, boolean>
  calls: string[]
  ensureConnectedCalls: number
} = {
  loggedIn: {
    legendary: false,
    gog: false,
    nile: false,
    humble: false,
    steam: false
  },
  calls: [],
  ensureConnectedCalls: 0
}
jest.mock('backend/storeManagers/legendary/user', () => ({
  LegendaryUser: { isLoggedIn: () => mockUsers.loggedIn.legendary }
}))
jest.mock('backend/storeManagers/gog/user', () => ({
  GOGUser: { isLoggedIn: () => mockUsers.loggedIn.gog }
}))
jest.mock('backend/storeManagers/nile/user', () => ({
  NileUser: { isLoggedIn: () => mockUsers.loggedIn.nile }
}))
jest.mock('backend/humble/user', () => ({
  HumbleUser: {
    isLoggedIn: () => mockUsers.loggedIn.humble,
    probeSession: (context: string) => {
      mockUsers.calls.push(`humble:${context}`)
      return Promise.resolve('healthy')
    }
  }
}))
jest.mock('backend/storeManagers/steam/user', () => ({
  SteamUser: {
    isLoggedIn: () => mockUsers.loggedIn.steam,
    probeCredentialPresence: () => {
      mockUsers.calls.push('steam:probeCredentialPresence')
      return Promise.resolve('healthy')
    },
    ensureConnected: () => {
      mockUsers.ensureConnectedCalls += 1
      return Promise.resolve(true)
    }
  }
}))
jest.mock('../runnerProbes', () => ({
  ...jest.requireActual('../runnerProbes'),
  probeLegendarySession: () => {
    mockUsers.calls.push('legendary:probe')
    return Promise.resolve('healthy')
  },
  probeNileSession: () => {
    mockUsers.calls.push('nile:probe')
    return Promise.resolve('healthy')
  },
  probeGogSession: () => {
    mockUsers.calls.push('gog:probe')
    return Promise.resolve('healthy')
  }
}))

jest.mock('backend/storeManagers/legendary/electronStores', () => ({
  legendaryConfigStore: jest
    .requireActual<typeof import('./fakeFlagStore')>('./fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/gog/electronStores', () => ({
  configStore: jest
    .requireActual<typeof import('./fakeFlagStore')>('./fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/nile/electronStores', () => ({
  configStore: jest
    .requireActual<typeof import('./fakeFlagStore')>('./fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/steam/electronStores', () => ({
  configStore: jest
    .requireActual<typeof import('./fakeFlagStore')>('./fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/humble/electronStores', () => ({
  configStore: jest
    .requireActual<typeof import('./fakeFlagStore')>('./fakeFlagStore')
    .makeFakeFlagStore()
}))

const sendMock = sendFrontendMessage as unknown as jest.Mock
const abortMock = callAbortController as unknown as jest.Mock
const logInfoMock = logInfo as unknown as jest.Mock
const logWarningMock = logWarning as unknown as jest.Mock

const fakeStores: Record<SignInStore, FakeFlagStore> = {
  legendary: legendaryConfigStore as unknown as FakeFlagStore,
  gog: gogConfigStore as unknown as FakeFlagStore,
  nile: nileConfigStore as unknown as FakeFlagStore,
  humble: humbleConfigStore as unknown as FakeFlagStore,
  steam: steamConfigStore as unknown as FakeFlagStore
}

const allWrites = () =>
  Object.values(fakeStores).flatMap((fake) => [...fake.sets, ...fake.deletes])

const publishCount = () =>
  sendMock.mock.calls.filter(([channel]) => channel === 'signInProbeOutcomes')
    .length

/** Order of `probe()` invocations across a test. */
let probeCalls: SignInStore[] = []

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function recordingProbe(
  store: SignInStore,
  impl: () => Promise<SignInProbeOutcome>
): () => Promise<SignInProbeOutcome> {
  return () => {
    probeCalls.push(store)
    return impl()
  }
}

type Overrides = Partial<Record<SignInStore, Partial<SignInProbeRegistration>>>

function makeDeps(overrides: Overrides = {}): SignInProbePassDeps {
  const registrations = {} as Record<SignInStore, SignInProbeRegistration>
  for (const store of SIGN_IN_STORES) {
    registrations[store] = {
      isLoggedIn: () => true,
      probe: recordingProbe(store, () => Promise.resolve('healthy')),
      ...overrides[store]
    }
  }
  return { registrations }
}

/** Only `store` is logged in; everything else is skipped. */
function onlyStore(
  store: SignInStore,
  probe: SignInProbeRegistration['probe']
): SignInProbePassDeps {
  const overrides: Overrides = {}
  for (const other of SIGN_IN_STORES) {
    overrides[other] = { isLoggedIn: () => other === store }
  }
  overrides[store] = { isLoggedIn: () => true, probe }
  return makeDeps(overrides)
}

function fire(...statuses: string[]) {
  for (const status of statuses) {
    for (const listener of mockConnectivity.listeners) {
      listener(status)
    }
  }
}

/** Wraps setTimeout/setImmediate so every returned handle's `unref` is spied. */
function trackTimerHandles() {
  const handles: Array<{ name: string; unref: jest.SpyInstance }> = []
  for (const name of ['setTimeout', 'setImmediate'] as const) {
    const original = global[name] as unknown as (...a: unknown[]) => {
      unref?: () => unknown
    }
    jest.spyOn(global, name).mockImplementation(((...args: unknown[]) => {
      const handle = original(...args)
      handles.push({
        name,
        unref: jest.spyOn(handle as { unref: () => unknown }, 'unref')
      })
      return handle
    }) as never)
  }
  return handles
}

beforeEach(() => {
  probeCalls = []
  mockConnectivity.online = false
  mockConnectivity.listeners = []
  mockUsers.calls = []
  mockUsers.ensureConnectedCalls = 0
  for (const store of SIGN_IN_STORES) {
    mockUsers.loggedIn[store] = false
    fakeStores[store].reset()
  }
  __resetSignInEpochsForTests()
  __resetSignInProbeOutcomesForTests()
  __resetSignInProbePassForTests()
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('SIGN_IN_PROBE_BOUND_MS (D-01)', () => {
  it('equals the Rust KEYRING_READ_TIMEOUT, read from the source rather than retyped here', () => {
    const rust = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src-tauri', 'src', 'main.rs'),
      'utf8'
    )
    const match =
      /const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs\((\d+)\)/.exec(
        rust
      )
    expect(match).not.toBeNull()
    expect(SIGN_IN_PROBE_BOUND_MS).toBe(Number(match?.[1]) * 1000)
  })
})

describe('runSignInProbePass: parallel, once each (D-02, P3)', () => {
  it('invokes all five probes before any of them resolves', async () => {
    const gates = SIGN_IN_STORES.map(() => deferred<SignInProbeOutcome>())
    const overrides: Overrides = {}
    SIGN_IN_STORES.forEach((store, index) => {
      overrides[store] = {
        probe: recordingProbe(store, () => gates[index].promise)
      }
    })

    const pass = runSignInProbePass(makeDeps(overrides))
    // Nothing has resolved, yet every probe has already been called.
    expect(probeCalls).toEqual([...SIGN_IN_STORES])

    gates.forEach((gate) => gate.resolve('healthy'))
    await pass
  })

  it('never probes a logged-out store and probes each logged-in store exactly once', async () => {
    await runSignInProbePass(
      makeDeps({
        humble: { isLoggedIn: () => false },
        steam: { isLoggedIn: () => false }
      })
    )
    expect([...probeCalls].sort()).toEqual(['gog', 'legendary', 'nile'])
    expect(getSignInProbeOutcomes()).toEqual({
      legendary: 'healthy',
      gog: 'healthy',
      nile: 'healthy'
    })
  })

  it('treats a throwing isLoggedIn as logged out', async () => {
    await runSignInProbePass(
      makeDeps({
        nile: {
          isLoggedIn: () => {
            throw new Error('store unreadable')
          }
        }
      })
    )
    expect(probeCalls).not.toContain('nile')
  })
})

describe('boundedSignInProbe: the deterministic boundary (R3)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  function lateProbe(afterMs: number, outcome: SignInProbeOutcome) {
    return () =>
      new Promise<SignInProbeOutcome>((resolve) => {
        setTimeout(() => resolve(outcome), afterMs)
      })
  }

  it('returns the verdict of a probe that resolves one millisecond before the bound', async () => {
    const onBound = jest.fn()
    const result = boundedSignInProbe(
      lateProbe(SIGN_IN_PROBE_BOUND_MS - 1, 'expired'),
      onBound
    )
    await jest.advanceTimersByTimeAsync(SIGN_IN_PROBE_BOUND_MS - 1)
    await expect(result).resolves.toBe('expired')
    expect(onBound).not.toHaveBeenCalled()
  })

  it('returns unknown for a probe that resolves exactly at the bound', async () => {
    const result = boundedSignInProbe(
      lateProbe(SIGN_IN_PROBE_BOUND_MS, 'expired'),
      () => undefined
    )
    await jest.advanceTimersByTimeAsync(SIGN_IN_PROBE_BOUND_MS)
    await expect(result).resolves.toBe('unknown')
  })

  it('returns unknown for a probe that never resolves, and signals the bound once', async () => {
    const onBound = jest.fn()
    const result = boundedSignInProbe(
      () => new Promise(() => undefined),
      onBound
    )
    await jest.advanceTimersByTimeAsync(SIGN_IN_PROBE_BOUND_MS)
    await expect(result).resolves.toBe('unknown')
    expect(onBound).toHaveBeenCalledTimes(1)
  })

  it('maps a rejected probe to unknown', async () => {
    await expect(
      boundedSignInProbe(
        () => Promise.reject(new Error('boom')),
        () => undefined
      )
    ).resolves.toBe('unknown')
  })

  it('maps a synchronously throwing probe to unknown', async () => {
    await expect(
      boundedSignInProbe(
        () => {
          throw new Error('boom')
        },
        () => undefined
      )
    ).resolves.toBe('unknown')
  })

  it('aborts a spawn-based probe at the bound through its abort id, and a keyring probe through none', async () => {
    const pass = runSignInProbePass(
      makeDeps({
        legendary: {
          abortId: SIGN_IN_PROBE_ABORT_IDS.legendary,
          probe: recordingProbe('legendary', () => new Promise(() => undefined))
        },
        steam: {
          probe: recordingProbe('steam', () => new Promise(() => undefined))
        }
      })
    )
    await jest.advanceTimersByTimeAsync(SIGN_IN_PROBE_BOUND_MS)
    await pass

    expect(abortMock).toHaveBeenCalledTimes(1)
    expect(abortMock).toHaveBeenCalledWith(SIGN_IN_PROBE_ABORT_IDS.legendary)
    expect(getSignInProbeOutcomes().legendary).toBe('unknown')
    expect(getSignInProbeOutcomes().steam).toBe('unknown')
  })

  it('writes nothing for a bounded probe (a timeout is never evidence of a signed-out store)', async () => {
    const pass = runSignInProbePass(
      onlyStore(
        'gog',
        recordingProbe('gog', () => new Promise(() => undefined))
      )
    )
    await jest.advanceTimersByTimeAsync(SIGN_IN_PROBE_BOUND_MS)
    await pass
    expect(allWrites()).toEqual([])
    expect(getSignInProbeOutcomes()).toEqual({ gog: 'unknown' })
  })

  it('latches a probe that returns expired just inside the bound', async () => {
    const pass = runSignInProbePass(
      onlyStore(
        'gog',
        recordingProbe('gog', lateProbe(SIGN_IN_PROBE_BOUND_MS - 1, 'expired'))
      )
    )
    await jest.advanceTimersByTimeAsync(SIGN_IN_PROBE_BOUND_MS - 1)
    await pass
    expect(fakeStores.gog.sets).toEqual([['expired', true]])
    expect(getSignInProbeOutcomes()).toEqual({ gog: 'expired' })
  })
})

describe('exit contract: no referenced handle survives a pass (T-49-22)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  it('unrefs every timer it creates and leaves none pending', async () => {
    const handles = trackTimerHandles()
    await runSignInProbePass(makeDeps())

    expect(handles.length).toBeGreaterThanOrEqual(SIGN_IN_STORES.length)
    for (const handle of handles) {
      expect(handle.unref).toHaveBeenCalled()
    }
    expect(jest.getTimerCount()).toBe(0)
  })

  it('leaves no timer pending after a pass whose probes were all bounded', async () => {
    const pass = runSignInProbePass(
      makeDeps({
        legendary: { probe: () => new Promise(() => undefined) },
        gog: { probe: () => new Promise(() => undefined) }
      })
    )
    await jest.advanceTimersByTimeAsync(SIGN_IN_PROBE_BOUND_MS)
    await pass
    expect(jest.getTimerCount()).toBe(0)
  })

  it('unrefs the first-run setImmediate and creates no interval', async () => {
    const handles = trackTimerHandles()
    mockConnectivity.online = true
    startSignInProbePass({
      allowInTestWorker: true,
      deps: onlyStore(
        'gog',
        recordingProbe('gog', () => Promise.resolve('healthy'))
      )
    })
    const immediates = handles.filter((h) => h.name === 'setImmediate')
    expect(immediates).toHaveLength(1)
    expect(immediates[0].unref).toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(0)
    expect(probeCalls).toEqual(['gog'])
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('single-flight (D-03, RESEARCH Pitfall 7)', () => {
  it('coalesces requests made during a pass into exactly one further pass, never overlapping', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const gates: Array<ReturnType<typeof deferred<SignInProbeOutcome>>> = []
    const deps = onlyStore(
      'gog',
      recordingProbe('gog', () => {
        concurrent += 1
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        const gate = deferred<SignInProbeOutcome>()
        gates.push(gate)
        return gate.promise.finally(() => {
          concurrent -= 1
        })
      })
    )

    requestSignInProbePass(deps)
    requestSignInProbePass(deps)
    requestSignInProbePass(deps)
    requestSignInProbePass(deps)
    expect(probeCalls).toEqual(['gog'])

    gates[0].resolve('healthy')
    await new Promise((resolve) => setImmediate(resolve))
    // The coalesced re-run started once the first pass settled.
    expect(probeCalls).toEqual(['gog', 'gog'])

    gates[1].resolve('healthy')
    await new Promise((resolve) => setImmediate(resolve))
    expect(probeCalls).toEqual(['gog', 'gog'])
    expect(maxConcurrent).toBe(1)
  })

  it('runs a fresh pass for a request made after the previous pass settled', async () => {
    const deps = onlyStore(
      'gog',
      recordingProbe('gog', () => Promise.resolve('healthy'))
    )
    requestSignInProbePass(deps)
    await new Promise((resolve) => setImmediate(resolve))
    requestSignInProbePass(deps)
    await new Promise((resolve) => setImmediate(resolve))
    expect(probeCalls).toEqual(['gog', 'gog'])
  })
})

describe('edge gating (D-03, T-49-23)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  const gogOnly = () =>
    onlyStore(
      'gog',
      recordingProbe('gog', () => Promise.resolve('healthy'))
    )

  it('runs once on a repeated online, again after offline then online, and again after check-online then online', async () => {
    mockConnectivity.online = true
    startSignInProbePass({ allowInTestWorker: true, deps: gogOnly() })
    await jest.advanceTimersByTimeAsync(0)
    expect(probeCalls).toHaveLength(1)

    fire('online', 'online')
    await jest.advanceTimersByTimeAsync(0)
    expect(probeCalls).toHaveLength(1)

    fire('offline', 'online')
    await jest.advanceTimersByTimeAsync(0)
    expect(probeCalls).toHaveLength(2)

    fire('check-online', 'online')
    await jest.advanceTimersByTimeAsync(0)
    expect(probeCalls).toHaveLength(3)

    fire('online')
    await jest.advanceTimersByTimeAsync(0)
    expect(probeCalls).toHaveLength(3)
  })

  it('starts nothing while offline until the first online event', async () => {
    mockConnectivity.online = false
    startSignInProbePass({ allowInTestWorker: true, deps: gogOnly() })
    await jest.advanceTimersByTimeAsync(0)
    expect(probeCalls).toHaveLength(0)

    fire('check-online')
    await jest.advanceTimersByTimeAsync(0)
    expect(probeCalls).toHaveLength(0)

    fire('online')
    await jest.advanceTimersByTimeAsync(0)
    expect(probeCalls).toHaveLength(1)
  })

  it('does not re-run on a timer', async () => {
    mockConnectivity.online = true
    startSignInProbePass({ allowInTestWorker: true, deps: gogOnly() })
    await jest.advanceTimersByTimeAsync(0)
    await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(probeCalls).toHaveLength(1)
  })
})

describe('test-worker guard', () => {
  it('registers no listener and starts nothing under jest without the opt-in', async () => {
    mockConnectivity.online = true
    startSignInProbePass()
    expect(mockConnectivity.listeners).toHaveLength(0)
    await new Promise((resolve) => setImmediate(resolve))
    expect(mockUsers.calls).toEqual([])
  })

  it('registers its listener once with the opt-in, however many times it is called', () => {
    startSignInProbePass({ allowInTestWorker: true, deps: makeDeps() })
    expect(mockConnectivity.listeners).toHaveLength(1)
    startSignInProbePass({ allowInTestWorker: true, deps: makeDeps() })
    expect(mockConnectivity.listeners).toHaveLength(1)
  })
})

describe('outcome map and verdict (D-08)', () => {
  it('publishes the outcome map exactly once per pass', async () => {
    await runSignInProbePass(makeDeps())
    expect(publishCount()).toBe(1)
    await runSignInProbePass(makeDeps())
    expect(publishCount()).toBe(2)
  })

  it('records an outcome for a completed probe and latches an expired one through applySignInVerdict', async () => {
    await runSignInProbePass(
      makeDeps({
        gog: { probe: () => Promise.resolve('expired') },
        steam: { probe: () => Promise.resolve('unknown') }
      })
    )
    expect(getSignInProbeOutcomes()).toEqual({
      legendary: 'healthy',
      gog: 'expired',
      nile: 'healthy',
      humble: 'healthy',
      steam: 'unknown'
    })
    expect(fakeStores.gog.sets).toEqual([['expired', true]])
    expect(fakeStores.steam.sets).toEqual([])
    expect(fakeStores.steam.deletes).toEqual([])
  })

  it('does not record the outcome of a stale probe', async () => {
    const gate = deferred<SignInProbeOutcome>()
    const pass = runSignInProbePass(
      makeDeps({
        gog: { probe: recordingProbe('gog', () => gate.promise) }
      })
    )
    // A sign-in completes while the probe is still in flight.
    bumpSignInEpoch('gog')
    gate.resolve('expired')
    await pass

    expect(getSignInProbeOutcomes().gog).toBeUndefined()
    expect(getSignInProbeOutcomes().legendary).toBe('healthy')
    expect(fakeStores.gog.sets).toEqual([])
    expect(publishCount()).toBe(1)
  })

  it('survives a probe that rejects: unknown, no write, the pass still completes', async () => {
    await runSignInProbePass(
      makeDeps({ nile: { probe: () => Promise.reject(new Error('boom')) } })
    )
    expect(getSignInProbeOutcomes().nile).toBe('unknown')
    expect(fakeStores.nile.sets).toEqual([])
    expect(publishCount()).toBe(1)
  })
})

describe('default registrations (D-14, D-15, D-21)', () => {
  it('routes each store to its own probe, labels the Humble read boot-probe, and never opens the Steam CM', async () => {
    for (const store of SIGN_IN_STORES) {
      mockUsers.loggedIn[store] = true
    }
    await runSignInProbePass()

    expect([...mockUsers.calls].sort()).toEqual(
      [
        'legendary:probe',
        'gog:probe',
        'nile:probe',
        'humble:boot-probe',
        'steam:probeCredentialPresence'
      ].sort()
    )
    expect(mockUsers.ensureConnectedCalls).toBe(0)
  })

  it('does not probe a store whose logged-in flag is false', async () => {
    mockUsers.loggedIn.gog = true
    await runSignInProbePass()
    expect(mockUsers.calls).toEqual(['gog:probe'])
  })
})

describe('R8: the pass only ever aborts its own probes', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  it('passes only SIGN_IN_PROBE_ABORT_IDS values to callAbortController', async () => {
    const pass = runSignInProbePass(
      makeDeps({
        legendary: {
          abortId: SIGN_IN_PROBE_ABORT_IDS.legendary,
          probe: () => new Promise(() => undefined)
        },
        gog: {
          abortId: SIGN_IN_PROBE_ABORT_IDS.gog,
          probe: () => new Promise(() => undefined)
        },
        nile: {
          abortId: SIGN_IN_PROBE_ABORT_IDS.nile,
          probe: () => new Promise(() => undefined)
        },
        humble: { probe: () => new Promise(() => undefined) },
        steam: { probe: () => new Promise(() => undefined) }
      })
    )
    await jest.advanceTimersByTimeAsync(SIGN_IN_PROBE_BOUND_MS)
    await pass

    const ids = abortMock.mock.calls.map(([id]) => id)
    expect(ids.length).toBe(3)
    for (const id of ids) {
      expect(Object.values(SIGN_IN_PROBE_ABORT_IDS)).toContain(id)
    }
  })

  it('keeps one distinct abort id per spawn-based probe', () => {
    // The default registrations are resolved through runnerProbes, whose ids
    // are the contract with callRunner's abort controllers.
    expect(Object.values(SIGN_IN_PROBE_ABORT_IDS).sort()).toEqual(
      [
        'gogdl-get-credentials',
        'signin-probe-legendary',
        'signin-probe-nile'
      ].sort()
    )
  })
})

describe('logging carries labels only (T-49-24)', () => {
  it('emits [signInProbe] lines and never an error message', async () => {
    await runSignInProbePass(
      makeDeps({
        nile: {
          probe: () => Promise.reject(new Error('token=SECRET-VALUE-123'))
        }
      })
    )
    const lines = [...logInfoMock.mock.calls, ...logWarningMock.mock.calls].map(
      ([message]) => String(message)
    )
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line.startsWith('[signInProbe] ')).toBe(true)
      expect(line).not.toContain('SECRET-VALUE-123')
    }
    expect(
      lines.some((l) => l.startsWith('[signInProbe] pass started stores='))
    ).toBe(true)
    expect(
      lines.some((l) => l.startsWith('[signInProbe] pass complete outcomes='))
    ).toBe(true)
    expect(
      lines.some((l) =>
        /^\[signInProbe\] gog outcome=healthy elapsed=\d+ms$/.test(l)
      )
    ).toBe(true)
  })
})

describe('src/backend/signInProbe/pass.ts source gates (D-04, T-49-23, P3)', () => {
  const code = stripSourceComments(
    readFileSync(join(__dirname, '..', 'pass.ts'), 'utf8')
  )

  it('creates no interval', () => {
    expect(code).not.toMatch(/setInterval/)
  })

  it('unrefs at least its two kinds of timer handle', () => {
    expect(
      (code.match(/\.unref(\?\.)?\(\)/g) ?? []).length
    ).toBeGreaterThanOrEqual(2)
  })

  it('reads no env var except the JEST_WORKER_ID test-worker guard', () => {
    const reads = code.match(/process\.env(\.\w+|\[[^\]]*\])?/g) ?? []
    expect(reads.length).toBeGreaterThan(0)
    for (const read of reads) {
      expect(read).toBe('process.env.JEST_WORKER_ID')
    }
  })

  it('has no platform or build branch', () => {
    for (const banned of [
      'GAMELIB_DEV_SECRET_VAULT',
      'NODE_ENV',
      'isMac',
      'isWindows',
      'isLinux'
    ]) {
      expect({ banned, hit: code.includes(banned) }).toEqual({
        banned,
        hit: false
      })
    }
  })

  it('never reaches AppSettings or registers an IPC handler', () => {
    expect(code).not.toMatch(
      /GlobalConfig|setSetting|addHandler|backend\/config/
    )
  })

  it('imports nothing from electron', () => {
    expect(code).not.toMatch(/froms+'electron'/)
  })

  it('has no call site for requestSignInProbePass or runSignInProbePass outside pass.ts and __tests__', () => {
    const srcRoot = join(__dirname, '..', '..', '..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '__tests__') {
          continue
        }
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (
          !/\.(ts|tsx)$/.test(name) ||
          full.endsWith(join('signInProbe', 'pass.ts'))
        ) {
          continue
        }
        const stripped = stripSourceComments(readFileSync(full, 'utf8'))
        if (/(requestSignInProbePass|runSignInProbePass)\(/.test(stripped)) {
          offenders.push(full)
        }
      }
    }
    walk(srcRoot)
    expect(offenders).toEqual([])
  })
})
