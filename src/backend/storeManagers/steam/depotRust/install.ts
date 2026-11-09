// Rust install entry points behind GAMELIB_DEPOT_PIPELINE=rust (73-13, D-04, D-11, D-12).
//
// Node does the CM work (appinfo, ownership, depot selection, keys, content servers, CDN auth
// tokens and manifest request codes on demand); Rust does everything per file and chunk and
// writes the appmanifest. TS keeps the lease for the whole job because Rust calls back for
// tokens through the sidecar's client.
//
// Exit contract: no timers or handles are created here. Abort is forwarded by runDepotJob.

import { join, resolve } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { SteamUser } from '../user'
import { CdnAuthTokenCache } from '../depot/cdnAuth'
import { getContentServerHosts } from '../depot/contentServers'
import { finalizeToSteam } from '../depot/finalize'
import { classifyDepotError } from '../depotErrors'
import type {
  DownloadSteamDepotsOpts,
  DepotPlanEntry
} from '../depot/planModel'
import {
  assertNumericAppId,
  buildDepotRefs,
  getDepotClient,
  throwIfAborted
} from '../depot/plan'
import type { downloadSteamDepots } from '../depot/outcome'
import { rustOutcomeToDepotOutcome } from './errorMap'
import { buildDepotJob, type ContentServerHosts } from './jobBuilder'
import { createProgressBridge } from './progressBridge'
import { runDepotJob } from './rustDepot'
import type { RustDepotJob, RustFinalizeSpec, RustOutcome } from './types'

type DepotDownloadOutcome = Awaited<ReturnType<typeof downloadSteamDepots>>

/** One line per job, all statuses. Parity sweeps and live UAT read it as proof the Rust path ran. */
function logOutcome(job: RustDepotJob, o: RustOutcome): void {
  const s = o.stats
  logInfo(
    `[depot-rust] outcome appId=${job.appId} jobId=${job.jobId} mode=${job.mode} ` +
      `status=${o.status} acf=${o.acf?.stateFlags ?? 'none'} vz=${s.containers.vz} ` +
      `vsza=${s.containers.vsza} pk=${s.containers.pk} macho=${s.machoExecApplied} ` +
      `collisions=${s.pathCollisions} bytes=${s.bytesFetched} elapsedMs=${s.elapsedMs}`,
    LogPrefix.Steam
  )
}

type CodeClient = {
  getManifestRequestCode(
    appId: number,
    depotId: number,
    manifestId: string,
    branch: string
  ): Promise<{ requestCode: unknown }>
}

/** Fresh manifest request code for a depot under its owner app, or null when none is available. */
function requestCodeRefresher(
  client: CodeClient,
  ownerByDepot: Map<string, string>,
  fallbackAppId: string
) {
  return async (
    depotId: string,
    manifestId: string
  ): Promise<string | null> => {
    const owner = ownerByDepot.get(depotId) ?? fallbackAppId
    try {
      const { requestCode } = await client.getManifestRequestCode(
        Number(owner),
        Number(depotId),
        manifestId,
        'public'
      )
      // A uint64 arrives as a number, string or Long; String() renders all three.
      const code = String((requestCode ?? '') as string | number | bigint)
      return /^\d+$/.test(code) && code !== '0' ? code : null
    } catch {
      return null
    }
  }
}

