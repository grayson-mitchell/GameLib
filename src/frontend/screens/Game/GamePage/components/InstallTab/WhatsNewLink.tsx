import { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GameContext from '../../../GameContext'
import GameChangeLog from '../../../GameChangeLog'
import { FactAction } from './FactRow'

/**
 * Phase 100 (D-01): the "What's new" link and the changelog dialog it opens,
 * shared by the Version row and the update status line in GameStatus.
 *
 * The changelog is HTML from the store, so it renders only through
 * GameChangeLog (sanitize-html); nothing here inlines it (T-100-12).
 */
const WhatsNewLink = () => {
  const { t } = useTranslation('gamelib')
  const { gameInfo, gameExtraInfo } = useContext(GameContext)
  const [showChangelog, setShowChangelog] = useState(false)

  if (!gameInfo || !gameExtraInfo?.changelog) return null

  return (
    <>
      <FactAction
        variant="link"
        label={t('gamelib:gamepage.installTab.whatsNew', "What's new")}
        onClick={() => setShowChangelog(true)}
      />
      {showChangelog && (
        <GameChangeLog
          title={gameInfo.overrides?.title || gameInfo.title}
          changelog={gameExtraInfo.changelog}
          backdropClick={() => setShowChangelog(false)}
        />
      )}
    </>
  )
}

export default WhatsNewLink
