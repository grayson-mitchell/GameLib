// Registry of active Rust depot jobs, keyed by jobId. Rust calls back into Node for CDN tokens
// and manifest request codes and streams progress events; the sidecar handlers
// (sidecar/depotHostRegistration.ts) look the job up here.
//
// A module-level Map and nothing else: no timers, watchers, sockets or handles (sidecar exit
// contract). Entries are removed by the disposer registerActiveDepotJob returns.

import type { CdnAuthTokenCache } from '../depot/cdnAuth'
import type { RustJobEvent } from './types'

export interface ActiveDepotJob {
  appId: string
  tokenCache: CdnAuthTokenCache
  /** Fresh manifest request code for a depot/manifest, or null if none could be obtained. */
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

const active = new Map<string, Entry>()

export function registerActiveDepotJob(
  jobId: string,
  job: ActiveDepotJob
): () => void {
  const entry: Entry = { job, lastSeq: -1 }
  active.set(jobId, entry)
  return () => {
    // Only remove our own entry: a re-registered jobId must survive an old disposer.
    if (active.get(jobId) === entry) active.delete(jobId)
  }
}

export function lookupActiveDepotJob(
  jobId: string
): ActiveDepotJob | undefined {
  return active.get(jobId)?.job
}

/**
 * Routes an event to its job's listener. Returns false (event dropped) for an unknown jobId or
 * a seq that is not strictly newer than the last one delivered for that job.
 */
export function dispatchDepotJobEvent(ev: RustJobEvent): boolean {
  const entry = active.get(ev.jobId)
  if (!entry || ev.seq <= entry.lastSeq) return false
  entry.lastSeq = ev.seq
  entry.job.onEvent(ev)
  return true
}
