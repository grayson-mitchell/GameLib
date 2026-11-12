import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify, type NotifyDeps } from '../../../dialog/dialog'
import i18next from 'i18next'
import {
  listSteamClientPids,
  readSteamProcessStartTokens,
  type SteamProbeDeps
} from '../steamClientProcess'
import {
  clearSteamRestartHold,
  recordSteamRestartHold,
  type SteamRestartHoldStore
} from '../steamRestartHold'
import type { AcfSource } from './installRoot'
import {
  STEAM_HOLD_PROBE_MIN_INTERVAL_MS,
  type ActiveInstallPoll,
  type InstallPollState
} from './pollState'

/**
 * The one-shot "Restart Steam to finish installing {{game}}" toast for a
 * native handoff on the native Steam root (the bottle variant is built inline
 * in pollInstallOnce's 'downloading' branch). Shared by the fast-path hold and
 * the fast-path no-hold completion so the user-facing text cannot drift.
 */
export function notifyRestartSteamToFinish(
  deps: NotifyDeps,
  title: string
): void {
  notify(deps, {
    title,
    body: i18next.t(
      'steam.waitingForSteam.notify',
      'Restart Steam to finish installing {{game}}',
      { game: title }
    )
  })
}

/**
 * quick 261029-pkp: the single place a hold ends. Sets 'released' and deletes
 * the persisted record so it can never re-arm a finished hold.
 */
export function releaseSteamHold(
  appId: string,
  poll: {
    steamHold: 'unprobed' | 'holding' | 'released'
    restartHoldStore: SteamRestartHoldStore
  }
): void {
  poll.steamHold = 'released'
  clearSteamRestartHold(appId, poll.restartHoldStore)
}

export interface SteamRestartHold {
  /** Apps whose persisted hold record is being verified at boot (quick 261029-pkp). Treated as holding until verification resolves. */
  pendingSteamHoldRearm: Set<string>
  /** True when a reconcile consulted the fail-closed rearm window. */
  getReconcileRanDuringRearm(): boolean
  setReconcileRanDuringRearm(value: boolean): void
  withoutSteamRestartHolds<T>(installed: Map<number, T>): Map<number, T>
  shouldHoldForSteamRestart(
    deps: SteamProbeDeps,
    appId: string,
    poll: ActiveInstallPoll,
    source: AcfSource
  ): Promise<boolean>
}

/**
 * The restart-hold bookkeeping of one boot (D-05, 66.4-09): the pending-rearm set and the
 * reconcile-ran flag are closure fields, and the hold decisions read the install polls it is given.
 * Construction allocates an empty set and a flag: no I/O, timer or handle.
 */
