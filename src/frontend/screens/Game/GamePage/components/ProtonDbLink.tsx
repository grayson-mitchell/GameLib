import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLinux } from '@fortawesome/free-brands-svg-icons'
import { hasCapability } from 'common/storeCapabilities'
import type { GameInfo } from 'common/types'
import { createNewWindow } from 'frontend/helpers'
import GameContext from '../../GameContext'

interface Props {
  gameInfo: GameInfo
}

const PROTONDB_ORIGIN = 'https://www.protondb.com'

/**
 * Phase 100 (D-01): the ⋮ menu's "Check Compatibility" had a ProtonDB link for
 * every non-sideloaded game on Linux, with or without a compatibility tier.
 * CompatibilityInfo only shows its ProtonDB row when the wiki produced a tier,
 * so this row covers the rest of the reach and stays out of its way when the
 * tier row is there. The URL follows CompatibilityInfo's rule.
 */
const ProtonDbLink = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamelib')
  const { wikiInfo, is } = useContext(GameContext)

  if (!is.linux || !hasCapability(gameInfo.runner, 'hasStoreCatalog')) {
    return null
  }
  if (wikiInfo?.steamInfo?.compatibilityLevel) {
    return null
  }

  let url = `${PROTONDB_ORIGIN}/search?q=${encodeURIComponent(gameInfo.title)}`
  if (hasCapability(gameInfo.runner, 'appNameIsSteamAppId')) {
    url = `${PROTONDB_ORIGIN}/app/${encodeURIComponent(gameInfo.app_name)}`
  } else if (wikiInfo?.pcgamingwiki?.steamID) {
    url = `${PROTONDB_ORIGIN}/app/${encodeURIComponent(wikiInfo.pcgamingwiki.steamID)}`
  }

  // Same shape as CompatibilityInfo's ProtonDB row (a clickable iconWithText
  // anchor), so it reads as a sibling and adds no is-text render site.
  return (
    <a
      role="button"
      onClick={() => createNewWindow(url)}
      title={t(
        'gamelib:gamepage.ratings.protondbCheck',
        'Check compatibility ↗'
      )}
      className="iconWithText"
    >
      <FontAwesomeIcon icon={faLinux} />
      <b>{t('gamelib:gamepage.ratings.protondb', 'ProtonDB')}:</b>
      {t('gamelib:gamepage.ratings.protondbCheck', 'Check compatibility ↗')}
    </a>
  )
}

export default ProtonDbLink
