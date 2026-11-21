import { useTranslation } from 'react-i18next'
import EditIcon from '@mui/icons-material/Edit'
import { hasCapability } from 'common/storeCapabilities'
import type { GameInfo } from 'common/types'
import EditGameDialog from 'frontend/components/UI/EditGameDialog'
import { openInstallGameModal } from 'frontend/state/InstallGameModal'
import useUiState from 'frontend/state/uiState'
import './index.css'

interface Props {
  gameInfo: GameInfo
}

/**
 * Phase 100 (D-01): the "Edit details" pencil on the art band. It opens what
 * the old menu's Edit Game opened: the install modal for a sideloaded game,
 * the Edit Game dialog for a store game. Revealed by opacity (see index.css),
 * so it stays in the focus ring.
 */
const EditDetailsButton = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation()
  const showDialogModal = useUiState((s) => s.showDialogModal)

  function handleEdit() {
    if (!hasCapability(gameInfo.runner, 'hasStoreCatalog')) {
      openInstallGameModal({
        appName: gameInfo.app_name,
        runner: gameInfo.runner,
        gameInfo
      })
      return
    }

    showDialogModal({
      showDialog: true,
      title: t('edit-game.title', 'Edit Game'),
      message: (
        <EditGameDialog
          gameInfo={gameInfo}
          backdropClick={() => showDialogModal({ showDialog: false })}
        />
      )
    })
  }

  return (
    <button type="button" className="editDetailsButton" onClick={handleEdit}>
      <EditIcon aria-hidden="true" fontSize="inherit" />
      {tGamelib('gamelib:gamepage.leftCard.editDetails', 'Edit details')}
    </button>
  )
}

export default EditDetailsButton
