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
// fire EXACTLY ONCE per isolate (module-scope memoization, mirroring
// `getLzma()`'s prior once-per-isolate cache discipline). Every decode
// worker is its own isolate, so a pooled install logs one line per worker:
// a live install on 2026-10-12 logged 10 for `pool[size=10]`.

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { LzmaModule } from './decompress'
import type { LzmaNativeStream } from 'lzma-native'

export type LzmaDecoderKind = 'native' | 'pure-js' | 'unresolved'

/**
 * NATIVE DECODE SWITCH (Phase 23.1 plan 05; originally a kill switch).
 *
 * STATUS: ON, since 2026-10-11. The operator (Grayson Mitchell) revised the
 * 2026-08-18 standing decision on 2026-10-11, choosing re-enable over
 * delete: "re-enable it, I'll do the Mac install after".
 *
 * HISTORY. Native decode was gated OFF on 2026-08-18 after a real-sized
 * (64KB) decode timed out inside a real, cold-built SEA binary with native
 * engaged. The debug record then carried a CRITICAL CORRECTION: the same
 * timeout reproduced with native OFF (`nativeWorkers:0`, pure-JS path), so
 * the hang was codec-independent and this switch never guarded against it.
 * The debug doc is resolved as `closed_unreproduced`; the root cause is
 * still UNKNOWN. Non-recurrence (40/40 on 2026-08-18, 20/20 on 2026-09-12,
 * 20/20 on 2026-10-08) is not a cause and not a fix. Full investigation:
 * `.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md`.
 *
 * EVIDENCE FOR ON. Quick 261008-jvw (2026-10-08) ran the real cold-built SEA
 * self-test 20/20 at `nativeWorkers:2` with `decode=ok match=true` on
 * darwin-arm64, with `b79765af2` (the liblzma 5.2.3 known-size+EOS alone
 * stream fix in `createNativeAdapter()`) in the build. That proves
 * correctness for the self-test's synthetic 64 KiB VZ chunk on one machine.
 * It does NOT prove real depot bytes or other platforms.
 *
 * SPEED, re-measured 2026-10-12 through this adapter (`decompressChunk()` +
 * `loadLzmaModule()`, 15 timed runs per arm, both arm orders, sha1 match) on
 * spike 023's real-bytes 1 MiB VZ chunk, darwin-arm64: the
 * `prebuilds/darwin-arm64/node.napi.node` the SEA embeds links liblzma 5.4.3
 * and decodes in ~14-15 ms vs ~88-90 ms pure-JS (5.95-6.24x), so the
 * spike-023 figure holds and the adapter adds no measurable cost. A
 * source-built `node_modules/lzma-native/build/Release/lzma_native.node`
 * links the bundled liblzma 5.2.3 and decodes in ~32-34 ms (2.42-2.52x);
 * `node-gyp-build` prefers that file over the prebuild, so a dev sidecar or
 * jest run on a machine that has one measures the slower library. That
 * library version, not the adapter, was the spike-023 tension.
 *
 * WIN32 CAVEAT (a static fact, measured 2026-10-11): the win32-x64 lzma-native
 * prebuild imports a separate `liblzma.dll` that the SEA build does not
 * embed. The runtime outcome is recorded in quick 261011-mza's SUMMARY
 * (`.planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/`).
 *
 * LIVE AND CI EVIDENCE (2026-10-12). A native Baldur's Gate II: Enhanced
 * Edition install on darwin-arm64 (5.4.3 prebuild, 3.9 GB, 2465 files)
 * completed and verified with zero decode errors. `avgDecodeMs` was 17-26
 * against `avgNetMs` ~1.2 s, so fetch, not decode, bounded that install. CI's
 * first linux-x64 real-SEA run passed `lzmaNativeSeaRealBuild.test.ts` with
 * native engaged on every worker. Recorded in
 * `.planning/todos/completed/2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure.md`.
 *
 * HOW TO TURN IT BACK OFF. First, capture diagnostics at the moment of the
 * field failure; that run is the only evidence the 2026-08-18 closure asked
 * for. Then set the constant below to `false` and, in the SAME commit:
 *   - set `lzmaNativeSeaRealBuild.test.ts` test 1's expectation back to zero
 *     native workers (`expect(stats.nativeWorkers).toBe(0)`);
 *   - re-skip or retarget that file's native test;
 *   - flip `decompressPool.test.ts`'s default-is-native test.
 * Turning native off is the lever for a native-specific failure (a dlopen
 * crash, `Data is corrupt` rejections, a byte mismatch). It is not expected
 * to cure a pool-timeout hang of the 2026-08-18 kind, which reproduced with
 * native off.
 *
 * Effect when `false`: `resolveLzmaModule()` below never even ATTEMPTS to
 * import/smoke-test `lzma-native` -- it goes straight to the pure-JS `lzma`
 * package, unconditionally, every process. This is a harder gate than "let
 * the smoke test catch it": `smokeTest()` below only exercises a ~30-byte
 * fixture and is proven unable to catch a real-sized-chunk failure.
 */
