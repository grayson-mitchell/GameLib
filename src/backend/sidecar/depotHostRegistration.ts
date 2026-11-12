/**
 * Shell-originated channels the Rust depot job uses to call back into Node (Phase 73 Plan 11,
 * D-03, D-06).
 *
 *   invoke (ipcMain.handle, 2):
 *     - `depotCdnToken` -> the job's `CdnAuthTokenCache` (including its `_send` workaround) answers
 *       with the token string to append verbatim to a chunk URL, `''` when none is needed, or
 *       `null` for an unknown jobId.
 *     - `depotManifestRequestCode` -> a fresh request code as a decimal string, `null`, or
 *       `{eresult: 40}` when Steam refused the manifest (Blocked; the crate skips that depot).
 *
 *   send (ipcMain.on, 1):
 *     - `depotJobEvent` -> routed to the registered job's listener by jobId.
 *
 * All three are `caller: 'shell'` (sidecarInternal.ts), so they never reach the renderer
 * surface, and are schema-validated by `validateInbound` before a handler runs. Handlers log the
 * channel name and jobId only, never arguments or results: a CDN token must never reach a log
 * (T-28-04 convention, T-73-41).
 *
 * No timers, watchers or handles are created here (sidecar exit contract).
 */

import type { IpcRegistry } from './ipcRegistry'
import { logWarning, LogPrefix } from 'backend/logger'
import type { DepotJobRegistry } from '../storeManagers/steam/depotRust/jobRegistry'
import type { RustJobEvent } from '../storeManagers/steam/depotRust/types'

function field(arg: unknown, name: string): string | undefined {
  if (typeof arg !== 'object' || arg === null) return undefined
  const v = (arg as Record<string, unknown>)[name]
  return typeof v === 'string' ? v : undefined
}

function logFailure(channel: string, jobId: string | undefined, err: unknown) {
  // The reason is the error's name only: a message could echo a URL carrying a token.
  const name = err instanceof Error ? err.name : typeof err
  logWarning(
    `${channel} failed for job ${jobId ?? '?'} (${name})`,
    LogPrefix.Steam
  )
}

/**
 * Registers the 3 shell-originated depot-host channels (two invoke, one send). Called once from
 * `handlers.ts`.
 */
export function registerDepotHostFlows(deps: {
  ipc: Pick<IpcRegistry, 'handle' | 'on'>
  depotJobs: Pick<
    DepotJobRegistry,
    'lookupActiveDepotJob' | 'dispatchDepotJobEvent'
  >
}): void {
  deps.ipc.handle(
    'depotCdnToken',
    async (_event: unknown, ...args: unknown[]) => {
      const req = args[0]
      const jobId = field(req, 'jobId')
      const job =
        jobId === undefined
          ? undefined
          : deps.depotJobs.lookupActiveDepotJob(jobId)
      const depotId = field(req, 'depotId')
      const host = field(req, 'host')
      if (!job || depotId === undefined || host === undefined) return null
      try {
        if ((req as { force?: unknown }).force === true) {
          job.tokenCache.invalidate(depotId, host)
        }
        return await job.tokenCache.getToken(depotId, host)
      } catch (err) {
        logFailure('depotCdnToken', jobId, err)
        return null
      }
    }
  )

  deps.ipc.handle(
    'depotManifestRequestCode',
    async (_event: unknown, ...args: unknown[]) => {
      const req = args[0]
      const jobId = field(req, 'jobId')
      const job =
        jobId === undefined
          ? undefined
          : deps.depotJobs.lookupActiveDepotJob(jobId)
      const depotId = field(req, 'depotId')
      const manifestId = field(req, 'manifestId')
      if (!job || depotId === undefined || manifestId === undefined) return null
      try {
        return await job.refreshRequestCode(depotId, manifestId)
      } catch (err) {
        // Steam refused the manifest (Blocked): tell the crate so it skips the depot.
        if ((err as { eresult?: unknown }).eresult === 40)
          return { eresult: 40 }
        logFailure('depotManifestRequestCode', jobId, err)
        return null
      }
    }
  )

  deps.ipc.on('depotJobEvent', (_event: unknown, ...args: unknown[]) => {
    const ev = args[0] as RustJobEvent | undefined
    if (!ev || typeof ev.jobId !== 'string') return
    try {
      deps.depotJobs.dispatchDepotJobEvent(ev)
    } catch (err) {
      logFailure('depotJobEvent', ev.jobId, err)
    }
  })
}
