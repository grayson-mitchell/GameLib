import { WineInstallation } from 'common/types'

/**
 * Phase 17 (17-06 UAT fix): defaults for the guided Steam-bottle setup wizard.
 *
 * Kept as pure functions (no React / no heavy frontend imports) so they can be
 * unit-tested without jsdom — mirroring the store-level testing approach the
 * rest of 17-06 uses.
 */

/**
 * Frontend mirror of the backend `DEFAULT_STEAM_BOTTLE_NAME`
 * (src/backend/storeManagers/steam/constants.ts). The Windows Steam client is
 * ALWAYS installed into its own DEDICATED CrossOver bottle — never the user's
 * shared GOG/Epic bottle (`wineCrossoverBottle`). Conflating the two would
 * install a multi-GB Steam client into the shared bottle, which the 17-02
 * "distinct dedicated bottle" requirement explicitly forbids.
 */
export const DEFAULT_STEAM_BOTTLE_NAME = 'GameLibSteam'

/**
 * Pick the default compatibility engine for the Steam bottle.
 *
 * The bottle is created via CrossOver's `cxbottle` (17-01 LOCKED mechanism,
 * 17-04 `provisionBottle`), so a CrossOver engine is the correct default even
 * when the user's globally-configured engine is plain Wine. Prefer the first
 * CrossOver-type engine from the detected list; fall back to the user's
 * configured engine only when no CrossOver engine is available.
 */
export function resolveSteamBottleEngine(
  configuredWine: WineInstallation | undefined,
  wineVersionList: WineInstallation[]
): WineInstallation | undefined {
  return (
    wineVersionList.find((wine) => wine.type === 'crossover') ?? configuredWine
  )
}
