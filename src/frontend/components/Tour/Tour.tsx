import React from 'react'
import { Steps, StepsProps } from 'intro.js-react'
import 'intro.js/introjs.css'
import './Tour.scss'
import { useTranslation } from 'react-i18next'
import { useTour } from '../../state/TourContext'

export interface TourStep {
  intro: string
  element?: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto' | 'center'
  title?: string
}

interface TourProps {
  tourId: string
  steps: TourStep[]
  enabled?: boolean
  onComplete?: () => void
  onExit?: () => void
  options?: StepsProps['options']
}

const Tour: React.FC<TourProps> = ({
  tourId,
  steps,
  enabled = false,
  onComplete,
  onExit,
  options
}) => {
  const { t } = useTranslation()
  const { isTourActive, endTour } = useTour()

  const isActive = enabled || isTourActive(tourId)

  // Hygiene, not the blank-tooltip fix (debug introjs-tooltip-not-rendering,
  // "RECORD CORRECTION"): intro.js-react's Steps.componentDidUpdate re-runs
  // configureIntroJs()+renderSteps() whenever `options` changes BY REFERENCE,
  // and this object was a fresh literal on every render, so that work re-ran
  // on every render. Memoizing removes the waste. It did NOT cause the blank
  // tooltip -- that was WebKit not painting a visible child of a
  // `visibility: hidden` ancestor, fixed in Tour.scss
  // (`.introjs-tooltipReferenceLayer { visibility: visible }`).
  const defaultOptions = React.useMemo(
    () => ({
      nextLabel: t('tour.next', 'Next'),
      prevLabel: t('tour.back', 'Back'),
      skipLabel: t('tour.skip', 'Skip'),
      doneLabel: t('tour.done', 'Done'),
      showStepNumbers: false,
      showBullets: true,
      exitOnOverlayClick: true,
      disableInteraction: false,
      highlightClass: 'heroic-tour-highlight',
      tooltipClass: 'heroic-tour-tooltip',
      overlayOpacity: 0.7,
      scrollToElement: false,
      scrollPadding: 0
    }),
    [t]
  )

  // Also memoized for the same reason: this merged object is what actually
  // reaches <Steps options={...}>, so its identity must be stable too. This is
  // NOT sufficient on its own if the `options` prop itself is a fresh literal at
  // the call site (see NavShellTour) or if `steps` is unstable (see NavShellTour /
  // LibraryTour) -- both are fixed alongside this change.
  const mergedOptions = React.useMemo(
    () => ({
      ...defaultOptions,
      ...options
    }),
    [defaultOptions, options]
  )

  const handleComplete = () => {
    endTour(tourId, true)
    onComplete?.()
  }

  const handleExit = () => {
    endTour(tourId, false)
    onExit?.()
  }

  return (
    <Steps
      enabled={isActive}
      steps={steps}
      initialStep={0}
      onExit={handleExit}
      onComplete={handleComplete}
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      options={mergedOptions}
    />
  )
}

export default Tour
