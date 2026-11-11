import { GameInfo } from 'common/types'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { getFileSize } from 'backend/utils'
import { sendFrontendMessage } from '../../../ipc'
import { notify } from '../../../dialog/dialog'
import i18next from 'i18next'
import type { ManagerDeps } from 'backend/services/types'
import { formatEta, rollingRateMiBs } from '../depotRust/progress'
import { liveProgress } from '../steamDownloadProgress'
import { type AcfSource, installPlatformForSource } from './installRoot'
import {
  GAMELIB_HANDOFF_STATE_FLAGS,
  STEAM_BRIDGE_FINISHING_CONTEXT,
  isBridgeInstallFinalized,
  activePolls,
  MANIFEST_GONE_TICKS,
  STALLED_TICKS_THRESHOLD,
  BYTES_PER_MIB
} from './pollState'
import { readAcfState } from './acfState'
import { verifyMacArchGroundTruth } from './macArch'
import {
  releaseSteamHold,
  shouldHoldForSteamRestart,
  notifyRestartSteamToFinish
} from './restartHold'
import { markSteamInstallIncomplete } from './resumeBreadcrumbs'
import { stopInstallPolling } from './installStop'

/**
 * Executes one polling tick for appId:
 *   'downloading' → updates seenDownloading flag, sends gameStatusUpdate { status: 'installing' }
 *   'installed'   → updates library entry, sends pushGameToLibrary +
 *                   gameStatusUpdate { status: 'done' }, stops the poll
 *   'absent'      → no-op (grace/cap logic lives in startInstallPolling's callback)
 *
 * `source` selects the native (default), bottle-scoped, or bridge-bottle-
 * scoped ACF root — see readAcfState(deps) for the distinction.
 *
 * Exported for unit testing.
 */
