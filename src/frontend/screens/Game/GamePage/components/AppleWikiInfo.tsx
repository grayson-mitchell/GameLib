import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import { WineBar } from '@mui/icons-material'
import { createNewWindow } from 'frontend/helpers'
import { GameInfo } from 'common/types'
import { ratingTier } from './appleRating'

interface Props {
  gameInfo: GameInfo
}

const AppleWikiInfo = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  const { wikiInfo } = useContext(GameContext)

  if (!wikiInfo) {
    return null
  }

  const applegamingwiki = wikiInfo.applegamingwiki

  if (!applegamingwiki) {
    return null
  }

  const onClick = () => {
    if (applegamingwiki.crossoverLink) {
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
    <>
      <a
        role="button"
        className="iconWithText"
        title={t('info.clickToOpen', 'Click to open')}
        onClick={onClick}
      >
        <WineBar />
        <b>{t('info.crossover-rating', 'Crossover rating')}:</b>
        {ratingTier(applegamingwiki.crossoverRating).label}
      </a>
      <a
        role="button"
        className="iconWithText"
        title={t('info.clickToOpen', 'Click to open')}
        onClick={onClick}
      >
        <WineBar />
        <b>{t('info.wine-rating', 'Wine rating')}:</b>
        {ratingTier(applegamingwiki.wineRating).label}
      </a>
    </>
  )
}

export default AppleWikiInfo
