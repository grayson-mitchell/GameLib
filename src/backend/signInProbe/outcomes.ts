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
import { handleTyped, type IpcRegistry } from 'backend/sidecar/ipcRegistry'
import type {
  SignInProbeOutcome,
  SignInProbeOutcomeMap,
  SignInStore
} from 'common/signInState'
import type { SignInEpochs } from './sessionEpoch'

export interface SignInProbeOutcomes {
  /** A copy: a caller cannot mutate the instance's map through the result. */
  get(): SignInProbeOutcomeMap
  /** Sets an outcome, or removes the entry (back to pending) for `undefined`. */
  record(store: SignInStore, outcome: SignInProbeOutcome | undefined): void
  publish(): void
  /** Idempotent. The handler is a pure getter and starts nothing. */
  registerHandler(): void
  /** A sign-in completed: fence any older probe, mark healthy, re-publish. */
  noteSignInSucceeded(store: SignInStore): void
  /** A sign-out completed: fence any older probe, back to pending, re-publish. */
  noteSignedOut(store: SignInStore): void
}

/** What a store user module needs to report a completed sign-in or sign-out. */
export interface SignInNoteDeps {
  signIn: {
    outcomes: Pick<SignInProbeOutcomes, 'noteSignInSucceeded' | 'noteSignedOut'>
  }
}

export interface SignInProbeOutcomesDeps {
  ipc: Pick<IpcRegistry, 'handle'>
  push: (
    channel: 'signInProbeOutcomes',
    payload: { outcomes: SignInProbeOutcomeMap }
  ) => void
  epochs: Pick<SignInEpochs, 'bump'>
}

/** One instance per boot (D-05, D-66.3-13): the map and the registered-handler latch are closure fields. */
export function createSignInProbeOutcomes(
  deps: SignInProbeOutcomesDeps
): SignInProbeOutcomes {
  const outcomes: SignInProbeOutcomeMap = {}
  let handlerRegistered = false

  const get = (): SignInProbeOutcomeMap => ({ ...outcomes })

  const record: SignInProbeOutcomes['record'] = (store, outcome) => {
    if (outcome === undefined) {
      delete outcomes[store]
      return
    }
    outcomes[store] = outcome
  }

  const publish = (): void => {
    deps.push('signInProbeOutcomes', { outcomes: get() })
  }

  return {
    get,
    record,
    publish,
    registerHandler() {
      if (handlerRegistered) {
        return
      }
      handlerRegistered = true
      handleTyped(deps.ipc, 'getSignInProbeOutcomes', () => get())
    },
    noteSignInSucceeded(store) {
      deps.epochs.bump(store)
      record(store, 'healthy')
      publish()
    },
    noteSignedOut(store) {
      deps.epochs.bump(store)
      record(store, undefined)
      publish()
    }
  }
}
