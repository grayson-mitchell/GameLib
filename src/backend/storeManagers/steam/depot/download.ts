// Depot chunk/file download engine: concurrency constants, containment/sha1 helpers, downloadFileChunks and downloadSingleFile (extracted from ../depot.ts, 62-09).

import { logWarning, LogPrefix } from 'backend/logger'
import {
  open,
  mkdir,
  lstat,
  symlink,
  rm,
  rmdir,
  chmod,
  type FileHandle
} from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, dirname, isAbsolute } from 'path'
import {
  fetchChunk,
  isDecodeStageError,
  type LzmaModule,
  type DepotChunk,
  type DecodeFn,
  type OnChunkAttempt,
  type ContentServerHostMeta
} from './decompress'
import { HostHealthTracker } from './hostHealth'
import { CdnAuthTokenCache } from './cdnAuth'
import { StallTracker } from './stallTracker'
import { InflightLimiter } from './inflightLimiter'
import { applyDepotFileFlags } from './fileAttributes'
import {
  DIRECTORY_FLAG,
  SYMLINK_FLAG,
  EXECUTABLE_FLAG,
  CUSTOM_EXECUTABLE_FLAG,
  READONLY_FLAG,
  HIDDEN_FLAG,
  type DepotModeCounters,
  type DepotPlanFile
} from './planModel'
import { applyMachOExecutableFallback } from './machO'

// ─────────────────────────────────────────────────────────────────────────
// Phase 21 (21-05): Streaming chunk-download loop.
//
// Consumes a DepotPlan (Plan 04) and writes every file's bytes to disk via
// positional writes to an open fd — NEVER a whole-file Buffer.alloc (RESEARCH
// Pattern 2 / D-14's "no fallback for 50GB+" requirement). Chunk fetches
// within a single file are bounded by CHUNK_CONCURRENCY (NOT an unbounded
// fan-out over every chunk in one go — a multi-GB file can hold thousands of
// ~1MB chunks, so firing them all at once would defeat the size-independent
// memory bound, T-21-02). Every decrypted filename is containment-checked
// against the common/{installdir} root BEFORE any fs call (T-21-01). Progress
// is throttled and emitted in the exact shape library.ts's pollInstallOnce()
// already speaks, so the DownloadManager needs zero changes (D-01/D-03).
// AbortSignal is consulted before every chunk/file so a queue-cancel stops
// the loop promptly (D-02).
//
// Deliberately a SEPARATE exported function (not folded into
// downloadSteamDepots itself) — it operates "on top of" an already-built
// DepotPlan, has no dependency on the authenticated SteamUser client, and
// stays independently unit-testable (mirrors 21-04's own precedent of
// scoping each function to exactly what it needs).
// ─────────────────────────────────────────────────────────────────────────

/** Bounded chunk-level concurrency PER FILE — never an unbounded fan-out over
 *  every chunk in one go (T-21-02). Small on purpose: a single multi-GB file
 *  can hold thousands of ~1MB chunks.
 *
 *  Quick 260817-ihr (IHR-02): the REAL run-wide network concurrency bound is
 *  now `TARGET_INFLIGHT_CHUNKS` (below), enforced by `InflightLimiter` at
 *  the actual fetch boundary — CHUNK_CONCURRENCY * FILE_CONCURRENCY no
 *  longer describes an accurate ceiling on its own (it never did in
 *  practice: see FILE_CONCURRENCY's own doc comment for the 2026-08-17
 *  evidence this was silently capped at 8, not 32). */
export const CHUNK_CONCURRENCY = 4
/** Bounded file-level concurrency across ALL depots' files (spike-proven
 *  queue pattern).
 *
 *  Quick 260817-ihr (IHR-02): raised 8 -> 32. The pre-260817-ihr value of 8
 *  combined with CHUNK_CONCURRENCY=4 to describe an INTENDED 32 concurrent
 *  requests, but `downloadFileChunks` derives its own per-file worker count
 *  as `Math.min(CHUNK_CONCURRENCY, queue.length)`, so a single-chunk file —
 *  the overwhelming majority of files in a modern game depot — only ever
 *  ran ONE chunk-worker. The 2026-08-17 HUMANKIND hardware log proved the
 *  real-world consequence directly: Little's Law on that run's own numbers
 *  (16092 attempts / 1334s = 12.06 attempts/sec x 0.692s avg latency) gives
 *  8.35 requests actually in flight — exactly FILE_CONCURRENCY's old value
 *  of 8, not the intended 32. Raising FILE_CONCURRENCY alone (with no
 *  separate cap) would let a multi-chunk file explode past 32 in flight (up
 *  to FILE_CONCURRENCY x CHUNK_CONCURRENCY = 128); the real bound is now
 *  `TARGET_INFLIGHT_CHUNKS`, enforced by `InflightLimiter` at the network
 *  boundary, not the product of these two pool sizes. */
// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding -- no
// external consumer references it; every hit outside this file is a prose
// comment).
export const FILE_CONCURRENCY = 32
/** Quick 260817-ihr (IHR-02): the explicit run-wide in-flight chunk-fetch
 *  budget — the concurrency the pre-existing FILE_CONCURRENCY *
 *  CHUNK_CONCURRENCY design always intended (8 x 4 = 32) and never actually
 *  achieved (see FILE_CONCURRENCY's doc comment). Enforced by one
 *  `InflightLimiter` instance per download run, constructed in
 *  `downloadDepotFiles` alongside the run's `HostHealthTracker`. */
