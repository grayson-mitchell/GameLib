// Rust paths for the three secondary depot consumers behind GAMELIB_DEPOT_PIPELINE=rust
// (73-14, D-02, D-13, D-16): the steam_api prescreen, the selected-files fetch behind the
// original-DLL restore, and the startup-resume verify.
//
// Node does the CM half (appinfo, depot selection, keys, content servers, tokens); Rust reads
// manifests. Nothing here fetches a manifest in TS. Exit contract: no timers or handles.

import { basename, resolve } from 'path'
import { logWarning, LogPrefix } from 'backend/logger'
import { SteamUser } from '../user'
import { CdnAuthTokenCache } from '../depot/cdnAuth'
import { getContentServerHosts } from '../depot/contentServers'
import type {
  DownloadSelectedDepotFilesOpts,
  DownloadSelectedDepotFilesResult
} from '../depot/outcome'
import type { DownloadSteamDepotsOpts } from '../depot/planModel'
import {
  assertNumericAppId,
  buildDepotRefs,
  getDepotClient,
  throwIfAborted
} from '../depot/plan'
import { classifyDepotError } from '../depotErrors'
import { rustOutcomeToDepotOutcome } from './errorMap'
import { logOutcome, requestCodeRefresher } from './install'
import { buildDepotJob, toRustDepotRefs, toRustHosts } from './jobBuilder'
import { registerActiveDepotJob } from './jobRegistry'
import { runDepotJob, summarizeDepots } from './rustDepot'
import type { RustFinalizeSpec } from './types'

export type PrescreenResult = 'none' | 'x86' | 'x64' | 'both' | 'unknown'

/** The same two basenames screenDepotPlanForSteamApi looks for. */
const STEAM_API_PATTERNS = ['steam_api.dll', 'steam_api64.dll']

type Lease = Awaited<ReturnType<typeof SteamUser.acquireAuthenticated>>

async function acquireOrThrow(
  appId: string,
  reason: Parameters<typeof SteamUser.acquireAuthenticated>[0]['reason']
): Promise<Extract<Lease, { ok: true }>> {
  const lease = await SteamUser.acquireAuthenticated({
    reason,
    guidedAction: 'install',
    appName: appId
  })
  if (!lease.ok) {
    throw new Error(
      `downloadSteamDepots: no authenticated Steam CM connection available for appId ${appId} (${lease.reason})`
    )
  }
  return lease
}

/**
 * D-02: the bridge prescreen from `depot_manifest_summary`. Same result type and same
 * never-throws contract as the TS prescreenBridgeDepots; any failure resolves 'unknown'.
 * Parity note: a manifest-level EResult-40 refusal skips that depot on the TS path but surfaces
 * as a summary error here, which resolves 'unknown' (install proceeds, as for any screen failure).
 */
