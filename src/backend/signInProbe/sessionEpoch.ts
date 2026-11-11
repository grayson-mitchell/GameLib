/**
 * Phase 49 (49-04, R2 concurrency edge, RESEARCH Pattern 6 / Pitfall 5): the
 * per-store session-epoch fence.
 *
 * A probe captures its store's epoch at start; `applySignInVerdict` compares it
 * before any latch and refuses to write if it moved. The epoch is bumped on
 * every sign-in success and every sign-out (the 49-05 / 49-06 call sites, via
 * `noteSignInSucceeded` / `noteSignedOut`), so a probe that began before a
 * sign-in finished can never re-set `expired` on the fresh session
 * (T-49-10). Same shape as `cacheEpoch` in keyringTokenStore.ts
 * (T-34.5-G6-14).
 *
 * Holds counters only -- never a value, never a secret. A leaf module on
 * purpose: its one import is a type, so anything may import it without a cycle.
 *
 * Sidecar exit contract: plain memory, no timer, watcher, socket or child.
 */
import type { SignInStore } from 'common/signInState'

export interface SignInEpochs {
  capture(store: SignInStore): number
  isCurrent(store: SignInStore, epoch: number): boolean
  bump(store: SignInStore): void
}

/**
 * One instance per boot (D-05, D-66.3-13), shared by every store's user module, the probe pass and
 * the verdict, so a capture taken by one is fenced by a bump from another. Two instances never
 * share counters.
 */
export function createSignInEpochs(): SignInEpochs {
  const epochs: Record<SignInStore, number> = {
    legendary: 0,
    gog: 0,
    nile: 0,
    humble: 0,
    steam: 0
  }
  return {
    capture: (store) => epochs[store],
    isCurrent: (store, epoch) => epochs[store] === epoch,
    bump: (store) => {
      epochs[store] += 1
    }
  }
}
