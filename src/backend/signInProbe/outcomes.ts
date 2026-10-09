/**
 * Phase 49 (49-04, D-08): this launch's sign-in probe outcomes, kept in sidecar
 * memory only and published to the renderer.
 *
 * D-08: nothing here is persisted. A restart resets every outcome to pending
 * (an absent key); the only persisted verdict is the per-store `expired` flag
 * that `applySignInVerdict` writes. The map reaches the renderer two ways: one
 * pushed `signInProbeOutcomes` message carrying the whole per-store map, and a
 * read-only `getSignInProbeOutcomes` pull for a renderer that mounted after the
 * push (RESEARCH Pitfall 11). The push carries outcome labels only -- never a
 * token, cookie, error text or account identifier (T-49-09).
 *
 * D-03: `noteSignInSucceeded` is NOT a pass re-run. A successful sign-in is a
 * proven-present site, so it bumps the epoch, records `healthy` and
 * re-publishes. It runs no probe and reads no keyring slot.
 *
 * P3 (structural proof): the only renderer-reachable channel this module adds
 * is a read-only getter, so no renderer action can start a probe (T-49-11).
 *
 * Sidecar exit contract: no timer, watcher, socket or child, so nothing to
 * unref(). `sendFrontendMessage` is a synchronous frame write on the existing
 * stdout pipe and `addHandler` only registers a callback, so neither leaves
 * in-flight work behind.
 */
import { addHandler, sendFrontendMessage } from 'backend/ipc'
import type {
  SignInProbeOutcome,
  SignInProbeOutcomeMap,
  SignInStore
} from 'common/signInState'
import { bumpSignInEpoch } from './sessionEpoch'

const outcomes: SignInProbeOutcomeMap = {}
let handlerRegistered = false

/** A copy: a caller cannot mutate the module's map through the result. */
export function getSignInProbeOutcomes(): SignInProbeOutcomeMap {
  return { ...outcomes }
}

/** Sets an outcome, or removes the entry (back to pending) for `undefined`. */
export function recordSignInProbeOutcome(
  store: SignInStore,
  outcome: SignInProbeOutcome | undefined
): void {
  if (outcome === undefined) {
    delete outcomes[store]
    return
  }
  outcomes[store] = outcome
}

export function publishSignInProbeOutcomes(): void {
  sendFrontendMessage('signInProbeOutcomes', {
    outcomes: getSignInProbeOutcomes()
  })
}

/** Idempotent. The handler is a pure getter and starts nothing. */
export function registerSignInProbeOutcomesHandler(): void {
  if (handlerRegistered) {
    return
  }
  handlerRegistered = true
  addHandler('getSignInProbeOutcomes', () => getSignInProbeOutcomes())
}

/** A sign-in completed: fence any older probe, mark healthy, re-publish. */
export function noteSignInSucceeded(store: SignInStore): void {
  bumpSignInEpoch(store)
  recordSignInProbeOutcome(store, 'healthy')
  publishSignInProbeOutcomes()
}

/** A sign-out completed: fence any older probe, back to pending, re-publish. */
export function noteSignedOut(store: SignInStore): void {
  bumpSignInEpoch(store)
  recordSignInProbeOutcome(store, undefined)
  publishSignInProbeOutcomes()
}

export function __resetSignInProbeOutcomesForTests(): void {
  for (const key of Object.keys(outcomes)) {
    delete outcomes[key as SignInStore]
  }
  handlerRegistered = false
}
