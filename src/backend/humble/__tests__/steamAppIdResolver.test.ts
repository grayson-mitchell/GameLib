/**
 * Unit tests for the Humble title -> Steam app id resolver (quick 261114-ca6).
 * Everything is injected: search, sleep, cache and clock.
 */

const mockLogInfo = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import {
  HUMBLE_APPID_MISS_TTL_MS,
  HUMBLE_APPID_REQUEST_GAP_MS,
  HUMBLE_APPID_RESOLVE_CAP,
  createSteamAppIdResolver,
  normalizeForAppIdMatch,
  pickConfidentAppId,
  unrefSleep
} from '../steamAppIdResolver'
import type {
  HumbleSteamAppIdCacheEntry,
  SteamStoreSearchItem
} from '../steamAppIdResolver'

const app = (name: string, id: number, type = 'app'): SteamStoreSearchItem => ({
  type,
  name,
  id
})

describe('normalizeForAppIdMatch', () => {
  it.each([
    ['Portal 2™', 'portal 2'],
    ['Hades (Steam)', 'hades'],
    ['Celeste - Steam Key', 'celeste'],
    ['Celeste [Steam]', 'celeste'],
    ['Celeste (Steam Key)', 'celeste'],
    ['Celeste Steam Key', 'celeste'],
    ['Pokémon-ish: Café', 'pokemon ish cafe'],
    ["Tom Clancy's® X", 'tom clancy s x']
  ])('%s -> %s', (input, expected) => {
    expect(normalizeForAppIdMatch(input)).toBe(expected)
  })

  it('keeps edition words and other parentheticals', () => {
    expect(normalizeForAppIdMatch('Celeste Deluxe Edition')).toBe(
      'celeste deluxe edition'
    )
    expect(normalizeForAppIdMatch('Game (Demo)')).toBe('game demo')
  })

  it('does not equate X with X Deluxe Edition', () => {
    expect(normalizeForAppIdMatch('X')).not.toBe(
      normalizeForAppIdMatch('X Deluxe Edition')
    )
  })
})

describe('pickConfidentAppId', () => {
  it('returns the unique exact normalized match', () => {
    expect(
      pickConfidentAppId('Celeste', [
        app('Celeste Deluxe Edition', 1),
        app('celeste', 504230)
      ])
    ).toBe('504230')
  })

  it.each([
    ['Hollow Knight', [app('Hollow Knight: Silksong', 1)]],
    ['Celeste', [app('Celeste Deluxe Edition', 1)]],
    ['Portal', [app('Portal 2', 1)]],
    ['Hades', [app('Hades II', 1)]],
    ['Celeste', [app('Celeste', 1, 'dlc')]],
    ['Celeste', [app('Celeste', 1, 'bundle')]],
    ['DOOM', [app('DOOM', 1), app('DOOM', 2)]],
    ['Celeste', []],
    ['', [app('', 1)]]
  ])('rejects %s', (title, items) => {
    expect(pickConfidentAppId(title, items)).toBeNull()
  })

  it('accepts the same id listed twice', () => {
    expect(pickConfidentAppId('DOOM', [app('DOOM', 1), app('DOOM', 1)])).toBe(
      '1'
    )
  })
})

type Cache = Map<string, HumbleSteamAppIdCacheEntry>
function makeCache(): {
  map: Cache
  cache: {
    get: (k: string) => HumbleSteamAppIdCacheEntry | undefined
    set: (k: string, v: HumbleSteamAppIdCacheEntry) => void
  }
} {
  const map: Cache = new Map()
  return {
    map,
    cache: {
      get: (k) => map.get(k),
      set: (k, v) => {
        map.set(k, v)
      }
    }
  }
}

const NOW = 1_800_000_000_000

