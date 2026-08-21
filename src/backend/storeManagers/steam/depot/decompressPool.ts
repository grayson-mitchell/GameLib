// Phase 21 gap closure (21-15, D-UAT-03): worker_threads pool for depot
// chunk decode. Bounded fan-out (min(cores,DECOMPRESS_POOL_MAX_WORKERS) --
// raised 8->16, debug/humankind-depot-full-stall 2026-08-17, see that
// constant's own doc comment for the full evidence trail), transferable
// ArrayBuffers, a per-task timeout with terminate+replace recovery, and a
// transparent
// inline main-thread fallback if the pool cannot initialize — LZMA/zlib
// decompression moves off the Electron main thread without changing
// fetchChunk's cross-server retry contract (decode is just an injected fn).
//
// SECURITY (T-21-15-02, mitigated): the depot decryption key is copied into
// its OWN ArrayBuffer per dispatched message (never the shared/reused key
// buffer, and never transferred/detached); it is never logged and never
// posted back from a worker. SECURITY (T-21-15-03, mitigated): the per-task
// timeout below is the bound-and-recover mitigation for a malformed VZ/PK
// buffer stalling the pure-JS decoder — the stalled worker is terminated and
// replaced and the task rejects (never hangs) so fetchChunk retries the next
// content server.

import { Worker } from 'node:worker_threads'
import * as os from 'node:os'
import * as path from 'node:path'
import { decodeChunk } from './decompress'
import { loadLzmaModule } from './lzmaLoader'
import { logWarning, LogPrefix } from 'backend/logger'
import type {
  DecompressWorkerRequest,
  DecompressWorkerResponse,
  DecompressWorkerReady
} from './decompressWorker'

function isReadyMessage(msg: unknown): msg is DecompressWorkerReady {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: string }).type === 'ready'
  )
}

/** Debug/humankind-depot-full-stall (2026-08-17): where the pool's worker
 *  script actually comes from -- see `resolveWorkerSpec()`'s own doc
 *  comment. `'path'` spawns `new Worker(value)` (the pre-existing
 *  dev/Electron and test-override behavior); `'source'` spawns
 *  `new Worker(value, { eval: true })` against an inline SEA-asset source
 *  string. */
type WorkerSpec =
  | { kind: 'path'; value: string }
  | { kind: 'source'; value: string }
const SEA_WORKER_ASSET_KEY = 'decompressWorker.js'

const DEFAULT_TASK_TIMEOUT_MS = 30_000

/**
 * Debug/humankind-depot-full-stall (2026-08-17): the CONFIRMED throughput
 * ceiling for native Steam depot installs, isolated by static/quantitative
 * tracing after TWO live-hardware-refuted network-layer hypotheses (widening
 * `TOP_N_FANOUT` 3->8, and decoupling `InflightLimiter`'s held slot from
 * `decode()` -- both real, correct, RETAINED fixes, neither moved
 * throughput). Three independent live HUMANKIND runs with drastically
 * different network-layer configurations (3-host baseline, 6-host fan-out,
 * fan-out+decode-decoupled) all converged on the SAME ~15.6-16.7
 * attempts/sec ceiling, with zero timeouts/errors throughout every run --
 * ruling out network/host causes entirely. Little's Law on all three runs'
 * own numbers (attempts/elapsed-sec) backs out an average per-chunk decode
 * time of ~490-513ms against the *previous* hardcoded 8-worker cap --
 * matching this file's own DEFAULT_TASK_TIMEOUT_MS neighbor,
 * decompressWorker.ts's own header comment ("the pure-JS LZMA decompressor
 * (~5 MB/s single-threaded)"), and this codebase's ~1MB max compressed
 * chunk size (depot.ts) almost exactly: an aggregate decode ceiling of
 * `poolSize * perWorkerMBps` chunks/sec, entirely independent of network
 * concurrency, host count, or the InflightLimiter's budget -- decode was
 * ALREADY the binding constraint before and after both refuted fixes, which
 * is exactly why neither moved the needle.
 *
 * This constant removes the ARTIFICIAL portion of that ceiling: the pool
 * hard-capped concurrent decode workers at 8 regardless of actual core
 * count, silently discarding real headroom on any machine with more than 8
 * cores (confirmed via `sysctl -n hw.ncpu` on this project's own dev
 * hardware: 10 physical cores, 2 of which sat idle under the old cap).
 * Raised to 16 -- a real, evidence-backed, safe increase for today's
 * consumer multi-core hardware (many current Apple Silicon/desktop CPUs
 * exceed 8 cores) -- while still bounding worst-case worker_threads
 * fan-out on an unusually high-core-count machine (this remains a `min()`
 * with `os.cpus().length`, so a <=8-core machine's behavior is COMPLETELY
 * unchanged).
 *
 * IMPORTANT, honestly scoped: this does NOT fully close the gap to Steam's
 * own native client. Per-worker decode throughput is fundamentally bounded
 * by the PURE-JAVASCRIPT `lzma` npm package's own decompression speed
 * (decompressWorker.ts's own comment: "~5 MB/s single-threaded") -- adding
 * workers only helps up to the machine's real core count; it cannot make
 * each worker's own decode faster. On this project's 10-core dev machine,
 * this fix raises the effective pool size 8->10 (a ~25% throughput
 * increase), not the order-of-magnitude gap a native/WASM LZMA decoder
 * would close. That replacement is a substantially larger, separately-
 * scoped follow-up (new dependency evaluation, cross-platform build/test
 * risk) -- deliberately NOT attempted in this fix's blast radius.
 */
