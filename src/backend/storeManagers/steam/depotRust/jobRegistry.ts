// Registry of active Rust depot jobs, keyed by jobId. Rust calls back into Node for CDN tokens
// and manifest request codes and streams progress events; the sidecar handlers
// (sidecar/depotHostRegistration.ts) look the job up here.
//
// One registry per boot (the SteamInstallRuntime holds it, D-05, 66.4-09): a closure Map and nothing
// else, no timers, watchers, sockets or handles (sidecar exit contract). Entries are removed by the
// disposer register returns. Jobs still running at stdin EOF are stopped through their install's
// AbortController (abortAll), which runDepotJob forwards as depot_job_cancel.

import type { HostServices } from 'backend/host'
import type { CdnAuthTokenCache } from '../depot/cdnAuth'
import type { RustJobEvent } from './types'

interface ActiveDepotJob {
  appId: string
  tokenCache: CdnAuthTokenCache
  /**
   * Fresh manifest request code for a depot/manifest, or null if none could be obtained.
   * Rejects with an `eresult === 40` error when Steam refused it (Blocked).
   */
  refreshRequestCode(
    depotId: string,
    manifestId: string
  ): Promise<string | null>
  onEvent(ev: RustJobEvent): void
}

interface Entry {
  job: ActiveDepotJob
  lastSeq: number
}

/** The shell link a depot job runs over: the sidecar -> Rust request leg and the renderer push. */
export type DepotTransport = Pick<
  HostServices,
  'requestRustInvoke' | 'sendFrontendMessage'
>

export interface DepotJobRegistry {
  /** This boot's transport: the depot_* invokes and the progress push go through it (66.4-15). */
  transport: DepotTransport
  /** Registers `job` under `jobId`; the returned disposer removes only this registration. */
  registerActiveDepotJob(jobId: string, job: ActiveDepotJob): () => void
  lookupActiveDepotJob(jobId: string): ActiveDepotJob | undefined
  /**
   * Routes an event to its job's listener. Returns false (event dropped) for an unknown jobId or
   * a seq that is not strictly newer than the last one delivered for that job.
   */
  dispatchDepotJobEvent(ev: RustJobEvent): boolean
}

export function createDepotJobRegistry(
  transport: DepotTransport
): DepotJobRegistry {
  const active = new Map<string, Entry>()
  return {
    transport,
    registerActiveDepotJob(jobId, job) {
      const entry: Entry = { job, lastSeq: -1 }
      active.set(jobId, entry)
      return () => {
        // Only remove our own entry: a re-registered jobId must survive an old disposer.
        if (active.get(jobId) === entry) active.delete(jobId)
      }
    },
    lookupActiveDepotJob: (jobId) => active.get(jobId)?.job,
    dispatchDepotJobEvent(ev) {
      const entry = active.get(ev.jobId)
      if (!entry || ev.seq <= entry.lastSeq) return false
      entry.lastSeq = ev.seq
      entry.job.onEvent(ev)
      return true
    }
  }
}
