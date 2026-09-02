import React, { createContext, useState, useContext, ReactNode } from 'react'

// Define the shape of our tour state
type TourState = {
  activeTour: string | null
  tourProgress: Record<string, boolean>
  completedTours: string[]
}

// Define the context value shape
type TourContextType = {
  tourState: TourState
  startTour: (tourId: string) => void
  endTour: (tourId: string, completed?: boolean) => void
  resetTour: (tourId: string) => void
  isTourActive: (tourId: string) => boolean
  hasTourCompleted: (tourId: string) => boolean
}

const defaultState: TourState = {
  activeTour: null,
  tourProgress: {},
  completedTours: []
}

/**
 * Reads and normalises the persisted tour state (34.12-05 Task 3,
 * T-34.12-05-01). `SettingsPanel`'s D-01 launcher row makes
 * `hasTourCompleted()` reachable from a user click for the first time in
 * this shell, and `hasTourCompleted` calls `.includes()` on
 * `completedTours` unconditionally -- so a well-formed-JSON-but-wrong-shape
 * persisted value would throw at click time, not just at mount.
 *
 * Normalised at this single READ boundary rather than defended at each
 * consumer (this project's established preference -- see the CacheStore /
 * `refresh()` read-boundary self-healing precedent in project memory) so
 * `isTourActive`/`hasTourCompleted` keep their current one-line shapes.
 * Exported as a pure function, independent of `useState`/`localStorage`,
 * so it is directly unit-testable in a jest project with no jsdom.
 */
export function readPersistedTourState(raw: string | null): TourState {
  if (!raw) {
    return defaultState
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaultState
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return defaultState
  }

  const candidate = parsed as Partial<TourState>

  const activeTour =
    typeof candidate.activeTour === 'string' || candidate.activeTour === null
      ? candidate.activeTour
      : defaultState.activeTour

  const tourProgress =
    typeof candidate.tourProgress === 'object' &&
    candidate.tourProgress !== null &&
    !Array.isArray(candidate.tourProgress)
      ? candidate.tourProgress
      : defaultState.tourProgress

  const completedTours = Array.isArray(candidate.completedTours)
    ? candidate.completedTours
    : defaultState.completedTours

  return { activeTour, tourProgress, completedTours }
}

// Create the context with a default value
const TourContext = createContext<TourContextType>({
  tourState: defaultState,
  startTour: () => {},
  endTour: () => {},
  resetTour: () => {},
  isTourActive: () => false,
  hasTourCompleted: () => false
})

type TourProviderProps = {
  children: ReactNode
}

export const TourProvider: React.FC<TourProviderProps> = ({ children }) => {
  const [tourState, setTourState] = useState<TourState>(() =>
    readPersistedTourState(localStorage.getItem('heroic-tour-state'))
  )

  // Save state to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem('heroic-tour-state', JSON.stringify(tourState))
  }, [tourState])

  const startTour = (tourId: string) => {
    setTourState((prev) => ({
      ...prev,
      activeTour: tourId
    }))
  }

  const endTour = (tourId: string, completed = false) => {
    setTourState((prev) => ({
      ...prev,
      activeTour: null,
      completedTours: completed
        ? [...prev.completedTours, tourId]
        : prev.completedTours
    }))
  }

  const resetTour = (tourId: string) => {
    setTourState((prev) => ({
      ...prev,
      completedTours: prev.completedTours.filter((id) => id !== tourId)
    }))
  }

  const isTourActive = (tourId: string) => tourState.activeTour === tourId

  const hasTourCompleted = (tourId: string) =>
    tourState.completedTours.includes(tourId)

  return (
    <TourContext.Provider
      value={{
        tourState,
        startTour,
        endTour,
        resetTour,
        isTourActive,
        hasTourCompleted
      }}
    >
      {children}
    </TourContext.Provider>
  )
}

// Custom hook to use the tour context
export const useTour = () => useContext(TourContext)
