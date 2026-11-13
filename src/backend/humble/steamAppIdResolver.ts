import axios from 'axios'
import { logInfo, LogPrefix } from 'backend/logger'

/**
 * Title -> Steam app id resolver for Humble Steam keys (quick 261114-ca6).
 *
 * Humble's library API no longer carries `steam_app_id`, so the exact "Owned
 * on Steam" tier in dedup.ts could never fire. This module resolves an id
 * from the key title via Steam's public store search and caches the answer.
 *
 * Why storesearch and not CheapShark: CheapShark is a third-party deal index
 * (games without deals or a null steamAppID never resolve) and is a non-Steam
 * intermediary for a Steam-identity question.
 *
 * Precision rule: accept only a UNIQUE `type === 'app'` item whose strictly
 * normalized name equals the strictly normalized title. Ambiguity and
 * near-misses (sequels, "Deluxe Edition") are misses. common/matching/
 * titleMatch.ts normalizeTitle is deliberately NOT reused: it strips ALL
 * parentheticals and edition suffixes, which would equate "X" with
 * "X Deluxe Edition", the exact near-miss this rule must reject.
 *
 * Exit contract (Skill("gamelib-conventions"), "The sidecar's exit contract"):
 * half 1, the inter-request sleep timer is unref'd; half 2, a pass is bounded
 * by a request cap, an 8s per-request timeout, stop-on-first-error and a
 * stale-fence stop, so no unbounded in-flight work is left at boot.
 *
 * Only titles ever reach this module: never key values, cookies or tokens.
 */

export const STEAM_STORE_SEARCH_URL =
  'https://store.steampowered.com/api/storesearch/'
export const HUMBLE_APPID_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const HUMBLE_APPID_REQUEST_GAP_MS = 350
export const HUMBLE_APPID_RESOLVE_CAP = 40
export const HUMBLE_APPID_REQUEST_TIMEOUT_MS = 8000

export type HumbleSteamAppIdCacheEntry = {
  appId: string | null
  checkedAt: number
}

/** The slice of CacheStore the resolver needs (structural, so tests can use a Map). */
interface HumbleSteamAppIdCache {
  get(key: string): HumbleSteamAppIdCacheEntry | undefined
  set(key: string, value: HumbleSteamAppIdCacheEntry): unknown
}

export type SteamStoreSearchItem = { type: string; name: string; id: number }

interface ResolveSummary {
  requested: number
  resolved: number
  cached: number
  misses: number
  errors: number
  deferred: number
}

export interface SteamAppIdResolver {
  lookupCached(title: string): string | undefined
  resolvePending(
    titles: string[],
    opts: { isStale: () => boolean }
  ): Promise<ResolveSummary>
}

const STEAM_SUFFIX_RE =
  /(?:\s*\(steam(?: key)?\)|\s*\[steam\]|\s+steam key|\s+-\s*steam(?: key)?)\s*$/i
const STEAM_KEY_DASH_RE = /\s+-\s*steam key\s*$/i

export function normalizeForAppIdMatch(title: string): string {
  // Strip the symbols BEFORE NFKD: it decomposes ™ into the letters "TM".
  let s = title
    .replace(/[™®©]/g, '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim()
  let prev: string
  do {
    prev = s
    s = s.replace(STEAM_KEY_DASH_RE, '').replace(STEAM_SUFFIX_RE, '').trim()
  } while (s !== prev)
  return s.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function pickConfidentAppId(
  title: string,
  items: SteamStoreSearchItem[]
): string | null {
  const want = normalizeForAppIdMatch(title)
  if (!want) return null
  const ids = new Set<number>()
  for (const item of items) {
    if (item.type !== 'app') continue
    if (normalizeForAppIdMatch(item.name) === want) ids.add(item.id)
  }
  if (ids.size !== 1) return null
  const [only] = [...ids]
  return String(only)
}

export async function searchSteamStoreApps(
  term: string
): Promise<SteamStoreSearchItem[]> {
  const { data } = await axios.get<unknown>(STEAM_STORE_SEARCH_URL, {
    params: { term, l: 'english', cc: 'US' },
    timeout: HUMBLE_APPID_REQUEST_TIMEOUT_MS,
    headers: { 'User-Agent': 'GameLib' }
  })
  // A 200 without an `items` array (HTML error/rate-limit/captive-portal page)
  // is an error, not a miss: throwing keeps it out of the 7-day miss cache.
  if (typeof data !== 'object' || data === null) {
    throw new Error('Steam store search: unexpected response shape')
  }
  const items: unknown = (data as { items?: unknown }).items
  if (!Array.isArray(items)) {
    throw new Error('Steam store search: response has no items array')
  }
  const out: SteamStoreSearchItem[] = []
  for (const raw of items as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue
    const { type, name, id } = raw as Record<string, unknown>
    if (
      typeof type === 'string' &&
      typeof name === 'string' &&
      typeof id === 'number' &&
      Number.isFinite(id)
    ) {
      out.push({ type, name, id })
    }
  }
  return out
}

export function unrefSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    t.unref?.()
  })
}

export function createSteamAppIdResolver(deps: {
  cache: HumbleSteamAppIdCache
  search?: (term: string) => Promise<SteamStoreSearchItem[]>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}): SteamAppIdResolver {
  const search = deps.search ?? searchSteamStoreApps
  const sleep = deps.sleep ?? unrefSleep
  const now = deps.now ?? Date.now
  const { cache } = deps

  return {
    lookupCached(title) {
      const key = normalizeForAppIdMatch(title)
      if (!key) return undefined
      const entry = cache.get(key)
      return entry && entry.appId ? entry.appId : undefined
    },

    async resolvePending(titles, opts) {
      const summary: ResolveSummary = {
        requested: 0,
        resolved: 0,
        cached: 0,
        misses: 0,
        errors: 0,
        deferred: 0
      }
      const seen = new Map<string, string>()
      for (const title of titles) {
        const key = normalizeForAppIdMatch(title)
        if (key && !seen.has(key)) seen.set(key, title)
      }
      const total = seen.size
      if (total === 0) return summary

      const pending: Array<[string, string]> = []
      for (const [key, title] of seen) {
        const entry = cache.get(key)
        if (entry && entry.appId) {
          summary.cached++
          summary.resolved++
        } else if (
          entry &&
          entry.appId === null &&
          now() - entry.checkedAt < HUMBLE_APPID_MISS_TTL_MS
        ) {
          summary.cached++
          summary.misses++
        } else {
          pending.push([key, title])
        }
      }

      let i = 0
      for (; i < pending.length; i++) {
        const [key, title] = pending[i] as [string, string]
        if (i >= HUMBLE_APPID_RESOLVE_CAP) break
        if (opts.isStale()) break
        if (summary.requested > 0) await sleep(HUMBLE_APPID_REQUEST_GAP_MS)
        summary.requested++
        let items: SteamStoreSearchItem[]
        try {
          items = await search(title)
        } catch {
          summary.errors++
          break
        }
        const appId = pickConfidentAppId(title, items)
        cache.set(key, { appId, checkedAt: now() })
        if (appId) summary.resolved++
        else summary.misses++
      }
      // A request that errored is not answered, so it stays deferred too.
      summary.deferred = pending.length - (summary.requested - summary.errors)

      logInfo(
        [
          `Humble: resolved ${summary.resolved}/${total} Steam app ids (${summary.cached} cached, ${summary.misses} misses, ${summary.errors} errors, ${summary.deferred} deferred)`
        ],
        LogPrefix.Backend
      )
      return summary
    }
  }
}
