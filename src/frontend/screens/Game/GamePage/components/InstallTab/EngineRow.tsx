import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameInfo } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'
import GameContext from '../../../GameContext'
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
 * Phase 100 (D-01, D-05, D-11): the Engine fact for an installed game that
 * runs under Wine. The value is the Wine name (InstalledInfo's own
 * derivation) and then either the CrossOver bottle or the prefix path, with
 * [Open prefix] beside it. Open prefix never waits for a long action (D-11);
 * `gates.openPrefix` shows it only when there is a prefix folder to open.
 * Steam games are skipped: they do not run through a GameLib prefix.
 */
const EngineRow = ({ gameInfo, gates }: Props) => {
  const { t } = useTranslation('gamelib')
  const { gameSettings, is, runner } = useContext(GameContext)

  if (!gameInfo.is_installed || !gameSettings) return null
  if (!hasCapability(runner, 'winePrefixToolsAvailable')) return null
  if (is.win || is.native) return null
  // Browser games have no local install data.
  if (gameInfo.install.platform === 'Browser') return null

  const { wineVersion, winePrefix, wineCrossoverBottle } = gameSettings

  let wineName = wineVersion.name
    .replace('Wine - ', '')
    .replace('Proton - ', '')
  if (wineName.includes('Default')) {
    wineName = wineName.split('-')[0] ?? wineName
  }

  const isCrossover = wineVersion.type === 'crossover'
  const where = isCrossover
    ? t('gamelib:gamepage.installTab.engineBottle', 'bottle "{{bottle}}"', {
        bottle: wineCrossoverBottle
      })
    : winePrefix

  return (
    <FactRow
      label={t('gamelib:gamepage.installTab.engine', 'Engine')}
      valueTitle={isCrossover ? undefined : winePrefix}
      actions={
        gates.openPrefix.show ? (
          <FactAction
            label={t('gamelib:gamepage.installTab.openPrefix', 'Open prefix')}
            disabled={gates.openPrefix.disabled}
            disabledReason={
              gates.openPrefix.reason
                ? gateReasonText(gates.openPrefix.reason, t)
                : undefined
            }
            onClick={() => window.api.openFolder(winePrefix)}
          />
        ) : undefined
      }
    >
      {`${wineName} · ${where}`}
    </FactRow>
  )
}

export default EngineRow
