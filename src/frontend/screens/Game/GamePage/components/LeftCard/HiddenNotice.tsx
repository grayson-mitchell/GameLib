import { useTranslation } from 'react-i18next'
import { useHiddenGames } from 'frontend/state/accountHooks'
import './index.css'

interface Props {
  appName: string
}

/**
 * Phase 100 (D-01): while the game is hidden, a neutral note under the title
 * says where hidden games still appear and offers Unhide. Renders nothing
 * otherwise, so the `.gameNotices` container's `:empty` rule keeps it invisible.
 */
const HiddenNotice = ({ appName }: Props) => {
  const { t } = useTranslation()
  const hiddenGames = useHiddenGames()
  const isHidden = hiddenGames.list.some((h) => h.appName === appName)

  if (!isHidden) return null

  return (
    <p className="hiddenNotice" role="status">
      {t(
        'gamelib:gamepage.leftCard.hiddenNotice',
        'Hidden from your library. It only appears when "Show hidden" is on.'
      )}{' '}
      <button
        type="button"
        className="hiddenNotice__unhide"
        onClick={() => hiddenGames.remove(appName)}
      >
        {t('gamelib:gamepage.leftCard.unhide', 'Unhide')}
      </button>
    </p>
  )
}

export default HiddenNotice
