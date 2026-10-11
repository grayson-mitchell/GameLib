/**
 * Pure unit tests for the webview-zoom helpers (quick 261012-gn8, W8).
 *
 * `testEnvironment: 'node'` has no `document`, so `readWebviewZoomFactor` is driven through a
 * minimal stub installed on `globalThis` and removed after every test.
 */
import { readWebviewZoomFactor, scaleRectForZoom } from '../storeEmbedZoom'

const rect = { x: 10, y: 20, width: 300, height: 400 }

function installDocument(value: string): void {
  ;(globalThis as unknown as { document: unknown }).document = {
    documentElement: {
      style: {
        getPropertyValue: (name: string) =>
          name === '--webview-zoom' ? value : ''
      }
    }
  }
}

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document
})

describe('scaleRectForZoom', () => {
  it('multiplies every field by the factor and emits exactly x, y, w, h', () => {
    const out = scaleRectForZoom(rect, 1.2)
    expect(Object.keys(out).sort()).toEqual(['h', 'w', 'x', 'y'])
    expect(out.x).toBeCloseTo(12)
    expect(out.y).toBeCloseTo(24)
    expect(out.w).toBeCloseTo(360)
    expect(out.h).toBeCloseTo(480)
  })

  it('returns the rect unchanged at factor 1', () => {
    expect(scaleRectForZoom(rect, 1)).toEqual({ x: 10, y: 20, w: 300, h: 400 })
  })

  it.each([NaN, 0, -1, Infinity, -Infinity])(
    'treats factor %p as 1 (never emits a non-finite or inverted rect)',
    (factor) => {
      expect(scaleRectForZoom(rect, factor)).toEqual({
        x: 10,
        y: 20,
        w: 300,
        h: 400
      })
    }
  )
})

describe('readWebviewZoomFactor', () => {
  it('is 1 when there is no document global', () => {
    expect(readWebviewZoomFactor()).toBe(1)
  })

  it('is 1 when the document has no documentElement', () => {
    ;(globalThis as unknown as { document: unknown }).document = {}
    expect(readWebviewZoomFactor()).toBe(1)
  })

  it.each([
    ['1.2', 1.2],
    ['1.5', 1.5],
    [' 1.2 ', 1.2],
    ['', 1],
    ['abc', 1],
    ['0', 1],
    ['-1', 1],
    ['Infinity', 1]
  ])('property value %p reads as %p', (value, expected) => {
    installDocument(value)
    expect(readWebviewZoomFactor()).toBe(expected)
  })

  it('reads the literal --webview-zoom name (any other name yields the default)', () => {
    const getPropertyValue = jest.fn((name: string) =>
      name === '--webview-zoom' ? '1.25' : ''
    )
    ;(globalThis as unknown as { document: unknown }).document = {
      documentElement: { style: { getPropertyValue } }
    }
    expect(readWebviewZoomFactor()).toBe(1.25)
    expect(getPropertyValue).toHaveBeenCalledWith('--webview-zoom')
  })
})
