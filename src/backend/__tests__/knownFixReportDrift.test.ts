import {
  KNOWN_FIX_REPORT_PAIRS,
  parseKnownFixReport
} from 'common/knownFixReport'

jest.mock('../logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { TIER1_ROUTING_KEYS, filterTier1KnownFixes } from '../knownFixes'

const report = (key: string, value: string) => ({
  v: 1,
  store: 'steam',
  appId: '1234',
  key,
  value,
  op: 'add',
  gamelibVersion: '0.8.0'
})

describe('known-fix report drift (D-03)', () => {
  it('KNOWN_FIX_REPORT_PAIRS keys equal TIER1_ROUTING_KEYS', () => {
    expect(Object.keys(KNOWN_FIX_REPORT_PAIRS).sort()).toEqual(
      [...TIER1_ROUTING_KEYS].sort()
    )
  })

  it.each(Object.entries(KNOWN_FIX_REPORT_PAIRS))(
    'filterTier1KnownFixes keeps %s=%s',
    (k, v) => {
      const out = filterTier1KnownFixes('x', 'test', { [k]: v })
      expect((out as Record<string, unknown>)?.[k]).toBe(v)
    }
  )

  it.each([
    ['macArch', '64'],
    ['drm', 'none']
  ])('a wrong %s value is dropped by the filter and the schema', (k, v) => {
    const out = filterTier1KnownFixes('x', 'test', { [k]: v })
    expect((out as Record<string, unknown> | null)?.[k]).toBeUndefined()
    expect(parseKnownFixReport(report(k, v)).ok).toBe(false)
  })
})
