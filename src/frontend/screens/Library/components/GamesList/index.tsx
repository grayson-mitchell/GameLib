import React, { useContext, useEffect, useRef } from 'react'
import { GameInfo, Runner } from 'common/types'
import cx from 'classnames'
import GameCard from '../GameCard'
import ContextProvider from 'frontend/state/ContextProvider'
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
}

// When a card is focused in the library, keep it in view during controller
// (gamepad) navigation.
//
// F-34.10-06 (34.10-18 Task 2): this is a module-level function, not a
// component or an effect, so the scroll container is resolved AT CALL TIME
// inside the function body -- a module-scope lookup would run before
// `main.content` exists in the DOM. Same selector and `?? document.body`
// fallback used by Library/index.tsx's two effects (console mode and any
// future shell that does not render the nav shell have no `main.content`).
//
// The container no longer spans the whole window -- the navbar sits above
// it and the controller row below it -- so every measurement below is taken
// relative to the CONTAINER's own `getBoundingClientRect()`, not
// `window.innerHeight`/`rect.top` against 0. `trgt.parentElement!.offsetTop`
// (the old arithmetic) is measured against the focused element's
// `offsetParent`, which is not necessarily this container; swapping only the
// scroll target while keeping that arithmetic would have converted a silent
// no-op into a silent WRONG-OFFSET scroll, which is worse because it looks
// like it works. `rect` (the focused element's own viewport rect) is already
// computed here, so both destinations are expressed as:
//   container.scrollTop + (element's position relative to the container's
//   own viewport rect)
// which reduces to the container's current scroll-space offset of the
// element, regardless of what container it lives in.
const scrollCardIntoView = (ev: FocusEvent) => {
  const container =
    document.querySelector<HTMLElement>('main.content') ?? document.body

  const trgt = ev.target as HTMLElement
  const rect = trgt.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  if (rect.top < containerRect.top + 100) {
    // Too close to the container's own top edge -- compared against
    // `containerRect.top`, not window/viewport 0, because the navbar now
    // occupies the top of the window above the container. A window-relative
    // threshold would fire too early (or too late) by however much chrome
    // sits above the container.
    container.scrollTo({
      top: container.scrollTop + (rect.top - containerRect.top) - 200,
      behavior: 'smooth'
    })
  } else if (rect.bottom > containerRect.bottom - 100) {
    // Too close to the container's own bottom edge -- compared against
    // `containerRect.bottom`, not `window.innerHeight`, for the same reason:
    // the controller row now occupies window space below the container, so
    // a window-height threshold would fire too late.
    container.scrollTo({
      top:
        container.scrollTop +
        (rect.bottom - containerRect.top) -
        containerRect.height +
        150,
      behavior: 'smooth'
    })
  }
}

const GamesList = ({
  library = [],
  layout = 'grid',
  handleGameCardClick,
  isFirstLane = false,
  onlyInstalled = false,
  isRecent = false,
  isFavourite = false
}: Props): JSX.Element => {
  const { gameUpdates, allTilesInColor, titlesAlwaysVisible } =
    useContext(ContextProvider)
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement | null>(null)
  const { activeController } = useContext(ContextProvider)

  useEffect(() => {
    if (library.length) {
      const options = {
        rootMargin: '500px',
        threshold: 0
      }

      const callback: IntersectionObserverCallback = (entries, observer) => {
        const entered: string[] = []
        entries.forEach((entry) => {
          if (entry.intersectionRatio > 0) {
            // when a card is intersecting the viewport
            const appName = (entry.target as HTMLDivElement).dataset
              .appName as string

            // store this appName for later
            entered.push(appName)
            // stop observing this element
            observer.unobserve(entry.target)
          }
        })

        // dispatch an event with the newly visible cards
        // check GameCard for the other side of this detection
        window.dispatchEvent(
          new CustomEvent('visible-cards', { detail: { appNames: entered } })
        )
      }

      const observer = new IntersectionObserver(callback, options)

      document.querySelectorAll('[data-invisible]').forEach((card) => {
        observer.observe(card)
      })

      return () => {
        observer.disconnect()
      }
    }
    return () => ({})
  }, [library])

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

  return (
    <div
      style={!library.length ? { backgroundColor: 'transparent' } : {}}
      className={cx({
        gameList: layout === 'grid',
        gameListLayout: layout === 'list',
        firstLane: isFirstLane,
        allTilesInColor,
        titlesAlwaysVisible
      })}
      ref={listRef}
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
          if (gameInfo.runner !== 'sideload') {
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
                if (gameInfo.runner !== 'sideload')
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
