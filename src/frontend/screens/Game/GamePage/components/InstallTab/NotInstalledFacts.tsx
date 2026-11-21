import { useTranslation } from 'react-i18next'
import type { GameInfo } from 'common/types'
import { openInstallGameModal } from 'frontend/state/InstallGameModal'
import type {
  InstallActionGate,
  InstallActionId
} from '../../actions/installActionGates'
import DownloadSizeInfo from '../DownloadSizeInfo'
import PlatformSupport from '../PlatformSupport'
import { FactAction } from './FactRow'
import { gateReasonText } from './gateReasonText'
import { ThirdPartyRow } from './StaticFactRows'

interface Props {
  gameInfo: GameInfo
  gates: Record<InstallActionId, InstallActionGate>
}

/**
 * Phase 100 (D-01, D-05): what the Install tab shows for a game that is not on
 * disk: Download size, Install size, Platforms, Third-party manager when one
 * applies, and an "Already installed elsewhere?" link that opens Locate
 * existing installation… (the import door; `gates.locate` hides it for Steam,
 * which has no import, and disables it while installing, importing or queued).
 */
const NotInstalledFacts = ({ gameInfo, gates }: Props) => {
  const { t } = useTranslation('gamelib')

  return (
    <>
      <DownloadSizeInfo gameInfo={gameInfo} />
      <PlatformSupport gameInfo={gameInfo} />
      <ThirdPartyRow gameInfo={gameInfo} />
      {gates.locate.show && (
        <div className="installLocate">
          <FactAction
            variant="link"
            label={t(
              'gamelib:gamepage.installTab.locate',
              'Already installed elsewhere?'
            )}
            disabled={gates.locate.disabled}
            disabledReason={
              gates.locate.reason
                ? gateReasonText(gates.locate.reason, t)
                : undefined
            }
            onClick={() =>
              openInstallGameModal({
                appName: gameInfo.app_name,
                runner: gameInfo.runner,
                gameInfo,
                action: 'import'
              })
            }
          />
        </div>
      )}
    </>
  )
}

export default NotInstalledFacts
