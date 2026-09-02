// Phase 23.1 plan 04: the single, memoized LZMA decoder resolver shared by
// decompressWorker.ts's getLzma() (pooled worker isolates) AND
// decompressPool.ts's inlineDecode() (the main-thread fallback path) -- the
// ONLY place either consumer resolves an `LzmaModule`, so neither can
// silently stay on the pure-JS path while the other engages native (this
// plan's own must_haves.truths).
//
// WHY this exists: CONTEXT.md's live measurement on a real HUMANKIND install
// established that decode, not network fetch (flat at ~150-280ms/chunk), is
// this codebase's actual throughput ceiling -- the pure-JS `lzma` package
// caps out around ~5-7 MB/s single-threaded (decompressWorker.ts's own prior
// header comment). 23.1-01-SUMMARY's spike measured `lzma-native`'s REAL
// per-chunk speedup (against actual installed-Steam-game bytes, not a
// synthetic payload) at ~5.8-6.6x on darwin-arm64 -- materially below
// RESEARCH.md's ~47x synthetic estimate, but still a clear, non-marginal win
// this phase exists to ship.
//
// The pure-JS `lzma` package is retained here DELIBERATELY, as the safety
// net this loader degrades to -- not as dead code left over from before this
// phase. `DecompressPool.init()`'s own doc comment already documents "a slow
// install beats a failed one" as a LOCKED requirement; this loader's
// `loadLzmaModule()` upholds that same guarantee for the codec choice
// specifically: it NEVER rejects.
//
// LOGGING DISCIPLINE (T-23.1-04-04, Repudiation): this debug arc already
// shipped one silently-degraded decode path once -- the fallback from the
// pooled worker_threads decoder to inline main-thread decode was announced
// ONLY at build time (a one-time build-log warning printed inside
// `meta/buildSidecarSea.ts`) and ran unnoticed through five live HUMANKIND
// runs before `DecompressPool.stats()`'s own live instrumentation finally
// surfaced it (see decompressPool.ts's `init()` doc comment for the full
// evidence trail). The `logInfo` on the SUCCESS path below is therefore just
// as load-bearing as the `logWarning` on the failure path -- a log line that
// only speaks when something breaks cannot prove that nothing broke. Both
// fire EXACTLY ONCE per process (module-scope memoization, mirroring
// `getLzma()`'s prior once-per-isolate cache discipline).

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { LzmaModule } from './decompress'
import type { LzmaNativeStream } from 'lzma-native'

export type LzmaDecoderKind = 'native' | 'pure-js' | 'unresolved'

/**
 * KILL SWITCH (Phase 23.1 plan 05, THIRD finding, 2026-08-18 -- coordinator/
 * human-operator directed, after two earlier rounds of this same plan
 * genuinely fixed the worker-thread logger crash AND the identity-guard
 * that had been rejecting the real bundled resolveNativeBinding() call).
 * With BOTH of those fixed, a real cold-built, packaged SEA binary's
 * DecompressPool self-test (`GAMELIB_SIDECAR_SELFTEST=decompress-pool`)
 * showed native resolution AND its own smoke-test decode genuinely
 * succeeding (`inlineFallback:false`, `nativeWorkers` matching pool size)
 * -- but decoding a REAL-SIZED (64KB) chunk through that same resolved
 * native binding then HANGS until DecompressPool's own per-task timeout
 * fires, inside a genuinely compiled/postject-injected SEA binary
 * specifically. `smokeTest()` below only exercises a ~30-byte fixture and
 * cannot catch this -- it is NOT a trustworthy safety net for this failure
 * class, which is exactly why this separate, explicit switch exists rather
 * than relying on the smoke test to keep gating things correctly.
 *
 * Full investigation (what was ruled out, what wasn't, current status):
 * `.planning/debug/sea-native-lzma-real-chunk-decode-hang.md`.
 *
 * Effect when `false` (the shipped default): `resolveLzmaModule()` below
 * never even ATTEMPTS to import/smoke-test `lzma-native` -- it goes
 * straight to the pure-JS `lzma` package, unconditionally, every process.
 * This is deliberately a HARDER gate than "let the smoke test catch it" --
 * the smoke test's own proven blind spot is the whole reason this exists.
 *
 * IMPORTANT, do not oversell what this switch fixes: gating native OFF
 * removes lzma-native's own binding resolution as a contributing/
 * confounding variable (it is now provably correct at build time -- see
 * lzmaNativeBinding.ts) and closes the specific "native resolves, then
 * hangs" failure mode. It does NOT, by itself, prove a packaged SEA
 * binary's worker-pool decode path is safe end-to-end: the SAME real-sized
 * decode task hang was reproduced AGAIN with this switch OFF (`nativeWorkers
 * :0` confirmed, pure-JS path, still `decompress_pool_timeout`) -- see the
 * debug file's own "CRITICAL CORRECTION" entry. The underlying hang is not
 * lzma-native-specific; this switch narrows the search space, it does not
 * close the investigation.
 *
 * HOW TO SAFELY RE-ENABLE (do not just flip this to `true`):
 *   1. The debug file above must reach a `status: resolved` (or at minimum
 *      record a specific, understood root cause and fix) for the real-chunk
 *      decode hang -- not merely "the identity guard is fixed" (that is a
 *      DIFFERENT, already-closed defect; see that file's own round history).
 *   2. Re-run this exact self-test discipline against a REAL, cold
 *      `pnpm build:sidecar-sea` binary (`GAMELIB_SIDECAR_SELFTEST=
 *      decompress-pool`) and confirm BOTH `inlineFallback:false` AND
 *      `SELFTEST decode=ok ... match=true` -- the pool spawning/resolving
 *      correctly is NOT sufficient proof by itself (that was this exact
 *      finding's own false signal).
 *   3. Un-skip `lzmaNativeSeaRealBuild.test.ts`'s second test and confirm
 *      it passes for real, then flip this constant, then re-run a live
 *      Steam depot install end-to-end before considering this closed.
 */
