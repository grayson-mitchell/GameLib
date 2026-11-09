// Decode-stage error codes, split out of depot/decompress.ts (73-11) so depotErrors.ts
// and the Rust error map do not depend on the legacy depot/ directory. Pure.

/** Debug/steam-install-slow-start (cycle 17, retry-storm resilience): the
 *  five `ChunkDecodeError` codes `decodeChunk`/`decompressChunk` can throw —
 *  every one of them is determined ENTIRELY by (ciphertext bytes, key),
 *  never by which host served the bytes or how many times it's retried (see
 *  the debug session's "Cycle 16 supplementary data" evidence: the identical
 *  encrypted chunk failed `unknown_container` on ALL 6 hosts, all 555
 *  attempts, byte-identical ciphertext across hosts). `downloadFileChunks`
 *  (depot.ts) recognizes a fully-exhausted `fetchChunk` call's final error as
 *  decode-stage via the exported `isDecodeStageError` below (which reads
 *  this set internally) and stops re-queuing it — re-queuing a deterministic
 *  failure for another 8-attempt/6-host pass cannot ever succeed and is
 *  exactly the mechanism that collapsed one hardware run to 11,063 total
 *  attempt rotations (one single chunk alone: 555) before this fix. */
// Exported for the Rust error map (depotRust/errorMap.ts), which asserts its
// decode_failed codes stay inside this set.
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