export const TARGET_INFLIGHT_CHUNKS = 32
/** Debug/steam-install-slow-start gap closure: per-chunk retry budget passed to
 *  fetchChunk (host-rotating retry across content servers). fetchChunk's own
 *  docstring documents a ~16% per-chunk transient failure rate at
 *  FILE_CONCURRENCY=8 without retry — over the thousands of chunks a large
 *  modern game holds, the previous attempts=4 gave too little headroom: the
 *  probability that AT LEAST ONE chunk exhausts every attempt approaches
 *  certainty, and a single exhausted chunk currently escalates the WHOLE
 *  install to a hard "Steam servers dropped the connection" failure
 *  (downloadSteamDepots' failures.length check) even though that CDN chunk
 *  retry never touches the authenticated SteamUser CM/session connection at
 *  all. Raised (not unbounded) — still backed off, still host-rotating,
 *  extends rather than replaces the existing mechanism. */
export const CHUNK_FETCH_ATTEMPTS = 8

/** Bytes per MiB — the DownloadManager UI renders `downSpeed` with a "MB/s" label
 *  and the gog/legendary runners emit MiB/s, so the native path must too (was
 *  raw bytes/sec, ~1e6× too large — UAT D-UAT-02). */
const BYTES_PER_MIB = 1024 * 1024

/** Formats an ETA in seconds as `HH:MM:SS` for the DownloadManager ETA field —
 *  matches the gog/legendary runners' formatted-string convention. Emitting raw
 *  `${sec}s` produced unreadable values like "1247s" (UAT D-UAT-02). */
export function formatEta(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
export const PROGRESS_THROTTLE_MS = 500
export const PROGRESS_THROTTLE_PERCENT = 1

/** Forces a progressUpdate at least once per second, independent of chunk
 *  completion. Without this, the DownloadManager ProgressHeader graph freezes
 *  for however long chunk completions bunch up (warm-up, large files, decode-
 *  pool backlog under load) -- observed gaps of ~30s in practice. */
export const PROGRESS_HEARTBEAT_MS = 1000

/** Minimum window (seconds) for a meaningful rolling-rate sample. A forced
 *  emit right after a throttled one can have a sub-millisecond delta; dividing
 *  by it yields a garbage spike, so below this we reuse the previous rate. */
const MIN_RATE_WINDOW_SEC = 0.05

/**
 * Rolling (instantaneous) transfer rate in MiB/s over the window since the last
 * emit — NOT a cumulative average since the download started, so the figure
 * tracks the CURRENT rate and drops promptly when the transfer slows or stalls.
 * Reuses `previousMiBs` when the window is too small to be meaningful (a forced
 * emit landing right on top of a throttled one). Pure + exported for testing.
 */
export function rollingRateMiBs(
  bytesDelta: number,
  msDelta: number,
  previousMiBs: number
): number {
  const secDelta = msDelta / 1000
  if (secDelta < MIN_RATE_WINDOW_SEC) return previousMiBs
  const rate = bytesDelta / secDelta / BYTES_PER_MIB
  return rate > 0 ? rate : 0
}

/** Thrown when a decrypted filename resolves outside the target install root (T-21-01). */
export class PathTraversalError extends Error {}

/**
 * Resolve `filename` against `root` and verify containment via relative()
 * BEFORE any fs call — path.join alone is not containment (Phase 18 lesson,
 * per user memory). A "../"-escaping filename never reaches open()/mkdir().
 */
/**
 * Remove a stale DIRECTORY sitting where a manifest FILE entry belongs, so a
 * retry can actually write it (debug/steam-depot-unclassified-generic-error).
 *
 * Uses `rmdir`, NOT `rm`, and that choice is load-bearing in both directions:
 *  - `rm(dest, { force: true })` throws `ERR_FS_EISDIR` against a directory
 *    even when it is EMPTY (measured, not assumed), so it cannot do this job;
 *  - `rm(dest, { recursive: true })` would delete a directory full of real
 *    files. A manifest path colliding with a populated directory is an
 *    ambiguous state that must SURFACE, never be silently erased.
 *
 * `rmdir` removes an empty directory and refuses a populated one with
 * ENOTEMPTY — exactly the wanted semantics. The refusal is rethrown with a
 * message naming the file, so it lands in downloadDepotFiles' failure list and
 * the operator is told what to do, instead of a bare fs error.
 *
 * Scope limit, deliberate: only a REAL directory is handled (`lstat`, so a
 * symlink is never followed). A symlink pointing AT a directory would still
 * fail EISDIR — not the observed defect, and clearing it silently would be a
 * bigger behaviour change than this fix is entitled to make.
 */
async function clearStaleDirectoryAtFilePath(
  dest: string,
  filename: string
): Promise<void> {
  let st
  try {
    st = await lstat(dest)
  } catch {
    // Nothing at that path — the overwhelmingly common case (fresh install).
    return
  }
  // A stale FILE needs no special handling: open(dest, 'w') truncates it.
  if (!st.isDirectory()) return

  try {
    await rmdir(dest)
  } catch (err) {
    throw new Error(
      `downloadDepotFiles: "${filename}" is a file in the depot manifest, but a ` +
        `NON-EMPTY directory exists at that path. Refusing to delete it ` +
        `(${(err as Error).message}) — remove it by hand and retry the install.`
    )
  }

  logWarning(
    `downloadDepotFiles: removed a stale empty directory at "${filename}" so the ` +
      `manifest's file could be written — without this the write fails EISDIR on ` +
      `every retry (see depot/pathCollisions.ts for how one gets created)`,
    LogPrefix.Steam
  )
}

export function resolveContainedPath(root: string, filename: string): string {
  const dest = resolve(root, filename.replace(/\\/g, '/'))
  const rel = relative(root, dest)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathTraversalError(
      `downloadDepotFiles: rejected path-traversal filename "${filename}" (escapes ${root})`
    )
  }
  return dest
}

