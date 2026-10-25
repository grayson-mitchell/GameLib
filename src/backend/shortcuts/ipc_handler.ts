import { addHandler } from 'backend/ipc'
import i18next from 'i18next'
import {
  addNonSteamGame,
  isAddedToSteam,
  removeNonSteamGame
} from './nonesteamgame/nonesteamgame'
import { shortcutFiles, shortcutPathPresent } from './shortcuts/shortcuts'
import { notify } from 'backend/dialog/dialog'
import { isMac } from 'backend/constants/environment'
import { getGame } from '../utils'
import { logWarning, LogPrefix } from 'backend/logger'
import type { Runner } from 'common/types'

// Quick task 261012-ca6: `addShortcut` and `removeShortcut` are invoke-kind and resolve whether
// shortcuts exist on disk once the work has settled. This file is the Electron-era original; the
// shipped path is `sidecar/shortcutsFlowRegistration.ts`.
function shortcutsExistOnDisk(appName: string, runner: Runner): boolean {
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

  // 261026-ctm: a dangling Desktop link counts as present so Remove stays offered.
  return (
    shortcutPathPresent(desktopFile ?? '') ||
    shortcutPathPresent(menuFile ?? '')
  )
}

addHandler('addShortcut', async (event, appName, runner, fromMenu) => {
  try {
    await getGame(appName, runner).addShortcuts(fromMenu)
  } catch (error) {
    logWarning(
      ['Could not add shortcuts for', appName, error],
      LogPrefix.Backend
    )
    return shortcutsExistOnDisk(appName, runner)
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

  return shortcutsExistOnDisk(appName, runner)
})

addHandler('shortcutsExists', (event, appName, runner) =>
  shortcutsExistOnDisk(appName, runner)
)

addHandler('removeShortcut', async (event, appName, runner) => {
  try {
    await getGame(appName, runner).removeShortcuts()
  } catch (error) {
    logWarning(
      ['Could not remove shortcuts for', appName, error],
      LogPrefix.Backend
    )
    return shortcutsExistOnDisk(appName, runner)
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

  return shortcutsExistOnDisk(appName, runner)
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
