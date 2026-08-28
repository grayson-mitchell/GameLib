import { GameInfo, RecentGame } from 'common/types'
import { backendEvents } from '../backend_events'
import { sendFrontendMessage } from '../ipc'
import { GlobalConfig } from '../config'
import { configStore } from 'backend/constants/key_value_stores'

const maxRecentGames = async () => {
  const { maxRecentGames } = GlobalConfig.get().getSettings()
  return maxRecentGames || 5
}

const getRecentGames = async (options?: { limited: boolean }) => {
  const games = configStore.get('games.recent', [])
  if (options?.limited) {
    return games.slice(0, await maxRecentGames())
  } else {
    return games
  }
}

const setRecentGames = (recentGames: RecentGame[]) => {
  // store
  configStore.set('games.recent', recentGames)

  // emit
  sendFrontendMessage('recentGamesChanged', recentGames)
  backendEvents.emit('recentGamesChanged', recentGames)
}

const addRecentGame = async (game: GameInfo) => {
  const games = await getRecentGames()

  // update list
  const updatedList = games.filter(
    (a) => a.appName && a.appName !== game.app_name
  )
  // `runner` is carried through rather than discarded (Phase 35 plan 06). It was
  // always available -- `game` is a `GameInfo`, where `runner` is REQUIRED -- and
  // dropping it forced any consumer that needed it (the Tauri tray's recent-game
  // launch) to reconstruct the value by probing up to six store managers for a
  // value this line already had. Entries written before this change carry no
  // runner; consumers must treat it as optional. See `RecentGame` in
  // `common/types.ts` for the full note.
  updatedList.unshift({
    appName: game.app_name,
    title: game.title,
    runner: game.runner
  })
  setRecentGames(updatedList)
}

const removeRecentGame = async (appName: string) => {
  const games = await getRecentGames()

  if (games.length) {
    const updatedList = games.filter((a) => a.appName && a.appName !== appName)
    setRecentGames(updatedList)
  }
}

export { getRecentGames, addRecentGame, removeRecentGame, maxRecentGames }

// Exported only for testing purpose
// ts-prune-ignore-next
export const testingExportsRecentGames = {
  setRecentGames
}