const NATIVE_LZMA_DECODE_ENABLED = false

/**
 * Mutable copy of the kill switch above -- exists ONLY so
 * {@link setNativeLzmaDecodeEnabledForTests} (test-only) can override it
 * per-test without touching the documented, single-source-of-truth
 * production constant above. Production code must never write to this
 * directly; always go through {@link resolveLzmaModule}'s own read via
 * {@link isNativeLzmaDecodeEnabled}.
 */
let nativeLzmaDecodeEnabledOverride: boolean | undefined

function isNativeLzmaDecodeEnabled(): boolean {
  return nativeLzmaDecodeEnabledOverride ?? NATIVE_LZMA_DECODE_ENABLED
}

/**
 * Test-only: overrides the kill switch above so this file's own tests can
 * still prove the native adapter itself is correct (byte-equivalence
 * against the pure-JS package, the real error path, `lzmaDecoderKind()`
 * reporting `'native'`) without flipping the SHIPPING default. Named so
 * its test-only purpose is unmistakable, mirroring
 * {@link resetLzmaLoaderForTests}'s own convention. Pass `undefined` to
 * fall back to the real, documented `NATIVE_LZMA_DECODE_ENABLED` constant.
 */
export function setNativeLzmaDecodeEnabledForTests(
  enabled: boolean | undefined
): void {
  nativeLzmaDecodeEnabledOverride = enabled
}

let decoderKind: LzmaDecoderKind = 'unresolved'
let lzmaModulePromise: Promise<LzmaModule> | undefined

/**
 * Synchronous, purely observational inspector -- `'unresolved'` before the
 * first `loadLzmaModule()` call settles, matching `DecompressPool.stats()`'s
 * own "never read by any dispatch/queue/replace logic" discipline. Reported
 * by `decompressWorker.ts`'s ready handshake and by `DecompressPool.stats()`
 * (`nativeWorkers`) so a running install's own log/state can answer "which
 * decoder actually engaged" without a forensic round-trip.
 */
export function lzmaDecoderKind(): LzmaDecoderKind {
  return decoderKind
}

/**
 * Test-only: clears the module-scope memo and resets the observed kind.
 * Named so its test-only purpose is unmistakable -- it exists because
 * `loadLzmaModule()`'s module-scope memoization (the same discipline
 * `getLzma()` used before this plan) is otherwise untestable across
 * multiple `it()` blocks without `jest.isolateModules` gymnastics at every
 * single call site.
 */
