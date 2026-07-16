// Phase 21 gap closure (21-15, D-UAT-03): worker_threads pool for depot
// chunk decode. Bounded fan-out (min(cores,8)), transferable ArrayBuffers,
// a per-task timeout with terminate+replace recovery, and a transparent
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
import { decodeChunk, type LzmaModule } from './decompress'
import { logWarning, LogPrefix } from 'backend/logger'
import type {
  DecompressWorkerRequest,
  DecompressWorkerResponse,
  DecompressWorkerReady
} from './decompressWorker'

function isReadyMessage(msg: unknown): msg is DecompressWorkerReady {
  return typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'ready'
}

const DEFAULT_TASK_TIMEOUT_MS = 30_000

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
  /** Defaults to min(os.cpus().length, 8). */
  size?: number
  /** Per-task timeout before a stalled worker is terminated + replaced. */
  taskTimeoutMs?: number
  /** Overrides the resolved worker script path — test-only hook. */
  workerPath?: string
}

function toOwnArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
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
  private lzmaPromise: Promise<LzmaModule> | undefined
  private readonly size: number
  private readonly taskTimeoutMs: number
  private readonly workerPathOverride?: string

  constructor(opts: DecompressPoolOpts = {}) {
    this.size = opts.size ?? Math.min(os.cpus().length, 8)
    this.taskTimeoutMs = opts.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS
    this.workerPathOverride = opts.workerPath
  }

  private resolveWorkerPath(): string {
    return this.workerPathOverride ?? path.join(__dirname, 'decompressWorker.js')
  }

  /**
   * Spawns `size` workers. On ANY spawn failure, sets `inlineFallback` and
   * terminates whatever partially spawned — `decode()` then transparently
   * runs inline on the main thread (LOCKED requirement: installs still
   * complete if the pool cannot initialize).
   */
  async init(): Promise<void> {
    const workerPath = this.resolveWorkerPath()
    const spawned: Worker[] = []
    try {
      for (let i = 0; i < this.size; i++) {
        spawned.push(await this.spawnWorker(workerPath))
      }
      this.workers = spawned
      this.idle = [...spawned]
    } catch {
      this.inlineFallback = true
      await Promise.all(spawned.map((w) => w.terminate().catch(() => undefined)))
      this.workers = []
      this.idle = []
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
  private spawnWorker(workerPath: string): Promise<Worker> {
    return new Promise((resolvePromise, reject) => {
      let settled = false
      let worker: Worker
      try {
        worker = new Worker(workerPath)
      } catch (err) {
        reject(err as Error)
        return
      }

      const onMessage = (msg: unknown) => {
        if (settled || !isReadyMessage(msg)) return
        settled = true
        worker.off('message', onMessage)
        worker.off('error', onError)
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
        task.reject(new Error(response.error))
      }
      this.releaseWorker(worker)
    })

    worker.on('error', (err) => this.handleWorkerFailure(worker, err))
    worker.on('exit', (code) => {
      if (code !== 0) {
        this.handleWorkerFailure(worker, new Error(`decompressWorker exited with code ${code}`))
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
    void replacePromise.finally(() => this.inFlightReplacements.delete(replacePromise))
  }

  private removeWorker(worker: Worker): void {
    this.workers = this.workers.filter((w) => w !== worker)
    this.idle = this.idle.filter((w) => w !== worker)
  }

  private async replaceWorker(): Promise<void> {
    if (this.inlineFallback || this.shuttingDown) return
    try {
      const worker = await this.spawnWorker(this.resolveWorkerPath())
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
      this.inlineDecode(task.encrypted, task.key, task.expectedSha, task.cbOriginal).then(
        task.resolve,
        task.reject
      )
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
        timedOutTask.reject(new Error(`decompress task ${id} timed out`))
      }
      void worker.terminate().catch(() => undefined)
      this.handleWorkerFailure(worker, new Error(`decompress task ${id} timed out`))
    }, this.taskTimeoutMs)

    this.pending.set(id, { resolve: task.resolve, reject: task.reject, timer, worker })

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

  private async inlineDecode(
    encrypted: Buffer,
    key: Buffer,
    expectedSha: string,
    cbOriginal: number | string
  ): Promise<Buffer> {
    if (!this.lzmaPromise) {
      this.lzmaPromise = import('lzma').then(
        (mod) => ((mod as { default?: LzmaModule }).default ?? mod) as unknown as LzmaModule
      )
    }
    const lzma = await this.lzmaPromise
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
    await Promise.all(toTerminate.map((w) => w.terminate().catch(() => undefined)))
  }
}
