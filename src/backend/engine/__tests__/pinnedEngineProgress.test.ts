jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))

import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { sendGameStatusUpdate } from 'backend/utils'
import type { FallbackEngine } from '../fallbackEngine'
import { ensurePinnedEngineReportingStatus } from '../pinnedEngineProgress'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

const pin = {
  label: 'Pinned',
  dxvk: { size: 10, version: 'd1' },
  wine: { size: 90, version: 'w1' }
} as never

const mocked = jest.fn<
  ReturnType<FallbackEngine['ensurePinnedEngine']>,
  Parameters<FallbackEngine['ensurePinnedEngine']>
>()
const fallback: Pick<FallbackEngine, 'ensurePinnedEngine'> = {
  ensurePinnedEngine: mocked
}
const sent = jest.mocked(sendGameStatusUpdate)

beforeEach(() => jest.clearAllMocks())

describe('ensurePinnedEngineReportingStatus', () => {
  it('emits downloading contexts that never decrease, for any appName/runner', async () => {
    mocked.mockImplementation((_pin, opts) => {
      opts?.onProgress?.({
        phase: 'downloading',
        artifact: 'dxvk',
        percentage: 100
      })
      opts?.onProgress?.({ phase: 'verifying', artifact: 'dxvk' })
      opts?.onProgress?.({
        phase: 'downloading',
        artifact: 'wine',
        percentage: 0
      })
      opts?.onProgress?.({
        phase: 'downloading',
        artifact: 'wine',
        percentage: 50
      })
      opts?.onProgress?.({
        phase: 'downloading',
        artifact: 'wine',
        percentage: 20
      })
      return Promise.resolve({
        ok: true,
        paths: { wineBin: '/w', wineserverBin: '/s', dxvkDir: '/d' }
      } as never)
    })
    const r = await ensurePinnedEngineReportingStatus({
      sendFrontendMessage: jest.fn(),
      appRuntime: createTestAppRuntime(),
      pin,
      appName: 'amzn1.x',
      runner: 'nile',
      processRunner: createScriptedRunner([]),
      onlineMonitor: { isOnline: () => true },
      fallback
    })
    expect(r.ok).toBe(true)
    const contexts = sent.mock.calls.map(([, p]) => p.context as string)
    const percents = contexts
      .filter((c) => c.startsWith('downloading:'))
      .map((c) => Number(c.split(':')[1]))
    expect(percents.length).toBeGreaterThan(0)
    expect([...percents].sort((a, b) => a - b)).toEqual(percents)
    expect(contexts[contexts.length - 1]).toBe('setting-up')
    for (const [, p] of sent.mock.calls) {
      expect(p).toMatchObject({
        appName: 'amzn1.x',
        runner: 'nile',
        status: 'engine-download'
      })
    }
  })

  it('reports an abort without calling it a failure', async () => {
    mocked.mockResolvedValue({
      ok: false,
      reason: 'aborted',
      detail: ''
    } as never)
    const r = await ensurePinnedEngineReportingStatus({
      sendFrontendMessage: jest.fn(),
      appRuntime: createTestAppRuntime(),
      pin,
      appName: '1',
      runner: 'gog',
      processRunner: createScriptedRunner([]),
      onlineMonitor: { isOnline: () => true },
      fallback
    })
    expect(r).toMatchObject({ ok: false, aborted: true })
    expect(sent).toHaveBeenCalledWith(expect.anything(), {
      appName: '1',
      runner: 'gog',
      status: 'done'
    })
  })

  it('reports a failure with its reason', async () => {
    mocked.mockResolvedValue({
      ok: false,
      reason: 'offline',
      detail: 'no net'
    } as never)
    const r = await ensurePinnedEngineReportingStatus({
      sendFrontendMessage: jest.fn(),
      appRuntime: createTestAppRuntime(),
      pin,
      appName: '1',
      runner: 'gog',
      processRunner: createScriptedRunner([]),
      onlineMonitor: { isOnline: () => true },
      fallback
    })
    expect(r).toMatchObject({ ok: false, aborted: false, reason: 'offline' })
  })
})
