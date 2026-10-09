/**
 * Phase 49 (49-04, R2): `applySignInVerdict` -- the single place the sign-in
 * probe pass writes a verdict.
 *
 *   - `expired` latches the store's persisted flag: `legendaryConfigStore`,
 *     `gogConfigStore`, `nileConfigStore` and `humbleConfigStore` take
 *     `expired`; Steam takes `steamConfigStore.credentialsMissing`.
 *   - `healthy` deletes it.
 *   - `unknown` NEVER writes (P1, 260822-vov): "we could not tell" is not
 *     evidence of a signed-out store.
 *
 * Order of checks: a moved session epoch returns `stale` first (T-49-10: a
 * probe that began before a sign-in completed must not re-set `expired` on the
 * fresh session), then `unknown` returns `unchanged`, then write-if-changed.
 * Two identical results therefore set the flag once and emit one renderer
 * state change (`TypeCheckedStoreBackend.set/delete` notify the snapshot); the
 * second `expired` returns `unchanged` with no `set` (R2 idempotency).
 *
 * D-10: this module never touches AppSettings, so a dismiss written while a
 * pass runs cannot be clobbered by it. A source gate in verdict.test.ts pins
 * that for the whole `signInProbe` directory.
 *
 * D-18: Humble's latch lives here now (its library sync never latched, and the
 * renderer health call is removed), so a Humble `latched` or `cleared` still
 * pushes the cookie-free `humbleAuthState` that the expiry toast and the Humble
 * tile react to.
 *
 * Logs one line per call: the store and the result label, nothing else.
 *
 * Sidecar exit contract: synchronous -- store writes and one frame write. No
 * timer, watcher, socket or child, so nothing to unref() and no in-flight work.
 * It is only called after a probe has resolved or been bounded by 49-08's
 * `boundedSignInProbe`.
 */
import { sendFrontendMessage } from 'backend/ipc'
import { logInfo, LogPrefix } from 'backend/logger'
import { configStore as humbleConfigStore } from 'backend/humble/electronStores'
import { configStore as gogConfigStore } from 'backend/storeManagers/gog/electronStores'
import { legendaryConfigStore } from 'backend/storeManagers/legendary/electronStores'
import { configStore as nileConfigStore } from 'backend/storeManagers/nile/electronStores'
import { configStore as steamConfigStore } from 'backend/storeManagers/steam/electronStores'
import type { SignInProbeOutcome, SignInStore } from 'common/signInState'
import { isSignInEpochCurrent } from './sessionEpoch'

export type SignInVerdictResult = 'latched' | 'cleared' | 'unchanged' | 'stale'

interface PersistedFlag {
  isSet(): boolean
  latch(): void
  clear(): void
}

/**
 * One accessor per store. `latch` is only ever called from the `expired`
 * branch of `applySignInVerdict`; `clear` only from the `healthy` branch.
 */
const FLAGS: Record<SignInStore, PersistedFlag> = {
  legendary: {
    isSet: () => legendaryConfigStore.get_nodefault('expired') === true,
    latch: () => legendaryConfigStore.set('expired', true),
    clear: () => legendaryConfigStore.delete('expired')
  },
  gog: {
    isSet: () => gogConfigStore.get_nodefault('expired') === true,
    latch: () => gogConfigStore.set('expired', true),
    clear: () => gogConfigStore.delete('expired')
  },
  nile: {
    isSet: () => nileConfigStore.get_nodefault('expired') === true,
    latch: () => nileConfigStore.set('expired', true),
    clear: () => nileConfigStore.delete('expired')
  },
  humble: {
    isSet: () => humbleConfigStore.get_nodefault('expired') === true,
    latch: () => humbleConfigStore.set('expired', true),
    clear: () => humbleConfigStore.delete('expired')
  },
  steam: {
    isSet: () => steamConfigStore.get_nodefault('credentialsMissing') === true,
    latch: () => steamConfigStore.set('credentialsMissing', true),
    clear: () => steamConfigStore.delete('credentialsMissing')
  }
}

/** Display-safe by construction: the same cookie-free shape as before D-18. */
function pushHumbleAuthState(expired: boolean): void {
  const userData = humbleConfigStore.get_nodefault('userData')
  sendFrontendMessage('humbleAuthState', {
    isLoggedIn: true,
    username: userData?.username,
    expired
  })
}

function decide(
  store: SignInStore,
  outcome: SignInProbeOutcome,
  epochAtStart: number
): SignInVerdictResult {
  if (!isSignInEpochCurrent(store, epochAtStart)) {
    return 'stale'
  }
  if (outcome === 'unknown') {
    return 'unchanged'
  }

  const flag = FLAGS[store]
  if (outcome === 'expired') {
    if (flag.isSet()) {
      return 'unchanged'
    }
    flag.latch()
    if (store === 'humble') {
      pushHumbleAuthState(true)
    }
    return 'latched'
  }

  // outcome === 'healthy'
  if (!flag.isSet()) {
    return 'unchanged'
  }
  flag.clear()
  if (store === 'humble') {
    pushHumbleAuthState(false)
  }
  return 'cleared'
}

export function applySignInVerdict(
  store: SignInStore,
  outcome: SignInProbeOutcome,
  epochAtStart: number
): SignInVerdictResult {
  const result = decide(store, outcome, epochAtStart)
  logInfo(`[signInProbe] ${store} verdict=${result}`, LogPrefix.Backend)
  return result
}
