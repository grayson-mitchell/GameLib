/**
 * Fake Clock (D-04): replaces `jest.useFakeTimers` for code that takes a
 * Clock. Time only moves when the test calls advance() or runAll().
 *
 * runAll() fires every pending timeout; an interval fires once per runAll()
 * tick and is then dropped, so a never-ending interval cannot loop forever.
 */
import type { Clock, TimerHandle, TimerOptions } from '../process/types'

export interface FakeClock extends Clock {
  advance(ms: number): void
  runAll(): void
  pendingCount(): number
  keepAliveReasons(): string[]
  assertNoKeepAlive(): void
}

interface FakeTimer {
  id: number
  due: number
  seq: number
  fn: () => void
  interval: number | null
  keepAlive: string | null
}

export function createFakeClock(startMs = 0): FakeClock {
  let current = startMs
  let nextId = 1
  let seq = 0
  const timers = new Map<number, FakeTimer>()

  const reason = (opts: TimerOptions | undefined): string | null => {
    if (opts?.keepAlive === undefined) return null
    if (opts.keepAlive.reason.trim().length === 0) {
      throw new TypeError('keepAlive requires a non-empty reason (D-04)')
    }
    return opts.keepAlive.reason
  }

  const add = (
    fn: () => void,
    ms: number,
    interval: number | null,
    keepAlive: string | null
  ): TimerHandle => {
    const id = nextId++
    timers.set(id, {
      id,
      due: current + Math.max(0, ms),
      seq: seq++,
      fn,
      interval,
      keepAlive
    })
    return { id }
  }

  const earliest = (limit: number): FakeTimer | undefined => {
    let best: FakeTimer | undefined
    for (const t of timers.values()) {
      if (t.due > limit) continue
      if (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq))
        best = t
    }
    return best
  }

  const fire = (t: FakeTimer) => {
    if (t.interval === null) {
      timers.delete(t.id)
    } else {
      t.due += Math.max(1, t.interval)
      t.seq = seq++
    }
    t.fn()
  }

  return {
    now: () => current,
    setTimeout(fn, ms, opts) {
      return add(fn, ms, null, reason(opts))
    },
    setInterval(fn, ms, opts) {
      return add(fn, ms, ms, reason(opts))
    },
    clear(handle) {
      timers.delete(handle.id)
    },
    advance(ms) {
      const target = current + ms
      for (let t = earliest(target); t; t = earliest(target)) {
        current = Math.max(current, t.due)
        fire(t)
      }
      current = target
    },
    runAll() {
      const batch = [...timers.values()].sort(
        (a, b) => a.due - b.due || a.seq - b.seq
      )
      for (const t of batch) {
        if (!timers.has(t.id)) continue
        current = Math.max(current, t.due)
        timers.delete(t.id)
        t.fn()
      }
    },
    pendingCount: () => timers.size,
    keepAliveReasons: () =>
      [...timers.values()].flatMap((t) => (t.keepAlive ? [t.keepAlive] : [])),
    assertNoKeepAlive() {
      const reasons = [...timers.values()].flatMap((t) =>
        t.keepAlive ? [t.keepAlive] : []
      )
      if (reasons.length > 0) {
        throw new Error(`keepAlive timers pending: ${reasons.join('; ')}`)
      }
    }
  }
}
