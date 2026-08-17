// Quick 260817-ihr (IHR-02): unit tests for the run-scoped FIFO concurrency
// limiter (depot/inflightLimiter.ts). See the module's own doc comment for
// the root-cause writeup: downloadFileChunks derived its per-file worker
// pool size as `Math.min(CHUNK_CONCURRENCY, queue.length)`, so a
// single-chunk file ran exactly ONE concurrent request -- and with
// HUMANKIND's 18,949 mostly-single-chunk files, the whole download run
// sustained only FILE_CONCURRENCY=8 concurrent HTTP requests instead of the
// intended 32 (Little's Law on the 2026-08-17 hardware log).
//
// Uses resolvable deferred promises to hold slots open and assert on start
// ORDER and peak concurrency, never on wall-clock timing (flaky-test
// avoidance per this repo's own process lessons).

import { InflightLimiter } from '../depot/inflightLimiter'

function createDeferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Flushes several microtask turns -- generous enough to let any chain of
 *  `await`s inside the limiter's internal acquire/release plumbing settle,
 *  without ever depending on a real timer/wall clock. */
async function flushMicrotasks(turns = 5): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve()
  }
}

describe('InflightLimiter', () => {
  it('runs at most `max` tasks concurrently -- task max+1 does not start until one of the first max settles', async () => {
    const limiter = new InflightLimiter(2)
    const started: number[] = []
    const d0 = createDeferred<string>()
    const d1 = createDeferred<string>()
    const d2 = createDeferred<string>()

    const p0 = limiter.run(async () => {
      started.push(0)
      return d0.promise
    })
    const p1 = limiter.run(async () => {
      started.push(1)
      return d1.promise
    })
    const p2 = limiter.run(async () => {
      started.push(2)
      return d2.promise
    })

    await flushMicrotasks()
    // Only the first 2 (max) tasks may have started -- the 3rd stays queued.
    expect(started).toEqual([0, 1])

    d0.resolve('r0')
    await p0
    await flushMicrotasks()
    // Releasing d0's slot lets the 3rd task start.
    expect(started).toEqual([0, 1, 2])

    d1.resolve('r1')
    d2.resolve('r2')
    expect(await p1).toBe('r1')
    expect(await p2).toBe('r2')
  })

  it('queued tasks start in FIFO order', async () => {
    const limiter = new InflightLimiter(1)
    const order: number[] = []
    const deferreds = [
      createDeferred<void>(),
      createDeferred<void>(),
      createDeferred<void>()
    ]

    const runs = deferreds.map((d, i) =>
      limiter.run(async () => {
        order.push(i)
        await d.promise
      })
    )

    await flushMicrotasks()
    expect(order).toEqual([0])

    deferreds[0].resolve()
    await runs[0]
    await flushMicrotasks()
    expect(order).toEqual([0, 1])

    deferreds[1].resolve()
    await runs[1]
    await flushMicrotasks()
    expect(order).toEqual([0, 1, 2])

    deferreds[2].resolve()
    await runs[2]
  })

  it('a task that throws still releases its slot -- the next queued task runs, and the rejection propagates to the caller unchanged', async () => {
    const limiter = new InflightLimiter(1)
    const boom = new Error('boom')

    const p0 = limiter.run((): Promise<never> => {
      throw boom
    })
    await expect(p0).rejects.toBe(boom)

    // The slot must have been released in the throwing task's `finally` --
    // a second task can still acquire it and run.
    const p1 = limiter.run(() => Promise.resolve('ok'))
    expect(await p1).toBe('ok')
  })

  it('a queued task still starts after an earlier task rejects (no leaked slot)', async () => {
    const limiter = new InflightLimiter(2)
    const started: number[] = []
    const d = createDeferred<void>()

    const p0 = limiter.run((): Promise<never> => {
      started.push(0)
      throw new Error('fail-0')
    })
    const p1 = limiter.run(async () => {
      started.push(1)
      await d.promise
    })
    const p2 = limiter.run(() => {
      started.push(2)
      return Promise.resolve()
    })

    await expect(p0).rejects.toThrow('fail-0')
    await flushMicrotasks()
    // Task 0 rejected immediately, releasing its slot -- task 2 (queued
    // behind task 1) picks it up right away. Task 1 is still holding its
    // own separate slot, awaiting `d`.
    expect(started).toEqual([0, 1, 2])

    d.resolve()
    await p1
    await p2
  })

  it('a task that resolves returns its value to the caller unchanged', async () => {
    const limiter = new InflightLimiter(3)
    const result = await limiter.run(() => Promise.resolve(42))
    expect(result).toBe(42)
  })

  it('rejects a non-positive or non-finite max at construction rather than deadlocking', () => {
    expect(() => new InflightLimiter(0)).toThrow()
    expect(() => new InflightLimiter(-1)).toThrow()
    expect(() => new InflightLimiter(NaN)).toThrow()
    expect(() => new InflightLimiter(Infinity)).toThrow()
    expect(() => new InflightLimiter(-Infinity)).toThrow()
  })

  it('a valid positive finite max does not throw', () => {
    expect(() => new InflightLimiter(1)).not.toThrow()
    expect(() => new InflightLimiter(32)).not.toThrow()
  })
})
