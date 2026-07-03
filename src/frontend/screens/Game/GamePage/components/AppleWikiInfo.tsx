import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import ContextProvider from 'frontend/state/ContextProvider'
import { WineBar } from '@mui/icons-material'
import { createNewWindow } from 'frontend/helpers'
import { GameInfo } from 'common/types'
import { pickRating, ratingTier } from './appleRating'

interface Props {
  gameInfo: GameInfo
}

const AppleWikiInfo = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  const { wikiInfo } = useContext(GameContext)
  const { appleRatingSource } = useContext(ContextProvider)

  if (!wikiInfo) {
    return null
  }

  const applegamingwiki = wikiInfo.applegamingwiki

  if (!applegamingwiki) {
    return null
  }

  // D-11: the tab row honors the app-wide rating-source setting so it never
  // disagrees with the art overlay. Keeps its current behavior of hiding when
  // the selected rating is empty (D-12 mandates "Unrated" for the overlay only).
  const rating = pickRating(applegamingwiki, appleRatingSource)

  if (!rating) {
    return null
  }

  return (
    <a
      role="button"
      className="iconWithText"
      title={t('info.clickToOpen', 'Click to open')}
      onClick={() => {
        if (applegamingwiki.crossoverLink) {
          createNewWindow(
            `https://www.codeweavers.com/compatibility/crossover/${applegamingwiki.crossoverLink}`
          )
        } else {
          createNewWindow(
            `https://www.codeweavers.com/compatibility?browse=&app_desc=&company=&rating=&platform=&date_start=&date_end=&name=${gameInfo.title}&search=app#results`
          )
        }
      }}
    >
      <WineBar />
      <b>{t('info.apple-gaming-wiki', 'AppleGamingWiki Rating')}:</b>
      {ratingTier(rating).label}
    </a>
  )
}

export default AppleWikiInfo