/** Streaming whole-file SHA1 — a ReadStream piped through createHash, never a
 *  whole-file Buffer re-read (would defeat the point of streaming the write).
 *  Exported for reuse by depot/reconcile.ts (Phase 23, 23-03, D-04) — the
 *  Shared Patterns rule requires reconciliation compose this, not
 *  reimplement it.
 *
 *  `onProgress` (quick 260926-ju4) fires once per stream `data` event, with
 *  that event's byte count. It exists because this re-read is the DOMINANT
 *  cost of downloadSingleFile's post-chunk verify tail: on a multi-GB pak on
 *  a slow or external disk it runs for minutes while writing nothing, and
 *  the run's forward-progress clock (depot/stallTracker.ts) has no other way
 *  to tell that read apart from a wedged run. Per-event, never once at the
 *  end — a signal that only fires on completion reports nothing during the
 *  minutes that matter. The callback is a pure side-channel: `hash.update`
 *  runs first and the digest is unaffected.
 *
 *  OPTIONAL, and that is load-bearing rather than politeness:
 *  depot/reconcile.ts:144 calls this with one argument, and it runs at
 *  depot.ts:2187 — BEFORE the run's StallTracker is constructed at :2280 —
 *  so the reconciler's own whole-file SHA1 pass can neither arm the stall
 *  bound nor use the signal. */
export function sha1File(
  path: string,
  onProgress?: (bytesRead: number) => void
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk: string | Buffer) => {
      hash.update(chunk)
      onProgress?.(chunk.length)
    })
    stream.on('end', () => resolvePromise(hash.digest('hex')))
  })
}

export interface DownloadDepotFilesOpts {
  targetSteamappsDir: string
  installdir: string
  /** Content-server hostnames from client.getContentServers() — caller-supplied
   *  so this loop stays decoupled from the SteamUser client for testability. */
  hosts: string[]
  /** Debug/steam-install-slow-start (cycle 5): the content-server directory's
   *  own `weightedload` ranking per host (cycle-4 lead (a) — captured in
   *  getContentServerHosts's RAW dump but previously discarded entirely).
   *  Seeds HostHealthTracker's cold-start PRIOR (depot/hostHealth.ts) so a
   *  fresh download run favors the directory's own low-weightedload (local,
   *  less-loaded) edges from the very first attempt, instead of treating
   *  every host as an equal blind round-robin candidate. Optional — omitting
   *  it (every pre-cycle-5 caller/test) leaves HostHealthTracker's cold-start
   *  behavior byte-for-byte unchanged. */
  hostWeightedLoads?: ReadonlyMap<string, number>
  /** Debug/steam-install-slow-start (cycle 6): CDN auth token cache, created
   *  in downloadSteamDepots (where the authenticated client is available —
   *  this loop stays decoupled from the SteamUser client for testability,
   *  same discipline as `hosts` above) and threaded down to every fetchChunk
   *  call. Optional — omitting it (every pre-cycle-6 caller/test) leaves
   *  every chunk/manifest URL byte-for-byte unchanged (no token appended). */
  cdnAuth?: CdnAuthTokenCache
  /** Debug/steam-install-slow-start (cycle 7): per-host `https_support`/
   *  `usetokenauth` directory metadata (see depot/decompress.ts's
   *  `ContentServerHostMeta`), threaded down to every fetchChunk call for
   *  EXACT steam-user URL-scheme/token parity. Optional — omitting it
   *  (every pre-cycle-7 caller/test) leaves fetchChunk's URL byte-for-byte
   *  unchanged (hardcoded https://, no token). */
  hostMeta?: ReadonlyMap<string, ContentServerHostMeta>
  signal?: AbortSignal
  /** debug/depot-stall-bound-did-not-fire (2026-09-25): this run's
   *  forward-progress clock — see depot/stallTracker.ts. Caller-supplied for
   *  the same reason `hosts` above is (this loop stays decoupled and
   *  testable): StallTracker's give-up window is three real MINUTES, so the
   *  run-scoped give-up below cannot be exercised deterministically unless a
   *  test can inject a tracker with its own timeout. Optional — omitting it
   *  (every production caller; `downloadSteamDepots` at the only non-test
   *  call site does) constructs a fresh default-window StallTracker exactly
   *  as before, so behaviour is byte-for-byte unchanged. */
  stallTracker?: StallTracker
}

export interface DepotDownloadFailure {
  file: string
  error: string
  /** 37-02 (D-08 landmine fix): the ORIGINAL thrown value, retained so
   *  classifyDepotError can read `.code`/`.eresult` off it directly instead
   *  of the pre-flattened `error` string, which `errorText()` already
   *  reduces an Error down to `.message` for — discarding those properties
   *  before classification ever runs. `error` stays a plain `string` and is
   *  untouched by this field: every existing consumer (canWriteFullOwnership,
   *  finalizeToSteam, and this interface's other reader) keeps reading
   *  `error` exactly as before. `cause` is optional because not every
   *  producer of a DepotDownloadFailure (e.g. healReconciledFileModes' mode-
   *  application failures) has an original thrown object to preserve. */
  cause?: unknown
  /** Quick 260927-tpm (D-A, correcting review finding I-1's residual): tags
   *  a RUN-level give-up (the whole-run stall bound below) so it can be
   *  told apart from a per-FILE failure without splitting this array in
   *  two — the array shape and every existing reader
   *  (canWriteFullOwnership, the post-loop verdicts, the error-path entry
   *  gate below) stay byte-for-byte unchanged (D-B); only
   *  formatDownloadFailureSummary partitions on this field, to correct the
   *  aggregate log line's file count. Absent means file-level, the
   *  overwhelmingly common case — so every existing producer of this
   *  interface (the per-file catch below, healReconciledFileModes) needs
   *  no change. A string union of one value, not a boolean, so a future
   *  second run-level reason (if one is ever needed) is expressible
   *  without a second boolean fighting this one. */
  scope?: 'run'
}

