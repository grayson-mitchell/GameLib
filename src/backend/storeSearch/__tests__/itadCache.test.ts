import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ITAD_FRESH_MS,
  ITAD_GID_MISS_TTL_MS,
  ITAD_GID_TTL_MS,
  createItadGate,
  dealsCacheKey,
  gidCacheKey,
  isGidEntryFresh,
  parseRetryAfter,
  readEntry,
  searchCacheKey,
  writePriceEntry
} from '../itadCache'
import type { ItadCacheEntry } from '../stores'

function fakeStore<T>() {
  const m = new Map<string, ItadCacheEntry<T>>()
  return {
    m,
    get: (k: string) => m.get(k),
    set: (k: string, v: ItadCacheEntry<T>) => void m.set(k, v),
    delete: (k: string) => void m.delete(k)
  }
}

const NOW = 1_700_000_000_000

describe('keys', () => {
  it('hashes dotted queries and normalizes', () => {
    const k = searchCacheKey('US', 'S.T.A.L.K.E.R.')
    expect(k).not.toContain('.')
    expect(k.startsWith('search:US:')).toBe(true)
    expect(searchCacheKey('US', '  Portal  ')).toBe(
      searchCacheKey('US', 'portal')
    )
    expect(dealsCacheKey('DE', '018d937f-0f7e-7172-b2c5-9a6e6b4e38a1')).toBe(
      'deals:DE:018d937f-0f7e-7172-b2c5-9a6e6b4e38a1'
    )
    expect(gidCacheKey('220')).toBe('app220')
  })
})

describe('readEntry', () => {
  it('reports fresh and stale, retaining stale', () => {
    const s = fakeStore<string>()
    expect(readEntry(s, 'k', NOW, ITAD_FRESH_MS)).toBeUndefined()
    s.set('k', { data: 'x', fetchedAt: NOW })
    expect(readEntry(s, 'k', NOW + 59 * 60_000, ITAD_FRESH_MS)?.fresh).toBe(
      true
    )
    const stale = readEntry(s, 'k', NOW + 61 * 60_000, ITAD_FRESH_MS)
    expect(stale?.fresh).toBe(false)
    expect(stale?.entry.data).toBe('x')
  })
})

describe('writePriceEntry', () => {
  it('bounds the store at 500 entries', () => {
    const s = fakeStore<unknown>()
    for (let i = 0; i < 501; i++) writePriceEntry(s, `k${i}`, i, NOW + i)
    expect(s.get('k0')).toBeUndefined()
    expect(s.get('k1')).toBeDefined()
    expect((s.get('index')?.data as string[]).length).toBe(500)
  })
})

describe('gid freshness', () => {
  it('uses 30 days for a gid and 1 day for a miss', () => {
    expect(
      isGidEntryFresh({ data: 'g', fetchedAt: NOW }, NOW + ITAD_GID_TTL_MS - 1)
    ).toBe(true)
    expect(
      isGidEntryFresh(
        { data: null, fetchedAt: NOW },
        NOW + ITAD_GID_MISS_TTL_MS
      )
    ).toBe(false)
    expect(
      isGidEntryFresh({ data: 'g', fetchedAt: NOW }, NOW + ITAD_GID_MISS_TTL_MS)
    ).toBe(true)
  })
})

describe('parseRetryAfter', () => {
  it('parses and clamps', () => {
    expect(parseRetryAfter('120', NOW)).toBe(120000)
    expect(parseRetryAfter(undefined, NOW)).toBe(60000)
    expect(parseRetryAfter('garbage', NOW)).toBe(60000)
    expect(parseRetryAfter('0', NOW)).toBe(1000)
    expect(parseRetryAfter('99999', NOW)).toBe(900000)
    const date = new Date(NOW + 30_000).toUTCString()
    expect(parseRetryAfter(date, NOW - (NOW % 1000))).toBe(
      Date.parse(date) - (NOW - (NOW % 1000))
    )
  })
})

describe('gate', () => {
  it('blocks by timestamp and never shortens', () => {
    const g = createItadGate()
    expect(g.isBlocked(NOW)).toBe(false)
    g.block(30000, NOW)
    expect(g.isBlocked(NOW + 29999)).toBe(true)
    expect(g.isBlocked(NOW + 30000)).toBe(false)
    g.block(1000, NOW)
    expect(g.blockedUntil()).toBe(NOW + 30000)
  })

  it('single-flights and clears after rejection', async () => {
    const g = createItadGate()
    let calls = 0
    let release: (v: number) => void = () => undefined
    const run = () => {
      calls++
      return new Promise<number>((r) => {
        release = r
      })
    }
    const a = g.singleFlight('k', run)
    const b = g.singleFlight('k', run)
    release(7)
    expect(await a).toBe(7)
    expect(await b).toBe(7)
    expect(calls).toBe(1)
    await expect(
      g.singleFlight('k', () => Promise.reject(new Error('x')))
    ).rejects.toThrow('x')
    expect(await g.singleFlight('k', () => Promise.resolve(3))).toBe(3)
  })
})

describe('source', () => {
  it('has no timers', () => {
    const src = readFileSync(join(__dirname, '..', 'itadCache.ts'), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    expect(src).not.toMatch(/setTimeout|setInterval/)
  })
})
