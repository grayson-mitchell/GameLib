// Phase 21 (21-01): Steam depot decompress + verified-fetch primitives.
//
// Lifted near-verbatim from `.planning/spikes/002-steam-user-depot-download/steam-depot.mjs`
// (decompressChunk L70-104, sha1 L104, fetchChunk L116-145).
//
// SECURITY (T-21-03, mitigated): `fetchChunk` gates every chunk on
// `sha1(data) === chunk.sha` before returning it. A chunk that fails verification is
// retried against a DIFFERENT content server and is NEVER returned to the caller.

import { createHash } from 'node:crypto'
import { steamDecrypt } from './crypto'
import { HostHealthTracker } from './hostHealth'
import { CdnAuthTokenCache } from './cdnAuth'

/** Minimal surface of the `lzma` npm package this module depends on. */
export interface LzmaModule {
  decompress(
    input: Buffer,
    callback: (result: number[] | Buffer | string, error?: Error) => void
  ): void
}

export interface DepotChunk {
  sha: string | Buffer
  cb_original: number | string
  /** Rotation seed for fetchChunk's host-per-attempt selection (defaults to 0). */
  attemptSeed?: number
}

/**
 * Decompress a Steam chunk container: "VZ" (LZMA) or "PK" (zlib deflate).
 *
 * VZ layout (SteamKit VZipUtil):
 *   header : 'VZ'(2) | version 'a'(1) | timestamp(4) | lzma props(5)   = 12 B
 *   body   : raw LZMA stream
 *   footer : outputCrc(4) | outputSize(4) | 'zv'(2)                    = 10 B
 *
 * outputSize sits at len-6, not len-4 — the trailing 'zv' magic is 2 bytes.
 */
export async function decompressChunk(buf: Buffer, lzma: LzmaModule): Promise<Buffer> {
  const magic = buf.subarray(0, 2).toString('latin1')

  if (magic === 'VZ') {
    if (buf.subarray(-2).toString('latin1') !== 'zv') {
      throw new Error('VZ chunk: bad footer magic')
    }
    const props = buf.subarray(7, 12)
    const payload = buf.subarray(12, buf.length - 10)
    const outSize = buf.readUInt32LE(buf.length - 6)

    // Rebuild an lzma_alone header: props(5) + uncompressed size(8, LE).
    const size = Buffer.alloc(8)
    size.writeUInt32LE(outSize, 0)
    const stream = Buffer.concat([props, size, payload])

    return await new Promise<Buffer>((resolve, reject) =>
      lzma.decompress(stream, (result, err) =>
        err ? reject(err) : resolve(Buffer.from(result as number[] | Buffer))
      )
    )
  }

  if (magic === 'PK') {
    const zlib = await import('node:zlib')
    // Local file header is 30 bytes + filename + extra; inflate the raw deflate body.
    const nameLen = buf.readUInt16LE(26)
    const extraLen = buf.readUInt16LE(28)
    return zlib.inflateRawSync(buf.subarray(30 + nameLen + extraLen))
  }

  throw new Error(`unknown chunk container: ${JSON.stringify(magic)}`)
}