export interface DepotDownloadResult {
  outcome: 'completed' | 'cancelled'
  failures: DepotDownloadFailure[]
  /** Every planned file for this run was attempted (queue fully drained, no
   *  abort mid-way) AND every attempt succeeded (no failures). False when
   *  the run was cancelled before every job was processed, or when any job
   *  failed. Phase 23 (23-02, D-01): feeds canWriteFullOwnership. */
  allFilesVerifiedThisRun: boolean
  /** Every EDepotFileFlag mode application (exec/readonly/hidden, 23-01) for
   *  this run succeeded. A mode-application failure already surfaces as a
   *  DepotDownloadFailure, so this is currently derived from the same
   *  failures list — kept as an explicit field so the completeness gate
   *  never has to re-derive it ad-hoc (Phase 23, 23-02). */
  allModesApplied: boolean
}

/**
 * Phase 23 (23-02, D-01/D-02): the single completeness gate deciding whether
 * finalizeToSteam may write StateFlags=4 (full ownership, no Steam verify
 * pass) instead of the safe 1026 verify-handoff. Fails CLOSED — every input
 * must be unambiguously present and good; any missing/ambiguous field (an
 * absent buildid, a non-'completed' outcome, a single failure, an unverified
 * file, an unapplied mode) resolves to false, never true. This is the ONLY
 * place this decision is made — both the fresh-install path (this plan) and
 * the future resume/reconciliation path (D-04) must call this exact function
 * rather than inlining the check, so the two paths can never silently
 * diverge (RESEARCH.md Pitfall 2).
 */
export function canWriteFullOwnership(opts: {
  outcome: 'completed' | 'cancelled'
  failures: DepotDownloadFailure[]
  buildid?: string
  allFilesVerified: boolean
  allModesApplied: boolean
}): boolean {
  return (
    opts.outcome === 'completed' &&
    opts.failures.length === 0 &&
    !!opts.buildid &&
    opts.buildid !== '0' &&
    opts.allFilesVerified === true &&
    opts.allModesApplied === true
  )
}

/**
 * 23.2-02 (D-08): the single completeness gate deciding whether
 * downloadSteamDepots's catch-path finalize() may run at all. Fails CLOSED —
 * writing a manifest is the destructive action here (an atomic rename that
 * unconditionally replaces whatever `.acf` was already at that path), so an
 * omitted/undefined input resolves to false, never true. This is the ONLY
 * place this decision is made.
 *
 * Distinguishes "nothing was attempted this run" (Case A,
 * 23.2-MANIFEST-WRITE-TAXONOMY.md: buildDepotPlan itself threw before its
 * depot-accumulation loop ran — attempted stays [] and buildid stays
 * undefined) from "downloaded but unverified" (Case B: the plan was built
 * and downloadDepotFiles at least started, so attempted is populated even on
 * a subsequent failure/cancel). The Phase 21 `1026` verify-handoff
 * (commit eacbc7ccf) depends on Case B returning true here — that path's
 * `downloadAttempted` is set true before downloadDepotFiles is awaited, so a
 * post-plan-build failure/cancel still finalizes its honest 1026 record.
 */
export function shouldFinalizeAfterThrow(opts: {
  downloadAttempted?: boolean
}): boolean {
  return opts.downloadAttempted === true
}

/**
 * Bounded chunk-level worker pool for ONE file. Never an unbounded fan-out
 * over every chunk in one go — peak in-flight fetchChunk calls is capped at
 * CHUNK_CONCURRENCY regardless of how many chunks the file has (T-21-02).
 * Chunks can land in any order — each is an independent positional
 * write, so cross-server retry (Plan 01 fetchChunk) stays safe as-is.
 */
/**
 * Exported (cycle 7) so its re-queue/stall give-up behavior is directly
 * unit-testable without going through the full downloadDepotFiles/
 * downloadSteamDepots stack — mirrors this module's existing precedent of
 * exporting internal helpers (resolveContainedPath, sha1File,
 * canWriteFullOwnership) purely for test surface, not for external callers.
 */
