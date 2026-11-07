/**
 * Install cluster lifted out of SteamGame (62-06, D-06 mechanical lift:
 * this -> steamGame).
 * Public SteamGame entry points keep a delegating stub on the class;
 * internal helpers are called directly by sibling lifted modules, importing
 * forward only (gameEligibility/gameLaunchOverlay -> gameInstall ->
 * gameLaunch -> gameBridgeLaunch). A call a test spies on stays a
 * `steamGame.X()` call (quick-261107-an2).
 */

import i18next from 'i18next'
import { shell } from 'backend/platform'
import { resolve } from 'node:path'
import { GameSettings, InstallArgs } from 'common/types'
import { InstallResult } from 'common/types/game_manager'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import { sendGameStatusUpdate } from 'backend/utils'
import { isMac, isAppleSiliconMac } from 'backend/constants/environment'
import {
  createAbortController,
  deleteAbortController,
  hasAbortController,
  getAbortSignal
} from 'backend/utils/aborthandler/aborthandler'
import { sendFrontendMessage } from '../../ipc'
import { steamMetadataStore } from './stores'
import { library } from './state'
import { pollUninstallOnce } from './library/uninstallPolling'
import * as resume from './library/resume'
import { readAcfState, removeSteamInstallCopy } from './library/acfState'
import { startInstallPolling } from './library/installPolling'
import { stopInstallPolling } from './library/installStop'
import * as pollState from './library/pollState'
import * as bottle from './bottle'
import * as bbLifecycle from './bridgeBottleLifecycle'
import * as bridgeBottle from './bridgeBottle'
import { buildFallbackGameSettings } from 'backend/engine/bottlePrimitives'
import { isSteamNativeInstallEnabled } from './nativeInstallSetting'
import type { NonCrossoverEngine } from 'backend/engine/engineTypes'
import { noteSteamAuthTrigger } from './authTrigger'
import { SteamUser } from './user'
import { prescreenBridgeDepots } from './depot'
import { ensureSteamClientReady } from './clientSetup'
import { resolveSteamLibraryRoot } from './installLocation'
import { isSteamExperimentalInstallAppEnabled } from './experimentalInstallAppSetting'
import { requestSteamInstallApp } from './steamInstallApp'
import { placeShimForGame } from './bridge/shimGenerate'
import { resolveBridgeLaunchExe } from './bridge/launchTarget'
import { NOTICE_REASONS } from './bridge/bridgeRoute'
import {
  readBridgeVerdict,
  writeBridgeScanVerdict,
  setBridgeSteamApiPrescreen,
  setBridgeUserRoute
} from './bridge/bridgeVerdict'
import type { EnginePin } from 'backend/engine/enginePins'
import { ensurePinnedEngineReportingStatus } from 'backend/engine/pinnedEngineProgress'
import {
  markBridgeFailedThisSession,
  clearBridgeFailedThisSession,
  isNativeInstallInFlight,
  markForcedWindowsViaBottle
} from './gameSessionState'
import { hostSteamDepotOs } from './gameRequirements'
import { buildSteamProtocolUrl } from './gameProtocolUrl'
import type SteamGame from './games'
import {
  bridgeRoute as resolveEligibilityBridgeRoute,
  clearStaleBridgeVerdict,
  ensurePlatformsCaptured,
  isBottleEligible
} from './gameEligibility'
import {
  persistBridgeDrmSignal,
  reconcileBridgePrescreen,
  resolveBridgeGameInstallRoot,
  markBridgeGameInstalled
} from './bridgeInstallState'
import {
  installDepotDownload,
  installResultForRefusal
} from './gameInstallDepot'

