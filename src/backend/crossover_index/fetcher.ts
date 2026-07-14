import { readFileSync } from 'graceful-fs'
import { join } from 'path'
import { gunzipSync } from 'node:zlib'
import type { z } from 'zod'

import { publicDir } from 'backend/constants/paths'
import { axiosClient } from 'backend/utils'
import { logError, logInfo, LogPrefix } from 'backend/logger'

import { crossoverIndexStore, type CachedIndex } from './electronStore'

/**
 * D-19: the single seam this plan introduces — parameterized by index
 * IDENTITY (name/url/schema), not a plugin registry or dynamic-dispatch
 * framework. One real consumer (the CrossOver compatibility index) exists
 * today; the deferred `mac-arch-overrides.json` index adds a second const of
 * this shape and calls the same `loadIndex` — no further abstraction is
 * warranted.
 */
export interface IndexDescriptor<T> {
  /** CacheStore key + log identity. */
  name: string
  /** The rolling-release asset URL. MUST be https (T-19-03). */
  url: string
  /** Filename joined onto `publicDir` for the bundled fallback snapshot. */
  bundledPath: string
  /** D-09 validator. */
  schema: z.ZodType<T>
  /** D-08 staleness window, in minutes. */
  ttlMinutes: number
}

/** 5 MB cap — the DoS/oversized-payload bound (T-19-02), mirroring Phase
 * 16's MAX_CONTENT_LENGTH. */
const MAX_CONTENT_LENGTH = 5 * 1024 * 1024

function parseGzippedJson(buffer: ArrayBuffer | Buffer): unknown {
  const gunzipped = gunzipSync(Buffer.from(buffer as ArrayBuffer))
  return JSON.parse(gunzipped.toString('utf-8'))
}

/**
 * Reads the build-time bundled snapshot from `publicDir` and validates it
 * like any other external payload (T-19-01). An ABSENT snapshot (ENOENT — a
 * fresh clone / contributor build without the gitignored artifact) is a
 * NORMAL cold-start, not an error: logs at info and returns null without
 * throwing. Any other read/parse/validation failure is treated the same way
 * — this is a best-effort fallback, never a hard requirement.
 */
function loadBundledSnapshot<T>(desc: IndexDescriptor<T>): T | null {
  try {
    const buffer = readFileSync(join(publicDir, desc.bundledPath))
    const json = parseGzippedJson(buffer)
    const parsed = desc.schema.safeParse(json)
    if (!parsed.success) {
      logInfo(
        ['Bundled snapshot failed validation for', desc.name, '— cold start'],
        LogPrefix.Backend
      )
      return null
    }
    return parsed.data
  } catch {
    logInfo(
      ['No bundled snapshot for', desc.name, '— cold start'],
      LogPrefix.Backend
    )
    return null
  }
}

/**
 * WR-01 fix: when neither a cached last-good value nor a fresh fetch is
 * available, the bundled snapshot is the only data we have — but it was
 * previously only ever *returned* to the caller, never written into
 * `crossoverIndexStore`. `crossoverIndexHas()` (the synchronous D-13
 * self-heal probe) reads that store directly and never calls `loadIndex()`,
 * so on a machine where the network fetch has never once succeeded, the
 * store stayed empty forever even though every real lookup was quietly
 * being served by the bundled snapshot. Persisting it here means both paths
 * see the SAME "last good" data. `fetchedAt: Date.now()` intentionally
 * treats "just fell back to the bundled snapshot" the same as "just fetched
 * successfully" for TTL purposes — consistent with D-08's own "never fetch
 * more than daily cadence" philosophy, and it still self-heals to the real
 * network payload the next time the TTL expires and a fetch succeeds.
 */
function persistBundledFallback<T>(desc: IndexDescriptor<T>): T | null {
  const bundled = loadBundledSnapshot(desc)
  if (bundled) {
    crossoverIndexStore.set(desc.name, {
      data: bundled,
      fetchedAt: Date.now()
    })
  }
  return bundled
}

/**
 * D-19 generic fetch → gunzip → validate → keep-last-good layer. On ANY
 * failure (schema rejection, network error, gunzip/JSON error, oversized
 * payload) it returns the last-good cached value, falling back to the
 * bundled snapshot, falling back to null — and NEVER throws further and
 * NEVER overwrites a good cached value with a bad one (D-09 / T-19-01,
 * T-19-05).
 */
export async function loadIndex<T>(
  desc: IndexDescriptor<T>
): Promise<T | null> {
  const cached = crossoverIndexStore.get(desc.name) as
    | CachedIndex<T>
    | undefined

  if (cached) {
    const minutesSinceFetch = (Date.now() - cached.fetchedAt) / 1000 / 60
    if (minutesSinceFetch <= desc.ttlMinutes) {
      return cached.data
    }
  }

  try {
    const { data } = await axiosClient.get<ArrayBuffer>(desc.url, {
      responseType: 'arraybuffer',
      maxContentLength: MAX_CONTENT_LENGTH
    })

    const json = parseGzippedJson(data)
    const parsed = desc.schema.safeParse(json)

    if (!parsed.success) {
      logError(
        ['Rejected index payload', desc.name, parsed.error.issues],
        LogPrefix.Backend
      )
      return cached?.data ?? persistBundledFallback(desc)
    }

    crossoverIndexStore.set(desc.name, {
      data: parsed.data,
      fetchedAt: Date.now()
    })
    return parsed.data
  } catch (error) {
    logError(
      ['Index refresh failed, keeping last good', desc.name, error],
      LogPrefix.Backend
    )
    return cached?.data ?? persistBundledFallback(desc)
  }
}