export function resetLzmaLoaderForTests(): void {
  lzmaModulePromise = undefined
  decoderKind = 'unresolved'
  // Phase 23.1 plan 05: also clears any test-set kill-switch override, so a
  // test that called setNativeLzmaDecodeEnabledForTests(true) can never
  // leak that override into a later test/file that forgot to reset it --
  // the safe failure mode is always "falls back to the real, shipped
  // default," never "silently stays enabled."
  nativeLzmaDecodeEnabledOverride = undefined
}

// Known-good tiny lzma_alone stream + its expected plaintext, used ONLY to
// smoke-test that a freshly-imported native module can actually decode
// (RESEARCH.md's Pitfall 1 caught exactly this failure class for
// `node-liblzma`: a package that IMPORTS fine but rejects the format Steam's
// VZ chunks actually use). Precomputed OFFLINE via this project's own pinned
// `lzma@2.3.2` package (`lzma.compress(Buffer.from(SMOKE_TEST_PLAINTEXT),
// 1, cb)`) and hardcoded here -- built at module scope, so the probe costs
// nothing per worker and never depends on the pure-JS package being
// importable itself (it would be a strange loader indeed that needed its
// OWN fallback to validate its own primary path).
const SMOKE_TEST_PLAINTEXT = 'GameLib native LZMA smoke test'
const SMOKE_TEST_COMPRESSED = Buffer.from(
  'XQAAAQAeAAAAAAAAAAAjmEmmaNU9QZv2zMWgwBoOS7bmMf4lvW55BWHxuhxAgdOS2//9TwAA',
  'base64'
)

/**
 * Wraps `lzma-native`'s stream-based `createStream('aloneDecoder')` API
 * behind the EXACT `LzmaModule.decompress(input, callback)` callback shape
 * `decompress.ts`'s VZ branch already calls today -- this is what makes the
 * native swap a zero-line change in that function (RESEARCH.md's
 * "Recommended integration point" section). Passing the error as the
 * callback's SECOND argument (never throwing/rejecting directly out of this
 * function) is what lets `decompressChunk()`'s existing
 * `err ? reject(err) : resolve(...)` line keep working unmodified.
 *
 * Guards against a double-callback (a native `'error'` firing after
 * `'end'`, or vice versa) with a `settled` flag -- without it, a
 * double-fire would resolve AND reject the same downstream promise and
 * surface as an unhandled rejection, an easy way for this adapter to look
 * correct in the happy path while being unsafe on a malformed stream.
 *
 * ── THE KNOWN-SIZE HEADER REWRITE (2026-09-02) ─────────────────────────────
 * `lzma-native@8.0.6` bundles **liblzma 5.2.3** (read back at runtime via
 * `lzman.versionString()`), and that version's `lzma_alone_decoder` REJECTS
 * an lzma_alone stream that declares a KNOWN uncompressed size while ALSO
 * carrying an end-of-stream marker -- it fails the whole stream with
 * `Data is corrupt`. A newer liblzma does not: the system `xz 5.8.3`
 * decodes the very same bytes correctly, so the stream is valid and this is
 * purely a bundled-library version difference.
 *
 * That shape is not exotic here -- it is the ONLY shape this codebase
 * produces. The pure-JS `lzma` package writes known-size + EOS (the
 * module-scope SMOKE_TEST_COMPRESSED fixture below was re-derived from it
 * and is byte-identical, so the fixture is correct, not stale), and
 * `decompress.ts`'s real VZ branch rebuilds its alone header as
 * `props(5) + uncompressed size(8, LE)` -- also known-size. So without the
 * rewrite below, EVERY real Steam VZ chunk would fail to decode natively.
 *
 * Why this hid for so long: lzma-native's OWN `aloneEncoder` emits an
 * UNKNOWN size (`5d 00 00 10 00 ff ff ff ff ff ff ff ff`), so the library's
 * self-round-trip passes and never touches the rejecting path. Only a
 * stream from a DIFFERENT encoder reaches it.
 *
 * The fix is to hand liblzma the shape it does accept: rewrite the 8-byte
 * size field to "unknown" (0xFF x 8) on a COPY -- never through to the
 * caller's buffer -- and bound the output with the size we read out first.
 * Verified by bisection: flipping that field alone makes the identical
 * payload decode; the dictionary-size field is not a factor.
 *
 * The `'error'` recovery covers the remaining case, a known-size stream
 * with NO end marker: liblzma emits every decodable byte BEFORE erroring
 * (`No progress is possible`), so once `collected >= declaredSize` the
 * bytes we need are already in hand. Measured on a 30-byte fixture:
 * trimming 2/4/5 bytes of the end marker still yielded all 30; trimming 6
 * yielded 29 and is correctly still surfaced as an error. That threshold is
 * what keeps this a recovery and not a way to pad or invent output.
 */
