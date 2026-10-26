/**
 * quick 261027-bqe: the tier-1 `macArch` key accepts only the literal "32".
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

describe('filterTier1KnownFixes macArch', () => {
  beforeEach(() => warn.mockClear())

  test('keeps "32" with no warning', () => {
    const out = filterTier1KnownFixes('1', 'bundled', {
      title: 'T',
      macArch: '32'
    })
    expect(out).toEqual({ title: 'T', macArch: '32' })
    expect(warn).not.toHaveBeenCalled()
  })

  test.each([['64'], [32], ['i386'], [null], ['']])(
    'drops %p with a warning',
    (value) => {
      const out = filterTier1KnownFixes('1', 'remote', {
        title: 'T',
        envVariables: { A: 'b' },
        macArch: value
      })
      expect(out).toEqual({ title: 'T', envVariables: { A: 'b' } })
      expect(warn).toHaveBeenCalledTimes(1)
      const msg = String(warn.mock.calls[0][0])
      expect(msg).toContain('macArch')
      expect(msg).toContain(JSON.stringify(value))
    }
  )

  test('key list contains macArch and not platforms', () => {
    expect(TIER1_KNOWN_FIX_KEYS).toContain('macArch')
    expect(TIER1_KNOWN_FIX_KEYS as readonly string[]).not.toContain('platforms')
  })
})
