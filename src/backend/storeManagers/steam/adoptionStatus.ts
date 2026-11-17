/**
 * Phase 81 D-01..D-03: what the game page asks the backend about a pending Steam adoption. The
 * frontend never derives adoption; it renders this module's answers.
 *
 * The three `answer*` functions are the sidecar handlers' bodies: the appId is renderer input
 * (T-81-27), so each re-validates it, and none of them throws.
 *
 * Exit contract: no timers or handles, no work at import.
 */
import { logWarning, LogPrefix } from 'backend/logger'
import {
  pendingAdoptionStoreFrom,
  readPendingAdoption
} from './macSteamAdoption'
import type { SteamStoresDeps } from './library/installRoot'
import type { SteamAdoptionStatus } from 'common/types/steam'

const NOT_PENDING: SteamAdoptionStatus = { pending: false, steamSignedIn: null }

/** A Steam appId argument from the renderer: one to ten digits, as the zod tuple requires. */
function isSteamAppIdArg(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,10}$/.test(value)
}

/**
 * Whether a stored, valid pending-adoption record exists for `appId`. `steamSignedIn` stays null
 * until the Rust watch feeds it (81-09 widens deps with the signed-in cache).
 */
export function getSteamAdoptionStatus(
  deps: SteamStoresDeps,
  appId: string
): SteamAdoptionStatus {
  return {
    pending:
      readPendingAdoption(appId, pendingAdoptionStoreFrom(deps)) !== undefined,
    steamSignedIn: null
  }
}

/** The `steamAdoptionStatus` handler body: a bad appId or any failure answers "not pending". */
export function answerSteamAdoptionStatus(
  deps: SteamStoresDeps,
  appId: unknown
): SteamAdoptionStatus {
  if (!isSteamAppIdArg(appId)) return { ...NOT_PENDING }
  try {
    return getSteamAdoptionStatus(deps, appId)
  } catch (err) {
    logWarning(
      [`steamAdoptionStatus failed appId=${appId}:`, err],
      LogPrefix.Steam
    )
    return { ...NOT_PENDING }
  }
}
