/**
 * Phase 51 Plan 07 -- ROADMAP sub-decision 2 / D-51-07: the single routing
 * brain. `resolveBridgeRoute` is a PURE function from (platform eligibility,
 * seed membership, known-bad reason, persisted verdict, session failure,
 * Win64-shim presence) to a `SteamBridgeRouteVerdict` -- the composed
 * eligibility is "seed UNION persisted scan verdict MINUS known-bad MINUS
 * forced-bottle MINUS failed-this-session", computed here and ONLY here.
 * 51-09's `games.ts` is the sole place that assembles this function's input
 * (reading the persisted per-appId metadata cache, the allowlist, the
 * session-scoped failure set, etc.) and the sole place that persists/
 * exposes the result over IPC; this module never touches a store.
 *
 * D-17 pin (games.ts's `isBridgeEligible()`, carried forward unchanged): this
 * resolver composes ONLY the platform-derived eligibility passed in as
 * `platformsBottleEligible` -- it never reads (or has a field for) the D-17
 * persisted "forced Windows via bottle" verdict, which belongs to a
 * DIFFERENT bottle root (the Phase 17 `GameLibSteam` bottle, not the Phase
 * 24 `GameLibSteamBridge` bottle). Widening this composition to that forced
 * verdict would resolve a route into a bottle that was never written to --
 * the exact defect `isBridgeEligible()`'s own doc comment (games.ts)
 * already warns against for its narrower composition. See this module's
 * own test suite for the explicit prohibition assertion.
 */

import type { SteamBridgeVerdict } from '../electronStores'
import type {
  SteamBridgeKnownBadReason,
  SteamBridgeRouteReason,
  SteamBridgeRouteVerdict
} from 'common/types/steam'
import { isScanVerdictNowCovered } from './shimCoverage'

/** D-51-08/11/13: the subset of `SteamBridgeRouteReason` values whose
 * landing requires a one-time notice before the user proceeds (D-51-08's
 * `noticeAcknowledgedFor` clears it). Exported for 51-16's dialog/notice
 * wiring and for this module's own tests. */
export const NOTICE_REASONS: ReadonlySet<SteamBridgeRouteReason> = new Set([
  'known-bad',
  'scan-miss',
  'win64-no-shim'
])

/** Every input `resolveBridgeRoute` needs to compose a route -- deliberately
 * flat (no store access, no async) so 51-09's `games.ts` can assemble it
 * from whatever reads it needs and call this function as a last step. */
export interface BridgeRouteInput {
  /** The platform-derived bottle-eligibility verdict (games.ts's
   * `isBottleEligibleFromPlatforms()`) -- NEVER the D-17-widened
   * `isBottleEligible()`. See this module's doc comment. */
  platformsBottleEligible: boolean
  /** True when this title is present in the bundled seed allowlist with no
   * scan yet (bridgeAllowlist.has, 51-03). */
  isSeed: boolean
  /** D-51-08: the bundled known-bad list's reason for this title, or `null`
   * when it does not match. */
  knownBadReason: SteamBridgeKnownBadReason | null
  /** The persisted `SteamBridgeVerdict` for this title (51-03's
   * `electronStores.ts` shape), or `undefined` when never persisted. */
  verdict: SteamBridgeVerdict | undefined
  /** games.ts's module-scoped `bridgeFailedThisSession` circuit breaker. */
  failedThisSession: boolean
  /** Whether a Win64 shim target exists at all (D-51-13 -- false until
   * 51-15 ships one). */
  win64ShimPresent: boolean
}

function isAcknowledged(
  verdict: SteamBridgeVerdict | undefined,
  reason: SteamBridgeRouteReason
): boolean {
  return verdict?.noticeAcknowledgedFor === reason
}

/**
 * D-51-07/08/10/11/13: the single pure resolver every later Phase 51 plan's
 * routing input flows through. Precedence is FIRST MATCH WINS, in the exact
 * order below (see this module's test suite -- one test per row):
 *
 *  1. `!platformsBottleEligible` -> `not-eligible` / null reason.
 *  2. `failedThisSession` -> bottle / 'failed-this-session'.
 *  3. `verdict.userRoute === 'bottle'` -> bottle / 'user-forced-bottle'
 *     (D-51-10).
 *  4. A known-bad match (and the user has not overridden to 'bridge') ->
 *     bottle / 'known-bad', notice required unless already acknowledged
 *     for 'known-bad' (D-51-08).
 *  5. A persisted scan miss not yet auto-cleared (and the user has not
 *     overridden to 'bridge') -> bottle / 'scan-miss', notice required
 *     unless already acknowledged for 'scan-miss' (D-51-11 offers the
 *     override).
 *  6. An x64 title with no Win64 shim target -> bottle / 'win64-no-shim',
 *     fail-closed (D-51-13), notice required unless acknowledged. This row
 *     is checked BEFORE row 7 so the fail-closed default can never be
 *     bypassed by a forced-bridge override.
 *  7. `verdict.userRoute === 'bridge'` -> bridge / 'user-forced-bridge'
 *     (D-51-11).
 *  8. Seed membership -> bridge / 'seed'.
 *  9. The title ships no `steam_api*.dll` at all -> bridge / 'no-steam-api'.
 *  10/11. A clean scan -> bridge / 'scan-clean'; anything else reaching this
 *     point (never scanned, or a stale miss D-51-07 just auto-cleared) ->
 *     bridge / 'pending-scan'.
 *
 * `stubbedInterfaces`/`identityFallback`/`userRoute` are always copied
 * verbatim from the persisted verdict (or their empty/null defaults) on
 * every returned result, not just specific rows -- they describe the
 * composed verdict generally, not a single routing decision.
 * `installedIn` is always `null` here (see `SteamBridgeRouteVerdict`'s own
 * doc comment: only 51-09's backend read fills it in).
 */