export async function pollInstallOnce(
  deps: ManagerDeps,
  appId: string,
  source: AcfSource = 'native'
): Promise<void> {
  const result = await readAcfState(deps, appId, source)
  const poll = activePolls.get(appId)

  if (result.state === 'downloading') {
    if (poll) {
      poll.seenDownloading = true
      poll.absentTicksSinceSeen = 0
      // D-UAT-13: a manifest that was finalized at StateFlags=4 and is now
      // an active download again means Steam itself has picked it up and is
      // rewriting it (e.g. a post-restart update) — the wait is over, and
      // this poll continues as an ordinary one to the final 'installed'.
      if (poll.steamHold === 'holding') {
        releaseSteamHold(appId, poll)
        logInfo(
          `Steam: Steam is now rewriting the manifest for appId ${appId} (StateFlags ${result.stateFlags}) — releasing steam-waiting-for-restart (D-UAT-13)`,
          LogPrefix.Steam
        )
      }
    }

    // GAP-17-BOTTLE-PROGRESS: the bottle install has no DownloadManager
    // feeding the frontend progress store — the ACF's own byte counts are
    // the only source of truth. Prefer the download totals; fall back to
    // the staging totals when the download total is 0/missing (late-stage
    // installs that are past the download phase). Never emit a non-finite
    // percent — if BOTH totals are 0/missing, skip the progress emit
    // entirely (the gameStatusUpdate below still fires).
    const {
      bytesDownloaded = 0,
      bytesToDownload = 0,
      bytesStaged = 0,
      bytesToStage = 0
    } = result

    // D-UAT-04 (21-16): GameLib writes StateFlags EXACTLY 1026 on handoff —
    // bit 4 (FullyInstalled) unset, waiting for Steam to adopt the manifest
    // on its next full restart. That is NOT the same as an active download;
    // surface a passive 'waiting for restart' context instead of the plain
    // 'installing' status so the frontend can show a hint (Task 3) rather
    // than an indefinite spinner. Never launch/focus/drive Steam (T-21-16-02).
    //
    // debug/steam-1026-download-restart: StateFlags===1026 alone is NOT a
    // unique GameLib-handoff signal — Steam itself writes 1026
    // (0x400 update-running | 0x2 update-required) as an ORDINARY active-
    // download state on the native-install-OFF path (confirmed via live ACF:
    // two Steam-owned downloads sat at 1026 and were misclassified as
    // "waiting for restart" with progress hidden, while a third at 1042 —
    // also active, but !== 1026 — was unaffected). The equality check must
    // therefore be gated on provenance: only a poll started right after
    // GameLib's OWN depot.ts download finished (isNativeHandoff===true, set
    // by startInstallPolling's caller in games.ts) may interpret 1026 as a
    // finished handoff. A poll with no isNativeHandoff flag (OFF path, or a
    // direct unit-test call with no active poll registered) never does —
    // defaulting to "false" is the safe direction, since showing live
    // progress for a genuine handoff poll is merely cosmetically wrong for
    // one grace-window tick, while hiding progress for a genuine OFF-path
    // download is the exact bug this fixes.
    const isWaitingForSteamRestart =
      result.stateFlags === GAMELIB_HANDOFF_STATE_FLAGS &&
      poll?.isNativeHandoff === true

    // D-UAT-13: the 1026 handoff expresses "waiting for Steam to adopt" in the
    // ACF itself, and Steam adopting it (a restart, then StateFlags 1026 -> 4)
    // is exactly the event the fast-path hold below the 'installed' branch
    // waits for. So once a poll has shown the 1026 wait, that wait is the
    // whole story: the hold must never arm on the later 1026 -> 4 flip, or the
    // freshly RESTARTED Steam (the one that just adopted it) would be recorded
    // as "the client that has not seen the manifest" and the user would be
    // told to restart Steam a second time. Terminal, like every release.
    if (isWaitingForSteamRestart && poll) {
      releaseSteamHold(appId, poll)
    }

    // quick 261030-o77 (operator decision): a bottle-source GameLib handoff
    // that lands at StateFlags 1026 means GameLib's own finalize could not
    // verify the full install (canWriteFullOwnership failed, so it fell back
    // from the StateFlags 4 fast path to the verify-handoff). Bottled Windows
    // Steam cannot download or adopt installs, so this is NOT installed (files
    // on disk at 1026 are never trusted as installed) and NOT waiting on
    // bottled Steam. Mark it incomplete and resumable, exactly like a
    // cancelled depot install: Resume re-runs GameLib's own depot installer,
    // which verifies and fills the gaps. The native Mac 'Restart Steam'
    // handoff and the Windows/Linux native path are unaffected (gated on
    // source === 'bottle').
    if (isWaitingForSteamRestart && source === 'bottle') {
      logWarning(
        `Steam: bottle install for appId ${appId} finalized at StateFlags ${GAMELIB_HANDOFF_STATE_FLAGS} — GameLib could not verify the full install, so it is marked incomplete and resumable (no bottled-Steam handoff)`,
        LogPrefix.Steam
      )
      stopInstallPolling(deps, appId)
      markSteamInstallIncomplete(deps, appId)
      sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
      return
    }

    // T-AOG (quick/260719-aog, Task 2): a genuinely in-flight download
    // (BytesToDownload > 0 and not yet complete) whose BytesDownloaded hasn't
    // advanced since the PREVIOUS tick is "stalled". STALLED_TICKS_THRESHOLD
    // consecutive stalled ticks surface a 'steam-paused' hint — the restart
    // hint always takes precedence (never both at once). Guarded on `poll`
    // existing so a direct unit-test call with no active poll never flags
    // paused. The staged-fallback phase (bytesToDownload===0) can never
    // satisfy realDownloadInFlight, so it's never mistaken for paused.
    //
    // quick 261029-sex (spike 050): Steam does not rewrite the ACF mid-download,
    // so BytesDownloaded sits frozen at 0 below a non-zero BytesToDownload and
    // this stall logic would raise 'steam-paused' for the whole download. On an
    // eligible macOS native poll the monitor's nettop counter supplies the
    // effective bytes (dlBytes/dlTotal) instead; undefined means ACF as before.
    const live =
      poll && isMac && poll.source === 'native' && !poll.isNativeHandoff
        ? deps.steamProcesses.downloadMonitor.read(appId)
        : undefined
    const liveP = live
      ? liveProgress({
          downloadDone: live.bytesDone,
          downloadTotal: live.bytesTotal,
          cumAtStart: 0,
          cumNow: 0,
          acfBytesDownloaded: bytesDownloaded,
          acfBytesToDownload: bytesToDownload
        })
      : undefined
    const dlBytes = liveP ? liveP.bytesDone : bytesDownloaded
    const dlTotal = liveP ? liveP.total : bytesToDownload
    const realDownloadInFlight = dlTotal > 0 && dlBytes < dlTotal
    let isPaused = false
    if (poll) {
      if (
        realDownloadInFlight &&
        poll.lastBytesDownloaded !== undefined &&
        dlBytes <= poll.lastBytesDownloaded
      ) {
        poll.stalledTicks += 1
      } else {
        poll.stalledTicks = 0
      }
      isPaused =
        !isWaitingForSteamRestart &&
        poll.stalledTicks >= STALLED_TICKS_THRESHOLD
    }

    sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'installing',
      ...(isWaitingForSteamRestart
        ? { context: 'steam-waiting-for-restart' }
        : isPaused
          ? { context: 'steam-paused' }
          : {}),
      // debug/steam-dl-missing-in-downloads: a steam://install hand-off has no
      // DownloadManager queue element (the queue element finishes the moment
      // the hand-off is dispatched), so this flag is what lets the Downloads
      // screen list it, as a row that cannot be paused or cancelled here.
      ...(poll?.delegatedToSteamClient ? { managedBySteam: true } : {})
    })

    if (isWaitingForSteamRestart && poll && !poll.notifiedWaiting) {
      poll.notifiedWaiting = true
      const game = deps.steamSession.libraryState.library.get(appId)
      notify(deps, {
        title: game?.title ?? '',
        body: i18next.t(
          'steam.waitingForSteam.notify',
          'Restart Steam to finish installing {{game}}',
          { game: game?.title ?? '' }
        )
      })
    }

    // T-AOG (quick/260719-aog, Task 1): derive a live download speed + ETA
    // from the DOWNLOAD bytes specifically (bytesDownloaded), NOT the
    // staged/bottle numerator below — "download speed" tracks bytes off the
    // network, which stays meaningful even during the bottle's staged-
    // fallback phase (it will simply be 0/absent there since bytesDownloaded
    // doesn't move). `poll` is undefined for direct unit-test calls with no
    // active poll — every branch below degrades to "no speed/eta" rather
    // than throwing. Runs AFTER the stalled-ticks comparison above so both
    // read the same PREVIOUS-tick poll.lastBytesDownloaded baseline before
    // it gets overwritten with the current tick's value here.
    let downSpeedMiBs: number | undefined
    if (poll) {
      const nowMs = Date.now()
      const prevBytes = poll.lastBytesDownloaded
      const prevTickMs = poll.lastTickMs

      if (prevBytes !== undefined && prevTickMs !== undefined) {
        const deltaBytes = dlBytes - prevBytes
        const deltaMs = nowMs - prevTickMs
        // rollingRateMiBs guards the div-by-near-zero window (two ticks
        // landing back-to-back — e.g. a Steam preallocation jump) by
        // returning the previous rate (0 here) rather than dividing by a
        // near-zero delta, so this can never yield NaN/Infinity (T-AOG-01).
        const rate = rollingRateMiBs(deltaBytes, deltaMs, 0)
        if (deltaBytes >= 0 && Number.isFinite(rate) && rate > 0) {
          downSpeedMiBs = rate
        }
      }
      // quick 261029-sex: the nettop window rate (<= 3 s) beats the 3 s ACF delta.
      if (liveP && live?.speedBytesPerSec !== undefined) {
        const liveRate = live.speedBytesPerSec / BYTES_PER_MIB
        if (Number.isFinite(liveRate) && liveRate > 0) downSpeedMiBs = liveRate
      }

      poll.lastBytesDownloaded = dlBytes
      poll.lastTickMs = nowMs
    }

    let eta = ''
    if (downSpeedMiBs !== undefined && downSpeedMiBs > 0 && dlTotal > dlBytes) {
      const remainingBytes = dlTotal - dlBytes
      const speedBytesPerSec = downSpeedMiBs * BYTES_PER_MIB
      const etaSeconds = remainingBytes / speedBytesPerSec
      if (Number.isFinite(etaSeconds) && etaSeconds > 0) {
        eta = formatEta(etaSeconds)
      }
    }

    const useStaged = !liveP && !(bytesToDownload > 0)
    const denominator = liveP
      ? dlTotal
      : useStaged
        ? bytesToStage
        : bytesToDownload
    const numerator = liveP
      ? dlBytes
      : useStaged
        ? bytesStaged
        : bytesDownloaded

    if (denominator > 0) {
      const rawPercent = (numerator / denominator) * 100
      if (Number.isFinite(rawPercent)) {
        // Live path: 100 % comes only from the installed branch (StateFlags 4).
        const percent = liveP
          ? Math.min(99, Math.max(0, Math.round(rawPercent)))
          : Math.min(100, Math.max(0, Math.round(rawPercent)))
        sendFrontendMessage('progressUpdate', {
          appName: appId,
          runner: 'steam',
          status: 'installing',
          progress: {
            percent,
            bytes: getFileSize(numerator),
            eta,
            ...(downSpeedMiBs !== undefined ? { downSpeed: downSpeedMiBs } : {})
          }
        })
      }
    }
  } else if (result.state === 'installed') {
    const existing = deps.steamSession.libraryState.library.get(appId)

    // D-UAT-13 (debug/steam-waiting-for-restart-windows): GameLib's own
    // finalize wrote this manifest at StateFlags=4 (Phase 23 fast path) while
    // a Steam client was already running — that client has never read it, so
    // reporting the game installed here shows Play, and Play opens Steam's
    // INSTALL dialog. Stay in the same 'waiting for restart' state the 1026
    // path uses (status 'installing' + context, no is_installed push, no
    // completion toast, poll kept alive) until the recorded Steam process is
    // gone; the code below is then the unchanged installed flow.
    if (poll && (await shouldHoldForSteamRestart(deps, appId, poll, source))) {
      sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'installing',
        context: 'steam-waiting-for-restart'
      })
      // Fire-once, shared with the 1026 branch's own guard (T-21-16-03): the
      // user is told to restart Steam exactly once per install, and the
      // release below must not repeat it.
      if (!poll.notifiedWaiting) {
        poll.notifiedWaiting = true
        notifyRestartSteamToFinish(deps, existing?.title ?? '')
      }
      return
    }

    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: true,
        install: {
          install_path: result.installPath!,
          install_size: getFileSize(Number(result.sizeOnDisk!)),
          platform: installPlatformForSource(source)
        }
      }
      deps.steamSession.libraryState.library.set(appId, updated)
      // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately (see
      // refreshInstallState() for rationale) so a restart mid-poll can't read
      // a stale not-installed state from steamLibraryStore.
      deps.stores.steam.steamLibraryStore.set(
        'games',
        Array.from(deps.steamSession.libraryState.library.values())
      )
      sendFrontendMessage('pushGameToLibrary', updated)
    }
    // Quick 261029-exu: a bridge install keeps working after its manifest
    // lands (shared redists, DRM prefetch), so installBridgeGame owns the
    // final 'done' and the one "Installation Finished" toast. Until then the
    // game reads as finishing, not playable. Quick 261031-ihs: once the
    // installer has marked itself finalized, stay silent so the finishing
    // status cannot overwrite its 'done'. Read synchronously at the send site.
    const installerOwnsCompletion = source === 'bridge'
    if (!(installerOwnsCompletion && isBridgeInstallFinalized(appId))) {
      sendFrontendMessage(
        'gameStatusUpdate',
        installerOwnsCompletion
          ? {
              appName: appId,
              runner: 'steam',
              status: 'installing',
              context: STEAM_BRIDGE_FINISHING_CONTEXT
            }
          : { appName: appId, runner: 'steam', status: 'done' }
      )
    }
    // GAME-02: fire the confirmed completion toast here (ACF state verified) so
    // the user gets exactly one "Installation Finished" notification per install.
    // The DM pipeline toast is suppressed for steam — this is the sole source,
    // except on the bridge, where installBridgeGame fires it.
    if (!installerOwnsCompletion) {
      notify(deps, {
        title: existing?.title ?? '',
        body: i18next.t('notify.install.finished', 'Installation Finished')
      })
    }

    // 23.2-04 (D-06/D-07): a completion notice naming any depot GameLib's
    // own downloadSteamDepots run dropped because Steam refused its key
    // (skip-and-warn, phase 23.2) — fired IN ADDITION to the ordinary
    // Installation Finished toast above, never instead of it. Log-only was
    // explicitly rejected: a silently reduced install that reports plain
    // success is the exact failure class this project has repeatedly been
    // bitten by.
    //
    // Gated on a SEPARATE notifiedDepotSkipped flag, deliberately NOT the
    // "restart Steam" toast's own fire-once flag below. Reusing that flag
    // here would make the two notices mutually exclusive: whichever
    // notify() ran first would permanently suppress the other, and a
    // native-handoff install with a skipped depot — this phase's exact
    // scenario — would silently lose one of them. Always empty on an
    // OFF-path poll (Steam owns the download), so this never fires there.
    if (poll?.skippedDepots?.length && !poll.notifiedDepotSkipped) {
      poll.notifiedDepotSkipped = true
      notify(deps, {
        title: existing?.title ?? '',
        body: i18next.t(
          'steam.download.notify.depotSkipped',
          "Installed without depot {{depots}}. Steam wouldn't release its key for this account, so that content was skipped — the game should still run.",
          { depots: poll.skippedDepots.join(', ') }
        )
      })
    }

    // debug/wazhack-uninstall-reverts: the "restart Steam to finish
    // installing" notify previously lived ONLY inside the 'downloading'
    // branch above, gated on StateFlags===GAMELIB_HANDOFF_STATE_FLAGS
    // (1026). That check is structurally unreachable here — the Phase 23
    // "trustworthy 4" fast path (canWriteFullOwnership) writes StateFlags=4
    // directly via finalizeToSteam, so readAcfState(deps) returns
    // state:'installed' on the very first poll and this branch is reached
    // WITHOUT ever passing through 'downloading' at all. isNativeHandoff is
    // the correct signal here too — it is set true by games.ts the moment
    // GameLib's OWN depot download finishes (runNativeDepotDownload,
    // ~L1543-1550), BEFORE it's known whether the resulting ACF lands on
    // 1026 or on the StateFlags=4 fast path — so it identifies "GameLib
    // wrote this manifest directly, Steam has not yet adopted it" uniformly
    // across both completion shapes. Fire-once per poll via
    // notifiedWaiting, mirroring the 'downloading' branch's own guard
    // (T-21-16-03), even though this branch itself only ever runs once
    // before stopInstallPolling() below tears the poll down.
    // A bridge bottle runs the game itself; no Steam restart adopts anything.
    if (
      poll?.isNativeHandoff === true &&
      !poll.macNativeRoute &&
      !installerOwnsCompletion &&
      !poll.notifiedWaiting
    ) {
      poll.notifiedWaiting = true
      notifyRestartSteamToFinish(deps, existing?.title ?? '')
    }

    stopInstallPolling(deps, appId)
    logInfo(
      `Steam: install polling complete for appId ${appId} — badge flipped to installed`,
      LogPrefix.Steam
    )

    // MAC32-03: fire-and-forget post-install ground-truth check — placed
    // AFTER the badge-flip/notify above so it can never delay them. Native
    // installs only (a bottle install is a Windows depot; no Mach-O binary
    // belongs to this game on that path) and macOS-only (host-gated).
    if (isMac && source === 'native') {
      void verifyMacArchGroundTruth(deps, appId, result.installPath!, source)
    }
  }
  // 'absent': no message — grace/cap logic is in startInstallPolling's setInterval callback
  if (result.state === 'absent' && poll?.seenDownloading) {
    poll.absentTicksSinceSeen++
    // D-UAT-13: the finalized manifest vanished while holding for a Steam
    // restart (files removed by hand, or removed through Steam). Nothing is
    // left to wait for; end the hold rather than leaving the UI on a
    // permanent "Restart Steam to finish". Same tolerance as the delegated
    // manifest-gone rule, so Steam briefly rewriting the file isn't a stop.
    if (
      poll.steamHold === 'holding' &&
      poll.absentTicksSinceSeen >= MANIFEST_GONE_TICKS
    ) {
      logWarning(
        `Steam: install polling for appId ${appId} stopped — manifest disappeared while waiting for a Steam restart`,
        LogPrefix.Steam
      )
      sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
      stopInstallPolling(deps, appId)
    }
  }
}
