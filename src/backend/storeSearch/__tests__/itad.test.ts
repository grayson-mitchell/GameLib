/**
 * Unit tests for the ITAD adapter (Phase 47). axios is mocked: no live network. Responses come from
 * the key-free real fixtures under ./fixtures/itad.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import axios from 'axios'
import { logError, logWarning } from 'backend/logger'
import { defined } from 'backend/testUtils/indexed'
import {
  STORE_SEARCH_ERROR_MARKER,
  type StoreSearchErrorCode
} from 'common/types/storeSearch'
import {
  ITAD_LOOKUP_BATCH_SIZE,
  ITAD_SEARCH_RESULTS_PARAM
} from '../itadCoverage'
import {
  ITAD_FRESH_MS,
  ITAD_GID_MISS_TTL_MS,
  createItadGate
} from '../itadCache'
import type { ItadCacheEntry } from '../stores'
import {
  StoreSearchError,
  getGameDeals,
  lookupSteamGids,
  searchGames,
  type ItadDeps
} from '../itad'

jest.mock('axios')
jest.mock('backend/logger')
const mockedAxios = axios as jest.Mocked<typeof axios>

const KEY = 'FAKEKEY-123'
const T0 = 1_700_000_000_000

const GID_A = '018d937f-012f-73b8-ab2c-898516969e6a'
const GID_B = '018d937f-1212-7232-b23f-a046f6fd4a57'
const GID_C = '018d937f-1749-73f8-bf5a-8e0aa3cdd9ff'
const GID_UNPRICED = '018d937f-0000-7000-8000-000000000001'

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function fixture(name: string): any {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'itad', `${name}.json`), 'utf8')
  )
}

const pricesUS: Json[] = fixture('prices-US')
const searchPortal: Json[] = fixture('search-portal')
const lookupSteam: Record<string, string> = fixture('lookup-steam')

/** Three priced games (the prices fixture ids) plus one that ITAD returns no deals for. */
const searchItems = [
  {
    id: GID_A,
    title: 'Half-Life 2',
    assets: { banner145: 'https://a/145.jpg' }
  },
  { id: GID_B, title: 'Overwatch', assets: { boxart: 'https://a/box.jpg' } },
  { id: GID_UNPRICED, title: 'Unpriced', assets: {} },
  { id: GID_C, title: 'Portal' }
]

function fakeStore<T>() {
  const m = new Map<string, ItadCacheEntry<T>>()
  return {
    m,
    get: (k: string) => m.get(k),
    set: (k: string, v: ItadCacheEntry<T>) => void m.set(k, v),
    delete: (k: string) => void m.delete(k)
  }
}

function axiosErr(status: number | undefined, headers: Json = {}): Error {
  return Object.assign(
    new Error(
      `Request failed for https://api.isthereanydeal.com/x?key=${KEY} (${status})`
    ),
    {
      config: {
        url: `https://api.isthereanydeal.com/x?key=${KEY}`,
        params: { key: KEY }
      },
      response: status === undefined ? undefined : { status, headers }
    }
  )
}

let clockMs: number
let deps: ItadDeps

beforeEach(() => {
  jest.resetAllMocks()
  clockMs = T0
  deps = {
    appInfo: { version: '1.2.3-test' },
    stores: {
      storeSearch: {
        itadPricesStore: fakeStore<unknown>(),
        itadSteamGidsStore: fakeStore<string | null>()
      }
    },
    miscRuntime: { itadGate: createItadGate() },
    now: () => clockMs,
    env: { GAMELIB_ITAD_API_KEY: KEY }
  }
})

function serve(items: unknown, prices: unknown) {
  mockedAxios.get.mockResolvedValue({ data: items })
  mockedAxios.post.mockResolvedValue({ data: prices })
}

async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p
  } catch (e) {
    return e as Error
  }
  throw new Error('expected a rejection')
}

function codeOf(e: Error): StoreSearchErrorCode {
  expect(e).toBeInstanceOf(StoreSearchError)
  return (e as StoreSearchError).code
}