export async function downloadSteamDepotsRust(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<DepotDownloadOutcome> {
  let skippedDepots: string[] | undefined
  let lease: Awaited<ReturnType<typeof SteamUser.acquireAuthenticated>> | null =
    null
  try {
    assertNumericAppId(appId)
    throwIfAborted(opts.signal)
    lease = await SteamUser.acquireAuthenticated({
      reason: opts.sessionReason ?? 'user-install',
      guidedAction: 'install',
      appName: appId
    })
    throwIfAborted(opts.signal)
    if (!lease.ok) {
      logWarning(
        `downloadSteamDepots: no authenticated Steam CM connection for appId ${appId} (${lease.reason})`,
        LogPrefix.Steam
      )
      throw new Error(
        `downloadSteamDepots: no authenticated Steam CM connection available for appId ${appId} (${lease.reason})`
      )
    }

    // A throw anywhere in the CM half lands in the catch below with no job started, so no ACF is
    // written (D-11, 23.2 Case A).
    const refs = await buildDepotRefs(appId, opts)
    skippedDepots = refs.skippedDepots

    if (!refs.depots.length) {
      // Same honest empty finalize the TS path writes; no download stage exists to run in Rust.
      await finalizeToSteam(appId, {
        targetSteamappsDir: opts.targetSteamappsDir,
        installdir: opts.installdir,
        name: refs.name,
        depots: [],
        buildid: refs.buildid,
        outcome: opts.signal?.aborted === true ? 'cancelled' : undefined
      })
      return opts.signal?.aborted === true
        ? { status: 'cancelled', skippedDepots }
        : { status: 'done', skippedDepots }
    }

    const client = getDepotClient()
    const hosts: ContentServerHosts = await getContentServerHosts(
      client,
      Number(appId)
    )
    throwIfAborted(opts.signal)
    const tokenCache = new CdnAuthTokenCache(client, Number(appId))

    // StateFlags policy: today finalizeToSteam always asks canWriteFullOwnership, fed by the
    // run's outcome (an aborted signal forces 'cancelled'). Rust applies the same gate to its own
    // outcome (buildid present and not "0", no failures, verified, modes applied), so TS only
    // withholds permission when the signal is already aborted.
    const finalize: RustFinalizeSpec = {
      steamappsDir: opts.targetSteamappsDir,
      installdir: opts.installdir,
      name: refs.name,
      buildid: refs.buildid === '' ? null : refs.buildid,
      lastOwner: SteamUser.getPersistedSteamId64() ?? null,
      allowFullOwnership: opts.signal?.aborted !== true
    }
    const job = buildDepotJob({
      appId,
      mode: 'install',
      installRoot: resolve(opts.targetSteamappsDir, 'common', opts.installdir),
      refs: refs.depots,
      hosts,
      finalize
    })
    const bridge = createProgressBridge(appId)
    const outcome = await runDepotJob(job, {
      signal: opts.signal,
      tokenCache,
      refreshRequestCode: requestCodeRefresher(
        client,
        new Map(refs.depots.map((d) => [d.depotId, d.ownerAppId])),
        appId
      ),
      onEvent: (ev) => bridge.onEvent(ev)
    })
    logOutcome(job, outcome)
    if (opts.signal?.aborted === true && outcome.status !== 'cancelled') {
      // Mirrors the TS path: an abort that raced a finished job still reports cancelled.
      return { status: 'cancelled', skippedDepots }
    }
    return rustOutcomeToDepotOutcome(outcome, skippedDepots)
  } catch (err) {
    if (opts.signal?.aborted) return { status: 'cancelled', skippedDepots }
    const classified = classifyDepotError(err)
    logWarning(
      `downloadSteamDepots: rust install failed before a job finished for appId ${appId}`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: classified.message,
      errorAction: classified.action,
      skippedDepots
    }
  } finally {
    if (lease?.ok) lease.release()
  }
}

/** Host state downloadSharedRedistDepots already builds once per run. */
export interface SharedRedistHostInfo extends ContentServerHosts {
  cdnAuth: CdnAuthTokenCache
}

/**
 * The download step of downloadSharedRedistDepots on the Rust path (D-12): one ordinary Rust job
 * for a depot's files under the shared cache root, no finalize and so no ACF. The lease, index
 * file, locks and ledger stay in sharedRedist.ts. `files` being the entry's own file list means
 * the whole depot; any other list is fetched as a select_files job. Resolves true only when the
 * job completed.
 */
export async function downloadSharedRedistDepotsRust(args: {
  appId: string
  entry: DepotPlanEntry
  files: DepotPlanEntry['files']
  cacheSteamappsDir: string
  installdir: string
  host: SharedRedistHostInfo
  signal?: AbortSignal
}): Promise<boolean> {
  const client = getDepotClient()
  const whole = args.files === args.entry.files
  const job = buildDepotJob({
    appId: args.appId,
    mode: whole ? 'install' : 'select_files',
    installRoot: join(args.cacheSteamappsDir, 'common', args.installdir),
    refs: [
      {
        depotId: args.entry.depotId,
        gid: args.entry.gid,
        key: args.entry.key,
        ownerAppId: args.appId
      }
    ],
    hosts: args.host,
    finalize: null,
    selectPaths: whole ? undefined : args.files.map((f) => f.filename)
  })
  const bridge = createProgressBridge(args.appId)
  const outcome = await runDepotJob(job, {
    signal: args.signal,
    tokenCache: args.host.cdnAuth,
    refreshRequestCode: requestCodeRefresher(
      client,
      new Map([[args.entry.depotId, args.appId]]),
      args.appId
    ),
    onEvent: (ev) => bridge.onEvent(ev)
  })
  logOutcome(job, outcome)
  return outcome.status === 'completed'
}
