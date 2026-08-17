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
import { InflightLimiter } from './inflightLimiter'
import { logWarning, LogPrefix } from 'backend/logger'

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

/** Debug/steam-install-slow-start (cycle 13): tags a decode-stage failure
 *  with a short, stable `.code` field — REUSES the exact same duck-typed
 *  `.code` field `attemptFailureReason` already checks for thrown network
 *  errors (`err.code`/`err.cause?.code`), so no change to
 *  `attemptFailureReason`'s extraction order is needed for these to surface.
 *  A hardware run's `err=N{Error:N}` breakdown for exactly the hosts this
 *  session's Option B could never authenticate (type=CDN, no token) traced
 *  back to two compounding facts: (1) `decodeChunk`'s own throw sites below
 *  were plain `Error`s with no `.code` at all — `.name` defaults to the
 *  literal string `'Error'` for a base `Error`, which is indistinguishable
 *  from "no information captured"; (2) EVERY decode-stage error that crosses
 *  `DecompressPool`'s worker_threads message-passing boundary (the
 *  production default per Phase 21-15) was reconstructed on the main thread
 *  as a bare `new Error(message)` (see decompressWorker.ts/decompressPool.ts
 *  this cycle) — discarding name/code/status even for an error that DID
 *  carry one. Tagging every decode-stage throw site with a distinct code
 *  (`bad_footer_magic`/`unknown_container`/`sha1_mismatch`/`size_mismatch`/
 *  `decode_failed`) and threading that one field across the worker boundary
 *  is the single, minimal change that lets a future hardware run
 *  distinguish "the CDN edge responded but the body isn't a valid chunk
 *  container at all" (bad_footer_magic/unknown_container — consistent with a
 *  token-less request getting a small HTTP-200 denial/interstitial page
 *  instead of a 401/403) from "a genuinely corrupted/truncated transfer"
 *  (sha1_mismatch/size_mismatch) from an actual network-level failure
 *  (unchanged: still `ECONNRESET`/`429`/etc. via the existing `.code`/
 *  `.status` paths) — three previously-indistinguishable buckets that all
 *  rendered as the identical, uninformative literal `"Error"`. Purely
 *  additive: never read by any retry/backoff/selection logic, only by the
 *  existing `onAttempt`→`reason` reporting pipeline. */
class ChunkDecodeError extends Error {
  readonly code: string
  /** Debug/steam-install-slow-start (cycle 17, post-decrypt diagnostic): the
   *  first `RAW_BODY_PREVIEW_BYTES` of the POST-DECRYPT plaintext — populated
   *  ONLY at the `unknown_container` throw site (decompressChunk's final
   *  `throw`, below) via `steamDecrypt`'s own output, which is the exact
   *  buffer decompressChunk receives as `buf`. This is the single fact that
   *  splits the two remaining root-cause classes for a chunk that still
   *  fails `unknown_container` after cycle 17's zstd fix: a GARBAGE
   *  (high-entropy, no consistent magic) preview means decrypt itself is
   *  wrong for that chunk (key/IV/cb_original handling, or upstream input
   *  corruption); a CONSISTENT-but-unrecognized magic means the decoder is
   *  still missing a container type. Surfaced (never computed twice) in
   *  fetchChunk's existing decode-stage-failure log line, alongside the
   *  pre-decrypt `rawPreviewHex`/`rawPreviewLatin1` fields — see
   *  `describeRawChunkResponse`'s call site below. Purely observational:
   *  never read by any retry/backoff/decode/selection logic, only ever
   *  passed to `logWarning`. Chunk plaintext is public game data — no
   *  secret-redaction concern, same reasoning as the existing raw-ciphertext
   *  preview. */
  readonly decryptedPreview?: Buffer
  constructor(code: string, message: string, decryptedPreview?: Buffer) {
    super(message)
    this.name = 'ChunkDecodeError'
    this.code = code
    this.decryptedPreview = decryptedPreview
  }
}

/** Debug/steam-install-slow-start (cycle 15/17): shared byte cap for both the
 *  pre-decrypt raw-body preview (`describeRawChunkResponse`, below) and the
 *  post-decrypt preview (`ChunkDecodeError.decryptedPreview`, above) —
 *  hoisted above both use sites so `decompressChunk`'s `unknown_container`
 *  throw can reference it without a forward-reference. */
const RAW_BODY_PREVIEW_BYTES = 16

/** Debug/steam-install-slow-start (cycle 17): decodeChunk-time surface for a
 *  zstd decoder — matches the `ZSTDDecoder` class steam-user itself already
 *  bundles (`node_modules/steam-user/components/cdn_compression.js`), which
 *  this codebase now depends on directly (see package.json's `zstddec` entry
 *  — previously only a transitive dependency of `steam-user`, never
 *  `require`/`import`-safe from our own code without being pinned
 *  explicitly). Declared locally (not imported from the package's own types)
 *  because `zstddec` is an ESM-only package loaded via dynamic `import()` —
 *  see the `magic === 'VS'` branch below for why. */
interface ZstdDecoderModule {
  ZSTDDecoder: new () => {
    init(): Promise<void>
    decode(data: Uint8Array, uncompressedSize?: number): Uint8Array
  }
}

/**
 * Decompress a Steam chunk container: "VZ" (LZMA), "PK" (zlib deflate), or
 * "VS" (zstd — magic "VSZa").
 *
 * VZ layout (SteamKit VZipUtil):
 *   header : 'VZ'(2) | version 'a'(1) | timestamp(4) | lzma props(5)   = 12 B
 *   body   : raw LZMA stream
 *   footer : outputCrc(4) | outputSize(4) | 'zv'(2)                    = 10 B
 *
 * outputSize sits at len-6, not len-4 — the trailing 'zv' magic is 2 bytes.
 *
 * Debug/steam-install-slow-start (cycle 17): ROOT CAUSE of the deterministic,
 * per-chunk `unknown_container` decode failure (see the debug session's
 * "Cycle 16 supplementary data" evidence — the SAME encrypted chunk failed on
 * ALL 6 hosts, every one of 555 attempts, ruling out a host/network cause).
 * Valve added a THIRD depot-chunk container format — zstd, magic `VSZa` /
 * footer `zsv` — that this function never handled; every chunk Valve
 * compressed with zstd (apparently common for small chunks: the tiny
 * 96/832/1232-byte encrypted chunks this session's hardware capture also
 * flagged fit a small zstd payload's lower fixed overhead vs LZMA's) hit the
 * final `throw` below on EVERY host, EVERY attempt, regardless of ciphertext
 * correctness — a decoder gap, not a decrypt/network bug. Confirmed via two
 * independent, high-confidence sources: (1) the SteamKit2 C# reference
 * implementation added zstd depot-chunk support (SteamRE/SteamKit issue
 * #1503, "Add support for zstd compressed depot chunks") with the exact
 * magic/footer literals used below; (2) `steam-user@5.3.0` — ALREADY a
 * dependency of this project — bundles its OWN zstd decoder at
 * `node_modules/steam-user/components/cdn_compression.js` (`HEADER_ZSTD =
 * 'VSZa'`, `FOOTER_ZSTD = 'zsv'`, using the `zstddec` WASM package), proving
 * this is a real, current-Steam container format, not a hypothetical. The
 * layout below is lifted directly from that file's `decompressZstd`
 * (`ByteBuffer`-based there; re-expressed here with plain `Buffer` reads to
 * match this file's existing VZ/PK style):
 *   header : 'VSZa'(4) | crc32(4, ignored — the sha1(decompressed) gate in
 *            decodeChunk below is the actual integrity check this codebase
 *            already relies on for every container type, so the zstd
 *            payload's OWN internal crc32 is redundant to re-verify here)
 *   body   : raw zstd-compressed stream
 *   footer : decompressedCrc32(4, ignored, same reasoning) |
 *            decompressedSize(4) | zero-padding(4) | 'zsv'(3)        = 15 B
 */
