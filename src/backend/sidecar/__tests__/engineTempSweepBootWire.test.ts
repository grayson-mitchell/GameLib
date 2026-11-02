/**
 * Sidecar boot wiring for the stale engine temp sweep (G20, phase 59-33).
 *
 * Dedicated file for the same reason as playtimeLockBootClear.test.ts: init() sits behind
 * module-scope once-guards, and a virgin file gets a virgin module registry and guard flag.
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
jest.mock('../../storeManagers/steam/engine/fallbackEngine', () => ({
  __esModule: true,
  sweepStaleEngineTemps: () => mockSweep()
}))

import { PassThrough } from 'node:stream'
import { init } from '../bootstrap'

describe('G20: sidecar boot sweeps stale engine temp dirs', () => {
  it('init() calls the sweep once after initLogger, survives a throwing sweep, and does not re-run it', () => {
    mockSweep.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    expect(() => init(new PassThrough(), new PassThrough())).not.toThrow()
    expect(mockSweep).toHaveBeenCalledTimes(1)
    init(new PassThrough(), new PassThrough())
    expect(mockSweep).toHaveBeenCalledTimes(1)
  })
})
