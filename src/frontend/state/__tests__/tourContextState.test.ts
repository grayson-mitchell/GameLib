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

  it('returns a well-formed round-trip value unchanged, field for field', () => {
    const wellFormed = {
      activeTour: 'nav-tour',
      tourProgress: { 'nav-tour': true },
      completedTours: ['library-tour']
    }

    expect(readPersistedTourState(JSON.stringify(wellFormed))).toEqual(
      wellFormed
    )
  })
})
