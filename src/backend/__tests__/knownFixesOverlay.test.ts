/**
 * Phase 60 D-03: the tier-1 `steamGameOverlay` key accepts only the literal
 * "off" (it can only remove an injection).
 */

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { logWarning } from 'backend/logger'
import {
  filterTier1KnownFixes,
  isRoutingOnlyTier1Fix,
  TIER1_KNOWN_FIX_KEYS
} from '../knownFixes'

const warn = logWarning as jest.Mock

describe('filterTier1KnownFixes steamGameOverlay', () => {
  beforeEach(() => warn.mockClear())

  test('keeps "off" with no warning', () => {
    const out = filterTier1KnownFixes('1', 'remote', {
      title: 'T',
      steamGameOverlay: 'off'
    })
    expect(out).toEqual({ title: 'T', steamGameOverlay: 'off' })
    expect(warn).not.toHaveBeenCalled()
  })

  test.each([['on'], [true], [false], ['OFF'], [0]])(
    'drops %p with a warning',
    (value) => {
      const out = filterTier1KnownFixes('1', 'remote', {
        title: 'T',
        steamGameOverlay: value
      })
      expect(out).toEqual({ title: 'T' })
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toContain(
        `'steamGameOverlay' accepts only "off"`
      )
    }
  )

  test('is a fix, not a routing key', () => {
    expect(isRoutingOnlyTier1Fix({ title: 'x', steamGameOverlay: 'off' })).toBe(
      false
    )
  })

  test('is a tier-1 key (and so rejected by the tier-2 allow-list)', () => {
    expect(TIER1_KNOWN_FIX_KEYS as readonly string[]).toContain(
      'steamGameOverlay'
    )
  })
})
