// Leaf chunk decoder: decrypt -> decompress -> sha1/size integrity gate.
//
// Split out of decompress.ts so the decode worker bundle (decompressWorker.ts)
// does not drag in fetchChunk's CDN imports (cdnAuth, hostHealth, inflightLimiter)
// or backend/logger. Allowed imports here: node:crypto, ./crypto, and the dynamic
// node:zlib / zstddec imports -- nothing else. Spikes 067a/067b: the old 14 MB
// worker bundle cost ~160 MiB RSS per idle worker.

import { createHash } from 'node:crypto'
import { steamDecrypt } from './crypto'
/** Decoder-agnostic callback shape this module depends on -- satisfied
 *  either directly by the pure-JS `lzma` npm package, or (Phase 23.1 plan
 *  04) by `lzmaLoader.ts`'s adapter over `lzma-native`'s
 *  `createStream('aloneDecoder')` stream API. Keeping this one callback
 *  shape stable across BOTH decoders is exactly why the native swap needed
 *  zero edits to `decompressChunk()`'s VZ branch below -- `lzmaLoader.ts`
 *  owns adapting `lzma-native`'s stream events into this same
 *  `decompress(input, callback)` call, so this interface, and every
 *  existing call site (decompressWorker.ts's `handleDecodeMessage()`,
 *  decompressPool.ts's `inlineDecode()`, every test in
 *  decompressPool.test.ts), stays untouched. */
export interface LzmaModule {
  decompress(
    input: Buffer,
    callback: (result: number[] | Buffer | string, error?: Error) => void
  ): void
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
export const RAW_BODY_PREVIEW_BYTES = 16

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
    // Local file header is 30 bytes + filename + extra.
    const nameLen = buf.readUInt16LE(26)
    const extraLen = buf.readUInt16LE(28)
    const body = buf.subarray(30 + nameLen + extraLen)

    // Debug/steam-depot-decode-z-data: the local-file-header's compression-
    // method field (offset 8, 2 bytes LE) was never read here -- every
    // PK-magic chunk was force-fed through zlib.inflateRawSync() assuming
    // method 8 (Deflated). Valve's depot chunks can ALSO use method 0
    // (Stored/uncompressed) -- plausible, and observed, for small chunks
    // where Deflate has no benefit. SteamKit2's own reference implementation
    // (SteamKit2/SteamKit2/Util/ZipUtil.cs) uses .NET's ZipArchive, which
    // transparently supports both methods, confirming this is a real, valid
    // container shape and not a hypothetical. Feeding a genuinely-Stored
    // body into inflateRawSync throws Z_DATA_ERROR deterministically --
    // reproduced the exact symptom (depots 259132/259134, 128-byte chunk,
    // byte-identical across all 6 CDN hosts, 100% deterministic) even though
    // decrypt and CDN content were both correct.
    const compressionMethod = buf.readUInt16LE(8)
    if (compressionMethod === 0) {
      // Debug/steam-depot-decode-z-data (cycle 2): the FIRST Stored fix
      // (`return Buffer.from(body)`, `body` running to the buffer's end) was
      // confirmed on real hardware to eliminate Z_DATA_ERROR entirely, but
      // still lost ~8/747 chunks to a narrower `sha1_mismatch` -- one
      // 128-byte chunk (depot 259134) across multiple hosts. A ZIP local
      // file header is followed by the payload, but `buf` is the WHOLE
      // container: a real ZIP also carries a central directory file header
      // (46 bytes + name + extra + comment) and an end-of-central-directory
      // record (22 bytes + comment) AFTER the payload. `body` above runs to
      // the buffer's end, so it silently absorbed that trailing metadata as
      // if it were data. Deflate never exposed this because
      // `inflateRawSync` stops at the end of the deflate stream and ignores
      // trailing bytes -- Stored has no decoder to stop at the right place,
      // so it's the only method that surfaces the over-read. Truncate to
      // the local header's OWN declared Stored length (compressedSize ==
      // uncompressedSize at offset 18/22 for method 0) instead of trusting
      // the buffer's end.
      const generalPurposeFlags = buf.readUInt16LE(6)
      const hasTrailingDataDescriptor = (generalPurposeFlags & 0x08) !== 0

      let storedLength: number
      if (hasTrailingDataDescriptor) {
        // Bit 3 set: per the ZIP spec, the local header's size fields are
        // zero and the true sizes live in a data descriptor written AFTER
        // the payload -- there's no reliable in-header signal for where the
        // payload ends in this case. Fall back to the trusted,
        // manifest-derived cbOriginal (same trust boundary the zstd branch
        // above already relies on for its own pre-decode size gate).
        if (cbOriginal === undefined) {
          throw new ChunkDecodeError(
            'unknown_container',
            'PK chunk: Stored entry uses a trailing data descriptor (general-purpose bit 3 set) and no cbOriginal was supplied to bound the payload length',
            buf.subarray(0, RAW_BODY_PREVIEW_BYTES)
          )
        }
        storedLength = Number(cbOriginal)
      } else {
        storedLength = buf.readUInt32LE(18) // compressedSize (== uncompressedSize for Stored)
      }

      if (storedLength > body.length) {
        throw new ChunkDecodeError(
          'size_mismatch',
          `PK chunk: declared Stored payload length ${storedLength} exceeds available bytes ${body.length}`
        )
      }

      return Buffer.from(body.subarray(0, storedLength))
    }
    if (compressionMethod === 8) {
      const zlib = await import('node:zlib')
      return zlib.inflateRawSync(body)
    }

    throw new ChunkDecodeError(
      'unknown_container',
      `PK chunk: unsupported compression method ${compressionMethod}`,
      buf.subarray(0, RAW_BODY_PREVIEW_BYTES)
    )
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

    // Debug/steam-depot-decode-z-data (cycle 2, secondary/low-risk):
    // check length BEFORE hash. A wrong-length decode (e.g. a container
    // over-read that grabbed trailing bytes it shouldn't have) previously
    // surfaced as the less diagnostic `sha1_mismatch` -- almost any wrong
    // length also fails the hash, so the more specific, more actionable
    // `size_mismatch` classification was unreachable in practice. Checking
    // size first costs nothing (both checks always ran before; only the
    // ORDER and which one is reported first changes) and makes future
    // wrong-length defects diagnosable straight from the reason code
    // instead of requiring another debug session to re-derive.
    if (data.length !== Number(cbOriginal)) {
      throw new ChunkDecodeError(
        'size_mismatch',
        `chunk size mismatch: ${data.length} != ${cbOriginal}`
      )
    }

    // The chunk's SHA1 is the hash of its DECOMPRESSED bytes — free integrity check.
    const got = sha1(data)
    if (got !== expectedSha) {
      throw new ChunkDecodeError(
        'sha1_mismatch',
        `chunk sha1 mismatch: ${got} != ${expectedSha}`
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