export async function decompressChunk(
  buf: Buffer,
  lzma: LzmaModule,
  cbOriginal?: number | string
): Promise<Buffer> {
  const magic = buf.subarray(0, 2).toString('latin1')

  if (magic === 'VZ') {
    if (buf.subarray(-2).toString('latin1') !== 'zv') {
      throw new ChunkDecodeError(
        'bad_footer_magic',
        'VZ chunk: bad footer magic'
      )
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

  if (magic === 'VS') {
    if (buf.subarray(0, 4).toString('latin1') !== 'VSZa') {
      throw new ChunkDecodeError(
        'bad_footer_magic',
        'zstd chunk: bad header magic'
      )
    }
    if (buf.subarray(-3).toString('latin1') !== 'zsv') {
      throw new ChunkDecodeError(
        'bad_footer_magic',
        'zstd chunk: bad footer magic'
      )
    }
    const compressed = buf.subarray(8, buf.length - 15)
    const decompressedSize = buf.readUInt32LE(buf.length - 11)

    // Debug/steam-install-slow-start (INBOUND CRASH REPORT follow-up):
    // `decompressedSize` above is read straight out of the chunk's OWN
    // footer bytes -- i.e. untrusted, network/decrypt-derived data (a
    // corrupted ciphertext, a key/IV mismatch, or a genuinely malformed
    // chunk all produce garbage post-decrypt bytes here, exactly the
    // failure mode this session has spent many cycles chasing). Before this
    // check, that untrusted 32-bit value (0..~4GiB) was passed DIRECTLY into
    // `ZSTDDecoder.decode()`, which hands it straight to the WASM module's
    // own `malloc` (node_modules/zstddec/zstddec.ts) with zero validation on
    // either side -- a plausible mechanism for an unbounded native/WASM
    // allocation attempt that a normal JS try/catch cannot reliably guard
    // against (unlike a catchable RangeError), matching the flagged
    // trace-less "hard quit-to-desktop crash" suspicion against this exact
    // parked worker path. `cbOriginal` is the TRUSTED, manifest-derived
    // expected decompressed size already threaded down from decodeChunk's
    // caller -- in every genuine, uncorrupted chunk it is IDENTICAL to this
    // container's own claimed decompressedSize (that identity is exactly
    // what lets decodeChunk's existing post-decompress `data.length !==
    // cbOriginal` gate pass in the success case). Checking it HERE, before
    // ever calling into the WASM decoder, rejects a corrupted/malformed
    // chunk immediately via the existing size_mismatch classification
    // (bound-and-recover, same discipline as decompressPool.ts's per-task
    // timeout, T-21-15-03) instead of ever attempting the allocation.
    // Skipped only when the caller genuinely has no cbOriginal to check
    // against (undefined) -- preserves every pre-existing direct-call test
    // fixture unmodified.
    if (cbOriginal !== undefined && decompressedSize !== Number(cbOriginal)) {
      throw new ChunkDecodeError(
        'size_mismatch',
        `zstd chunk: footer decompressedSize ${decompressedSize} != expected cbOriginal ${cbOriginal} -- refusing to allocate`
      )
    }

    const { ZSTDDecoder } =
      (await import('zstddec')) as unknown as ZstdDecoderModule
    const decoder = new ZSTDDecoder()
    await decoder.init()
    return Buffer.from(decoder.decode(compressed, decompressedSize))
  }

  if (magic === 'PK') {
    const zlib = await import('node:zlib')
    // Local file header is 30 bytes + filename + extra; inflate the raw deflate body.
    const nameLen = buf.readUInt16LE(26)
    const extraLen = buf.readUInt16LE(28)
    return zlib.inflateRawSync(buf.subarray(30 + nameLen + extraLen))
  }

  // Debug/steam-install-slow-start (cycle 17, post-decrypt diagnostic): `buf`
  // IS the post-decrypt plaintext (decodeChunk calls steamDecrypt before
  // calling this function) -- attaching its own first bytes here, at the
  // exact point of the still-possible unknown_container failure, is strictly
  // cheaper and more precise than trying to re-derive it from the caller
  // side. See ChunkDecodeError.decryptedPreview's doc comment for how the
  // NEXT hardware run should read this field.
  throw new ChunkDecodeError(
    'unknown_container',
    `unknown chunk container: ${JSON.stringify(magic)}`,
    buf.subarray(0, RAW_BODY_PREVIEW_BYTES)
  )
}

export const sha1 = (buf: Buffer): string =>
  createHash('sha1').update(buf).digest('hex')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** debug/steam-cancel-abort-thread-a: resolves after `ms`, or immediately
 *  if/when `signal` aborts -- mirrors depot.ts's own `delay` helper (used
 *  for the plan-build retry backoff, D-UAT-06) so fetchChunk's inter-attempt
 *  backoff is equally abort-interruptible. Before this fix, a cancel issued
 *  while fetchChunk was backing off between attempts (200ms-3000ms) had to
 *  wait out the full backoff window before the NEXT loop iteration's
 *  signal-aborted check could even run. Omitting `signal` (any pre-existing
 *  caller/test) falls back to the original unconditional `sleep`. */
function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms) as Promise<void>
  return new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolvePromise()
      },
      { once: true }
    )
  })
}

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

