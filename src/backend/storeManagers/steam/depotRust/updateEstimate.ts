// Size estimate of a bridge update (Phase 74 D-09/D-13/D-14): one manifest-to-manifest summary
// per depot with `fromManifest`, no local hashing and no download. Runs only from an explicit
// user action or from updateBridgeGame itself, never on refresh or page open (steam-user is
// authenticated only on demand). Never throws: a failure resolves `{ error }`.
// Exit contract: the only timer is AbortSignal.timeout's, which Node unrefs (it never holds the
// event loop; same reasoning as knownFixReport.ts), and the abort listener is removed in finally.

import { randomUUID } from 'node:crypto'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { getContentServerHosts } from '../depot/contentServers'
import type { DownloadSteamDepotsOpts } from '../depot/planModel'
import {
  assertNumericAppId,
  buildDepotRefs,
  getDepotClient,
  throwIfAborted
} from '../depot/plan'
import { readAcfBetaKey } from '../depot/betaBranch'
import { readAcfInstalldir } from '../acfInstalldir'
import { readAcfInstalledDepots } from '../acfInstalledDepots'
import { findBridgeInstallBottle } from '../bridgeBottle'
import { getBottleSteamappsDir } from '../bottle'
import type SteamGame from '../games'
import type { SteamUpdateEstimate } from '../updateDetection'
import { requestCodeRefresher } from './install'
import type { RustDeltaEstimate } from './types'
import { toRustDepotRefs, toRustHosts } from './jobBuilder'
import { summarizeDepots as summarize } from './rustDepot'

/** Where a bridge install lives and what it has installed, all from the raw ACF. */
export interface BridgeUpdateContext {
  bridgeBottleName: string
  steamappsDir: string
  installdir: string
  branch: string
  /** Installed GID per depot id, exact strings (they exceed 2^53). */
  oldGidByDepot: Map<string, string>
}

export async function resolveBridgeUpdateContext(
  steamGame: SteamGame
): Promise<BridgeUpdateContext | { error: string }> {
  const { deps, appId } = steamGame
  const bridgeBottleName = findBridgeInstallBottle(deps.paths, appId)
  if (!bridgeBottleName) return { error: 'No bridge install found' }
  const steamappsDir = getBottleSteamappsDir(deps.paths, bridgeBottleName)
  const installdir = await readAcfInstalldir(deps, steamappsDir, appId)
  const depots = await readAcfInstalledDepots(deps, steamappsDir, appId)
  if (!installdir || !depots) {
    return { error: 'The install manifest could not be read' }
  }
  return {
    bridgeBottleName,
    steamappsDir,
    installdir,
    branch: (await readAcfBetaKey(deps, steamappsDir, appId)) ?? 'public',
    oldGidByDepot: new Map(
      depots.installedDepots.map((d) => [d.depotId, d.manifest])
    )
  }
}

/** Upper bound on one estimate; a stalled summary must not hold the steam-user lease forever. */
export const ESTIMATE_TIMEOUT_MS = 60_000

