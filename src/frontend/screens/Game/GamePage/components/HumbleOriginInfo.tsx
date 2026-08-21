import { useContext } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import { GameInfo } from 'common/types'

interface Props {
  gameInfo: GameInfo
}

/**
 * HDEDUP-02 collapse (D-35/D-36/D-37/D-40): the Steam-side trace of a
 * redeemed Humble key. Renders nothing for a non-Steam entry, and nothing
 * unless a REDEEMED Humble key's `steamAppId` confirms-matches this game's
 * AppID — no mismatch flag / guessing on unmatched or non-redeemed rows
 * (D-37/D-40). Origin-only copy, deliberately no purchase date (D-35). The
 * matched key itself keeps rendering as a normal REDEEMED row on the Humble
 * Keys page (D-36) — this component only adds the details-page annotation.
 */
const HumbleOriginInfo = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  const { humble } = useContext(ContextProvider)

  if (gameInfo.runner !== 'steam') {
    return null
  }

  const matchedKey = humble.keys?.find(
    (key) => key.state === 'REDEEMED' && key.steamAppId === gameInfo.app_name
  )

  if (!matchedKey) {
    return null
  }

  return (
    <div className="humbleOriginInfo">
      {t('info.humbleOrigin', 'Includes a key from Humble Bundle: {{origin}}', {
        origin: matchedKey.origin
      })}
    </div>
  )
}

export default HumbleOriginInfo
