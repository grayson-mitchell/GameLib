/**
 * Install cluster lifted out of SteamGame (62-06, D-06 mechanical lift:
 * this -> steamGame).
 * Only the Game-interface entry points keep a delegating method on the class;
 * everything else is a free function called directly across modules (the
 * install terminals are installNative/installBottleNative in gameInstallDepot
 * and installBridgeGame in gameInstallBridge), so a test spies on the module
 * export (quick-261108-ca6).
 */

import i18next from 'i18next'
import { resolve } from 'node:path'
import { InstallArgs } from 'common/types'
import { InstallResult } from 'common/types/game_manager'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isMac, isAppleSiliconMac } from 'backend/constants/environment'
import { sendFrontendMessage } from '../../ipc'
import { pollUninstallOnce } from './library/uninstallPolling'
import * as resume from './library/resume'
import { readAcfState, removeSteamInstallCopy } from './library/acfState'
import { startInstallPolling } from './library/installPolling'
import * as bottle from './bottle'
import * as bridgeBottle from './bridgeBottle'
import { isSteamNativeInstallEnabled } from './nativeInstallSetting'
import type { NonCrossoverEngine } from 'backend/engine/engineTypes'
import { prescreenBridgeDepots } from './depot'
import { ensureSteamClientReady } from './clientSetup'
import { resolveSteamLibraryRoot } from './installLocation'
import { isSteamExperimentalInstallAppEnabled } from './experimentalInstallAppSetting'
import {
  createSteamInstallAppRun,
  requestSteamInstallApp
} from './steamInstallApp'
import { NOTICE_REASONS } from './bridge/bridgeRoute'
import {
  readBridgeVerdict,
  setBridgeSteamApiPrescreen
} from './bridge/bridgeVerdict'
import type { EnginePin } from 'backend/engine/enginePins'
import { ensurePinnedEngineReportingStatus } from 'backend/engine/pinnedEngineProgress'
import { markForcedWindowsViaBottle } from './gameSessionState'
import { buildSteamProtocolUrl } from './gameProtocolUrl'
import type SteamGame from './games'
import {
  bridgeRoute as resolveEligibilityBridgeRoute,
  clearStaleBridgeVerdict,
  ensurePlatformsCaptured,
  isBottleEligible
} from './gameEligibility'
import {
  installBottleNative,
  installNative,
  installResultForRefusal
} from './gameInstallDepot'
import { installBridgeGame } from './gameInstallBridge'

