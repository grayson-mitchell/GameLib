import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameInfo } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'
import { repair } from 'frontend/helpers'
import GameContext from '../../../GameContext'
import type {
  InstallActionGate,
  InstallActionId
} from '../../actions/installActionGates'
import { useRowAction } from '../../actions/rowAction'
import { FactAction, FactRow } from './FactRow'
import { gateReasonText } from './gateReasonText'
import WhatsNewLink from './WhatsNewLink'

interface Props {
  gameInfo: GameInfo
  gates: Record<InstallActionId, InstallActionGate>
  handleUpdate: () => void
  hasUpdate: boolean
}

/**
 * Phase 100 (D-01, D-10, D-11, D-13, D-19): the Version fact with Verify,
 * Update and What's new beside it.
 *
 * Verify starts at once with no confirmation (D-13) and a rejection shows
 * inline with Retry (D-18); the runner's own failures are reported by the
 * backend and never reach here. Update calls the page's `handleUpdate`
 * unchanged. Both buttons read their busy label from the game's status while
 * GameStatus remains the only progress readout.
 */
const VersionRow = ({ gameInfo, gates, handleUpdate, hasUpdate }: Props) => {
  const { t } = useTranslation('gamelib')
  const { is, runner, gameInstallInfo } = useContext(GameContext)
  const verifyRow = useRowAction('repair', gameInfo.app_name)

  const isSideloaded = !hasCapability(runner, 'hasStoreCatalog')
  const version = gameInfo.install.version

  if (
    !gameInfo.is_installed ||
    isSideloaded ||
    gameInfo.thirdPartyManagedApp ||
    gameInfo.install.platform === 'Browser' ||
    !version
  ) {
    return null
  }

  const availableVersion = gameInstallInfo?.game.version

  const runVerify = () =>
    verifyRow.run(() => repair(gameInfo.app_name, gameInfo.runner))

  const availableText = availableVersion
    ? t('gamelib:gamepage.installTab.available', '· {{version}} available', {
        version: availableVersion
      })
    : t('gamelib:gamepage.installTab.availableNoVersion', '· update available')

  const reasonFor = (gate: InstallActionGate) =>
    gate.reason ? gateReasonText(gate.reason, t) : undefined

  return (
    <FactRow
      label={t('gamelib:gamepage.installTab.version', 'Version')}
      valueTitle={version}
      failure={
        verifyRow.phase === 'failed'
          ? {
              message: t(
                'gamelib:gamepage.installTab.failure.verify',
                'Verify failed. Details are in the log.'
              ),
              retryLabel: t('gamelib:gamepage.installTab.retry', 'Retry'),
              onRetry: runVerify
            }
          : undefined
      }
      actions={
        <>
          {gates.verify.show && (
            <FactAction
              label={t('gamelib:gamepage.installTab.verify', 'Verify')}
              busy={verifyRow.phase === 'busy' || is.reparing}
              busyLabel={t(
                'gamelib:gamepage.installTab.busy.verifying',
                'Verifying…'
              )}
              disabled={gates.verify.disabled}
              disabledReason={reasonFor(gates.verify)}
              onClick={runVerify}
            />
          )}
          {gates.update.show && (
            <FactAction
              label={t('gamelib:gamepage.installTab.update', 'Update')}
              busy={is.updating}
              busyLabel={t(
                'gamelib:gamepage.installTab.busy.updating',
                'Updating…'
              )}
              disabled={gates.update.disabled}
              disabledReason={reasonFor(gates.update)}
              onClick={handleUpdate}
            />
          )}
          {gates.whatsNew.show && <WhatsNewLink />}
        </>
      }
    >
      {version}{' '}
      {hasUpdate ? (
        <span className="fact__value--warning">{availableText}</span>
      ) : (
        t('gamelib:gamepage.installTab.upToDate', '· up to date')
      )}
    </FactRow>
  )
}

export default VersionRow
