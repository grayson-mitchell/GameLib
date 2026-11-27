/**
 * 66.4-17: the boot-owned app runtime. Two runtimes share nothing (event bus, launch flights);
 * launch single-flight joins per table (88.3-18: the table is Rust's, so the flights are the glue over a fake of it, one fake
 * per runtime unless a test hands two runtimes the same one); the frontend-ready flag flips once per
 * instance; construction arms nothing. (The CrossOver index fetch layer and memo it once held are
 * Rust's, 86-19, and their cases moved with the TS module, 86-24.)
 */
import * as logger from 'backend/logger'

import { createFakeLaunchFlightTransport } from 'backend/testUtils/fakeLaunchFlightTransport'
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import type { GameStatus } from 'common/types'

beforeEach(() => {
  jest.spyOn(logger, 'logInfo').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logError').mockImplementation(() => undefined)
})
afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('createAppRuntime', () => {
  it('construction arms no timer and adds no listener', () => {
    jest.useFakeTimers()
    const runtime = createTestAppRuntime()
    expect(jest.getTimerCount()).toBe(0)
    expect(runtime.events.eventNames()).toEqual([])
  })

  it('two runtimes have independent event buses', () => {
    const a = createTestAppRuntime()
    const b = createTestAppRuntime()
    const onB = jest.fn()
    b.events.on('languageChanged', onB)
    a.events.emit('languageChanged')
    expect(onB).not.toHaveBeenCalled()
    b.events.emit('languageChanged')
    expect(onB).toHaveBeenCalledTimes(1)
  })

  it('carries the typed progress and status events on one bus', () => {
    const { events } = createTestAppRuntime()
    const onProgress = jest.fn()
    events.on('progressUpdate-app', onProgress)
    const status = { appName: 'app', runner: 'gog' } as unknown as GameStatus
    events.emit('progressUpdate-app', status)
    expect(onProgress).toHaveBeenCalledWith(status)
  })

  it('the frontend-ready flag flips once per instance', () => {
    const a = createTestAppRuntime()
    const b = createTestAppRuntime()
    expect(a.protocol.isFrontendReady()).toBe(false)
    a.protocol.markFrontendReady()
    a.protocol.markFrontendReady()
    expect(a.protocol.isFrontendReady()).toBe(true)
    expect(b.protocol.isFrontendReady()).toBe(false)
  })
})

describe('launch single-flight (the glue over the Rust table)', () => {
  it('joins a second launch of the same game and runs the owner once', async () => {
    const { launchFlights } = createTestAppRuntime()
    let release!: (v: string) => void
    const run = jest.fn(
      () => new Promise<string>((resolve) => (release = resolve))
    )
    const onJoin = jest.fn()
    const first = launchFlights.singleFlightLaunch('gog', 'g1', onJoin, run)
    const second = launchFlights.singleFlightLaunch('gog', 'g1', onJoin, run)
    await new Promise(setImmediate)
    release('done')
    await expect(first).resolves.toBe('done')
    await expect(second).resolves.toBe('done')
    expect(run).toHaveBeenCalledTimes(1)
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  it('releases the entry when the owner settles', async () => {
    const { launchFlights } = createTestAppRuntime()
    const run = jest.fn().mockResolvedValue('x')
    await launchFlights.singleFlightLaunch('gog', 'g1', jest.fn(), run)
    await Promise.resolve()
    await launchFlights.singleFlightLaunch('gog', 'g1', jest.fn(), run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('joins across runtimes that share one Rust table', async () => {
    const shared = createFakeLaunchFlightTransport()
    const a = createTestAppRuntime(shared.deps)
    const b = createTestAppRuntime(shared.deps)
    let release!: (v: string) => void
    const runA = jest.fn(
      () => new Promise<string>((resolve) => (release = resolve))
    )
    const runB = jest.fn().mockResolvedValue('b')
    const owner = a.launchFlights.singleFlightLaunch(
      'gog',
      'g1',
      jest.fn(),
      runA
    )
    const joiner = b.launchFlights.singleFlightLaunch(
      'gog',
      'g1',
      jest.fn(),
      runB
    )
    await new Promise(setImmediate)
    release('a')
    await expect(owner).resolves.toBe('a')
    await expect(joiner).resolves.toBe('a')
    expect(runB).not.toHaveBeenCalled()
  })

  it('does not join across runtimes with their own tables', async () => {
    const a = createTestAppRuntime()
    const b = createTestAppRuntime()
    let release!: () => void
    const pending = new Promise<void>((resolve) => (release = resolve))
    const runA = jest.fn(() => pending)
    const runB = jest.fn().mockResolvedValue(undefined)
    const owner = a.launchFlights.singleFlightLaunch(
      'gog',
      'g1',
      jest.fn(),
      runA
    )
    await b.launchFlights.singleFlightLaunch('gog', 'g1', jest.fn(), runB)
    expect(runB).toHaveBeenCalledTimes(1)
    release()
    await owner
  })
})
