import { useTranslation } from 'react-i18next'
import classNames from 'classnames'
import type { GameInfo } from 'common/types'
import UninstallModal from 'frontend/components/UI/UninstallModal'
import type {
  InstallActionGate,
  InstallActionId
} from '../../actions/installActionGates'
import { useUninstallActions } from '../../actions/useUninstallActions'
import { gateReasonText } from './gateReasonText'
import { RowFailure } from './SwitchRow'

interface Props {
  gameInfo: GameInfo
  gates: Record<InstallActionId, InstallActionGate>
}

/**
 * Phase 100 (D-01, D-11, D-13): the last block of an installed game's Install
 * tab. One line of consequence text, a red Uninstall… and, for Steam, Remove
 * all copies…. Both stay behind their confirmations and are disabled with a
 * reason (not removed from the focus ring) while the game plays or another long
 * action runs. DangerZone owns the UninstallModal it opens.
 */
const DangerZone = ({ gameInfo, gates }: Props) => {
  const { t } = useTranslation('gamelib')
  const { app_name: appName, runner } = gameInfo
  const {
    startUninstall,
    startRemoveAllCopies,
    uninstallFailed,
    uninstallBusy,
    retryUninstall,
    runModalUninstall,
    removeAllCopiesFailed,
    removingAllCopies,
    retryRemoveAllCopies,
    showUninstallModal,
    closeUninstallModal
  } = useUninstallActions(gameInfo)

  if (!gates.uninstall.show) return null

  const uninstallGate = gates.uninstall
  const allCopiesGate = gates.removeAllCopies

  const uninstallIsBusy =
    uninstallBusy || uninstallGate.reason === 'uninstalling'

  const reasonOf = (gate: InstallActionGate) =>
    gate.disabled && gate.reason ? gateReasonText(gate.reason, t) : undefined

  return (
    <section className="dangerZone" aria-labelledby="installTabDangerTitle">
      <h3 id="installTabDangerTitle" className="dangerZone__title">
        {t('gamepage.installTab.dangerZone.title', 'Danger zone')}
      </h3>
      <p className="dangerZone__text">
        {t(
          'gamepage.installTab.dangerZone.consequence',
          "Uninstalling deletes the game's files from this computer."
        )}
      </p>
      <button
        type="button"
        className={classNames('dangerButton', { 'is-busy': uninstallIsBusy })}
        aria-busy={uninstallIsBusy ? true : undefined}
        aria-disabled={
          uninstallGate.disabled || uninstallIsBusy ? true : undefined
        }
        title={uninstallIsBusy ? undefined : reasonOf(uninstallGate)}
        onClick={() => {
          if (uninstallGate.disabled || uninstallIsBusy) return
          void startUninstall()
        }}
      >
        {uninstallIsBusy
          ? t('gamelib:gamepage.installTab.busy.uninstalling', 'Uninstalling…')
          : t('gamepage.installTab.dangerZone.uninstall', 'Uninstall…')}
      </button>
      {allCopiesGate.show && (
        <button
          type="button"
          className={classNames('dangerButton', {
            'is-busy': removingAllCopies
          })}
          aria-busy={removingAllCopies ? true : undefined}
          aria-disabled={
            allCopiesGate.disabled || removingAllCopies ? true : undefined
          }
          title={reasonOf(allCopiesGate)}
          onClick={() => {
            if (allCopiesGate.disabled || removingAllCopies) return
            startRemoveAllCopies()
          }}
        >
          {removingAllCopies
            ? t(
                'gamelib:gamepage.installTab.busy.removingAllCopies',
                'Removing copies…'
              )
            : t(
                'gamelib:steam.uninstall.removeAllCopiesLabel',
                'Remove all copies…'
              )}
        </button>
      )}
      {uninstallFailed && (
        <RowFailure
          message={t(
            'gamelib:gamepage.installTab.failure.uninstall',
            'Uninstall failed. Details are in the log.'
          )}
          retryLabel={t('gamelib:gamepage.installTab.retry', 'Retry')}
          onRetry={() => void retryUninstall()}
          retryDisabled={uninstallGate.disabled}
          retryDisabledReason={reasonOf(uninstallGate)}
        />
      )}
      {removeAllCopiesFailed && (
        <RowFailure
          message={t(
            'gamelib:gamepage.installTab.failure.removeAllCopies',
            "Couldn't remove every copy. Details are in the log."
          )}
          retryLabel={t('gamelib:gamepage.installTab.retry', 'Retry')}
          onRetry={retryRemoveAllCopies}
          retryDisabled={allCopiesGate.disabled}
          retryDisabledReason={reasonOf(allCopiesGate)}
        />
      )}
      {showUninstallModal && (
        <UninstallModal
          appName={appName}
          runner={runner}
          isDlc={false}
          onClose={closeUninstallModal}
          runUninstall={runModalUninstall}
        />
      )}
    </section>
  )
}

export default DangerZone