export const DECOMPRESS_POOL_MAX_WORKERS = 16

/** Debug/humankind-depot-full-stall (2026-08-17), P/E-core saturation
 *  hypothesis (Current Focus blind_spots item 1, reopened once
 *  `resolveWorkerSpec()`'s SEA-asset fix -- quick 260817-pkx -- made the
 *  pool genuinely spawn on real hardware): lets a live-hardware run cap (or
 *  raise) the decode pool size WITHOUT a rebuild-per-candidate-value cycle.
 *  Node `worker_threads` has NO P/E-core affinity API on macOS, so the only
 *  way to test "does keeping decode off the E-cores help or hurt real
 *  throughput" is empirically, via worker COUNT (e.g. capping to this
 *  machine's confirmed 4 P-cores), never placement.
 *
 *  Mirrors this codebase's existing `GAMELIB_*`-prefixed env-var tuning
 *  precedent (`GAMELIB_DEV_SECRET_VAULT`, `GAMELIB_SIDECAR_SELFTEST`) --
 *  confirmed via direct read of `src-tauri/src/main.rs`'s
 *  `spawn_sidecar()`/`spawn_sidecar_packaged()`: neither calls
 *  `.env_clear()`, so `std::process::Command`'s default env-INHERIT
 *  behavior means a value set in the shell that launches GameLib (dev OR
 *  packaged) reaches this sidecar process unchanged -- no Rust-side change
 *  needed to make this testable.
 *
 *  Deliberately fails closed: unset, non-numeric, non-integer, zero, or
 *  negative values are IGNORED (falls through to the byte-for-byte
 *  UNCHANGED `min(cpus, DECOMPRESS_POOL_MAX_WORKERS)` default) -- this must
 *  never be able to silently zero out or invert the pool's size for a
 *  normal user who has never heard of this variable. `opts.size` (the
 *  existing test-only constructor param) still wins over this when both are
 *  present -- this is a NEW, LOWER-priority fallback, not a replacement for
 *  the existing override mechanism.
 *
 *  RESULT (2026-08-17, live HUMANKIND run with `GAMELIB_DECOMPRESS_POOL_SIZE
 *  =4`, capping to this hardware's confirmed 4 P-cores): mechanism (a)
 *  CONFIRMED, mechanism (b) REFUTED -- capping decode workers made aggregate
 *  throughput WORSE, not better, in rough proportion to the worker-count cut
 *  (10->4 workers predicted ~2.5x slower per the falsification test; observed
 *  ~2.4x slower per-GB against the 10-worker Planetfall/718850 baseline, with
 *  the decode queue never draining and per-chunk decode latency still
 *  climbing at the last sample -- a lower bound on the true gap). Saturating
 *  every core does NOT starve the main thread's own event-loop work badly
 *  enough to offset the lost decode parallelism; fewer pure-JS decode workers
 *  is simply fewer decode workers. DO NOT set this to a value below the
 *  `min(cpus, DECOMPRESS_POOL_MAX_WORKERS)` default in production -- this
 *  remains a diagnostic-only knob for exactly this kind of live-hardware A/B
 *  test, not a tuning lever for end users. See
 *  .planning/debug/humankind-depot-full-stall.md for the full evidence
 *  trail. */
