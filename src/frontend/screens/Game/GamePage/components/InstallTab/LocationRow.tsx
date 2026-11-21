import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameInfo } from 'common/types'
import GameContext from '../../../GameContext'
import type {
  InstallActionGate,
  InstallActionId
} from '../../actions/installActionGates'
import type { InstallLocationActions } from '../../actions/useInstallLocationActions'
import { FactAction, FactRow } from './FactRow'
import { gateReasonText } from './gateReasonText'

interface Props {
  gameInfo: GameInfo
  gates: Record<InstallActionId, InstallActionGate>
  actions: InstallLocationActions
}

/**
 * Phase 100 (D-01, D-10, D-11, D-12, D-18): the Location fact. The path is
 * ellipsised with the full path in the tooltip; Open, Move… and "Wrong
 * folder?" sit next to the path they change. Move reads "Moving…" from the
 * game's status while GameStatus stays the only progress readout.
 */
const LocationRow = ({ gameInfo, gates, actions }: Props) => {
  const { t } = useTranslation('gamelib')
  const { is } = useContext(GameContext)

  if (!gates.open.show) return null

  const location = gameInfo.install.install_path || gameInfo.folder_name

  // A running move has not failed: neither the message nor its Retry shows
  // while the game reads moving (D-10).
  const failure =
    actions.moveFailed && !is.moving
      ? {
          message: t(
            'gamelib:gamepage.installTab.failure.move',
            'Move failed. Details are in the log.'
          ),
          retryLabel: t('gamelib:gamepage.installTab.retry', 'Retry'),
          onRetry: actions.retryMove
        }
      : actions.setFolderFailed
        ? {
            message: t(
              'gamelib:gamepage.installTab.failure.setFolder',
              "Couldn't set the install folder. Details are in the log."
            ),
            retryLabel: t('gamelib:gamepage.installTab.retry', 'Retry'),
            onRetry: actions.retrySetFolder
          }
        : undefined

  return (
    <FactRow
      label={t('gamelib:gamepage.installTab.location', 'Location')}
      valueTitle={location}
      failure={failure}
      actions={
        <>
          <FactAction
            label={t('gamelib:gamepage.installTab.open', 'Open')}
            onClick={actions.openFolder}
          />
          {gates.move.show && (
            <FactAction
              label={t('gamelib:gamepage.installTab.move', 'Move…')}
              busy={is.moving}
              busyLabel={t(
                'gamelib:gamepage.installTab.busy.moving',
                'Moving…'
              )}
              disabled={gates.move.disabled}
              disabledReason={
                gates.move.reason
                  ? gateReasonText(gates.move.reason, t)
                  : undefined
              }
              onClick={actions.startMove}
            />
          )}
          {gates.setFolder.show && (
            <FactAction
              variant="link"
              label={t(
                'gamelib:gamepage.installTab.wrongFolder',
                'Wrong folder?'
              )}
              busy={actions.settingFolder}
              busyLabel={t(
                'gamelib:gamepage.installTab.busy.settingFolder',
                'Setting folder…'
              )}
              disabled={gates.setFolder.disabled}
              disabledReason={
                gates.setFolder.reason
                  ? gateReasonText(gates.setFolder.reason, t)
                  : undefined
              }
              onClick={actions.startSetFolder}
            />
          )}
        </>
      }
    >
      {location}
    </FactRow>
  )
}

export default LocationRow
