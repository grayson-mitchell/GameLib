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

const epochs: Record<SignInStore, number> = {
  legendary: 0,
  gog: 0,
  nile: 0,
  humble: 0,
  steam: 0
}

export function captureSignInEpoch(store: SignInStore): number {
  return epochs[store]
}

export function isSignInEpochCurrent(
  store: SignInStore,
  epoch: number
): boolean {
  return epochs[store] === epoch
}

export function bumpSignInEpoch(store: SignInStore): void {
  epochs[store] += 1
}

export function __resetSignInEpochsForTests(): void {
  epochs.legendary = 0
  epochs.gog = 0
  epochs.nile = 0
  epochs.humble = 0
  epochs.steam = 0
}
