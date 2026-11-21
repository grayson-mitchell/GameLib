import { useTranslation } from 'react-i18next'
import type { GameInfo } from 'common/types'
import useLibraryState from 'frontend/state/libraryState'
import useUiState from 'frontend/state/uiState'
import useOpenDialog from 'frontend/hooks/useOpenDialog'
import { isInvokeTimeout, useRowAction } from './rowAction'

/**
 * Phase 100 (D-01, D-13, D-18): the Location row's Open / Move… / Set install
 * folder handlers, moved here from the ⋮ menu, which Phase 100 removed.
 *
 * Move… and Set install folder keep their yes/no confirmation (D-13). The
 * picker and the backend call run through `useRowAction`, so a rejection marks
 * the row failed and is logged instead of raising an error dialog (D-12, D-18).
 * Runner-level failures the backend reports itself never reach the renderer as
 * a rejection and keep their existing notification.
 *
 * CR-02: the shell can stop waiting on `moveInstall` while the copy continues.
 * A rejection that is that timeout, while the game's status still reads
 * 'moving', is handed to the game status instead of reported as a failure; any
 * other rejection still fails the row (D-18).
 */
/**
 * Read at rejection time, not through a render-time selector: the rejection
 * lands long after the render that started the move.
 */
function isStatusMoving(appName: string): boolean {
  return useLibraryState
    .getState()
    .libraryStatus.some(
      (entry) => entry.appName === appName && entry.status === 'moving'
    )
}

export function useInstallLocationActions(gameInfo: GameInfo) {
  const { t } = useTranslation('gamepage')
  const refresh = useLibraryState((s) => s.refresh)
  const showDialogModal = useUiState((s) => s.showDialogModal)
  const openDialog = useOpenDialog()
  const { app_name: appName, runner } = gameInfo

  const moveRow = useRowAction('moveInstall', appName)
  const folderRow = useRowAction('changeInstallPath', appName)

  function openFolder() {
    const path = gameInfo.install.install_path || gameInfo.folder_name

    if (path) {
      window.api.openFolder(path)
    }
  }

  async function onMoveInstallYesClick() {
    await moveRow.run(
      async () => {
        const { defaultInstallPath } = await window.api.requestAppSettings()
        const path = await openDialog({
          buttonLabel: t('box.choose'),
          properties: ['openDirectory'],
          title: t('box.move.path'),
          defaultPath: defaultInstallPath
        })
        if (path) {
          await window.api.moveInstall({ appName, path, runner })
        }
      },
      undefined,
      (error) => isInvokeTimeout(error) && isStatusMoving(appName)
    )
  }

  function startMove() {
    showDialogModal({
      showDialog: true,
      message: t('box.move.message'),
      title: t('box.move.title'),
      buttons: [
        { text: t('box.yes'), onClick: onMoveInstallYesClick },
        { text: t('box.no') }
      ]
    })
  }

  async function onChangeInstallYesClick() {
    await folderRow.run(async () => {
      const { defaultInstallPath } = await window.api.requestAppSettings()
      const path = await openDialog({
        buttonLabel: t('box.choose'),
        properties: ['openDirectory'],
        title: t('box.change.path'),
        defaultPath: defaultInstallPath
      })
      if (path) {
        await window.api.changeInstallPath({ appName, path, runner })
        await refresh(runner)
      }
    })
  }

  function startSetFolder() {
    showDialogModal({
      showDialog: true,
      message: t('box.change.message'),
      title: t('box.change.title'),
      buttons: [
        { text: t('box.yes'), onClick: onChangeInstallYesClick },
        { text: t('box.no') }
      ]
    })
  }

  return {
    openFolder,
    startMove,
    startSetFolder,
    moveFailed: moveRow.phase === 'failed',
    setFolderFailed: folderRow.phase === 'failed',
    // changeInstallPath has no status flag (research Pattern 4): the row's own
    // busy phase stands in for one.
    settingFolder: folderRow.phase === 'busy',
    retryMove: onMoveInstallYesClick,
    retrySetFolder: onChangeInstallYesClick
  }
}

export type InstallLocationActions = ReturnType<
  typeof useInstallLocationActions
>
