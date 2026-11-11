/**
 * A Clock over the global timers, unref'd like the production clock, for suites that drive time with
 * `jest.useFakeTimers()` / `jest.advanceTimersByTime*` instead of a FakeClock. Handles are resolved
 * at call time, so installing fake timers after the clock is built still works.
 */
import type { Clock, TimerHandle } from '../process/types'

export function createGlobalTimerClock(): Clock {
  let nextId = 1
  const live = new Map<number, ReturnType<typeof setTimeout>>()
  const track = (
    handle: ReturnType<typeof setTimeout>,
    forget: boolean
  ): TimerHandle => {
    const id = nextId++
    if (!forget) live.set(id, handle)
    return { id }
  }
  return {
    now: () => Date.now(),
    setTimeout(fn, ms) {
      const id = nextId
      const handle = setTimeout(() => {
        live.delete(id)
        fn()
      }, ms)
      handle.unref?.()
      return track(handle, false)
    },
    setInterval(fn, ms) {
      const handle = setInterval(fn, ms)
      handle.unref?.()
      return track(handle, false)
    },
    clear(handle) {
      const timer = live.get(handle.id)
      if (timer) {
        clearTimeout(timer)
        clearInterval(timer)
      }
      live.delete(handle.id)
    }
  }
}
