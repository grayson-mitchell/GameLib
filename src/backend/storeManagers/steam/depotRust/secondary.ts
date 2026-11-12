// Rust paths for the three secondary depot consumers (73-14, D-02, D-13): the steam_api
// prescreen, the selected-files fetch behind the original-DLL restore, and the startup-resume
// verify. The only pipeline since 73-19 removed the D-16 flag.
//
// Node does the CM half (appinfo, depot selection, keys, content servers, tokens); Rust reads
// manifests. Nothing here fetches a manifest in TS. Exit contract: no timers or handles.

import { basename, resolve } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { CdnAuthTokenCache } from '../depot/cdnAuth'
import { getContentServerHosts } from '../depot/contentServers'
import type {
  DownloadSelectedDepotFilesOpts,
  DownloadSelectedDepotFilesResult
} from '../depot/outcome'
import type {
  DepotSteamUser,
  DownloadSteamDepotsOpts
} from '../depot/planModel'
import {
  assertNumericAppId,
  buildDepotRefs,
  getDepotClient,
  throwIfAborted
} from '../depot/plan'
import { classifyDepotError } from '../depotErrors'
import { rustOutcomeToDepotOutcome } from './errorMap'
import { logOutcome, requestCodeRefresher } from './install'
import type { DepotRuntime } from '../steamInstallRuntime'
import { buildDepotJob, toRustDepotRefs, toRustHosts } from './jobBuilder'
import { runDepotJob, summarizeDepots } from './rustDepot'
import type { RustFinalizeSpec } from './types'

export type PrescreenResult = 'none' | 'x86' | 'x64' | 'both' | 'unknown'

/** The two steam_api basenames the bridge prescreen looks for (D-51-06). */
const STEAM_API_PATTERNS = ['steam_api.dll', 'steam_api64.dll']

type AcquireAuthenticated = DepotSteamUser['acquireAuthenticated']
type Lease = Awaited<ReturnType<AcquireAuthenticated>>

async function acquireOrThrow(
  steamUser: Pick<DepotSteamUser, 'acquireAuthenticated'>,
  appId: string,
  reason: Parameters<AcquireAuthenticated>[0]['reason']
): Promise<Extract<Lease, { ok: true }>> {
  const lease = await steamUser.acquireAuthenticated({
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
 * D-02: the bridge prescreen from `depot_manifest_summary`. Never throws; any failure resolves
 * 'unknown'. A manifest-level EResult-40 (Blocked) refusal skips that depot; when every depot is
 * blocked the summary fails and this resolves 'unknown'.
 */
export async function prescreenBridgeDepotsRust(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<PrescreenResult> {
  let lease: Lease | null = null
  try {
    assertNumericAppId(appId)
    throwIfAborted(opts.signal)
    lease = await acquireOrThrow(opts.steamUser, appId, 'prescreen')
    const refs = await buildDepotRefs(appId, { ...opts, os: 'windows' })
    if (!refs.depots.length) return 'none'
    const client = getDepotClient(opts.steamUser)
    const hosts = await getContentServerHosts(client, Number(appId))
    throwIfAborted(opts.signal)
    const tokenCache = new CdnAuthTokenCache(
      client,
      Number(appId),
      opts.installRuntime.cdnSchema
    )
    // The crate asks for CDN tokens under this host job id (73-12).
    const dispose = opts.installRuntime.depotJobs.registerActiveDepotJob(
      `summary-${appId}`,
      {
        appId,
        tokenCache,
        refreshRequestCode: requestCodeRefresher(
          client,
          new Map(refs.depots.map((d) => [d.depotId, d.ownerAppId])),
          appId,
          refs.branch
        ),
        onEvent: () => {}
      }
    )
    let res
    try {
      res = await summarizeDepots(opts.installRuntime.depotJobs.transport, {
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
    if (res.skippedDepots.length > 0) {
      logInfo(
        `prescreenBridgeDepots: appId ${appId} skipped depot(s) Steam blocked (eresult=40): ${res.skippedDepots.join(',')}`,
        LogPrefix.Steam
      )
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
 * throws: every failure maps to a structured status.
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
    lease = await acquireOrThrow(opts.steamUser, appId, 'original-restore')
    throwIfAborted(opts.signal)
    const refs = await buildDepotRefs(appId, opts)
    if (!refs.depots.length || opts.selectPaths.length === 0) {
      return { status: 'done', files: [] }
    }
    const client = getDepotClient(opts.steamUser)
    const hosts = await getContentServerHosts(client, Number(appId))
    throwIfAborted(opts.signal)
    const tokenCache = new CdnAuthTokenCache(
      client,
      Number(appId),
      opts.installRuntime.cdnSchema
    )
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
      registry: opts.installRuntime.depotJobs,
      signal: opts.signal,
      tokenCache,
      refreshRequestCode: requestCodeRefresher(
        client,
        new Map(refs.depots.map((d) => [d.depotId, d.ownerAppId])),
        appId,
        refs.branch
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
  installRuntime: DepotRuntime
  steamUser: DepotSteamUser
  config: DownloadSteamDepotsOpts['config']
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
 * Rejects when no job could run (CM half failed, or the job errored before writing an ACF), so the caller can
 * fall back to the honest-empty 1026 finalize.
 */
export async function resumeVerifyRust(
  appId: string,
  input: ResumeVerifyInput
): Promise<ResumeVerifyResult> {
  assertNumericAppId(appId)
  const lease = await acquireOrThrow(input.steamUser, appId, 'user-install')
  try {
    const opts: DownloadSteamDepotsOpts = {
      installRuntime: input.installRuntime,
      steamUser: input.steamUser,
      config: input.config,
      targetSteamappsDir: input.targetSteamappsDir,
      installdir: input.installdir,
      os: input.os
    }
    const refs = await buildDepotRefs(appId, opts)
    // Nothing to verify: let the caller write the honest-empty finalize instead.
    if (!refs.depots.length)
      throw new Error('resume verify: no depots selected')
    const client = getDepotClient(input.steamUser)
    const hosts = await getContentServerHosts(client, Number(appId))
    const tokenCache = new CdnAuthTokenCache(
      client,
      Number(appId),
      input.installRuntime.cdnSchema
    )
    const finalize: RustFinalizeSpec = {
      steamappsDir: input.targetSteamappsDir,
      installdir: input.installdir,
      name: input.name,
      buildid: refs.buildid === '' ? null : refs.buildid,
      lastOwner: input.steamUser.getPersistedSteamId64() ?? null,
      allowFullOwnership: true,
      betaKey: refs.branch === 'public' ? undefined : refs.branch
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
      registry: input.installRuntime.depotJobs,
      tokenCache,
      refreshRequestCode: requestCodeRefresher(
        client,
        new Map(refs.depots.map((d) => [d.depotId, d.ownerAppId])),
        appId,
        refs.branch
      ),
      onEvent: () => {}
    })
    logOutcome(job, outcome)
    if (outcome.status === 'cancelled') {
      throw new Error('resume verify job was cancelled')
    }
    // The job failed before it could finalize (e.g. every depot blocked, EResult 40), so no ACF
    // exists. Reject so the caller writes the honest-empty one.
    if (outcome.status === 'error' && !outcome.acf) {
      throw new Error(
        `resume verify job failed before finalize: ${outcome.failures[0]?.message ?? 'unknown'}`
      )
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
