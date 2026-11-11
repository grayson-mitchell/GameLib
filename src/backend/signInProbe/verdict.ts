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
import { isStore } from 'common/storeCapabilities'
import { sendFrontendMessage } from 'backend/ipc'
import { logInfo, LogPrefix } from 'backend/logger'
import type { Stores } from 'backend/services/types'
import type { SignInProbeOutcome, SignInStore } from 'common/signInState'
import type { SignInEpochs } from './sessionEpoch'

/**
 * The store family a verdict reads and writes (66.1, R3). `SignInStore` names are
 * `Stores` keys, so a caller deciding for one store injects only that family.
 */
export interface SignInVerdictDeps<S extends SignInStore = SignInStore> {
  stores: Pick<Stores, S>
  /** The boot's shared epoch fence (D-66.3-13); the verdict only reads it. */
  epochs: Pick<SignInEpochs, 'isCurrent'>
}

export type SignInVerdictResult = 'latched' | 'cleared' | 'unchanged' | 'stale'

interface PersistedFlag {
  isSet(): boolean
  latch(): void
  clear(): void
}

/**
 * One accessor per store, resolved lazily so a caller that injected a single
 * family never touches the others. `latch` is only ever called from the
 * `expired` branch of `applySignInVerdict`; `clear` only from the `healthy`
 * branch.
 */
function flagFor<S extends SignInStore>(
  deps: SignInVerdictDeps<S>,
  store: S
): PersistedFlag {
  // Only `store`'s family is injected for a single-store caller; the lookups
  // below touch nothing else.
  const stores = deps.stores as Pick<Stores, SignInStore>
  const accessors: Record<SignInStore, () => PersistedFlag> = {
    legendary: () => flagOver(stores.legendary.legendaryConfigStore, 'expired'),
    gog: () => flagOver(stores.gog.configStore, 'expired'),
    nile: () => flagOver(stores.nile.configStore, 'expired'),
    humble: () => flagOver(stores.humble.configStore, 'expired'),
    steam: () => flagOver(stores.steam.configStore, 'credentialsMissing')
  }
  return accessors[store]()
}

function flagOver(
  store: unknown,
  key: 'expired' | 'credentialsMissing'
): PersistedFlag {
  const flagStore = store as {
    get_nodefault(k: string): unknown
    set(k: string, v: boolean): void
    delete(k: string): void
  }
  return {
    isSet: () => flagStore.get_nodefault(key) === true,
    latch: () => flagStore.set(key, true),
    clear: () => flagStore.delete(key)
  }
}

/** Display-safe by construction: the same cookie-free shape as before D-18. */
function pushHumbleAuthState(
  { stores }: SignInVerdictDeps<'humble'>,
  expired: boolean
): void {
  const userData = stores.humble.configStore.get_nodefault('userData')
  sendFrontendMessage('humbleAuthState', {
    isLoggedIn: true,
    username: userData?.username,
    expired
  })
}

function decide<S extends SignInStore>(
  deps: SignInVerdictDeps<S>,
  store: S,
  outcome: SignInProbeOutcome,
  epochAtStart: number
): SignInVerdictResult {
  if (!deps.epochs.isCurrent(store, epochAtStart)) {
    return 'stale'
  }
  if (outcome === 'unknown') {
    return 'unchanged'
  }

  const flag = flagFor(deps, store)
  if (outcome === 'expired') {
    if (flag.isSet()) {
      return 'unchanged'
    }
    flag.latch()
    if (isStore(store, 'humble')) {
      pushHumbleAuthState(deps as unknown as SignInVerdictDeps<'humble'>, true)
    }
    return 'latched'
  }

  // outcome === 'healthy'
  if (!flag.isSet()) {
    return 'unchanged'
  }
  flag.clear()
  if (isStore(store, 'humble')) {
    pushHumbleAuthState(deps as unknown as SignInVerdictDeps<'humble'>, false)
  }
  return 'cleared'
}

export function applySignInVerdict<S extends SignInStore>(
  deps: SignInVerdictDeps<S>,
  store: S,
  outcome: SignInProbeOutcome,
  epochAtStart: number
): SignInVerdictResult {
  const result = decide(deps, store, outcome, epochAtStart)
  logInfo(`[signInProbe] ${store} verdict=${result}`, LogPrefix.Backend)
  return result
}