function resolvePoolSizeOverride(): number | undefined {
  const raw = process.env.GAMELIB_DECOMPRESS_POOL_SIZE
  if (!raw) return undefined
  // `Number(...)`, not `Number.parseInt(...)`, deliberately: parseInt would
  // silently TRUNCATE a fractional or trailing-garbage value ("3.5" -> 3,
  // "4abc" -> 4) instead of rejecting it -- Number() rejects both as NaN,
  // matching this function's own "ignore, don't guess" contract.
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

interface PendingTask {
  resolve: (data: Buffer) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
  worker: Worker
}

interface QueuedTask {
  id: number
  encrypted: Buffer
  key: Buffer
  expectedSha: string
  cbOriginal: number | string
  resolve: (data: Buffer) => void
  reject: (err: Error) => void
}

export interface DecompressPoolOpts {
  /** Debug/humankind-depot-full-stall (2026-08-17, follow-up to the
   *  refuted InflightLimiter/decode-decouple fix): defaults to
   *  `GAMELIB_DECOMPRESS_POOL_SIZE` env override if set and valid, else
   *  min(os.cpus().length, DECOMPRESS_POOL_MAX_WORKERS) -- raised from a
   *  hardcoded `8` (see DECOMPRESS_POOL_MAX_WORKERS's own doc comment for
   *  the full evidence trail). This explicit `size` always wins over both
   *  (see `resolvePoolSizeOverride()`'s own doc comment for the env-var
   *  fallback's rationale -- the P/E-core saturation hypothesis). */
  size?: number
  /** Per-task timeout before a stalled worker is terminated + replaced. */
  taskTimeoutMs?: number
  /** Overrides the resolved worker script path — test-only hook. */
  workerPath?: string
}

function toOwnArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength
  ) as ArrayBuffer
}

/** Debug/steam-install-slow-start (cycle 13): builds an `Error` carrying a
 *  `.code` field, reusing the exact same duck-typed `.code` property
 *  `attemptFailureReason` (decompress.ts) already checks for network
 *  errors -- so a pool-level failure (worker exit/timeout) is just as
 *  distinguishable in a hardware run's `err=N{code:count}` breakdown as a
 *  decode-stage failure (`ChunkDecodeError`) or a network-stage one, instead
 *  of every one of these previously-generic `Error`s collapsing into the
 *  single, uninformative literal `"Error"`. Purely observational -- never
 *  read by any retry/replacement/queue-draining logic in this file, all of
 *  which already keys off the message text or the task/worker identity, not
 *  this new field. */
function taggedPoolError(
  message: string,
  code: string
): Error & { code: string } {
  const err = new Error(message) as Error & { code: string }
  err.code = code
  return err
}

/**
 * Bounded worker_threads pool dispatching depot chunk decode (decrypt ->
 * decompress -> sha1/size-verify) off the main thread. `decode` is the
 * public entry point — an injectable replacement for fetchChunk's default
 * inline decoder (see decompress.ts's `DecodeFn`).
 */
