// Bridge Verify job (quick 261120-p2j): an install-mode Rust job over the ACF's InstalledDepots
// GIDs. Rust reconciles the tree against those manifests (SHA-1 per file), fetches only the
// chunks whose bytes fail, and never visits a file the manifests do not own.
//
// Why `install` and not `verify_only`: verify_only fetches nothing (the reconcile walk is the whole
// job), so it can report damage but not repair it. Why pinned: buildDepotRefs returns the branch's
// CURRENT manifests and buildid, and a verify run on those would silently become an update. Every
// ref's gid is replaced by the installed manifest, and finalize carries the installed buildid.
//
// Node does the CM half; Rust reads manifests; no timers or handles are created here. Abort is
// forwarded by runDepotJob.

import { resolve } from 'path'
import { logWarning, LogPrefix } from 'backend/logger'
import { getContentServerHosts } from '../depot/contentServers'
import { classifyDepotError } from '../depotErrors'
import type { DownloadSteamDepotsOpts } from '../depot/planModel'
import {
  assertNumericAppId,
  buildDepotRefs,
  fetchDepotKey,
  getDepotClient,
  throwIfAborted,
  type DepotRefEntry
} from '../depot/plan'
import type { downloadSteamDepots } from '../depot/outcome'
import type { AcfInstalledDepot } from '../acfInstalledDepots'
import { sanitizeInstalldir, UnsafeInstalldirError } from '../installLocation'
import { rustOutcomeToDepotOutcome } from './errorMap'
import { buildDepotJob, type ContentServerHosts } from './jobBuilder'
import { createProgressBridge } from './progressBridge'
import { logOutcome, requestCodeRefresher } from './install'
import { runDepotJob } from './rustDepot'
import type { RustFinalizeSpec } from './types'

type DepotDownloadOutcome = Awaited<ReturnType<typeof downloadSteamDepots>>

export type VerifyInstalledDepotsOpts = DownloadSteamDepotsOpts & {
  /** The ACF's installed buildid and depots, every id an exact digit string. */
  installed: { buildid: string | undefined; depots: AcfInstalledDepot[] }
}

export async function verifyInstalledDepotsRust(
  appId: string,
  opts: VerifyInstalledDepotsOpts
): Promise<DepotDownloadOutcome> {
  let lease: Awaited<
    ReturnType<DownloadSteamDepotsOpts['steamUser']['acquireAuthenticated']>
  > | null = null
  try {
    assertNumericAppId(appId)
    throwIfAborted(opts.signal)

    let installdir: string
    try {
      installdir = sanitizeInstalldir(
        opts.installdir,
        appId,
        opts.targetSteamappsDir
      )
    } catch (err) {
      if (!(err instanceof UnsafeInstalldirError)) throw err
      logWarning(
        `verifyInstalledDepots: rejected an unsafe installdir for appId ${appId}; no job run`,
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: 'The install folder recorded for this game is not safe to use'
      }
    }
    if (opts.installed.depots.length === 0) {
      return {
        status: 'error',
        error: 'The install manifest lists no installed depots to verify'
      }
    }

    lease = await opts.steamUser.acquireAuthenticated({
      reason: opts.sessionReason ?? 'user-install',
      appName: appId
    })
    throwIfAborted(opts.signal)
    if (!lease.ok) {
      throw new Error(
        `verifyInstalledDepots: no authenticated Steam CM connection available for appId ${appId} (${lease.reason})`
      )
    }

    const refs = await buildDepotRefs(appId, opts)
    const client = getDepotClient(opts.steamUser)
    const hosts: ContentServerHosts = await getContentServerHosts(
      client,
      Number(appId)
    )
    throwIfAborted(opts.signal)

    // Pin every installed depot to the installed manifest. A depot the branch plan did not
    // select still gets its key here (retirement-loop precedent: owner is the DLC app or the app).
    const byId = new Map(refs.depots.map((d) => [d.depotId, d]))
    const pinned: DepotRefEntry[] = []
    for (const d of opts.installed.depots) {
      throwIfAborted(opts.signal)
      const known = byId.get(d.depotId)
      if (known) {
        pinned.push({ ...known, gid: d.manifest })
        continue
      }
      try {
        const key = await fetchDepotKey(client, {
          id: d.depotId,
          manifest: d.manifest,
          size: 0,
          ownerAppId: d.dlcAppId ?? appId
        })
        pinned.push({
          depotId: d.depotId,
          gid: d.manifest,
          key,
          ownerAppId: d.dlcAppId ?? appId
        })
      } catch (err) {
        if (opts.signal?.aborted) throw err
        logWarning(
          `verifyInstalledDepots: no key for installed depot ${d.depotId} of appId ${appId}`,
          LogPrefix.Steam
        )
        return {
          status: 'error',
          error: `Could not get the key for installed depot ${d.depotId}, so the game cannot be verified`
        }
      }
    }

    const finalize: RustFinalizeSpec = {
      steamappsDir: opts.targetSteamappsDir,
      installdir,
      name: refs.name,
      // The installed build, never refs.buildid: a verify must not become an update.
      buildid: opts.installed.buildid ?? null,
      lastOwner: opts.steamUser.getPersistedSteamId64() ?? null,
      allowFullOwnership: opts.signal?.aborted !== true,
      betaKey: refs.branch === 'public' ? undefined : refs.branch
    }
    const job = buildDepotJob({
      appId,
      mode: 'install',
      installRoot: resolve(opts.targetSteamappsDir, 'common', installdir),
      refs: pinned,
      hosts,
      finalize
    })
    const bridge = createProgressBridge(
      opts.installRuntime.depotJobs.transport,
      appId,
      'steam',
      Date.now,
      { repair: true }
    )
    const outcome = await runDepotJob(job, {
      registry: opts.installRuntime.depotJobs,
      signal: opts.signal,
      refreshRequestCode: requestCodeRefresher(
        client,
        new Map(pinned.map((d) => [d.depotId, d.ownerAppId])),
        appId,
        refs.branch
      ),
      onEvent: (ev) => bridge.onEvent(ev)
    })
    logOutcome(job, outcome)
    const skippedDepots =
      (outcome.skippedDepots ?? []).length > 0
        ? outcome.skippedDepots
        : undefined
    if (opts.signal?.aborted === true && outcome.status !== 'cancelled') {
      return { status: 'cancelled', skippedDepots }
    }
    return rustOutcomeToDepotOutcome(outcome, skippedDepots)
  } catch (err) {
    if (opts.signal?.aborted) return { status: 'cancelled' }
    const classified = classifyDepotError(err)
    logWarning(
      `verifyInstalledDepots: failed before a job finished for appId ${appId}`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: classified.message,
      errorAction: classified.action
    }
  } finally {
    if (lease?.ok) lease.release()
  }
}