export async function prescreenBridgeDepotsRust(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<PrescreenResult> {
  let lease: Lease | null = null
  try {
    assertNumericAppId(appId)
    throwIfAborted(opts.signal)
    lease = await acquireOrThrow(appId, 'prescreen')
    const refs = await buildDepotRefs(appId, { ...opts, os: 'windows' })
    if (!refs.depots.length) return 'none'
    const client = getDepotClient()
    const hosts = await getContentServerHosts(client, Number(appId))
    throwIfAborted(opts.signal)
    const tokenCache = new CdnAuthTokenCache(client, Number(appId))
    // The crate asks for CDN tokens under this host job id (73-12).
    const dispose = registerActiveDepotJob(`summary-${appId}`, {
      appId,
      tokenCache,
      refreshRequestCode: requestCodeRefresher(
        client,
        new Map(refs.depots.map((d) => [d.depotId, d.ownerAppId])),
        appId
      ),
      onEvent: () => {}
    })
    let res
    try {
      res = await summarizeDepots({
        appId,
        depots: toRustDepotRefs(refs.depots),
        hosts: toRustHosts(hosts),
        patterns: STEAM_API_PATTERNS
      })
    } finally {
      dispose()
    }
    if ('error' in res) {
      logWarning(
        `prescreenBridgeDepots: appId ${appId} summary failed (${res.error.kind}), treating as 'unknown'`,
        LogPrefix.Steam
      )
      return 'unknown'
    }
    let hasX86 = false
    let hasX64 = false
    for (const depot of res.depots) {
      for (const m of depot.matches) {
        const name = basename(m.replace(/\\/g, '/')).toLowerCase()
        if (name === 'steam_api.dll') hasX86 = true
        else if (name === 'steam_api64.dll') hasX64 = true
      }
    }
    if (hasX86 && hasX64) return 'both'
    if (hasX64) return 'x64'
    if (hasX86) return 'x86'
    return 'none'
  } catch (err) {
    logWarning(
      `prescreenBridgeDepots: appId ${appId} failed, treating as 'unknown' (install proceeds): ${String(err)}`,
      LogPrefix.Steam
    )
    return 'unknown'
  } finally {
    if (lease?.ok) lease.release()
  }
}

/**
 * select_files job for the original-DLL restore. Never finalizes, so no ACF is written. Never
 * throws: every failure maps to a structured status, like the TS downloadSelectedDepotFiles.
 */
export async function downloadSelectedDepotFilesRust(
  appId: string,
  opts: DownloadSelectedDepotFilesOpts
): Promise<DownloadSelectedDepotFilesResult> {
  if ('select' in opts) {
    throw new Error(
      'downloadSelectedDepotFiles: a select predicate is not supported on the rust pipeline; pass selectPaths'
    )
  }
  let lease: Lease | null = null
  try {
    assertNumericAppId(appId)
    lease = await acquireOrThrow(appId, 'original-restore')
    throwIfAborted(opts.signal)
    const refs = await buildDepotRefs(appId, opts)
    if (!refs.depots.length || opts.selectPaths.length === 0) {
      return { status: 'done', files: [] }
    }
    const client = getDepotClient()
    const hosts = await getContentServerHosts(client, Number(appId))
    throwIfAborted(opts.signal)
    const tokenCache = new CdnAuthTokenCache(client, Number(appId))
    const job = buildDepotJob({
      appId,
      mode: 'select_files',
      installRoot: resolve(opts.targetSteamappsDir, 'common', opts.installdir),
      refs: refs.depots,
      hosts,
      finalize: null,
      selectPaths: opts.selectPaths
    })
    const outcome = await runDepotJob(job, {
      signal: opts.signal,
      tokenCache,
      refreshRequestCode: requestCodeRefresher(
        client,
        new Map(refs.depots.map((d) => [d.depotId, d.ownerAppId])),
        appId
      ),
      onEvent: () => {}
    })
    logOutcome(job, outcome)
    const files = outcome.files ?? []
    if (outcome.status === 'cancelled' || opts.signal?.aborted === true) {
      return { status: 'cancelled', files }
    }
    if (outcome.status === 'error' || outcome.failures.length > 0) {
      const mapped = rustOutcomeToDepotOutcome({ ...outcome, status: 'error' })
      return {
        status: 'error',
        files,
        error: mapped.error ?? 'download failed'
      }
    }
    return { status: 'done', files }
  } catch (err) {
    if (opts.signal?.aborted === true) return { status: 'cancelled', files: [] }
    return {
      status: 'error',
      files: [],
      error: classifyDepotError(err).message
    }
  } finally {
    if (lease?.ok) lease.release()
  }
}

export interface ResumeVerifyInput {
  targetSteamappsDir: string
  /** Already sanitized by the caller. */
  installdir: string
  name: string
  os: string
}

export interface ResumeVerifyResult {
  missing: string[]
  allFilesVerified: boolean
  allModesHealed: boolean
  acf?: { stateFlags: string }
}

/**
 * D-13: one verify_only job. Rust reconciles every file against the manifests, heals modes and
 * writes the honest ACF (4 only when everything verifies, otherwise 1026); no chunk is fetched.
 * Rejects when no job could run (CM half failed, or the job itself errored), so the caller can
 * fall back to the honest-empty 1026 finalize.
 */
export async function resumeVerifyRust(
  appId: string,
  input: ResumeVerifyInput
): Promise<ResumeVerifyResult> {
  assertNumericAppId(appId)
  const lease = await acquireOrThrow(appId, 'user-install')
  try {
    const opts: DownloadSteamDepotsOpts = {
      targetSteamappsDir: input.targetSteamappsDir,
      installdir: input.installdir,
      os: input.os
    }
    const refs = await buildDepotRefs(appId, opts)
    // Nothing to verify: let the caller write the honest-empty finalize instead.
    if (!refs.depots.length)
      throw new Error('resume verify: no depots selected')
    const client = getDepotClient()
    const hosts = await getContentServerHosts(client, Number(appId))
    const tokenCache = new CdnAuthTokenCache(client, Number(appId))
    const finalize: RustFinalizeSpec = {
      steamappsDir: input.targetSteamappsDir,
      installdir: input.installdir,
      name: input.name,
      buildid: refs.buildid === '' ? null : refs.buildid,
      lastOwner: SteamUser.getPersistedSteamId64() ?? null,
      allowFullOwnership: true
    }
    const job = buildDepotJob({
      appId,
      mode: 'verify_only',
      installRoot: resolve(
        input.targetSteamappsDir,
        'common',
        input.installdir
      ),
      refs: refs.depots,
      hosts,
      finalize
    })
    const outcome = await runDepotJob(job, {
      tokenCache,
      refreshRequestCode: requestCodeRefresher(
        client,
        new Map(refs.depots.map((d) => [d.depotId, d.ownerAppId])),
        appId
      ),
      onEvent: () => {}
    })
    logOutcome(job, outcome)
    if (outcome.status === 'cancelled') {
      throw new Error('resume verify job was cancelled')
    }
    return {
      missing: outcome.missing ?? [],
      allFilesVerified: outcome.allFilesVerified,
      allModesHealed: outcome.allModesApplied,
      ...(outcome.acf ? { acf: { stateFlags: outcome.acf.stateFlags } } : {})
    }
  } finally {
    lease.release()
  }
}