export async function install(
  steamGame: SteamGame,
  args: InstallArgs
): Promise<InstallResult> {
  // quick-260817-d61: Install is a deliberate Steam action — unlock the
  // keyring deferral gate as the first statement, before anything else in
  // this method runs.
  steamGame.deps.steamSession.authTrigger.noteSteamAuthTrigger('user-install')
  // D-51-07: auto-clear a stale persisted scan-miss before any routing
  // decision below reads it — the top of install(), before the resume
  // check, so a bridge route taken later in this same call already sees
  // the cleared state.
  clearStaleBridgeVerdict(steamGame)
  // steam-startup-resume-crash (2026-07-18) / D-04 softened: a
  // startup-detected interrupted install is surfaced (steamResumePending)
  // but never auto-driven — the user's own Install click IS the resume
  // trigger. Run the honest verify-and-finalize pass first (fast: sha1-
  // reconciles what's already on disk and only reports genuine gaps, it
  // never itself re-downloads — see resumeInterruptedSteamInstall), then
  // fall through into the normal install flow below, which will pick up
  // and complete anything the reconcile pass left as a gap. A failure here
  // must never block the real install attempt beneath it (hardening).
  //
  // 260821-rb5 (Rule 1 fix, found writing this quick task): the same flag
  // is now ALSO set at install START (markSteamNativeInstallStarted,
  // runNativeDepotDownload) for the case-C crash-survival breadcrumb, so
  // steamResumePending can be true while a native download is genuinely
  // still LIVE for this appId — e.g. a second install() call joining the
  // T-23-12 single-flight guard, or a real double-click. Without the
  // isNativeInstallInFlight guard here, that live call would misread its
  // OWN in-flight download as "a leftover from a previous session" and run
  // resumeInterruptedSteamInstall's locate/finalize pass concurrently with
  // it — the same live-install-owns-this-appId rule init()'s startup
  // surfacing loop already applies.
  if (
    steamGame.deps.steamSession.libraryState.library.get(steamGame.appId)
      ?.install?.steamResumePending &&
    !steamGame.deps.steamSession.gameSession.isNativeInstallInFlight(
      steamGame.appId
    )
  ) {
    await resume
      .resumeInterruptedSteamInstall(steamGame.deps, steamGame.appId)
      .catch((err) => {
        logWarning(
          [
            `SteamGame: resume-surface finalize failed for appId ${steamGame.appId}, continuing to normal install:`,
            err
          ],
          LogPrefix.Steam
        )
      })
  }

  await ensurePlatformsCaptured(steamGame)

  // D-17 (34.13-06): whether the renderer explicitly requested the
  // Windows-via-bottle override. The ONLY line in this method that reads
  // args.steamForceWindowsViaBottle — see the method's own JSDoc above for
  // why platformToInstall is never read instead.
  const overrideRequested = args.steamForceWindowsViaBottle === true

  // Triple-gated: overrideRequested AND isMac (host containment, D-18)
  // AND the persisted Windows-depot verdict proven true. Any gate failing
  // fails closed — routing stays byte-identical to today's.
  // Read ONCE and reused by the rejection log below (34.13 review WR-07):
  // the log has to be able to name WHICH gate refused, and the most likely
  // one in practice is a cold/absent metadata cache, not the host check.
  const windowsDepotVerdict =
    steamGame.deps.stores.steam.steamMetadataStore.get(
      steamGame.appId
    )?.is_windows_native

  const forceWindowsViaBottle =
    overrideRequested && isMac && windowsDepotVerdict === true

  // A silently-dropped user choice is a recurring defect class in this
  // repo — log why a requested-but-rejected override fell through instead
  // of failing silently. Both gates are named: logging `isMac` alone
  // produced `isMac=true` with no explanation whenever the real cause was
  // an uncaptured `is_windows_native`, which actively misdirects
  // diagnosis. `undefined` (never captured) and `false` (confirmed no
  // Windows depot) are deliberately distinguishable in the output.
  if (overrideRequested && !forceWindowsViaBottle) {
    logWarning(
      `SteamGame: appId ${steamGame.appId} requested a Windows-via-bottle install override but it was rejected ` +
        `(isMac=${isMac}, is_windows_native=${String(windowsDepotVerdict)}) — falling through to legacy routing`,
      LogPrefix.Steam
    )
  }

  const routeThroughBottle =
    forceWindowsViaBottle || isBottleEligible(steamGame)

  if (routeThroughBottle) {
    // quick 261024-cjq (todo no-crossover-notice): a missing CrossOver is a
    // PRECONDITION failure, not a bridge failure. It must NOT call
    // markBridgeFailedThisSession: that flips resolveBridgeRoute to
    // 'failed-this-session' and silently reroutes the next Install to
    // bottled Steam, which needs the same CrossOver. Bottled Steam is a
    // narrow fallback and is never the answer to a missing engine.
    //
    // Phase 59 (D-04): a missing CrossOver blocks only the bottled-Steam
    // route. The bridge route installs on the built-in engine, so the gate
    // is applied once the final route is known (below).
    const crossoverMissing =
      isMac &&
      !(await steamGame.deps.steamBottle.isCrossoverInstalled(steamGame.deps))

    // quick-260821-le0: remove a leftover unrunnable native i386 install
    // BEFORE anything else in this branch runs — HOARD proved a demoted
    // title can be bridge-eligible AND hold a native orphan at the same
    // time, so this must precede the isBridgeEligible() check below.
    await removeDemotedNativeOrphan(steamGame)

    // Phase 24 Plan 08 (R4/D-01): allowlisted-title bridge routing — the
    // FIRST check inside this block, BEFORE the Phase 17 isBottleReady()
    // gate below, because the bridge bottle has its own dedicated
    // readiness/provisioning path (installBridgeGame -> isBridgeBottleReady
    // / provisionBridgeBottle, 24-04) that must not be blocked by the
    // unrelated Phase 17 GameLibSteam bottle's own state (BLOCKER 1).
    // D-51-08/11/13 (Plan 13): compute the composed route ONCE and act on
    // it, rather than re-deriving eligibility via isBridgeEligible() alone
    // -- a route whose noticeRequired is true (bottle: drm-wrapped
    // known-bad/win64-no-shim; bridge: a non-DRM known-bad title or a
    // persisted scan-miss, both informational, per the D-51-08 amendments
    // of 2026-10-23 (og0, oq7); unless already acknowledged for that same
    // reason) must pause for the user's explicit in-app
    // choice BEFORE any bottled-Steam dispatch or bridge install below
    // runs. A bridge-route notice is informational: the bridge is still
    // attempted once the user proceeds. Mirrors the
    // steamBottleSetupRequired deferral immediately below so the
    // DownloadManager clears the transient 'installing' badge the same
    // way -- nothing is installed and no ACF poller starts on this path.
    let bridgeRoute = resolveEligibilityBridgeRoute(steamGame, {
      windowsBuildChosen: forceWindowsViaBottle
    })

    // 51-REVIEW WR-08: launch() and uninstall() route by LOCATION, but the
    // widened pending-scan default routes every non-seed bottle-eligible
    // title to the bridge by ELIGIBILITY. A title whose partial bits
    // already live in the Phase 17 GameLibSteam bottle (the native-download
    // breadcrumb of an interrupted pre-upgrade install that the resume
    // pass above just ran against) would otherwise be downloaded a second
    // time into a fresh bridge bottle, orphaning the first copy. Keep the
    // bottled path for it. The user's own "Try the bridge anyway" choice is
    // the one exception: an explicit choice is honoured.
    if (
      bridgeRoute.route === 'bridge' &&
      bridgeRoute.reason !== 'user-forced-bridge' &&
      hasBottledSteamCopy(steamGame)
    ) {
      logInfo(
        `SteamGame: appId ${steamGame.appId} already has bits in the GameLibSteam bottle -- keeping the bottled install path instead of starting a second download into a bridge bottle (51-REVIEW WR-08)`,
        LogPrefix.Steam
      )
      bridgeRoute = { ...bridgeRoute, route: 'bottle', noticeRequired: false }
    }

    // D-51-06 (Plan 17): the cheap pre-install screen ROADMAP sub-decision
    // 2 left open -- measured by research as NOT free (a second, separate
    // buildDepotPlan call), so it only runs for a title that would
    // otherwise land on 'pending-scan' with no steamApi screened yet (a
    // title already carrying a steamApi value -- even one that itself
    // still resolves to 'pending-scan', e.g. a screened x64 title with the
    // shim present -- has already paid this cost once and must not pay it
    // again). A screen failure ('unknown') never blocks the install --
    // depot.ts's prescreenBridgeDepots itself never throws.
    if (
      bridgeRoute.route === 'bridge' &&
      bridgeRoute.reason === 'pending-scan' &&
      readBridgeVerdict(steamGame.deps, steamGame.appId)?.steamApi === undefined
    ) {
      const bridgeBottleName = bridgeBottle.bridgeBottleNameFor(steamGame.appId)
      // Phase 54: a short lease for the screen alone, so a refusal here
      // stops before a second wrap attempt in installBridgeGame.
      const prescreenLease =
        await steamGame.deps.steamUser.acquireAuthenticated({
          reason: 'prescreen',
          guidedAction: 'install',
          appName: steamGame.appId,
          installPath: args.path,
          forceWindowsViaBottle: args.steamForceWindowsViaBottle
        })
      if (!prescreenLease.ok) {
        return installResultForRefusal(steamGame, prescreenLease.reason)
      }
      try {
        const prescreenResult = await prescreenBridgeDepots(steamGame.appId, {
          steamUser: steamGame.deps.steamUser,
          config: steamGame.deps.config,
          targetSteamappsDir: bridgeBottleName
            ? bottle.getBottleSteamappsDir(bridgeBottleName)
            : '',
          installdir: steamGame.appId,
          os: 'windows'
        })
        setBridgeSteamApiPrescreen(
          steamGame.deps,
          steamGame.appId,
          prescreenResult
        )
      } finally {
        prescreenLease.release()
      }
      bridgeRoute = resolveEligibilityBridgeRoute(steamGame, {
        windowsBuildChosen: forceWindowsViaBottle
      })
    }

    if (crossoverMissing && bridgeRoute.route !== 'bridge') {
      logWarning(
        `SteamGame: CrossOver is not installed — bottled-Steam install of appId ${steamGame.appId} stopped (precondition, not a bridge failure)`,
        LogPrefix.Steam
      )
      return crossoverRequiredError(steamGame)
    }

    if (
      bridgeRoute.route !== 'not-eligible' &&
      bridgeRoute.noticeRequired &&
      bridgeRoute.reason !== null
    ) {
      // Bridge rows 8-11 can only owe a known-bad notice; bridge row 7
      // carries 'scan-miss' (quick 261023-oq7). Anything outside the
      // notice vocabulary is a known-bad notice.
      const noticeReason = NOTICE_REASONS.has(bridgeRoute.reason)
        ? bridgeRoute.reason
        : 'known-bad'
      logInfo(
        `SteamGame: appId ${steamGame.appId} ${bridgeRoute.route} route (${noticeReason}) requires a user notice before any install -- deferring to the in-app dialog`,
        LogPrefix.Steam
      )
      sendFrontendMessage('steamBridgeRouteNotice', {
        appName: steamGame.appId,
        reason: noticeReason,
        knownBadReason: bridgeRoute.knownBadReason,
        missingSymbols: bridgeRoute.missingSymbols,
        route: bridgeRoute.route,
        userRoute: bridgeRoute.userRoute,
        // quick 261107-lum: replay the Windows-build choice on retry.
        ...(forceWindowsViaBottle
          ? { forceWindowsViaBottle: true as const }
          : {})
      })
      return { status: 'done', deferredToSetup: true }
    }

    if (bridgeRoute.route === 'bridge') {
      if (forceWindowsViaBottle) {
        logInfo(
          `SteamGame: forced-Windows install of appId ${steamGame.appId} routed by the bridge verdict: ${bridgeRoute.route}/${String(bridgeRoute.reason)}`,
          LogPrefix.Steam
        )
      }
      const bridgeResult = await installBridgeGame(steamGame, args)
      // quick 261107-lum (DC-2): persist the forced verdict only when THIS
      // install was forced and completed, so launch()/isNative() follow it.
      if (
        forceWindowsViaBottle &&
        bridgeResult.status === 'done' &&
        !bridgeResult.deferredToSetup
      ) {
        markForcedWindowsViaBottle(steamGame.deps, steamGame.appId)
      }
      return bridgeResult
    }

    if (!steamGame.deps.steamBottle.isBottleReady()) {
      logInfo(
        `SteamGame: appId ${steamGame.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of installing`,
        LogPrefix.Steam
      )
      sendFrontendMessage('steamBottleSetupRequired', {
        appName: steamGame.appId
      })
      // Nothing was installed and no ACF poller starts here — flag the
      // deferral so the DownloadManager clears the transient 'installing'
      // badge instead of leaving the game stuck "installing" (the guided
      // setup, or the user's "Not now", owns what happens next).
      return { status: 'done', deferredToSetup: true }
    }

    // quick 261107-lum: a forced-Windows install reaches this terminal only as
    // the bridge verdict's own bottle fallback (user-forced-bottle, drm-wrapped,
    // failed-this-session, win64-no-shim, WR-08), never by bypassing the verdict.
    //
    // quick 261030-o77: every bottle-route install (bottle-eligible or
    // forced Windows-via-bottle) always uses GameLib's own depot installer:
    // depot-download the WINDOWS depot directly into the bottle's OWN
    // steamapps/ filesystem path — the SAME depot.ts mechanism the
    // (non-bottle-eligible) native opt-in branch below uses, just with the
    // write target swapped to the bottle's steamapps dir and os hard-coded
    // 'windows'. The enableSteamNativeInstall toggle does not apply here
    // (it only chooses between depot and steam://install for mac-native
    // titles): bottled Windows Steam cannot download or adopt installs.
    //
    // D-17 (34.13-14): persist the forced verdict ONLY when this specific
    // install was forced (never for a game that was already ordinarily
    // bottle-eligible) AND the depot download actually completed.
    const bottleNativeResult = await installBottleNative(steamGame, args)
    if (
      bottleNativeResult.status === 'done' &&
      !bottleNativeResult.deferredToSetup
    ) {
      if (forceWindowsViaBottle) {
        markForcedWindowsViaBottle(steamGame.deps, steamGame.appId)
      }
    }
    return bottleNativeResult
  }

  // D-13 opt-in: route a (non-bottle-eligible) native install through the
  // depot.ts orchestrator instead of the steam://install handoff. Reading
  // the setting is the ONLY new branch condition — OFF keeps the
  // steam://install path below (D-13 safety valve), gated since D-UAT-19 on
  // a Steam client being there to handle it. The D-15
  // bottle branch above is Plan 11's scope, not this one.
  if (isSteamNativeInstallEnabled(steamGame.deps.config)) {
    return installNative(steamGame, args)
  }

  const url = buildSteamProtocolUrl('install', steamGame.appId)
  if (!url) {
    return { status: 'error', error: `Invalid appId: ${steamGame.appId}` }
  }

  // D-UAT-19 (quick 261102-dkw): the hand-off needs a Steam client to
  // handle steam://. With none installed, Windows showed a bare "no app
  // handles this link" error and the ACF poller below kept the game
  // "installing" for ~30 min. Gate on the same check the native path uses:
  // a missing / never-launched client opens the D-10/D-11 guided setup
  // (ensureSteamClientReady already sent steamClientSetupRequired), and the
  // install is deferred — no openExternal, no poller, no finished entry.
  const clientReady = await ensureSteamClientReady(
    steamGame.deps,
    steamGame.appId
  )
  if (!clientReady.ready) {
    if (
      clientReady.error === undefined &&
      (clientReady.status === 'needs-install' ||
        clientReady.status === 'needs-launch')
    ) {
      logInfo(
        `SteamGame: appId ${steamGame.appId} Steam client not ready (${clientReady.status}) — guided setup requested, deferring steam://install hand-off`,
        LogPrefix.Steam
      )
      return { status: 'done', deferredToSetup: true }
    }
    return {
      status: 'error',
      error:
        clientReady.error ??
        `Steam client not ready for appId ${steamGame.appId}`
    }
  }

  // quick 261105-ord: opt-in macOS "Steam Experimental InstallApp Feature".
  // Ask the running Steam client to install through its internal
  // IClientAppManager::InstallApp so no Steam window / dialog opens. Any
  // 'unavailable' outcome falls through to the unchanged steam://install
  // hand-off below; a Steam-reported EAppUpdateError is surfaced, not
  // swallowed.
  if (isSteamExperimentalInstallAppEnabled(steamGame.deps.config)) {
    const libraryPath = await resolveSteamLibraryRoot(
      steamGame.deps,
      args?.path
    ).catch(() => undefined)
    const outcome = await requestSteamInstallApp(
      steamGame.appId,
      { libraryPath },
      {
        paths: steamGame.deps.paths,
        run: createSteamInstallAppRun({ runner: steamGame.deps.runner })
      }
    )
    if (outcome.kind === 'ok') {
      logInfo(
        `SteamGame: Steam is installing appId ${steamGame.appId} via InstallApp (library folder index ${outcome.folderIndex})`,
        LogPrefix.Steam
      )
      startInstallPolling(steamGame.deps, steamGame.appId, {
        delegatedToSteamClient: true
      })
      return { status: 'done' }
    }
    if (outcome.kind === 'error') {
      logError(
        `SteamGame: Steam refused InstallApp for appId ${steamGame.appId} (EAppUpdateError ${outcome.code})`,
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: `Steam refused the install of ${steamGame.appId} (EAppUpdateError ${outcome.code})`
      }
    }
    logInfo(
      `SteamGame: InstallApp unavailable for appId ${steamGame.appId} (${outcome.reason}) — falling back to steam://install`,
      LogPrefix.Steam
    )
  }

  logInfo(
    `SteamGame: delegating install for appId ${steamGame.appId} via ${url}`,
    LogPrefix.Steam
  )
  await steamGame.deps.openExternal.openExternal(url)

  // Start ACF polling so the install progress and completion are surfaced
  // in GamerLib without requiring a focus round-trip (D-07). The poller
  // sends 'installing' / 'done' status updates to the frontend and flips
  // the badge when StateFlags bit 4 is set. Install state is never
  // optimistically flipped here (D-02) — only ACF confirms.
  // quick 261024-exo: delegatedToSteamClient keeps the poll alive through
  // Steam's startup/self-update and the user's install dialog (a failed
  // dispatch never reaches here, so no poller means no false installing).
  startInstallPolling(steamGame.deps, steamGame.appId, {
    delegatedToSteamClient: true
  })

  return { status: 'done' }
}