export async function downloadFileChunks(
  fd: FileHandle,
  depotId: string,
  key: Buffer,
  hosts: string[],
  lzma: LzmaModule,
  file: DepotPlanFile,
  fileSeed: number,
  signal: AbortSignal | undefined,
  onBytes: (diskBytes: number, netBytes: number) => void,
  decode?: DecodeFn,
  /** Debug/steam-install-slow-start (cycle 2): forwarded to every fetchChunk
   *  call so the caller can aggregate per-host attempt/timeout/error stats
   *  across the whole file — optional, additive, no behavior change. */
  onAttempt?: OnChunkAttempt,
  /** Debug/steam-install-slow-start (cycle 3): shared, per-DOWNLOAD-RUN
   *  health-aware host selector — see depot/hostHealth.ts. Optional,
   *  additive: omitting it (no existing caller/test does) leaves fetchChunk's
   *  plain round-robin selection unchanged. */
  hostHealth?: HostHealthTracker,
  /** Debug/steam-install-slow-start (cycle 6): shared, per-DOWNLOAD-RUN CDN
   *  auth token cache — see depot/cdnAuth.ts. Optional, additive: omitting it
   *  leaves fetchChunk's URL unchanged (no token appended). */
  cdnAuth?: CdnAuthTokenCache,
  /** Debug/steam-install-slow-start (cycle 7): per-host https_support/
   *  usetokenauth directory metadata — see depot/decompress.ts's
   *  ContentServerHostMeta. Optional, additive. */
  hostMeta?: ReadonlyMap<string, ContentServerHostMeta>,
  /** Debug/steam-install-slow-start (cycle 7): shared, per-DOWNLOAD-RUN
   *  forward-progress clock — see depot/stallTracker.ts. When supplied, a
   *  chunk that exhausts fetchChunk's CHUNK_FETCH_ATTEMPTS budget is
   *  RE-QUEUED (retried again later by whichever worker picks it up next)
   *  instead of aborting this whole file, UNLESS the run has genuinely
   *  stalled (no forward progress anywhere for STALL_TIMEOUT_MS) — in which
   *  case it is a real, honest failure. Omitting it (every pre-cycle-7
   *  caller/test) preserves the EXACT pre-cycle-7 behavior: a chunk
   *  exhausting its attempts immediately fails this file. */
  stallTracker?: StallTracker,
  /** Phase 25 (multi-host fan-out, MHOST-02/03): this file's own slot within
   *  downloadDepotFiles' FILE_CONCURRENCY pool — combined below with this
   *  function's own CHUNK_CONCURRENCY-pool index so every concurrently-
   *  running chunk worker across the WHOLE run gets a distinct small
   *  integer forwarded into fetchChunk's workerSlot (see RESEARCH.md
   *  Assumptions Log A2). A defaulted param (not a bare `?:`) so it stays a
   *  plain `number` under strict mode. Optional, additive: omitting it —
   *  every pre-Phase-25 caller/test — combines as 0, reproducing the exact
   *  chunk-pool-only slot. */
  fileWorkerSlot: number = 0,
  /** Quick 260817-ihr (IHR-02): shared, per-DOWNLOAD-RUN in-flight-request
   *  budget — see depot/inflightLimiter.ts. Optional, additive: omitting it
   *  (every pre-260817-ihr caller/test) leaves every fetchChunk call
   *  completely unwrapped, byte-for-byte the pre-260817-ihr behavior. When
   *  supplied, wraps ONLY the fetchChunk network call below — never the
   *  decode, the `fd.write`, or the stall-tracker call — the budget is a
   *  NETWORK budget, not a general chunk-processing throttle. */
  limiter?: InflightLimiter
): Promise<void> {
  const queue = [...file.chunks]
  const workerCount = Math.min(CHUNK_CONCURRENCY, queue.length)

  // 2026-10-05 (sibling chunk workers outlived a failed file): this file's
  // OWN cancel scope. It follows the run's `signal`, and is also aborted the
  // moment any one of this file's chunk workers throws, so the siblings stop
  // — their in-flight fetchChunk is interrupted, and none of them writes or
  // picks up another chunk. Before this, `Promise.all` rejected on the first
  // throw, downloadSingleFile's `finally` closed `fd`, and the siblings kept
  // fetching, failing `fd.write` on the closed handle, and re-queuing — for
  // as long as other files kept the stall clock fresh, and past the end of
  // the run (in-flight work outliving its owner: half 2 of the sidecar exit
  // contract). `Promise.allSettled` below then waits for every sibling to
  // settle before this function returns, so the caller never closes `fd`
  // under a live worker.
  const fileAbort = new AbortController()
  const onRunAbort = () => fileAbort.abort()
  if (signal?.aborted) fileAbort.abort()
  else signal?.addEventListener('abort', onRunAbort, { once: true })
  const fileSignal = fileAbort.signal

  const workers = Array.from(
    { length: workerCount },
    async (_, chunkWorkerSlot) => {
      while (queue.length) {
        if (fileSignal.aborted) return
        const chunk = queue.shift()!
        const depotChunk: DepotChunk = {
          sha: chunk.sha,
          cb_original: chunk.cb_original,
          attemptSeed: hosts.length ? fileSeed % hosts.length : 0
        }

        // Phase 21 gap closure (21-15, D-UAT-03): `decode` is the injected
        // worker-pool decoder (DecompressPool.decode) — moves decrypt ->
        // decompress -> sha1-verify off the main thread. Undefined falls
        // back to fetchChunk's own default (inline decodeChunk), unchanged.
        // netBytes = compressed bytes actually fetched over the wire (for the
        // download rate); data.length = decompressed bytes written to disk.
        let netBytes = 0
        let data: Buffer
        try {
          // Quick 260817-ihr (IHR-02), corrected by
          // debug/humankind-depot-full-stall (2026-08-17): `limiter` is now
          // forwarded INTO fetchChunk itself (its own last param), which
          // brackets ONLY its network fetch — acquiring right before it and
          // releasing right after the response body is read, NEVER across
          // `decode()`. The original design here (`limiter.run(doFetch)`,
          // wrapping the WHOLE fetchChunk call) held the network slot across
          // decode too, which is CPU-bound and independently bounded by
          // DecompressPool's own (much smaller) worker count — silently
          // capping real network concurrency at that smaller budget
          // regardless of `limiter`'s own max. See fetchChunk's `limiter`
          // param and inflightLimiter.ts's `run()` doc comment for the full
          // writeup. Omitting `limiter` (every pre-260817-ihr caller/test)
          // makes fetchChunk's internal acquire()/release() calls no-ops,
          // byte-for-byte unchanged.
          data = await fetchChunk(
            hosts,
            depotId,
            depotChunk,
            key,
            lzma,
            CHUNK_FETCH_ATTEMPTS,
            decode,
            (n) => {
              netBytes = n
            },
            onAttempt,
            hostHealth,
            cdnAuth,
            hostMeta,
            // debug/steam-cancel-abort-thread-a: threads the cancel signal
            // INTO fetchChunk's own retry/backoff loop (previously this
            // worker loop only checked signal?.aborted before/after calling
            // fetchChunk, never while it was mid-retry — the ~62s hardware
            // hang) so a cancel interrupts an in-flight attempt immediately
            // instead of waiting for it to naturally exhaust or succeed.
            // 2026-10-05: this FILE's scope (follows `signal`, and also
            // fires when a sibling chunk worker fails) — see `fileAbort`.
            fileSignal,
            // Phase 25 (multi-host fan-out): combines this file's own
            // FILE_CONCURRENCY-pool slot with this chunk worker's own
            // CHUNK_CONCURRENCY-pool index so every concurrently-running
            // worker across the whole run maps to a distinct small integer
            // — see RESEARCH.md Assumptions Log A2. Both operands are plain
            // `number` (default-param / Array.from index), so the raw
            // arithmetic needs no `?? 0` coalesce under strict mode.
            //
            // 2026-10-05 (host fan-out for single-chunk files): the FILE
            // slot is the low-order term. It used to be
            // `fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot`, which
            // made every single-chunk file's slot (chunkWorkerSlot is always
            // 0 there) a multiple of 4 — pickHost's `healthy[slot % N]` then
            // reached only host 0 at N=2 or N=4 and {0, 2, 4} at N=6. With
            // the file slot in the low-order position the 32 file workers
            // cover every residue mod any N <= TOP_N_FANOUT, and every
            // (file, chunk) pair still maps to a distinct integer because
            // fileWorkerSlot < FILE_CONCURRENCY.
            chunkWorkerSlot * FILE_CONCURRENCY + fileWorkerSlot,
            limiter
          )
        } catch (err) {
          if (fileSignal.aborted) return
          // Debug/steam-install-slow-start (cycle 17, retry-storm
          // resilience): a decode-stage failure — fetchChunk exhausted its
          // whole CHUNK_FETCH_ATTEMPTS/host-rotation budget with a
          // ChunkDecodeError as the last cause (unknown_container/
          // sha1_mismatch/size_mismatch/bad_footer_magic/decode_failed) — is
          // DETERMINISTIC given (ciphertext, key): see
          // depot/decompress.ts's isDecodeStageError doc comment for the
          // hardware evidence (the identical encrypted chunk failed
          // unknown_container on ALL 6 content servers, all 555 attempts,
          // byte-identical ciphertext across hosts). Re-queuing it below for
          // ANOTHER full pass — the mechanism this cycle otherwise leaves
          // completely unchanged for every transient network/HTTP failure —
          // can never succeed and is exactly what collapsed one hardware
          // run's throughput (11,063 total attempt rotations across the
          // run; 555 on this one chunk alone) before this fix. Rethrown
          // immediately as an honest per-chunk failure, same shape as the
          // existing stalled-run path below, WITHOUT waiting for
          // stallTracker to separately notice a global stall. The
          // sha1(decompressed) === expectedSha integrity gate itself
          // (T-21-03, enforced inside decodeChunk) is completely
          // unchanged — this only stops RE-ATTEMPTING a chunk that gate has
          // already, deterministically, rejected; it never weakens what
          // counts as a pass.
          if (isDecodeStageError(err)) {
            throw err
          }
          // Debug/steam-install-slow-start (cycle 7, PART 3): a chunk
          // exhausting its local CHUNK_FETCH_ATTEMPTS budget must NOT abort
          // this whole FILE — re-queue it for another pass rather than
          // letting the throw propagate out of this Promise.all and kill
          // every other in-flight chunk-worker for this file, UNLESS the
          // download run has genuinely stalled (no forward progress
          // anywhere for STALL_TIMEOUT_MS), in which case this is a real,
          // honest failure — never an unbounded retry loop. Omitting
          // stallTracker (every pre-cycle-7 caller/test) rethrows
          // immediately, preserving the exact pre-cycle-7 behavior.
          if (stallTracker && !stallTracker.hasStalled()) {
            queue.push(chunk)
            continue
          }
          if (stallTracker) {
            throw new Error(
              `${(err as Error).message} (download stalled: no forward progress for ` +
                `${stallTracker.msSinceProgress()}ms across the whole run)`
            )
          }
          throw err
        }
        if (fileSignal.aborted) return

        // 2026-10-05: the write sits OUTSIDE the fetch try/catch above, so a
        // write failure (closed handle, ENOSPC, EIO) is fatal for this file
        // instead of being re-queued as if it were a transient network
        // failure — re-downloading the chunk can never fix a disk error.
        await fd.write(data, 0, data.length, Number(chunk.offset))
        onBytes(data.length, netBytes)
        // Debug/steam-install-slow-start (cycle 7): resets the WHOLE-RUN
        // stall clock — this file's forward progress counts as forward
        // progress for every OTHER file/worker in this download run too
        // (host health, like forward progress, is a property of the run,
        // never of a single file).
        stallTracker?.recordProgress()
      }
    }
  ).map((worker) =>
    worker.catch((err: unknown) => {
      fileAbort.abort()
      throw err
    })
  )

  let results: PromiseSettledResult<void>[]
  try {
    results = await Promise.allSettled(workers)
  } finally {
    signal?.removeEventListener('abort', onRunAbort)
  }
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  )
  if (failed) throw failed.reason
}

