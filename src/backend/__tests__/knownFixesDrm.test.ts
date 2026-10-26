/**
 * quick 261027-gtd: the tier-1 `drm` key accepts only the literal "ceg".
 */

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { logWarning } from 'backend/logger'
import { filterTier1KnownFixes, TIER1_KNOWN_FIX_KEYS } from '../knownFixes'

const warn = logWarning as jest.Mock

describe('filterTier1KnownFixes drm', () => {
  beforeEach(() => warn.mockClear())

  test('keeps "ceg" with no warning', () => {
    const out = filterTier1KnownFixes('1', 'bundled', {
      title: 'T',
      drm: 'ceg'
    })
    expect(out).toEqual({ title: 'T', drm: 'ceg' })
    expect(warn).not.toHaveBeenCalled()
  })

  test('the remote layer admits it', () => {
    const out = filterTier1KnownFixes('1', 'remote', {
      title: 'T',
      macArch: '32',
      drm: 'ceg'
    })
    expect(out).toEqual({ title: 'T', macArch: '32', drm: 'ceg' })
    expect(warn).not.toHaveBeenCalled()
  })

  test.each([['CEG'], ['steamstub'], [true], [null], [''], ['drm-wrapped']])(
    'drops %p with exactly one warning',
    (value) => {
      const out = filterTier1KnownFixes('1', 'remote', {
        title: 'T',
        envVariables: { A: 'b' },
        drm: value
      })
      expect(out).toEqual({ title: 'T', envVariables: { A: 'b' } })
      expect(warn).toHaveBeenCalledTimes(1)
      const msg = String(warn.mock.calls[0][0])
      expect(msg).toContain("'drm'")
      expect(msg).toContain(JSON.stringify(value))
    }
  )

  test('TIER1_KNOWN_FIX_KEYS contains drm', () => {
    expect(TIER1_KNOWN_FIX_KEYS as readonly string[]).toContain('drm')
  })
})
