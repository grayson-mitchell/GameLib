/**
 * Phase 49 D-06/D-07 -- the one place the per-store sign-in rule table is
 * written.
 *
 * Every surface that needs to know "is this store signed in?" (the Library
 * sign-in notice, the Manage Accounts tiles, the R7 parity test) reaches this
 * module through `collectSignInInputs` + `resolveSignInStates` and never
 * re-inlines a flag comparison. Each store's persisted expiry flag
 * (`credentialsMissing` for Steam, `expired` for Humble and the Epic/GOG/Amazon
 * keys added later in this phase) is only a variant detail that feeds this
 * selector.
 *
 * Zero runtime imports on purpose: this file lives in `src/common`, so both
 * the sidecar and the renderer load it, and neither side's code may leak in.
 *
 * Rule order (first match wins) -- see `resolveSignInState`:
 *
 *   1. a latched expiry flag                -> 'expired'
 *   2. not logged in                        -> 'not-connected'
 *   3. a healthy probe outcome              -> 'connected'
 *   4. everything else                      -> 'unknown'
 *
 * WHY branch 1 precedes branch 2 (RESEARCH Pitfall 3): legendary 0.21.0
 * deletes `user.json` on the very same verdict that latches Epic's expiry
 * flag, so by the time the flag is set the store reads as logged out. A
 * logged-in-first order would turn a proven expiry into a dismissible "not
 * connected" row. The flag must therefore outrank `loggedIn: false`.
 *
 * `unknown` is never the result of an authentication failure. An auth failure
 * latches the flag (branch 1); `unknown` is "we could not tell" -- a pending
 * probe, a network error, a denied keychain prompt, or an expired outcome that
 * was never latched.
 */

/** The five stores that can be signed in or out, in canonical display order. */
export type SignInStore = 'legendary' | 'gog' | 'nile' | 'humble' | 'steam'

/** Canonical order: Epic, GOG, Amazon, Humble, Steam. */
export const SIGN_IN_STORES: readonly SignInStore[] = [
  'legendary',
  'gog',
  'nile',
  'humble',
  'steam'
]

/** What the boot-time probe learned about a store. Absent key = still pending. */
export type SignInProbeOutcome = 'healthy' | 'expired' | 'unknown'

export type SignInProbeOutcomeMap = Partial<
  Record<SignInStore, SignInProbeOutcome>
>

export type SignInState = 'connected' | 'not-connected' | 'expired' | 'unknown'

export interface SignInSelectorInput {
  loggedIn: boolean
  expiredFlag: boolean
  outcome: SignInProbeOutcome | undefined
}

export type SignInSelectorInputs = Record<SignInStore, SignInSelectorInput>

export function resolveSignInState(input: SignInSelectorInput): SignInState {
  // Branch 1: a latched expiry flag. FIRST, so it beats a pending, unknown,
  // denied or offline probe AND beats `loggedIn: false` (see header).
  if (input.expiredFlag) {
    return 'expired'
  }

  // Branch 2: no session at all. Needs no probe.
  if (!input.loggedIn) {
    return 'not-connected'
  }

  // Branch 3: logged in, not flagged, and the probe says the session works.
  if (input.outcome === 'healthy') {
    return 'connected'
  }

  // Branch 4: logged in but unproven -- pending, unknown, or an `expired`
  // outcome that never latched. Surfaces nothing (D-07).
  return 'unknown'
}

export function resolveSignInStates(
  inputs: SignInSelectorInputs
): Record<SignInStore, SignInState> {
  const states = {} as Record<SignInStore, SignInState>
  for (const store of SIGN_IN_STORES) {
    states[store] = resolveSignInState(inputs[store])
  }
  return states
}

/**
 * Exact-membership allow-list for any untrusted store id (the `?open=` query
 * parameter, a persisted dismissed set). Deliberately a linear scan over the
 * list: no `in` operator and no object-key lookup, so `__proto__` and
 * `constructor` cannot pass (T-49-01).
 */
export function parseSignInStore(value: unknown): SignInStore | null {
  if (typeof value !== 'string') {
    return null
  }
  for (const store of SIGN_IN_STORES) {
    if (store === value) {
      return store
    }
  }
  return null
}

const SIGN_IN_PROBE_OUTCOMES: readonly SignInProbeOutcome[] = [
  'healthy',
  'expired',
  'unknown'
]

/**
 * Keeps only known store keys whose value is one of the three outcomes.
 * Anything else -- including a non-object -- is dropped.
 */
export function sanitizeSignInProbeOutcomeMap(
  value: unknown
): SignInProbeOutcomeMap {
  const result: SignInProbeOutcomeMap = {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return result
  }
  const record = value as Record<string, unknown>
  for (const store of SIGN_IN_STORES) {
    if (!Object.prototype.hasOwnProperty.call(record, store)) {
      continue
    }
    const outcome = record[store]
    for (const known of SIGN_IN_PROBE_OUTCOMES) {
      if (known === outcome) {
        result[store] = known
      }
    }
  }
  return result
}
