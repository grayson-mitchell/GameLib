import type {
  SteamBridgeKnownBadReason,
  SteamBridgeRouteReason,
  SteamBridgeRouteVerdict
} from 'common/types/steam'

/**
 * Phase 51, Plan 16 -- D-51-09's install-dialog wine-section route line
 * ("Native Steam bridge" / "Bottled Steam client" + reason) and D-51-10's
 * force-bottled-Steam toggle, as a standalone, zero-React-import pure
 * module.
 *
 * WHY this is a standalone module rather than logic inlined into
 * `SteamDialog/index.tsx`: this repo's Frontend jest project has no jsdom
 * and no react-test-renderer (`src/frontend/jest.config.js`'s own
 * docstring), and `InstallModal/index.tsx` imports `./index.scss` as its
 * very first line, so any test importing anything -- even a named, pure
 * export -- from that tree dies at that import before the first assertion
 * runs. This mirrors `steamSectionGating.ts` / `steamPlatformRow.ts`'s own
 * extraction pattern exactly, and their rule (e): `SteamDialog/index.tsx` is
 * this module's ONLY intended consumer and may never re-derive this logic
 * in a local if/else chain.
 */

interface SteamBridgeRouteLine {
  visible: boolean
  routeKey: 'native' | 'bottled'
  reasonKey: string | null
  reasonParams: Record<string, string>
  missingSymbols: string[]
  showForceBottleToggle: boolean
  forceBottleChecked: boolean
}

// Shared by `bridgeRouteDisplay.ts` (the game-page sibling) -- kept as its
// own small, duplicated map in EACH pure module rather than a shared import,
// the same "zero/near-zero imports" discipline `steamSectionGating.ts` and
// `steamPlatformRow.ts` each hold independently. Every key already exists in
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

const HIDDEN_LINE: SteamBridgeRouteLine = {
  visible: false,
  routeKey: 'bottled',
  reasonKey: null,
  reasonParams: {},
  missingSymbols: [],
  showForceBottleToggle: false,
  forceBottleChecked: false
}

/**
 * The executable form of D-51-09/D-51-10's install-dialog route line.
 * `wineSectionVisible` is `SteamSectionGatingVerdict.wineSection`, passed
 * through verbatim by the caller -- this module never re-derives it.
 */
export function resolveBridgeRouteLine(
  verdict: SteamBridgeRouteVerdict | undefined,
  wineSectionVisible: boolean
): SteamBridgeRouteLine {
  if (!verdict || verdict.route === 'not-eligible' || !wineSectionVisible) {
    return HIDDEN_LINE
  }

  const routeKey: 'native' | 'bottled' =
    verdict.route === 'bridge' ? 'native' : 'bottled'

  const reasonKey = verdict.reason ? REASON_KEYS[verdict.reason] : null

  const reasonParams: Record<string, string> =
    verdict.reason === 'known-bad' && verdict.knownBadReason
      ? { reasonKey: KNOWN_BAD_KEYS[verdict.knownBadReason] }
      : {}

  // D-51-10: the toggle offers no override for a known-bad route (the
  // acknowledgement lives in D-51-08's up-front notice instead) or for
  // D-51-13's win64-no-shim fail-closed default -- both are reasons no
  // bottled<->bridge toggle can fix.
  const showForceBottleToggle =
    verdict.reason !== 'known-bad' && verdict.reason !== 'win64-no-shim'

  const forceBottleChecked = verdict.userRoute === 'bottle'

  return {
    visible: true,
    routeKey,
    reasonKey,
    reasonParams,
    missingSymbols: verdict.missingSymbols,
    showForceBottleToggle,
    forceBottleChecked
  }
}

/**
 * 51-REVIEW WR-11: the force-bottled toggle no longer writes `userRoute` the
 * moment it is flipped. Flipping it then cancelling the dialog used to leave
 * the game permanently forced to the bottle, and unchecking always wrote
 * `null`, deleting a prior `'bridge'` override. The dialog now holds the
 * user's flip locally (`pendingChecked`, `null` = untouched) and sends it with
 * the Install action. These two functions are the only place that pending
 * state is interpreted (rule (e) above).
 */
export function resolveForceBottleDisplayed(
  line: Pick<SteamBridgeRouteLine, 'forceBottleChecked'>,
  pendingChecked: boolean | null
): boolean {
  return pendingChecked ?? line.forceBottleChecked
}

/**
 * What the Install action must persist for the toggle: `'unchanged'` when the
 * user never flipped it, flipped it back, or the toggle is not shown, so a
 * stored `'bridge'` override is never touched. Otherwise `'bottle'` (checked)
 * or `null` (unchecked a stored `'bottle'`). `null` is only reachable when the
 * persisted value was `'bottle'`, because `forceBottleChecked` is
 * `userRoute === 'bottle'`.
 */
export function resolveForceBottleWrite(
  line: Pick<
    SteamBridgeRouteLine,
    'forceBottleChecked' | 'showForceBottleToggle'
  >,
  pendingChecked: boolean | null
): 'bottle' | null | 'unchanged' {
  if (
    !line.showForceBottleToggle ||
    pendingChecked === null ||
    pendingChecked === line.forceBottleChecked
  ) {
    return 'unchanged'
  }
  return pendingChecked ? 'bottle' : null
}