/** Debug/steam-install-slow-start (cycle 14): DECISIVE cleartext pcap of the
 *  REAL Steam client's chunk-fetch request (see the debug session's "Cycle
 *  14" evidence section for the full capture) proved the CDN edges
 *  (CloudFront-fronted akamai/fastly/alibaba `type=CDN` hosts) need NO auth
 *  at all -- every one of 10,722 captured requests was a bare, unauthenticated
 *  `GET /depot/<id>/chunk/<sha>` with no token/cookie/auth header of any
 *  kind. This retroactively confirms cycle 12's hardware-captured empty
 *  `GetCDNAuthToken` response was CORRECT (no token exists to hand out for
 *  these edges), and reframes the entire cycle 6-12 token-RPC investigation
 *  as a confirmed dead end -- the real client's ONLY distinguishing header
 *  vs this codebase's pre-cycle-14 bare `fetch(url, { signal })` call is its
 *  User-Agent (`Valve/Steam HTTP Client 1.0`) and static Accept/Accept-Charset
 *  headers, which this codebase's default undici UA (`node`) never sent.
 *  Applied to EVERY host (CDN and SteamCache alike) -- the real client sends
 *  the same headers everywhere, so this can only help, never regress, the
 *  already-working SteamCache hosts. `x-chunk-score` (a dynamic, per-chunk
 *  load-hint header the real client also sends) is deliberately OMITTED --
 *  fabricating a plausible-looking but meaningless value risks looking WORSE
 *  to a scoring-aware edge than sending none at all, and the pcap gives no
 *  way to compute a legitimate value for it. Accept-Encoding is deliberately
 *  left to undici's own default (auto-negotiates + transparently decodes
 *  gzip) rather than forced to the real client's literal
 *  `gzip,identity,*;q=0` -- functionally equivalent, lower risk of an
 *  encoding-handling regression. */
export const CHUNK_FETCH_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent': 'Valve/Steam HTTP Client 1.0',
  Accept: 'text/html,*/*;q=0.9',
  'Accept-Charset': 'ISO-8859-1,utf-8,*;q=0.7'
}

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
  try {
    const decrypted = steamDecrypt(encrypted, key)
    const data = await decompressChunk(decrypted, lzma, cbOriginal)

    // The chunk's SHA1 is the hash of its DECOMPRESSED bytes — free integrity check.
    const got = sha1(data)
    if (got !== expectedSha) {
      throw new ChunkDecodeError(
        'sha1_mismatch',
        `chunk sha1 mismatch: ${got} != ${expectedSha}`
      )
    }
    if (data.length !== Number(cbOriginal)) {
      throw new ChunkDecodeError(
        'size_mismatch',
        `chunk size mismatch: ${data.length} != ${cbOriginal}`
      )
    }
    return data
  } catch (err) {
    // Debug/steam-install-slow-start (cycle 13): catch-all so a raw lzma
    // decompress failure or a steamDecrypt/zlib error that doesn't already
    // carry its own `.code` (Node's own crypto/zlib error codes are
    // PRESERVED as-is, never overwritten) still gets tagged instead of
    // reaching attemptFailureReason as an unhelpful bare `Error`. The
    // explicit ChunkDecodeErrors thrown above already have a `.code` and
    // pass through this branch unchanged.
    const e = err as { code?: unknown } | undefined
    if (e && typeof e.code === 'string') throw err
    throw new ChunkDecodeError(
      'decode_failed',
      (err as Error)?.message ?? String(err)
    )
  }
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
 *  fired from CHUNK_FETCH_TIMEOUT_MS (err.name === 'AbortError' AND the
 *  caller-supplied `signal` -- Thread A, cancel/abort fix -- was NOT the one
 *  that fired). A caller-driven cancel firing mid-attempt is deliberately
 *  reported as neither 'timeout' NOR 'error' -- fetchChunk throws
 *  ChunkFetchAbortedError for it and returns from the loop WITHOUT calling
 *  onAttempt/hostHealth.record at all, so a user cancel can never pollute
 *  this run's host-health stats or attempt diagnostics. Purely additive
 *  otherwise: never changes retry count, backoff, or host-rotation order for
 *  any genuine network/timeout/HTTP failure -- only reports what already
 *  happens. */
export type ChunkAttemptOutcome = 'success' | 'timeout' | 'error'

export interface ChunkAttemptEvent {
  host: string
  /** 0-indexed attempt number within this chunk's own retry loop. */
  attempt: number
  outcome: ChunkAttemptOutcome
  ms: number
  /** Debug/humankind-depot-full-stall (2026-08-17, network-vs-decode split):
   *  wall-clock time from `attemptStart` to the network response body being
   *  fully read (`res.arrayBuffer()` resolving) -- i.e. the PURE network
   *  portion of `ms`, excluding `decode()`. Only populated on `outcome ===
   *  'success'` (every other outcome either never reaches that point, or --
   *  for a decode-stage failure -- already has the network leg complete by
   *  definition, but is left `undefined` here to avoid implying a timing
   *  guarantee this event type never made for non-success outcomes before).
   *  Added because every existing timing signal in this codebase (`ms`,
   *  `avgMs`, `downSpeedMiBs`) is gated behind BOTH the fetch AND `decode()`
   *  finishing (decode must run before a chunk's bytes can be trusted enough
   *  to report/write -- see this file's own SECURITY note above) -- so none
   *  of them can, by themselves, distinguish "the network was slow" from
   *  "decode was slow" for a given attempt. `ms - netMs` is this attempt's
   *  own decode-stage duration (decode() + any DecompressPool queue-wait),
   *  computed by the caller (see depot.ts's `[Timing] chunk-stream stats`
   *  `avgNetMs`/`avgDecodeMs`). Purely observational: never read by any
   *  retry/backoff/selection logic in this function or hostHealth's scoring
   *  (hostHealth.record still receives the unchanged, combined `ms`). */
  netMs?: number
  message?: string
  /** Debug/steam-install-slow-start (diagnostic re-open, cycle 9): a short,
   *  aggregatable label for WHY a non-success attempt failed -- the numeric
   *  HTTP status ("429", "503") for a response that wasn't `res.ok`, or the
   *  thrown error's `code`/`cause.code` (e.g. "ECONNRESET") falling back to
   *  its `name` (e.g. "AbortError") for a network/thrown failure. Undefined
   *  on a 'success' outcome. Never a full message or stack -- purely a
   *  classification key for per-host stats aggregation (see depot.ts's
   *  `[Timing] chunk-stream stats`). Purely observational: never read by any
   *  selection/retry/backoff logic in this function. */
  reason?: string
}

export type OnChunkAttempt = (event: ChunkAttemptEvent) => void

/** Debug/steam-install-slow-start (diagnostic re-open, cycle 9): carries an
 *  HTTP failure's status code on the thrown Error so the catch block below
 *  can report a precise, aggregatable `reason` (e.g. "429") instead of
 *  re-parsing the message text. Never thrown past fetchChunk's own retry
 *  loop -- classifyDepotError (depotErrors.ts) still only ever sees the
 *  final `chunk ... failed after N attempts: CDN <status>...` message text,
 *  unchanged from before this cycle. `statusText` is appended to the
 *  message when present (cheap: already resolved synchronously on `res`) —
 *  purely additional detail, never used for retry/backoff/rotation. */
class ChunkHttpError extends Error {
  readonly status: number
  constructor(status: number, statusText?: string) {
    super(`CDN ${status}${statusText ? ` ${statusText}` : ''}`)
    this.name = 'ChunkHttpError'
    this.status = status
  }
}