function createNativeAdapter(native: {
  createStream: (coder: string) => LzmaNativeStream
}): LzmaModule {
  return {
    decompress(input, callback) {
      // lzma_alone header: props(1) + dictSize(4) + uncompressedSize(8) = 13.
      // Only the low 4 bytes of the size are ever populated by this codebase
      // (`decompress.ts` writes `size.writeUInt32LE(outSize, 0)`), and a
      // >4 GiB chunk is not a shape Steam depots produce.
      const ALONE_HEADER_SIZE = 13
      const SIZE_FIELD_OFFSET = 5
      const SIZE_FIELD_LENGTH = 8

      let stream = input
      let declaredSize: number | undefined

      if (input.length >= ALONE_HEADER_SIZE) {
        const sizeField = input.subarray(
          SIZE_FIELD_OFFSET,
          SIZE_FIELD_OFFSET + SIZE_FIELD_LENGTH
        )
        const alreadyUnknown = sizeField.every((byte) => byte === 0xff)
        if (!alreadyUnknown) {
          declaredSize = input.readUInt32LE(SIZE_FIELD_OFFSET)
          stream = Buffer.from(input)
          stream.fill(
            0xff,
            SIZE_FIELD_OFFSET,
            SIZE_FIELD_OFFSET + SIZE_FIELD_LENGTH
          )
        }
      }

      const decoder = native.createStream('aloneDecoder')
      const chunks: Buffer[] = []
      let decodedLength = 0
      let settled = false

      decoder.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        decodedLength += chunk.length
      })
      decoder.on('end', () => {
        if (settled) return
        settled = true
        if (declaredSize === undefined) {
          callback(Buffer.concat(chunks))
          return
        }
        // Rewriting the size field to "unknown" above hands liblzma a stream
        // it will decode, but it also hands away the length check that field
        // was buying -- a short/truncated payload would otherwise reach the
        // EOS marker early and be reported as a clean success. Re-assert it
        // here so the known-size guarantee survives the rewrite intact.
        if (decodedLength < declaredSize) {
          callback(
            Buffer.alloc(0),
            new Error(
              `lzma_alone stream declared ${declaredSize} uncompressed bytes ` +
                `but the payload decoded to only ${decodedLength} -- ` +
                'truncated or malformed chunk'
            )
          )
          return
        }
        callback(Buffer.concat(chunks).subarray(0, declaredSize))
      })
      decoder.on('error', (err: Error) => {
        if (settled) return
        settled = true
        if (declaredSize !== undefined && decodedLength >= declaredSize) {
          callback(Buffer.concat(chunks).subarray(0, declaredSize))
          return
        }
        callback(Buffer.alloc(0), err)
      })
      decoder.end(stream)
    }
  }
}

/** Decodes the module-scope smoke-test fixture through `adapter` and throws
 *  if the result doesn't match the known plaintext -- catches a native
 *  module that IMPORTS successfully but cannot actually decode (the exact
 *  failure class RESEARCH.md's Pitfall 1 found for `node-liblzma`, one
 *  candidate over from `lzma-native`). Kept as its own function so the
 *  caller's try/catch treats an import failure and a decode-smoke-test
 *  failure identically -- both fall through to the pure-JS path. */
async function smokeTest(adapter: LzmaModule): Promise<void> {
  const out = await new Promise<Buffer>((resolve, reject) => {
    adapter.decompress(SMOKE_TEST_COMPRESSED, (result, err) => {
      if (err) {
        reject(err)
        return
      }
      resolve(Buffer.from(result as number[] | Buffer))
    })
  })
  if (out.toString('utf8') !== SMOKE_TEST_PLAINTEXT) {
    throw new Error(
      'lzma-native smoke-test decode produced unexpected output -- the ' +
        'native module imported but cannot be trusted to decode correctly'
    )
  }
}

/** Mirrors the two pre-existing `import('lzma')` sites' own unwrap logic
 *  (decompressWorker.ts's prior `getLzma()`, decompressPool.ts's prior
 *  `inlineDecode()`) exactly -- a possible ESM-interop `.default` wrapper
 *  around the pure-JS package's CJS `module.exports`. */
