/**
 * Pure cache + rate-limit helpers for the ITAD adapter (Phase 47).
 *
 * No timers by design (sidecar exit contract, gamelib-conventions): the 429 block expires by
 * timestamp comparison only. All mutable state lives inside `createItadGate`'s closure.
 */
import { createHash } from 'node:crypto'
import type { ItadCacheEntry } from './stores'

/** D-08: a search/deals entry younger than this is fresh. */
export const ITAD_FRESH_MS = 60 * 60 * 1000
/** D-10: an appid->gid mapping is fresh this long. */
export const ITAD_GID_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** D-10: an unmapped (null) appid is retried after this long. */
export const ITAD_GID_MISS_TTL_MS = 24 * 60 * 60 * 1000
export const ITAD_PRICES_ENTRY_CAP = 500
const RETRY_AFTER_DEFAULT_MS = 60_000
const RETRY_AFTER_MIN_MS = 1_000
const RETRY_AFTER_MAX_MS = 15 * 60_000

type EntryStore<T> = {
  get(key: string): ItadCacheEntry<T> | undefined
  set(key: string, value: ItadCacheEntry<T>): void
  delete(key: string): void
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Hashed so dots in a title never reach the store key (dots are path separators). */
export function searchCacheKey(country: string, query: string): string {
  const hash = createHash('sha256')
    .update(normalizeQuery(query))
    .digest('hex')
    .slice(0, 32)
  return `search:${country}:${hash}`
}

/** The caller guarantees `gid` is a validated UUID. */
export function dealsCacheKey(country: string, gid: string): string {
  return `deals:${country}:${gid}`
}

/** The caller guarantees `appId` is digits only. */
export function gidCacheKey(appId: string): string {
  return `app${appId}`
}

export function readEntry<T>(
  store: Pick<EntryStore<T>, 'get'>,
  key: string,
  now: number,
  freshMs: number
): { entry: ItadCacheEntry<T>; fresh: boolean } | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  return { entry, fresh: now - entry.fetchedAt < freshMs }
}

const INDEX_KEY = 'index'

export function writePriceEntry<T>(
  store: EntryStore<unknown>,
  key: string,
  data: T,
  now: number
): void {
  store.set(key, { data, fetchedAt: now })
  const existing = store.get(INDEX_KEY)?.data
  const prior = Array.isArray(existing)
    ? existing.filter((k): k is string => typeof k === 'string')
    : []
  const index = [...prior.filter((k) => k !== key), key]
  while (index.length > ITAD_PRICES_ENTRY_CAP) {
    const oldest = index.shift()
    if (oldest !== undefined) store.delete(oldest)
  }
  store.set(INDEX_KEY, { data: index, fetchedAt: now })
}

export function writeGidEntry(
  store: Pick<EntryStore<string | null>, 'set'>,
  appId: string,
  gid: string | null,
  now: number
): void {
  store.set(gidCacheKey(appId), { data: gid, fetchedAt: now })
}

export function isGidEntryFresh(
  entry: ItadCacheEntry<string | null>,
  now: number
): boolean {
  const ttl = entry.data === null ? ITAD_GID_MISS_TTL_MS : ITAD_GID_TTL_MS
  return now - entry.fetchedAt < ttl
}

export function parseRetryAfter(
  header: string | undefined,
  now: number
): number {
  let ms = RETRY_AFTER_DEFAULT_MS
  if (header !== undefined) {
    const trimmed = header.trim()
    if (/^\d+$/.test(trimmed)) {
      ms = Number(trimmed) * 1000
    } else {
      const date = Date.parse(trimmed)
      if (!Number.isNaN(date)) ms = date - now
    }
  }
  return Math.min(RETRY_AFTER_MAX_MS, Math.max(RETRY_AFTER_MIN_MS, ms))
}

export interface ItadGate {
  isBlocked(now: number): boolean
  blockedUntil(): number
  block(durationMs: number, now: number): void
  singleFlight<T>(key: string, run: () => Promise<T>): Promise<T>
}

export function createItadGate(): ItadGate {
  let until = 0
  const inflight = new Map<string, Promise<unknown>>()
  return {
    isBlocked: (now) => now < until,
    blockedUntil: () => until,
    block(durationMs, now) {
      until = Math.max(until, now + durationMs)
    },
    singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key)
      if (existing) return existing as Promise<T>
      const p = run().finally(() => {
        inflight.delete(key)
      })
      inflight.set(key, p)
      return p
    }
  }
}
