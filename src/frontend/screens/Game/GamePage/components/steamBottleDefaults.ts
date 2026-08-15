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

const WINE_INSTALLATION_TYPES: ReadonlyArray<WineInstallation['type']> = [
  'wine',
  'proton',
  'crossover',
  'toolkit'
]

/**
 * Structural discriminator for "does this look like a real, usable
 * `WineInstallation`?" — 34.13-09, D-15's read half.
 *
 * Takes `unknown` rather than `WineInstallation | undefined` on purpose: the
 * value originates in `steamBottleConfigStore`, an on-disk electron-store
 * file that may hold a legacy shape or hand-edited content, so the
 * compile-time type is a claim the runtime cannot be held to — this function
 * is the runtime check that claim actually holds before the value is ever
 * seeded into the wizard.
 *
 * Deliberately does NOT reject a `type: 'toolkit'` (GPTK) engine. Engine
 * rejection is an explicitly Deferred Idea (CONTEXT.md `<deferred>`): both
 * the `provisionBottle` rejection half and the `resolveSteamBottleEngine`
 * silent-override half of the folded GPTK todo stay open, and D-16 is
 * frontend-*filter*-only. `launcher.ts`'s `checkWineBeforeLaunch` self-heal
 * is a legitimate producer of a non-CrossOver (including toolkit) persisted
 * engine — rejecting it here would throw away a correction the backend made
 * on purpose. Do not "harden" this into an allow-list narrower than the
 * four-literal `WineInstallation['type']` union without reopening that
 * deferred item explicitly.
 */
export function isUsablePersistedEngine(
  candidate: unknown
): candidate is WineInstallation {
  if (typeof candidate !== 'object' || candidate === null) return false

  const value = candidate as Record<string, unknown>

  return (
    typeof value.bin === 'string' &&
    value.bin.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.type === 'string' &&
    (WINE_INSTALLATION_TYPES as readonly string[]).includes(value.type)
  )
}

/**
 * D-15's precedence rule for seeding the guided `SteamBottleSetup` wizard:
 * a persisted wine engine (read from `steamBottleConfigStore` via
 * 34.13-07's `isSteamBottleEligible` verdict) wins **verbatim** over the
 * derived CrossOver-preferring default — this is PRECEDENCE, not a merge.
 *
 * Do NOT rewrite this as `resolveSteamBottleEngine(persistedWineVersion as
 * WineInstallation ?? configuredWine, wineVersionList)`. That form still
 * calls `.find()` against `wineVersionList` FIRST, so any detected CrossOver
 * engine wins over the persisted choice regardless of the `??` operand —
 * silently discarding the very value D-15 exists to honour. The persisted
 * value must be checked and returned BEFORE `resolveSteamBottleEngine` is
 * ever consulted.
 *
 * The persisted value is authoritative, not merely an echo of a previous
 * derivation: `launcher.ts`'s `checkWineBeforeLaunch` self-heal calls
 * `persistBottleWineVersion` after correcting a broken engine at real launch
 * time, so a persisted value already sitting in the store may be a
 * correction the backend made — re-deriving over it would throw that
 * correction away.
 *
 * The absent branch DELEGATES to `resolveSteamBottleEngine` rather than
 * re-implementing it, so Phase 17-06's CrossOver-over-global-Wine preference
 * has exactly one definition.
 */
export function resolveSteamBottleSeedEngine(
  persistedWineVersion: unknown,
  configuredWine: WineInstallation | undefined,
  wineVersionList: WineInstallation[]
): WineInstallation | undefined {
  if (isUsablePersistedEngine(persistedWineVersion)) {
    return persistedWineVersion
  }
  return resolveSteamBottleEngine(configuredWine, wineVersionList)
}