/**
 * Download one file: containment-check its destination (BEFORE any fs call,
 * T-21-01), pre-size + positional-write every chunk (never a whole-file
 * Buffer.alloc, T-21-02), then verify the whole-file SHA1 by STREAMING the
 * written bytes back off disk (never re-reading the whole file into RAM,
 * T-21-03). A mismatch is thrown — the caller records it as a failure, never
 * silently accepted.
 */
export async function downloadSingleFile(
  installRoot: string,
  depotId: string,
  key: Buffer,
  hosts: string[],
  lzma: LzmaModule,
  file: DepotPlanFile,
  fileSeed: number,
  signal: AbortSignal | undefined,
  onBytes: (diskBytes: number, netBytes: number) => void,
  decode?: DecodeFn,
  /** Debug/steam-install-slow-start (cycle 2): forwarded to downloadFileChunks
   *  — optional, additive, no behavior change. */
  onAttempt?: OnChunkAttempt,
  /** Debug/steam-install-slow-start (cycle 3): forwarded to downloadFileChunks
   *  — see depot/hostHealth.ts. Optional, additive. */
  hostHealth?: HostHealthTracker,
  /** Debug/steam-install-slow-start (cycle 6): forwarded to downloadFileChunks
   *  — see depot/cdnAuth.ts. Optional, additive. */
  cdnAuth?: CdnAuthTokenCache,
  /** Debug/steam-install-slow-start (cycle 7): forwarded to downloadFileChunks
   *  — see depot/decompress.ts's ContentServerHostMeta. Optional, additive. */
  hostMeta?: ReadonlyMap<string, ContentServerHostMeta>,
  /** Debug/steam-install-slow-start (cycle 7): forwarded to downloadFileChunks
   *  — see depot/stallTracker.ts. Optional, additive. */
  stallTracker?: StallTracker,
  /** Phase 25 (multi-host fan-out, MHOST-02/03): forwarded to
   *  downloadFileChunks — see its own doc comment. A defaulted param (not a
   *  bare `?:`) so it stays a plain `number` under strict mode. Optional,
   *  additive: omitting it — every pre-Phase-25 caller/test — combines as 0.
   */
  fileWorkerSlot: number = 0,
  /** 23-06 (G-23-02 trace instrumentation): this RUN's own mode-application
   *  counters, forwarded to applyEDepotFileModes. Optional, additive:
   *  omitting it (every pre-23-06 caller/test) leaves mode-application
   *  behavior byte-for-byte unchanged — counting is side-channel only. */
  counters?: DepotModeCounters,
  /** Quick 260817-ihr (IHR-02): forwarded to downloadFileChunks — see
   *  depot/inflightLimiter.ts. Optional, additive. */
  limiter?: InflightLimiter
): Promise<void> {
  const dest = resolveContainedPath(installRoot, file.filename)
  await mkdir(dirname(dest), { recursive: true })

  // Directory manifest entry (flags & Directory) — a REAL directory, never an
  // empty regular file. Must be checked BEFORE the size===0 fast path below,
  // since directory entries are also size 0 with no chunks (CR-01).
  if (file.flags && file.flags & DIRECTORY_FLAG) {
    await mkdir(dest, { recursive: true })
    return
  }

  // Symlink manifest entry (flags & Symlink) — a REAL, containment-checked
  // symlink pointing at the manifest's own linktarget, never an empty regular
  // file with the LinkTarget discarded (CR-01).
  if (file.flags && file.flags & SYMLINK_FLAG) {
    if (!file.linktarget) {
      throw new Error(
        `downloadDepotFiles: symlink manifest entry for ${file.filename} has no linktarget`
      )
    }
    // WR-02 (23-code-review): normalize backslash-separated relative segments
    // the same way resolveContainedPath does for filenames — resolve() does
    // not treat '\' as a separator, so an unnormalized Windows-style
    // linktarget would resolve as one literal path component rather than
    // nested directories (a broken symlink, not a traversal escape: '\' is
    // not a real separator on POSIX so no actual escape is possible either
    // way — this keeps the containment check consistent with the one
    // function up).
    // 37-09: `file.linktarget` is now the DECRYPTED target (decrypted
    // upstream in fetchDepotPlanEntry). Before that fix this guard validated
    // raw base64 AES ciphertext instead — vacuously, since base64's alphabet
    // includes `/`, so a ciphertext blob reads as a nested relative path and
    // passes containment BY LUCK, not by actually checking anything. Pinned
    // by depotLinktarget.test.ts's T-37-09-04 (decrypted escape is rejected).
    const resolvedTarget = resolve(
      dirname(dest),
      file.linktarget.replace(/\\/g, '/')
    )
    const relToRoot = relative(installRoot, resolvedTarget)
    if (relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
      throw new PathTraversalError(
        `downloadDepotFiles: rejected symlink "${file.filename}" whose target ` +
          `"${file.linktarget}" escapes ${installRoot}`
      )
    }
    // Idempotent like the mkdir(recursive) / open('w') branches above:
    // symlink() throws EEXIST if dest already exists, so a retry of a
    // partially-succeeded install (D-07) would fail that file forever. Clear
    // any stale entry first (force ignores a missing path).
    await rm(dest, { force: true })
    await symlink(file.linktarget, dest)
    return
  }

  // debug/steam-depot-unclassified-generic-error: everything below writes via
  // `open(dest, 'w')`, which throws EISDIR against a directory. The symlink
  // branch above already clears a stale entry for exactly this reason ("a
  // retry of a partially-succeeded install would fail that file forever") —
  // that argument applies verbatim here and was never applied.
  //
  // It is not hypothetical: the 2026-08-27 Fallout 2 install left a directory
  // at `master.dat` (a cross-depot collision, now prevented at plan build by
  // depot/pathCollisions.ts). Prevention alone does not repair the installs
  // already damaged — the reconciler correctly re-queues the file, the write
  // hits EISDIR, and it fails FOREVER. This is what makes the fix repair
  // rather than merely prevent.
  await clearStaleDirectoryAtFilePath(dest, file.filename)

  if (!file.chunks.length || Number(file.size) === 0) {
    if (Number(file.size) !== 0) {
      // WR-02: a size>0 file with zero chunks is a corrupt/mis-parsed
      // manifest — treat as a recorded failure, never a silent empty success.
      throw new Error(
        `downloadDepotFiles: manifest reported ${file.filename} size=${file.size} but zero chunks`
      )
    }
    const empty = await open(dest, 'w')
    await empty.close()

    // Phase 23 (23-08 Task 2b): a zero-byte manifest entry can still carry
    // an Executable/CustomExecutable/ReadOnly/Hidden flag — this early
    // return used to skip mode application entirely, unlike the non-empty
    // path below (the `if (file.flags)` block after the sha1 check), so a
    // zero-byte executable-flagged entry landed without +x. The
    // Directory(64)/Symlink(512) branches above already returned before
    // this point (WR-01), so any flags reaching here are safe to hand to
    // applyEDepotFileModes. A mode-application failure is recorded the same
    // way the non-empty path already does (T-23-03) — never a silent
    // success.
    if (file.flags) {
      const modeResult = await applyEDepotFileModes(dest, file.flags, counters)
      if (!modeResult.ok) {
        throw new Error(
          `downloadDepotFiles: failed to apply file mode flags for ${file.filename}: ${modeResult.error}`
        )
      }
    }
    return
  }

  const fd = await open(dest, 'w')
  try {
    await fd.truncate(Number(file.size))
    await downloadFileChunks(
      fd,
      depotId,
      key,
      hosts,
      lzma,
      file,
      fileSeed,
      signal,
      onBytes,
      decode,
      onAttempt,
      hostHealth,
      cdnAuth,
      hostMeta,
      stallTracker,
      fileWorkerSlot,
      limiter
    )
  } finally {
    await fd.close()
  }

  if (signal?.aborted) return

  const expected = Buffer.isBuffer(file.sha_content)
    ? file.sha_content.toString('hex')
    : String(file.sha_content)
  // Quick 260926-ju4: the THIRD forward-progress signal, and the one that
  // covers the gap BETWEEN the other two. Until this line the run's clock was
  // reset at exactly two points — downloadFileChunks' `await fd.write(...)`
  // (:1423) and the worker loop's successful downloadSingleFile return
  // (:2718) — with this whole-file re-read sitting silently in between. 32
  // concurrent SHA1 re-reads of multi-GB paks on a slow external disk can
  // outlast STALL_TIMEOUT_MS (180s), and since the run-scoped bound landed
  // (62f916e58) a stale clock is terminal rather than advisory. Reporting
  // per read event makes the verify tail the forward progress it actually is.
  //
  // This cannot weaken the bound against the 2026-08-27 Californium case it
  // was built for: reaching this line requires every one of the file's chunks
  // to have already landed on disk, and on that run ZERO files completed
  // their chunk phase — downloadSingleFile never got here at all. Progress is
  // reported only from bytes genuinely read back off the disk, never from
  // merely entering the tail.
  const got = await sha1File(dest, () => stallTracker?.recordProgress())
  if (got !== expected) {
    throw new Error(
      `downloadDepotFiles: whole-file SHA1 mismatch for ${file.filename}: ${got} != ${expected}`
    )
  }

  // SPIKE 003 finding / Phase 23 (23-01, D-06): apply the manifest's full
  // EDepotFileFlag mode set. Under the 1026 handoff Steam's verify pass sets
  // these; the StateFlags=4 full-ownership path does not run verify, so
  // without this the game binary/config would land with the wrong mode (a
  // missing +x fails launch with `os error 256` on macOS). sha1 guarantees
  // CONTENT, not filesystem mode — so this is required for full ownership
  // regardless of the spike flag (harmless under 1026: Steam would set the
  // same bits anyway). A failure here is NOT swallowed: it throws so the
  // caller (downloadDepotFiles) records it as a DepotDownloadFailure, never
  // a silent success (T-23-03) — a mode failure must be visible to the
  // completeness gate the same way a SHA1 mismatch already is.
  if (file.flags) {
    const modeResult = await applyEDepotFileModes(dest, file.flags, counters)
    if (!modeResult.ok) {
      throw new Error(
        `downloadDepotFiles: failed to apply file mode flags for ${file.filename}: ${modeResult.error}`
      )
    }
  }

  // Phase 23 (23-08 Task 3, G-23-02 VERDICT: H2): SECONDARY Mach-O fallback,
  // never the primary fix — only ever supplements a manifest that supplied
  // no Executable/CustomExecutable flag for this file. See
  // applyMachOExecutableFallback's own doc comment for the full rationale.
  await applyMachOExecutableFallback(dest, file.filename, file.flags)
}

