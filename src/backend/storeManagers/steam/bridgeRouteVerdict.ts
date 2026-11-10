import { logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import type { SteamBridgeRouteVerdict } from 'common/types/steam'
import SteamGame from './games'
import type { ManagerDeps } from 'backend/services/types'
import { library } from './state'
import * as bridgeBottle from './bridgeBottle'
import { NUMERIC_APP_ID } from './gameConstants'
import {
  ensurePlatformsCaptured,
  isForcedWindowsViaBottle,
  checkBridgeRoute,
  checkBottleEligibility
} from './gameEligibility'

/**
 * Phase 51 Plan 09 (D-51-09): the backend-authoritative bridge-route read,
 * exposed over IPC by 51-13. Mirrors installFormIpc.ts's
 * getSteamBottleEligibilityVerdict's numeric/type guard exactly -- an
 * invalid appId is a REJECTED REQUEST, never a routing answer, so it fails
 * closed to 'not-eligible' rather than resolving the pure resolver's own
 * shape, which would misleadingly imply a platform check ran.
 *
 * installedIn is filled below via findBridgeInstallBottle (bottle.ts,
 * LOCATION) and checkBottleEligibility() (an existing GameLibSteam install,
 * also LOCATION) -- resolveBridgeRoute() itself never fills this field (see
 * its own doc comment); it answers eligibility only.
 *
 * quick 261107-lum (DC-4): `windowsBuildChosen` is the install dialog's
 * "Windows" platform choice for a dual-build title. It is an UNTRUSTED
 * renderer value, honoured only under the same triple gate as install():
 * `=== true` (any other type is ignored), AND macOS, AND the persisted
 * `is_windows_native === true` (read after platform capture). With no
 * argument, the choice is derived from LOCATION: a persisted forced-Windows
 * flag whose bits are proven to live in a bridge bottle, so the GamePage /
 * report-problem route display is honest for an installed forced game.
 */
export async function getBridgeRouteVerdict(
  deps: ManagerDeps,
  appId: unknown,
  windowsBuildChosen?: unknown
): Promise<SteamBridgeRouteVerdict> {
  if (typeof appId !== 'string' || !NUMERIC_APP_ID.test(appId)) {
    logWarning(
      'getBridgeRouteVerdict: rejected non-string or non-numeric appId (D-51-09)',
      LogPrefix.Steam
    )
    return {
      route: 'not-eligible',
      reason: null,
      knownBadReason: null,
      missingSymbols: [],
      noticeRequired: false,
      stubbedInterfaces: [],
      identityFallback: false,
      userRoute: null,
      installedIn: null
    }
  }

  const game = new SteamGame(appId, deps)
  let explicitChoice = false
  if (windowsBuildChosen === true && isMac) {
    // Capture first so is_windows_native is not read off a cold cache.
    await ensurePlatformsCaptured(game)
    explicitChoice =
      deps.stores.steam.steamMetadataStore.get(appId)?.is_windows_native ===
      true
  }
  const locationChoice =
    windowsBuildChosen === undefined &&
    isForcedWindowsViaBottle(game) &&
    bridgeBottle.findBridgeInstallBottle(appId) !== null
  const verdict = await checkBridgeRoute(game, {
    windowsBuildChosen: explicitChoice || locationChoice
  })

  // D-51-09 (Task 2): installedIn answers "where does THIS install's bits
  // already live" (location), never "where would a NEW install go"
  // (eligibility, verdict.route above) -- a never-scanned bottle-eligible
  // title can have verdict.route === 'bridge' (rule 11's pending-scan
  // default) while installedIn correctly stays 'bottle' for an existing
  // GameLibSteam install the widened eligibility must never claim to have
  // moved.
  let installedIn: SteamBridgeRouteVerdict['installedIn'] = null
  if (bridgeBottle.findBridgeInstallBottle(appId) !== null) {
    installedIn = 'bridge'
  } else if (
    library.get(appId)?.is_installed === true &&
    (await checkBottleEligibility(game))
  ) {
    installedIn = 'bottle'
  }

  return { ...verdict, installedIn }
}
