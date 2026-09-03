/**
 * Pins `readPersistedTourState`, the read-boundary normaliser
 * `TourContext.tsx`'s `TourProvider` initializer now calls
 * (34.12-05 Task 3, T-34.12-05-01, transferred from plan 34.12-04).
 *
 * D-01's launcher row (34.12-05 Task 2) made `hasTourCompleted()`
 * reachable from a user click for the first time in this shell.
 * `hasTourCompleted` calls `.includes()` on `completedTours`
 * unconditionally, and the old `useState` initializer `JSON.parse`d the
 * persisted value with no try/catch -- so a malformed or wrong-shaped
 * `localStorage['heroic-tour-state']` value could take down the whole app
 * tree, or throw at click time on the path this plan just created.
 *
 * `readPersistedTourState` is exported as a pure function precisely so it
 * can be exercised directly here -- this jest project has no jsdom / DOM
 * and cannot mount `TourProvider` (see `src/frontend/jest.config.js`
 * docstring).
 */
import { readPersistedTourState } from '../TourContext'

const defaultState = {
  activeTour: null,
  tourProgress: {},
  completedTours: []
}

describe('readPersistedTourState', () => {
  it('returns defaultState for null', () => {
    expect(readPersistedTourState(null)).toEqual(defaultState)
  })

  it('returns defaultState for an empty string', () => {
    expect(readPersistedTourState('')).toEqual(defaultState)
  })

  it('returns defaultState and does not throw for malformed JSON', () => {
    expect(() => readPersistedTourState('not json at all')).not.toThrow()
    expect(readPersistedTourState('not json at all')).toEqual(defaultState)
  })

  it('normalises completedTours to [] when it is null', () => {
    const result = readPersistedTourState('{"completedTours": null}')
    expect(result.completedTours).toEqual([])
  })

  it('normalises completedTours to [] when it is a string, not an array', () => {
    const result = readPersistedTourState('{"completedTours": "nav-tour"}')
    expect(result.completedTours).toEqual([])
  })

  it('returns defaultState for valid JSON whose root is not an object (an array)', () => {
    expect(readPersistedTourState('[]')).toEqual(defaultState)
  })

  it('round-trips the persistable fields of a well-formed value', () => {
    const wellFormed = {
      tourProgress: { 'nav-tour': true },
      completedTours: ['library-tour']
    }

    const result = readPersistedTourState(JSON.stringify(wellFormed))

    expect(result.tourProgress).toEqual(wellFormed.tourProgress)
    expect(result.completedTours).toEqual(wellFormed.completedTours)
  })

  /**
   * Regression pin for quick-260903-ut6. `activeTour` used to round-trip,
   * and `NavShellTour` / `LibraryTour` gate purely on
   * `isTourActive(TOUR_ID)` -- so any session that ended with a tour on
   * screen (crash, `pkill`, force-quit) reopened that tour on the next
   * launch with no user click. It also contaminated the 34.12-07 "no tour
   * on launch" observation whenever the previous run was torn down with
   * `pkill` mid-tour.
   *
   * `TourProvider` no longer writes the field, but this boundary must
   * still drop it, because it is what heals blobs already on disk.
   */
  it('never restores activeTour, even from a valid tour id', () => {
    const midTour = JSON.stringify({
      activeTour: 'nav-tour',
      tourProgress: { 'nav-tour': true },
      completedTours: ['library-tour']
    })

    expect(readPersistedTourState(midTour).activeTour).toBeNull()
  })

  it('drops activeTour without disturbing the other fields', () => {
    const midTour = JSON.stringify({
      activeTour: 'library-tour',
      tourProgress: { 'library-tour': true },
      completedTours: ['nav-tour']
    })

    expect(readPersistedTourState(midTour)).toEqual({
      activeTour: null,
      tourProgress: { 'library-tour': true },
      completedTours: ['nav-tour']
    })
  })
})
