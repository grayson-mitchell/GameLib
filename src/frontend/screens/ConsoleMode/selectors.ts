import type { GameInfo, Runner } from 'common/types'
import { isHostNative } from 'frontend/screens/Library/filterEngine'

/**
 * The single console-grid eligibility filter used by ConsoleMode.
 *
 * REQ-37-02 / D-13: the GAP-B `!g.is_delisted` exclusion below is REMOVED.
 * It was the same forced-hide defect as the library grid's (fixed in
 * `filterEngine.isNonAvailableGame`) on a second screen: a delisted store
 * page is not the same thing as "not available", and forcing it out of the
 * console grid here left a delisted, installed game visible and launchable
 * in the library while still invisible in Console Mode.
 *
 * Match normal library: respect games hidden from the library view.
 * https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/5783
 */
export function selectConsoleGames(
  all: GameInfo[],
  hiddenGames: readonly { appName: string }[]
): GameInfo[] {
  const hiddenAppNames = new Set(hiddenGames.map((game) => game.appName))

  return all.filter(
    (g) =>
      !g.install?.is_dlc &&
      !g.thirdPartyManagedApp &&
      !hiddenAppNames.has(g.app_name)
  )
}

/**
 * Console top-bar chip filters (quick 261029-t4b): Installed, then Native,
 * then the selected store. Returns a new array in input order.
 *
 * D-t4b-1: Native is an independent toggle combining with the others.
 * D-t4b-4: nativeOnly is ignored on win32 (hasNativeBuild is always false
 * there, so a stray true would empty the grid).
 * The native rule itself is owned by filterEngine.isHostNative.
 */
export function applyConsoleChipFilters(
  games: GameInfo[],
  opts: {
    installedOnly: boolean
    nativeOnly: boolean
    store: Runner | 'all'
    hostPlatform: string
  }
): GameInfo[] {
  const nativeActive = opts.nativeOnly && opts.hostPlatform !== 'win32'
  return games
    .filter((g) => !opts.installedOnly || g.is_installed)
    .filter((g) => !nativeActive || isHostNative(g, opts.hostPlatform))
    .filter((g) => opts.store === 'all' || g.runner === opts.store)
}
