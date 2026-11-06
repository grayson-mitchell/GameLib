/**
 * Eligibility cluster lifted out of SteamGame (62-06, D-06 mechanical lift:
 * this -> steamGame). Each function has a delegating stub on the class.
 */
import { existsSync } from 'graceful-fs'
import { logInfo, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { steamMetadataStore } from './electronStores'
import { seedMacArchFromKnownFix } from './macArchKnownFix'
import { knownFixSaysCeg } from './drmKnownFix'
import { pendingFetches, METADATA_FETCH_TIMEOUT_MS } from './state'
// Phase 24 Plan 08 (R4/R7): allowlist-based bridge-vs-fallback routing.
import { bridgeAllowlist } from './bridge/allowlist'
// Phase 51 Plan 09 (D-51-07/09): the pure routing resolver + the persisted
// verdict read/clear family + the current-shim coverage check. games.ts is
// the sole assembler of resolveBridgeRoute's input and the sole writer of
// the persisted verdict (bridgeRoute.ts's own header).
import { resolveBridgeRoute, type BridgeRouteInput } from './bridge/bridgeRoute'
import {
  readBridgeVerdict,
  clearBridgeScanVerdict
} from './bridge/bridgeVerdict'
import { isScanVerdictNowCovered } from './bridge/shimCoverage'
import { builtBridgeShim64Path } from 'backend/constants/paths'
import type { SteamBridgeRouteVerdict } from 'common/types/steam'
import { bridgeFailedThisSession } from './gameSessionState'
import type SteamGame from './games'

export function isNative(steamGame: SteamGame): boolean {
  return !steamGame.isBottleEligible()
}

export function isBottleEligibleFromPlatforms(steamGame: SteamGame): boolean {
  if (!isMac) return false
  const meta = steamMetadataStore.get(steamGame.appId)
  // MAC32-02: a confirmed-32-bit mac build is bottle-eligible independent of
  // is_mac_native/platformsCaptured — a confirmed-32 game reports
  // is_mac_native true (it DOES have a mac depot, just not a runnable one on
  // modern macOS). Pre-install the min-OS heuristic (games.ts macArchFromMinOS)
  // NEVER yields '32', so this branch fires from Plan 18-03's post-install
  // Mach-O ground-truth check, or from a curated known-fix macArch "32" seed
  // on Apple silicon (macArchKnownFix.ts, quick 261027-bqe).
  if (meta?.mac_arch === '32') return true
  // Quick task 260816-hdg PIN — this gate deliberately keeps the raw read and
  // must NOT be routed through depotSignalCaptured. It asks the MAC question,
  // which a pre-D-17 residue entry genuinely did answer; narrowing here would
  // de-route bottle-eligible games over a fact already in the cache. A source
  // assertion in metadataCapture.test.ts holds this line in place.
  return meta?.platformsCaptured === true && meta?.is_mac_native === false
}

export function isForcedWindowsViaBottle(steamGame: SteamGame): boolean {
  return (
    isMac &&
    steamMetadataStore.get(steamGame.appId)?.forcedWindowsViaBottle === true
  )
}

export function isBottleEligible(steamGame: SteamGame): boolean {
  return (
    steamGame.isBottleEligibleFromPlatforms() ||
    steamGame.isForcedWindowsViaBottle()
  )
}

export function assembleBridgeRouteInput(
  steamGame: SteamGame
): BridgeRouteInput {
  return {
    platformsBottleEligible: steamGame.isBottleEligibleFromPlatforms(),
    isSeed: bridgeAllowlist.has(steamGame.appId),
    // `?? null`: bridgeAllowlist.knownBadReason's own contract already
    // returns `null` for "no match", but this coerces any other falsy
    // read (e.g. a test double that returns undefined) to the same
    // not-known-bad default resolveBridgeRoute's `!== null` check needs.
    knownBadReason: bridgeAllowlist.knownBadReason(steamGame.appId) ?? null,
    // quick 261027-gtd: curated known-fix drm "ceg" is a pre-download drm-wrapped signal.
    knownFixDrm: knownFixSaysCeg(steamGame.appId) ? 'ceg' : null,
    verdict: readBridgeVerdict(steamGame.appId),
    failedThisSession: bridgeFailedThisSession.has(steamGame.appId),
    win64ShimPresent: existsSync(builtBridgeShim64Path)
  }
}

export function bridgeRoute(steamGame: SteamGame): SteamBridgeRouteVerdict {
  return resolveBridgeRoute(steamGame.assembleBridgeRouteInput())
}

export async function checkBridgeRoute(
  steamGame: SteamGame
): Promise<SteamBridgeRouteVerdict> {
  await steamGame.ensurePlatformsCaptured()
  return steamGame.bridgeRoute()
}

export function isBridgeEligible(steamGame: SteamGame): boolean {
  return steamGame.bridgeRoute().route === 'bridge'
}

export function clearStaleBridgeVerdict(steamGame: SteamGame): void {
  const verdict = readBridgeVerdict(steamGame.appId)
  const scan = verdict?.scan
  if (scan?.status === 'miss' && isScanVerdictNowCovered(scan)) {
    clearBridgeScanVerdict(steamGame.appId)
    logInfo(
      `SteamGame: appId ${steamGame.appId} — bridge verdict auto-cleared (D-51-07), the current shim now covers: ${scan.missingSymbols.join(', ')}`,
      LogPrefix.Steam
    )
  }
}

export async function checkBottleEligibility(
  steamGame: SteamGame
): Promise<boolean> {
  await steamGame.ensurePlatformsCaptured()
  return steamGame.isBottleEligible()
}

export async function ensurePlatformsCaptured(
  steamGame: SteamGame
): Promise<void> {
  if (!isMac) return

  // quick 261027-bqe: seed a curated macArch "32" BEFORE any caller consults
  // isBottleEligible(), above the alreadyCaptured early return below.
  seedMacArchFromKnownFix(steamGame.appId)

  // Quick task 260816-hdg PIN — the FOURTH read site, and the one that stays
  // RAW. Three reasons, all load-bearing:
  //  1. Its only consumer is checkBottleEligibility() -> isBottleEligible(),
  //     which asks the MAC question. A pre-D-17 residue entry genuinely
  //     captured its mac answer, so this early return is answering from real
  //     data, not from a stale claim.
  //  2. Narrowing it would push every residue game through the bounded
  //     METADATA_FETCH_TIMEOUT_MS poll below, on the install/launch hot path,
  //     for a fact the cache already holds.
  //  3. Convergence does not depend on it. getGameInfo()'s normalized
  //     self-heal gate fires the refetch on library render, and until that
  //     lands installFormIpc reports the depot signal as not-captured, which
  //     is exactly what lets Phase 34.14's D-04 fail-open offer Windows. The
  //     install form is correct DURING the window and correct after it.
  // A source assertion in metadataCapture.test.ts holds this line in place.
  const alreadyCaptured = (): boolean =>
    steamMetadataStore.get(steamGame.appId)?.platformsCaptured === true

  if (alreadyCaptured()) return

  await steamGame.fetchMetadataIfNeeded(steamGame.getGameInfo())

  // Bounded poll for the T-2-03 dedup race: fetchMetadataIfNeeded() may have
  // early-returned because a concurrent fetch (the getGameInfo() side effect
  // above, or an earlier render's lazy fetch) is already in flight for this
  // appId. Wait for it to resolve platformsCaptured, drain from
  // pendingFetches, or hit METADATA_FETCH_TIMEOUT_MS — whichever first, so
  // install()/launch()/uninstall() can never hang indefinitely (T-17-09-01).
  if (!alreadyCaptured() && pendingFetches.has(steamGame.appId)) {
    const deadline = Date.now() + METADATA_FETCH_TIMEOUT_MS
    while (
      !alreadyCaptured() &&
      pendingFetches.has(steamGame.appId) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