describe('searchGames', () => {
  it('searches then prices in two calls and returns the cheapest deal per game', async () => {
    serve(searchItems, pricesUS)

    const res = await searchGames(deps, 'portal', 'US')

    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
    const get = defined(mockedAxios.get.mock.calls[0], 'search call')
    expect(get[0]).toBe('https://api.isthereanydeal.com/games/search/v1')
    expect(get[1]?.params).toEqual({
      title: 'portal',
      [ITAD_SEARCH_RESULTS_PARAM]: 20,
      key: KEY
    })
    expect(get[1]?.headers).toEqual({ 'User-Agent': 'GameLib/1.2.3-test' })

    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
    const post = defined(mockedAxios.post.mock.calls[0], 'prices call')
    expect(post[0]).toBe('https://api.isthereanydeal.com/games/prices/v3')
    expect(post[1]).toEqual([GID_A, GID_B, GID_UNPRICED, GID_C])
    expect(post[2]?.params).toEqual({ country: 'US', key: KEY })

    expect(res.pricedCountry).toBe('US')
    expect(res.results.map((r) => r.gameId)).toEqual([GID_A, GID_B, GID_C])
    const [a, b] = res.results
    expect(defined(a, 'row a')).toMatchObject({
      title: 'Half-Life 2',
      cheapestPrice: '9.99',
      currencyCode: 'USD',
      thumb: 'https://a/145.jpg'
    })
    // GID_B ties at 49.99: store name ascending puts Blizzard before Steam.
    expect(defined(b, 'row b').buyUrl).toBe(pricesUS[1]?.deals[0].url)
    expect(defined(b, 'row b').thumb).toBe('https://a/box.jpg')
    for (const r of res.results) expect(r).not.toHaveProperty('cachedAt')
    for (const r of res.results) expect(r).not.toHaveProperty('steamAppId')
  })

  it('drops a game with no current deals (D-11), against the real search fixture', async () => {
    serve(searchPortal, pricesUS)

    const res = await searchGames(deps, 'portal', 'US')

    // 20 search items, prices only for three ids of which one (Portal) is in the search.
    expect(res.results.map((r) => r.title)).toEqual(['Portal'])
    // G-47-7: Portal carries banner145, banner300 and boxart; the row takes banner300.
    expect(defined(res.results[0], 'portal row').thumb).toMatch(
      /\/banner300\.jpg/
    )
  })

  it('prefers banner300 over banner145 for a row thumbnail (G-47-7)', async () => {
    serve(
      [
        {
          id: GID_A,
          title: 'Half-Life 2',
          assets: {
            banner145: 'https://a/145.jpg',
            banner300: 'https://a/300.jpg',
            boxart: 'https://a/box.jpg'
          }
        }
      ],
      pricesUS
    )

    const res = await searchGames(deps, 'half-life', 'US')

    expect(defined(res.results[0], 'row a').thumb).toBe('https://a/300.jpg')
  })

  it('passes the deal url through byte-for-byte', async () => {
    const url =
      'https://itad.link/abc/?app=tagwff&u=https%3A%2F%2Fx.example%2Fa%20b#frag'
    const prices = JSON.parse(JSON.stringify(pricesUS)) as Json[]
    defined(prices[0], 'prices[0]').deals[0].url = url
    serve(searchItems, prices)

    const res = await searchGames(deps, 'hl', 'US')

    expect(defined(res.results[0], 'row').buyUrl).toBe(url)
    const deals = await getGameDeals(deps, GID_A, 'US')
    expect(defined(deals[0], 'deal').buyUrl).toBe(url)
  })

  it('drops non-https deals and the row when none remain', async () => {
    const prices = JSON.parse(JSON.stringify(pricesUS)) as Json[]
    const base = defined(prices[0], 'prices[0]').deals[0]
    prices[0] = {
      ...prices[0],
      deals: [
        { ...base, url: 'http://itad.link/insecure' },
        { ...base, url: 'javascript:alert(1)' }
      ]
    }
    // GID_B keeps its Steam deal but gains a cheaper insecure one that must be skipped.
    const b = defined(prices[1], 'prices[1]')
    b.deals = [
      {
        ...b.deals[1],
        price: { ...b.deals[1].price, amount: 1 },
        url: 'http://x/y'
      },
      b.deals[1]
    ]
    serve(searchItems, prices)

    const res = await searchGames(deps, 'hl', 'US')

    expect(res.results.map((r) => r.gameId)).toEqual([GID_B, GID_C])
    expect(defined(res.results[0], 'row').cheapestPrice).toBe('49.99')
    expect(defined(res.results[0], 'row').buyUrl).toBe(
      pricesUS[1]?.deals[1].url
    )
  })

  it('prices an unlisted country as US and says so (D-13)', async () => {
    serve(searchItems, pricesUS)

    const res = await searchGames(deps, 'portal', 'XX')

    const post = defined(mockedAxios.post.mock.calls[0], 'prices call')
    expect(post[2]?.params).toEqual({ country: 'US', key: KEY })
    expect(res.pricedCountry).toBe('US')
  })

  it('retries once as US when ITAD answers the country with a 4xx', async () => {
    mockedAxios.get.mockResolvedValue({ data: searchItems })
    mockedAxios.post
      .mockRejectedValueOnce(axiosErr(400))
      .mockResolvedValueOnce({ data: pricesUS })

    const res = await searchGames(deps, 'portal', 'DE')

    expect(mockedAxios.post).toHaveBeenCalledTimes(2)
    expect(defined(mockedAxios.post.mock.calls[0], 'first')[2]?.params).toEqual(
      {
        country: 'DE',
        key: KEY
      }
    )
    expect(
      defined(mockedAxios.post.mock.calls[1], 'second')[2]?.params
    ).toEqual({
      country: 'US',
      key: KEY
    })
    expect(res.pricedCountry).toBe('US')
    expect(res.results).toHaveLength(3)
  })

  it('does not retry a 403 as US (bad key) and surfaces a provider error', async () => {
    mockedAxios.get.mockResolvedValue({ data: searchItems })
    mockedAxios.post.mockRejectedValue(axiosErr(403))

    const e = await rejection(searchGames(deps, 'portal', 'DE'))

    expect(codeOf(e)).toBe('provider')
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
  })

  it('makes no request within an hour of a cached search (D-08)', async () => {
    serve(searchItems, pricesUS)
    const first = await searchGames(deps, 'Portal', 'US')
    jest.clearAllMocks()

    clockMs = T0 + ITAD_FRESH_MS - 1
    const second = await searchGames(deps, '  portal ', 'US')

    expect(mockedAxios.get).not.toHaveBeenCalled()
    expect(mockedAxios.post).not.toHaveBeenCalled()
    expect(second).toEqual(first)
    for (const r of second.results) expect(r).not.toHaveProperty('cachedAt')
  })

  it('serves stale rows with cachedAt on 429 and holds the gate until Retry-After', async () => {
    serve(searchItems, pricesUS)
    await searchGames(deps, 'portal', 'US')
    jest.clearAllMocks()

    clockMs = T0 + 2 * ITAD_FRESH_MS
    mockedAxios.get.mockRejectedValue(axiosErr(429, { 'retry-after': '120' }))
    const stale = await searchGames(deps, 'portal', 'US')

    expect(stale.results).toHaveLength(3)
    for (const r of stale.results) expect(r.cachedAt).toBe(T0)
    const gate = deps.miscRuntime.itadGate
    expect(gate.isBlocked(clockMs + 119_000)).toBe(true)
    expect(gate.isBlocked(clockMs + 120_000)).toBe(false)

    jest.clearAllMocks()
    clockMs += 10_000
    const again = await searchGames(deps, 'portal', 'US')
    expect(mockedAxios.get).not.toHaveBeenCalled()
    expect(mockedAxios.post).not.toHaveBeenCalled()
    for (const r of again.results) expect(r.cachedAt).toBe(T0)
  })

  it('throws rateLimited on 429 with no cache', async () => {
    mockedAxios.get.mockRejectedValue(axiosErr(429, { 'retry-after': '30' }))

    const e = await rejection(searchGames(deps, 'portal', 'US'))

    expect(codeOf(e)).toBe('rateLimited')
    expect(e.message.startsWith(STORE_SEARCH_ERROR_MARKER.rateLimited)).toBe(
      true
    )
  })

  it('serves cache on a network error, else throws provider', async () => {
    mockedAxios.get.mockRejectedValue(axiosErr(undefined))
    const noCache = await rejection(searchGames(deps, 'portal', 'US'))
    expect(codeOf(noCache)).toBe('provider')

    jest.resetAllMocks()
    serve(searchItems, pricesUS)
    await searchGames(deps, 'portal', 'US')
    clockMs = T0 + 2 * ITAD_FRESH_MS
    mockedAxios.get.mockRejectedValue(axiosErr(undefined))
    const stale = await searchGames(deps, 'portal', 'US')
    expect(stale.results).toHaveLength(3)
    for (const r of stale.results) expect(r.cachedAt).toBe(T0)
  })

  it('throws notConfigured with no key and makes no request (D-03)', async () => {
    deps.env = {}

    const e = await rejection(searchGames(deps, 'portal', 'US'))

    expect(codeOf(e)).toBe('notConfigured')
    expect(mockedAxios.get).not.toHaveBeenCalled()
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('never puts the key in a log call or a thrown message', async () => {
    mockedAxios.get.mockRejectedValue(axiosErr(500))

    const e = await rejection(searchGames(deps, 'portal', 'US'))
    mockedAxios.post.mockRejectedValue(axiosErr(503))
    await lookupSteamGids(deps, ['220'])

    expect(e.message).not.toContain(KEY)
    expect(e.message).toBe(`${STORE_SEARCH_ERROR_MARKER.provider} search 500`)
    const logged = JSON.stringify([
      (logError as jest.Mock).mock.calls,
      (logWarning as jest.Mock).mock.calls
    ])
    expect(logged).toContain('status=500')
    expect(logged).not.toContain(KEY)
    expect(logged).not.toContain('isthereanydeal')
  })

  it('single-flights two concurrent identical searches', async () => {
    serve(searchItems, pricesUS)

    const [a, b] = await Promise.all([
      searchGames(deps, 'portal', 'US'),
      searchGames(deps, 'portal', 'US')
    ])

    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('caches an empty search without pricing it', async () => {
    mockedAxios.get.mockResolvedValue({ data: [] })

    const res = await searchGames(deps, 'zzzz', 'US')

    expect(res).toEqual({ results: [], pricedCountry: 'US' })
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('formats a zero-decimal currency from amount (JPY)', async () => {
    serve(searchItems, fixture('prices-zeroDecimal'))

    const res = await searchGames(deps, 'portal', 'JP')

    expect(defined(res.results[0], 'row')).toMatchObject({
      cheapestPrice: '1400',
      currencyCode: 'JPY'
    })
    expect(res.pricedCountry).toBe('JP')
  })
})

describe('getGameDeals', () => {
  it('is a cache hit after a search warmed it', async () => {
    serve(searchItems, pricesUS)
    await searchGames(deps, 'portal', 'US')
    jest.clearAllMocks()

    const deals = await getGameDeals(deps, GID_B, 'US')

    expect(mockedAxios.post).not.toHaveBeenCalled()
    expect(deals.map((d) => d.storeName)).toEqual(['Blizzard', 'Steam'])
  })

  it('posts [gid], sorts by price then store name and maps runners', async () => {
    const money = (n: number) => ({
      amount: n,
      amountInt: n * 100,
      currency: 'USD'
    })
    const deal = (id: number, name: string, n: number) => ({
      shop: { id, name },
      price: money(n),
      regular: money(20),
      url: `https://itad.link/${id}`
    })
    mockedAxios.post.mockResolvedValue({
      data: [
        {
          id: GID_A,
          deals: [
            deal(61, 'Steam', 5),
            deal(35, 'GOG', 3),
            deal(16, 'Epic Game Store', 3),
            deal(4, 'Blizzard', 9)
          ]
        }
      ]
    })

    const deals = await getGameDeals(deps, GID_A, 'US')

    const post = defined(mockedAxios.post.mock.calls[0], 'call')
    expect(post[1]).toEqual([GID_A])
    expect(deals.map((d) => [d.storeName, d.price, d.runner])).toEqual([
      ['Epic Game Store', '3', 'legendary'],
      ['GOG', '3', 'gog'],
      ['Steam', '5', 'steam'],
      ['Blizzard', '9', undefined]
    ])
  })

  it('serves stale deals with cachedAt on 429, throws rateLimited without a cache', async () => {
    mockedAxios.post.mockRejectedValue(axiosErr(429, { 'retry-after': '60' }))
    const none = await rejection(getGameDeals(deps, GID_A, 'US'))
    expect(codeOf(none)).toBe('rateLimited')

    jest.resetAllMocks()
    deps.miscRuntime = { itadGate: createItadGate() }
    mockedAxios.post.mockResolvedValue({ data: pricesUS })
    await getGameDeals(deps, GID_A, 'US')
    clockMs = T0 + 2 * ITAD_FRESH_MS
    mockedAxios.post.mockRejectedValue(axiosErr(429))

    const stale = await getGameDeals(deps, GID_A, 'US')

    expect(stale).toHaveLength(1)
    expect(defined(stale[0], 'deal').cachedAt).toBe(T0)
  })

  it('rejects a non-UUID game id before any I/O', async () => {
    const e = await rejection(getGameDeals(deps, 'a.b', 'US'))

    expect(codeOf(e)).toBe('provider')
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })
})

describe('lookupSteamGids', () => {
  it('posts app/<id> keyless to the Steam lookup route and maps the response', async () => {
    mockedAxios.post.mockResolvedValue({ data: lookupSteam })

    const out = await lookupSteamGids(deps, ['220', '400', 'abc', '220'])

    expect(out).toEqual({ '220': GID_A, '400': GID_C })
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
    const call = defined(mockedAxios.post.mock.calls[0], 'call')
    expect(call[0]).toBe('https://api.isthereanydeal.com/lookup/id/shop/61/v1')
    expect(call[1]).toEqual(['app/220', 'app/400'])
    expect(call[2]).not.toHaveProperty('params')
  })

  it('makes no second request for already-persisted ids', async () => {
    mockedAxios.post.mockResolvedValue({ data: lookupSteam })
    await lookupSteamGids(deps, ['220', '400'])
    jest.clearAllMocks()

    const out = await lookupSteamGids(deps, ['220', '400'])

    expect(mockedAxios.post).not.toHaveBeenCalled()
    expect(out).toEqual({ '220': GID_A, '400': GID_C })
  })

  it('caches a null mapping and retries it only after the miss TTL', async () => {
    mockedAxios.post.mockResolvedValue({ data: { 'app/999': null } })
    expect(await lookupSteamGids(deps, ['999'])).toEqual({})
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)

    clockMs = T0 + ITAD_GID_MISS_TTL_MS - 1
    await lookupSteamGids(deps, ['999'])
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)

    clockMs = T0 + ITAD_GID_MISS_TTL_MS
    await lookupSteamGids(deps, ['999'])
    expect(mockedAxios.post).toHaveBeenCalledTimes(2)
  })

  it('chunks by ITAD_LOOKUP_BATCH_SIZE', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} })
    const ids = Array.from({ length: ITAD_LOOKUP_BATCH_SIZE + 1 }, (_, i) =>
      String(i + 1)
    )

    await lookupSteamGids(deps, ids)

    expect(mockedAxios.post).toHaveBeenCalledTimes(2)
    expect(
      (defined(mockedAxios.post.mock.calls[0], 'c0')[1] as string[]).length
    ).toBe(ITAD_LOOKUP_BATCH_SIZE)
    expect(
      (defined(mockedAxios.post.mock.calls[1], 'c1')[1] as string[]).length
    ).toBe(1)
  })

  it('returns the partial map and logs one status-only warning when a chunk fails', async () => {
    const ids = Array.from({ length: ITAD_LOOKUP_BATCH_SIZE + 1 }, (_, i) =>
      String(i + 1)
    )
    mockedAxios.post
      .mockResolvedValueOnce({ data: { 'app/1': GID_A } })
      .mockRejectedValueOnce(axiosErr(503))

    const out = await lookupSteamGids(deps, ids)

    expect(out).toEqual({ '1': GID_A })
    expect(logWarning).toHaveBeenCalledTimes(1)
    expect(
      String(defined((logWarning as jest.Mock).mock.calls[0], 'warn')[0])
    ).toContain('status=503')
  })
})

