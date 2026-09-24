/**
 * Fix for the one-shot card-art broadcast handshake (quick task 260924-swb;
 * see the 2026-09-23 todo about library card art never recovering from a
 * missed announcement, filed under `.planning/todos/`).
 *
 * The old mechanism: `GamesList` swept every not-yet-shown card with a
 * single `IntersectionObserver`, and on intersection called
 * `observer.unobserve(entry.target)` then broadcast a window `CustomEvent`
 * naming the newly-visible cards. `dispatchEvent` retains no state and has
 * no replay, so a card whose listener was not yet attached -- or that
 * remounted after the broadcast -- was blank FOREVER: nothing re-observed
 * it.
 *
 * This module inverts the handshake: each card observes its OWN node via
 * `observeCardVisibility`, behind ONE shared module-singleton observer (the
 * perf property of the original design -- a per-card observer would not
 * scale to a large library). Because a card's own effect runs immediately
 * after its own node commits, it cannot miss its own announcement, and a
 * remount simply re-observes.
 */

type VisibilityCallback = () => void

let observer: IntersectionObserver | null = null

// WeakMap, not Map: a detached node (unmounted card) must not pin its
// callback closure in memory just because it was once observed.
const callbacks = new WeakMap<Element, VisibilityCallback>()

function getObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio > 0) {
            const callback = callbacks.get(entry.target)
            if (!callback) {
              return
            }
            // Delete-before-invoke: a callback that synchronously triggers a
            // re-render must not be able to re-enter this branch for the
            // same node.
            callbacks.delete(entry.target)
            observer!.unobserve(entry.target)
            callback()
          }
        })
      },
      { rootMargin: '500px', threshold: 0 }
    )
  }
  return observer
}

/**
 * Observes `node` for intersection and calls `onVisible` exactly once, the
 * first time it intersects. Returns an unsubscribe function that removes the
 * pending callback and unobserves the node -- safe to call even after
 * `onVisible` has already fired (a WeakMap delete and an `unobserve` on an
 * already-unobserved node are both no-ops).
 */
export function observeCardVisibility(
  node: Element,
  onVisible: VisibilityCallback
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    // Fail OPEN, not blank: a card that cannot be observed must show its art
    // immediately rather than staying blank forever -- that permanent-blank
    // failure mode is the exact defect this module exists to fix.
    onVisible()
    return () => {}
  }

  const obs = getObserver()
  callbacks.set(node, onVisible)
  obs.observe(node)

  return () => {
    callbacks.delete(node)
    obs.unobserve(node)
  }
}
