import type {
  SteamBridgeKnownBadReason,
  SteamBridgeRouteReason,
  SteamBridgeRouteVerdict
} from 'common/types/steam'

/**
 * Phase 51, Plan 16 -- D-51-09's game-page route row (next to the
 * AppleGamingWiki compatibility rating) and D-51-02's limited-features
 * lines, as a standalone, zero-React-import pure module -- the same
 * jsdom-free extraction pattern `steamBottleDefaults.ts` already uses in
 * this directory, and `steamBridgeRouteLine.ts`'s install-dialog sibling.
 *
 * `installedIn` is the one field `SteamBridgeRouteVerdict`'s own doc
 * comment calls out as backend-read-only (the pure 51-07 resolver always
 * returns `null` there): it answers "where do this game's installed bits
 * actually live", which can disagree with `route` (the CURRENT routing
 * decision a REINSTALL would take) -- e.g. a title installed via the
 * bridge before a later scan found it known-bad, or vice versa. When they
 * disagree, this module reports the INSTALLED location (what is actually
 * running) and suppresses the reason sentence rather than attaching a
 * stale explanation to a route no longer in effect.
 */

interface SteamBridgeRouteDisplay {
  visible: boolean
  routeKey: 'native' | 'bottled'
  reasonKey: string | null
  reasonParams: Record<string, string>
  missingSymbols: string[]
  limitedLineKeys: string[]
}

// Deliberately duplicated from `steamBridgeRouteLine.ts` rather than shared
// via an import -- both modules independently hold the "zero/near-zero
// imports" discipline `steamSectionGating.ts` / `steamPlatformRow.ts`
// established. Every key already exists in
// `public/locales/en/gamelib.json`'s `steam.bridge.route.reason` block
// (Phase 51 Plan 04) -- this map adds no new catalog entries.
const REASON_KEYS: Record<SteamBridgeRouteReason, string> = {
  seed: 'steam.bridge.route.reason.seed',
  'scan-clean': 'steam.bridge.route.reason.scanClean',
  'pending-scan': 'steam.bridge.route.reason.pendingScan',
  'no-steam-api': 'steam.bridge.route.reason.noSteamApi',
  'user-forced-bridge': 'steam.bridge.route.reason.userForcedBridge',
  'scan-miss': 'steam.bridge.route.reason.scanMiss',
  'known-bad': 'steam.bridge.route.reason.knownBad',
  'win64-no-shim': 'steam.bridge.route.reason.win64NoShim',
  'user-forced-bottle': 'steam.bridge.route.reason.userForcedBottle',
  'failed-this-session': 'steam.bridge.route.reason.failedThisSession'
}

// `public/locales/en/gamelib.json`'s `steam.bridge.knownBad` block (Phase 51
// Plan 04) -- already bundled, no new catalog entries.
const KNOWN_BAD_KEYS: Record<SteamBridgeKnownBadReason, string> = {
  'drm-wrapped': 'steam.bridge.knownBad.drmWrapped',
  'win64-only': 'steam.bridge.knownBad.win64Only',
  'p2p-required': 'steam.bridge.knownBad.p2pRequired',
  'does-not-run': 'steam.bridge.knownBad.doesNotRun'
}

const HIDDEN_DISPLAY: SteamBridgeRouteDisplay = {
  visible: false,
  routeKey: 'bottled',
  reasonKey: null,
  reasonParams: {},
  missingSymbols: [],
  limitedLineKeys: []
}

function resolveReasonKey(verdict: SteamBridgeRouteVerdict): string | null {
  return verdict.reason ? REASON_KEYS[verdict.reason] : null
}

function resolveReasonParams(
  verdict: SteamBridgeRouteVerdict
): Record<string, string> {
  return verdict.reason === 'known-bad' && verdict.knownBadReason
    ? { reasonKey: KNOWN_BAD_KEYS[verdict.knownBadReason] }
    : {}
}

/**
 * The executable form of D-51-09's game-page route row and D-51-02's
 * limited-features lines.
 */
export function resolveBridgeRouteDisplay(
  verdict: SteamBridgeRouteVerdict | undefined
): SteamBridgeRouteDisplay {
  if (!verdict || verdict.route === 'not-eligible') {
    return HIDDEN_DISPLAY
  }

  let routeKey: 'native' | 'bottled'
  let reasonKey: string | null
  let reasonParams: Record<string, string>

  if (verdict.installedIn === 'bridge') {
    routeKey = 'native'
    // The reason sentence explains the CURRENT route; suppress it once the
    // live route no longer agrees with where the game is actually
    // installed, rather than attaching a stale explanation to it.
    const reasonStillApplies = verdict.route === 'bridge'
    reasonKey = reasonStillApplies ? resolveReasonKey(verdict) : null
    reasonParams = reasonStillApplies ? resolveReasonParams(verdict) : {}
  } else if (verdict.installedIn === 'bottle') {
    routeKey = 'bottled'
    const reasonStillApplies = verdict.route === 'bottle'
    reasonKey = reasonStillApplies ? resolveReasonKey(verdict) : null
    reasonParams = reasonStillApplies ? resolveReasonParams(verdict) : {}
  } else {
    // Not yet installed -- nothing to disagree with, so the route and
    // reason come straight from the live verdict.
    routeKey = verdict.route === 'bridge' ? 'native' : 'bottled'
    reasonKey = resolveReasonKey(verdict)
    reasonParams = resolveReasonParams(verdict)
  }

  // D-51-02: the limited-features lines describe what is ACTUALLY running
  // today, so they are scoped to a live bridge install only -- never shown
  // for a bottle install (the full Windows Steam client has no stubbed
  // interfaces) or before anything is installed.
  const limitedLineKeys: string[] = []
  if (verdict.installedIn === 'bridge') {
    if (verdict.stubbedInterfaces.length > 0) {
      limitedLineKeys.push('steam.bridge.limited.body')
    }
    if (verdict.identityFallback) {
      limitedLineKeys.push('steam.bridge.limited.identityFallback')
    }
  }

  return {
    visible: true,
    routeKey,
    reasonKey,
    reasonParams,
    missingSymbols: verdict.missingSymbols,
    limitedLineKeys
  }
}
