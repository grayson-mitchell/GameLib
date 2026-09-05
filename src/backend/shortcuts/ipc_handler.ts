import { existsSync } from 'graceful-fs'
import { addListener, addHandler } from 'backend/ipc'
import i18next from 'i18next'
import {
  addNonSteamGame,
  isAddedToSteam,
  removeNonSteamGame
} from './nonesteamgame/nonesteamgame'
import { shortcutFiles } from './shortcuts/shortcuts'
import { notify } from 'backend/dialog/dialog'
import { isMac } from 'backend/constants/environment'
import { getGame } from '../utils'
import { logWarning, LogPrefix } from 'backend/logger'

addListener('addShortcut', async (event, appName, runner, fromMenu) => {
  getGame(appName, runner).addShortcuts(fromMenu)

  const body = i18next.t(
    'box.shortcuts.message',
    'Shortcuts were created on Desktop and Start Menu'
  )

  const bodyMac = i18next.t(
    'box.shortcuts.message-mac',
    'Shortcuts were created on the Applications folder'
  )

  notify({
    body: isMac ? bodyMac : body,
    title: i18next.t('box.shortcuts.title', 'Shortcuts')
  })
})

addHandler('shortcutsExists', (event, appName, runner) => {
  const { title } = getGame(appName, runner).getGameInfo()

  // Quick task 260905-mv5 (site 3, D-03): getGameInfo() can return
  // `{} as GameInfo` on a double cache miss (D-01), leaving `title`
  // undefined. Unlike sites 1/2 (a display string), this title feeds a
  // FILESYSTEM PATH component (shortcutFiles -> sanitize-filename), so a
  // synthesized fallback title here would produce a plausible-looking path
  // the app never actually wrote to. Return false and log instead of
  // fabricating one -- mirrors the sidecar's identical guard in
  // `backend/sidecar/shortcutsFlowRegistration.ts`.
  if (!title) {
    logWarning(
      `shortcutsExists: getGameInfo() returned no title for ${appName} (${runner}); skipping shortcut lookup`,
      LogPrefix.Backend
    )
    return false
  }

  const [desktopFile, menuFile] = shortcutFiles(title)

  return existsSync(desktopFile ?? '') || existsSync(menuFile ?? '')
})

addListener('removeShortcut', async (event, appName, runner) => {
  getGame(appName, runner).removeShortcuts()

  const body = i18next.t(
    'box.shortcuts.message-remove',
    'Shortcuts were removed from Desktop and Start Menu'
  )

  const bodyMac = i18next.t(
    'box.shortcuts.message-remove-mac',
    'Shortcuts were removed from the Applications folder'
  )

  notify({
    body: isMac ? bodyMac : body,
    title: i18next.t('box.shortcuts.title', 'Shortcuts Removed')
  })
})

addHandler('addToSteam', async (event, appName, runner) => {
  const game = getGame(appName, runner)
  return addNonSteamGame(game)
})

addHandler('removeFromSteam', async (event, appName, runner) => {
  const game = getGame(appName, runner)
  await removeNonSteamGame(game)
})

addHandler('isAddedToSteam', async (event, appName, runner) => {
  const game = getGame(appName, runner)
  return isAddedToSteam(game)
})