/**
 * quick-260821-le0: closes the 32-bit Mac Steam orphan defect at the
 * "stop creating new ones" end. `install()`'s `routeThroughBottle` branch
 * calls this as its FIRST statement, before the bridge/bottle-provisioning
 * checks below — a demoted title can be bridge-eligible AND already hold
 * a leftover native i386 install at the same time (the HOARD/63000 shape
 * that made this defect visible).
 *
 * Triple-gated, ALL of:
 *  1. `isAppleSiliconMac` — the load-bearing safety gate. i386 STILL RUNS
 *     on an Intel Mac, so an Intel host must keep its native copy. Never
 *     widen this to a bare `isMac` or to a negated-Intel-probe equivalent
 *     (see environment.ts's own comment on the positive-probe requirement).
 *  2. `steamGame.deps.stores.steam.steamMetadataStore.get(appId)?.mac_arch === '32'` — the specific
 *     demotion signal, read directly rather than via `isBottleEligible()`,
 *     which is also true for a merely-not-mac-native title whose native
 *     install is a DIFFERENT case and out of scope here.
 *  3. `readAcfState(deps, appId, 'native').state === 'installed'` — the guard
 *     `install()` has never had.
 *
 * On a match: `removeSteamInstallCopy` deletes the native copy, then
 * `pollUninstallOnce('native')` is the ONLY state update on this path —
 * it is the existing honest reconciliation mechanism, re-probing bottle/
 * bridge for a survivor and re-resolving `install_path`, or flipping to
 * not-installed when nothing survives. No `library.set()` is hand-written
 * here and no badge is force-flipped in either direction (the badge
 * follows confirmed on-disk ACF state, per the locked constraint and
 * `60e89349a`) — a transient "Game Uninstalled" toast immediately before
 * the bottle install starts is ACCEPTED as honest, not papered over.
 *
 * A cleanup failure is never fatal to the install: the whole body is
 * wrapped in try/catch and only `logWarning`s on failure, following the
 * same shape as `resumeInterruptedSteamInstall`'s own call site above.
 */
