import { steamConfigStore } from 'frontend/helpers/electronStores'
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
 * SEQUENCING (not a decision): Epic, GOG and Amazon have no persisted expiry
 * key yet, so their `expiredFlag` is `false` here. Plan 49-03 adds an
 * `expired` key to each of those stores and plan 49-07 Task 3 adds the three
 * reads below. Do not mistake the `false` for a choice that Epic/GOG/Amazon
 * cannot expire.
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
      expiredFlag: false,
      outcome: outcomes.legendary
    },
    gog: {
      loggedIn: Boolean(source.gogUsername),
      expiredFlag: false,
      outcome: outcomes.gog
    },
    nile: {
      loggedIn: Boolean(source.amazonUserId),
      expiredFlag: false,
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
