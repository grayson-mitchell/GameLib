/**
 * Phase 81 (D-07, D-10): the TS side of the adoption watch. The TS record store
 * (`steamPendingAdoptionStore`) is the single writer; Rust keeps an in-memory watch list fed from
 * here. Every record GameLib writes is registered with the Rust watch at once, every record it
 * clears is unwatched, and a failed invoke never throws into the install, launch or uninstall path:
 * the record is kept and a read answers null (behave as before the watch existed).
 *
 * Only the appId and the channel are logged, never a path or the baseline content.
 *
 * Exit contract: no timers, no handles, no work at import.
 */
import { existsSync } from 'node:fs'
import type { GlobalConfigSlice } from 'backend/config'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { logWarning, LogPrefix } from 'backend/logger'
import {
  RUST_STEAMPOLL_ADOPTION_READ,
  RUST_STEAMPOLL_ADOPTION_UNWATCH,
  RUST_STEAMPOLL_ADOPTION_WATCH
} from 'common/types/sidecarTransport'
import { isSteamExperimentalInstallAppEnabled } from './experimentalInstallAppSetting'
import type { SteamStoresDeps } from './library/installRoot'
import {
  clearPendingAdoption,
  listPendingAdoptions,
  pendingAdoptionStoreFrom,
  recordPendingAdoption,
  type PendingAdoptionRecord
} from './macSteamAdoption'
import { invokeSteamPoll } from './pollRust/rustSteamPoll'
import type { AdoptionReading } from './pollRust/steamPollTypes'

export type AdoptionWatchDeps = RustInvokeDeps &
  SteamStoresDeps & { config: Pick<GlobalConfigSlice, 'getSettings'> }

/** The watch/read op arguments for one pending record. */
export function adoptionWatchArgs(
  appId: string,
  record: PendingAdoptionRecord,
  installAppFallback: boolean
): Record<string, unknown> {
  return {
    appId,
    manifestPath: record.manifestPath,
    baselineContent: record.baseline.content,
    recordedAtMs: record.recordedAt,
    steamPid: record.steamPid,
    installAppFallback
  }
}

function logInvokeFailure(
  action: string,
  channel: string,
  appId: string,
  err: unknown
): void {
  logWarning(
    `[Steam] adoption ${action} failed for ${appId} (${channel}): ${String(err)}`,
    LogPrefix.Steam
  )
}

/** Registers one record with the Rust watch; true when Rust accepted it. A rejection is logged (D-10). */
async function watchPendingAdoption(
  deps: AdoptionWatchDeps,
  appId: string,
  record: PendingAdoptionRecord
): Promise<boolean> {
  try {
    await invokeSteamPoll(
      deps,
      RUST_STEAMPOLL_ADOPTION_WATCH,
      adoptionWatchArgs(
        appId,
        record,
        isSteamExperimentalInstallAppEnabled(deps.config)
      )
    )
    return true
  } catch (err) {
    logInvokeFailure('watch', RUST_STEAMPOLL_ADOPTION_WATCH, appId, err)
    return false
  }
}

/** Writes the record, then watches it. The record stays even when the watch invoke fails. */
export async function recordAndWatchPendingAdoption(
  deps: AdoptionWatchDeps,
  appId: string,
  record: PendingAdoptionRecord
): Promise<void> {
  recordPendingAdoption(appId, record, pendingAdoptionStoreFrom(deps))
  await watchPendingAdoption(deps, appId, record)
}

/** Clears the record and unwatches it (fire and forget; a rejection is logged). */
export function clearAndUnwatchPendingAdoption(
  deps: AdoptionWatchDeps,
  appId: string
): void {
  clearPendingAdoption(appId, pendingAdoptionStoreFrom(deps))
  invokeSteamPoll(deps, RUST_STEAMPOLL_ADOPTION_UNWATCH, { appId }).catch(
    (err: unknown) =>
      logInvokeFailure('unwatch', RUST_STEAMPOLL_ADOPTION_UNWATCH, appId, err)
  )
}

function isAdoptionReading(value: unknown): value is AdoptionReading {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const nullableBool = (x: unknown) => x === null || typeof x === 'boolean'
  return (
    typeof v.adopted === 'boolean' &&
    nullableBool(v.signedIn) &&
    nullableBool(v.steamRunning) &&
    (v.helperState === null || typeof v.helperState === 'number') &&
    (v.evidence === null || typeof v.evidence === 'string')
  )
}

/** One reading of whether Steam adopted the record's install; null when it cannot be read (D-10). */
export async function readSteamAdoption(
  deps: AdoptionWatchDeps,
  appId: string,
  record: PendingAdoptionRecord
): Promise<AdoptionReading | null> {
  try {
    const reply = await invokeSteamPoll(
      deps,
      RUST_STEAMPOLL_ADOPTION_READ,
      adoptionWatchArgs(
        appId,
        record,
        isSteamExperimentalInstallAppEnabled(deps.config)
      )
    )
    return isAdoptionReading(reply) ? reply : null
  } catch (err) {
    logInvokeFailure('read', RUST_STEAMPOLL_ADOPTION_READ, appId, err)
    return null
  }
}

/**
 * Re-registers every stored record with the Rust watch (sidecar boot; Rust's list is in memory).
 * A record whose manifest file no longer exists is cleared instead (T-81-07); an invalid entry is
 * ignored. Resolves the number of records watched and never rejects: a store that cannot be
 * listed answers 0, and a failed watch invoke is swallowed with its record kept (D-10).
 */
export async function resumeAdoptionWatches(
  deps: AdoptionWatchDeps
): Promise<number> {
  let stored: ReturnType<typeof listPendingAdoptions>
  try {
    stored = listPendingAdoptions(
      pendingAdoptionStoreFrom(deps) as ReturnType<
        typeof pendingAdoptionStoreFrom
      > & { entries(): Array<[string, unknown]> }
    )
  } catch (err) {
    logWarning(
      `[Steam] could not list pending adoptions at boot: ${String(err)}`,
      LogPrefix.Steam
    )
    return 0
  }
  let watched = 0
  for (const [appId, record] of stored) {
    if (!existsSync(record.manifestPath)) {
      clearAndUnwatchPendingAdoption(deps, appId)
      continue
    }
    if (await watchPendingAdoption(deps, appId, record)) watched += 1
  }
  return watched
}