export async function removeDemotedNativeOrphan(
  steamGame: SteamGame
): Promise<void> {
  try {
    if (!isAppleSiliconMac) {
      return
    }

    if (
      steamGame.deps.stores.steam.steamMetadataStore.get(steamGame.appId)
        ?.mac_arch !== '32'
    ) {
      return
    }

    const nativeState = await readAcfState(
      steamGame.deps,
      steamGame.appId,
      'native'
    )
    if (nativeState.state !== 'installed') {
      return
    }

    const result = await removeSteamInstallCopy(
      steamGame.deps,
      steamGame.appId,
      'native'
    )
    logInfo(
      `SteamGame: removeDemotedNativeOrphan removed appId ${steamGame.appId}'s native install (result: ${result.status})`,
      LogPrefix.Steam
    )

    await pollUninstallOnce(steamGame.deps, steamGame.appId, 'native')
  } catch (error) {
    logWarning(
      [
        `SteamGame: removeDemotedNativeOrphan failed for appId ${steamGame.appId}, continuing with install:`,
        error
      ],
      LogPrefix.Steam
    )
  }
}

/**
 * 51-REVIEW WR-08: true when an interrupted native download for this appId
 * targeted the Phase 17 GameLibSteam bottle -- the install-start breadcrumb
 * (`markSteamNativeInstallStarted`, written before the download await and
 * cleared only on success) points at that bottle's steamapps dir. The
 * breadcrumb, not an ACF, is the signal: a hard kill runs no JS, so an
 * interrupted download leaves no `appmanifest_*.acf` at all. A COMPLETE
 * GameLibSteam install never reaches install() (it is already installed),
 * so the breadcrumb covers the resume case the review names.
 */
