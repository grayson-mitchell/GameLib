// Rust install entry points (73-13, D-04, D-11, D-12); the only depot pipeline since 73-19.
//
// Node does the CM work (appinfo, ownership, depot selection, keys, content servers, CDN auth
// tokens and manifest request codes on demand); Rust does everything per file and chunk and
// writes the appmanifest. TS keeps the lease for the whole job because Rust calls back for
// tokens through the sidecar's client.
//
// Exit contract: no timers or handles are created here. Abort is forwarded by runDepotJob.

import { join, resolve } from 'path'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { CdnAuthTokenCache } from '../depot/cdnAuth'
import { getContentServerHosts } from '../depot/contentServers'
import { finalizeToSteam } from '../depot/finalizeAcf'
import { classifyDepotError } from '../depotErrors'
import type {
  DepotSteamUser,
  DownloadSteamDepotsOpts
} from '../depot/planModel'
import {
  assertNumericAppId,
  buildDepotRefs,
  getDepotClient,
  throwIfAborted,
  type DepotRefEntry
} from '../depot/plan'
import {
  formatDownloadFailureSummary,
  selectPrimaryDepotFailure,
  type downloadSteamDepots
} from '../depot/outcome'
import {
  rustFailureToError,
  rustFailuresToDepotFailures,
  rustOutcomeToDepotOutcome
} from './errorMap'
import {
  buildDepotJob,
  toRustDepotRefs,
  toRustHosts,
  type ContentServerHosts
} from './jobBuilder'
import { registerActiveDepotJob } from './jobRegistry'
import { createProgressBridge } from './progressBridge'
import { runDepotJob, summarizeDepots } from './rustDepot'
import type {
  RustDepotJob,
  RustFinalizeSpec,
  RustJobMode,
  RustOutcome
} from './types'

type DepotDownloadOutcome = Awaited<ReturnType<typeof downloadSteamDepots>>

/** One line per job, all statuses. Parity sweeps and live UAT read it as proof the Rust path ran. */
export function logOutcome(job: RustDepotJob, o: RustOutcome): void {
  const s = o.stats
  logInfo(
    `[depot-rust] outcome appId=${job.appId} jobId=${job.jobId} mode=${job.mode} ` +
      `status=${o.status} acf=${o.acf?.stateFlags ?? 'none'} vz=${s.containers.vz} ` +
      `vsza=${s.containers.vsza} pk=${s.containers.pk} macho=${s.machoExecApplied} ` +
      `collisions=${s.pathCollisions} skipped=${(o.skippedDepots ?? []).join(',')} bytes=${s.bytesFetched} elapsedMs=${s.elapsedMs}`,
    LogPrefix.Steam
  )
}

/**
 * Quick 260927-tpm / debug/steam-depot-unclassified-generic-error (F2): on a failed job, the
 * aggregate line with the file-failure count, the classification key and the primary raw
 * failure. The UI shows only the classified copy, so this is the one place a log says what the
 * classifier was fed and whether it fell through to the generic bucket.
 */
function logFailureSummary(appId: string, o: RustOutcome): void {
  if (o.status !== 'error' || o.failures.length === 0) return
  const failures = rustFailuresToDepotFailures(o.failures)
  const primary = selectPrimaryDepotFailure(failures)
  const key = classifyDepotError(primary.cause ?? primary.error).key
  logError(formatDownloadFailureSummary(appId, failures, key), LogPrefix.Steam)
}

type CodeClient = {
  getManifestRequestCode(
    appId: number,
    depotId: number,
    manifestId: string,
    branch: string
  ): Promise<{ requestCode: unknown }>
}

/**
 * Fresh manifest request code for a depot under its owner app, or null when none is available.
 * Rejects only with an EResult-40 (Blocked) error, which the host handler turns into a skip.
 */
export function requestCodeRefresher(
  client: CodeClient,
  ownerByDepot: Map<string, string>,
  fallbackAppId: string,
  branch = 'public'
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
        branch
      )
      // A uint64 arrives as a number, string or Long; String() renders all three.
      const code = String((requestCode ?? '') as string | number | bigint)
      return /^\d+$/.test(code) && code !== '0' ? code : null
    } catch (err) {
      // EResult 40 (Blocked) is the one refusal buildDepotRefs skips a depot for; carry it
      // to the host handler so the crate does the same (every other failure is "no code").
      if ((err as { eresult?: unknown }).eresult === 40) throw err
      return null
    }
  }
}

