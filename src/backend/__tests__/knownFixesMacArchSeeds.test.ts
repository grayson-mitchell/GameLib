/**
 * quick 261027-bqe: the bundled macArch seed files pass the real tier-1 filter.
 */

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { readFileSync } from 'fs'
import { join } from 'path'
import { logWarning } from 'backend/logger'
import { filterTier1KnownFixes } from '../knownFixes'

const warn = logWarning as jest.Mock

describe('bundled macArch seeds', () => {
  beforeEach(() => warn.mockClear())

  test.each(['57300', '63000', '402060'])(
    'bundled seed %s passes the filter cleanly',
    (id) => {
      const parsed = JSON.parse(
        readFileSync(
          join(__dirname, '../../../public/fixes', `${id}-steam.json`),
          'utf8'
        )
      )
      const out = filterTier1KnownFixes(id, 'bundled', parsed)
      expect(out?.macArch).toBe('32')
      expect(out?.title).toBeTruthy()
      expect(warn).not.toHaveBeenCalled()
    }
  )
})
