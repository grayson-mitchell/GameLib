import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import { WineBar } from '@mui/icons-material'
import { Rating } from '@mui/material'
import { createNewWindow } from 'frontend/helpers'
import { GameInfo } from 'common/types'
import { ratingTier } from './appleRating'
import { protonTierToStars } from './protonRating'
import CrossoverIcon from 'frontend/assets/crossover_icon.svg?react'

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
  const steamInfo = wikiInfo.steamInfo

  const showProton =
    is.linux && gameInfo.runner === 'steam' && !!steamInfo?.compatibilityLevel
  const showCrossover = is.mac && codeweavers?.macRating != null
  const showWine = !!applegamingwiki && !showProton

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

  const onClickProton = () => {
    createNewWindow(`https://www.protondb.com/app/${gameInfo.app_name}`)
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

  return (
    <>
      {showCrossover && (
        <a
          role="button"
          className="iconWithText"
          title={t('info.clickToOpen', 'Click to open')}
          onClick={onClickCrossover}
        >
          <CrossoverIcon style={{ width: '24px', height: '24px' }} />
          <b>{t('info.crossover-rating', 'Crossover emulation')}:</b>
          <Rating
            value={codeweavers?.macRating}
            precision={0.5}
            max={5}
            readOnly
            size="small"
          />
        </a>
      )}
      {showProton &&
        (() => {
          const stars = protonTierToStars(steamInfo?.compatibilityLevel)
          return (
            <a
              role="button"
              className="iconWithText"
              title={t('info.clickToOpen', 'Click to open')}
              onClick={onClickProton}
            >
              <WineBar />
              <b>{t('info.proton-rating', 'Proton emulation')}:</b>
              {stars !== null ? (
                <Rating value={stars} max={5} readOnly size="small" />
              ) : (
                t('info.no-compatibility-data', 'No compatibility data available')
              )}
            </a>
          )
        })()}
      {showWine && (
        <a
          role="button"
          className="iconWithText"
          title={t('info.clickToOpen', 'Click to open')}
          onClick={onClickWine}
        >
          <WineBar />
          <b>{t('info.wine-rating', 'Wine emulation')}:</b>
          {ratingTier(applegamingwiki?.wineRating ?? '').label}
        </a>
      )}
    </>
  )
}

export default AppleWikiInfo