export async function install(
  steamGame: SteamGame,
  args: InstallArgs
): Promise<InstallResult> {
  // quick-260817-d61: Install is a deliberate Steam action — unlock the
  // keyring deferral gate as the first statement, before anything else in
  // this method runs.
  noteSteamAuthTrigger('user-install')
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
    library.get(steamGame.appId)?.install?.steamResumePending &&
    !isNativeInstallInFlight(steamGame.appId)
  ) {
    await resume.resumeInterruptedSteamInstall(steamGame.appId).catch((err) => {
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
  const windowsDepotVerdict = steamMetadataStore.get(
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
    const crossoverMissing = isMac && !(await bottle.isCrossoverInstalled())

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
      readBridgeVerdict(steamGame.appId)?.steamApi === undefined
    ) {
      const bridgeBottleName = bridgeBottle.bridgeBottleNameFor(steamGame.appId)
      // Phase 54: a short lease for the screen alone, so a refusal here
      // stops before a second wrap attempt in installBridgeGame.
      const prescreenLease = await SteamUser.acquireAuthenticated({
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
          targetSteamappsDir: bridgeBottleName
            ? bottle.getBottleSteamappsDir(bridgeBottleName)
            : '',
          installdir: steamGame.appId,
          os: 'windows'
        })
        setBridgeSteamApiPrescreen(steamGame.appId, prescreenResult)
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
      const bridgeResult = await steamGame.installBridgeGame(args)
      // quick 261107-lum (DC-2): persist the forced verdict only when THIS
      // install was forced and completed, so launch()/isNative() follow it.
      if (
        forceWindowsViaBottle &&
        bridgeResult.status === 'done' &&
        !bridgeResult.deferredToSetup
      ) {
        markForcedWindowsViaBottle(steamGame.appId)
      }
      return bridgeResult
    }

    if (!bottle.isBottleReady()) {
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
    const bottleNativeResult = await steamGame.installBottleNative(args)
    if (
      bottleNativeResult.status === 'done' &&
      !bottleNativeResult.deferredToSetup
    ) {
      if (forceWindowsViaBottle) {
        markForcedWindowsViaBottle(steamGame.appId)
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
  if (isSteamNativeInstallEnabled()) {
    return steamGame.installNative(args)
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
  const clientReady = await ensureSteamClientReady(steamGame.appId)
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
  if (isSteamExperimentalInstallAppEnabled()) {
    const libraryPath = await resolveSteamLibraryRoot(args?.path).catch(
      () => undefined
    )
    const outcome = await requestSteamInstallApp(steamGame.appId, {
      libraryPath
    })
    if (outcome.kind === 'ok') {
      logInfo(
        `SteamGame: Steam is installing appId ${steamGame.appId} via InstallApp (library folder index ${outcome.folderIndex})`,
        LogPrefix.Steam
      )
      startInstallPolling(steamGame.appId, { delegatedToSteamClient: true })
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
  await shell.openExternal(url)

  // Start ACF polling so the install progress and completion are surfaced
  // in GamerLib without requiring a focus round-trip (D-07). The poller
  // sends 'installing' / 'done' status updates to the frontend and flips
  // the badge when StateFlags bit 4 is set. Install state is never
  // optimistically flipped here (D-02) — only ACF confirms.
  // quick 261024-exo: delegatedToSteamClient keeps the poll alive through
  // Steam's startup/self-update and the user's install dialog (a failed
  // dispatch never reaches here, so no poller means no false installing).
  startInstallPolling(steamGame.appId, { delegatedToSteamClient: true })

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
 *  2. `steamMetadataStore.get(appId)?.mac_arch === '32'` — the specific
 *     demotion signal, read directly rather than via `isBottleEligible()`,
 *     which is also true for a merely-not-mac-native title whose native
 *     install is a DIFFERENT case and out of scope here.
 *  3. `readAcfState(appId, 'native').state === 'installed'` — the guard
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

    if (steamMetadataStore.get(steamGame.appId)?.mac_arch !== '32') {
      return
    }

    const nativeState = await readAcfState(steamGame.appId, 'native')
    if (nativeState.state !== 'installed') {
      return
    }

    const result = await removeSteamInstallCopy(steamGame.appId, 'native')
    logInfo(
      `SteamGame: removeDemotedNativeOrphan removed appId ${steamGame.appId}'s native install (result: ${result.status})`,
      LogPrefix.Steam
    )

    await pollUninstallOnce(steamGame.appId, 'native')
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

export async function installNative(
  steamGame: SteamGame,
  args: InstallArgs
): Promise<InstallResult> {
  return installDepotDownload(steamGame, args, { os: hostSteamDepotOs() })
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
  const breadcrumb = library.get(steamGame.appId)?.install
    ?.steamResumeTargetSteamappsDir
  if (typeof breadcrumb !== 'string' || breadcrumb === '') {
    return false
  }
  const steamappsDir = bottle.getBottleSteamappsDir(
    bottle.getSteamBottleSettings().wineCrossoverBottle
  )
  return resolve(breadcrumb) === resolve(steamappsDir)
}

export async function installBottleNative(
  steamGame: SteamGame,
  args: InstallArgs
): Promise<InstallResult> {
  const targetSteamappsDir = bottle.getBottleSteamappsDir(
    bottle.getSteamBottleSettings().wineCrossoverBottle
  )
  return installDepotDownload(steamGame, args, {
    targetSteamappsDirOverride: targetSteamappsDir,
    os: 'windows',
    pollerSource: 'bottle'
  })
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

export async function installBridgeGame(
  steamGame: SteamGame,
  args: InstallArgs
): Promise<InstallResult> {
  // quick/261016-u1w (D-A): new installs ALWAYS target this game's OWN
  // per-game bridge bottle directly — never via resolveBridgeBottleName
  // (D-B), which would let an existing legacy-bottle manifest for this
  // appId redirect a fresh install back into the shared bottle.
  const bridgeBottleName = bridgeBottle.bridgeBottleNameFor(steamGame.appId)
  if (!bridgeBottleName) {
    logWarning(
      `SteamGame: installBridgeGame rejected non-numeric appId ${steamGame.appId} — no per-game bottle name`,
      LogPrefix.Steam
    )
    markBridgeFailedThisSession(steamGame.appId)
    return {
      status: 'error',
      error: `Invalid appId: "${steamGame.appId}"`
    }
  }

  // 59-UAT G2: sign-in is checked FIRST, so a refused session returns before
  // any engine download or bottle creation. Phase 54: the one lease now
  // spans provisioning, the download, shim placement and the install-time
  // shared-redist step (acquireAuthenticated may be held across long work;
  // only the idle timer after the last release closes the session).
  const lease = await SteamUser.acquireAuthenticated({
    reason: 'user-install',
    guidedAction: 'install',
    appName: steamGame.appId,
    installPath: args.path,
    forceWindowsViaBottle: args.steamForceWindowsViaBottle
  })
  if (!lease.ok) {
    return installResultForRefusal(steamGame, lease.reason)
  }
  // Quick 261029-exu: the bridge poller no longer sends 'done' when the
  // manifest lands, so a path that stops after the download (CEG, shim
  // failure, a throw) must clear the "finishing" status itself.
  const clearFinishing = () => {
    pollState.markBridgeInstallFinalized(steamGame.appId)
    sendGameStatusUpdate({
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
  }
  try {
    // 59-REVIEW WR-11 / CR-01 (install cancel): the download queue aborts an
    // install by id, so provisioning observes that controller's signal. A
    // live controller is reused; a missing or already-aborted one (IN-03) is
    // replaced. A controller this install created stays registered until the
    // depot run registers its own, so no cancel can land in a gap; the
    // finally removes it only if it is still ours.
    let installEngine: NonCrossoverEngine | 'crossover' | null = null
    let signal: AbortSignal | undefined
    let ownsController = false
    const stop = (): InstallResult => {
      sendGameStatusUpdate({
        appName: steamGame.appId,
        runner: 'steam',
        status: 'done'
      })
      return { status: 'abort' }
    }
    try {
      if (!bridgeBottle.isBridgeBottleReady(bridgeBottleName)) {
        const reused =
          hasAbortController(steamGame.appId) &&
          getAbortSignal(steamGame.appId)?.aborted === false
        signal = reused
          ? getAbortSignal(steamGame.appId)
          : createAbortController(steamGame.appId).signal
        ownsController = !reused
        const provisioned = await provisionBridgeBottleForInstall(
          steamGame,
          bridgeBottleName,
          signal,
          { forceWindowsViaBottle: args.steamForceWindowsViaBottle === true }
        )
        if ('result' in provisioned) return provisioned.result
        installEngine = provisioned.engine
        if (signal?.aborted) {
          if (provisioned.createdHere) {
            bbLifecycle.discardNewBridgeBottle(bridgeBottleName)
          }
          return stop()
        }
      }
      const result = await installBridgeGameLeased(
        steamGame,
        args,
        bridgeBottleName,
        installEngine,
        signal
      )
      if (result.status === 'error') clearFinishing()
      return result
    } finally {
      if (
        ownsController &&
        signal &&
        getAbortSignal(steamGame.appId) === signal
      ) {
        deleteAbortController(steamGame.appId)
      }
    }
  } catch (error) {
    clearFinishing()
    throw error
  } finally {
    lease.release()
  }
}

/**
 * The inline bridge-bottle creation of installBridgeGame (BLOCKER 1), now
 * run under the install lease. Returns the engine that owns the new bottle,
 * or the InstallResult to stop with.
 */
export async function provisionBridgeBottleForInstall(
  steamGame: SteamGame,
  bridgeBottleName: string,
  signal?: AbortSignal,
  opts?: { forceWindowsViaBottle?: boolean }
): Promise<
  | { engine: NonCrossoverEngine | 'crossover'; createdHere: boolean }
  | { result: InstallResult }
> {
  const abortResult = (): { result: InstallResult } => {
    sendGameStatusUpdate({
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
    return { result: { status: 'abort' } }
  }
  // G21 (59-36): the bottle-creation stage the Downloads tab and game page
  // render (59-37 maps the context to its label).
  const sendCreatingBottle = () =>
    sendGameStatusUpdate({
      appName: steamGame.appId,
      runner: 'steam',
      status: 'engine-download',
      context: 'creating-bottle'
    })
  logInfo(
    `SteamGame: bridge bottle "${bridgeBottleName}" not yet provisioned for appId ${steamGame.appId} — provisioning inline (BLOCKER 1, no consent dialog needed)`,
    LogPrefix.Steam
  )
  const { decideCreationEngine } = await import('backend/engine/engineDecision')
  const { steamDecisionDeps } = await import('./engine/steamEngineDeps')
  const creation = await decideCreationEngine(
    { key: steamGame.appId },
    steamDecisionDeps()
  )
  logInfo(
    `SteamGame: bridge bottle creation engine for appId ${steamGame.appId}: ${creation.kind}${creation.kind === 'pinned' ? ` (${creation.reason})` : ''}`,
    LogPrefix.Steam
  )
  if (signal?.aborted) return abortResult()
  let provisionResult: Awaited<
    ReturnType<typeof bbLifecycle.provisionBridgeBottle>
  >
  let engineUsed: NonCrossoverEngine | 'crossover' = 'crossover'
  if (creation.kind === 'pinned') {
    const engine = await ensureBuiltInEngineForInstall(
      steamGame,
      creation.pin,
      signal
    )
    // 59-REVIEW WR-11: an aborted download (quit, or the install cancelled)
    // must stop here; wineboot after quit breaks the sidecar exit contract.
    if ('status' in engine) return { result: engine }
    engineUsed = engine
    if (signal?.aborted) return abortResult()
    sendCreatingBottle()
    provisionResult = await bbLifecycle.provisionBridgeBottle({
      bottleName: bridgeBottleName,
      fallbackEngine: engine,
      signal
    })
  } else {
    sendCreatingBottle()
    provisionResult = await bbLifecycle.provisionBridgeBottle({
      bottleName: bridgeBottleName,
      createTimeoutMs: creation.createTimeoutMs,
      signal
    })
    if (provisionResult.errorCode === bottle.PROVISION_ABORTED) {
      return abortResult()
    }
    if (
      provisionResult.errorCode === bottle.CROSSOVER_CREATE_TIMEOUT ||
      provisionResult.errorCode === bottle.CROSSOVER_MISSING ||
      // 59-REVIEW WR-02 / D-09: a failed create is a broken CrossOver too.
      provisionResult.errorCode === bottle.CROSSOVER_CREATE_FAILED
    ) {
      // D-12 (59-01 create_under_expiry): cxbottle --create can hang or
      // fail under an expired/broken CrossOver, and CrossOver can vanish
      // after the gate. Create the same bottle with the built-in engine.
      logWarning(
        `SteamGame: CrossOver bottle creation for appId ${steamGame.appId} returned ${provisionResult.errorCode} — creating with the built-in engine`,
        LogPrefix.Steam
      )
      const { ENGINE_PINS } = await import('backend/engine/enginePins')
      const engine = await ensureBuiltInEngineForInstall(
        steamGame,
        ENGINE_PINS.current,
        signal
      )
      // 59-REVIEW WR-11: see above.
      if ('status' in engine) return { result: engine }
      engineUsed = engine
      if (signal?.aborted) return abortResult()
      sendCreatingBottle()
      provisionResult = await bbLifecycle.provisionBridgeBottle({
        bottleName: bridgeBottleName,
        fallbackEngine: engine,
        signal
      })
    }
  }
  if (provisionResult.errorCode === bottle.PROVISION_ABORTED)
    return abortResult()
  if (provisionResult.status !== 'done') {
    logWarning(
      `SteamGame: bridge bottle provisioning failed for appId ${steamGame.appId}: ${provisionResult.error}`,
      LogPrefix.Steam
    )
    markBridgeFailedThisSession(steamGame.appId)
    sendGameStatusUpdate({
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'bridge-bottle-provision-failed',
      fallbackAvailable: true,
      ...(opts?.forceWindowsViaBottle
        ? { forceWindowsViaBottle: true as const }
        : {})
    })
    return { result: { status: 'done', deferredToSetup: true } }
  }
  // G1 (59-22) / G21 (59-36): the creating-bottle stage precedes both
  // engines and nothing else replaces it, so hand the state back to
  // installing whatever engine was used.
  sendGameStatusUpdate({
    appName: steamGame.appId,
    runner: 'steam',
    status: 'installing'
  })
  return {
    engine: engineUsed,
    createdHere: provisionResult.createdHere === true
  }
}

/**
 * 59-REVIEW CR-02 (D-01/D-04): the settings every install-time wine step
 * uses, from the engine that owns the bottle. null means no usable engine,
 * so the wine steps are skipped (they never fail an install).
 */
export async function resolveInstallEngineSettings(
  steamGame: SteamGame,
  bridgeBottleName: string,
  installEngine: NonCrossoverEngine | 'crossover' | null
): Promise<{ settings: GameSettings } | { skipped: string }> {
  if (installEngine === 'crossover') {
    return { settings: bridgeBottle.getBridgeBottleSettings(steamGame.appId) }
  }
  if (installEngine !== null) {
    return {
      settings: buildFallbackGameSettings(bridgeBottleName, installEngine)
    }
  }
  // Bottle already existed: the same decision + preparation as a launch.
  const { decideLaunchEngine } = await import('backend/engine/engineDecision')
  const { prepareBottleForEngine } = await import('backend/engine/engineSwitch')
  const { isNonCrossover } = await import('backend/engine/engineTypes')
  const { steamDecisionDeps, steamSwitchDeps } =
    await import('./engine/steamEngineDeps')
  const decision = await decideLaunchEngine(
    { key: steamGame.appId, bottleName: bridgeBottleName },
    steamDecisionDeps()
  )
  if (decision.kind === 'unavailable') {
    return { skipped: `engine unavailable: ${decision.detail}` }
  }
  if (decision.needsDownload && decision.pin) {
    const engine = await ensureBuiltInEngineForInstall(steamGame, decision.pin)
    if ('status' in engine) return { skipped: 'engine download failed' }
  }
  const sel = decision.selection
  const prep = await prepareBottleForEngine({
    key: steamGame.appId,
    bottleName: bridgeBottleName,
    next: sel,
    crossoverHealthy: decision.preflight?.kind === 'healthy',
    deps: {
      ...steamSwitchDeps(),
      ensurePinEngine: steamGame.restorePinEngine
    }
  })
  if (!prep.ok && prep.reason !== 'dxvk-failed') {
    return { skipped: `${prep.reason}: ${prep.detail}` }
  }
  if (!prep.ok && sel.kind === 'crossover') {
    // CR-03: no redists on CrossOver over DXVK-macOS DLLs.
    return { skipped: `dxvk restore failed: ${prep.detail}` }
  }
  if (isNonCrossover(sel)) {
    return { settings: buildFallbackGameSettings(bridgeBottleName, sel) }
  }
  return { settings: bridgeBottle.getBridgeBottleSettings(steamGame.appId) }
}

/** The lease-held part of installBridgeGame: download, shim, redists. */
export async function installBridgeGameLeased(
  steamGame: SteamGame,
  args: InstallArgs,
  bridgeBottleName: string,
  installEngine: NonCrossoverEngine | 'crossover' | null,
  signal?: AbortSignal
): Promise<InstallResult> {
  // 59-REVIEW CR-01: synchronous with the depot run's controller
  // registration, so a cancel cannot fall in between.
  if (signal?.aborted) {
    sendGameStatusUpdate({
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
    return { status: 'abort' }
  }
  // a new install must show finishing again (quick 261031-ihs)
  pollState.clearBridgeInstallFinalized(steamGame.appId)
  const targetSteamappsDir = bottle.getBottleSteamappsDir(bridgeBottleName)
  const downloadResult = await installDepotDownload(steamGame, args, {
    targetSteamappsDirOverride: targetSteamappsDir,
    os: 'windows',
    pollerSource: 'bridge',
    signal
  })

  // A refusal wrapped by the go-offline step, or (quick 261027-tot) a
  // Steam client that is not installed / never launched, reports `done`
  // with deferredToSetup: a dialog owns the next step, nothing was
  // downloaded, and it is not a bridge failure.
  if (downloadResult.deferredToSetup) return downloadResult

  // 59-REVIEW CR-02: a user cancel is not a bridge failure; marking it would
  // route the reinstall to bottled Steam.
  if (downloadResult.status === 'abort') return downloadResult

  if (downloadResult.status !== 'done') {
    markBridgeFailedThisSession(steamGame.appId)
    return downloadResult
  }

  // R3: place the shim automatically — no manual copy step. Resolves the
  // real installed exe path via resolveBridgeLaunchExe (finding #2)
  // rather than guessing/joining an unverified name.
  const exePath = await resolveBridgeLaunchExe(steamGame.appId)
  if (!exePath) {
    logWarning(
      `SteamGame: installBridgeGame could not resolve a Windows launch executable for appId ${steamGame.appId} — shim not placed`,
      LogPrefix.Steam
    )
    markBridgeFailedThisSession(steamGame.appId)
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'launch-exe-not-resolved',
      fallbackAvailable: true,
      ...(args.steamForceWindowsViaBottle === true
        ? { forceWindowsViaBottle: true as const }
        : {})
    })
    return {
      status: 'error',
      error: `Could not resolve a Windows launch executable for appId ${steamGame.appId}`
    }
  }

  const shimResult = await placeShimForGame(steamGame.appId, exePath, {
    bottleName: bridgeBottleName,
    gameInstallRoot:
      resolveBridgeGameInstallRoot(steamGame, exePath, bridgeBottleName) ??
      undefined
  })
  // Phase 51 Plan 07 (fix during integration, Rule 1): placeShimForGame
  // returns typed statuses rather than throwing. 'no-steam-api' is
  // deliberately NOT a failure here -- nothing needed placing. Amended
  // 2026-10-23 (quick 261023-oq7, user: "Place shim anyway"): a coverage
  // miss is 'placed-miss' -- the shim WAS placed -- and falls through to
  // the success path below (verdict persisted, install completes). It is
  // no longer a failure here.
  if (shimResult.status === 'error' || shimResult.status === 'shim-not-built') {
    const shimError =
      shimResult.status === 'shim-not-built'
        ? 'Bridge shim has not been built yet (packaging step pending)'
        : shimResult.error
    logWarning(
      `SteamGame: installBridgeGame shim placement failed for appId ${steamGame.appId}: ${shimError}`,
      LogPrefix.Steam
    )

    // Phase 51 Plan 09 (D-51-05/D-51-11), Task 3: a win64 'shim-not-built'
    // (no 64-bit shim was ever built to try) is a dead end for the bits
    // already downloaded into the per-game bridge bottle -- re-download
    // through the proven Phase 17 bottled path is the chosen fallback
    // (D-51-05: move, not re-download, was rejected), so the per-game
    // bottle is deleted rather than left holding orphaned bits a later
    // retry would never reuse. Amended 2026-10-23 (quick 261023-oq7):
    // this applies to win64-no-shim ONLY; an import-scan miss no longer
    // takes this path. A plain 'shim-not-built' with no x64 arch
    // (packaging step pending) and a bare 'error' keep the pre-51-09
    // behavior below unchanged.
    const isWin64NoShim =
      shimResult.status === 'shim-not-built' && shimResult.arch === 'x64'
    if (isWin64NoShim) {
      const missingSymbols = ['steam_api64.dll']
      // The forced "Try the bridge anyway" attempt (D-51-11) is spent --
      // clearing userRoute lets a later install() fall through to its
      // ordinary route instead of re-forcing the bridge into the same
      // dead end.
      setBridgeUserRoute(steamGame.appId, undefined)
      // 51-REVIEW WR-07: persist the arch so the resolver's win64-no-shim
      // row short-circuits the next install(). Without it the session-only
      // circuit breaker is the sole memory of this dead end, and every new
      // session re-downloads the full game into a bridge bottle only to
      // delete it again. The row is gated on win64ShimPresent, so a later
      // build that bundles steam_api64.dll is not held back by this.
      setBridgeSteamApiPrescreen(steamGame.appId, 'x64')
      stopInstallPolling(steamGame.appId)
      const removeResult = await bbLifecycle.removePerGameBridgeBottle(
        steamGame.appId
      )
      if (removeResult.status === 'error') {
        logWarning(
          `SteamGame: installBridgeGame could not remove the per-game bridge bottle for appId ${steamGame.appId} after a win64-no-shim: ${removeResult.error}`,
          LogPrefix.Steam
        )
      }
      markBridgeFailedThisSession(steamGame.appId)
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: steamGame.appId,
        reason: 'win64-no-shim',
        missingSymbols,
        fallbackAvailable: true,
        ...(args.steamForceWindowsViaBottle === true
          ? { forceWindowsViaBottle: true as const }
          : {})
      })
      return { status: 'error', error: shimError }
    }

    markBridgeFailedThisSession(steamGame.appId)
    return { status: 'error', error: shimError }
  }

  // Phase 51 Plan 09 (D-51-06/D-51-07), Task 3: persist the scan verdict
  // produced by THIS placement for every status that carries one --
  // 'placed' and 'no-steam-api' both do, 'already-placed' (a byte-
  // identical no-op) does not and leaves whatever was already persisted
  // untouched, mirroring launchBridgeGame()'s identical truthy check.
  // 'placed-miss' (quick 261023-oq7) also carries one: the miss verdict is
  // persisted so the resolver keeps routing the title with its symbols. The
  // user's explicit 'bridge' choice (D-51-11) is NOT cleared here -- that
  // clear existed so a forced bridge would not be re-forced into a failing
  // miss, and a miss is no longer a failure.
  if (shimResult.verdict) {
    writeBridgeScanVerdict(steamGame.appId, shimResult.verdict)
  }

  // Quick 261024-br4: Steam CEG DRM (XCOM 200510's silent ~30s exit). A
  // CEG exe asks the Windows Steam client for a per-user build key, and a
  // bridge bottle has no Windows Steam client -- so it can never run here.
  // DRM is the one justified route into bottled Steam (a narrow fallback).
  // Mirrors the win64-no-shim dead end above: the downloaded bits are
  // orphaned (D-51-05: the fallback re-downloads, nothing is moved), so
  // the per-game bridge bottle is removed. userRoute is NOT cleared: by
  // construction it is not 'bridge' here, and a forced 'bridge' proceeds.
  const cegMarkers = persistBridgeDrmSignal(
    steamGame,
    shimResult.drm,
    'installBridgeGame'
  )
  if (cegMarkers) {
    logWarning(
      `SteamGame: installBridgeGame found Steam CEG DRM in the exe for appId ${steamGame.appId} (${cegMarkers.join(', ')}) -- CEG needs the Windows Steam client, which a bridge bottle does not have; stopping the bridge install`,
      LogPrefix.Steam
    )
    stopInstallPolling(steamGame.appId)
    const removeResult = await bbLifecycle.removePerGameBridgeBottle(
      steamGame.appId
    )
    if (removeResult.status === 'error') {
      logWarning(
        `SteamGame: installBridgeGame could not remove the per-game bridge bottle for appId ${steamGame.appId} after detecting Steam CEG DRM: ${removeResult.error}`,
        LogPrefix.Steam
      )
    }
    markBridgeFailedThisSession(steamGame.appId)
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'drm-wrapped',
      fallbackAvailable: true,
      ...(args.steamForceWindowsViaBottle === true
        ? { forceWindowsViaBottle: true as const }
        : {})
    })
    return {
      status: 'error',
      error: `Steam CEG DRM detected (${cegMarkers.join(', ')}): this game needs the Windows Steam client`
    }
  }

  if (shimResult.status === 'placed-miss') {
    logWarning(
      `SteamGame: installBridgeGame shim coverage miss for appId ${steamGame.appId}: ${shimResult.verdict.missingSymbols.join(', ')} -- shim placed anyway; a static-import miss is expected to fail at load with a Windows entry-point error`,
      LogPrefix.Steam
    )
  }
  reconcileBridgePrescreen(steamGame, shimResult)

  // 24-13 (D-UAT-24-05 wiring, was Rule-2 deviation during Task 3): the
  // `pollerSource: 'bridge'` passed to installDepotDownload above starts a
  // poller that watches the BRIDGE bottle's OWN steamapps root
  // (library.ts's AcfSource now includes 'bridge', 24-12's
  // getBridgeBottleSteamappsRoot()) — previously this was hardcoded to
  // `'bottle'`, which watches the unrelated Phase 17 GameLibSteam bottle
  // and NEVER observes this appId's manifest, so the install would time
  // out / never be reflected. The poller reading the correct bottle is
  // now a genuine (if redundant) completion signal, not dead weight — but
  // the REAL completion signal for the bridge path remains this
  // synchronous flip below: depot download AND shim placement have
  // already both succeeded by this point, so is_installed is set directly
  // (mirrors library.ts's pollInstallOnce() 'installed' branch shape)
  // rather than relying solely on the poller.
  const installRoot = resolveBridgeGameInstallRoot(
    steamGame,
    exePath,
    bridgeBottleName
  )
  if (installRoot) {
    markBridgeGameInstalled(steamGame, installRoot)
  }

  // D-UAT-24-03 cascade (a): a successful (re)install un-poisons the
  // session so a subsequent isBridgeEligible() check (install OR launch)
  // for this appId routes back to the bridge instead of staying stuck on
  // an earlier recoverable failure.
  clearBridgeFailedThisSession(steamGame.appId)

  // Plan 05 decision: the Steamworks shared redists download under THIS
  // install's logon, so Play never needs one. Never fails the install.
  const { installSteamBridgeSharedRedists } =
    await import('./bridge/sharedRedistInstall')
  // The download queue suppresses Steam's own 'done', and on the bridge the
  // ACF poller leaves completion to this method (quick 261029-exu) and stays
  // silent once this method has marked the install finalized (261031-ihs), so the
  // final update below is the only status that clears a lingering 'redist'
  // or 'drm-setup' (56-16 Gap 3) and ends the "finishing" state.
  const sendFinishing = () =>
    sendGameStatusUpdate({
      appName: steamGame.appId,
      runner: 'steam',
      status: 'installing',
      context: pollState.STEAM_BRIDGE_FINISHING_CONTEXT
    })
  sendFinishing()
  try {
    // 59-REVIEW CR-02, D-01/D-04: the redists run on the engine that owns
    // the bottle, never stock CrossOver on a built-in-engine bottle.
    const redistEngine = await resolveInstallEngineSettings(
      steamGame,
      bridgeBottleName,
      installEngine
    ).catch((error: unknown) => ({ skipped: String(error) }))
    if ('skipped' in redistEngine) {
      logWarning(
        `SteamGame: appId ${steamGame.appId} install-time shared redists skipped: no usable engine (${redistEngine.skipped})`,
        LogPrefix.Steam
      )
    } else {
      await installSteamBridgeSharedRedists(
        steamGame.appId,
        redistEngine.settings,
        undefined,
        { allowLogon: true }
      ).catch((error: unknown) => {
        logWarning(
          `SteamGame: install-time shared redist step failed for appId ${steamGame.appId}: ${String(error)}`,
          LogPrefix.Steam
        )
      })
    }
    // Quick 261029-e2t: fetch DRM mode's runner and Valve client now, so
    // the first Play only stages the bottle. Never fails the install.
    sendFinishing()
    await steamGame
      .prefetchBridgeDrmDownloads(exePath, bridgeBottleName)
      .catch((error: unknown) => {
        logWarning(
          `SteamGame: install-time DRM prefetch failed for appId ${steamGame.appId}: ${String(error)}`,
          LogPrefix.Steam
        )
      })
  } finally {
    pollState.markBridgeInstallFinalized(steamGame.appId)
    sendGameStatusUpdate({
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
    // GAME-02's one completion toast; the bridge poller skips it.
    notify({
      title: steamGame.getGameInfo().title,
      body: i18next.t('notify.install.finished', 'Installation Finished')
    })
  }

  return { status: 'done' }
}
