import { useEffect, useState } from 'react'

/** How long a refresh button spins after a click, at the least (ms). */
export const MIN_SPIN_MS = 1000

/**
 * Click feedback for a refresh button (quick 261123-bbi).
 *
 * The rule: a refresh button spins for max(1 s from the click, end of the
 * refresh). A refresh that returns at once (a Humble sync that is
 * fire-and-forget, or a cache hit) still shows that the click was received;
 * one that outlasts the second spins until it ends, with no extra tail.
 *
 * - `active` is the real busy flag of the refresh. `spinning` is true while it
 *   is set, and also for `minMs` after each click.
 * - The window starts on `onClickStart()` and on nothing else. A busy period
 *   nobody clicked for (a background or per-runner refresh, a store-exit
 *   refresh) spins exactly as long as it runs and gets no tail.
 * - Each click restarts the window, and unmount clears the timer.
 * - Call sites keep `disabled` on the real busy flag. The window is visual
 *   feedback only and blocks no click.
 *
 * Only `useState` and `useEffect` are used, on purpose. The window is two
 * counters (clicks opened, clicks closed); the effect arms one timer per
 * opened click and its cleanup clears it, so a re-click restarts the window
 * and unmount cleans up. No `useRef` or `useCallback`: the node-env `react`
 * mocks used by several screen tests are slot-based, and
 * `withStoreHooks`' `useRef` is not persistent there, so a ref-held timer id
 * would be lost.
 */
export function useMinimumSpin(
  active: boolean,
  minMs: number = MIN_SPIN_MS
): { spinning: boolean; onClickStart: () => void } {
  const [opened, setOpened] = useState(0)
  const [closed, setClosed] = useState(0)

  useEffect(() => {
    if (opened === 0) return
    const id = setTimeout(() => setClosed(opened), minMs)
    return () => clearTimeout(id)
  }, [opened, minMs])

  return {
    spinning: active || opened !== closed,
    onClickStart: () => setOpened((n) => n + 1)
  }
}
