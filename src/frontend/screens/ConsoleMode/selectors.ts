import type { GameInfo } from 'common/types'

/**
 * The single console-grid eligibility filter used by ConsoleMode.
 *
 * GAP-B: exclude delisted Steam games from the grid (and, transitively, from
 * storesWithGames/storeFilters — the Steam chip hides if all Steam games are delisted).
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
      !g.is_delisted &&
      !hiddenAppNames.has(g.app_name)
  )
}
