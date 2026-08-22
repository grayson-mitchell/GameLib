import type { GameInfo } from 'common/types'

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
