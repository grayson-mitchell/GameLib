/**
 * Shell-originated channels the Rust depot job uses to call back into Node (Phase 73 Plan 11,
 * D-03, D-06).
 *
 *   invoke (ipcMain.handle, 2):
 *     - `depotCdnToken` -> answers `''` (no CDN auth token is ever requested, CF-06) for a known
 *       job, or `null` for an unknown jobId.
 *     - `depotManifestRequestCode` -> a fresh request code as a decimal string, `null` (Steam
 *       gave no code, or malformed args), `{eresult: 40}` when Steam refused the manifest (Blocked;
 *       the crate skips that depot), or `{unavailable: 'not_signed_in' | 'failed' | 'no_job'}`
 *       when this side could not ask Steam (transient; the crate must not fall back).
 *
 *   send (ipcMain.on, 1):
 *     - `depotJobEvent` -> routed to the registered job's listener by jobId.
 *
 * All three are `caller: 'shell'` (sidecarInternal.ts), so they never reach the renderer
 * surface, and are schema-validated by `validateInbound` before a handler runs. Handlers log the
 * channel name and jobId only, never arguments or results: a CDN token must never reach a log
 * (T-28-04 convention, T-73-41).
 *
 * `depotManifestRequestCode` maps the CM client's `steamcmKind` timeout and network to
 * `{unavailable: kind}`, and leaseUnknown to `{unavailable: 'not_signed_in'}`: Rust reports a
 * signed-out session (sign-out, failed recovery) as leaseUnknown, and the depot crate's fetch.rs
 * knows only `not_signed_in` (the "sign in" action); anything else reads as a network error.
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
      // CF-06: no CDN auth token is ever requested; '' means "no token" (79-22 evidence).
      return ''
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
      if (depotId === undefined || manifestId === undefined) return null
      if (!job) return { unavailable: 'no_job' }
      try {
        return await job.refreshRequestCode(depotId, manifestId)
      } catch (err) {
        // Steam refused the manifest (Blocked): tell the crate so it skips the depot.
        if ((err as { eresult?: unknown }).eresult === 40)
          return { eresult: 40 }
        logFailure('depotManifestRequestCode', jobId, err)
        // The Rust CM client's typed failure kind (toSteamCmError); fixed allow-list only.
        const kind = (err as { steamcmKind?: unknown }).steamcmKind
        // leaseUnknown is the Rust session's "not signed in" (Refusal::NotSignedIn); the crate
        // must see not_signed_in or it offers a network retry instead of sign-in (C2/WR-03).
        if (kind === 'leaseUnknown') return { unavailable: 'not_signed_in' }
        if (kind === 'timeout' || kind === 'network') {
          return { unavailable: kind }
        }
        // Fixed allow-list only: never an error message, token or account id (T-74-85).
        const reason = /not (logged on|signed in)|no authenticated/i.test(
          err instanceof Error ? err.message : ''
        )
          ? 'not_signed_in'
          : 'failed'
        return { unavailable: reason }
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
