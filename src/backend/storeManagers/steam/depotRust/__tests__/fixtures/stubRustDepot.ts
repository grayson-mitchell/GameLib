// Test double for the rustInvoke leaf the depot channels ride on (Phase 73 Plan 13). Caller
// tests need the job wire shape, events, cancellation and outcome; real chunk work lives in the
// gamelib-depot tests and goldens. Wire it with
//   jest.mock('backend/sidecar/sidecarRpc', () => ({ requestRustInvoke: jest.fn() }))
//   (requestRustInvoke as jest.Mock).mockImplementation(stub.invoke)
import {
  RUST_DEPOT_FINALIZE,
  RUST_DEPOT_JOB_CANCEL,
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_MANIFEST_SUMMARY
} from 'common/types/sidecarTransport'
import { fsBackedSteamFiles } from '../../../localFiles/__tests__/fixtures/stubRustSteamFiles'
import type { DepotJobRegistry } from '../../jobRegistry'
import type {
  RustDepotJob,
  RustJobEvent,
  RustOutcome,
  RustSummarizeRequest
} from '../../types'

type EventBody = RustJobEvent extends infer E
  ? E extends RustJobEvent
    ? Omit<E, 'jobId' | 'seq'>
    : never
  : never

export interface StubRustDepotOptions {
  /** Merged over a completed outcome that carries a StateFlags 4 ACF. */
  outcome?: Partial<RustOutcome>
  /** Answer for depot_manifest_summary; defaults to `{ depots: [], skippedDepots: [] }`. */
  summary?: unknown
  /** Per-request answer for depot_manifest_summary; wins over `summary`. */
  summaryFor?: (req: RustSummarizeRequest) => unknown
  /** Per-job overrides, merged over `outcome`, e.g. a verify_only job's `missing` list. */
  outcomeFor?: (
    job: RustDepotJob
  ) => Partial<RustOutcome> | Promise<Partial<RustOutcome>>
  events?: EventBody[]
  /** The registry `events` are dispatched into; required when `events` is non-empty. */
  registry?: Pick<DepotJobRegistry, 'dispatchDepotJobEvent'>
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
    skippedDepots: [],
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
  const steamFilesBacking = fsBackedSteamFiles()

  return {
    calls,
    jobs,
    cancels,
    async invoke(channel, args) {
      // The ACF reads that ride along an install (75-31: the TS reader is gone) are answered from
      // the temp files the caller test wrote; the depot channels stay this stub's.
      if (channel.startsWith('steamfiles_')) {
        return steamFilesBacking.requestRustInvoke(channel, args)
      }
      calls.push({ channel, args })
      if (channel === RUST_DEPOT_JOB_CANCEL) {
        const { jobId } = args[0] as { jobId: string }
        cancels.push(jobId)
        waiting.get(jobId)?.()
        return {}
      }
      if (channel === RUST_DEPOT_MANIFEST_SUMMARY) {
        if (options.summaryFor)
          return options.summaryFor(args[0] as RustSummarizeRequest)
        return options.summary ?? { depots: [], skippedDepots: [] }
      }
      if (channel === RUST_DEPOT_FINALIZE) {
        // No-download finalize (75-19): the stub records it and answers a honest-empty 1026.
        return { acf: { path: '/x', stateFlags: 1026, sizeOnDisk: '0' } }
      }
      if (channel !== RUST_DEPOT_JOB_RUN) {
        throw new Error(`stubRustDepot: unexpected channel ${channel}`)
      }
      const job = args[0] as RustDepotJob
      jobs.push(job)
      let seq = 0
      for (const body of options.events ?? []) {
        if (!options.registry)
          throw new Error('stubRustDepot: events need a registry')
        options.registry.dispatchDepotJobEvent({
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
      return stubOutcome(job.jobId, {
        ...options.outcome,
        ...(await options.outcomeFor?.(job))
      })
    }
  }
}