async function resolvePureJs(): Promise<LzmaModule> {
  const mod = await import('lzma')
  return ((mod as { default?: LzmaModule }).default ??
    mod) as unknown as LzmaModule
}

async function resolveLzmaModule(): Promise<LzmaModule> {
  if (!isNativeLzmaDecodeEnabled()) {
    decoderKind = 'pure-js'
    logWarning(
      [
        'lzmaLoader: native lzma-native decode is explicitly DISABLED by',
        'this build (NATIVE_LZMA_DECODE_ENABLED=false, lzmaLoader.ts) --',
        'running the pure-JS lzma package for THE REST OF THIS PROCESS.',
        'This is a deliberate, temporary kill switch, not an import/',
        'smoke-test failure: a real cold-built packaged SEA binary showed',
        'native resolution AND its own small smoke-test decode genuinely',
        'succeeding, but decoding a real-sized chunk through that same',
        "binding then hangs until DecompressPool's own task timeout fires",
        '-- a failure class the smoke test below is proven unable to',
        'catch, so this switch does not rely on it. See',
        '.planning/debug/sea-native-lzma-real-chunk-decode-hang.md for the',
        'full investigation and the criteria for safely re-enabling this.'
      ],
      LogPrefix.Steam
    )
    return resolvePureJs()
  }

  try {
    const mod = await import('lzma-native')
    const native = ((mod as { default?: unknown }).default ?? mod) as {
      createStream: (coder: string) => LzmaNativeStream
    }
    const adapter = createNativeAdapter(native)
    await smokeTest(adapter)

    decoderKind = 'native'
    logInfo(
      [
        'lzmaLoader: native lzma-native decoder engaged for Steam VZ depot',
        'chunk decode (23.1-01 spike measured ~5.8-6.6x real-chunk speedup',
        "over the pure-JS path on darwin-arm64; CONTEXT.md's live",
        "measurement found decode, not network, was this codebase's actual",
        'throughput bottleneck). This line is logged exactly once per',
        "process -- its ABSENCE from a run's gamelib.log, with only the",
        'fallback warning below present instead, is how a silently-degraded',
        "decode path (this debug arc's own prior defect, closed for the",
        "worker pool via decompressPool.ts's DecompressPool.init() logging)",
        'is caught without another forensic round-trip.'
      ],
      LogPrefix.Steam
    )
    return adapter
  } catch (err) {
    decoderKind = 'pure-js'
    logWarning(
      [
        'lzmaLoader: lzma-native failed to load or smoke-test-decode --',
        'falling back to the pure-JS lzma package for THE REST OF THIS',
        "PROCESS. Decode will run at the pure-JS package's throughput",
        "(materially slower than native, see decompressWorker.ts's own",
        'header comment) but installs will still complete -- this fallback',
        'is a locked requirement, not a defect by itself. If unexpected,',
        'check that the lzma_native.node SEA asset embedded correctly',
        "(meta/buildSidecarSea.ts's native-asset step) and that this",
        'platform/arch ships an lzma-native prebuild.',
        `Cause: ${(err as Error)?.message ?? String(err)}.`
      ],
      LogPrefix.Steam
    )
    return resolvePureJs()
  }
}

/**
 * Resolves an `LzmaModule` -- native-first (`lzma-native`'s
 * `createStream('aloneDecoder')`, adapted to this project's existing
 * callback shape), degrading to the pure-JS `lzma` package if anything goes
 * wrong. Module-scope memoized on a single `Promise<LzmaModule>` (mirrors
 * the once-per-isolate cache discipline `getLzma()` used before this plan),
 * so two calls in the same isolate return the SAME instance and this
 * resolves/logs only once no matter how many chunks a worker (or the
 * inline fallback) ends up decoding.
 *
 * NEVER rejects. `DecompressPool.init()`'s own doc comment already states
 * "a slow install beats a failed one" as a LOCKED requirement -- this
 * function upholds that same guarantee for the codec choice specifically.
 */
export function loadLzmaModule(): Promise<LzmaModule> {
  if (!lzmaModulePromise) {
    lzmaModulePromise = resolveLzmaModule()
  }
  return lzmaModulePromise
}
