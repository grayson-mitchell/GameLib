/**
 * Curated `drm: "ceg"` known-fix hint for Steam titles (quick 261027-gtd,
 * evidence spike 045).
 *
 * Feeds `BridgeRouteInput.knownFixDrm` from games.ts
 * `assembleBridgeRouteInput()` so the pure resolver never reads a file. Not
 * platform-gated: CEG needs Windows Steam on every host where the bridge route
 * exists, and `platformsBottleEligible` already gates row 1.
 *
 * MUST NOT import games.ts or library.ts (import cycle).
 */

import { readKnownFixes } from 'backend/knownFixes'
import { logWarning, LogPrefix } from 'backend/logger'

/** True when the title's known fix says `drm: "ceg"`. Never throws. */
export function knownFixSaysCeg(appId: string): boolean {
  try {
    return readKnownFixes(appId, 'steam')?.drm === 'ceg'
  } catch (error) {
    logWarning(
      `Steam: could not read known fixes for appId ${appId} while checking drm: ${String(error)}`,
      LogPrefix.Steam
    )
    return false
  }
}
