/**
 * Sidecar boot wiring for the stale engine temp sweep (G20, phase 59-33).
 *
 * Dedicated file for the same reason as playtimeLockBootClear.test.ts: each case boots once via bootFresh()
 * in a fresh module registry (D-08).
 */
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    head: jest.fn(() => Promise.resolve({ status: 200 })),
    get: jest.fn(),
    create: jest.fn(() => ({ get: jest.fn(), head: jest.fn() }))
  }
}))

const mockSweep = jest.fn()
jest.mock('backend/engine/fallbackEngine', () => ({
  __esModule: true,
  sweepStaleEngineTemps: () => mockSweep()
}))

import { bootFresh } from './helpers/sidecarHarness'

describe('G20: sidecar boot sweeps stale engine temp dirs', () => {
  it('one boot calls the sweep exactly once after initLogger and survives a throwing sweep', () => {
    mockSweep.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    expect(() => bootFresh()).not.toThrow()
    expect(mockSweep).toHaveBeenCalledTimes(1)
  })
})
