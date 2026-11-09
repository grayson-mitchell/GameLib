// Test double for the rustInvoke leaf the depot channels ride on (Phase 73 Plan 13). Caller
// tests need the job wire shape, events, cancellation and outcome; real chunk work lives in the
// gamelib-depot tests and goldens. Wire it with
//   jest.mock('backend/sidecar/sidecarRpc', () => ({ requestRustInvoke: jest.fn() }))
//   (requestRustInvoke as jest.Mock).mockImplementation(stub.invoke)
import {
  RUST_DEPOT_JOB_CANCEL,
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_MANIFEST_SUMMARY
} from 'common/types/sidecarTransport'
import { dispatchDepotJobEvent } from '../../jobRegistry'
import type { RustDepotJob, RustJobEvent, RustOutcome } from '../../types'

type EventBody = RustJobEvent extends infer E
  ? E extends RustJobEvent
    ? Omit<E, 'jobId' | 'seq'>
    : never
  : never

export interface StubRustDepotOptions {
  /** Merged over a completed outcome that carries a StateFlags 4 ACF. */
  outcome?: Partial<RustOutcome>
  events?: EventBody[]
  /** Runs before the outcome is returned, e.g. to write files the caller then reads. */
  onRun?: (job: RustDepotJob) => void | Promise<void>
  /** Do not answer depot_job_run until depot_job_cancel arrives, then answer cancelled. */
  holdUntilCancel?: boolean
}

export interface StubRustDepot {
  invoke(channel: string, args: unknown[]): Promise<unknown>
  calls: { channel: string; args: unknown[] }[]
  jobs: RustDepotJob[]
  cancels: string[]
}

export function stubOutcome(
  jobId: string,
  over: Partial<RustOutcome> = {}
): RustOutcome {
  return {
    jobId,
    status: 'completed',
    failures: [],
    allFilesVerified: true,
    allModesApplied: true,
    attemptedDepots: [],
    acf: { stateFlags: '4', sizeOnDisk: '10' },
    missing: null,
    files: null,
    stats: {
      bytesFetched: 10,
      chunksFetched: 1,
      containers: { vz: 1, vsza: 0, pk: 0 },
      machoExecApplied: 0,
      pathCollisions: 0,
      elapsedMs: 5
    },
    ...over
  }
}

export function createStubRustDepot(
  options: StubRustDepotOptions = {}
): StubRustDepot {
  const calls: StubRustDepot['calls'] = []
  const jobs: RustDepotJob[] = []
  const cancels: string[] = []
  const waiting = new Map<string, () => void>()

  return {
    calls,
    jobs,
    cancels,
    async invoke(channel, args) {
      calls.push({ channel, args })
      if (channel === RUST_DEPOT_JOB_CANCEL) {
        const { jobId } = args[0] as { jobId: string }
        cancels.push(jobId)
        waiting.get(jobId)?.()
        return {}
      }
      if (channel === RUST_DEPOT_MANIFEST_SUMMARY) return { depots: [] }
      if (channel !== RUST_DEPOT_JOB_RUN) {
        throw new Error(`stubRustDepot: unexpected channel ${channel}`)
      }
      const job = args[0] as RustDepotJob
      jobs.push(job)
      let seq = 0
      for (const body of options.events ?? []) {
        dispatchDepotJobEvent({
          jobId: job.jobId,
          seq: seq++,
          ...body
        } as RustJobEvent)
      }
      await options.onRun?.(job)
      if (options.holdUntilCancel) {
        await new Promise<void>((resolve) => waiting.set(job.jobId, resolve))
        return stubOutcome(job.jobId, { status: 'cancelled', acf: null })
      }
      return stubOutcome(job.jobId, options.outcome)
    }
  }
}
