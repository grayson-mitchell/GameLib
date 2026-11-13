import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { sendGameStatusUpdate, sendProgressUpdate } from 'backend/utils'
import {
  STEAM_UPDATE_COMMITTING_CONTEXT,
  STEAM_UPDATE_PLANNING_CONTEXT,
  createProgressBridge
} from '../progressBridge'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn((n: number) => `${n}B`),
  sendProgressUpdate: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))

function bridge() {
  return createProgressBridge(
    { sendFrontendMessage: jest.fn(), appRuntime: createTestAppRuntime() },
    '777',
    'steam',
    () => 1000
  )
}

describe('progressBridge stage events (D-10)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('maps delta_planning to an updating status with the planning context', () => {
    bridge().onEvent({
      jobId: 'j',
      seq: 0,
      kind: 'stage',
      stage: 'delta_planning'
    })
    expect(jest.mocked(sendGameStatusUpdate).mock.calls[0]?.[1]).toEqual({
      appName: '777',
      runner: 'steam',
      status: 'updating',
      context: STEAM_UPDATE_PLANNING_CONTEXT
    })
    expect(STEAM_UPDATE_PLANNING_CONTEXT).toBe('steam-update-planning')
  })

  it('maps delta_committing to the committing context', () => {
    bridge().onEvent({
      jobId: 'j',
      seq: 1,
      kind: 'stage',
      stage: 'delta_committing'
    })
    expect(jest.mocked(sendGameStatusUpdate).mock.calls[0]?.[1]).toMatchObject({
      status: 'updating',
      context: STEAM_UPDATE_COMMITTING_CONTEXT
    })
  })

  it('keeps the progressUpdate payload shape after a stage', () => {
    const b = bridge()
    b.onEvent({ jobId: 'j', seq: 0, kind: 'stage', stage: 'delta_planning' })
    b.onEvent({
      jobId: 'j',
      seq: 1,
      kind: 'progress',
      doneBytes: 50,
      netBytes: 50,
      totalBytes: 100,
      filesDone: 0,
      filesTotal: 1,
      host: null,
      elapsedMs: 10
    })
    const payload = jest.mocked(sendProgressUpdate).mock.calls[0]?.[1]
    expect(payload).toMatchObject({
      appName: '777',
      runner: 'steam',
      status: 'installing',
      progress: { percent: 50 }
    })
  })
})

describe('progressBridge update mode (WR-07)', () => {
  beforeEach(() => jest.clearAllMocks())

  function updateBridge() {
    return createProgressBridge(
      { sendFrontendMessage: jest.fn(), appRuntime: createTestAppRuntime() },
      '777',
      'steam',
      () => 1000,
      { update: true }
    )
  }
  const planned = {
    jobId: 'j',
    seq: 1,
    kind: 'planned' as const,
    totalBytes: 100,
    totalFiles: 1,
    depots: []
  }

  it('sends planning -> plain updating on planned -> committing', () => {
    const b = updateBridge()
    b.onEvent({ jobId: 'j', seq: 0, kind: 'stage', stage: 'delta_planning' })
    b.onEvent(planned)
    b.onEvent({ jobId: 'j', seq: 2, kind: 'stage', stage: 'delta_committing' })
    const payloads = jest
      .mocked(sendGameStatusUpdate)
      .mock.calls.map((c) => c[1])
    expect(payloads).toEqual([
      {
        appName: '777',
        runner: 'steam',
        status: 'updating',
        context: STEAM_UPDATE_PLANNING_CONTEXT
      },
      { appName: '777', runner: 'steam', status: 'updating' },
      {
        appName: '777',
        runner: 'steam',
        status: 'updating',
        context: STEAM_UPDATE_COMMITTING_CONTEXT
      }
    ])
    expect(payloads[1]).not.toHaveProperty('context')
  })

  it('clears with a plain updating on planned even without a prior stage', () => {
    updateBridge().onEvent(planned)
    const calls = jest.mocked(sendGameStatusUpdate).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[1]).toEqual({
      appName: '777',
      runner: 'steam',
      status: 'updating'
    })
    expect(calls[0]?.[1]).not.toHaveProperty('context')
  })

  it('sends no game status on planned for a non-update bridge', () => {
    bridge().onEvent(planned)
    expect(sendGameStatusUpdate).not.toHaveBeenCalled()
  })

  it('still records totalBytes from planned in update mode', () => {
    const b = updateBridge()
    b.onEvent(planned)
    b.onEvent({
      jobId: 'j',
      seq: 2,
      kind: 'progress',
      doneBytes: 50,
      netBytes: 50,
      totalBytes: 0,
      filesDone: 0,
      filesTotal: 1,
      host: null,
      elapsedMs: 10
    })
    expect(jest.mocked(sendProgressUpdate).mock.calls[0]?.[1]).toMatchObject({
      progress: { percent: 50 }
    })
  })
})