/**
 * Applies the full EDepotFileFlag mode set (chmod 0o755 for Executable/
 * CustomExecutable, applyDepotFileFlags for ReadOnly/Hidden) to an
 * already-landed file at `dest`. Shared by downloadSingleFile's
 * post-sha1-verify step AND the reconciled-file mode-heal loop in
 * downloadDepotFiles (Phase 23, 23-03, D-04) — a reconciled (skipped-
 * download) file must get the exact same mode treatment a freshly-downloaded
 * one gets, so an older partial install's missing modes are healed even
 * though the bytes themselves are untouched. Never throws for the exec
 * chmod step (matches the pre-23-03 code); a ReadOnly/Hidden failure is
 * surfaced via applyDepotFileFlags's own { ok, error } shape, letting each
 * caller decide its own DepotDownloadFailure wording.
 *
 * `counters` (23-06, G-23-02 trace instrumentation) is optional and purely
 * additive — a side-channel counter increment, never a behavior change.
 * `modeCallsites` increments on every call regardless of branch; `chmodAttempts`
 * increments only on the branch that actually calls `chmod(dest, 0o755)`.
 */
export async function applyEDepotFileModes(
  dest: string,
  flags: number,
  counters?: DepotModeCounters
): Promise<{ ok: boolean; error?: string }> {
  if (counters) counters.modeCallsites++

  if (flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG)) {
    if (counters) counters.chmodAttempts++
    await chmod(dest, 0o755)
  }

  if (flags & (READONLY_FLAG | HIDDEN_FLAG)) {
    return applyDepotFileFlags(dest, flags, process.platform)
  }

  return { ok: true }
}
