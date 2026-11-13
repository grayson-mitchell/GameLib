import { GameInfo } from 'common/types'
import { logInfo, logError, logWarning, LogPrefix } from 'backend/logger'
import { getFileSize, type SteamLibrariesDeps } from 'backend/utils'
import type { FrontendMessageDeps } from '../../../host/frontendMessage'
import { notify, type NotifyDeps } from '../../../dialog/dialog'
import i18next from 'i18next'
import { clearForcedWindowsViaBottle } from '../gameSessionState'
import {
  type AcfSource,
  type PollOptions,
  type SteamStoresDeps,
  copySourceLabel,
  installPlatformForSource,
  isBridgeAuthoritativeForInstallState
} from './installRoot'
import { MAX_TICKS, STEAM_REQUEST_NO_ACTIVITY_TICKS } from './pollState'
import type { InstallPollState, UninstallPolls } from './pollState'
import { readAcfState } from './acfState'
import type { SteamLibraryStateDeps } from 'backend/services/types'
import type { BottleSettingsDeps } from '../bottle'

/** The stores plus the config and notification slices the uninstall poll reads. */
export type UninstallPollDeps = SteamStoresDeps &
  SteamLibrariesDeps &
  BottleSettingsDeps &
  SteamLibraryStateDeps &
  NotifyDeps &
  FrontendMessageDeps & {
    steamInstallRuntime: {
      uninstallPolls: UninstallPolls
      polls: Pick<InstallPollState, 'nextSteamRequestNoticeSeq'>
    }
  }

/** Steam EAppState bit 0x800 (2048) = actively uninstalling. */
const STATE_UNINSTALLING = 2048

/**
 * Executes one uninstall polling tick for appId:
 *   'absent'  → manifest gone on `source`'s root. debug/steam-bottle-
 *               uninstall-reverts (OPERATOR PRODUCT DECISION, LOCKED): a
 *               dual-installed title losing only the `source` copy is
 *               CORRECT, expected behaviour — before flipping the badge,
 *               check whether the OTHER known root (bottle<->native; the
 *               bridge bottle is a separate, out-of-scope root never routed
 *               through this poller — see resolveInstallRoot(deps)'s own JSDoc)
 *               still has a real install:
 *                 - a surviving copy: install_path/install_size/platform are
 *                   re-resolved to it, is_installed STAYS true (the badge is
 *                   never forced to flip), and no "Game Uninstalled" toast
 *                   fires — the success signal must not overstate what
 *                   actually happened.
 *                 - no surviving copy anywhere: flip the library entry to
 *                   not-installed, send pushGameToLibrary + the confirmed
 *                   "Game Uninstalled" toast.
 *               Either way: send gameStatusUpdate { done } and stop the poll
 *               (the frontend re-derives its badge from is_installed once a
 *               non-active status arrives — deriveInstallStatusKind,
 *               frontend/hooks/hasStatus.ts — so 'done' is correct for both
 *               outcomes here).
 *   present   → still on disk: if actively uninstalling (StateFlags bit 0x800 set,
 *               or bit 4 cleared mid-removal) send gameStatusUpdate { uninstalling }.
 *               A plain installed manifest (no 0x800) means uninstall hasn't started
 *               or was cancelled — handled by the grace logic in startUninstallPolling.
 *
 * Install state is never optimistically flipped (D-02) — only a confirmed-absent
 * manifest (with no surviving copy elsewhere) flips the badge. `source` selects
 * the native (default) or bottle-scoped ACF root — see readAcfState(deps). Exported
 * for unit testing.
 */
