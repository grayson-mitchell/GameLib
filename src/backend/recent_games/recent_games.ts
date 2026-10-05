import { GameInfo, RecentGame } from 'common/types'
import { backendEvents } from '../backend_events'
import { sendFrontendMessage } from '../ipc'
import { configStore } from 'backend/constants/key_value_stores'

const getRecentGames = async () => configStore.get('games.recent', [])

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

// Phase 48 plan 06 removed the recent-games count setting together with
// three constructs that only existed to serve it: a limit helper, a
// `limited` branch inside `getRecentGames`, and the optional parameter that
// switched the branch on. Zero callers existed, so this was dead-code removal
// and not a behaviour change (`git grep -nE 'getRecentGames\(\s*\{' -- src/`
// and `git grep -nE '\blimited\s*:' -- src/` both returned no hits). That
// limit only ever trimmed a value this module RETURNED; it never touched what
// `setRecentGames` stores, so the stored list was unbounded before and is
// unbounded now.
//
// A cap on the STORED list was considered for that phase and declined by
// operator ruling: evicting persisted play history is irreversible and
// belongs in its own change judged on its own merits. If you are looking for
// where the recent-games cap went, it is the focus row's card ceiling in
// `FocusRowStrip/focusRowSelectors.ts`, which governs what is DISPLAYED and
// is deliberately not shared with this storage path.
export { getRecentGames, addRecentGame, removeRecentGame }

// Exported only for testing purpose
// ts-prune-ignore-next
export const testingExportsRecentGames = {
  setRecentGames
}