/** debug/steam-cancel-abort-thread-a: thrown when fetchChunk observes an
 *  EXTERNAL `signal` abort (a real user cancel, D-UAT-05/06) -- as opposed
 *  to CHUNK_FETCH_TIMEOUT_MS firing (a genuine network-layer timeout) or any
 *  other fetch/HTTP/decode failure. Deliberately carries `code: 'aborted'`,
 *  which is NOT one of DECODE_STAGE_ERROR_CODES below, so it can never be
 *  misclassified as a deterministic decode failure by isDecodeStageError.
 *  downloadFileChunks' own `if (signal?.aborted) return` check (depot.ts,
 *  unchanged) short-circuits on this immediately -- exactly like every
 *  other abort seam already in this codebase (ensureSteamClientReady /
 *  resolveSteamInstallTarget / buildDepotPlan's throwIfAborted). Never
 *  passed to hostHealth.record or onAttempt -- a user cancel is not evidence
 *  a content-server host is unhealthy. */
class ChunkFetchAbortedError extends Error {
  readonly code = 'aborted'
  constructor() {
    super('chunk fetch aborted by caller signal')
    this.name = 'ChunkFetchAbortedError'
  }
}

/** Debug/steam-install-slow-start (cycle 13): walks a thrown network error's
 *  `.code`, then one level of undici's `.cause.code` (the shape Node's
 *  built-in `fetch` uses for a `TypeError: fetch failed`/`TypeError:
 *  terminated`), then a second `.cause.cause.code` level (defensive --
 *  double-wrapped causes are possible across some undici/Node versions),
 *  then finally the first nested `.code` inside an `AggregateError`'s
 *  `.errors[]` (Node's fetch can throw one of these when a "Happy Eyeballs"
 *  multi-address connect attempt fails on every address with a DIFFERENT
 *  underlying code, so no single top-level `.code`/`.cause.code` exists) --
 *  checked at both the direct-throw level and one level under `.cause`.
 *  Pure function, no side effects, never influences control flow. */
function networkErrorCode(err: unknown): string | undefined {
  type CodeCarrier = { code?: unknown; cause?: unknown; errors?: unknown[] }
  const firstAggregateCode = (
    e: CodeCarrier | undefined
  ): string | undefined => {
    const first = e?.errors?.[0] as { code?: unknown } | undefined
    return typeof first?.code === 'string' ? first.code : undefined
  }

  const e = err as CodeCarrier | undefined
  if (typeof e?.code === 'string') return e.code

  const cause = e?.cause as CodeCarrier | undefined
  if (typeof cause?.code === 'string') return cause.code

  const causeCause = cause?.cause as CodeCarrier | undefined
  if (typeof causeCause?.code === 'string') return causeCause.code

  return firstAggregateCode(cause) ?? firstAggregateCode(e)
}

/** Debug/steam-install-slow-start (diagnostic re-open, cycle 9; hardened in
 *  the CDN-auth implementation cycle; further hardened cycle 13): classifies
 *  WHY a fetchChunk attempt failed into a short, aggregatable label -- see
 *  `ChunkAttemptEvent.reason` above for the exact semantics. Pure function,
 *  no side effects, never influences control flow.
 *
 *  Checks a DUCK-TYPED `status` property first (`typeof ... === 'number'`)
 *  rather than `err instanceof ChunkHttpError` -- immune to any class-
 *  identity mismatch across module/bundle boundaries (a real risk once code
 *  crosses a webpack bundle split or a worker_threads serialization
 *  boundary, where a subclassed Error's prototype chain is not guaranteed to
 *  survive), which is exactly the failure mode a previous hardware run's
 *  generic `err=N{Error:N}` breakdown pointed at instead of the real HTTP
 *  status. `ChunkHttpError` still sets `status` as a plain instance property
 *  in its constructor, so this check is correct for every existing throw
 *  site and additionally correct for any plain object/Error that merely
 *  carries a `status` field, with no dependency on `instanceof`.
 *
 *  Cycle 13: the ACTUAL, structural cause of that same hardware run's
 *  generic breakdown for its remaining (non-HTTP-status) failures was traced
 *  to two things, neither fixed by hardening this function alone -- (1)
 *  `decodeChunk`'s own throw sites (bad container magic, sha1/size mismatch)
 *  were plain `Error`s with no `.code` at all (fixed this cycle via
 *  `ChunkDecodeError`, see its doc comment); (2) EVERY decode-stage error
 *  that crosses `DecompressPool`'s worker_threads boundary was reconstructed
 *  as a bare `new Error(message)`, discarding any `.code` a worker-side
 *  error DID carry (fixed this cycle in decompressWorker.ts/
 *  decompressPool.ts). This function's own change this cycle --
 *  `networkErrorCode`'s deeper cause-chain/AggregateError walk -- is a
 *  complementary robustness improvement for genuine network-level failures,
 *  not the fix for the decode-stage/worker-boundary collapse. */
function attemptFailureReason(err: unknown, timedOut: boolean): string {
  const e = err as { status?: unknown; name?: string } | undefined
  if (typeof e?.status === 'number') return String(e.status)
  if (timedOut) return 'AbortError'
  return networkErrorCode(err) ?? e?.name ?? 'Error'
}

/** Debug/steam-install-slow-start (cycle 7; widened in the CDN-auth
 *  implementation cycle): per-host directory metadata fetchChunk needs for
 *  EXACT steam-user URL-scheme/token parity -- verified directly against the
 *  INSTALLED steam-user@5.3.0 source (node_modules/steam-user/components/
 *  cdn.js's own `downloadChunk`, ~L314-337):
 *    urlBase = (https_support === 'mandatory' ? 'https://' : 'http://') + host
 *    token   = usetokenauth == 1 ? (await getCDNAuthToken(...)).token : ''
 *  steam-user's own gate is `usetokenauth == 1`, but this codebase's own
 *  directory captures (cycle 4/5/7) show `usetokenauth` absent/unset on
 *  EVERY real host observed, including the three `type=CDN` global SteamPipe
 *  edges -- while Steam's OWN `content_log.txt` shows the real client's
 *  `AuthenticateDepotID... Success!` firing on every `type=CDN` host
 *  UNCONDITIONALLY (RESEARCH SPIKE finding). `type` is therefore threaded
 *  alongside `httpsSupport`/`usetokenauth` so fetchChunk's gate can be widened
 *  to `usetokenauth === true || type === 'CDN'` (see fetchChunk below) --
 *  `type=SteamCache` hosts stay token-less exactly as they are for the real
 *  client, regardless of this widening.
 *  Threaded alongside (never replacing) the existing bare-hostname `hosts`
 *  array / HostHealthTracker selection -- keyed by hostname, built by
 *  depot.ts's `reduceContentServers` from the raw content-server directory
 *  response. Omitting it (every pre-cycle-7 caller/test) preserves the
 *  EXACT pre-cycle-7 URL (hardcoded `https://`, no token) -- purely
 *  additive. */
export interface ContentServerHostMeta {
  httpsSupport?: string
  usetokenauth?: boolean
  type?: string
}