export async function pollUninstallOnce(
  deps: UninstallPollDeps,
  appId: string,
  source: AcfSource = 'native'
): Promise<void> {
  const result = await readAcfState(deps, appId, source)
  const poll =
    deps.steamInstallRuntime.uninstallPolls.activeUninstallPolls.get(appId)

  // WR-01 (75 review): the read failed, so this tick learned nothing. Never
  // a confirmed absence — no badge flip, no forced-Windows clear; retry.
  if (result.state === 'unknown') return

  if (result.state === 'absent') {
    // D-17 (34.13-14) reversibility: clear the forced verdict ONLY on a
    // BOTTLE-scoped CONFIRMED-absent tick — never at dispatch time (a
    // cancelled bottled-Steam confirm dialog leaves the manifest in place)
    // — and BEFORE the `if (existing)` Map guard below, which the
    // diagnostic note beneath it records as capable of MISSing.
    //
    // 34.13 review A-19: a second eraser, clearNativeBottleInstall, used to
    // ride this same tick. Its field had no reader anywhere — it recorded
    // install provenance that stopped deciding uninstall routing — so it
    // performed a full whole-entry steamMetadataStore rewrite on EVERY
    // confirmed-absent bottle tick for no decision. Field and pair removed.
    //
    // quick 261107-lum (DC-3): a forced-Windows install can now live in a
    // dedicated bridge bottle too, so a confirmed-absent 'bridge' tick clears
    // it as well. A stale flag would make the next install of a Mac-native
    // title go Windows silently.
    if (source === 'bottle' || source === 'bridge') {
      clearForcedWindowsViaBottle(deps, appId)
    }
    const existing = deps.steamSession.libraryState.library.get(appId)

    // debug/steam-bottle-uninstall-reverts (OPERATOR PRODUCT DECISION,
    // LOCKED, item 4/5): check EVERY other known root before declaring this
    // title fully uninstalled — native, the GameLibSteam bottle, AND the
    // dedicated GameLibSteamBridge bottle.
    //
    // The bridge was previously excluded here on the reasoning that it owns
    // its own uninstallBridgeGame()/markBridgeGameUninstalled() completion
    // path. That is true of a bridge-INITIATED uninstall, but it does not
    // make a surviving bridge copy invisible to a native- or bottle-scoped
    // one. Live 2026-08-15: HOARD (63000) was installed on all THREE roots
    // simultaneously, so removing the native copy declared a complete
    // uninstall — and fired the toast — while 277M survived in the bridge
    // bottle. That is exactly the overstatement this branch exists to
    // prevent, so the check must be exhaustive over roots, not pairwise.
    //
    // Probe order is fixed (native, bottle, bridge minus `source`) so the
    // re-resolved install_path is deterministic when more than one survives.
    // Each probe is individually guarded: a root that cannot be RESOLVED at
    // all (e.g. the bridge bottle was never provisioned, so
    // getBridgeBottleSettings() has nothing to hand back) must not take the
    // whole uninstall completion down with it. An unreadable root cannot
    // confirm a survivor either way, so it is treated as absent and logged —
    // never allowed to throw out of the poller.
    //
    // A survivor must also be one the library refresh will count: for a
    // bridge-authoritative title only a bridge copy satisfies is_installed
    // (isBridgeAuthoritativeForInstallState), so a native/bottle copy left
    // behind there is not a survivor — claiming "still installed" would be
    // undone by the next refresh.
    const bridgeAuthoritative = isBridgeAuthoritativeForInstallState(
      deps,
      appId
    )
    let survivorSource: AcfSource | null = null
    let survivor: Awaited<ReturnType<typeof readAcfState>> = { state: 'absent' }
    for (const candidate of (['native', 'bottle', 'bridge'] as const).filter(
      (root) => root !== source && (!bridgeAuthoritative || root === 'bridge')
    )) {
      try {
        const candidateState = await readAcfState(deps, appId, candidate)
        // WR-01 (75 review): a root whose read failed may still hold a
        // copy; do not declare the uninstall complete on this tick.
        if (candidateState.state === 'unknown') {
          logWarning(
            `Steam: uninstall-poll could not read the ${candidate} root for appId ${appId}; deferring completion to the next tick`,
            LogPrefix.Steam
          )
          return
        }
        if (
          candidateState.state === 'installed' &&
          candidateState.installPath
        ) {
          survivorSource = candidate
          survivor = candidateState
          break
        }
      } catch (error) {
        logWarning(
          `Steam: uninstall-poll could not read the ${candidate} root for appId ${appId} — treating it as no survivor: ${String(error)}`,
          LogPrefix.Steam
        )
      }
    }

    if (survivorSource && survivor.installPath && existing) {
      // A copy on the OTHER root survives — re-resolve install_path/platform
      // to it instead of orphaning the entry with a stale pointer at the
      // copy we just removed (the exact re-resolution risk flagged by the
      // operator decision). The badge is never forced to flip.
      const updated: GameInfo = {
        ...existing,
        is_installed: true,
        install: {
          install_path: survivor.installPath,
          install_size: getFileSize(Number(survivor.sizeOnDisk ?? '0')),
          platform: installPlatformForSource(survivorSource)
        }
      }
      deps.steamSession.libraryState.library.set(appId, updated)
      deps.stores.steam.steamLibraryStore.set(
        'games',
        Array.from(deps.steamSession.libraryState.library.values())
      )
      deps.sendFrontendMessage('pushGameToLibrary', updated)
      deps.sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
      // The success signal must not lie: the title is legitimately still
      // installed via the surviving copy, so no "Game Uninstalled" toast
      // fires here — that would overstate what actually happened. Say what
      // did happen instead: with no toast at all the click read as a failed
      // uninstall (live 2026-10-27, XCOM 200510 native + bottle).
      notify(deps, {
        title: existing.title,
        body: i18next.t(
          'gamelib:steam.uninstall.copySurvives',
          'Removed the {{removed}} copy. A {{survivor}} copy is still installed — use Remove all copies… to remove it too.',
          {
            removed: copySourceLabel(source),
            survivor: copySourceLabel(survivorSource)
          }
        )
      })
      stopUninstallPolling(deps, appId)
      logInfo(
        `Steam: uninstall polling complete for appId ${appId} — removed the ${source} copy; a ${survivorSource} copy survives at "${survivor.installPath}", badge stays installed and install_path re-resolved to it`,
        LogPrefix.Steam
      )
      return
    }

    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: false,
        install: {}
      }
      deps.steamSession.libraryState.library.set(appId, updated)
      // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately (see
      // refreshInstallState() for rationale).
      deps.stores.steam.steamLibraryStore.set(
        'games',
        Array.from(deps.steamSession.libraryState.library.values())
      )
      deps.sendFrontendMessage('pushGameToLibrary', updated)
    }
    deps.sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })
    // GAME-03: fire the confirmed completion toast here (manifest confirmed absent
    // on EVERY known root — no surviving copy) so the user gets exactly one
    // "Game Uninstalled" notification per genuinely-complete uninstall. The
    // uninstaller callback toast is suppressed for steam — this is the sole source.
    notify(deps, {
      title: existing?.title ?? '',
      body: i18next.t('notify.uninstalled', 'Game Uninstalled')
    })
    stopUninstallPolling(deps, appId)
    logInfo(
      `Steam: uninstall polling complete for appId ${appId} — badge flipped to not-installed`,
      LogPrefix.Steam
    )
    return
  }

  const uninstalling =
    result.state === 'downloading' ||
    ((result.stateFlags ?? 0) & STATE_UNINSTALLING) !== 0
  if (uninstalling) {
    if (poll) poll.seenUninstalling = true
    deps.sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'uninstalling'
    })
  }
}