describe('user key precedence and rejected-key fallback (D-05, D-06)', () => {
  const USERKEY = 'USERKEY-987'
  const ENVKEY = KEY

  function fakeSecrets(initial: string | null = USERKEY) {
    let rejected = false
    return {
      getApiKey: jest.fn(async () => initial ?? undefined),
      isRejected: jest.fn(() => rejected),
      markRejected: jest.fn(() => {
        rejected = true
      })
    }
  }

  const searchKeys = () =>
    mockedAxios.get.mock.calls.map((c) => (c[1]?.params as Json).key)
  const priceKeys = () =>
    mockedAxios.post.mock.calls.map((c) => (c[2]?.params as Json).key)

  it('sends the user key when one is set', async () => {
    deps.itadSecrets = fakeSecrets()
    serve(searchItems, pricesUS)

    await searchGames(deps, 'portal', 'US')

    expect(searchKeys()).toEqual([USERKEY])
    expect(priceKeys()).toEqual([USERKEY])
  })

  it('uses the built-in key when the user key is unset', async () => {
    deps.itadSecrets = fakeSecrets(null)
    serve(searchItems, pricesUS)

    await searchGames(deps, 'portal', 'US')

    expect(searchKeys()).toEqual([ENVKEY])
    expect(priceKeys()).toEqual([ENVKEY])
  })

  it('uses the built-in key when there is no itadSecrets owner at all', async () => {
    serve(searchItems, pricesUS)

    await searchGames(deps, 'portal', 'US')

    expect(searchKeys()).toEqual([ENVKEY])
  })

  it.each([401, 403])(
    'on a %i for the user key marks it rejected and retries once with the built-in key',
    async (status) => {
      const secrets = fakeSecrets()
      deps.itadSecrets = secrets
      mockedAxios.get
        .mockRejectedValueOnce(axiosErr(status))
        .mockResolvedValue({ data: searchItems })
      mockedAxios.post.mockResolvedValue({ data: pricesUS })

      const res = await searchGames(deps, 'portal', 'US')

      expect(res.results).toHaveLength(3)
      expect(secrets.markRejected).toHaveBeenCalledTimes(1)
      expect(searchKeys()).toEqual([USERKEY, ENVKEY])
      expect(priceKeys()).toEqual([ENVKEY])

      // A later search goes straight to the built-in key.
      mockedAxios.get.mockClear()
      mockedAxios.post.mockClear()
      await searchGames(deps, 'another', 'US')
      expect(searchKeys()).toEqual([ENVKEY])
      expect(secrets.markRejected).toHaveBeenCalledTimes(1)
    }
  )

  it('falls back on a rejected user key for the deals request too', async () => {
    const secrets = fakeSecrets()
    deps.itadSecrets = secrets
    mockedAxios.post
      .mockRejectedValueOnce(axiosErr(403))
      .mockResolvedValue({ data: pricesUS })

    const deals = await getGameDeals(deps, GID_A, 'US')

    expect(deals.length).toBeGreaterThan(0)
    expect(secrets.markRejected).toHaveBeenCalledTimes(1)
    expect(priceKeys()).toEqual([USERKEY, ENVKEY])
  })

  it('rejects notConfigured after one request when the user key is rejected and there is no built-in key', async () => {
    deps.env = {}
    const secrets = fakeSecrets()
    deps.itadSecrets = secrets
    mockedAxios.get.mockRejectedValue(axiosErr(401))

    const e = await rejection(searchGames(deps, 'portal', 'US'))

    expect(codeOf(e)).toBe('notConfigured')
    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
    expect(mockedAxios.post).not.toHaveBeenCalled()
    expect(secrets.markRejected).toHaveBeenCalledTimes(1)
  })

  it('does not mark rejected nor retry when the built-in key gets a 401', async () => {
    const secrets = fakeSecrets(null)
    deps.itadSecrets = secrets
    mockedAxios.get.mockRejectedValue(axiosErr(401))

    const e = await rejection(searchGames(deps, 'portal', 'US'))

    expect(codeOf(e)).toBe('provider')
    expect(secrets.markRejected).not.toHaveBeenCalled()
    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
  })

  it('does not treat a non-auth failure of the user key as a rejection', async () => {
    const secrets = fakeSecrets()
    deps.itadSecrets = secrets
    mockedAxios.get.mockRejectedValue(axiosErr(500))

    await rejection(searchGames(deps, 'portal', 'US'))

    expect(secrets.markRejected).not.toHaveBeenCalled()
    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
  })

  it('never puts either key in a log call or a thrown message', async () => {
    deps.itadSecrets = fakeSecrets()
    mockedAxios.get.mockRejectedValue(axiosErr(401))

    const e = await rejection(searchGames(deps, 'portal', 'US'))

    const logged = [
      ...(logError as jest.Mock).mock.calls,
      ...(logWarning as jest.Mock).mock.calls
    ]
      .flat()
      .map(String)
      .join('\n')
    expect(logged).not.toContain(USERKEY)
    expect(logged).not.toContain(ENVKEY)
    expect(e.message).not.toContain(USERKEY)
    expect(e.message).not.toContain(ENVKEY)
  })
})
