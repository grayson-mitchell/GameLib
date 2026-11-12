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
