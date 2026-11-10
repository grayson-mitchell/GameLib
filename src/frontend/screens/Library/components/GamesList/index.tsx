import { isStore } from 'common/storeCapabilities'
import React, { useEffect, useRef } from 'react'
import { GameInfo, Runner } from 'common/types'
import cx from 'classnames'
import GameCard from '../GameCard'
import { scrollCardIntoView } from './scrollCardIntoView'
import useLibraryState from 'frontend/state/libraryState'
import useSettingsState from 'frontend/state/settingsState'
import useUiState from 'frontend/state/uiState'
import { useTranslation } from 'react-i18next'

interface Props {
  library: GameInfo[]
  layout?: string
  isFirstLane?: boolean
  handleGameCardClick: (
    app_name: string,
    runner: Runner,
    gameInfo: GameInfo
  ) => void
  onlyInstalled?: boolean
  isRecent?: boolean
  isFavourite?: boolean
  ariaLabel?: string
}

const GamesList = ({
  library = [],
  layout = 'grid',
  handleGameCardClick,
  isFirstLane = false,
  onlyInstalled = false,
  isRecent = false,
  isFavourite = false,
  ariaLabel
}: Props): JSX.Element => {
  const gameUpdates = useLibraryState((s) => s.gameUpdates)
  const { allTilesInColor, titlesAlwaysVisible, hideTitles, cleanTiles } =
    useSettingsState.keys(
      'allTilesInColor',
      'titlesAlwaysVisible',
      'hideTitles',
      'cleanTiles'
    )
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement | null>(null)
  const activeController = useUiState((s) => s.activeController)

  useEffect(() => {
    if (listRef.current && activeController) {
      listRef.current.addEventListener('focus', scrollCardIntoView, {
        capture: true
      })

      return () => {
        listRef.current?.removeEventListener('focus', scrollCardIntoView, {
          capture: true
        })
      }
    }

    return () => ({})
  }, [listRef.current, activeController])

  // `role="group"` plus `aria-label` is deliberate, not a landmark upgrade:
  // `aria-label` alone on a roleless generic `<div>` is not reliably exposed
  // as an accessible name, and `group` is the minimal role that accepts a
  // name while requiring no owned children and adding no landmark. Only set
  // when a caller passes one, so the Favourites and Recently-Played mounts
  // stay byte-identical to before.
  return (
    <div
      style={!library.length ? { backgroundColor: 'transparent' } : {}}
      className={cx({
        gameList: layout === 'grid',
        gameListLayout: layout === 'list',
        firstLane: isFirstLane,
        allTilesInColor,
        titlesAlwaysVisible,
        hideTitles,
        cleanTiles
      })}
      ref={listRef}
      {...(ariaLabel ? { role: 'group', 'aria-label': ariaLabel } : {})}
    >
      {layout === 'list' && (
        <div className="gameListHeader">
          <span>{t('game.title', 'Game Title')}</span>
          <span>{t('game.status', 'Status')}</span>
          <span>{t('game.store', 'Store')}</span>
          <span>{t('wine.actions', 'Action')}</span>
        </div>
      )}
      {!!library.length &&
        library.map((gameInfo, index) => {
          const { app_name, is_installed, runner } = gameInfo
          const isJustPlayed = (isFavourite || isRecent) && index === 0
          let is_dlc = false
          if (!isStore(gameInfo, 'sideload')) {
            is_dlc = gameInfo.install.is_dlc ?? false
          }

          if (is_dlc) {
            return null
          }
          if (!is_installed && onlyInstalled) {
            return null
          }

          const hasUpdate = is_installed && gameUpdates?.includes(app_name)
          return (
            <GameCard
              key={`${runner}_${app_name}${isFirstLane ? '_firstlane' : ''}`}
              hasUpdate={hasUpdate}
              buttonClick={() => {
                if (!isStore(gameInfo, 'sideload'))
                  handleGameCardClick(app_name, runner, gameInfo)
              }}
              forceCard={layout === 'grid'}
              isRecent={isRecent}
              gameInfo={gameInfo}
              justPlayed={isJustPlayed}
              dataTour={index === 0 ? 'library-game-card' : undefined}
            />
          )
        })}
    </div>
  )
}

export default React.memo(GamesList)
