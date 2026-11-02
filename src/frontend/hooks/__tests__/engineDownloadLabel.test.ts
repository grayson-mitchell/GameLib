/**
 * 59-22 (G1, IN-05): one formatter for every built-in engine phase label.
 */
export {}

jest.mock('frontend/helpers', () => ({}))

// constants.ts reads window.localStorage at import time (no jsdom here).
;(globalThis as any).window = {
  localStorage: { getItem: () => null, setItem: () => undefined }
}
type ConstantsModule = typeof import('../constants')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const constants: ConstantsModule = require('../constants')
const { engineDownloadLabel } = constants

const t = ((key: string, def: string, vars?: Record<string, string>) =>
  (def ?? key).replace(/{{(\w+)}}/g, (_, k: string) => vars?.[k] ?? '')) as any

describe('engineDownloadLabel', () => {
  it('labels a download context with its percent', () => {
    expect(engineDownloadLabel('downloading:42', t)).toBe(
      'Downloading built-in engine (42%)'
    )
  })

  it('labels verifying', () => {
    expect(engineDownloadLabel('verifying', t)).toBe(
      'Verifying built-in engine'
    )
  })

  it('labels extracting as unpacking', () => {
    expect(engineDownloadLabel('extracting', t)).toBe(
      'Unpacking built-in engine'
    )
  })

  it('labels setting-up', () => {
    expect(engineDownloadLabel('setting-up', t)).toBe(
      'Setting up built-in engine'
    )
  })

  it('reads a bare legacy percent as a download', () => {
    expect(engineDownloadLabel('37', t)).toBe(
      'Downloading built-in engine (37%)'
    )
  })

  it('falls back to 0% for undefined or garbage (T-59-79)', () => {
    const zero = 'Downloading built-in engine (0%)'
    expect(engineDownloadLabel(undefined, t)).toBe(zero)
    expect(engineDownloadLabel('', t)).toBe(zero)
    expect(engineDownloadLabel('downloading:<b>x</b>', t)).toBe(zero)
    expect(engineDownloadLabel('wat', t)).toBe(zero)
  })
})
