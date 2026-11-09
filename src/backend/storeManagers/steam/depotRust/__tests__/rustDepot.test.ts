/**
 * Phase 73 Plan 12: runDepotJob / cancelDepotJob / summarizeDepots over a stubbed rustInvoke leaf.
 */
jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: new Proxy({}, { get: (_t, p) => String(p) })
}))
jest.mock('backend/sidecar/sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

import { requestRustInvoke } from 'backend/sidecar/sidecarRpc'
import {
  RUST_DEPOT_JOB_CANCEL,
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_MANIFEST_SUMMARY
} from 'common/types/sidecarTransport'
import type { CdnAuthTokenCache } from '../../depot/cdnAuth'
import { lookupActiveDepotJob } from '../jobRegistry'
import { cancelDepotJob, runDepotJob, summarizeDepots } from '../rustDepot'
import type { RustDepotJob, RustOutcome } from '../types'

const invokeMock = requestRustInvoke as unknown as jest.Mock

const JOB: RustDepotJob = {
  jobId: 'job-1',
  mode: 'install',
  appId: '480',
  installRoot: '/lib/steamapps/common/Game',
  depots: [],
  hosts: [],
  selectPaths: null,
  finalize: null,
  limits: null
}

const hooks = (signal?: AbortSignal) => ({
  signal,
  tokenCache: {} as CdnAuthTokenCache,
  refreshRequestCode: jest.fn(() => Promise.resolve(null)),
  onEvent: jest.fn()
})

const OUTCOME = { jobId: 'job-1', status: 'completed' } as RustOutcome

beforeEach(() => {
  jest.useFakeTimers()
  invokeMock.mockReset()
})
afterEach(() => jest.useRealTimers())

describe('runDepotJob', () => {
  it('registers the job, invokes depot_job_run with the job and unregisters after', async () => {
    invokeMock.mockImplementation(() => {
      expect(lookupActiveDepotJob('job-1')).toBeDefined()
      return Promise.resolve(OUTCOME)
    })
    await expect(runDepotJob(JOB, hooks())).resolves.toBe(OUTCOME)
    expect(invokeMock).toHaveBeenCalledWith(RUST_DEPOT_JOB_RUN, [JOB])
    expect(lookupActiveDepotJob('job-1')).toBeUndefined()
  })

  it('unregisters even when the invoke rejects', async () => {
    invokeMock.mockRejectedValue(new Error('boom'))
    await expect(runDepotJob(JOB, hooks())).rejects.toThrow('boom')
    expect(lookupActiveDepotJob('job-1')).toBeUndefined()
  })

  it('returns a cancelled outcome for an already-aborted signal without invoking', async () => {
    const ac = new AbortController()
    ac.abort()
    const out = await runDepotJob(JOB, hooks(ac.signal))
    expect(out.status).toBe('cancelled')
    expect(out.jobId).toBe('job-1')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('abort sends depot_job_cancel once, synchronously, without awaiting it', async () => {
    const ac = new AbortController()
    let finishRun: (o: RustOutcome) => void = () => {}
    invokeMock.mockImplementation((channel: string) => {
      if (channel === RUST_DEPOT_JOB_RUN)
        return new Promise<RustOutcome>((r) => (finishRun = r))
      return new Promise(() => {}) // a cancel that never resolves
    })
    const run = runDepotJob(JOB, hooks(ac.signal))
    ac.abort()
    ac.abort()
    const cancels = invokeMock.mock.calls.filter(
      (c) => c[0] === RUST_DEPOT_JOB_CANCEL
    )
    expect(cancels).toEqual([[RUST_DEPOT_JOB_CANCEL, [{ jobId: 'job-1' }]]])
    finishRun({ ...OUTCOME, status: 'cancelled' })
    await expect(run).resolves.toMatchObject({ status: 'cancelled' })
  })

  it('a rejected cancel is swallowed', async () => {
    invokeMock.mockRejectedValue(new Error('nope'))
    expect(() => cancelDepotJob('job-1')).not.toThrow()
    await Promise.resolve()
  })

  it('holds no timers while a job is pending', () => {
    invokeMock.mockReturnValue(new Promise(() => {}))
    void runDepotJob(JOB, hooks(new AbortController().signal))
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('summarizeDepots', () => {
  it('invokes depot_manifest_summary and returns its result', async () => {
    const result = { depots: [] }
    invokeMock.mockResolvedValue(result)
    const req = { appId: '480', depots: [], hosts: [], patterns: [] }
    await expect(summarizeDepots(req)).resolves.toBe(result)
    expect(invokeMock).toHaveBeenCalledWith(RUST_DEPOT_MANIFEST_SUMMARY, [req])
  })
})