export const sha1 = (buf: Buffer): string => createHash('sha1').update(buf).digest('hex')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Debug/steam-install-slow-start gap closure: the CDN `fetch()` call below
 *  previously had NO timeout at all -- a slow/hung content-server connection
 *  blocked a chunk-worker slot for an unbounded time, because the "rotate to
 *  a different host on failure" retry only ever fires on a THROWN error,
 *  never on a hang. Bounding each attempt lets a stuck edge fail fast and
 *  rotate to the next host within a predictable window, instead of relying
 *  on the OS/undici default socket timeout (effectively unbounded from this
 *  code's perspective). Extends the existing retry-across-hosts mechanism —
 *  does not change its shape (still N attempts, still backed off, still
 *  host-rotating). */
export const CHUNK_FETCH_TIMEOUT_MS = 15000

/**
 * Phase 21 gap closure (21-15): the CPU section of a chunk fetch, extracted
 * out of fetchChunk so it can be run either inline (main thread, default) or
 * inside a worker_threads pool (DecompressPool). Runs decrypt -> decompress ->
 * the sha1/size integrity gate, and is the SINGLE source of that gate — never
 * returns unverified bytes.
 *
 * SECURITY (T-21-15-01, mitigated): the `sha1(decompressed) === expectedSha`
 * gate and the `length === cbOriginal` size check live here, enforced before
 * any buffer is returned to the caller, regardless of where this function
 * executes (main thread or worker isolate).
 */
export async function decodeChunk(
  encrypted: Buffer,
  key: Buffer,
  expectedSha: string,
  cbOriginal: number | string,
  lzma: LzmaModule
): Promise<Buffer> {
  const decrypted = steamDecrypt(encrypted, key)
  const data = await decompressChunk(decrypted, lzma)

  // The chunk's SHA1 is the hash of its DECOMPRESSED bytes — free integrity check.
  const got = sha1(data)
  if (got !== expectedSha) throw new Error(`chunk sha1 mismatch: ${got} != ${expectedSha}`)
  if (data.length !== Number(cbOriginal)) {
    throw new Error(`chunk size mismatch: ${data.length} != ${cbOriginal}`)
  }
  return data
}

/** Injected decoder signature fetchChunk delegates the CPU section to — the
 *  default (inline, main-thread decodeChunk) is a thin wrapper; Plan 21-15's
 *  DecompressPool passes `pool.decode` here instead, moving the CPU work off
 *  the main thread while fetchChunk keeps owning the network + retry loop. */
export type DecodeFn = (
  encrypted: Buffer,
  key: Buffer,
  expectedSha: string,
  cbOriginal: number | string
) => Promise<Buffer>

/** Debug/steam-install-slow-start (cycle 2): per-attempt observability hook.
 *  `outcome: 'timeout'` is reported ONLY when the attempt's own AbortController
 *  fired (err.name === 'AbortError') -- fetchChunk never receives an external
 *  abort signal, so an AbortError here is unambiguously CHUNK_FETCH_TIMEOUT_MS
 *  firing, never a caller-driven cancel. Purely additive: never changes retry
 *  count, backoff, or host-rotation order -- only reports what already happens. */
export type ChunkAttemptOutcome = 'success' | 'timeout' | 'error'

export interface ChunkAttemptEvent {
  host: string
  /** 0-indexed attempt number within this chunk's own retry loop. */
  attempt: number
  outcome: ChunkAttemptOutcome
  ms: number
  message?: string
}

export type OnChunkAttempt = (event: ChunkAttemptEvent) => void

/** Debug/steam-install-slow-start (cycle 7): per-host directory metadata
 *  fetchChunk needs for EXACT steam-user URL-scheme/token parity -- verified
 *  directly against the INSTALLED steam-user@5.3.0 source
 *  (node_modules/steam-user/components/cdn.js's own `downloadChunk`, ~L314-337):
 *    urlBase = (https_support === 'mandatory' ? 'https://' : 'http://') + host
 *    token   = usetokenauth == 1 ? (await getCDNAuthToken(...)).token : ''
 *  Threaded alongside (never replacing) the existing bare-hostname `hosts`
 *  array / HostHealthTracker selection -- keyed by hostname, built by
 *  depot.ts's `reduceContentServers` from the raw content-server directory
 *  response. Omitting it (every pre-cycle-7 caller/test) preserves the
 *  EXACT pre-cycle-7 URL (hardcoded `https://`, no token unless a caller
 *  ALSO happens to pass `cdnAuth` and this map explicitly marks the host
 *  `usetokenauth: true`) -- purely additive. */
export interface ContentServerHostMeta {
  httpsSupport?: string
  usetokenauth?: boolean
}

/** Debug/steam-install-slow-start (cycle 3): caps the exponential backoff
 *  sleep between attempts. Uncapped (`200 * 2**i`), an 8-attempt exhaustion
 *  could sleep up to ~25.4s total (200+400+800+1600+3200+6400+12800) on a
 *  SINGLE chunk-fetch worker slot while doing zero useful work — across the
 *  many concurrent chunk workers (FILE_CONCURRENCY x CHUNK_CONCURRENCY) this
 *  is exactly the mechanism that can collapse the aggregate attempt rate
 *  toward zero without any single request ever timing out (the definitive
 *  diagnosis's "workers starved in retry/backoff" finding). Capping bounds
 *  the worst case to ~12s (200+400+800+1600+3000+3000+3000) while leaving
 *  the backoff SHAPE (still exponential, still increasing) unchanged for the
 *  attempts that matter most (the first few, where a genuinely-transient
 *  failure is most likely to be resolved by a short pause). */
export const CHUNK_FETCH_MAX_BACKOFF_MS = 3000

/**
 * Fetch one chunk: download -> decode (decrypt+decompress+verify) -> return.
 *
 * Retries across DIFFERENT content servers. Steam's CDN edges drop connections
 * under concurrency ("fetch failed" / ECONNRESET) — this is normal and expected,
 * not a protocol error. Without retry, ~16% of chunks failed at concurrency 8.
 * Rotating hosts on each attempt is what makes the download reliable.
 *
 * The `sha1(data) === chunk.sha` gate is a security control (T-21-03), enforced
 * inside `decodeChunk`/the injected `decode` — a chunk that never verifies is
 * never returned — it throws after `attempts`.
 *
 * Debug/steam-install-slow-start (cycle 3): when `hostHealth` is supplied,
 * host selection for each attempt goes through its `pickHost` (recent
 * success-rate + latency scoring, persistently-failing hosts deprioritized —
 * see depot/hostHealth.ts) instead of the plain
 * `hosts[(attemptSeed + i) % hosts.length]` round-robin. Omitting `hostHealth`
 * (every existing caller/test before this cycle) leaves selection completely
 * unchanged — this parameter is purely additive.
 *
 * Debug/steam-install-slow-start (cycle 6, REVERTED cycle 7): cycle 6 called
 * `cdnAuth.getToken` unconditionally whenever `cdnAuth` was supplied, for
 * EVERY host. DISPROVEN by the cycle-6 hardware run: steam-user's own
 * `downloadChunk` only requests a token `if (contentServer.usetokenauth == 1)`
 * (cdn.js's own maintainer comment: "I'm not sure that any servers use token
 * auth anymore") -- our content-server directory dump shows `usetokenauth`
 * ABSENT on every real host observed so far, so the CM never answers a token
 * request for them; cycle 6's unconditional fetch blocked EVERY chunk behind
 * a 10s timeout, strangling throughput far worse than no token support at
 * all.
 *
 * Cycle 7: a token is fetched ONLY when the per-host `hostMeta` (below)
 * explicitly marks that host `usetokenauth: true` AND `cdnAuth` is supplied
 * -- exact parity with steam-user's own gate. In practice this stays
 * dormant for every content server this codebase has observed on real
 * hardware. A 401/403 response still invalidates the cached token for that
 * depot+host (only when a token was actually in play) so a future
 * usetokenauth host's NEXT attempt re-fetches rather than repeating a
 * rejected token. Omitting `cdnAuth`/`hostMeta` (every caller/test before
 * this cycle) leaves the URL exactly as before -- both parameters are purely
 * additive.
 *
 * Debug/steam-install-slow-start (cycle 7): the request scheme is now EXACT
 * steam-user parity too -- `https_support === 'mandatory' ? https : http`,
 * read from the same `hostMeta` map (see `ContentServerHostMeta` above).
 * Before this cycle every request hardcoded `https://`, which made every
 * `https_support: 'unavailable'` host (e.g. the cycle-5 hardware
 * diagnosis's `alibaba.cdn.steampipe.steamcontent.com`, HTTP-ONLY) fail
 * 100% of the time regardless of retries. Omitting `hostMeta` (every
 * pre-cycle-7 caller/test) keeps the original hardcoded `https://`.
 * SECURITY: an http request for a host the directory marks non-https is
 * unencrypted chunk transport, but the `sha1(decompressed) === chunk.sha`
 * gate (T-21-03, enforced in `decodeChunk`/the injected `decode`) already
 * verifies decrypted CONTENT regardless of transport, so tampering in
 * transit is still caught -- steam-user's own reference client does exactly
 * this. This never weakens that gate.
 */
export async function fetchChunk(
  hosts: string[],
  depotId: string,
  chunk: DepotChunk,
  key: Buffer,
  lzma: LzmaModule,
  attempts = 4,
  decode: DecodeFn = (encrypted, decodeKey, expectedSha, cbOriginal) =>
    decodeChunk(encrypted, decodeKey, expectedSha, cbOriginal, lzma),
  /** Reports the compressed (over-the-wire) byte count of the successful fetch,
   *  so callers can measure a real network transfer rate distinct from the
   *  decompressed bytes written to disk. Called once, only for the attempt that
   *  ultimately verifies + returns. */
  onNetworkBytes?: (compressedBytes: number) => void,
  /** Debug/steam-install-slow-start (cycle 2): reports EVERY attempt (success
   *  or failure), including which host, whether the bounded timeout fired, and
   *  how long it took — makes the previously-invisible retry/rotation/timeout
   *  path observable for a hardware reproduction. Optional, additive: default
   *  no-op, never changes behavior for existing callers/tests. */
  onAttempt?: OnChunkAttempt,
  /** Debug/steam-install-slow-start (cycle 3): health-aware host selection —
   *  see doc comment above. Optional, additive. */
  hostHealth?: HostHealthTracker,
  /** Debug/steam-install-slow-start (cycle 6): CDN auth token cache — see
   *  doc comment above and depot/cdnAuth.ts. Optional, additive. Only ever
   *  actually invoked (cycle 7) for a host `hostMeta` marks `usetokenauth:
   *  true` for. */
  cdnAuth?: CdnAuthTokenCache,
  /** Debug/steam-install-slow-start (cycle 7): per-host https_support/
   *  usetokenauth directory metadata — see `ContentServerHostMeta` above.
   *  Optional, additive. */
  hostMeta?: ReadonlyMap<string, ContentServerHostMeta>
): Promise<Buffer> {
  const sha = Buffer.isBuffer(chunk.sha) ? chunk.sha.toString('hex') : String(chunk.sha)
  const seed = chunk.attemptSeed ?? 0
  let lastErr: Error | undefined

  for (let i = 0; i < attempts; i++) {
    const host = hostHealth ? hostHealth.pickHost(hosts, seed, i) : hosts[(seed + i) % hosts.length]
    const meta = hostMeta?.get(host)
    // Debug/steam-install-slow-start (cycle 7): EXACT steam-user URL-scheme
    // parity — only an explicit https_support === 'mandatory' selects
    // https; every other known value (including 'unavailable') selects
    // http. Omitting hostMeta/a missing entry keeps the pre-cycle-7
    // hardcoded https:// (never regresses a caller this cycle wasn't told
    // the real https_support value for).
    const scheme = !meta || meta.httpsSupport === 'mandatory' ? 'https://' : 'http://'
    // Debug/steam-install-slow-start: bound this attempt so a hung/slow
    // content-server connection cannot block this worker slot indefinitely —
    // a timeout aborts the in-flight request, which surfaces as a normal
    // AbortError and falls into the same catch/backoff/host-rotation path
    // any other transient failure already takes.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CHUNK_FETCH_TIMEOUT_MS)
    const attemptStart = Date.now()
    try {
      // Debug/steam-install-slow-start (cycle 7, PART 1 REVERT): gated
      // strictly on `meta.usetokenauth === true` — steam-user's own
      // downloadChunk never requests a token for a server that doesn't ask
      // for one, and neither do we anymore (cycle 6's unconditional fetch
      // is disproven, see the doc comment above). Appended VERBATIM (no
      // `?`/`&` inserted here) — see depot/cdnAuth.ts's doc comment for why
      // the token string itself already carries its own leading `?` per
      // steam-user's own usage convention.
      const token = meta?.usetokenauth && cdnAuth ? await cdnAuth.getToken(depotId, host) : ''
      const res = await fetch(`${scheme}${host}/depot/${depotId}/chunk/${sha}${token}`, {
        signal: controller.signal
      })
      if (!res.ok) {
        // Debug/steam-install-slow-start (cycle 6): a 401/403 means the token
        // we just used was rejected (expired/wrong/missing) — invalidate it so
        // the NEXT attempt against this exact depot+host re-fetches a fresh
        // one instead of repeating the same rejected token. Any other status
        // falls through to the existing generic-error/retry/rotation path
        // unchanged. Cycle 7: only relevant when a token was actually in
        // play (meta.usetokenauth) — never invalidates a key that was never
        // fetched.
        if ((res.status === 401 || res.status === 403) && cdnAuth && meta?.usetokenauth) {
          cdnAuth.invalidate(depotId, host)
        }
        throw new Error(`CDN ${res.status}`)
      }

      const encrypted = Buffer.from(await res.arrayBuffer())
      const data = await decode(encrypted, key, sha, chunk.cb_original)
      onNetworkBytes?.(encrypted.length)
      const ms = Date.now() - attemptStart
      hostHealth?.record(host, 'success', ms)
      onAttempt?.({ host, attempt: i, outcome: 'success', ms })
      return data
    } catch (err) {
      lastErr = err as Error
      const timedOut = (err as { name?: string } | undefined)?.name === 'AbortError'
      const ms = Date.now() - attemptStart
      const outcome: ChunkAttemptOutcome = timedOut ? 'timeout' : 'error'
      hostHealth?.record(host, outcome, ms)
      onAttempt?.({
        host,
        attempt: i,
        outcome,
        ms,
        message: lastErr?.message
      })
      if (i < attempts - 1) {
        await sleep(Math.min(200 * 2 ** i, CHUNK_FETCH_MAX_BACKOFF_MS)) // 200,400,800,1600,3000,3000,...
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
  throw new Error(`chunk ${sha} failed after ${attempts} attempts: ${lastErr?.message}`)
}
