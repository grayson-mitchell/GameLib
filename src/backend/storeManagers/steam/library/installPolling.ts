import { logInfo, logError, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { type AcfSource, type PollOptions } from './installRoot'
import type { ManagerDeps } from 'backend/services/types'
import {
  GRACE_TICKS,
  MAX_TICKS,
  STEAM_REQUEST_NO_ACTIVITY_TICKS,
  MANIFEST_GONE_TICKS
} from './pollState'
import { restartHoldStoreFrom } from '../steamRestartHold'
import { releaseSteamHold } from './restartHold'
import { stopInstallPolling } from './installStop'
import { pollInstallOnce } from './installPollOnce'
import type { InstallPollState } from './pollState'

// ── Install polling lifecycle (D-07) ─────────────────────────────────────────

/**
 * Starts an ACF polling loop for appId. Idempotent — calling twice has no
 * effect, EXCEPT that a call carrying `isNativeHandoff: true` against an
 * ALREADY-registered poll upgrades that poll's isNativeHandoff (and adopts
 * skippedDepots when the existing entry has none) instead of no-opping — see
 * 260822-dkf below. The loop calls pollInstallOnce every intervalMs (default
 * 3 000 ms).
 *
 * Stops automatically when:
 *   - state becomes 'installed' (via pollInstallOnce → stopInstallPolling)
 *   - state has been 'absent' for GRACE_TICKS WITHOUT ever seeing
 *     'downloading' AND no GameLib-owned native depot download is in flight
 *     for this appId (user likely cancelled Steam's install dialog —
 *     T-03-06 mitigation; the in-flight exception is 260822-dkf, see the
 *     grace branch below)
 *   - delegatedToSteamClient polls only (quick 261024-exo): no activity
 *     within STEAM_REQUEST_NO_ACTIVITY_TICKS (~2 min) of the request, which
 *     reverts with a sign-in notice (quick 261105-vfq), or the manifest
 *     disappeared for MANIFEST_GONE_TICKS consecutive ticks after having
 *     appeared (these replace the GRACE_TICKS rule for such polls)
 *   - cancelDelegatedInstall() for a delegated poll (the Downloads Cancel)
 *   - MAX_TICKS elapsed (D-01 focus backstop takes over — T-03-06 mitigation)
 *
 * The second parameter accepts EITHER a plain intervalMs number (existing
 * call signature, unchanged) OR a `{ intervalMs?, source?, isNativeHandoff? }`
 * options object — `source: 'bottle'` polls the dedicated CrossOver bottle's
 * steamapps root instead of the native one. Omitting the second arg
 * entirely, or passing a bare number, preserves today's native behavior
 * byte-for-byte (including `isNativeHandoff` defaulting to false — see
 * activePolls' isNativeHandoff docstring, debug/steam-1026-download-restart).
 *
 * Exported for unit testing.
 */
export function startInstallPolling(
  deps: ManagerDeps,
  appId: string,
  intervalMsOrOptions: number | PollOptions = 3000
): void {
  const { polls } = deps.steamInstallRuntime
  const { activePolls } = polls
  // 260822-dkf (D-02): before the grace-window fix below, the finalize-time
  // handoff call at games.ts:1720/1726 only ever reached this function AFTER
  // the grace window had already killed resumeInterruptedSteamInstall's bare
  // download poll — so `activePolls` was always empty by then and this
  // idempotent guard never mattered to it. Fixing the grace window lets that
  // download poll survive, which means the SAME handoff call now arrives
  // while an entry already exists. Without this upgrade branch it would
  // silently no-op: isNativeHandoff/skippedDepots would never reach the
  // entry, and library.ts:2351's 1026 handoff interpretation,
  // library.ts:2547's "Restart Steam" notify, and the skippedDepots
  // completion notice would all stop firing. A bare call (no
  // isNativeHandoff:true) against an existing entry stays a pure no-op, as
  // before — this never downgrades an already-true isNativeHandoff back to
  // false. quick 261027-g9o: the isNativeHandoff:true upgrade also adopts an
  // explicit differing `source` and resets per-root progress baselines; a
  // call without isNativeHandoff:true, or without a source, never retargets.
  const existingEntry = activePolls.get(appId)
  if (existingEntry) {
    if (
      typeof intervalMsOrOptions !== 'number' &&
      intervalMsOrOptions.isNativeHandoff === true
    ) {
      existingEntry.isNativeHandoff = true
      if (intervalMsOrOptions.macNativeRoute === true) {
        existingEntry.macNativeRoute = true
      }
      // Never discard a non-empty skippedDepots list already on the entry.
      if (
        existingEntry.skippedDepots.length === 0 &&
        intervalMsOrOptions.skippedDepots?.length
      ) {
        existingEntry.skippedDepots = intervalMsOrOptions.skippedDepots
      }
      // quick 261027-g9o: adopt an explicit, differing source ONLY here. The
      // isNativeHandoff:true call is GameLib's finalize, which just wrote the
      // manifest and knows its root, so it is the sole authoritative retarget
      // signal. Other call sites (bare resume, OFF-path steam://install,
      // delegated dispatches) know nothing about where a manifest landed, and
      // an absent source must never reset the entry to the 'native' default.
      if (
        intervalMsOrOptions.source !== undefined &&
        intervalMsOrOptions.source !== existingEntry.source
      ) {
        logInfo(
          `Steam: switching in-flight install poll for appId ${appId} from source ${existingEntry.source} to ${intervalMsOrOptions.source} (quick 261027-g9o)`,
          LogPrefix.Steam
        )
        existingEntry.source = intervalMsOrOptions.source
        // Byte counts from one root's ACF are not comparable with another's.
        existingEntry.lastBytesDownloaded = undefined
        existingEntry.lastTickMs = undefined
        existingEntry.stalledTicks = 0
        existingEntry.absentTicksSinceSeen = 0
        // `ticks` is deliberately kept: MAX_TICKS stays an absolute cap.
      }
      logInfo(
        `Steam: upgrading in-flight install poll for appId ${appId} to isNativeHandoff (260822-dkf D-02)`,
        LogPrefix.Steam
      )
    }
    if (
      typeof intervalMsOrOptions !== 'number' &&
      intervalMsOrOptions.delegatedToSteamClient === true &&
      !existingEntry.delegatedToSteamClient
    ) {
      existingEntry.delegatedToSteamClient = true
      existingEntry.delegatedSinceTick = existingEntry.ticks
      markManagedBySteam(deps, appId)
      logInfo(
        `Steam: upgrading in-flight install poll for appId ${appId} to delegatedToSteamClient (quick 261024-exo)`,
        LogPrefix.Steam
      )
    }
    if (
      typeof intervalMsOrOptions !== 'number' &&
      intervalMsOrOptions.adoptedBySteamClient === true &&
      existingEntry.steamHold !== 'released'
    ) {
      releaseSteamHold(appId, existingEntry)
      logInfo(
        `Steam: in-flight install poll for appId ${appId} adopted by the Steam client via InstallApp — restart hold released (quick 261105-sqe)`,
        LogPrefix.Steam
      )
    }
    if (
      typeof intervalMsOrOptions !== 'number' &&
      intervalMsOrOptions.awaitingUpdate !== undefined
    ) {
      existingEntry.awaitingUpdate = {
        fromBuild: intervalMsOrOptions.awaitingUpdate.fromBuild,
        targetBuild: intervalMsOrOptions.awaitingUpdate.targetBuild,
        ...(intervalMsOrOptions.awaitingUpdate.installAppRetry && {
          installAppRetry: {
            ...intervalMsOrOptions.awaitingUpdate.installAppRetry
          }
        })
      }
      logInfo(
        `Steam: in-flight poll for appId ${appId} now watches an update (Phase 74 D-11)`,
        LogPrefix.Steam
      )
    }
    // quick 261029-sex: an upgrade to handoff or a retarget ends eligibility;
    // a delegated native poll gains it. Start is idempotent per appId.
    if (isLiveMonitorEligible(existingEntry)) {
      void deps.steamProcesses.downloadMonitor.start(appId)
    } else {
      deps.steamProcesses.downloadMonitor.stop(appId)
    }
    return // idempotent — no second interval either way
  }

  const {
    intervalMs,
    source,
    isNativeHandoff,
    macNativeRoute,
    skippedDepots,
    delegatedToSteamClient,
    adoptedBySteamClient,
    restoredSteamHold,
    awaitingUpdate
  }: {
    intervalMs: number
    source: AcfSource
    isNativeHandoff: boolean
    macNativeRoute: boolean
    skippedDepots: string[]
    delegatedToSteamClient: boolean
    adoptedBySteamClient: boolean
    restoredSteamHold: PollOptions['restoredSteamHold']
    awaitingUpdate: PollOptions['awaitingUpdate']
  } =
    typeof intervalMsOrOptions === 'number'
      ? {
          intervalMs: intervalMsOrOptions,
          source: 'native',
          isNativeHandoff: false,
          macNativeRoute: false,
          skippedDepots: [],
          delegatedToSteamClient: false,
          adoptedBySteamClient: false,
          restoredSteamHold: undefined,
          awaitingUpdate: undefined
        }
      : {
          intervalMs: intervalMsOrOptions.intervalMs ?? 3000,
          source: intervalMsOrOptions.source ?? 'native',
          isNativeHandoff: intervalMsOrOptions.isNativeHandoff ?? false,
          macNativeRoute: intervalMsOrOptions.macNativeRoute ?? false,
          skippedDepots: intervalMsOrOptions.skippedDepots ?? [],
          delegatedToSteamClient:
            intervalMsOrOptions.delegatedToSteamClient ?? false,
          adoptedBySteamClient:
            intervalMsOrOptions.adoptedBySteamClient ?? false,
          restoredSteamHold: intervalMsOrOptions.restoredSteamHold,
          awaitingUpdate: intervalMsOrOptions.awaitingUpdate
        }

  logInfo(
    `Steam: starting install polling for appId ${appId} (interval ${intervalMs}ms, source ${source}, isNativeHandoff ${isNativeHandoff}, skippedDepots ${skippedDepots.length}, delegatedToSteamClient ${delegatedToSteamClient}, adoptedBySteamClient ${adoptedBySteamClient})`,
    LogPrefix.Steam
  )

  const initialSteamHold: 'unprobed' | 'holding' | 'released' =
    restoredSteamHold
      ? 'holding'
      : adoptedBySteamClient
        ? 'released'
        : 'unprobed'

  const entry = {
    timer: null as unknown as NodeJS.Timeout,
    // quick 261029-pkp: a restored hold resumes the elapsed tick count.
    ticks: restoredSteamHold?.startTicks ?? 0,
    seenDownloading: restoredSteamHold ? true : false,
    source,
    notifiedWaiting: restoredSteamHold ? true : false,
    stalledTicks: 0,
    isNativeHandoff,
    macNativeRoute,
    skippedDepots,
    notifiedDepotSkipped: false,
    delegatedToSteamClient,
    delegatedSinceTick: 0,
    absentTicksSinceSeen: 0,
    steamHold: initialSteamHold,
    restartHoldStore: restartHoldStoreFrom(deps),
    steamPidsAtHandoff: restoredSteamHold?.pids ?? ([] as number[]),
    lastSteamProbeMs: restoredSteamHold ? Date.now() : 0,
    awaitingUpdate: awaitingUpdate
      ? {
          fromBuild: awaitingUpdate.fromBuild,
          targetBuild: awaitingUpdate.targetBuild,
          ...(awaitingUpdate.installAppRetry && {
            installAppRetry: { ...awaitingUpdate.installAppRetry }
          })
        }
      : undefined
  }

  const timer = setInterval(async () => {
    entry.ticks++

    // D-UAT-13: a poll holding for a Steam restart must not strand the
    // "Restart Steam to finish" UI when the safety cap arrives (the cap stop
    // below sends no status). Release the hold and let THIS tick fall through
    // to pollInstallOnce, whose installed flow reports the game installed and
    // stops the poll; if the manifest is gone by then the cap stop below
    // takes it on the next tick, exactly as for any other poll.
    let capReleasedHold = false
    if (entry.ticks >= MAX_TICKS && entry.steamHold === 'holding') {
      logWarning(
        `Steam: install polling for appId ${appId} hit safety cap (${MAX_TICKS} ticks) while waiting for a Steam restart; reporting it installed`,
        LogPrefix.Steam
      )
      releaseSteamHold(appId, entry)
      capReleasedHold = true
    }

    // Absolute safety cap — stop after MAX_TICKS and rely on the D-01 focus backstop
    if (entry.ticks >= MAX_TICKS && !capReleasedHold) {
      logWarning(
        `Steam: install polling for appId ${appId} hit safety cap (${MAX_TICKS} ticks); relying on D-01 focus backstop`,
        LogPrefix.Steam
      )
      stopInstallPolling(deps, appId)
      // 74-27 (T-74-92): the queue holds 'updating' through a Steam hand-off, so the
      // update poll must always end with a terminal 'done' (install polls unchanged).
      if (entry.awaitingUpdate) {
        deps.sendFrontendMessage('gameStatusUpdate', {
          appName: appId,
          runner: 'steam',
          status: 'done'
        })
      }
      return
    }

    // Teardown-safety (mirrors bottle.ts GAP C): a real poller can outlive the
    // Jest suite that started it (unref() above only stops it from keeping the
    // process alive — it does NOT stop it from firing while the process is
    // otherwise kept busy by a later suite). If it fires after that suite's
    // module mocks are torn down, readAcfState(deps)'s dependencies
    // (getSteamLibraries/getSteamBottleSettings) return undefined and throw.
    // Left unguarded, that throw escapes this async setInterval callback as an
    // unhandled rejection and kills the whole Jest worker. Production never
    // expects this branch — it's a defensive, log-only catch; the next tick
    // retries normally.
    try {
      await pollInstallOnce(deps, appId, entry.source)
    } catch (error) {
      logError(
        [`Steam: install polling tick for appId ${appId} threw`, error],
        LogPrefix.Steam
      )
      return
    }

    // pollInstallOnce may have stopped the poll (state became 'installed')
    if (!activePolls.has(appId)) return

    // Grace window (260822-dkf): "no manifest ever appeared" only means "the
    // user cancelled Steam's install dialog" when STEAM owns the download.
    // On the native depot path GameLib owns the download and deliberately
    // writes the ACF only at finalize (D-08), so `seenDownloading` can never
    // become true mid-download — an absent manifest carries NO cancellation
    // signal at all while GameLib's own depot run is still streaming chunks.
    // deps.steamSession.gameSession.isNativeInstallInFlight(appId) is read PER-TICK, never captured at
    // poll-start: on the resumeInterruptedSteamInstall path the flag is
    // still false when this poll is created and only becomes true a moment
    // later once the native depot run registers itself. Do NOT gate this on
    // isNativeHandoff — three of the four startInstallPolling call sites
    // leave it false, and two of those are exactly the paths whose cancel
    // detection this grace window exists to provide (D-01).
    //
    // No `entry.ticks` reset is needed when the download completes:
    // pollInstallOnce above runs before this branch on every tick and either
    // sets seenDownloading or stops the poll once GameLib's finalize has
    // written the manifest — so the only way this branch fires after a
    // completed native run is a run that produced no manifest at all, which
    // is a correct stop.
    if (entry.awaitingUpdate) {
      // Phase 74 (D-11): an update poll ends itself in pollUpdateOnce (completion or the quiet
      // no-activity stop); the install revert/sign-in notice, manifest-gone and grace rules do not
      // apply to an installed game. MAX_TICKS above stays the ceiling.
      return
    }
    if (entry.delegatedToSteamClient) {
      // quick 261024-exo: Steam owns the download — wait for it to start,
      // self-update and log in; stop only on a long no-manifest window or a
      // manifest that appeared and then vanished (cancel/uninstall in Steam).
      let delegatedStopReason: string | null = null
      if (
        !entry.seenDownloading &&
        entry.ticks - entry.delegatedSinceTick >=
          STEAM_REQUEST_NO_ACTIVITY_TICKS
      ) {
        logWarning(
          `Steam: Steam did not start the install for appId ${appId} — no activity within ${STEAM_REQUEST_NO_ACTIVITY_TICKS} ticks (~2 min) of the request; reverting to not installed (quick 261105-vfq)`,
          LogPrefix.Steam
        )
        deps.sendFrontendMessage('gameStatusUpdate', {
          appName: appId,
          runner: 'steam',
          status: 'done'
        })
        // quick 261106-pvk: the system notification can land on another
        // monitor or not be delivered at all, so the give-up notice goes to
        // GameLib's own toast stack (renderer maps `kind` to the string).
        deps.sendFrontendMessage('steamRequestNotice', {
          appId,
          title: deps.steamSession.libraryState.library.get(appId)?.title ?? '',
          kind: 'install-not-started',
          seq: polls.nextSteamRequestNoticeSeq()
        })
        stopInstallPolling(deps, appId)
        return
      } else if (
        entry.seenDownloading &&
        entry.absentTicksSinceSeen >= MANIFEST_GONE_TICKS
      ) {
        delegatedStopReason =
          'manifest disappeared after appearing; install cancelled or removed in Steam'
      }
      if (delegatedStopReason) {
        logWarning(
          `Steam: install polling for appId ${appId} stopped — ${delegatedStopReason}`,
          LogPrefix.Steam
        )
        deps.sendFrontendMessage('gameStatusUpdate', {
          appName: appId,
          runner: 'steam',
          status: 'done'
        })
        stopInstallPolling(deps, appId)
      }
    } else if (
      !entry.seenDownloading &&
      entry.ticks >= GRACE_TICKS &&
      !deps.steamSession.gameSession.isNativeInstallInFlight(appId)
    ) {
      logWarning(
        `Steam: install polling for appId ${appId} stopped after grace window (${GRACE_TICKS} ticks) — no manifest detected; user may have cancelled`,
        LogPrefix.Steam
      )
      deps.sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
      stopInstallPolling(deps, appId)
    } else if (
      !entry.seenDownloading &&
      entry.ticks === GRACE_TICKS &&
      deps.steamSession.gameSession.isNativeInstallInFlight(appId)
    ) {
      // Diagnosable suppression, logged ONCE at the exact tick the grace
      // window would otherwise have fired, not on every subsequent tick.
      logInfo(
        `Steam: install polling for appId ${appId} — grace window suppressed, native depot download still in flight (260822-dkf)`,
        LogPrefix.Steam
      )
    }
  }, intervalMs)

  // Teardown-safety (mirrors bottle.ts GAP C): unref the interval so it never
  // keeps a bare Node process (e.g. a Jest worker) alive on its own. In the
  // Electron main process the app's own event loop keeps polling running, so
  // this is production-neutral; under Jest it stops a leaked real poller from
  // surviving teardown and crashing on a later tick (readAcfState on reset
  // mocks). Optional-chained — a no-op in any non-Node timer context.
  timer.unref?.()

  entry.timer = timer
  activePolls.set(appId, entry)
  if (delegatedToSteamClient) markManagedBySteam(deps, appId)
  if (isLiveMonitorEligible(entry))
    void deps.steamProcesses.downloadMonitor.start(appId)
}

/**
 * quick 261105-vfq: lists a Steam-owned install in Downloads > Managed by
 * Steam from the moment the request is sent (not only after the first
 * downloading tick), so its Cancel is reachable while Steam is silent.
 */
function markManagedBySteam(
  deps: Pick<ManagerDeps, 'sendFrontendMessage'>,
  appId: string
): void {
  deps.sendFrontendMessage('gameStatusUpdate', {
    appName: appId,
    runner: 'steam',
    status: 'installing',
    managedBySteam: true
  })
}

/**
 * quick 261029-sex: only macOS native polls are downloaded by Steam itself. Bottle and
 * bridge-bottle polls are a Wine Steam process, and handoff polls are GameLib's own depot
 * downloader, so none of them may spawn a nettop child.
 */
function isLiveMonitorEligible(poll: {
  source: AcfSource
  isNativeHandoff: boolean
}): boolean {
  return isMac && poll.source === 'native' && !poll.isNativeHandoff
}

/**
 * True while a Steam-owned (delegated) install poll is active for `appId`.
 * Its one caller is `gamedetails/dispatch.kill()`, which skips the abort
 * controller lookup for it (a delegated install has none by design;
 * quick 261106-pvk).
 */
export function isDelegatedInstallPolling(
  deps: {
    steamInstallRuntime: { polls: Pick<InstallPollState, 'activePolls'> }
  },
  appId: string
): boolean {
  return (
    deps.steamInstallRuntime.polls.activePolls.get(appId)
      ?.delegatedToSteamClient === true
  )
}

/**
 * Cancel for a Steam-owned (delegated) install (quick 261105-vfq, CONTEXT
 * D-Cancel): stops GameLib's wait and reverts the status at once. Nothing is
 * cancelled inside Steam; if Steam installs the game anyway, the normal
 * library/ACF reconcile picks it up. Returns true when a delegated poll was
 * stopped; false when there is no poll or it is not delegated.
 */
export function cancelDelegatedInstall(
  deps: Pick<
    ManagerDeps,
    'steamProcesses' | 'steamInstallRuntime' | 'sendFrontendMessage'
  >,
  appId: string
): boolean {
  const entry = deps.steamInstallRuntime.polls.activePolls.get(appId)
  if (!entry || !entry.delegatedToSteamClient) return false
  logInfo(
    `Steam: Cancel stops GameLib's wait for the Steam-owned install of appId ${appId}; nothing is cancelled inside Steam (quick 261105-vfq)`,
    LogPrefix.Steam
  )
  stopInstallPolling(deps, appId)
  deps.sendFrontendMessage('gameStatusUpdate', {
    appName: appId,
    runner: 'steam',
    status: 'done'
  })
  return true
}
