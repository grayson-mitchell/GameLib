import { MouseEvent, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GameContext from '../../GameContext'
import { Refresh, WineBar } from '@mui/icons-material'
import { IconButton, Rating } from '@mui/material'
import { createNewWindow } from 'frontend/helpers'
import { GameInfo } from 'common/types'
import type { SteamBridgeRouteVerdict } from 'common/types/steam'
import { ratingTier } from './appleRating'
import { protonTierToStars } from './protonRating'
import { resolveBridgeRouteDisplay } from './bridgeRouteDisplay'
import CrossoverIcon from 'frontend/assets/crossover_icon.svg?react'

interface Props {
  gameInfo: GameInfo
}

const AppleWikiInfo = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation('gamelib')
  const { wikiInfo, is, refreshWikiInfo } = useContext(GameContext)
  const [refreshing, setRefreshing] = useState(false)

  // Plan 16 (D-51-09/D-51-02): the game-page route row + limited-features
  // lines. Fetched once per game via its own bridge-route IPC round trip
  // (below). Declared before the early `!wikiInfo`/`is.native` returns below
  // so this hook always runs in the same order across renders (Rules of
  // Hooks), independent of whether those two values change between them.
  const [bridgeVerdict, setBridgeVerdict] = useState<
    SteamBridgeRouteVerdict | undefined
  >(undefined)

  useEffect(() => {
    if (gameInfo.runner !== 'steam') {
      return
    }
    let bridgeRouteCancelled = false
    window.api
      .getSteamBridgeRoute(gameInfo.app_name)
      .then((verdict) => {
        if (!bridgeRouteCancelled) setBridgeVerdict(verdict)
      })
      .catch(() => {
        // D-51-09: fail-closed-and-silent -- resolveBridgeRouteDisplay
        // treats an undefined verdict the same as 'not-eligible', so the
        // row simply stays hidden.
        if (!bridgeRouteCancelled) setBridgeVerdict(undefined)
      })
    return () => {
      bridgeRouteCancelled = true
    }
  }, [gameInfo.runner, gameInfo.app_name])

  const onClickRefresh = async (event: MouseEvent<HTMLButtonElement>) => {
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

  const bridgeLine = resolveBridgeRouteDisplay(bridgeVerdict)

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
            title={tGamelib('info.refresh-rating', 'Refresh rating')}
            aria-label={tGamelib('info.refresh-rating', 'Refresh rating')}
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
      {bridgeLine.visible && (
        <span className="iconWithText steamBridgeRouteRow">
          <b>
            {tGamelib('gamelib:steam.bridge.route.label', 'Steam route')}
            {': '}
          </b>
          {tGamelib(
            bridgeLine.routeKey === 'native'
              ? 'gamelib:steam.bridge.route.native'
              : 'gamelib:steam.bridge.route.bottled',
            bridgeLine.routeKey === 'native'
              ? 'Native Steam bridge'
              : 'Bottled Steam client'
          )}
          {bridgeLine.reasonKey && (
            <>
              {' — '}
              {tGamelib(`gamelib:${bridgeLine.reasonKey}`, {
                reason: bridgeLine.reasonParams.reasonKey
                  ? tGamelib(`gamelib:${bridgeLine.reasonParams.reasonKey}`)
                  : undefined
              })}
            </>
          )}
          {bridgeLine.missingSymbols.length > 0 && (
            <span className="steamBridgeMissingSymbols">
              {' '}
              {tGamelib(
                'gamelib:steam.bridge.route.missingSymbols',
                'Not covered: {{symbols}}',
                { symbols: bridgeLine.missingSymbols.join(', ') }
              )}
            </span>
          )}
          {bridgeLine.limitedLineKeys.map((key) => (
            <span key={key} className="steamBridgeLimitedLine">
              {' '}
              {tGamelib(`gamelib:${key}`)}
            </span>
          ))}
        </span>
      )}
    </>
  )
}

export default AppleWikiInfo
