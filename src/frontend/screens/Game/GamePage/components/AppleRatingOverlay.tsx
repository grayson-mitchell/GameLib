import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import ContextProvider from 'frontend/state/ContextProvider'
import { createNewWindow } from 'frontend/helpers'
import { GameInfo } from 'common/types'
import { pickRating, ratingTier } from './appleRating'

interface Props {
  gameInfo: GameInfo
}

/**
 * DETAIL-02: color-coded, clickable AppleGamingWiki compatibility pill overlaid
 * on the portrait cover art. Mounted only when the gate passes (macOS + a
 * NON-Mac-native / Windows game — the CrossOver/Wine rating measures translation-
 * layer compatibility, which doesn't apply to native Mac builds) — so this always
 * renders a pill, showing "Unrated" when there is no rating (D-12). The displayed
 * rating follows the app-wide rating-source setting (D-10/D-11), shared with the
 * Extra-info tab row.
 */
const AppleRatingOverlay = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  const { wikiInfo } = useContext(GameContext)
  const { appleRatingSource } = useContext(ContextProvider)

  const applegamingwiki = wikiInfo?.applegamingwiki ?? null
  const rating = applegamingwiki
    ? pickRating(applegamingwiki, appleRatingSource)
    : ''
  const { label, colorVar } = ratingTier(rating)

  const onClick = () => {
    if (applegamingwiki?.crossoverLink) {
      createNewWindow(
        `https://www.codeweavers.com/compatibility/crossover/${applegamingwiki.crossoverLink}`
      )
    } else {
      createNewWindow(
        `https://www.codeweavers.com/compatibility?browse=&app_desc=&company=&rating=&platform=&date_start=&date_end=&name=${gameInfo.title}&search=app#results`
      )
    }
  }

  return (
    <button
      type="button"
      className="appleRatingPill"
      style={{ backgroundColor: `var(${colorVar})` }}
      title={t('info.clickToOpen', 'Click to open')}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export default AppleRatingOverlay
