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
import { join } from 'node:path'
import type { GlobalConfigSlice } from 'backend/config'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import { getSteamLibraries } from 'backend/utils'
import {
  RUST_STEAMFILES_FIND_ACF,
  RUST_STEAMPOLL_ADOPTION_READ,
  RUST_STEAMPOLL_ADOPTION_UNWATCH,
  RUST_STEAMPOLL_ADOPTION_WATCH,
  RUST_STEAMPOLL_HOLD_DISCARD,
  RUST_STEAMPOLL_HOLD_DRAIN
} from 'common/types/sidecarTransport'
import { pushSteamAdoptionStatus } from './adoptionStatus'
import { isSteamExperimentalInstallAppEnabled } from './experimentalInstallAppSetting'
import type { SteamStoresDeps } from './library/installRoot'
import {
  clearPendingAdoption,
  listPendingAdoptions,
  pendingAdoptionStoreFrom,
  readAcfSnapshot,
  recordPendingAdoption,
  type PendingAdoptionRecord
} from './macSteamAdoption'
import { invokeSteamFiles } from './localFiles/rustSteamFiles'
import { invokeSteamPoll } from './pollRust/rustSteamPoll'
import type { SteamInstallRuntime } from './steamInstallRuntime'
import type { AdoptionReading, DrainedHold } from './pollRust/steamPollTypes'

export type AdoptionWatchDeps = RustInvokeDeps &
  SteamStoresDeps &
  Pick<ManagerDeps, 'sendFrontendMessage'> & {
    config: Pick<GlobalConfigSlice, 'getSettings'>
    steamInstallRuntime: Pick<SteamInstallRuntime, 'adoption'>
  }

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
  pushSteamAdoptionStatus(deps, appId)
  await watchPendingAdoption(deps, appId, record)
}

/**
 * Clears the record, drops its signed-in reading, pushes the page status (D-07: the note goes
 * away on its own) and unwatches it (fire and forget; a rejection is logged).
 */
export function clearAndUnwatchPendingAdoption(
  deps: AdoptionWatchDeps,
  appId: string
): void {
  clearPendingAdoption(appId, pendingAdoptionStoreFrom(deps))
  deps.steamInstallRuntime.adoption.signedIn.delete(appId)
  pushSteamAdoptionStatus(deps, appId)
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

function isDrainedHold(value: unknown): value is DrainedHold {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.appId === 'string' &&
    typeof v.steamPid === 'number' &&
    Number.isInteger(v.steamPid) &&
    v.steamPid > 0 &&
    typeof v.recordedAtMs === 'number' &&
    Number.isFinite(v.recordedAtMs)
  )
}

/**
 * What became of one drained hold: written as a pending record, dropped for a reason that makes
 * it moot, or `unevaluated` (a lookup rejected, so nothing was learned and the old file must stay).
 */
type HoldMigration = 'migrated' | 'acf-gone' | 'already-adopted' | 'unevaluated'

function logHoldMigration(appId: string, outcome: HoldMigration): void {
  logInfo(
    `[Steam] restart-hold migration ${appId}: ${outcome}`,
    LogPrefix.Steam
  )
}

async function migrateOneHold(
  deps: AdoptionWatchDeps,
  hold: DrainedHold,
  steamappsDirs: string[]
): Promise<HoldMigration> {
  const { appId } = hold
  let steamappsDir: string | null
  try {
    const found = await invokeSteamFiles(deps, RUST_STEAMFILES_FIND_ACF, {
      steamappsDirs,
      appId
    })
    steamappsDir = found.found ? found.steamappsDir : null
  } catch {
    return 'unevaluated'
  }
  if (steamappsDir === null) return 'acf-gone'
  const manifestPath = join(steamappsDir, `appmanifest_${appId}.acf`)
  const snapshot = await readAcfSnapshot(deps, manifestPath)
  if (snapshot === null) return 'acf-gone'
  // The Rust read rejected: the snapshot's parsed fields are unknown, not "unadopted".
  if (snapshot.rustReadFailed === true) return 'unevaluated'
  const candidate: PendingAdoptionRecord = {
    steamPid: hold.steamPid,
    manifestPath,
    baseline: snapshot,
    recordedAt: hold.recordedAtMs
  }
  // RESEARCH Pitfall 5: the migrated baseline is the current ACF, so a Steam that already adopted
  // the install would make Play restart a Steam that has nothing to adopt.
  const reading = await readSteamAdoption(deps, appId, candidate)
  if (reading?.adopted === true) return 'already-adopted'
  await recordAndWatchPendingAdoption(deps, appId, candidate)
  return 'migrated'
}

/**
 * D-12, D-13: turns the restart holds an older build persisted into watched pending-adoption
 * records, then deletes the old store file. Rust drains (reads, validates, filters) and later
 * discards; TS writes the pending store (single writer, R3). A hold whose ACF is gone, or that the
 * adoption read already reports adopted, is dropped. This never quits, signals or launches Steam;
 * each record becomes the restart-on-Play note.
 *
 * Crash safety: the file is discarded only after every record was handled, so a crash in between
 * re-runs against the same records and overwrites the same pending entries. A drain that rejected
 * or answered a malformed reply, and a record whose lookup rejected (`unevaluated`), leave the file
 * for the next boot. Resolves the number of records written and never rejects.
 *
 * Exit contract: one drain, at most one library lookup, four invokes per record and one discard,
 * all bounded rustInvoke work; no timer, no handle.
 */
export async function migrateRestartHolds(
  deps: AdoptionWatchDeps
): Promise<number> {
  let drained: unknown
  try {
    drained = await invokeSteamPoll(deps, RUST_STEAMPOLL_HOLD_DRAIN)
  } catch (err) {
    logWarning(
      `[Steam] restart-hold drain failed (${RUST_STEAMPOLL_HOLD_DRAIN}): ${String(err)}`,
      LogPrefix.Steam
    )
    return 0
  }
  if (!Array.isArray(drained)) {
    logWarning(
      '[Steam] restart-hold drain answered a malformed reply; the old store stays',
      LogPrefix.Steam
    )
    return 0
  }
  const holds = drained.filter(isDrainedHold)
  let steamappsDirs: string[] | null = null
  let written = 0
  let complete = true
  for (const hold of holds) {
    let outcome: HoldMigration
    try {
      // strict: a rejected library list must not read as "the ACF is gone" and drop the hold.
      steamappsDirs ??= (await getSteamLibraries(deps, { strict: true })).map(
        (lib) => join(lib, 'steamapps')
      )
      outcome = await migrateOneHold(deps, hold, steamappsDirs)
    } catch {
      outcome = 'unevaluated'
    }
    logHoldMigration(hold.appId, outcome)
    if (outcome === 'migrated') written += 1
    if (outcome === 'unevaluated') complete = false
  }
  if (!complete) return written
  try {
    await invokeSteamPoll(deps, RUST_STEAMPOLL_HOLD_DISCARD)
  } catch (err) {
    logWarning(
      `[Steam] restart-hold discard failed (${RUST_STEAMPOLL_HOLD_DISCARD}): ${String(err)}`,
      LogPrefix.Steam
    )
  }
  return written
}