export class DecompressPool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  /** Every worker EVER spawned by this pool instance, including ones already
   *  removed from `workers` after a failure — shutdown() terminates+awaits
   *  every entry here (not just the currently-active `workers`), so a
   *  worker terminated on the failure path is always fully awaited exactly
   *  once, regardless of race ordering with its own 'exit'/'error' events. */
  private allWorkers = new Set<Worker>()
  /** In-flight replaceWorker() calls (fired-and-forgotten from
   *  handleWorkerFailure) — shutdown() awaits these before terminating,
   *  otherwise a replacement that finishes spawning just AFTER shutdown()
   *  has already snapshotted `allWorkers` would never be terminated (a real
   *  leak, not just a test artifact: any timeout/error recovery in-flight
   *  at the moment an install ends would otherwise orphan a worker). */
  private inFlightReplacements = new Set<Promise<void>>()
  private pending = new Map<number, PendingTask>()
  private queue: QueuedTask[] = []
  private nextId = 0
  private inlineFallback = false
  private shuttingDown = false
  /** Phase 23.1 plan 04: workers whose spawn-time `loadLzmaModule()` call
   *  resolved a NATIVE decoder (reported via the ready handshake's optional
   *  `lzmaKind` field — decompressWorker.ts). Tracked as a Set, not a bare
   *  increment/decrement counter, so `removeWorker()` can only decrement
   *  for a worker that was ACTUALLY counted as native — a worker whose
   *  ready message carried no `lzmaKind` (an old bundle, or a genuinely
   *  pure-JS worker) must never cause an incorrect decrement.
   *  `stats().nativeWorkers` reports this set's size — purely
   *  observational, same "never read by any dispatch/queue/replace logic"
   *  discipline every other `stats()` field's own doc comment already
   *  carries. */
  private nativeWorkerSet = new Set<Worker>()
  private readonly size: number
  private readonly taskTimeoutMs: number
  private readonly workerPathOverride?: string
  /** Debug/humankind-depot-full-stall (2026-08-17): resolveWorkerSpec()'s
   *  own result, cached on first call -- a SEA asset source string can be a
   *  multi-MB bundle, and replaceWorker() may run many times across a long
   *  install; re-reading `sea.getAsset()` on every recovery would be
   *  wasteful and pointless (the asset never changes within a process). */
  private workerSpecCache: WorkerSpec | undefined

  constructor(opts: DecompressPoolOpts = {}) {
    this.size =
      opts.size ??
      resolvePoolSizeOverride() ??
      Math.min(os.cpus().length, DECOMPRESS_POOL_MAX_WORKERS)
    this.taskTimeoutMs = opts.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS
    this.workerPathOverride = opts.workerPath
  }

  /**
   * Phase 23.1 plan 04: this deliberately does NOT resolve `lzma-native`'s
   * native addon -- a `.node` binding must be `dlopen()`ed INSIDE the
   * isolate that calls it, and cannot be transferred across a
   * `worker_threads` boundary once loaded, so main-thread resolution here
   * would help no worker at all. The addon is resolved per-isolate instead,
   * inside each worker, through plan 23.1-03's `--alias:node-gyp-build`
   * shim (`lzmaNativeBinding.ts`) -- reached transitively via
   * `lzmaLoader.ts`'s `loadLzmaModule()`, called from `decompressWorker.ts`
   * (pooled workers) and this class's own `inlineDecode()` (main-thread
   * fallback) alike. Recorded here explicitly because without this note
   * the apparent omission -- a worker-spec resolver that resolves every
   * OTHER part of the worker's environment but not this one -- reads like a
   * bug the next maintainer would "fix" back into a no-op main-thread
   * dlopen().
   *
   * Debug/humankind-depot-full-stall (2026-08-17): resolves WHERE the
   * pool's worker script comes from. Cached on first call
   * (`workerSpecCache`).
   *
   * 1. `workerPathOverride` (test-only hook) always wins -- every existing
   *    pool test passes `workerPath`, so their behavior stays untouched.
   * 2. Inside a compiled SEA binary (`node:sea.isSea()`), read the worker
   *    bundle back from the SEA asset `meta/buildSidecarSea.ts`'s
   *    `bundleWorkerForSea()` step embeds under `SEA_WORKER_ASSET_KEY`
   *    (`'decompressWorker.js'`) and spawn it with `{ eval: true }`. This
   *    mechanism was chosen over shipping a companion file next to the
   *    binary specifically because a companion file needs: a Tauri
   *    `externalBin`/bundle-resources entry, a per-triple copy step in the
   *    release matrix, and correct `__dirname`/`process.execPath`
   *    resolution on every target OS -- three places for this to silently
   *    diverge per platform. A SEA asset has none of that: it travels
   *    inside the same blob the executable already is, so there is nothing
   *    to carry, copy, or resolve. Access to `node:sea` mirrors
   *    `isPackagedSidecar()` (`src/backend/sidecar/humbleFlowRegistration.ts`)
   *    exactly -- same guarded try/catch shape, same fail-safe default. See
   *    `.planning/debug/humankind-depot-full-stall.md` for the evidence
   *    trail this replaces (the pool NEVER engaged in a packaged SEA
   *    sidecar before this fix -- every chunk decoded inline,
   *    single-threaded, on the sidecar's own main thread).
   * 3. Otherwise (dev/Electron build, or `node:sea` unavailable/`isSea()`
   *    false/`getAsset()` throws), the unchanged `__dirname`-relative
   *    companion-file path -- byte-for-byte the pre-existing dev/Electron
   *    behavior.
   */
  private resolveWorkerSpec(): WorkerSpec {
    if (this.workerSpecCache) return this.workerSpecCache

    if (this.workerPathOverride) {
      this.workerSpecCache = { kind: 'path', value: this.workerPathOverride }
      return this.workerSpecCache
    }

    try {
      // node:sea is a Node builtin; a guarded runtime require (not a
      // relative/alias path) is the deliberate mechanism here, mirroring
      // humbleFlowRegistration.ts's isPackagedSidecar(), not an oversight.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeSea = require('node:sea') as {
        isSea: () => boolean
        getAsset: (key: string, encoding: string) => string
      }
      if (nodeSea.isSea()) {
        const source = nodeSea.getAsset(SEA_WORKER_ASSET_KEY, 'utf8')
        this.workerSpecCache = { kind: 'source', value: source }
        return this.workerSpecCache
      }
    } catch {
      // node:sea unavailable (older/dev Node), or getAsset() threw (asset
      // missing from this blob) -- fall through to the path spec below.
    }

    this.workerSpecCache = {
      kind: 'path',
      value: path.join(__dirname, 'decompressWorker.js')
    }
    return this.workerSpecCache
  }

  /**
   * Spawns `size` workers. On ANY spawn failure, sets `inlineFallback` and
   * terminates whatever partially spawned — `decode()` then transparently
   * runs inline on the main thread (LOCKED requirement: installs still
   * complete if the pool cannot initialize).
   *
   * Debug/humankind-depot-full-stall (2026-08-17, 5th live run): this catch
   * block previously had NO runtime logging at all -- the ONLY place this
   * fallback was ever mentioned was a one-time `console.warn` in
   * `meta/buildSidecarSea.ts`'s build-time output. That build-time warning
   * is invisible in any shipped gamelib.log -- this session's live
   * DecompressPool.stats() instrumentation (`pool[busy=0 idle=0 queued=0
   * inline=true]`, sustained for an entire 128s+ HUMANKIND run, 5th live
   * test) is what actually surfaced that EVERY decode in every one of this
   * debug session's live runs has been running inline, single-threaded, on
   * the sidecar's own main thread -- making the separate decode-pool-cap
   * fix (DECOMPRESS_POOL_MAX_WORKERS) provably inert on the real packaged
   * binary this whole session. Logging it HERE, at the moment the pool
   * actually falls back, means any future gamelib.log directly shows this
   * without needing another live-hardware forensic round-trip. Purely
   * observational: never read by any dispatch/queue/replace logic in this
   * file, and does not change the fallback's own behavior.
   *
   * Quick task 260817-pkx: with `resolveWorkerSpec()`'s SEA-asset path in
   * place, a fallback inside a PACKAGED SEA sidecar is now a genuine defect
   * (the asset either failed to embed at build time or failed to
   * eval-spawn at runtime) -- not the accepted tradeoff it was previously
   * logged as. The log line below says so and never prints the resolved
   * `source` string itself (it can be a multi-MB bundle) -- only
   * `spec.kind`, and the path when `spec.kind === 'path'`.
   */
  async init(): Promise<void> {
    const spec = this.resolveWorkerSpec()
    const spawned: Worker[] = []
    try {
      for (let i = 0; i < this.size; i++) {
        spawned.push(await this.spawnWorker(spec))
      }
      this.workers = spawned
      this.idle = [...spawned]
    } catch (err) {
      this.inlineFallback = true
      await Promise.all(
        spawned.map((w) => w.terminate().catch(() => undefined))
      )
      this.workers = []
      this.idle = []
      logWarning(
        [
          'DecompressPool: worker_threads pool failed to initialize',
          `(size=${this.size}, spec.kind=${spec.kind}` +
            (spec.kind === 'path' ? `, workerPath=${spec.value}` : '') +
            ') -- falling back to',
          'INLINE single-thread decode for this entire download run.',
          `Cause: ${(err as Error)?.message ?? String(err)}.`,
          'If this is a packaged SEA sidecar, this is a REAL DEFECT (no',
          'longer an accepted tradeoff) -- check the SEA asset',
          "'decompressWorker.js' and meta/buildSidecarSea.ts's",
          'bundleWorkerForSea() step.'
        ],
        LogPrefix.Steam
      )
    }
  }

  /**
   * Spawns a worker and resolves only once it sends the explicit `ready`
   * handshake (see DecompressWorkerReady's doc comment) — NOT on the
   * generic `worker_threads` 'online' event, which fires even for a bad
   * entry path BEFORE the resulting module-not-found error surfaces. Using
   * 'online' as the success signal would let init()/replaceWorker()
   * mistake a worker that is about to fail for a successfully spawned one,
   * defeating the fallback guarantee below.
   */
  private spawnWorker(spec: WorkerSpec): Promise<Worker> {
    return new Promise((resolvePromise, reject) => {
      let settled = false
      let worker: Worker
      try {
        worker = new Worker(
          spec.value,
          spec.kind === 'source' ? { eval: true } : undefined
        )
      } catch (err) {
        reject(err as Error)
        return
      }

      const onMessage = (msg: unknown) => {
        if (settled || !isReadyMessage(msg)) return
        settled = true
        worker.off('message', onMessage)
        worker.off('error', onError)
        // Phase 23.1 plan 04: `lzmaKind` is OPTIONAL on the ready message
        // (decompressWorker.ts's DecompressWorkerReady doc comment) -- a
        // worker whose bundle predates this change, or whose own
        // loadLzmaModule() resolved 'pure-js'/'unresolved', simply never
        // joins this set. A slow (pure-JS) worker is still a successfully
        // spawned worker -- this bookkeeping is purely observational and
        // never gates spawn success.
        if (msg.lzmaKind === 'native') {
          this.nativeWorkerSet.add(worker)
        }
        this.wireWorker(worker)
        resolvePromise(worker)
      }
      const onError = (err: Error) => {
        if (settled) return
        settled = true
        worker.off('message', onMessage)
        reject(err)
      }
      worker.on('message', onMessage)
      worker.once('error', onError)
    })
  }

  private wireWorker(worker: Worker): void {
    this.allWorkers.add(worker)

    worker.on('message', (response: DecompressWorkerResponse) => {
      if (isReadyMessage(response)) return
      const task = this.pending.get(response.id)
      if (!task) return
      this.pending.delete(response.id)
      clearTimeout(task.timer)
      if (response.ok) {
        task.resolve(Buffer.from(response.data))
      } else {
        // Debug/steam-install-slow-start (cycle 13): reconstruct the error
        // WITH its `.code` (when the worker sent one — see
        // decompressWorker.ts's `handleDecodeMessage`) instead of the
        // pre-cycle-13 bare `new Error(response.error)`, which silently
        // discarded any distinguishing code the original decode-stage
        // failure carried, collapsing it to the generic `"Error"` name by
        // the time it reached `attemptFailureReason`.
        task.reject(
          response.code
            ? taggedPoolError(response.error, response.code)
            : new Error(response.error)
        )
      }
      this.releaseWorker(worker)
    })

    worker.on('error', (err) => this.handleWorkerFailure(worker, err))
    worker.on('exit', (code) => {
      if (code !== 0) {
        this.handleWorkerFailure(
          worker,
          taggedPoolError(
            `decompressWorker exited with code ${code}`,
            'decompress_worker_exit'
          )
        )
      }
    })
  }

  /** Rejects any in-flight task still on THIS worker — the pool keeps
   *  serving every other task. Idempotent: a worker already removed is a
   *  no-op, so a stalled-task timeout and that same worker's own later
   *  'exit'/'error' event (terminate() triggers 'exit') never double-remove
   *  or double-replace it, regardless of which fires first. */
  private handleWorkerFailure(worker: Worker, err: Error): void {
    if (!this.workers.includes(worker)) return

    for (const [id, task] of this.pending) {
      if (task.worker === worker) {
        this.pending.delete(id)
        clearTimeout(task.timer)
        task.reject(err)
      }
    }
    this.removeWorker(worker)

    const replacePromise = this.replaceWorker()
    this.inFlightReplacements.add(replacePromise)
    void replacePromise.finally(() =>
      this.inFlightReplacements.delete(replacePromise)
    )
  }

  private removeWorker(worker: Worker): void {
    this.workers = this.workers.filter((w) => w !== worker)
    this.idle = this.idle.filter((w) => w !== worker)
    // Phase 23.1 plan 04: Set#delete() on a worker never added (a pure-JS
    // or pre-plan-04 worker) is a documented no-op -- this can never
    // decrement past zero or decrement a worker that was never counted.
    this.nativeWorkerSet.delete(worker)
  }

  private async replaceWorker(): Promise<void> {
    if (this.inlineFallback || this.shuttingDown) return
    try {
      const worker = await this.spawnWorker(this.resolveWorkerSpec())
      // shutdown() may have been called WHILE this spawn was in flight — a
      // worker that only just finished spawning must never be onboarded
      // into a pool that's already tearing down; terminate it immediately
      // instead (shutdown()'s own final sweep over `allWorkers` also covers
      // it, since wireWorker() already added it — this is a fast-path, not
      // the only safety net).
      if (this.shuttingDown) {
        await worker.terminate().catch(() => undefined)
        return
      }
      this.workers.push(worker)
      this.releaseWorker(worker)
    } catch (err) {
      // Replacement failed too — the pool just runs smaller; decode() still
      // dispatches to any remaining workers, or falls back inline if none
      // are left (same discipline as init()'s own fallback). Log the
      // capacity collapse so an operator investigating a slow/hung install
      // can correlate it (WR-02) — only the error message is logged, never
      // any key/token/SteamID.
      logWarning(
        [
          'DecompressPool: worker replacement failed; pool now at',
          `${this.workers.length} worker(s)`,
          (err as Error)?.message ?? ''
        ],
        LogPrefix.Steam
      )
      // WR-01: if the pool has collapsed to zero live workers, no worker
      // will ever call releaseWorker() to drain the queue — so any tasks
      // already sitting in `this.queue` (queued while every worker was
      // busy, before the collapse) would hang forever and stall the whole
      // install. Drain them on the main thread instead, reusing the same
      // inline decodeChunk safety net init()/decode() already rely on.
      if (this.workers.length === 0) this.drainQueueInline()
    }
  }

  /** Settles every still-queued task on the main thread via inlineDecode.
   *  Called only when the pool has no live workers left AND worker
   *  replacement is failing, so a deep queue can never orphan (WR-01).
   *  `splice(0)` empties the queue atomically so releaseWorker()/dispatch()
   *  can never also pick up a drained task (no double-settle). Each task
   *  still passes through the identical sha1/size integrity gate inside
   *  decodeChunk. */
  private drainQueueInline(): void {
    for (const task of this.queue.splice(0)) {
      this.inlineDecode(
        task.encrypted,
        task.key,
        task.expectedSha,
        task.cbOriginal
      ).then(task.resolve, task.reject)
    }
  }

  private releaseWorker(worker: Worker): void {
    if (!this.workers.includes(worker)) return
    const next = this.queue.shift()
    if (next) {
      this.dispatch(worker, next)
    } else {
      this.idle.push(worker)
    }
  }

  private dispatch(worker: Worker, task: QueuedTask): void {
    const id = task.id
    const timer = setTimeout(() => {
      // Reject THIS task with the "timed out" message immediately, by
      // removing it from `pending` before terminating the worker — that
      // way the worker's own 'exit'/'error' event (terminate() triggers
      // 'exit') can never race this callback for which message wins (it
      // finds no pending task left for this worker and just falls through
      // to bookkeeping). Bound-and-recover (T-21-15-03): the task rejects
      // so fetchChunk retries the next content server; the worker is
      // terminated + replaced below regardless of ordering.
      const timedOutTask = this.pending.get(id)
      if (timedOutTask) {
        this.pending.delete(id)
        timedOutTask.reject(
          taggedPoolError(
            `decompress task ${id} timed out`,
            'decompress_pool_timeout'
          )
        )
      }
      void worker.terminate().catch(() => undefined)
      this.handleWorkerFailure(
        worker,
        taggedPoolError(
          `decompress task ${id} timed out`,
          'decompress_pool_timeout'
        )
      )
    }, this.taskTimeoutMs)

    this.pending.set(id, {
      resolve: task.resolve,
      reject: task.reject,
      timer,
      worker
    })

    // The key is copied into its OWN ArrayBuffer — never transferred, since
    // the caller's key buffer is reused across every chunk in the depot
    // (T-21-15-02). Only the per-chunk encrypted bytes are transferred.
    const keyArrayBuffer = toOwnArrayBuffer(Buffer.from(task.key))
    const encryptedArrayBuffer = toOwnArrayBuffer(task.encrypted)

    const message: DecompressWorkerRequest = {
      id,
      encrypted: encryptedArrayBuffer,
      key: keyArrayBuffer,
      expectedSha: task.expectedSha,
      cbOriginal: task.cbOriginal
    }
    worker.postMessage(message, [encryptedArrayBuffer])
  }

  /** Phase 23.1 plan 04: delegates to lzmaLoader.ts's `loadLzmaModule()` --
   *  the SAME native-first, pure-JS-fallback loader `decompressWorker.ts`'s
   *  `getLzma()` uses, so the main-thread inline-fallback path and the
   *  pooled worker path can never diverge on which decoder either one is
   *  actually using. This method's own dedicated `import('lzma')`
   *  memoization (pre-plan-04, the `lzmaPromise` field) is gone -- the
   *  loader owns that now. */
  private async inlineDecode(
    encrypted: Buffer,
    key: Buffer,
    expectedSha: string,
    cbOriginal: number | string
  ): Promise<Buffer> {
    const lzma = await loadLzmaModule()
    return decodeChunk(encrypted, key, expectedSha, cbOriginal, lzma)
  }

  /**
   * Decode one chunk: dispatched to an idle pool worker (or queued if every
   * worker is busy). Transparently falls back to inline main-thread
   * decodeChunk when the pool never initialized or has no live workers —
   * same signature as decompress.ts's `DecodeFn`, so this is a drop-in
   * replacement for fetchChunk's default decoder.
   */
  decode = (
    encrypted: Buffer,
    key: Buffer,
    expectedSha: string,
    cbOriginal: number | string
  ): Promise<Buffer> => {
    if (this.inlineFallback || this.workers.length === 0) {
      return this.inlineDecode(encrypted, key, expectedSha, cbOriginal)
    }

    return new Promise<Buffer>((resolvePromise, reject) => {
      const id = this.nextId++
      const task: QueuedTask = {
        id,
        encrypted,
        key,
        expectedSha,
        cbOriginal,
        resolve: resolvePromise,
        reject
      }
      const worker = this.idle.pop()
      if (worker) {
        this.dispatch(worker, task)
      } else {
        this.queue.push(task)
      }
    })
  }

  /**
   * Debug/humankind-depot-full-stall (2026-08-17, network-vs-decode split):
   * a live, point-in-time saturation snapshot -- `busy` derived as
   * `workers.length - idle.length` (never tracked as its own counter, so it
   * can never drift out of sync with `workers`/`idle`). Lets a hardware run
   * directly confirm whether the pool is actually the thing running out of
   * headroom (busy===size AND queued>0, sustained) instead of inferring
   * saturation from timing alone (see decompress.ts's `ChunkAttemptEvent.netMs`
   * doc comment for the matching network-side half of this split). Purely
   * observational: never read by any dispatch/queue/replace logic in this
   * file.
   *
   * Phase 23.1 plan 04: `nativeWorkers` is the equivalent instrument for a
   * different question -- not "is the pool saturated" but "is the native
   * decoder actually engaged". This session's own live `DecompressPool`
   * instrumentation is what finally surfaced that every decode had been
   * running inline (see `init()`'s doc comment above); `nativeWorkers` lets
   * a future live run answer 23.1-05's own gate from a running install's
   * state directly, instead of another forensic round-trip. Same
   * discipline as every other field here: purely observational, never read
   * by any dispatch/queue/replace logic.
   */
  stats(): {
    size: number
    busy: number
    idle: number
    queued: number
    inlineFallback: boolean
    nativeWorkers: number
  } {
    return {
      size: this.size,
      busy: this.workers.length - this.idle.length,
      idle: this.idle.length,
      queued: this.queue.length,
      inlineFallback: this.inlineFallback,
      nativeWorkers: this.nativeWorkerSet.size
    }
  }

  /** Clears every pending timer and terminates + AWAITS every worker this
   *  pool instance ever spawned (not just the currently-active `workers` —
   *  a worker removed on the failure path still has a live parent-side
   *  handle until its own terminate() promise settles, which would
   *  otherwise leak past this call). Sets `shuttingDown` FIRST and awaits
   *  any in-flight replaceWorker() spawns before terminating, so a
   *  replacement worker that finishes spawning concurrently with shutdown()
   *  is never onboarded into a dead pool and left untracked (see
   *  replaceWorker()'s own guard). Call in a `finally` so no workers leak
   *  across installs. */
  async shutdown(): Promise<void> {
    this.shuttingDown = true

    for (const task of this.pending.values()) {
      clearTimeout(task.timer)
    }
    this.pending.clear()
    this.queue = []

    await Promise.all([...this.inFlightReplacements])

    const toTerminate = [...this.allWorkers]
    this.allWorkers.clear()
    this.workers = []
    this.idle = []
    await Promise.all(
      toTerminate.map((w) => w.terminate().catch(() => undefined))
    )
  }
}