const NATIVE_LZMA_DECODE_ENABLED = true

/**
 * Mutable copy of the switch above -- exists ONLY so
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
 * Test-only: overrides the switch above so this file's own tests can prove
 * the OFF path (`false`: pure-JS only, the operator's off switch warning)
 * and the native adapter itself (`true`: byte-equivalence against the
 * pure-JS package, the real error path, `lzmaDecoderKind()` reporting
 * `'native'`) regardless of the SHIPPING default. Named so its test-only
 * purpose is unmistakable, mirroring {@link resetLzmaLoaderForTests}'s own
 * convention. Pass `undefined` to fall back to the real, documented
 * `NATIVE_LZMA_DECODE_ENABLED` constant.
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
  // Phase 23.1 plan 05: also clears any test-set switch override, so a test
  // that called setNativeLzmaDecodeEnabledForTests(...) can never leak that
  // override into a later test/file that forgot to reset it -- the safe
  // failure mode is always "falls back to the real, shipped default,"
  // never "a test override silently stays in force."
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

/**
 * 261011-wrx: one sentence describing where the SEA binding extracted the
 * native addon (and, on win32, `liblzma.dll`) and whether the directory was
 * removed, or `undefined` when nothing was extracted (dev or unbundled runs)
 * or the record is malformed. Appended to the engaged line so an operator can
 * see the Windows temp-dir fate from gamelib.log alone. A LEFT BEHIND dir is
 * not permanent (261012-82w): the next sidecar process's first native load
 * sweeps the dirs of exited processes (see `describeStaleExtractionSweep`).
 *
 * The binding writes the record (`lzmaNativeBinding.ts`
 * `LZMA_NATIVE_EXTRACTION_RECORD_KEY`). It crosses via a `globalThis`
 * registry rather than a `require` of the binding, because `build:sidecar`
 * bundles with `--packages=external` and no node-gyp-build alias: a static
 * require would pull the binding, and its try-guarded require of the
 * gitignored `lzmaNativeResolvedPaths.generated.cjs`, into a bundle graph
 * that does not contain it today. The registry is isolate-scoped, matching
 * the per-worker extraction. Never throws: the loader never rejects.
 */
function describeNativeExtraction(): string | undefined {
  const record = (globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for('gamelib.lzmaNative.extraction')
  ]
  if (typeof record !== 'object' || record === null) {
    return undefined
  }
  const { dir, leftover } = record as { dir?: unknown; leftover?: unknown }
  if (typeof dir !== 'string' || typeof leftover !== 'boolean') {
    return undefined
  }
  return leftover
    ? `SEA extraction dir ${dir} was LEFT BEHIND: Windows cannot unlink a ` +
        'loaded addon or the liblzma.dll it maps while this process runs, ' +
        'so each worker of each sidecar process that engages native decode ' +
        'leaves one gamelib-lzma-native-* dir in the OS temp dir ' +
        '(261011-wrx); a later sidecar process removes them on its first ' +
        'native load once this one has exited (261012-82w).'
    : `SEA extraction dir ${dir} was removed after load.`
}

