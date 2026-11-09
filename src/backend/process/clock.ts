/**
 * Injected clock (Phase 66 D-04). Every timer is unref()'d unless the caller
 * passes `keepAlive` with a non-empty reason, so a timer can never hold the
 * sidecar's event loop open by accident (sidecar exit contract).
 *
 * Import budget: none. State lives inside each createClock() call.
 */
import type { Clock, TimerHandle, TimerOptions } from './types'

export function createClock(): Clock {
  const timers = new Map<number, NodeJS.Timeout>()
  let nextId = 1

  const prepare = (opts: TimerOptions | undefined): boolean => {
    if (opts?.keepAlive === undefined) return false
    if (opts.keepAlive.reason.trim().length === 0) {
      throw new TypeError('keepAlive requires a non-empty reason (D-04)')
    }
    return true
  }

  return {
    now: () => Date.now(),
    setTimeout(fn, ms, opts) {
      const keep = prepare(opts)
      const id = nextId++
      const t = setTimeout(() => {
        timers.delete(id)
        fn()
      }, ms)
      if (!keep) t.unref?.()
      timers.set(id, t)
      return { id }
    },
    setInterval(fn, ms, opts) {
      const keep = prepare(opts)
      const id = nextId++
      const t = setInterval(fn, ms)
      if (!keep) t.unref?.()
      timers.set(id, t)
      return { id }
    },
    clear(handle: TimerHandle) {
      const t = timers.get(handle.id)
      if (t === undefined) return
      clearTimeout(t)
      clearInterval(t)
      timers.delete(handle.id)
    }
  }
}
