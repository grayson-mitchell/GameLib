/**
 * Eligibility cluster lifted out of SteamGame (62-06, D-06 mechanical lift:
 * this -> steamGame). Each function has a delegating stub on the class.
 */
import { existsSync } from 'graceful-fs'
import { logInfo, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { steamMetadataStore } from './stores'
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
  return !isBottleEligible(steamGame)
}

/**
 * D-11/MAC32 PLATFORM-derived half of the bottle-eligibility verdict —
 * true only for a CONFIRMED not-native macOS game. Split from
 * `isBottleEligible()` below by 34.13-14 so the Phase 24 bridge
 * (`isBridgeEligible()`) can compose ONLY this platform signal and never
 * the D-17 forced verdict (see `isBottleEligible()`'s own doc comment for
 * why). Body is byte-identical to the pre-34.13-14 `isBottleEligible()`.
 */
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

/**
 * D-17 (34.13-14) durability half of the bottle-eligibility verdict — true
 * only when a PRIOR install actually committed bits to the Phase 17
 * bottle via the D-17 override (34.13-06's `forceWindowsViaBottle`) and
 * that verdict was persisted (`markForcedWindowsViaBottle`,
 * `fetchMetadataIfNeeded`'s carry-forward). `=== true` strict equality
 * only — an absent or explicit-`false` field never re-routes. The `isMac`
 * guard here is independent of `isBottleEligible()`'s own (not merely
 * redundant with it): this method is reached on its own by the wrapper
 * below, and D-18 means a renderer-era flag must never resurrect a bottle
 * path on a host with no bottle at all.
 */
export function isForcedWindowsViaBottle(steamGame: SteamGame): boolean {
  return (
    isMac &&
    steamMetadataStore.get(steamGame.appId)?.forcedWindowsViaBottle === true
  )
}

export function isBottleEligible(steamGame: SteamGame): boolean {
  return (
    isBottleEligibleFromPlatforms(steamGame) ||
    isForcedWindowsViaBottle(steamGame)
  )
}

/**
 * Phase 51 Plan 09 (D-51-07/09): the SOLE input assembler for
 * `resolveBridgeRoute()` (bridgeRoute.ts) — the only place in this file
 * allowed to call `bridgeAllowlist.has` with an appId (assumption_delta_decision,
 * acceptance-counted at exactly one call-site occurrence). Every other routing
 * decision in this file goes through `bridgeRoute()` below instead of a
 * second direct allowlist/verdict read.
 *
 * D-17 (34.13-14) pin, carried forward unchanged: `platformsBottleEligible`
 * reads `isBottleEligibleFromPlatforms()`, NEVER the widened
 * `isBottleEligible()` / the D-17 forced-verdict wrapper — see
 * `bridgeRoute.ts`'s own doc comment for why widening this would resolve a
 * route into a bottle (`GameLibSteamBridge`) that a D-17 forced install
 * never wrote a single byte into (that install went to `GameLibSteam`).
 */
export function assembleBridgeRouteInput(
  steamGame: SteamGame
): BridgeRouteInput {
  return {
    platformsBottleEligible: isBottleEligibleFromPlatforms(steamGame),
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

/**
 * D-51-07: the single routing read for this appId. `resolveBridgeRoute()`
 * is a pure function (bridgeRoute.ts) — this method is the sole place in
 * games.ts that assembles its input and calls it.
 */
export function bridgeRoute(steamGame: SteamGame): SteamBridgeRouteVerdict {
  return resolveBridgeRoute(assembleBridgeRouteInput(steamGame))
}

export async function checkBridgeRoute(
  steamGame: SteamGame
): Promise<SteamBridgeRouteVerdict> {
  await ensurePlatformsCaptured(steamGame)
  return bridgeRoute(steamGame)
}

export function isBridgeEligible(steamGame: SteamGame): boolean {
  return bridgeRoute(steamGame).route === 'bridge'
}

/**
 * D-51-07: auto-clears a persisted scan-miss the moment the currently
 * shipped shim is proven to cover every symbol it used to miss —
 * `isScanVerdictNowCovered()` (shimCoverage.ts) decides "now covered"
 * against the CURRENT exported-symbol/served-interface tables, never a
 * re-scan. No-op when there is no persisted miss, or the miss still isn't
 * covered — `clearBridgeScanVerdict()` itself already no-ops on
 * nothing-to-clear (bridgeVerdict.ts), so this can never fabricate a
 * metadata entry.
 */
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
  await ensurePlatformsCaptured(steamGame)
  return isBottleEligible(steamGame)
}

/**
 * Phase 17 Plan 09 (MACSTEAM-04 gap closure): forces platform data to be
 * resolved BEFORE install()/launch()/uninstall() consult isBottleEligible(),
 * decoupling bottle routing from the async fetchMetadataIfNeeded race
 * (.planning/debug/steam-bottle-guided-setup-never-fires.md). Previously,
 * isBottleEligible() only saw fresh platform data if the fire-and-forget
 * lazy fetch (triggered by getGameInfo()) had already completed by the time
 * the user clicked Install/Play — a cold cache or a slow/failed fetch left
 * platformsCaptured false, silently routing a Windows-only macOS game down
 * the native steam:// path with no guided-setup dialog.
 *
 * No-op on non-macOS (native steam:// delegation is unaffected) and when
 * this appId's platforms are already captured (no redundant network on the
 * hot path).
 *
 * getGameInfo() call below re-triggers the SAME lazy fetch as a fire-and-forget
 * side effect (adding this.appId to pendingFetches synchronously). Our own
 * explicit fetchMetadataIfNeeded() call then hits the T-2-03 dedup guard and
 * returns immediately without a second network request — so we fall into the
 * bounded poll below and wait for that single in-flight fetch to resolve
 * platformsCaptured, rather than hoping it finishes before routing happens.
 */
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
