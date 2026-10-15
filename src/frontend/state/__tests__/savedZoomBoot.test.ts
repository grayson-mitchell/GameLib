/**
 * Real behaviour tests over `savedZoomBoot.ts` (quick 261015-p3q). This is a
 * real import, not a source gate -- the source gate for the `GlobalState.tsx`
 * wiring is `GlobalStateSavedZoomWiring.test.ts`, and exists only because
 * `GlobalState.tsx` itself cannot be imported under this project's node jest.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ZOOM_PERCENT_MIN,
  ZOOM_PERCENT_MAX,
  ZOOM_PERCENT_DEFAULT,
  resolveSavedZoomPercent,
  applySavedZoomAtBoot
} from '../savedZoomBoot'

describe('resolveSavedZoomPercent', () => {
  it('admits the slider endpoints and the default', () => {
    expect(resolveSavedZoomPercent(150)).toBe(150)
    expect(resolveSavedZoomPercent(60)).toBe(60)
    expect(resolveSavedZoomPercent(200)).toBe(200)
    expect(resolveSavedZoomPercent(100)).toBe(100)
  })

  it('out-of-range values fall back to the default, NOT clamped to the nearest endpoint', () => {
    expect(resolveSavedZoomPercent(59)).toBe(100)
    expect(resolveSavedZoomPercent(201)).toBe(100)
    expect(resolveSavedZoomPercent(0)).toBe(100)
    expect(resolveSavedZoomPercent(-10)).toBe(100)
    expect(resolveSavedZoomPercent(10000)).toBe(100)
  })

  it('non-finite or non-number values fall back to the default', () => {
    expect(resolveSavedZoomPercent(NaN)).toBe(100)
    expect(resolveSavedZoomPercent(Infinity)).toBe(100)
    expect(resolveSavedZoomPercent(undefined)).toBe(100)
    expect(resolveSavedZoomPercent(null)).toBe(100)
    expect(resolveSavedZoomPercent('150')).toBe(100)
    expect(resolveSavedZoomPercent({})).toBe(100)
  })

  it('admits a non-integer percent inside range (the range check is the contract)', () => {
    expect(resolveSavedZoomPercent(150.5)).toBe(150.5)
  })

  it('the exported bounds match the values used above', () => {
    expect(ZOOM_PERCENT_MIN).toBe(60)
    expect(ZOOM_PERCENT_MAX).toBe(200)
    expect(ZOOM_PERCENT_DEFAULT).toBe(100)
  })
})

describe('applySavedZoomAtBoot', () => {
  it('150 -> setZoomFactor called exactly once with "1.5", returns 150', () => {
    const setZoomFactor = jest.fn()
    const onError = jest.fn()
    const result = applySavedZoomAtBoot({
      savedZoomPercent: 150,
      setZoomFactor,
      onError
    })
    expect(setZoomFactor).toHaveBeenCalledTimes(1)
    expect(setZoomFactor).toHaveBeenCalledWith('1.5')
    expect(result).toBe(150)
    expect(onError).not.toHaveBeenCalled()
  })

  it('100 -> called unconditionally with "1" (publishes --webview-zoom on boot)', () => {
    const setZoomFactor = jest.fn()
    const onError = jest.fn()
    const result = applySavedZoomAtBoot({
      savedZoomPercent: 100,
      setZoomFactor,
      onError
    })
    expect(setZoomFactor).toHaveBeenCalledTimes(1)
    expect(setZoomFactor).toHaveBeenCalledWith('1')
    expect(result).toBe(100)
  })

  it('60 -> "0.6"; 200 -> "2"', () => {
    const setZoomFactor60 = jest.fn()
    applySavedZoomAtBoot({
      savedZoomPercent: 60,
      setZoomFactor: setZoomFactor60,
      onError: jest.fn()
    })
    expect(setZoomFactor60).toHaveBeenCalledWith('0.6')

    const setZoomFactor200 = jest.fn()
    applySavedZoomAtBoot({
      savedZoomPercent: 200,
      setZoomFactor: setZoomFactor200,
      onError: jest.fn()
    })
    expect(setZoomFactor200).toHaveBeenCalledWith('2')
  })

  it('undefined savedZoomPercent resolves to 100 -> "1"', () => {
    const setZoomFactor = jest.fn()
    const result = applySavedZoomAtBoot({
      savedZoomPercent: undefined,
      setZoomFactor,
      onError: jest.fn()
    })
    expect(setZoomFactor).toHaveBeenCalledWith('1')
    expect(result).toBe(100)
  })

  it('is UNDEBOUNCED: already called once by the time the function returns, no timer to advance', () => {
    jest.useFakeTimers()
    try {
      const setZoomFactor = jest.fn()
      applySavedZoomAtBoot({
        savedZoomPercent: 150,
        setZoomFactor,
        onError: jest.fn()
      })
      // Asserted BEFORE any advanceTimersByTime.
      expect(setZoomFactor).toHaveBeenCalledTimes(1)
      jest.advanceTimersByTime(1000)
      // Still 1 after advancing -- no second, deferred call.
      expect(setZoomFactor).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('setZoomFactor throws -> onError called with the thrown value, nothing propagates', () => {
    const thrown = new Error('bridge down')
    const setZoomFactor = jest.fn(() => {
      throw thrown
    })
    const onError = jest.fn()
    expect(() =>
      applySavedZoomAtBoot({
        savedZoomPercent: 150,
        setZoomFactor,
        onError
      })
    ).not.toThrow()
    expect(onError).toHaveBeenCalledWith(thrown)
  })

  it('onError itself throws -> still nothing propagates', () => {
    const setZoomFactor = jest.fn(() => {
      throw new Error('bridge down')
    })
    const onError = jest.fn(() => {
      throw new Error('reporter down too')
    })
    expect(() =>
      applySavedZoomAtBoot({
        savedZoomPercent: 150,
        setZoomFactor,
        onError
      })
    ).not.toThrow()
  })

  it('anti-drift: the Accessibility range input min/max equal the exported bounds', () => {
    const accessibilityPath = join(
      __dirname,
      '..',
      '..',
      'screens',
      'Accessibility',
      'index.tsx'
    )
    const source = readFileSync(accessibilityPath, 'utf-8')
    const minMatch = source.match(/<input[\s\S]*?min="(\d+)"/)
    const maxMatch = source.match(/<input[\s\S]*?max="(\d+)"/)
    expect(minMatch).not.toBeNull()
    expect(maxMatch).not.toBeNull()
    expect(Number(minMatch?.[1])).toBe(ZOOM_PERCENT_MIN)
    expect(Number(maxMatch?.[1])).toBe(ZOOM_PERCENT_MAX)
  })
})
