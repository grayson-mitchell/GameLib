import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import { WineBar } from '@mui/icons-material'
import { Rating } from '@mui/material'
import { createNewWindow } from 'frontend/helpers'
import { GameInfo } from 'common/types'
import { ratingTier } from './appleRating'
import { formatCrossoverRating } from './crossoverRating'
import CodeweaversLogo from 'frontend/assets/codeweavers_icon.svg?react'

interface Props {
  gameInfo: GameInfo
}

const AppleWikiInfo = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  const { wikiInfo, is } = useContext(GameContext)

  if (!wikiInfo) {
    return null
  }

  if (is.native) {
    return null
  }

  const codeweavers = wikiInfo.codeweavers
  const applegamingwiki = wikiInfo.applegamingwiki

  const onClickCrossover = () => {
    if (codeweavers?.slug) {
      createNewWindow(
        `https://www.codeweavers.com/compatibility/crossover/${codeweavers.slug}`
      )
    } else {
      createNewWindow(
        `https://www.codeweavers.com/compatibility?browse=&app_desc=&company=&rating=&platform=&date_start=&date_end=&name=${gameInfo.title}&search=app#results`
      )
    }
  }

  const onClickWine = () => {
    if (is.mac) {
      createNewWindow(
        `https://www.applegamingwiki.com/w/index.php?search=${encodeURIComponent(gameInfo.title)}`
      )
    } else {
      createNewWindow(
        `https://appdb.winehq.org/objectManager.php?sClass=application&sTitle=Browse+Applications&bIsQueue=false&bIsRejected=false&sOrderBy=appName&bAscending=true&sHavingText=${encodeURIComponent(gameInfo.title)}`
      )
    }
  }

  const crossoverRatingCountLabel = codeweavers
    ? formatCrossoverRating(codeweavers.rating, codeweavers.ratingCount)
    : null

  return (
    <>
      {codeweavers && (
        <a
          role="button"
          className="iconWithText"
          title={t('info.clickToOpen', 'Click to open')}
          onClick={onClickCrossover}
        >
          <CodeweaversLogo style={{ width: '24px', height: '24px' }} />
          <b>{t('info.crossover-rating', 'Crossover emulation')}:</b>
          {codeweavers.rating !== null ? (
            <>
              <Rating
                value={codeweavers.rating}
                precision={0.5}
                max={5}
                readOnly
                size="small"
              />
              {crossoverRatingCountLabel}
            </>
          ) : (
            t('info.no-compatibility-data', 'No compatibility data available')
          )}
        </a>
      )}
      {applegamingwiki && (
        <a
          role="button"
          className="iconWithText"
          title={t('info.clickToOpen', 'Click to open')}
          onClick={onClickWine}
        >
          <WineBar />
          <b>{t('info.wine-rating', 'Wine emulation')}:</b>
          {ratingTier(applegamingwiki.wineRating).label}
        </a>
      )}
    </>
  )
}

export default AppleWikiInfo
