/**
 * quick 261027-gtd: knownFixSaysCeg reads the curated tier-1 `drm` hint and
 * never throws.
 */

jest.mock('backend/knownFixes', () => ({ readKnownFixes: jest.fn() }))
jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

import { readKnownFixes } from 'backend/knownFixes'
import { logWarning } from 'backend/logger'
import { knownFixSaysCeg } from '../drmKnownFix'

const read = readKnownFixes as jest.Mock

describe('knownFixSaysCeg', () => {
  beforeEach(() => {
    read.mockReset()
    ;(logWarning as jest.Mock).mockClear()
  })

  test('true when the known fix says drm ceg', () => {
    read.mockReturnValue({ title: 'X', drm: 'ceg' })
    expect(knownFixSaysCeg('200510')).toBe(true)
    expect(read).toHaveBeenCalledWith('200510', 'steam')
  })

  test('false without a drm key', () => {
    read.mockReturnValue({ title: 'X', macArch: '32' })
    expect(knownFixSaysCeg('1')).toBe(false)
  })

  test('false when no known fix exists', () => {
    read.mockReturnValue(null)
    expect(knownFixSaysCeg('1')).toBe(false)
  })

  test('false and one warning when the read throws', () => {
    read.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(knownFixSaysCeg('1')).toBe(false)
    expect(logWarning).toHaveBeenCalledTimes(1)
  })
})
