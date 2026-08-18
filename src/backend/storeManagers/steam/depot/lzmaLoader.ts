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
 */
function createNativeAdapter(native: {
  createStream: (coder: string) => LzmaNativeStream
}): LzmaModule {
  return {
    decompress(input, callback) {
      const decoder = native.createStream('aloneDecoder')
      const chunks: Buffer[] = []
      let settled = false

      decoder.on('data', (chunk: Buffer) => chunks.push(chunk))
      decoder.on('end', () => {
        if (settled) return
        settled = true
        callback(Buffer.concat(chunks))
      })
      decoder.on('error', (err: Error) => {
        if (settled) return
        settled = true
        callback(Buffer.alloc(0), err)
      })
      decoder.end(input)
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
        'over the pure-JS path on darwin-arm64; CONTEXT.md\'s live',
        'measurement found decode, not network, was this codebase\'s actual',
        'throughput bottleneck). This line is logged exactly once per',
        'process -- its ABSENCE from a run\'s gamelib.log, with only the',
        'fallback warning below present instead, is how a silently-degraded',
        'decode path (this debug arc\'s own prior defect, closed for the',
        'worker pool via decompressPool.ts\'s DecompressPool.init() logging)',
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
        'PROCESS. Decode will run at the pure-JS package\'s throughput',
        '(materially slower than native, see decompressWorker.ts\'s own',
        'header comment) but installs will still complete -- this fallback',
        'is a locked requirement, not a defect by itself. If unexpected,',
        'check that the lzma_native.node SEA asset embedded correctly',
        '(meta/buildSidecarSea.ts\'s native-asset step) and that this',
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