describe('createSteamAppIdResolver', () => {
  beforeEach(() => {
    mockLogInfo.mockClear()
  })

  function build(
    search: jest.Mock,
    opts: { sleeps?: number[]; now?: () => number } = {}
  ) {
    const c = makeCache()
    const sleeps = opts.sleeps ?? []
    const resolver = createSteamAppIdResolver({
      cache: c.cache,
      search,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      now: opts.now ?? (() => NOW)
    })
    return { ...c, resolver, sleeps }
  }

  it('does not request cached hits or fresh misses; re-requests stale misses', async () => {
    const search = jest.fn(async () => [app('Old Miss', 7)])
    const { map, resolver } = build(search)
    map.set('hit', {
      appId: '1',
      checkedAt: NOW - 1000 * HUMBLE_APPID_MISS_TTL_MS
    })
    map.set('fresh miss', { appId: null, checkedAt: NOW - 1000 })
    map.set('old miss', {
      appId: null,
      checkedAt: NOW - HUMBLE_APPID_MISS_TTL_MS - 1
    })
    const summary = await resolver.resolvePending(
      ['Hit', 'Fresh Miss', 'Old Miss'],
      { isStale: () => false }
    )
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('Old Miss')
    expect(map.get('old miss')).toEqual({ appId: '7', checkedAt: NOW })
    expect(summary.requested).toBe(1)
  })

  it('stores a fresh miss as appId null', async () => {
    const search = jest.fn(async () => [])
    const { map, resolver } = build(search)
    await resolver.resolvePending(['Nothing Here'], { isStale: () => false })
    expect(map.get('nothing here')).toEqual({ appId: null, checkedAt: NOW })
  })

  it('does not cache an error and stops the pass', async () => {
    const search = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([])
    const { map, resolver } = build(search)
    const summary = await resolver.resolvePending(['A', 'B', 'C'], {
      isStale: () => false
    })
    expect(search).toHaveBeenCalledTimes(1)
    expect(map.size).toBe(0)
    expect(summary.errors).toBe(1)
    expect(summary.deferred).toBe(3)
  })

  it('searches sequentially with N-1 gaps and dedupes by normalized key', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const search = jest.fn(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight--
      return []
    })
    const sleeps: number[] = []
    const { resolver } = build(search, { sleeps })
    await resolver.resolvePending(['A', 'B', 'b (Steam)', 'C'], {
      isStale: () => false
    })
    expect(search).toHaveBeenCalledTimes(3)
    expect(maxInFlight).toBe(1)
    expect(sleeps).toEqual([
      HUMBLE_APPID_REQUEST_GAP_MS,
      HUMBLE_APPID_REQUEST_GAP_MS
    ])
    expect(HUMBLE_APPID_REQUEST_GAP_MS).toBe(350)
  })

  it('caps requests per pass and counts the rest as deferred', async () => {
    const search = jest.fn(async () => [])
    const { resolver } = build(search)
    const titles = Array.from({ length: 45 }, (_, i) => `Title ${i}`)
    const summary = await resolver.resolvePending(titles, {
      isStale: () => false
    })
    expect(HUMBLE_APPID_RESOLVE_CAP).toBe(40)
    expect(search).toHaveBeenCalledTimes(40)
    expect(summary.deferred).toBe(5)
  })

  it('stops before the next request when stale', async () => {
    const search = jest.fn(async () => [])
    const { resolver } = build(search)
    let calls = 0
    const summary = await resolver.resolvePending(['A', 'B', 'C'], {
      isStale: () => ++calls > 1
    })
    expect(search).toHaveBeenCalledTimes(1)
    expect(summary.deferred).toBe(2)
  })

  it('logs exactly one summary line', async () => {
    const search = jest.fn(async (term: string) =>
      term === 'Fresh Hit' ? [app('Fresh Hit', 9)] : []
    )
    const { map, resolver } = build(search)
    map.set('cached hit', { appId: '5', checkedAt: NOW })
    await resolver.resolvePending(
      ['Cached Hit', 'Fresh Hit', 'Fresh Miss', 'Another Miss'],
      { isStale: () => false }
    )
    expect(mockLogInfo).toHaveBeenCalledTimes(1)
    expect(mockLogInfo).toHaveBeenCalledWith(
      [
        'Humble: resolved 2/4 Steam app ids (1 cached, 2 misses, 0 errors, 0 deferred)'
      ],
      'Backend'
    )
  })

  it('logs nothing when there are no eligible titles', async () => {
    const { resolver } = build(jest.fn())
    await resolver.resolvePending(['', '   '], { isStale: () => false })
    expect(mockLogInfo).not.toHaveBeenCalled()
  })

  it('lookupCached returns hits only and never searches', () => {
    const search = jest.fn()
    const { map, resolver } = build(search)
    map.set('celeste', { appId: '504230', checkedAt: NOW })
    map.set('missy', { appId: null, checkedAt: NOW })
    expect(resolver.lookupCached('Celeste (Steam)')).toBe('504230')
    expect(resolver.lookupCached('Missy')).toBeUndefined()
    expect(resolver.lookupCached('Unknown')).toBeUndefined()
    expect(search).not.toHaveBeenCalled()
  })
})

describe('unrefSleep', () => {
  it('unrefs its timer', async () => {
    jest.useFakeTimers()
    try {
      const unref = jest.fn()
      const realSetTimeout = global.setTimeout
      const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
        fn: () => void,
        ms?: number
      ) => {
        const t = realSetTimeout(fn, ms) as unknown as { unref?: () => void }
        t.unref = unref
        return t
      }) as unknown as typeof setTimeout)
      const p = unrefSleep(10)
      jest.advanceTimersByTime(10)
      await p
      expect(unref).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    } finally {
      jest.useRealTimers()
    }
  })
})
