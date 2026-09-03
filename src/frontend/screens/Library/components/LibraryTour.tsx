import React, { useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Tour, { TourStep } from '../../../components/Tour/Tour'
import { useTour } from '../../../state/TourContext'
import ContextProvider from 'frontend/state/ContextProvider'

export const LIBRARY_TOUR_ID = 'library-tour'

const LibraryTour: React.FC = () => {
  const { t } = useTranslation()
  const { isTourActive } = useTour()
  // Import context to check if there are any games in the library
  const { epic, gog, amazon, sideloadedLibrary } = useContext(ContextProvider)

  // Check if there are any games in the library
  const hasGames = Boolean(
    epic.library.length ||
    gog.library.length ||
    amazon.library.length ||
    sideloadedLibrary.length
  )

  // FIX (introjs-tooltip-not-rendering): intro.js-react's componentDidUpdate
  // compares `steps` BY REFERENCE. This array was rebuilt fresh on every
  // render, so the guard was always-true and re-triggered intro.js's
  // show-step path continuously, starving the tooltip's opacity restore.
  // Memoized on the actual inputs used to build it below.
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
        intro: t(
          'tour.library.welcome.intro2',
          'If the library is empty, make sure to login with your accounts using the Manage accounts on the sidebar or add your own games using the Add Game button above.'
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
        element: '[data-tour="library-refresh"]',
        intro: t(
          'tour.library.refresh',
          'Refresh your library to check for new games or updates.'
        ),
        position: 'bottom'
      },
      {
        element: '[data-tour="library-add-game"]',
        intro: t(
          'tour.library.addGame',
          'Add your own games or apps to the library by clicking here. They can be basically anything, even Browser URLs.'
        ),
        position: 'left'
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
  }, [t, hasGames])

  return (
    <Tour
      tourId={LIBRARY_TOUR_ID}
      steps={steps}
      enabled={isTourActive(LIBRARY_TOUR_ID)}
    />
  )
}

export default LibraryTour
