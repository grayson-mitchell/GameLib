/**
 * Typed helper over the `depot_*` rustInvoke channels (Phase 73 Plan 12). One job in, one
 * `RustOutcome` out; progress and token traffic flow through `jobRegistry` while it runs.
 *
 * Exit contract: no timers, no handles, no work at import. Aborting a job fires
 * `depot_job_cancel` WITHOUT awaiting it, so the stdin-EOF release path never waits on Rust; the
 * shell also cancels every job when the sidecar's stdout ends (D-08).
 *
 * Logs jobId and status only, never a job body, event, key or token.
 */
import {
  RUST_DEPOT_FINALIZE,
  RUST_DEPOT_JOB_CANCEL,
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_MANIFEST_SUMMARY
} from 'common/types/sidecarTransport'
import { logInfo, LogPrefix } from 'backend/logger'
import type { CdnAuthTokenCache } from '../depot/cdnAuth'
import type { DepotJobRegistry, DepotTransport } from './jobRegistry'
import type {
  RustDepotJob,
  RustFinalizeSpec,
  RustJobEvent,
  RustOutcome,
  RustSummarizeRequest,
  RustSummarizeResult
} from './types'

export interface RunDepotJobHooks {
  /** The boot-owned job registry the shell's token and event channels look the job up in. */
  registry: Pick<DepotJobRegistry, 'registerActiveDepotJob' | 'transport'>
  signal?: AbortSignal
  tokenCache: CdnAuthTokenCache
  refreshRequestCode: (
    depotId: string,
    manifestId: string
  ) => Promise<string | null>
  onEvent: (ev: RustJobEvent) => void
}

/** Fire-and-forget: a rejected cancel is swallowed and the caller never waits on it. */
export function cancelDepotJob(transport: DepotTransport, jobId: string): void {
  transport
    .requestRustInvoke(RUST_DEPOT_JOB_CANCEL, [{ jobId }])
    .catch(() => {})
}

function cancelledOutcome(jobId: string): RustOutcome {
  return {
    jobId,
    status: 'cancelled',
    failures: [],
    allFilesVerified: false,
    allModesApplied: false,
    attemptedDepots: [],
    skippedDepots: [],
    acf: null,
    missing: null,
    files: null,
    stats: {
      bytesFetched: 0,
      chunksFetched: 0,
      containers: { vz: 0, vsza: 0, pk: 0 },
      machoExecApplied: 0,
      pathCollisions: 0,
      elapsedMs: 0
    }
  }
}

export async function runDepotJob(
  job: RustDepotJob,
  hooks: RunDepotJobHooks
): Promise<RustOutcome> {
  const { signal } = hooks
  if (signal?.aborted) return cancelledOutcome(job.jobId)

  const dispose = hooks.registry.registerActiveDepotJob(job.jobId, {
    appId: job.appId,
    tokenCache: hooks.tokenCache,
    refreshRequestCode: hooks.refreshRequestCode,
    onEvent: hooks.onEvent
  })
  const onAbort = () => cancelDepotJob(hooks.registry.transport, job.jobId)
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const outcome = (await hooks.registry.transport.requestRustInvoke(
      RUST_DEPOT_JOB_RUN,
      [job]
    )) as RustOutcome
    logInfo(
      `depot job ${job.jobId} finished: ${outcome.status}`,
      LogPrefix.Steam
    )
    return outcome
  } finally {
    signal?.removeEventListener('abort', onAbort)
    dispose()
  }
}

export function summarizeDepots(
  transport: DepotTransport,
  req: RustSummarizeRequest
): Promise<RustSummarizeResult> {
  return transport.requestRustInvoke(RUST_DEPOT_MANIFEST_SUMMARY, [
    req
  ]) as Promise<RustSummarizeResult>
}

export type RustFinalizeResult =
  | { acf: { path: string; stateFlags: number; sizeOnDisk: string } }
  | { preserved: true; stateFlags: number }

/**
 * No-download ACF finalize (D-03). A Rust `{ error }` result throws, as the TS writer's failure
 * path does; callers keep their own catch.
 */
export async function rustFinalize(
  transport: DepotTransport,
  appId: string,
  finalize: RustFinalizeSpec,
  depots: { depotId: string; gid: string; size: number }[],
  outcome: 'completed' | 'cancelled' | null
): Promise<RustFinalizeResult> {
  const res = (await transport.requestRustInvoke(RUST_DEPOT_FINALIZE, [
    { appId, finalize, depots, outcome }
  ])) as RustFinalizeResult | { error: { message?: string; kind?: string } }
  if ('error' in res) {
    const f = res.error
    throw new Error(
      `depot_finalize failed for appId ${appId}: ${f?.message ?? f?.kind ?? 'unknown'}`
    )
  }
  return res
}
