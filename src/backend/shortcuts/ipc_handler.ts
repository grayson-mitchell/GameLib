import { existsSync } from 'graceful-fs'
import { addHandler } from 'backend/ipc'
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

// Quick 261012-f05: invoke-kind, resolves true only once the write succeeded, so the renderer
// (GameSubMenu) flips its label from the outcome. Parity copy of the sidecar's registration.
addHandler('addShortcut', async (event, appName, runner, fromMenu) => {
  try {
    await getGame(appName, runner).addShortcuts(fromMenu)
  } catch (error) {
    logWarning(
      ['Could not add shortcuts for', appName, error],
      LogPrefix.Backend
    )
    return false
  }

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
  return true
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

addHandler('removeShortcut', async (event, appName, runner) => {
  try {
    await getGame(appName, runner).removeShortcuts()
  } catch (error) {
    logWarning(
      ['Could not remove shortcuts for', appName, error],
      LogPrefix.Backend
    )
    return false
  }

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
    // Shared key: catalog 'Shortcuts' wins; the body names the removal.
    title: i18next.t('box.shortcuts.title', 'Shortcuts')
  })
  return true
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
