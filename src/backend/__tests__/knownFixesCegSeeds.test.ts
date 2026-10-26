/**
 * quick 261027-gtd: the bundled CEG seed files pass the real tier-1 filter,
 * and routing-only files are recognised as such.
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
import { filterTier1KnownFixes, isRoutingOnlyTier1Fix } from '../knownFixes'

const warn = logWarning as jest.Mock

const load = (id: string) => {
  const parsed = JSON.parse(
    readFileSync(
      join(__dirname, '../../../public/fixes', `${id}-steam.json`),
      'utf8'
    )
  )
  return filterTier1KnownFixes(id, 'bundled', parsed)
}

describe('bundled CEG seeds', () => {
  beforeEach(() => warn.mockClear())

  test.each(['200510', '203140', '205930'])(
    'seed %s passes the filter cleanly and is routing-only',
    (id) => {
      const out = load(id)
      expect(out?.macArch).toBe('32')
      expect(out?.drm).toBe('ceg')
      expect(out?.title).toBeTruthy()
      expect(out?.notes?.drm).toContain('045')
      expect(out?.notes?.macArch).toContain('045')
      expect(warn).not.toHaveBeenCalled()
      expect(isRoutingOnlyTier1Fix(out!)).toBe(true)
    }
  )

  test.each(['57300', '63000', '402060'])(
    'macArch-only seed %s is routing-only (GameLib row hidden on purpose)',
    (id) => {
      expect(isRoutingOnlyTier1Fix(load(id)!)).toBe(true)
    }
  )

  test('Mining Mechs (envVariables) is a real fix', () => {
    expect(isRoutingOnlyTier1Fix(load('1603180')!)).toBe(false)
  })
})
