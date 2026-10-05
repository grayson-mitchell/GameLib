import React, { useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Tour, { TourStep } from '../../../components/Tour/Tour'
import { useTour } from '../../../state/TourContext'
import ContextProvider from 'frontend/state/ContextProvider'

export const LIBRARY_TOUR_ID = 'library-tour'

// 261002-hx0: the tour's anchors now live inside the scroll-clipped tier-2
// panel (the former sidebar column), not the always-visible main content
// area -- an anchor below the panel's current scroll position would
// otherwise sit off-screen when intro.js tries to position its tooltip
// against it. `scrollToElement: true` (intro.js's own default is already
// true, but it is restated here so this is not silently reverted by an
// options object replacing it) brings each step's target into view inside
// its own scrollable ancestor before positioning; `scrollPadding` keeps the
// anchor from being scrolled flush against the panel's edge, which would
// otherwise sit under the panel's own sticky top/bottom chrome.
const TOUR_OPTIONS = {
  scrollToElement: true,
  scrollPadding: 20
}

const LibraryTour: React.FC = () => {
  const { t } = useTranslation()
  // New copy lives in the fork-owned gamelib namespace (phase 34.12 D-07:
  // mint a key rather than edit a default an existing catalogue overrides).
  const { t: tGamelib } = useTranslation('gamelib')
  const { isTourActive } = useTour()
  // Import context to check if there are any games in the library
  const { epic, gog, amazon, steam, zoom, sideloadedLibrary } =
    useContext(ContextProvider)

  // Check if there are any games in the library
  const hasGames = Boolean(
    epic.library.length ||
    gog.library.length ||
    amazon.library.length ||
    steam.library.length ||
    zoom.library.length ||
    sideloadedLibrary.length
  )

  // Hygiene, not the blank-tooltip fix (debug introjs-tooltip-not-rendering,
  // "RECORD CORRECTION" -- the real fix is in Tour.scss): intro.js-react's
  // componentDidUpdate compares `steps` BY REFERENCE, and this array was
  // rebuilt fresh on every render, so intro.js re-ran its step setup on
  // every render. Memoized on the actual inputs used to build it below.
  const steps: TourStep[] = useMemo(() => {
    // Create intro steps first
    const introSteps: TourStep[] = [
      {
        intro: t(
          'tour.library.welcome.intro',
          'Welcome to the GameLib Library! This is where you can see all your games across different stores.'
        ),
        title: t('tour.library.welcome.title', 'Welcome to GameLib!')
      },
      {
        intro: tGamelib(
          'gamelib:tour.library.welcome.intro2',
          'If the library is empty, sign in to your stores from the Accounts tab, or add your own games with the Add Game button.'
        ),
        title: t('tour.library.welcome.title2', 'Managing the library!')
      }
    ]

    // Only include the game card step if there are games in the library
    const gameCardStep: TourStep[] = hasGames
      ? [
          {
            element: '[data-tour="library-game-card"]',
            intro: t(
              'tour.library.gameCard',
              'Left-Click on the game card to navigate to the game page and to see details and adjust settings or Right-click to open the context menu.'
            )
          }
        ]
      : []

    // Other UI elements steps
    const uiSteps: TourStep[] = [
      {
        element: '[data-tour="library-search"]',
        intro: t(
          'tour.library.search',
          'Use the Search bar to search for your games.'
        ),
        position: 'bottom'
      },
      {
        element: '[data-tour="library-views-collections"]',
        intro: t(
          'tour.library.viewsCollections',
          'Switch between Views like All games, Installed, Recently played and Favourites, or browse your custom Collections.'
        ),
        position: 'bottom'
      },
      {
        element: '[data-tour="library-facets"]',
        intro: t(
          'tour.library.facets',
          'Narrow your games by store, runnability or open More filters for additional options.'
        ),
        position: 'bottom'
      },
      {
        element: '[data-tour="library-view-toggle"]',
        intro: t(
          'tour.library.viewToggle',
          'Switch between grid and list view for your games.'
        ),
        position: 'bottom'
      },
      {
        element: '[data-tour="library-sort-az"]',
        intro: t(
          'tour.library.sortOptions',
          'Click here to sort games alphabetically.'
        ),
        position: 'left'
      },
      {
        element: '[data-tour="library-sort-installed"]',
        intro: t(
          'tour.library.sortInstalled',
          'Sort games by installed status.'
        ),
        position: 'left'
      },
      {
        element: '[data-tour="library-add-game"]',
        intro: t(
          'tour.library.addGame',
          'Add your own games or apps to the library by clicking here. They can be basically anything, even Browser URLs.'
        ),
        position: 'left'
      },
      {
        element: '[data-tour="library-refresh"]',
        intro: t(
          'tour.library.refresh',
          'Refresh your library to check for new games or updates.'
        ),
        position: 'bottom'
      }
    ]

    // Final step
    const finalStep: TourStep[] = [
      {
        intro: t(
          'tour.library.end.intro',
          "That's it! Enjoy your games and have fun!"
        ),
        title: t('tour.library.end.title', 'Enjoy your games!')
      }
    ]

    // Combine all steps
    return [...introSteps, ...gameCardStep, ...uiSteps, ...finalStep]
  }, [t, tGamelib, hasGames])

  return (
    <Tour
      tourId={LIBRARY_TOUR_ID}
      steps={steps}
      enabled={isTourActive(LIBRARY_TOUR_ID)}
      options={TOUR_OPTIONS}
    />
  )
}

export default LibraryTour