/**
 * 261012-82w: one sentence reporting how many stale extraction directories
 * the binding's win32 sweep removed before this load, or `undefined` when
 * nothing was removed, no sweep ran (dev, unbundled, non-win32), or the
 * record is malformed. Appended to the existing engaged `logInfo` call and the
 * import-failure `logWarning` call, so the number of log calls is unchanged
 * and a sweep that deleted files is never silent.
 *
 * Crosses from the binding the same way as the extraction record
 * (`describeNativeExtraction` above): a `globalThis` registry read by
 * literal, because the loader never imports the binding. The key must equal
 * the binding's `LZMA_NATIVE_STALE_SWEEP_RECORD_KEY` (a test reads the key
 * from the binding static so drift turns it red). Never throws.
 */
function describeStaleExtractionSweep(): string | undefined {
  const record = (globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for('gamelib.lzmaNative.staleSweep')
  ]
  if (typeof record !== 'object' || record === null) {
    return undefined
  }
  const { examined, removed } = record as {
    examined?: unknown
    removed?: unknown
  }
  if (
    typeof examined !== 'number' ||
    typeof removed !== 'number' ||
    !Number.isInteger(examined) ||
    !Number.isInteger(removed) ||
    examined < 0 ||
    removed <= 0
  ) {
    return undefined
  }
  return (
    `Swept ${removed} stale gamelib-lzma-native-* dir(s) from the OS temp ` +
    `dir whose owning process had exited (${examined} probed; 261012-82w).`
  )
}

async function resolveLzmaModule(): Promise<LzmaModule> {
  if (!isNativeLzmaDecodeEnabled()) {
    decoderKind = 'pure-js'
    logWarning(
      [
        'lzmaLoader: native lzma-native decode is DISABLED --',
        'NATIVE_LZMA_DECODE_ENABLED is false in this build (lzmaLoader.ts)',
        'or a test override is set -- running the pure-JS lzma package for',
        "THE REST OF THIS PROCESS. This is the operator's off switch, not",
        'an import/smoke-test failure. The shipped default is ON since the',
        "operator's 2026-10-11 revision of the 2026-08-18 decision. The",
        '2026-08-18 real-sized-chunk decode hang reproduced with native',
        'off, so turning native off is not expected to cure a pool-timeout',
        'hang. See',
        '.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md',
        'for the full investigation, and the doc comment on',
        'NATIVE_LZMA_DECODE_ENABLED for the turn-off steps.'
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
    const extraction = describeNativeExtraction()
    const sweep = describeStaleExtractionSweep()
    logInfo(
      [
        'lzmaLoader: native lzma-native decoder engaged for Steam VZ depot',
        'chunk decode (~6x real-chunk speedup over the pure-JS path on',
        'darwin-arm64 with the liblzma 5.4.3 prebuild, re-measured 2026-10-12',
        'through this adapter; ~2.5x with a liblzma 5.2.3 source build;',
        "CONTEXT.md's live measurement found",
        "decode, not network, was this codebase's actual",
        'throughput bottleneck). This line is logged once per isolate, so',
        "once per decode worker -- its ABSENCE from a run's gamelib.log,",
        'with only the fallback warning below present instead, is how a',
        'silently-degraded',
        "decode path (this debug arc's own prior defect, closed for the",
        "worker pool via decompressPool.ts's DecompressPool.init() logging)",
        'is caught without another forensic round-trip.',
        ...(extraction ? [extraction] : []),
        ...(sweep ? [sweep] : [])
      ],
      LogPrefix.Steam
    )
    return adapter
  } catch (err) {
    decoderKind = 'pure-js'
    const failureSweep = describeStaleExtractionSweep()
    logWarning(
      [
        'lzmaLoader: lzma-native failed to load or smoke-test-decode --',
        'falling back to the pure-JS lzma package for THE REST OF THIS',
        "PROCESS. Decode will run at the pure-JS package's throughput",
        "(materially slower than native, see decompressWorker.ts's own",
        'header comment) but installs will still complete -- this fallback',
        'is a locked requirement, not a defect by itself. If unexpected,',
        'check that the lzma_native.node SEA asset (and, on win32, the',
        'liblzma.dll companion SEA asset the addon imports at dlopen)',
        "embedded correctly (meta/buildSidecarSea.ts's native-asset step)",
        'and that this platform/arch ships an lzma-native prebuild.',
        `Cause: ${(err as Error)?.message ?? String(err)}.`,
        ...(failureSweep ? [failureSweep] : [])
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
