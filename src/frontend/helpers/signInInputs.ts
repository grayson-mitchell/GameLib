import {
  gogConfigStore,
  legendaryConfigStore,
  nileConfigStore,
  steamConfigStore
} from 'frontend/helpers/electronStores'
import type {
  SignInProbeOutcomeMap,
  SignInSelectorInputs
} from 'common/signInState'

/**
 * Phase 49 D-06 -- the renderer-side collector that feeds
 * `resolveSignInStates` (`common/signInState.ts`).
 *
 * Every renderer surface that needs a sign-in state builds its inputs here
 * and never compares a flag itself. The `loggedIn` gates are exactly the ones
 * the Manage Accounts tiles and `makeLibrary` already use, so
 * `connectedStoresParity.test.ts` stays meaningful:
 *
 *   Epic   Boolean(epicUsername)
 *   GOG    Boolean(gogUsername)
 *   Amazon Boolean(amazonUserId)
 *   Humble Boolean(humbleLoggedIn)
 *   Steam  Boolean(steamUsername)
 *
 * This module is the ONLY renderer reader of the five persisted verdict keys
 * (D-06): `legendaryConfigStore.expired`, `gogConfigStore.expired`,
 * `nileConfigStore.expired`, Humble's `expired` (carried in on `source`
 * because it already lives in `GlobalState`), and
 * `steamConfigStore.credentialsMissing`. Each is read inside
 * `collectSignInInputs` on every call, never cached: the renderer snapshot is
 * kept live by `STORE_CHANGED_CHANNEL`, and the sidecar pass writes the flags
 * BEFORE it publishes the outcome push, so a re-render after the push reads the
 * freshly written flag.
 */

// Exported on purpose ahead of its first cross-module import: plan 49-01 names
// this as the input shape later phase-49 plans build on (49-03 onward), and
// the Frontend jest project can only reach it through this helper module.
// ts-prune-ignore-next
export interface SignInInputSource {
  epicUsername?: string | null
  gogUsername?: string | null
  amazonUserId?: string | null
  humbleLoggedIn?: boolean
  humbleExpired?: boolean
  steamUsername?: string | null
}

export function collectSignInInputs(
  source: SignInInputSource,
  outcomes: SignInProbeOutcomeMap
): SignInSelectorInputs {
  return {
    legendary: {
      loggedIn: Boolean(source.epicUsername),
      expiredFlag: Boolean(legendaryConfigStore.get_nodefault('expired')),
      outcome: outcomes.legendary
    },
    gog: {
      loggedIn: Boolean(source.gogUsername),
      expiredFlag: Boolean(gogConfigStore.get_nodefault('expired')),
      outcome: outcomes.gog
    },
    nile: {
      loggedIn: Boolean(source.amazonUserId),
      expiredFlag: Boolean(nileConfigStore.get_nodefault('expired')),
      outcome: outcomes.nile
    },
    humble: {
      loggedIn: Boolean(source.humbleLoggedIn),
      expiredFlag: Boolean(source.humbleExpired),
      outcome: outcomes.humble
    },
    steam: {
      loggedIn: Boolean(source.steamUsername),
      // Read at call time, never cached: the backend latches this on a
      // routine library refresh, long after the renderer was constructed.
      expiredFlag: Boolean(
        steamConfigStore.get_nodefault('credentialsMissing')
      ),
      outcome: outcomes.steam
    }
  }
}
