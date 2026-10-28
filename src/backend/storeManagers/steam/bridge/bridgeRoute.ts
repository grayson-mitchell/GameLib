/**
 * Phase 51 Plan 07 -- ROADMAP sub-decision 2 / D-51-07: the single routing
 * brain. `resolveBridgeRoute` is a PURE function from (platform eligibility,
 * seed membership, known-bad reason, known-fix DRM, persisted verdict, session failure,
 * Win64-shim presence) to a `SteamBridgeRouteVerdict` -- the composed
 * eligibility is "seed UNION persisted scan verdict MINUS DRM-wrapped
 * known-bad MINUS forced-bottle MINUS failed-this-session", computed here and ONLY here.
 * Amended 2026-10-23 (quick 261023-oq7): a persisted scan miss is no longer
 * subtracted -- it routes to the bridge (row 7) carrying its missing symbols.
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
import { resolveBridgeMode } from './drm/steamclientLayerMode'

/** D-51-08/11/13: the subset of `SteamBridgeRouteReason` values whose
 * landing requires a one-time notice before the user proceeds (D-51-08's
 * `noticeAcknowledgedFor` clears it). 'known-bad' lands on bottle for a
 * 'drm-wrapped' title and is an informational bridge-route notice for any
 * other known-bad reason (amended 2026-10-23). 'scan-miss' is an
 * informational bridge-route notice since quick 261023-oq7, except for a
 * DRM-mode (steamclient-layer) title, which owes none (quick 261029-avh). Exported for 51-16's dialog/notice
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
  /** Quick 261027-gtd: the tier-1 known-fix `drm` value for this title
   * (games.ts reads it via `knownFixSaysCeg`), or null. 'ceg' makes the title
   * a 'drm-wrapped' known-bad exactly like a bundled match or
   * `verdict.drm === 'ceg'`, so it reaches bottled Steam before any download. */
  knownFixDrm: 'ceg' | null
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
 *  4. A 'drm-wrapped' known-bad match, bundled, curated known-fix `drm: "ceg"`
 *     (quick 261027-gtd), OR detected CEG
 *     (`verdict.drm === 'ceg'`, quick 261024-br4), and the user has not
 *     overridden to 'bridge' -> bottle / 'known-bad', notice required unless already
 *     acknowledged for 'known-bad' (D-51-08). Amended 2026-10-23: ONLY
 *     drm-wrapped routes to bottled Steam. Every other known-bad reason
 *     (does-not-run, win64-only, p2p-required) falls through rows 5-11 as
 *     if the title were not known-bad.
 *  5. An x64 title with no Win64 shim target -> bottle / 'win64-no-shim',
 *     fail-closed (D-51-13), notice required unless acknowledged. Checked
 *     BEFORE rows 6-7 so the fail-closed default can never be bypassed by a
 *     forced-bridge override. Carries any uncovered missing symbols.
 *  6. `verdict.userRoute === 'bridge'` -> bridge / 'user-forced-bridge'
 *     (D-51-11); carries the missing symbols, no notice.
 *  7. A persisted scan miss not yet auto-cleared -> bridge / 'scan-miss'
 *     with the missing symbols; notice (informational) required unless
 *     acknowledged for 'scan-miss'. Amended 2026-10-23 (quick 261023-oq7):
 *     this used to be a bottle row. It precedes seed (row 8). quick
 *     261029-avh: a scan miss on a title whose persisted scan carries
 *     drmWrapper 'steamstub' (steamclient-layer DRM mode, Phase 56 D-12)
 *     owes no notice, because DRM mode launches before any shim placement.
 *  8. Seed membership -> bridge / 'seed'.
 *  9. The title ships no `steam_api*.dll` at all -> bridge / 'no-steam-api'.
 *  10/11. A clean scan -> bridge / 'scan-clean'; anything else reaching this
 *     point (never scanned, or a stale miss D-51-07 just auto-cleared) ->
 *     bridge / 'pending-scan'.
 *
 * `knownBadReason` is carried on every row from 4 onward. On a bridge
 * outcome (rows 8-11) `noticeRequired` is true for a known-bad title unless
 * it has been acknowledged for 'known-bad' or the user forced 'bridge'
 * (the override already went through a dialog); that notice is
 * informational, the bridge is still attempted. Only row 5 can still win as
 * a bottle row for a known-bad title and keeps its own reason and notice.
 * A known-bad + scan-miss title gets ONE combined dialog (row 7) that
 * acknowledges 'scan-miss'; a later D-51-07 auto-clear drops it into rows
 * 8-11, where the known-bad notice fires once more (the situation changed).
 *
 * Amended 2026-10-23 (quick 261023-oq7): see row 7. Routing and launching a
 * miss is deliberate: static-import misses are expected to fail at load,
 * and their recorded missingSymbols drive shim widening.
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
    knownBadReason: bundledKnownBadReason,
    knownFixDrm,
    verdict,
    failedThisSession,
    win64ShimPresent
  } = input

  // Quick 261024-br4: a detected Steam CEG exe (persisted outside `scan`, so
  // it survives a shim export-set bump) IS a 'drm-wrapped' known-bad title.
  // CEG beats a bundled non-DRM reason: a title bundled as 'does-not-run'
  // must not hide a detected CEG and fall through to the bridge. A curated
  // known-fix `drm: "ceg"` is the pre-download form of the same signal
  // (quick 261027-gtd).
  const knownBadReason: SteamBridgeKnownBadReason | null =
    verdict?.drm === 'ceg' || knownFixDrm === 'ceg'
      ? 'drm-wrapped'
      : bundledKnownBadReason

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
    reason: SteamBridgeRouteReason,
    extra?: {
      knownBadReason?: SteamBridgeKnownBadReason | null
      missingSymbols?: string[]
      noticeRequired?: boolean
    }
  ): SteamBridgeRouteVerdict => ({
    route: 'bridge',
    reason,
    knownBadReason: extra?.knownBadReason ?? null,
    missingSymbols: extra?.missingSymbols ?? [],
    noticeRequired: extra?.noticeRequired ?? false,
    ...shared
  })

  // A known-bad title that stays on the bridge gets the one-time
  // informational notice, unless acknowledged or the user forced 'bridge'.
  const bridgeKnownBad = {
    knownBadReason,
    noticeRequired:
      knownBadReason !== null &&
      verdict?.userRoute !== 'bridge' &&
      !isAcknowledged(verdict, 'known-bad')
  }

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

  // 4. D-51-08's bundled known-bad list, DRM-wrapped only (amended
  // 2026-10-23), unless the user has overridden to 'bridge' (D-51-11's "Try
  // the bridge anyway"). Other reasons fall through with knownBadReason
  // carried.
  if (knownBadReason === 'drm-wrapped' && verdict?.userRoute !== 'bridge') {
    return toBottle('known-bad', {
      knownBadReason,
      noticeRequired: !isAcknowledged(verdict, 'known-bad')
    })
  }

  // A persisted scan miss that D-51-07's auto-clear does not now cover.
  const scan = verdict?.scan
  const scanMiss = scan?.status === 'miss' && !isScanVerdictNowCovered(scan)
  const missingSymbols = scanMiss ? scan.missingSymbols : []

  // 5. D-51-13 fail-closed: an x64 title with no Win64 shim target. Checked
  // BEFORE the user-forced-bridge and scan-miss rows so this default can
  // never be bypassed by the override.
  const isX64 = verdict?.steamApi === 'x64' || scan?.arch === 'x64'
  if (isX64 && !win64ShimPresent) {
    return toBottle('win64-no-shim', {
      knownBadReason,
      missingSymbols,
      noticeRequired: !isAcknowledged(verdict, 'win64-no-shim')
    })
  }

  // 6. D-51-11's "Try the bridge anyway" override (also the answer to the
  // scan-miss informational notice).
  if (verdict?.userRoute === 'bridge') {
    return toBridge('user-forced-bridge', { ...bridgeKnownBad, missingSymbols })
  }

  // 7. Amended 2026-10-23 (quick 261023-oq7): a persisted scan miss routes
  // to the BRIDGE carrying its missing symbols, behind a one-time
  // informational notice acknowledged as 'scan-miss'. Must precede seed
  // (row 8): the allowlist membership is independent of the scan. Per the
  // user, bottled Steam is a narrow fallback to eliminate. Caveat: an exe
  // whose STATIC imports the shim lacks will most likely fail at load with a
  // Windows "entry point not found" error. That is expected by design, and
  // the recorded missingSymbols drive shim widening. A `<dll>@runtime-loaded`
  // marker (51-22, CR-04) is a miss without that load-time failure, and
  // such titles may play.
  // quick 261029-avh: a title the launch path will run in steamclient-layer
  // DRM mode (Phase 56 D-12) owes no notice -- DRM mode launches before any
  // shim placement, so the shim's missing symbols (and the known-bad list's
  // non-DRM, shim-path reasons) are irrelevant to it. The rule is the launch
  // path's own resolveBridgeMode. CEG markers are passed as undefined: a CEG
  // title never reaches here (verdict.drm === 'ceg' routes to bottle at row
  // 4, and a user-forced 'bridge' returned at row 6). Routing and the persisted
  // verdict are untouched; only the notice is suppressed.
  if (scanMiss) {
    const drmMode =
      resolveBridgeMode(scan.drmWrapper, undefined) === 'steamclient-layer'
    return toBridge('scan-miss', {
      knownBadReason,
      missingSymbols,
      noticeRequired: drmMode ? false : !isAcknowledged(verdict, 'scan-miss')
    })
  }

  // 8. Bundled seed list membership, never scanned yet.
  if (isSeed) {
    return toBridge('seed', bridgeKnownBad)
  }

  // 9. No steam_api*.dll import at all -- nothing for the bridge to serve,
  // so there is nothing for it to miss either.
  if (verdict?.steamApi === 'none') {
    return toBridge('no-steam-api', bridgeKnownBad)
  }

  // 10. A clean scan.
  if (scan?.status === 'clean') {
    return toBridge('scan-clean', bridgeKnownBad)
  }

  // 11. Otherwise: never scanned, or a stale miss D-51-07's auto-clear just
  // cleared (the only way a 'miss' scan can reach this far without having
  // returned at row 5 above).
  return toBridge('pending-scan', bridgeKnownBad)
}
