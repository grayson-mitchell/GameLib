import { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameInfo } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'
import GameContext from '../../../GameContext'
import ModifyInstallModal from '../../../ModifyInstallModal'
import type {
  InstallActionGate,
  InstallActionId
} from '../../actions/installActionGates'
import { FactAction, FactRow } from './FactRow'
import { gateReasonText } from './gateReasonText'

interface Props {
  gameInfo: GameInfo
  gates: Record<InstallActionId, InstallActionGate>
}

/**
 * Phase 100 (D-01, D-10, D-11): the Size fact. Modify… sits next to the size it
 * changes (Epic and GOG only, per `gates.modify`) and opens the existing
 * ModifyInstallModal, which runs its own flow, so this row has no failure
 * state. A component change runs as an install on an installed game, so the
 * button reads "Applying changes…" while `is.installing`.
 */
const SizeRow = ({ gameInfo, gates }: Props) => {
  const { t } = useTranslation('gamelib')
  const { is, runner, gameInstallInfo } = useContext(GameContext)
  const [showModify, setShowModify] = useState(false)

  const isSideloaded = !hasCapability(runner, 'hasStoreCatalog')
  const isThirdParty = !!gameInfo.thirdPartyManagedApp

  if (!gameInfo.is_installed || isSideloaded || isThirdParty) return null
  if (gameInfo.install.platform === 'Browser') return null

  return (
    <>
      <FactRow
        label={t('gamelib:gamepage.installTab.size', 'Size')}
        actions={
          gates.modify.show ? (
            <FactAction
              label={t('gamelib:gamepage.installTab.modify', 'Modify…')}
              busy={is.installing}
              busyLabel={t(
                'gamelib:gamepage.installTab.busy.modifying',
                'Applying changes…'
              )}
              disabled={gates.modify.disabled}
              disabledReason={
                gates.modify.reason
                  ? gateReasonText(gates.modify.reason, t)
                  : undefined
              }
              onClick={() => setShowModify(true)}
            />
          ) : undefined
        }
      >
        {gameInfo.install.install_size}
      </FactRow>
      {showModify && (
        <ModifyInstallModal
          gameInfo={gameInfo}
          gameInstallInfo={gameInstallInfo}
          onClose={() => setShowModify(false)}
        />
      )}
    </>
  )
}

export default SizeRow
