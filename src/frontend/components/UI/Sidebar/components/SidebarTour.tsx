/**
 * DO NOT DELETE -- this file is KEPT ON PURPOSE. It is the work-list for
 * **Phase 34.12** (onboarding tour rework), not an orphan left behind by the
 * sidebar's removal. It is the only surviving file of the retired `Sidebar/`
 * tree, and plan 34.10-09 Task 3 preserved it by name while deleting the
 * other eleven files around it.
 *
 * DISABLED by Phase 34.10 (D-13) -- not mounted by anything. The onboarding
 * tour this file drives depended on the retired left navigation (deleted by
 * 34.10-09 Task 3); this one file is deliberately kept on disk because it
 * plus its twelve `data-tour="sidebar-*"` step selectors below are Phase
 * 34.12's work-list -- re-anchoring each step against the new two-tier shell.
 * `NavShell/__tests__/tourDisabled.test.ts` proves both of the retired
 * navigation's tour entry points (this component's own mount, and the second
 * one -- the help button `HeroicVersion` used to render, removed in 34.10-07)
 * are unreachable.
 *
 * An empty-looking `Sidebar/` directory containing only this file is the
 * EXPECTED end state, and it has already been mistaken for abandoned work
 * once (a 2026-08-13 audit follow-up proposed deleting it before reading
 * 34.10-09). Deleting it would destroy Phase 34.12's input, reverse D-13, and
 * make `tourDisabled.test.ts`'s "no live importer" check vacuously true.
 *
 * Known pre-existing defect for the rework phase to fix, not to rediscover:
 * two different elements used to carry the SAME `data-tour="sidebar-downloads"`
 * value -- the retired `Sidebar/index.tsx`'s `currentDownloads` wrapper div,
 * and the "Downloads" nav row inside the retired `SidebarLinks`. A step
 * selector that matches two elements is ambiguous; whichever the tour
 * library picked first was never guaranteed to be the intended one.
 *
 * Nothing else in this file changes -- its step text and i18n keys are the
 * rework phase's input, not this plan's.
 */
import React, { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import Tour, { TourStep } from '../../../../components/Tour/Tour'
import { useTour } from '../../../../state/TourContext'
import ContextProvider from 'frontend/state/ContextProvider'

export const SIDEBAR_TOUR_ID = 'sidebar-tour'

const SidebarTour: React.FC = () => {
  const { t } = useTranslation()
  const { isTourActive } = useTour()
  const { platform, isRTL } = useContext(ContextProvider)

  const isWin = platform === 'win32'

  // Set position based on RTL
  const position = isRTL ? 'left' : 'right'

  // Create base steps first
  const baseSteps: TourStep[] = [
    {
      element: '[data-tour="sidebar-menu"]',
      intro: t(
        'tour.sidebar.welcome.intro',
        'Welcome to GameLib! This sidebar contains all the navigation options to explore the app.'
      ),
      title: t('tour.sidebar.welcome.title', 'Sidebar Navigation')
    },
    {
      element: '[data-tour="sidebar-library"]',
      intro: t(
        'tour.sidebar.library',
        'Access your game library from different stores in one place.'
      ),
      position
    },
    {
      element: '[data-tour="sidebar-stores"]',
      intro: t(
        'tour.sidebar.stores',
        'Browse and shop for games in different stores including Epic, GOG, Amazon, and Zoom.'
      ),
      position
    },
    {
      element: '[data-tour="sidebar-settings"]',
      intro: t(
        'tour.sidebar.settings',
        "Configure GameLib's settings, game defaults, and more."
      ),
      position
    },
    {
      element: '[data-tour="sidebar-downloads"]',
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
      element: '[data-tour="sidebar-wine"]',
      intro: t(
        'tour.sidebar.wine',
        'Manage your Wine/Proton versions for running Windows games on Linux.'
      ),
      position
    })
  }

  baseSteps.push({
    element: '[data-tour="sidebar-manage-accounts"]',
    intro: t(
      'tour.sidebar.accounts',
      'Manage your connected store accounts and sign in to new stores.'
    ),
    position
  })

  // Add the remaining steps
  const remainingSteps: TourStep[] = [
    {
      element: '[data-tour="sidebar-accessibility"]',
      intro: t(
        'tour.sidebar.accessibility',
        'Access accessibility features to customize your experience.'
      ),
      position
    },
    {
      element: '[data-tour="sidebar-docs"]',
      intro: t(
        'tour.sidebar.docs',
        'Read documentation for help with using GameLib.'
      ),
      position
    },
    {
      element: '[data-tour="sidebar-community"]',
      intro: t('tour.sidebar.community', "Support GameLib's development."),
      position
    },
    {
      element: '[data-tour="sidebar-quit"]',
      intro: t('tour.sidebar.quit', 'Exit the application safely.'),
      position
    },
    {
      element: '[data-tour="sidebar-version"]',
      intro: t(
        'tour.sidebar.version',
        'Check your current GameLib version and access tours from here.'
      ),
      position: 'top'
    }
  ]

  // Combine the base steps with the remaining steps
  const steps = [...baseSteps, ...remainingSteps]

  return (
    <Tour
      tourId={SIDEBAR_TOUR_ID}
      steps={steps}
      enabled={isTourActive(SIDEBAR_TOUR_ID)}
    />
  )
}

export default SidebarTour