/** Debug/steam-install-slow-start (CDN-auth implementation cycle, PART 2):
 *  true when this host's directory metadata means a CDN auth token should be
 *  requested for it -- steam-user's own `usetokenauth === 1` gate, WIDENED
 *  to also fire for any `type === 'CDN'` host (see `ContentServerHostMeta`'s
 *  doc comment above for the evidence). `type=SteamCache` hosts never match
 *  either branch and stay token-less. Extracted as a named, directly
 *  testable pure function rather than an inline expression at each of
 *  fetchChunk's two use sites (the token-fetch call and the 401/403
 *  invalidate gate) so both stay in lockstep by construction. */
export function wantsCdnAuthToken(
  meta: ContentServerHostMeta | undefined
): boolean {
  return meta?.usetokenauth === true || meta?.type === 'CDN'
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

/** Debug/steam-install-slow-start (cycle 15): cycle 14's hardware validation
 *  applied the CHUNK_FETCH_HEADERS fix but did NOT unlock the type=CDN
 *  hosts -- instead it revealed (via cycle 13's own reason-extraction fix)
 *  that MOST failing hosts, both `type=CDN` AND most `type=SteamCache`,
 *  fail with `unknown_container`: the HTTP fetch itself succeeds (`res.ok`
 *  is true), but the fetched body AES-decrypts to bytes whose magic is
 *  neither `VZ` nor `PK`. Since the SAME depot key correctly decodes
 *  thousands of chunks from the one working host, the key + decode logic
 *  are proven correct -- the failing hosts are returning DIFFERENT bytes
 *  than the working host for the identical chunk request. This has almost
 *  certainly been the real throughput bottleneck since before cycle 6 ever
 *  started (masked as the generic `{Error:N}` bucket until cycle 13).
 *  `describeRawChunkResponse` captures the raw (PRE-DECRYPT) response
 *  metadata -- HTTP status, Content-Type/Content-Encoding/Content-Length,
 *  and a small preview of the raw body's own first bytes -- so the NEXT
 *  hardware run can pinpoint which layer produced the garbage:
 *    - Content-Type `text/html` + preview starting `<!DOCTYPE`/`<html` =>
 *      the edge returned an HTML error/interstitial page instead of a
 *      chunk (a 200-OK denial page rather than a proper 401/403 -- the
 *      leading hypothesis, and worth checking against whether cycle 14's
 *      own Accept header (text/html plus a wildcard fallback, q=0.9) is
 *      itself inviting this).
 *    - Content-Encoding `gzip` + preview starting `1f 8b` (raw, i.e. undici
 *      did NOT auto-decode it before this code read it) => a host wrongly
 *      gzip-compressing already-binary chunk data, or an accept-encoding
 *      mismatch corrupting the bytes this code actually receives.
 *    - Anything else => binary-but-wrong (a body-length/offset bug, a
 *      differently-encrypted/differently-versioned chunk, or a proxy
 *      corrupting the transfer) -- would need a byte-level compare against
 *      a known-good chunk from the working host as the next diagnostic
 *      step.
 *  Never throws (every field access is duck-typed/optional-chained, since
 *  several existing test fixtures construct a bare `{ ok, arrayBuffer }`
 *  response object with no `headers` property at all) and the body preview
 *  is capped to `RAW_BODY_PREVIEW_BYTES` -- chunk bodies are public game
 *  content (no secret-redaction concern, unlike the CDN-auth token
 *  diagnostics in cdnAuth.ts), but the dump stays small regardless.
 *  PURELY OBSERVATIONAL: this function has no side effects and its output
 *  is never read by any retry/backoff/decode/host-selection logic -- only
 *  ever passed to `logWarning`.
 *
 *  Debug/steam-install-slow-start (cycle 16): a hardware capture of this
 *  diagnostic (depot=1460472) showed intact, correctly-shaped ciphertext
 *  (httpStatus=200, contentType=application/x-steam-chunk,
 *  contentEncoding=absent, contentLength === rawBodyBytes, no HTML/gzip
 *  signature) that still decrypts to garbage on every host except one --
 *  ruling out hypotheses 1 (HTML error page) and 2 (gzip mismatch) above and
 *  leaving exactly two live explanations: (a) the failing hosts are
 *  genuinely returning DIFFERENT ciphertext bytes for the identical
 *  depot+sha request (a Steam-side CDN edge/cache data-integrity issue, or a
 *  network-path intermediary transparently caching/corrupting plain HTTP
 *  traffic -- external to this codebase), or (b) this codebase is
 *  requesting a mismatched sha/key despite the URL looking correct (a
 *  request-construction bug not yet located). A code-level review this
 *  cycle of the ENTIRE decode/marshalling path -- `DecompressPool`'s
 *  worker_threads boundary (`toOwnArrayBuffer`'s `.slice()` already
 *  correctly bounds by `byteOffset`/`byteLength`, both the key and the
 *  encrypted buffer are copied via `Buffer.from`/`.slice()` before crossing
 *  the `postMessage` boundary, never a raw pooled-slab reference),
 *  `decompressWorker.ts`'s response marshalling, `steamDecrypt`
 *  (crypto.ts, byte-for-byte unmodified since HEAD), and `reduceContentServers`'s
 *  hostname/hostMeta keying (both `hosts` and `hostMeta` are derived from the
 *  identical `s.Host ?? s.vhost` key, so no map/array key-mismatch exists) --
 *  found NO marshalling/keying defect. `scheme` (http vs https, already
 *  computed above per host per steam-user parity) and `rawSha1` (the raw
 *  CIPHERTEXT's own sha1, independent of the depot-chunk sha1 which only
 *  covers DECOMPRESSED bytes) are added below so the next capture can
 *  directly test explanation (a): request the SAME depot+sha from a
 *  currently-failing host and from the known-working host and compare their
 *  `rawSha1` values -- identical values would mean the bytes are the SAME
 *  ciphertext (pointing back at a code-side handling bug after all);
 *  different values are direct proof the two hosts are serving genuinely
 *  different bytes for the identical request (confirms explanation (a), a
 *  Steam-side/network-path issue this codebase cannot fix by itself).
 *  `scheme` additionally tests whether the failure correlates with transport
 *  (HTTP is interceptable/cacheable by a network intermediary; HTTPS is
 *  not) -- a scheme=http-only failure pattern would support a
 *  transparent-proxy-corruption explanation specifically. */
interface RawChunkResponseLike {
  status?: number
  headers?: { get?(name: string): string | null }
}

/** Debug/steam-install-slow-start (cycle 17, post-decrypt diagnostic):
 *  optional `decryptedPreview` param — when the failure that triggered this
 *  log line carried a `ChunkDecodeError.decryptedPreview` (currently only the
 *  `unknown_container` throw site populates it), appends
 *  `decryptedPreviewHex=`/`decryptedPreviewLatin1=` fields alongside the
 *  existing pre-decrypt `rawPreviewHex=`/`rawPreviewLatin1=` -- letting a
 *  single log line show BOTH the ciphertext the CDN actually returned AND
 *  what `steamDecrypt` turned it into, so the next hardware capture can
 *  directly tell "decrypt produced garbage" (high-entropy, no consistent
 *  magic across chunks) from "decrypt produced a consistent-but-unhandled
 *  magic" (a still-missing container type) without a follow-up round trip.
 *  Omitted entirely (not even the field names) when no preview is available
 *  -- e.g. a network/HTTP-stage failure never reaches decrypt at all. */
function describeRawChunkResponse(
  res: RawChunkResponseLike | undefined,
  raw: Buffer,
  scheme: string,
  decryptedPreview?: Buffer
): string {
  const header = (name: string): string => {
    try {
      return res?.headers?.get?.(name) ?? 'absent'
    } catch {
      return 'absent'
    }
  }
  const preview = raw.subarray(0, RAW_BODY_PREVIEW_BYTES)
  const decryptedFields = decryptedPreview
    ? ` decryptedPreviewHex=${decryptedPreview.toString('hex')} ` +
      `decryptedPreviewLatin1=${JSON.stringify(decryptedPreview.toString('latin1'))}`
    : ''
  return (
    `httpStatus=${res?.status ?? 'unknown'} scheme=${scheme} contentType=${header('content-type')} ` +
    `contentEncoding=${header('content-encoding')} contentLength=${header('content-length')} ` +
    `rawBodyBytes=${raw.length} rawSha1=${sha1(raw)} rawPreviewHex=${preview.toString('hex')} ` +
    `rawPreviewLatin1=${JSON.stringify(preview.toString('latin1'))}${decryptedFields}`
  )
}

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
 * Cycle 7: a token is fetched ONLY when `wantsCdnAuthToken(hostMeta.get(host))`
 * (originally: `usetokenauth === true` alone) AND `cdnAuth` is supplied --
 * exact parity with steam-user's own gate. CDN-auth implementation cycle,
 * PART 2 (widened): `wantsCdnAuthToken` also fires for `type === 'CDN'`
 * hosts -- this codebase's own directory captures show `usetokenauth`
 * absent/unset on EVERY real host observed, including the three type=CDN
 * global SteamPipe edges, while Steam's own content_log.txt shows the real
 * client's `AuthenticateDepotID` firing on every type=CDN host
 * UNCONDITIONALLY (RESEARCH SPIKE finding) -- gating on the directory's
 * never-populated `usetokenauth` flag alone left this codebase locked out of
 * the CDN half of the host pool. `type=SteamCache` hosts still never match
 * either branch and stay token-less, exactly as they are for the real
 * client. A 401/403 response still invalidates the cached token for that
 * depot+host (only when a token was actually in play) so a future
 * token-gated host's NEXT attempt re-fetches rather than repeating a
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
  hostMeta?: ReadonlyMap<string, ContentServerHostMeta>,
  /** debug/steam-cancel-abort-thread-a: external cancellation signal — when
   *  it fires, fetchChunk abandons the in-flight attempt IMMEDIATELY
   *  (aborting the underlying network request via the same mechanism as
   *  CHUNK_FETCH_TIMEOUT_MS, not waiting for it to finish/time out
   *  naturally) and never starts another attempt or backoff sleep. Before
   *  this fix, fetchChunk had NO way to observe a caller's cancel at all —
   *  downloadFileChunks (depot.ts) only checked `signal?.aborted` BEFORE and
   *  AFTER calling fetchChunk, never DURING it, so a cancel issued while a
   *  chunk was mid-retry (up to CHUNK_FETCH_ATTEMPTS x (CHUNK_FETCH_TIMEOUT_MS
   *  + backoff), worst case ~144s) had to wait for that whole call to
   *  naturally exhaust or succeed first — the hardware-observed ~62s hang.
   *  Optional, additive: omitting it (every pre-existing caller/test)
   *  preserves the exact previous behavior — retries run to completion
   *  regardless of any external signal. Never recorded via
   *  hostHealth.record/onAttempt when it fires (see ChunkFetchAbortedError's
   *  doc comment) — a user cancel is not evidence a host is unhealthy. */
  signal?: AbortSignal,
  /** Phase 25 (multi-host fan-out): per-worker slot index threaded from
   *  downloadFileChunks' chunk pool (combined with the file pool's own slot —
   *  see depot.ts), forwarded verbatim into hostHealth.pickHost's 4th arg.
   *  Used only at attempt 0's top-N fan-out (see hostHealth.ts's
   *  TOP_N_FANOUT) so concurrently-running chunk workers spread their
   *  first-attempt requests across the top-N healthy hosts instead of all
   *  converging on the single top-scored one. A defaulted param (not a bare
   *  `?:`) so it stays a plain `number` under strict mode. Optional,
   *  additive: omitting it — every pre-Phase-25 caller/test — defaults to
   *  pickHost's workerSlot=0, reproducing the exact ordered[0] pick. */
  workerSlot: number = 0,
  /** Debug/humankind-depot-full-stall (2026-08-17): shared, per-DOWNLOAD-RUN
   *  network in-flight budget — see depot/inflightLimiter.ts. Acquired
   *  immediately before the network `fetch()` below and released right
   *  after the response body is read, NEVER held across `decode()` — see
   *  the acquire/release call sites' own doc comment for the root-cause
   *  writeup (a whole-fetchChunk wrap silently capped real network
   *  concurrency at DecompressPool's much smaller, independently-bounded
   *  worker count). Optional, additive: omitting it (every pre-fix
   *  caller/test, and the prior 260817-ihr `limiter.run(doFetch)` call site
   *  which this replaces) makes every acquire()/release() call below a
   *  no-op, reproducing the exact unthrottled pre-260817-ihr behavior. */
  limiter?: InflightLimiter
): Promise<Buffer> {
  const sha = Buffer.isBuffer(chunk.sha)
    ? chunk.sha.toString('hex')
    : String(chunk.sha)
  const seed = chunk.attemptSeed ?? 0
  let lastErr: Error | undefined

  for (let i = 0; i < attempts; i++) {
    // debug/steam-cancel-abort-thread-a: checked at the TOP of every
    // attempt — including the very first — so a signal that's already
    // aborted before this call even started (e.g. this chunk was queued
    // behind other chunk-workers when the cancel fired) never starts a
    // doomed network request, and a signal that fires during THIS attempt's
    // inter-attempt backoff sleep (sleepAbortable, below) is caught here on
    // the next iteration instead of proceeding to another fetch.
    if (signal?.aborted) {
      throw new ChunkFetchAbortedError()
    }
    const host = hostHealth
      ? hostHealth.pickHost(hosts, seed, i, workerSlot)
      : hosts[(seed + i) % hosts.length]
    const meta = hostMeta?.get(host)
    // Debug/steam-install-slow-start (cycle 7): EXACT steam-user URL-scheme
    // parity — only an explicit https_support === 'mandatory' selects
    // https; every other known value (including 'unavailable') selects
    // http. Omitting hostMeta/a missing entry keeps the pre-cycle-7
    // hardcoded https:// (never regresses a caller this cycle wasn't told
    // the real https_support value for).
    const scheme =
      !meta || meta.httpsSupport === 'mandatory' ? 'https://' : 'http://'
    // Debug/steam-install-slow-start: bound this attempt so a hung/slow
    // content-server connection cannot block this worker slot indefinitely —
    // a timeout aborts the in-flight request, which surfaces as a normal
    // AbortError and falls into the same catch/backoff/host-rotation path
    // any other transient failure already takes.
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      CHUNK_FETCH_TIMEOUT_MS
    )
    // debug/steam-cancel-abort-thread-a: forwards an external cancel into
    // THIS attempt's own fetch() call immediately, instead of waiting for it
    // to finish/time out naturally — previously `controller` was
    // purely-internal (the CHUNK_FETCH_TIMEOUT_MS timeout only), completely
    // deaf to any external signal.
    const onExternalAbort = () => controller.abort()
    signal?.addEventListener('abort', onExternalAbort, { once: true })
    const attemptStart = Date.now()
    // Debug/steam-install-slow-start (cycle 15): hoisted out of the try block
    // so the catch below can access the raw (pre-decrypt) response for the
    // raw-response-metadata diagnostic — `encrypted` is only ever assigned
    // AFTER a successful `res.ok` fetch, so its presence in the catch block
    // is itself the signal that this attempt failed at the DECODE stage
    // (not at the HTTP/network stage, both of which throw before reaching
    // this assignment).
    let res: Response | undefined
    let encrypted: Buffer | undefined
    // Debug/humankind-depot-full-stall (2026-08-17): tracks whether THIS
    // attempt currently owns an acquired `limiter` slot, so the `finally`
    // below can safely release on every error path (including one that
    // throws between `acquire()` and the early release right after the
    // response body is read) without ever double-releasing the
    // already-released success-path slot. Always `false` when `limiter` is
    // undefined (every pre-fix caller/test), so the finally's guard never
    // fires and behavior is byte-for-byte unchanged.
    let heldSlot = false
    try {
      // Debug/steam-install-slow-start (cycle 7 PART 1 REVERT, WIDENED in the
      // CDN-auth implementation cycle, PART 2): gated on
      // `wantsCdnAuthToken(meta)` -- steam-user's own `usetokenauth === 1`
      // check, widened to also fire for `type === 'CDN'` hosts per the
      // RESEARCH SPIKE's content_log.txt evidence (see `ContentServerHostMeta`'s
      // doc comment above). `type=SteamCache` hosts stay token-less exactly
      // as they are for the real client. Appended VERBATIM (no `?`/`&`
      // inserted here) — see depot/cdnAuth.ts's doc comment for why the
      // token string itself already carries its own leading `?` per
      // steam-user's own usage convention. `cdnAuth.getToken` NEVER throws
      // and NEVER blocks past its own bounded timeout (depot/cdnAuth.ts
      // PART 3) — a hanging/failing token fetch degrades to `''` and this
      // attempt proceeds token-less, exactly like every other host. Runs
      // BEFORE acquiring `limiter`'s slot -- it has its own bounded timeout
      // and was never part of the network budget this limiter tracks.
      const token =
        wantsCdnAuthToken(meta) && cdnAuth
          ? await cdnAuth.getToken(depotId, host)
          : ''
      // Debug/humankind-depot-full-stall (2026-08-17): acquire the network
      // slot immediately before the actual depot chunk fetch -- see this
      // param's own doc comment above and inflightLimiter.ts's `run()` doc
      // comment for why this must NOT wrap `decode()` below. Guarded by
      // `if (limiter)` rather than an unconditional `await limiter?.acquire()`
      // -- an `await` always yields at least one microtask turn even when
      // the awaited value is `undefined`, which would insert a NEW
      // suspension point between the (synchronous, no-limiter) token
      // resolution above and the `fetch()` call below for every caller that
      // omits `limiter`. That shifted timing broke the external-cancel
      // tests (depotPrimitives.test.ts): they rely on fetchChunk running
      // synchronously through to `fetch()` (and the mock's abort-listener
      // registration) in the SAME microtask turn the caller invokes
      // fetchChunk in, so `controller.abort()` — called synchronously right
      // after — always fires AFTER the listener is attached, never before.
      // This guard makes every no-limiter call (every pre-fix caller/test)
      // byte-for-byte identical to the pre-fix control flow.
      if (limiter) {
        await limiter.acquire()
        heldSlot = true
      }
      res = await fetch(
        `${scheme}${host}/depot/${depotId}/chunk/${sha}${token}`,
        {
          signal: controller.signal,
          headers: CHUNK_FETCH_HEADERS
        }
      )
      if (!res.ok) {
        // Debug/steam-install-slow-start (cycle 6): a 401/403 means the token
        // we just used was rejected (expired/wrong/missing) — invalidate it so
        // the NEXT attempt against this exact depot+host re-fetches a fresh
        // one instead of repeating the same rejected token. Any other status
        // falls through to the existing generic-error/retry/rotation path
        // unchanged. Only relevant when a token was actually in play
        // (wantsCdnAuthToken(meta)) — never invalidates a key that was never
        // fetched.
        if (
          (res.status === 401 || res.status === 403) &&
          cdnAuth &&
          wantsCdnAuthToken(meta)
        ) {
          cdnAuth.invalidate(depotId, host)
        }
        throw new ChunkHttpError(res.status, res.statusText)
      }

      encrypted = Buffer.from(await res.arrayBuffer())
      // Debug/humankind-depot-full-stall (2026-08-17): release the network
      // slot as soon as the response body is fully read -- BEFORE the
      // CPU-bound `decode()` call, which is independently bounded by
      // DecompressPool's own worker count. Holding the slot any longer would
      // silently cap real network concurrency at that smaller budget again.
      limiter?.release()
      heldSlot = false
      // Debug/humankind-depot-full-stall (2026-08-17, network-vs-decode
      // split): both `netMs` and `onNetworkBytes` are captured HERE, right
      // as the network leg finishes -- previously both fired only after
      // `decode()` also completed below, which never changed what value
      // either eventually reported (the outer downloadFileChunks loop only
      // reads them after this whole function resolves regardless -- decode
      // must finish before verified bytes can be returned/written at all,
      // see this file's own SECURITY note above), but DID mean neither was
      // available as an independent network-only signal. Moving the capture
      // point earlier costs nothing and makes `netMs` meaningful.
      const netMs = Date.now() - attemptStart
      onNetworkBytes?.(encrypted.length)
      const data = await decode(encrypted, key, sha, chunk.cb_original)
      const ms = Date.now() - attemptStart
      hostHealth?.record(host, 'success', ms)
      onAttempt?.({ host, attempt: i, outcome: 'success', ms, netMs })
      return data
    } catch (err) {
      lastErr = err as Error
      // debug/steam-cancel-abort-thread-a: an EXTERNAL cancel firing
      // mid-attempt also aborts `controller` (via the onExternalAbort
      // listener above) and lands here indistinguishable, at the `err.name`
      // level, from a genuine CHUNK_FETCH_TIMEOUT_MS timeout — MUST be
      // checked and handled BEFORE the timedOut/outcome/hostHealth/onAttempt
      // machinery below runs: a user cancel is not a host failure (never
      // hostHealth.record'd — would bias future host selection for THIS
      // run), never logged as a decode/network diagnostic, never backed off,
      // and never retried. Immediately abandons this chunk's fetch (D-UAT-05:
      // this must never be reported as anything other than an abort). A
      // genuine network drop/timeout below, when `signal` was never aborted,
      // is completely unaffected and still retried exactly as before
      // (D-UAT-06).
      if (signal?.aborted) {
        throw new ChunkFetchAbortedError()
      }
      const timedOut =
        (err as { name?: string } | undefined)?.name === 'AbortError'
      const ms = Date.now() - attemptStart
      const outcome: ChunkAttemptOutcome = timedOut ? 'timeout' : 'error'
      hostHealth?.record(host, outcome, ms)
      const reason = attemptFailureReason(err, timedOut)
      onAttempt?.({
        host,
        attempt: i,
        outcome,
        ms,
        message: lastErr?.message,
        reason
      })
      // Debug/steam-install-slow-start (cycle 15): `encrypted` is only ever
      // set after a successful `res.ok` fetch — its presence here means this
      // attempt failed at the DECODE stage (decodeChunk/decompressChunk
      // threw, e.g. `unknown_container`), not at the HTTP/network stage.
      // This is the exact class of failure cycle 14's hardware validation
      // showed dominating MOST hosts (both type=CDN and most SteamCache) —
      // logging the raw (pre-decrypt) response metadata here is the fastest
      // path to pinpointing which layer produced the garbage (see
      // `describeRawChunkResponse`'s doc comment). Purely observational —
      // never read by any retry/backoff/decode/selection logic below.
      if (encrypted !== undefined) {
        // Debug/steam-install-slow-start (cycle 17): surfaces the
        // post-decrypt preview attached to ChunkDecodeError, when present
        // (currently only the unknown_container throw site populates it) --
        // see describeRawChunkResponse's decryptedPreview param doc comment.
        const decryptedPreview = (
          err as { decryptedPreview?: Buffer } | undefined
        )?.decryptedPreview
        logWarning(
          [
            `fetchChunk: decode-stage failure reason=${reason} depot=${depotId} host=${host} ` +
              `attempt=${i} ${describeRawChunkResponse(res, encrypted, scheme, decryptedPreview)}`
          ],
          LogPrefix.Steam
        )
      }
      if (i < attempts - 1) {
        // debug/steam-cancel-abort-thread-a: abort-interruptible backoff —
        // resolves immediately if `signal` fires during the wait, instead of
        // blocking the next loop iteration's abort check behind the full
        // 200ms-3000ms window.
        await sleepAbortable(
          Math.min(200 * 2 ** i, CHUNK_FETCH_MAX_BACKOFF_MS),
          signal
        ) // 200,400,800,1600,3000,3000,...
      }
    } finally {
      // Debug/humankind-depot-full-stall (2026-08-17): releases a slot this
      // attempt acquired but never reached the early release for (e.g. the
      // fetch itself threw/timed out, or `res.ok` was false) -- `heldSlot`
      // is only ever true here on an error path; the success path already
      // released and reset it to `false` above, so this never double-frees.
      if (heldSlot) limiter?.release()
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onExternalAbort)
    }
  }
  // Debug/steam-install-slow-start (cycle 17, retry-storm resilience): before
  // this cycle this final throw was a bare `Error` with no `.code` -- the
  // one signal that would let a CALLER (downloadFileChunks, depot.ts) tell
  // "every attempt failed at decode/verify" (deterministic, per-chunk, never
  // fixed by another pass) apart from "every attempt failed at the network/
  // HTTP layer" (genuinely transient, worth another pass) was discarded right
  // here, at the exact point downloadFileChunks' outer requeue-loop decides
  // whether to try this chunk again. Threading `lastErr`'s own `.code`
  // through (when it's a ChunkDecodeError's code — see isDecodeStageError
  // below) costs nothing and changes no behavior BY ITSELF; it is what lets
  // depot.ts's requeue guard (this cycle's actual fix) distinguish the two
  // cases instead of guessing from message text.
  const finalErr = new Error(
    `chunk ${sha} failed after ${attempts} attempts: ${lastErr?.message}`
  )
  const lastCode = (lastErr as { code?: unknown } | undefined)?.code
  if (typeof lastCode === 'string')
    (finalErr as Error & { code?: string }).code = lastCode
  throw finalErr
}

