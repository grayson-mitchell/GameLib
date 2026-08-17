// Quick 260817-ihr (IHR-02): explicit run-level in-flight-request budget for
// depot chunk fetches.
//
// ROOT CAUSE this replaces: `downloadFileChunks` (depot.ts) derives its
// per-file chunk-worker pool as `workerCount = Math.min(CHUNK_CONCURRENCY,
// queue.length)`, so a single-chunk file runs exactly ONE concurrent
// request. The 2026-08-17 HUMANKIND hardware log's own numbers prove the
// consequence: 18,949 files, the overwhelming majority single-chunk against
// ~16k total chunks, meant the whole download RUN sustained only
// FILE_CONCURRENCY=8 concurrent HTTP requests -- a quarter of the intended
// FILE_CONCURRENCY * CHUNK_CONCURRENCY = 32 (Little's Law on that log:
// 16092 attempts / 1334s = 12.06 attempts/sec x 0.692s avg latency = 8.35
// requests in flight). Raising FILE_CONCURRENCY alone, without a separate
// run-wide cap, would let a multi-chunk file explode past that intended
// budget (up to FILE_CONCURRENCY x CHUNK_CONCURRENCY = 128 in flight) --
// this module makes the budget explicit and enforces it at the actual
// network-request boundary instead of letting it emerge accidentally from
// pool sizes.
//
// ONE instance per download RUN -- constructed fresh in downloadDepotFiles,
// same discipline already established by HostHealthTracker/StallTracker --
// deliberately never a module-level singleton, so one run's budget can
// never throttle a later, unrelated run, and tests never leak state into
// each other.

interface QueueEntry {
  /** Grants this waiter its slot -- increments `active` and resolves the
   *  Promise its `acquire()` call is awaiting. */
  grant: () => void
}

export class InflightLimiter {
  private readonly max: number
  private active = 0
  private readonly queue: QueueEntry[] = []

  constructor(max: number) {
    if (!Number.isFinite(max) || max <= 0) {
      throw new Error(
        `InflightLimiter: max must be a finite number > 0 (got ${max}) -- ` +
          'a non-positive or non-finite budget would deadlock every caller.'
      )
    }
    this.max = max
  }

  /**
   * Runs `fn` once a slot is available (immediately if the run-wide budget
   * isn't exhausted, otherwise queued FIFO -- first caller to queue is the
   * first to acquire a freed slot). The slot is always released in a
   * `finally`, so a task that throws or returns a rejected promise still
   * frees it for the next queued task; `fn`'s resolved value or rejection
   * reason is returned/propagated to the caller completely unchanged.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.queue.push({
        grant: () => {
          this.active++
          resolve()
        }
      })
    })
  }

  private release(): void {
    this.active--
    // FIFO: the longest-queued waiter gets the freed slot next.
    const next = this.queue.shift()
    next?.grant()
  }
}
