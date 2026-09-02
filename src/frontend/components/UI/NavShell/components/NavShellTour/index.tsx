/**
 * The shell onboarding tour, rebuilt by phase 34.12 against the two-tier
 * `NavShell`. It is manual-start only (D-02) -- nothing in this module
 * ever calls `startTour`, so the tour is reachable only via an explicit
 * user click on the Settings-panel launcher row plan 34.12-05 adds -- and
 * it is mounted unconditionally by `NavShell/index.tsx`, gating itself on
 * `isTourActive(NAV_TOUR_ID)`.
 *
 * It runs with the tour's disableInteraction option set (D-04), which is
 * what makes "the tour never switches tabs" (D-03) structurally true
 * rather than merely intended: the overlay blocks clicks on the
 * highlighted element for the duration of the step, so a highlighted
 * tier-1 tab cannot be clicked mid-run.
 *
 * The old duplicate downloads-anchor defect (two different elements
 * sharing one selector under the retired sidebar) is resolved by
 * construction here -- `DownloadsRing` is the single element carrying
 * the downloads anchor.
 *
 * This file was renamed from its retired predecessor under the deleted
 * `Sidebar/components/` tree as a git-detected rename in the prior
 * commit; this commit is the rewrite.
 */
import React, { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import Tour, { TourStep } from 'frontend/components/Tour/Tour'
import { useTour } from 'frontend/state/TourContext'
import ContextProvider from 'frontend/state/ContextProvider'

export const NAV_TOUR_ID = 'nav-tour'

const NavShellTour: React.FC = () => {
  const { t } = useTranslation()
  const { isTourActive } = useTour()
  const { platform, isRTL } = useContext(ContextProvider)

  const isWin = platform === 'win32'

  // Set position based on RTL
  const position = isRTL ? 'left' : 'right'

  // Create base steps first
  const baseSteps: TourStep[] = [
    {
      element: '[data-tour="nav-menu"]',
      intro: t(
        'tour.nav.welcome.intro',
        'Welcome to GameLib! This nav bar contains all the navigation options to explore the app.'
      ),
      title: t('tour.nav.welcome.title', 'Nav Bar')
    },
    {
      element: '[data-tour="nav-library"]',
      intro: t(
        'tour.sidebar.library',
        'Access your game library from different stores in one place.'
      ),
      position
    },
    {
      element: '[data-tour="nav-stores"]',
      intro: t(
        'tour.sidebar.stores',
        'Browse and shop for games in different stores including Epic, GOG, Amazon, and Zoom.'
      ),
      position
    },
    {
      element: '[data-tour="nav-settings"]',
      intro: t(
        'tour.sidebar.settings',
        "Configure GameLib's settings, game defaults, and more."
      ),
      position
    },
    {
      element: '[data-tour="nav-downloads"]',
      intro: t(
        'tour.sidebar.downloads',
        'Track and manage your game downloads and installations.'
      ),
      position
    }
  ]

  // Wine Manager step is for Linux and macOS (non-Windows platforms)
  if (!isWin) {
    baseSteps.push({
      element: '[data-tour="nav-wine"]',
      intro: t(
        'tour.sidebar.wine',
        'Manage your Wine/Proton versions for running Windows games on Linux.'
      ),
      position
    })
  }

  baseSteps.push({
    element: '[data-tour="nav-manage-accounts"]',
    intro: t(
      'tour.sidebar.accounts',
      'Manage your connected store accounts and sign in to new stores.'
    ),
    position
  })

  // Add the remaining steps
  const remainingSteps: TourStep[] = [
    {
      element: '[data-tour="nav-accessibility"]',
      intro: t(
        'tour.sidebar.accessibility',
        'Access accessibility features to customize your experience.'
      ),
      position
    },
    {
      element: '[data-tour="nav-docs"]',
      intro: t(
        'tour.sidebar.docs',
        'Read documentation for help with using GameLib.'
      ),
      position
    },
    {
      element: '[data-tour="nav-community"]',
      intro: t('tour.sidebar.community', "Support GameLib's development."),
      position
    },
    {
      element: '[data-tour="nav-quit"]',
      intro: t('tour.sidebar.quit', 'Exit the application safely.'),
      position
    },
    {
      element: '[data-tour="nav-version"]',
      intro: t(
        'tour.nav.version',
        'Check your current GameLib version -- click it to see the latest changelog. You can restart this tour anytime from the Settings panel.'
      ),
      position: 'top'
    }
  ]

  // Combine the base steps with the remaining steps
  const steps = [...baseSteps, ...remainingSteps]

  return (
    <Tour
      tourId={NAV_TOUR_ID}
      steps={steps}
      enabled={isTourActive(NAV_TOUR_ID)}
      options={{ disableInteraction: true }}
    />
  )
}

export default NavShellTour