export async function downloadSteamDepotsRust(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<DepotDownloadOutcome> {
  let skippedDepots: string[] | undefined
  let lease: Awaited<
    ReturnType<DepotSteamUser['acquireAuthenticated']>
  > | null = null
  try {
    assertNumericAppId(appId)
    throwIfAborted(opts.signal)
    lease = await opts.steamUser.acquireAuthenticated({
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
      // Honest empty finalize: a dangling prior partial is never left unresolved, and there is
      // no download stage to run in Rust.
      await finalizeToSteam(appId, {
        steamUser: opts.steamUser,
        targetSteamappsDir: opts.targetSteamappsDir,
        installdir: opts.installdir,
        name: refs.name,
        depots: [],
        buildid: refs.buildid,
        betaKey: refs.branch === 'public' ? undefined : refs.branch,
        outcome: opts.signal?.aborted === true ? 'cancelled' : undefined
      })
      return opts.signal?.aborted === true
        ? { status: 'cancelled', skippedDepots }
        : { status: 'done', skippedDepots }
    }

    const client = getDepotClient(opts.steamUser)
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
      lastOwner: opts.steamUser.getPersistedSteamId64() ?? null,
      allowFullOwnership: opts.signal?.aborted !== true,
      betaKey: refs.branch === 'public' ? undefined : refs.branch
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
        appId,
        refs.branch
      ),
      onEvent: (ev) => bridge.onEvent(ev)
    })
    logOutcome(job, outcome)
    logFailureSummary(appId, outcome)
    // Manifest-level EResult-40 refusals join the key-level ones. When every depot was blocked
    // the job fails (as buildDepotRefs throws for all-blocked keys), so no skipped list is
    // reported then.
    const manifestSkipped = outcome.skippedDepots ?? []
    skippedDepots =
      manifestSkipped.length > 0 &&
      manifestSkipped.length === refs.depots.length
        ? undefined
        : [...refs.skippedDepots, ...manifestSkipped]
    if (opts.signal?.aborted === true && outcome.status !== 'cancelled') {
      // An abort that raced a finished job still reports cancelled (D-UAT-09).
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

/** One shared redist depot under the shared cache root (D-12). */
export interface SharedRedistJobArgs {
  steamUser: Pick<DepotSteamUser, 'getClient'>
  appId: string
  ref: DepotRefEntry
  cacheSteamappsDir: string
  installdir: string
  host: SharedRedistHostInfo
  signal?: AbortSignal
}

/** An ordinary Rust job with no finalize, so no ACF, under the shared cache root. */
async function runSharedRedistJob(
  args: SharedRedistJobArgs,
  mode: RustJobMode,
  selectPaths?: string[]
): Promise<RustOutcome> {
  const job = buildDepotJob({
    appId: args.appId,
    mode,
    installRoot: join(args.cacheSteamappsDir, 'common', args.installdir),
    refs: [args.ref],
    hosts: args.host,
    finalize: null,
    selectPaths
  })
  const bridge =
    mode === 'verify_only' ? null : createProgressBridge(args.appId)
  const outcome = await runDepotJob(job, {
    signal: args.signal,
    tokenCache: args.host.cdnAuth,
    refreshRequestCode: requestCodeRefresher(
      getDepotClient(args.steamUser),
      new Map([[args.ref.depotId, args.appId]]),
      args.appId
    ),
    onEvent: (ev) => bridge?.onEvent(ev)
  })
  logOutcome(job, outcome)
  return outcome
}

/**
 * The download step of downloadSharedRedistDepots (D-12): the whole depot, or only `selectPaths`
 * as a select_files job (the installscript). The lease, index file, locks and ledger stay in
 * sharedRedist.ts. Resolves true only when the job completed.
 */
export async function downloadSharedRedistDepotsRust(
  args: SharedRedistJobArgs & { selectPaths?: string[] }
): Promise<boolean> {
  const outcome = await runSharedRedistJob(
    args,
    args.selectPaths ? 'select_files' : 'install',
    args.selectPaths
  )
  return outcome.status === 'completed'
}

/**
 * The cached-depot check (WR-05): a verify_only job, so every file is sha1-checked against the
 * manifest and nothing is fetched. Resolves the normalised paths that are missing or mismatched,
 * or null when the job could not verify at all (the caller treats that as a damaged cache).
 */
export async function verifySharedRedistDepotRust(
  args: SharedRedistJobArgs
): Promise<string[] | null> {
  const outcome = await runSharedRedistJob(args, 'verify_only')
  if (outcome.status !== 'completed' || outcome.missing === null) return null
  return outcome.missing
}

/**
 * The installscript filenames of one shared redist depot, as the manifest spells them, from a
 * Rust manifest summary (D-02): TS never sees the file list. Rejects when the summary fails or
 * Steam refused the manifest (EResult 40), so the caller files the depot under `failed`.
 */
export async function sharedRedistInstallscriptsRust(
  args: Pick<SharedRedistJobArgs, 'steamUser' | 'appId' | 'ref' | 'host'>
): Promise<string[]> {
  // The crate asks for CDN tokens under this host job id (73-12).
  const dispose = registerActiveDepotJob(`summary-${args.appId}`, {
    appId: args.appId,
    tokenCache: args.host.cdnAuth,
    refreshRequestCode: requestCodeRefresher(
      getDepotClient(args.steamUser),
      new Map([[args.ref.depotId, args.appId]]),
      args.appId
    ),
    onEvent: () => {}
  })
  let res
  try {
    res = await summarizeDepots({
      appId: args.appId,
      depots: toRustDepotRefs([args.ref]),
      hosts: toRustHosts(args.host),
      patterns: []
    })
  } finally {
    dispose()
  }
  if ('error' in res) throw rustFailureToError(res.error)
  const summary = res.depots.find((d) => d.depotId === args.ref.depotId)
  if (!summary) {
    throw new Error(
      `shared redist depot ${args.ref.depotId}: no manifest summary (skipped: ${res.skippedDepots.join(',') || 'none'})`
    )
  }
  return summary.installscripts
}
