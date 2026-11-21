import { useTranslation } from 'react-i18next'
import { asStoreGame } from 'common/gameInfoNarrowing'
import type { GameInfo } from 'common/types'
import { FactRow } from './FactRow'

interface Props {
  gameInfo: GameInfo
}

/**
 * Phase 100 (D-05): Online required. A fact with no action: it renders only
 * for an installed game that needs a connection to start, so a game that runs
 * offline shows nothing rather than a "No".
 */
export const OnlineRequiredRow = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamelib')

  if (!gameInfo.is_installed || gameInfo.canRunOffline) return null
  // Browser games have no local install data.
  if (gameInfo.install.platform === 'Browser') return null

  return (
    <FactRow
      label={t('gamelib:gamepage.installTab.onlineRequired', 'Online required')}
    >
      {t(
        'gamelib:gamepage.installTab.onlineRequiredValue',
        'Needs a connection to start'
      )}
    </FactRow>
  )
}

/**
 * Phase 100 (D-05): Third-party manager. A fact with no action, shown for an
 * installed or not-installed game that another launcher manages.
 */
export const ThirdPartyRow = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamelib')

  if (!gameInfo.thirdPartyManagedApp) return null

  return (
    <FactRow
      label={t('gamelib:gamepage.installTab.thirdParty', 'Third-party manager')}
    >
      {asStoreGame(gameInfo, 'legendary')?.isEAManaged
        ? 'EA app'
        : gameInfo.thirdPartyManagedApp}
    </FactRow>
  )
}
