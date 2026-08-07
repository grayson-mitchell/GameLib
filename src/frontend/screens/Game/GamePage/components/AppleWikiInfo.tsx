import { MouseEvent, useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import { Refresh, WineBar } from '@mui/icons-material'
import { IconButton, Rating } from '@mui/material'
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
  const { t: tGamelib } = useTranslation('gamelib')
  const { wikiInfo, is, refreshWikiInfo } = useContext(GameContext)
  const [refreshing, setRefreshing] = useState(false)

  const onClickRefresh = async (
    event: MouseEvent<HTMLButtonElement>
  ) => {
    // Stop the parent <a onClick={onClickCrossover}> from opening CodeWeavers.
    event.stopPropagation()
    event.preventDefault()
    setRefreshing(true)
    try {
      await refreshWikiInfo?.()
    } finally {
      setRefreshing(false)
    }
  }

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
  const showCrossover = is.mac && !!codeweavers
  const showWine = !!applegamingwiki && !showProton
  // D-08 (Phase 17): confirmed-not-native macOS Steam games run through the
  // Windows Steam client inside a GameLib-managed CrossOver/Wine bottle
  // (Phase 17). `is.native` already early-returns above, but this row is
  // gated on the concrete platformsCaptured-aware flag (is_mac_native ===
  // false, not just falsy/undefined) so it only fires for CONFIRMED
  // non-native games, matching the backend's D-11-safe eligibility check.
  // Plan 09 (D-08 reconciliation): also requires steamPlatformsCaptured===true
  // so the indicator matches the backend routing gate (games.ts
  // isBottleEligible()) exactly — a never-synced game defaults is_mac_native
  // to false (library.ts), which alone would over-promise the bottle
  // indicator for a game that hasn't actually been confirmed Windows-only.
  const showBottle =
    is.mac &&
    gameInfo.runner === 'steam' &&
    gameInfo.is_mac_native === false &&
    gameInfo.steamPlatformsCaptured === true

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
      {showBottle && (
        <span
          className="iconWithText"
          title={t('info.runs-via-bottle', 'Runs via Windows Steam bottle')}
        >
          <CrossoverIcon style={{ width: '24px', height: '24px' }} />
          <b>{t('info.runs-via-bottle', 'Runs via Windows Steam bottle')}</b>
        </span>
      )}
      {showCrossover && (
        <a
          role="button"
          className="iconWithText"
          title={t('info.clickToOpen', 'Click to open')}
          onClick={onClickCrossover}
        >
          <CrossoverIcon style={{ width: '24px', height: '24px' }} />
          <b>{t('info.crossover-rating', 'Crossover emulation')}:</b>
          {codeweavers?.macRating != null ? (
            <Rating
              value={codeweavers.macRating}
              precision={0.5}
              max={5}
              readOnly
              size="small"
            />
          ) : (
            t('info.unrated', 'Unrated')
          )}
          <IconButton
            size="small"
            color="inherit"
            disabled={refreshing}
            onClick={onClickRefresh}
            title={t('info.refresh-rating', 'Refresh rating')}
            aria-label={t('info.refresh-rating', 'Refresh rating')}
          >
            <Refresh fontSize="small" />
          </IconButton>
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
                t('info.unrated', 'Unrated')
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
          {ratingTier(applegamingwiki?.wineRating ?? '', tGamelib).label}
        </a>
      )}
    </>
  )
}

export default AppleWikiInfo