export function createSteamRestartHold(deps: {
  polls: Pick<InstallPollState, 'activePolls'>
}): SteamRestartHold {
  const { polls } = deps
  const pendingSteamHoldRearm = new Set<string>()
  let reconcileRanDuringRearm = false

  /**
   * debug/steam-waiting-for-restart-windows (D-UAT-13): true while appId has a
   * native-handoff poll holding in "wait for the running Steam client to
   * restart" (see activePolls' `steamHold`). The one authority install-state
   * readers consult so a focus/Refresh reconcile cannot report the game
   * installed (-> Play -> Steam's install dialog) behind the poller's back.
   */
  function isHoldingForSteamRestart(appId: string): boolean {
    // quick 261029-pkp: fail CLOSED while boot re-arm verification is pending,
    // so a concurrent focus reconcile cannot flip the game to Play.
    if (pendingSteamHoldRearm.has(appId)) {
      reconcileRanDuringRearm = true
      return true
    }
    return polls.activePolls.get(appId)?.steamHold === 'holding'
  }

  /**
   * Drops every app that is holding for a Steam restart from an ACF-derived
   * installed map, mutating and returning it. buildInstalledMap(deps) reads
   * StateFlags only, and a fast-path manifest already reads 4 while the running
   * Steam client is still unaware of it, so without this the window-focus
   * reconcile (refreshInstallState) and a full refresh() would flip the badge
   * to installed the moment the user alt-tabs to Steam to restart it.
   */
  function withoutSteamRestartHolds<T>(
    installed: Map<number, T>
  ): Map<number, T> {
    for (const appId of [...installed.keys()]) {
      if (isHoldingForSteamRestart(String(appId))) installed.delete(appId)
    }
    return installed
  }

  /**
   * Decides, for a poll that just read a fully-installed (StateFlags bit 4)
   * manifest, whether the install must keep waiting for a Steam restart instead
   * of being reported installed. Returns true to keep holding.
   *
   * Why. Steam scans for new manifests only at startup; the client that was
   * running when GameLib's finalize wrote the manifest never reads it, so Play
   * (steam://rungameid) opens Steam's *install* dialog (D-UAT-13). Since the
   * Phase 23 fast path writes StateFlags=4 directly, the old 1026-only
   * "steam-waiting-for-restart" signal is unreachable and the manifest alone
   * cannot say whether Steam has seen it. So the first time the finalized
   * manifest is observed, record which Steam client PIDs are alive; the client
   * exiting (or being replaced by a new process) is the only event after which
   * Steam will adopt the manifest, so that releases the hold.
   *
   * Scope: GameLib's own native handoff on the native Steam root only
   * (`isNativeHandoff` + `source === 'native'`). An OFF-path poll (Steam owns
   * the download, so Steam already knows the app) and the bottle/bridge roots
   * (no user-visible Steam to restart) never hold — byte-for-byte the old flow.
   *
   * Fail-open everywhere: no Steam running, or a probe that cannot answer,
   * releases immediately, exactly as before this existed. A hold can therefore
   * only ever be entered on positive evidence of a live Steam client.
   */
  async function shouldHoldForSteamRestart(
    deps: SteamProbeDeps,
    appId: string,
    poll: ActiveInstallPoll,
    source: AcfSource
  ): Promise<boolean> {
    if (!poll.isNativeHandoff || source !== 'native') return false
    if (poll.steamHold === 'released') return false

    if (poll.steamHold === 'unprobed') {
      const pids = await listSteamClientPids(deps)
      // The poll may have been stopped while the probe child ran; keep the
      // pre-existing behaviour for that tick rather than resurrecting state.
      if (polls.activePolls.get(appId) !== poll) return false
      poll.lastSteamProbeMs = Date.now()
      if (!pids || pids.length === 0) {
        // Also removes a stale record left by an earlier hold of this app.
        releaseSteamHold(appId, poll)
        return false
      }
      poll.steamPidsAtHandoff = pids
      poll.steamHold = 'holding'
      // The manifest HAS been seen, just not yet reported: this also keeps the
      // "no manifest ever appeared -> user cancelled" grace window in
      // startInstallPolling from tearing the hold down after GRACE_TICKS, and
      // lets absentTicksSinceSeen count a manifest that vanishes mid-hold.
      poll.seenDownloading = true
      logInfo(
        `Steam: native install of appId ${appId} finalized while the Steam client (pid ${pids.join(', ')}) is running — holding in steam-waiting-for-restart until it restarts (D-UAT-13)`,
        LogPrefix.Steam
      )
      // quick 261029-pkp: persist the hold so it survives a GameLib restart.
      // Can never change the hold decision.
      try {
        const tokens = await readSteamProcessStartTokens(deps, pids)
        if (
          polls.activePolls.get(appId) === poll &&
          poll.steamHold === 'holding'
        ) {
          const recorded = pids.flatMap((pid) => {
            const startToken = tokens?.get(pid)
            return startToken ? [{ pid, startToken }] : []
          })
          if (recorded.length > 0) {
            recordSteamRestartHold(
              appId,
              {
                pids: recorded,
                recordedAt: Date.now(),
                macNativeRoute: poll.macNativeRoute,
                skippedDepots: poll.skippedDepots
              },
              poll.restartHoldStore
            )
          } else {
            logWarning(
              `Steam: could not read Steam process start time for appId ${appId}; the steam-waiting-for-restart hold will not survive a GameLib restart`,
              LogPrefix.Steam
            )
          }
        }
      } catch (error) {
        logWarning(
          ['Steam: could not persist the Steam restart hold:', error],
          LogPrefix.Steam
        )
      }
      return true
    }

    // steamHold === 'holding'
    poll.absentTicksSinceSeen = 0
    const now = Date.now()
    if (now - poll.lastSteamProbeMs >= STEAM_HOLD_PROBE_MIN_INTERVAL_MS) {
      poll.lastSteamProbeMs = now
      const pids = await listSteamClientPids(deps)
      if (polls.activePolls.get(appId) !== poll) return false
      // `undefined` (probe inconclusive) keeps holding: only positive evidence
      // that every recorded process is gone may release.
      if (pids && !pids.some((pid) => poll.steamPidsAtHandoff.includes(pid))) {
        releaseSteamHold(appId, poll)
        logInfo(
          `Steam: the Steam client that was running when appId ${appId} finalized (pid ${poll.steamPidsAtHandoff.join(', ')}) has exited — releasing steam-waiting-for-restart (D-UAT-13)`,
          LogPrefix.Steam
        )
        return false
      }
    }
    return true
  }

  return {
    pendingSteamHoldRearm,
    getReconcileRanDuringRearm: () => reconcileRanDuringRearm,
    setReconcileRanDuringRearm: (value) => {
      reconcileRanDuringRearm = value
    },
    withoutSteamRestartHolds,
    shouldHoldForSteamRestart
  }
}