/**
 * Starts an ACF polling loop for an in-progress uninstall. Idempotent.
 *
 * Stops automatically when:
 *   - the manifest disappears (uninstall complete) via pollUninstallOnce
 *   - the game is still installed and no active uninstall was ever observed
 *     within STEAM_REQUEST_NO_ACTIVITY_TICKS (~2 min; Steam dropped the request
 *     or the user left its confirm dialog — quick 261105-vfq) — clears any
 *     transient status, leaving the badge installed, and shows a sign-in notice
 *   - MAX_TICKS elapsed (D-01 focus backstop takes over — T-03-06 mitigation)
 *
 * The second parameter accepts EITHER a plain intervalMs number (existing
 * call signature, unchanged) OR a `{ intervalMs?, source? }` options object —
 * `source: 'bottle'` polls the dedicated CrossOver bottle's steamapps root
 * instead of the native one. Omitting the second arg entirely, or passing a
 * bare number, preserves today's native behavior byte-for-byte.
 *
 * Exported for unit testing.
 */
export function startUninstallPolling(
  deps: UninstallPollDeps,
  appId: string,
  intervalMsOrOptions: number | PollOptions = 3000
): void {
  const { activeUninstallPolls } = deps.steamInstallRuntime.uninstallPolls
  if (activeUninstallPolls.has(appId)) return // idempotent

  const { intervalMs, source }: { intervalMs: number; source: AcfSource } =
    typeof intervalMsOrOptions === 'number'
      ? { intervalMs: intervalMsOrOptions, source: 'native' }
      : {
          intervalMs: intervalMsOrOptions.intervalMs ?? 3000,
          source: intervalMsOrOptions.source ?? 'native'
        }

  logInfo(
    `Steam: starting uninstall polling for appId ${appId} (interval ${intervalMs}ms, source ${source})`,
    LogPrefix.Steam
  )

  const entry = {
    timer: null as unknown as NodeJS.Timeout,
    ticks: 0,
    seenUninstalling: false
  }

  const timer = setInterval(async () => {
    entry.ticks++

    // Absolute safety cap — stop after MAX_TICKS and rely on the D-01 focus backstop
    if (entry.ticks >= MAX_TICKS) {
      logWarning(
        `Steam: uninstall polling for appId ${appId} hit safety cap (${MAX_TICKS} ticks); relying on D-01 focus backstop`,
        LogPrefix.Steam
      )
      stopUninstallPolling(deps, appId)
      return
    }

    // Teardown-safety (mirrors startInstallPolling's callback above / bottle.ts
    // GAP C): a real poller can outlive the Jest suite that started it —
    // unref() only stops it from keeping the process alive, not from firing
    // while a later suite keeps the process busy. If it fires after that
    // suite's module mocks are torn down, readAcfState(deps)'s dependencies throw,
    // and an unguarded throw here would escape as an unhandled rejection and
    // kill the whole Jest worker. Production never expects this branch — it's
    // a defensive, log-only catch; the next tick retries normally.
    try {
      await pollUninstallOnce(deps, appId, source)
    } catch (error) {
      logError(
        [`Steam: uninstall polling tick for appId ${appId} threw`, error],
        LogPrefix.Steam
      )
      return
    }

    // pollUninstallOnce may have stopped the poll (manifest absent = complete)
    if (!activeUninstallPolls.has(appId)) return

    // No-activity timeout (quick 261105-vfq): if Steam showed no uninstall
    // activity within ~2 min, it dropped the request (signed-out Steam) or the
    // user left its confirm dialog — clear any transient status and stop
    // (badge stays installed).
    if (
      !entry.seenUninstalling &&
      entry.ticks >= STEAM_REQUEST_NO_ACTIVITY_TICKS
    ) {
      logWarning(
        `Steam: Steam did not start the uninstall for appId ${appId} — no activity within ${STEAM_REQUEST_NO_ACTIVITY_TICKS} ticks (~2 min) of the request; keeping it installed (quick 261105-vfq)`,
        LogPrefix.Steam
      )
      deps.sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
      // debug/wazhack-uninstall-reverts: this branch once gave ZERO feedback;
      // the badge correctly stays installed (D-02). quick 261106-pvk: the
      // notice goes to the in-app stack because the system notification can
      // land on another monitor or not be delivered.
      deps.sendFrontendMessage('steamRequestNotice', {
        appId,
        title: deps.steamSession.libraryState.library.get(appId)?.title ?? '',
        kind: 'uninstall-not-started',
        seq: deps.steamInstallRuntime.polls.nextSteamRequestNoticeSeq()
      })
      stopUninstallPolling(deps, appId)
    }
  }, intervalMs)

  // Teardown-safety (mirrors bottle.ts GAP C / the install poller above):
  // unref so a leaked real poller never keeps a Jest worker alive or crashes
  // on a later tick. Production-neutral in the Electron main process.
  timer.unref?.()

  entry.timer = timer
  activeUninstallPolls.set(appId, entry)
}

/**
 * Stops the active uninstall polling loop for appId (clears the interval and
 * removes the registry entry). Safe to call when no poll is active (no-op).
 *
 * Exported for unit testing.
 */
export function stopUninstallPolling(
  deps: Pick<UninstallPollDeps, 'steamInstallRuntime'>,
  appId: string
): void {
  const { activeUninstallPolls } = deps.steamInstallRuntime.uninstallPolls
  const poll = activeUninstallPolls.get(appId)
  if (!poll) return
  clearInterval(poll.timer)
  activeUninstallPolls.delete(appId)
  logInfo(
    `Steam: stopped uninstall polling for appId ${appId}`,
    LogPrefix.Steam
  )
}