export function resolveBridgeRoute(
  input: BridgeRouteInput
): SteamBridgeRouteVerdict {
  const {
    platformsBottleEligible,
    isSeed,
    knownBadReason,
    verdict,
    failedThisSession,
    win64ShimPresent
  } = input

  const shared = {
    // D-51-02: stubbedInterfaces lives on the persisted SCAN sub-object
    // (SteamBridgeScanVerdict), not as a top-level SteamBridgeVerdict
    // field -- there is no scan-independent notion of "served as a stub".
    stubbedInterfaces: verdict?.scan?.stubbedInterfaces ?? [],
    identityFallback: verdict?.identityFallback ?? false,
    userRoute: verdict?.userRoute ?? null,
    installedIn: null as 'bridge' | 'bottle' | null
  }

  const toBottle = (
    reason: SteamBridgeRouteReason,
    extra?: {
      knownBadReason?: SteamBridgeKnownBadReason | null
      missingSymbols?: string[]
      noticeRequired?: boolean
    }
  ): SteamBridgeRouteVerdict => ({
    route: 'bottle',
    reason,
    knownBadReason: extra?.knownBadReason ?? null,
    missingSymbols: extra?.missingSymbols ?? [],
    noticeRequired: extra?.noticeRequired ?? false,
    ...shared
  })

  const toBridge = (
    reason: SteamBridgeRouteReason
  ): SteamBridgeRouteVerdict => ({
    route: 'bridge',
    reason,
    knownBadReason: null,
    missingSymbols: [],
    noticeRequired: false,
    ...shared
  })

  // 1. Platform eligibility gates everything else.
  if (!platformsBottleEligible) {
    return {
      route: 'not-eligible',
      reason: null,
      knownBadReason: null,
      missingSymbols: [],
      noticeRequired: false,
      ...shared
    }
  }

  // 2. The session-scoped circuit breaker.
  if (failedThisSession) {
    return toBottle('failed-this-session')
  }

  // 3. D-51-10's explicit "use bottled Steam" toggle.
  if (verdict?.userRoute === 'bottle') {
    return toBottle('user-forced-bottle')
  }

  // 4. D-51-08's bundled known-bad list, unless the user has overridden to
  // 'bridge' (D-51-11's "Try the bridge anyway").
  if (knownBadReason !== null && verdict?.userRoute !== 'bridge') {
    return toBottle('known-bad', {
      knownBadReason,
      noticeRequired: !isAcknowledged(verdict, 'known-bad')
    })
  }

  // 5. A persisted scan miss, unless D-51-07's auto-clear now covers it, or
  // the user has overridden to 'bridge'.
  const scan = verdict?.scan
  if (
    scan?.status === 'miss' &&
    !isScanVerdictNowCovered(scan) &&
    verdict?.userRoute !== 'bridge'
  ) {
    return toBottle('scan-miss', {
      missingSymbols: scan.missingSymbols,
      noticeRequired: !isAcknowledged(verdict, 'scan-miss')
    })
  }

  // 6. D-51-13 fail-closed: an x64 title with no Win64 shim target. Checked
  // BEFORE row 7 (user-forced-bridge) so this default can never be
  // bypassed by the override.
  const isX64 = verdict?.steamApi === 'x64' || scan?.arch === 'x64'
  if (isX64 && !win64ShimPresent) {
    return toBottle('win64-no-shim', {
      noticeRequired: !isAcknowledged(verdict, 'win64-no-shim')
    })
  }

  // 7. D-51-11's "Try the bridge anyway" override.
  if (verdict?.userRoute === 'bridge') {
    return toBridge('user-forced-bridge')
  }

  // 8. Bundled seed list membership, never scanned yet.
  if (isSeed) {
    return toBridge('seed')
  }

  // 9. No steam_api*.dll import at all -- nothing for the bridge to serve,
  // so there is nothing for it to miss either.
  if (verdict?.steamApi === 'none') {
    return toBridge('no-steam-api')
  }

  // 10. A clean scan.
  if (scan?.status === 'clean') {
    return toBridge('scan-clean')
  }

  // 11. Otherwise: never scanned, or a stale miss D-51-07's auto-clear just
  // cleared (the only way a 'miss' scan can reach this far without having
  // returned at row 5 above).
  return toBridge('pending-scan')
}