export async function estimateBridgeUpdate(
  steamGame: SteamGame,
  // timeoutMs exists so tests use a short real timeout: AbortSignal.timeout's internal timer is
  // not controlled by jest fake timers.
  opts: {
    signal?: AbortSignal
    unattended?: boolean
    timeoutMs?: number
  }
): Promise<SteamUpdateEstimate | { error: string }> {
  const { deps, appId } = steamGame
  const timeoutMs = opts.timeoutMs ?? ESTIMATE_TIMEOUT_MS
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  let lease: Awaited<
    ReturnType<typeof deps.steamUser.acquireAuthenticated>
  > | null = null
  try {
    assertNumericAppId(appId)
    const ctx = await resolveBridgeUpdateContext(steamGame)
    if ('error' in ctx) return ctx
    throwIfAborted(signal)
    lease = await deps.steamUser.acquireAuthenticated({
      // reason stays 'user-install' for attended and unattended runs alike.
      reason: 'user-install',
      appName: appId
    })
    if (!lease.ok)
      return { error: `Steam sign-in unavailable (${lease.reason})` }
    const depotOpts: DownloadSteamDepotsOpts = {
      installRuntime: deps.steamInstallRuntime,
      steamUser: deps.steamUser,
      config: deps.config,
      targetSteamappsDir: ctx.steamappsDir,
      installdir: ctx.installdir,
      os: 'windows',
      branch: ctx.branch,
      // Not `delta`: that means "run as a chunk-level delta job", and the estimate is not one.
      installedDepotIds: new Set(ctx.oldGidByDepot.keys()),
      signal
    }
    const refs = await buildDepotRefs(appId, depotOpts)
    const client = getDepotClient(deps.steamUser)
    const hosts = await getContentServerHosts(client, Number(appId))
    throwIfAborted(signal)
    const jobId = `summary-${appId}-${randomUUID()}`
    const dispose = deps.steamInstallRuntime.depotJobs.registerActiveDepotJob(
      jobId,
      {
        appId,
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
    let onAbort: (() => void) | undefined
    try {
      // An abandoned Rust summary keeps running (no summary cancel exists); its later
      // token/request-code callbacks find no registry entry and fail, which is the intended result.
      const aborted = new Promise<never>((_, reject) => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the caller's abort reason, passed through verbatim
        onAbort = () => reject(signal.reason)
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      })
      res = await Promise.race([
        summarize(deps.steamInstallRuntime.depotJobs.transport, {
          appId,
          depots: toRustDepotRefs(refs.depots, ctx.oldGidByDepot),
          hosts: toRustHosts(hosts),
          patterns: [],
          jobId
        }),
        aborted
      ])
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort)
      dispose()
    }
    if ('error' in res) {
      logWarning(
        `estimateBridgeUpdate: appId ${appId} summary failed (${res.error.kind})`,
        LogPrefix.Steam
      )
      return { error: res.error.message }
    }
    const deltas: (RustDeltaEstimate | undefined)[] = res.depots.map(
      (d) => d.delta
    )
    let downloadBytes = 0
    let sumChanged = 0
    let maxChanged = 0
    let allOld = true
    let newDepotBytes = 0
    let newDepots = 0
    for (const [i, d] of deltas.entries()) {
      if (!d) {
        // A depot new in this build has no old GID: all of it is downloaded and written, but it
        // says nothing about whether the old manifests are available.
        newDepotBytes += res.depots[i]?.totalBytes ?? 0
        newDepots += 1
        continue
      }
      downloadBytes += d.maxDownloadBytes
      sumChanged += d.changedBytes
      maxChanged = Math.max(maxChanged, d.changedBytes)
      if (!d.oldManifestAvailable) allOld = false
    }
    downloadBytes += newDepotBytes
    const estimate: SteamUpdateEstimate = {
      targetBuild: refs.buildid,
      downloadBytes,
      peakBytes: (allOld ? sumChanged : maxChanged) + newDepotBytes,
      oldManifestAvailable: allOld,
      computedAt: Date.now()
    }
    deps.steamInstallRuntime.updateStates.setEstimate(appId, estimate)
    logInfo(
      `estimateBridgeUpdate: appId ${appId} download~${downloadBytes} peak=${estimate.peakBytes} oldManifest=${allOld} newDepots=${newDepots}`,
      LogPrefix.Steam
    )
    return estimate
  } catch (err) {
    if (timeout.aborted) {
      logWarning(
        `estimateBridgeUpdate: appId ${appId} timed out after ${timeoutMs} ms`,
        LogPrefix.Steam
      )
      return {
        error: `Update size estimate timed out after ${Math.round(timeoutMs / 1000)} s`
      }
    }
    logWarning(
      `estimateBridgeUpdate: appId ${appId} failed: ${String(err)}`,
      LogPrefix.Steam
    )
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    if (lease?.ok) lease.release()
  }
}