/** Debug/steam-install-slow-start (cycle 17, retry-storm resilience): the
 *  five `ChunkDecodeError` codes `decodeChunk`/`decompressChunk` can throw —
 *  every one of them is determined ENTIRELY by (ciphertext bytes, key),
 *  never by which host served the bytes or how many times it's retried (see
 *  the debug session's "Cycle 16 supplementary data" evidence: the identical
 *  encrypted chunk failed `unknown_container` on ALL 6 hosts, all 555
 *  attempts, byte-identical ciphertext across hosts). Exported so
 *  `downloadFileChunks` (depot.ts) can recognize a fully-exhausted
 *  `fetchChunk` call's final error as decode-stage (via `isDecodeStageError`
 *  below) and stop re-queuing it — re-queuing a deterministic failure for
 *  another 8-attempt/6-host pass cannot ever succeed and is exactly the
 *  mechanism that collapsed one hardware run to 11,063 total attempt
 *  rotations (one single chunk alone: 555) before this fix. */
export const DECODE_STAGE_ERROR_CODES: ReadonlySet<string> = new Set([
  'bad_footer_magic',
  'unknown_container',
  'sha1_mismatch',
  'size_mismatch',
  'decode_failed'
])

/** True when `err` is (or, after fetchChunk exhausts its attempts, carries
 *  the `.code` of) a decode-stage `ChunkDecodeError` — as opposed to a
 *  network/HTTP-layer failure (`ChunkHttpError`, `ECONNRESET`, `AbortError`,
 *  etc.), which keeps the existing rotate-and-retry behavior unchanged.
 *  Duck-typed on `.code` (not `instanceof`), matching this file's existing
 *  `attemptFailureReason`/`networkErrorCode` convention — safe across the
 *  DecompressPool worker_threads message boundary and any bundler/module
 *  boundary, where a class's prototype chain is not guaranteed to survive. */
export function isDecodeStageError(err: unknown): boolean {
  const code = (err as { code?: unknown } | undefined)?.code
  return typeof code === 'string' && DECODE_STAGE_ERROR_CODES.has(code)
}