export function hasBottledSteamCopy(steamGame: SteamGame): boolean {
  const breadcrumb = steamGame.deps.steamSession.libraryState.library.get(
    steamGame.appId
  )?.install?.steamResumeTargetSteamappsDir
  if (typeof breadcrumb !== 'string' || breadcrumb === '') {
    return false
  }
  const steamappsDir = bottle.getBottleSteamappsDir(
    steamGame.deps.steamBottle.getSteamBottleSettings().wineCrossoverBottle
  )
  return resolve(breadcrumb) === resolve(steamappsDir)
}

export function crossoverRequiredError(_steamGame: SteamGame): InstallResult {
  return {
    status: 'error',
    error: i18next.t(
      'gamelib:steam.install.crossoverRequired',
      'CrossOver is required to install Windows games on macOS. Install it from codeweavers.com, then try again.'
    )
  }
}

export async function ensureBuiltInEngineForInstall(
  steamGame: SteamGame,
  pin: EnginePin,
  signal?: AbortSignal
): Promise<NonCrossoverEngine | InstallResult> {
  // Phase 61 (D-03): the progress wrapper is shared with the non-Steam stores.
  const result = await ensurePinnedEngineReportingStatus({
    pin,
    appName: steamGame.appId,
    runner: 'steam',
    processRunner: steamGame.deps.runner,
    onlineMonitor: steamGame.deps.onlineMonitor,
    fallback: steamGame.deps.engineRuntime.fallback,
    signal
  })
  if (result.ok) return result.engine
  // 59-REVIEW WR-01: a cancel or quit is not a download failure.
  if (result.aborted) return { status: 'abort' }
  return {
    status: 'error',
    error: i18next.t(
      'gamelib:steam.engine.downloadFailed',
      "GameLib couldn't download its built-in engine ({{reason}}). Check your connection and try again.",
      { reason: result.reason }
    )
  }
}
