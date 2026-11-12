/**
 * 66.4-17: the boot-owned app runtime. Two runtimes share nothing (event bus, launch flights,
 * image fetches, index memo, overlay installs); launch single-flight joins per instance; the
 * CrossOver index backs off on the injected clock; the frontend-ready flag flips once per
 * instance; construction arms nothing.
 */
import * as logger from 'backend/logger'

import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createTestStoreRoot } from 'backend/testUtils/testStoreRoot'
import { axiosClient } from 'backend/utils'
import { createCrossoverIndexStores } from 'backend/crossover_index/stores'
import { crossoverIndexSchema } from 'backend/crossover_index/schema'
import type { CrossoverIndex } from 'backend/crossover_index/schema'
import {
  FAILURE_BACKOFF_MINUTES,
  type IndexDescriptor
} from 'backend/crossover_index/fetcher'
import { crossoverIndexDescriptor } from 'backend/crossover_index'
import type { GameStatus } from 'common/types'

beforeEach(() => {
  jest.spyOn(logger, 'logInfo').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logError').mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())

describe('createAppRuntime', () => {
  it('construction arms no timer and adds no listener', () => {
    const clock = createFakeClock()
    const runtime = createTestAppRuntime({ clock })
    expect(clock.pendingCount()).toBe(0)
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

describe('launch single-flight', () => {
  it('joins a second launch of the same game and runs the owner once', async () => {
    const { launchFlights } = createTestAppRuntime()
    let release!: (v: string) => void
    const run = jest.fn(
      () => new Promise<string>((resolve) => (release = resolve))
    )
    const onJoin = jest.fn()
    const first = launchFlights.singleFlightLaunch('gog', 'g1', onJoin, run)
    const second = launchFlights.singleFlightLaunch('gog', 'g1', onJoin, run)
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

  it('does not join across runtimes', async () => {
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

describe('crossover index', () => {
  const stores = {
    crossoverIndex: createCrossoverIndexStores({ root: createTestStoreRoot() })
  }
  const deps = { stores }
  const index = (generatedAt: string, name = 'Game'): CrossoverIndex => ({
    version: 1,
    generatedAt,
    entries: Array.from({ length: 1000 }, (_, i) => ({
      name: i === 0 ? name : `Filler ${i}`,
      rating: 3
    }))
  })
  const stale: IndexDescriptor<CrossoverIndex> = {
    name: 'app-runtime-stale',
    url: 'https://example.com/index.json.gz',
    bundledPath: 'absent.json.gz',
    schema: crossoverIndexSchema,
    ttlMinutes: 60
  }

  beforeEach(() => stores.crossoverIndex.crossoverIndexStore.clear())

  it('backs off after a failure and retries once the window elapses on the injected clock', async () => {
    const clock = createFakeClock(Date.now())
    const { crossoverFetcher } = createTestAppRuntime({ clock })
    stores.crossoverIndex.crossoverIndexStore.set(stale.name, {
      data: index('2026-01-01T00:00:00.000Z'),
      fetchedAt: clock.now() - 1000 * 60 * 60 * 25
    })
    const get = jest
      .spyOn(axiosClient, 'get')
      .mockRejectedValue(new Error('network down'))
    await crossoverFetcher.loadIndex(deps, stale)
    await crossoverFetcher.loadIndex(deps, stale)
    expect(get).toHaveBeenCalledTimes(1)
    clock.advance(FAILURE_BACKOFF_MINUTES * 60 * 1000 + 1000)
    await crossoverFetcher.loadIndex(deps, stale)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('the backoff is per runtime: a second boot retries at once', async () => {
    const clock = createFakeClock(Date.now())
    const a = createTestAppRuntime({ clock })
    const b = createTestAppRuntime({ clock })
    stores.crossoverIndex.crossoverIndexStore.set(stale.name, {
      data: index('2026-01-01T00:00:00.000Z'),
      fetchedAt: clock.now() - 1000 * 60 * 60 * 25
    })
    const get = jest
      .spyOn(axiosClient, 'get')
      .mockRejectedValue(new Error('network down'))
    await a.crossoverFetcher.loadIndex(deps, stale)
    await b.crossoverFetcher.loadIndex(deps, stale)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('memoizes the maps per runtime and rebuilds when generatedAt swaps', async () => {
    const a = createTestAppRuntime({ clock: createFakeClock(Date.now()) })
    const set = (generatedAt: string, name: string) =>
      stores.crossoverIndex.crossoverIndexStore.set(
        crossoverIndexDescriptor.name,
        { data: index(generatedAt, name), fetchedAt: Date.now() }
      )
    const game = { runner: 'gog', app_name: 'x', title: 'Zork' } as const
    set('2026-01-01T00:00:00.000Z', 'Zork')
    const get = jest.spyOn(axiosClient, 'get')
    expect(a.crossoverIndex.crossoverIndexHas(deps, game)).toBe(true)
    // Same generatedAt, different payload: the memo is returned, so the stale map still answers.
    set('2026-01-01T00:00:00.000Z', 'Other')
    expect(a.crossoverIndex.crossoverIndexHas(deps, game)).toBe(true)
    // A fresh runtime has no memo, so it sees the new payload.
    const b = createTestAppRuntime()
    expect(b.crossoverIndex.crossoverIndexHas(deps, game)).toBe(false)
    // A new generatedAt rebuilds.
    set('2026-02-01T00:00:00.000Z', 'Other')
    expect(a.crossoverIndex.crossoverIndexHas(deps, game)).toBe(false)
    expect(get).not.toHaveBeenCalled()
  })
})
