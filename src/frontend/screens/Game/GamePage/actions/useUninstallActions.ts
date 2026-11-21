import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasCapability } from 'common/storeCapabilities'
import type { GameInfo } from 'common/types'
import useLibraryState from 'frontend/state/libraryState'
import useUiState from 'frontend/state/uiState'
// The route classifier stays where the ⋮ menu keeps it; plan 09 moves it.
import {
  CLOSED_STEAM_DELETE_ROUTE,
  steamUninstallNeedsConfirm
} from '../../GameSubMenu/steamUninstallConfirm'

/**
 * Phase 100 (D-01, D-11, D-13): the danger zone's Uninstall and Remove all
 * copies handlers, copied from the ⋮ menu (GameSubMenu keeps its own copy until
 * plan 09 removes it).
 *
 * Both keep their confirmations (D-13, T-100-17, T-100-18). A non-Steam game
 * always opens UninstallModal. A Steam game asks `getSteamDeleteRoute` and
 * `steamUninstallNeedsConfirm` decides between UninstallModal and Steam's own
 * dialog; a rejected or malformed route reply fails closed, so the modal opens.
 * Remove all copies asks "Remove all copies?" and is the only path to
 * `steamRemoveAllCopies`.
 */
export function useUninstallActions(gameInfo: GameInfo) {
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation('gamelib')
  const refresh = useLibraryState((s) => s.refresh)
  const showDialogModal = useUiState((s) => s.showDialogModal)
  const { app_name: appName, runner } = gameInfo
  const isSteam = !hasCapability(runner, 'winePrefixToolsAvailable')

  const [showUninstallModal, setShowUninstallModal] = useState(false)

  async function startUninstall() {
    if (isSteam) {
      // D-05 (no GameLib confirm) applies only to the delegated
      // steam://uninstall route, where Steam shows its own dialog. GameLib
      // itself deletes bridge, bottle, setting-ON native and unadopted
      // Mac-native installs, so it must confirm them first (66.3 UAT test 5,
      // quick 261112-90h).
      const route = await window.api
        .getSteamDeleteRoute(appName)
        .catch(() => CLOSED_STEAM_DELETE_ROUTE)
      if (steamUninstallNeedsConfirm(route)) {
        setShowUninstallModal(true)
      } else {
        window.api.uninstall(appName, runner, false, false)
      }
    } else {
      setShowUninstallModal(true)
    }
  }

  // quick-260821-le0 (Task 3): sweeps EVERY recorded install root for this
  // Steam title in one confirmed action.
  async function onRemoveAllCopiesYesClick() {
    await window.api.steamRemoveAllCopies(appName)
    await refresh(runner)
  }

  function startRemoveAllCopies() {
    showDialogModal({
      showDialog: true,
      title: tGamelib(
        'gamelib:steam.uninstall.removeAllCopiesConfirmTitle',
        'Remove all copies?'
      ),
      message: tGamelib(
        'gamelib:steam.uninstall.removeAllCopiesConfirmMessage',
        'This removes every installed copy of this game across all install locations. This cannot be undone.'
      ),
      buttons: [
        { text: t('box.yes'), onClick: onRemoveAllCopiesYesClick },
        { text: t('box.no') }
      ]
    })
  }

  return {
    startUninstall,
    startRemoveAllCopies,
    showUninstallModal,
    closeUninstallModal: () => setShowUninstallModal(false)
  }
}
