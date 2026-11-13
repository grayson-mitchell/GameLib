/**
 * Native depot-download engine lifted out of gameInstall (65-11, D-12 step 4).
 * Leaf of the install cluster: takes `steamGame`, references SteamGame only
 * via `import type`.
 */
import { dirname, join } from 'node:path'
import { InstallArgs } from 'common/types'
import { InstallResult } from 'common/types/game_manager'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { startInstallPolling } from './library/installPolling'
import * as resumeBreadcrumbs from './library/resumeBreadcrumbs'
import { readInstalledAtStart } from './library/manifestFlags'
import * as adoption from './macSteamAdoption'
import type { AuthSessionRefusal } from './userTypes'
import { downloadSteamDepots } from './depot'
import { ensureSteamClientReady } from './clientSetup'
import {
  resolveSteamInstallTarget,
  UnsafeInstalldirError
} from './installLocation'
import { isSteamExperimentalInstallAppEnabled } from './experimentalInstallAppSetting'
import {
  createSteamInstallAppRun,
  requestSteamInstallApp
} from './steamInstallApp'
import { classifyDepotError } from './depotErrors'
import { withTimeout, STEAM_PICS_TIMEOUT_MS } from './withTimeout'
import { hostSteamDepotOs } from './gameRequirements'
import * as bottle from './bottle'
import type SteamGame from './games'

/**
 * Shared depot-download engine for both installNative() (native, opt-in ON,
 * non-bottle-eligible) and installBottleNative() (D-15, opt-in ON,
 * bottle-eligible). Calls the Plan 10 (ensureSteamClientReady) and Plan 09
 * (resolveSteamInstallTarget) seams — the SAME authenticated-CM-connection
 * check and PICS-derived installdir resolution both paths need — then hands
 * off to depot.ts's downloadSteamDepots orchestrator (Plan 04-06) with the
 * caller-selected write target/os. `targetSteamappsDirOverride` replaces
 * resolveSteamInstallTarget's own (native-library) targetSteamappsDir when
 * present — the bottle path discards that native-library resolution
 * entirely and reuses only the PICS-derived `installdir`; `pollerSource`
 * lets the bottle path reuse the bottle-scoped ACF poller (Plan 08) while
 * leaving the native path's `startInstallPolling(appId)` call signature
 * byte-for-byte unchanged.
 *
 * Maps downloadSteamDepots's NEVER-throwing { status, error? } outcome onto
 * InstallResult using the SAME conventions gog/legendary's own install()
 * functions already use — 'done' -> success, 'error' -> the outcome's
 * already-classified (Plan 06 classifyDepotError) message so the
 * DownloadManager queue's EXISTING generic error+Retry surface renders it
 * (D-06/D-07 reuse, no steam-specific UI, downloadqueue.ts untouched),
 * 'cancelled' -> the abort-shaped result other runners return on user
 * cancel (not an error).
 *
 * Registers this.appId in nativeInstallsInFlight + a real AbortController
 * (D-02) for the duration of the download so stop() can abort it — for
 * EITHER path — released in the finally regardless of outcome.
 *
 * D-UAT-05 fix: registration happens FIRST, before either seam await
 * (ensureSteamClientReady/resolveSteamInstallTarget) — previously it only
 * happened after both had resolved, so a stop()/cancel() issued while
 * either was still pending saw nativeInstallsInFlight.has(appId) === false
 * and hit the historic no-op branch (observed in the field as "SteamGame.stop:
 * Steam owns process lifecycle ...; no-op"). Registering synchronously up
 * front closes that window entirely; the two `controller.signal.aborted`
 * checks below make a cancel issued DURING either seam await still abort
 * the install promptly instead of silently continuing to downloadSteamDepots.
 *
 * T-23-12 single-flight guard: if a LIVE entry already exists for
 * this.appId, join it — return its stored promise instead of starting a
 * second downloadSteamDepots (the Gate 1 progress-percent flip-flop root
 * cause was exactly two concurrent runs each emitting progress against
 * their own doneBytes). The guard check + registration below happen
 * synchronously before runNativeDepotDownload's first real await, so the
 * D-UAT-05 property (stop() issued during either seam await still finds
 * the appId registered) is preserved.
 *
 * T-23-15 pause/resume abort-before-restart: an existing entry whose
 * `aborted` flag is true (stop() was called) is TEARING DOWN, not live —
 * joining it would return an aborted result to a caller expecting a fresh
 * install. Instead, await its settlement first (guaranteeing its `finally`
 * cleanup has run) before starting a brand-new run, so the prior and the
 * resumed run never overlap (no stacking).
 */
export async function installDepotDownload(
  steamGame: SteamGame,
  args: InstallArgs,
  opts: {
    targetSteamappsDirOverride?: string
    os: string
    pollerSource?: 'bottle' | 'bridge'
    signal?: AbortSignal
  }
): Promise<InstallResult> {
  const existing =
    steamGame.deps.steamSession.gameSession.nativeInstallsInFlight.get(
      steamGame.appId
    )
  if (existing) {
    if (!existing.aborted) {
      // T-23-12: a LIVE download is already tracked for this appId — join
      // it rather than starting a second downloadSteamDepots.
      return existing.promise
    }
    // T-23-15: the tracked entry is tearing down after a pause/cancel —
    // wait for it to settle (its finally cleanup deletes the entry) before
    // proceeding to a fresh run below. Never rejects here: the prior run's
    // own rejection (if any) is not this caller's concern.
    await existing.promise.catch(() => undefined)
    // 59-REVIEW WR-03: a cancel that landed during the wait must stop here.
    if (opts.signal?.aborted) return { status: 'abort' }
  }
  if (opts.signal?.aborted) return { status: 'abort' }

  const runPromise = runNativeDepotDownload(steamGame, args, opts)
  steamGame.deps.steamSession.gameSession.nativeInstallsInFlight.set(
    steamGame.appId,
    {
      promise: runPromise,
      aborted: false
    }
  )
  return runPromise
}

export async function installNative(
  steamGame: SteamGame,
  args: InstallArgs
): Promise<InstallResult> {
  return installDepotDownload(steamGame, args, { os: hostSteamDepotOs() })
}

export async function installBottleNative(
  steamGame: SteamGame,
  args: InstallArgs
): Promise<InstallResult> {
  const targetSteamappsDir = bottle.getBottleSteamappsDir(
    steamGame.deps.paths,
    steamGame.deps.steamBottle.getSteamBottleSettings().wineCrossoverBottle
  )
  return installDepotDownload(steamGame, args, {
    targetSteamappsDirOverride: targetSteamappsDir,
    os: 'windows',
    pollerSource: 'bottle'
  })
}

/**
 * The actual native depot-download run — split out of installDepotDownload
 * (T-23-12) so its promise can be registered in nativeInstallsInFlight
 * BEFORE its first await, letting a concurrent caller for the same appId
 * join the SAME promise instead of starting a second downloadSteamDepots.
 * Body/contract unchanged from the pre-Phase-23-05 installDepotDownload.
 */
export async function runNativeDepotDownload(
  steamGame: SteamGame,
  args: InstallArgs,
  opts: {
    targetSteamappsDirOverride?: string
    os: string
    pollerSource?: 'bottle' | 'bridge'
    signal?: AbortSignal
  }
): Promise<InstallResult> {
  // 59-REVIEW WR-03: never register a fresh controller for a cancelled
  // install; nothing is registered, so no finally runs.
  if (opts.signal?.aborted) return { status: 'abort' }
  const controller = steamGame.deps.aborts.create(steamGame.appId)
  // [Timing] debug/steam-install-slow-start: top-level breakdown of the
  // ~30s pre-download latency across this seam's three major awaits.
  // Temporary instrumentation, remove once root cause is confirmed.
  const runStart = Date.now()

  try {
    const clientReadyStart = Date.now()
    const clientReady = await ensureSteamClientReady(
      steamGame.deps,
      steamGame.appId
    ) // Plan 10
    logInfo(
      `[Timing] runNativeDepotDownload: ensureSteamClientReady took ${Date.now() - clientReadyStart}ms for appId ${steamGame.appId}`,
      LogPrefix.Steam
    )
    if (controller.signal.aborted) {
      return { status: 'abort' }
    }
    if (!clientReady.ready) {
      // quick 261027-tot: a missing / never-launched Steam client is a
      // precondition, not a failure. ensureSteamClientReady already sent
      // steamClientSetupRequired, so the guided-setup consent UI is up.
      // Defer (same contract as the bottle-not-provisioned diversion,
      // 261024-cjq) so the queue records no finished-error entry and no
      // "Installation Failed" dialog covers that UI. A reported `error`
      // (e.g. a non-numeric appId, T-21-05) is a real error and stays one.
      if (
        clientReady.error === undefined &&
        (clientReady.status === 'needs-install' ||
          clientReady.status === 'needs-launch')
      ) {
        logInfo(
          `SteamGame: appId ${steamGame.appId} Steam client not ready (${clientReady.status}) — guided setup requested, deferring install`,
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

    // Filled by runNativeDepotDownloadLeased on the native Mac route only.
    const deferredPoll: {
      handoff?: { manifestPath: string; skippedDepots: string[] }
    } = {}
    // Phase 54: one authenticated lease for the whole install run, taken
    // BEFORE resolveSteamInstallTarget (so the installdir fallback sees an
    // open session for gated apps) and BEFORE the crash breadcrumb (so a
    // refused install leaves no residue record). Released in finally on
    // every exit path, including abort.
    const lease = await steamGame.deps.steamUser.acquireAuthenticated({
      reason: 'user-install',
      guidedAction: 'install',
      appName: steamGame.appId,
      installPath: args.path,
      forceWindowsViaBottle: args.steamForceWindowsViaBottle
    })
    if (!lease.ok) {
      return installResultForRefusal(steamGame, lease.reason)
    }
    let leasedResult: InstallResult
    try {
      leasedResult = await runNativeDepotDownloadLeased(
        steamGame,
        args,
        opts,
        controller,
        runStart,
        deferredPoll
      )
    } finally {
      lease.release()
    }

    // Quick 261029-ji2: native Mac route. `steam://install` only opens
    // Steam's install dialog (needs a click), so it is no longer fired.
    // A RUNNING Mac Steam never notices the ACF GameLib wrote, but a Steam
    // that starts afterwards adopts it. If Steam is running now, remember
    // its PID so Play can restart it once (macSteamAdoption.ts); if not, the
    // next Steam start adopts it and any stale record is dropped. This is
    // the ONLY place a pending-adoption record is written: GameLib's own
    // depot download finished here (the lease is released first so the
    // go-offline wrap is restored). Steam-performed installs (steam-client,
    // bottle, bridge, pollerSource) never reach this branch.
    // quick 261105-ord: with the experimental InstallApp setting ON, a
    // running Steam is first asked to adopt the install directly; only a
    // non-ok outcome falls through to the record below.
    // An ok adoption also tells the poller Steam already knows the install,
    // so no D-UAT-13 restart hold arms (quick 261105-sqe).
    if (deferredPoll.handoff && leasedResult.status === 'done') {
      const handoff = deferredPoll.handoff
      const pid = await adoption
        .probeMacSteamPid({ runner: steamGame.deps.runner })
        .catch(() => null)
      let adoptedByInstallApp = false
      if (
        pid !== null &&
        isSteamExperimentalInstallAppEnabled(steamGame.deps.config)
      ) {
        const outcome = await requestSteamInstallApp(
          steamGame.appId,
          { libraryPath: dirname(dirname(handoff.manifestPath)) },
          {
            paths: steamGame.deps.paths,
            run: createSteamInstallAppRun({ runner: steamGame.deps.runner })
          }
        )
        if (outcome.kind === 'ok') {
          adoptedByInstallApp = true
          adoption.clearPendingAdoption(
            steamGame.appId,
            adoption.pendingAdoptionStoreFrom(steamGame.deps)
          )
          logInfo(
            `SteamGame: Steam adopted appId ${steamGame.appId} via InstallApp without a restart`,
            LogPrefix.Steam
          )
        } else {
          logWarning(
            `SteamGame: InstallApp adoption of ${steamGame.appId} not used (${
              outcome.kind === 'error'
                ? `EAppUpdateError ${outcome.code}`
                : outcome.reason
            }) — recording restart-on-Play instead`,
            LogPrefix.Steam
          )
        }
      }
      if (adoptedByInstallApp) {
        // Steam already knows the install; nothing to record.
      } else if (pid !== null) {
        const baseline = await adoption.readAcfSnapshot(
          steamGame.deps,
          handoff.manifestPath
        )
        if (baseline) {
          adoption.recordPendingAdoption(
            steamGame.appId,
            {
              steamPid: pid,
              manifestPath: handoff.manifestPath,
              baseline,
              recordedAt: Date.now()
            },
            adoption.pendingAdoptionStoreFrom(steamGame.deps)
          )
          logInfo(
            `SteamGame: recorded pending Steam adoption for ${steamGame.appId} (steam_osx pid ${pid})`,
            LogPrefix.Steam
          )
        } else {
          logWarning(
            `SteamGame: no manifest at ${handoff.manifestPath}; not recording pending adoption for ${steamGame.appId}`,
            LogPrefix.Steam
          )
        }
      } else {
        adoption.clearPendingAdoption(
          steamGame.appId,
          adoption.pendingAdoptionStoreFrom(steamGame.deps)
        )
      }
      startInstallPolling(steamGame.deps, steamGame.appId, {
        isNativeHandoff: true,
        skippedDepots: handoff.skippedDepots,
        macNativeRoute: true,
        ...(adoptedByInstallApp ? { adoptedBySteamClient: true } : {})
      })
    }
    return leasedResult
  } finally {
    // T-23-13: fail-safe cleanup on success, error, or cancel (including an
    // unhandled throw/rejection) — never leaves this appId permanently
    // blocked from a later re-install.
    steamGame.deps.steamSession.gameSession.nativeInstallsInFlight.delete(
      steamGame.appId
    )
    // 59-REVIEW WR-02: a newer install may have registered its own
    // provisioning controller during this run's teardown; remove only ours.
    if (
      steamGame.deps.aborts.getSignal(steamGame.appId) === controller.signal
    ) {
      steamGame.deps.aborts.delete(steamGame.appId)
    }
  }
}

/**
 * Phase 54: maps a refused authenticated acquire to an install result. A
 * go-offline refusal means the guided dialog owns the next step (the install
 * did not fail), so it returns the same deferredToSetup contract the bridge
 * route notice uses. Every other refusal carries the fixed not-signed-in copy.
 */
export function installResultForRefusal(
  steamGame: SteamGame,
  reason: AuthSessionRefusal
): InstallResult {
  if (reason === 'go-offline-required') {
    logInfo(
      `SteamGame: appId ${steamGame.appId} install waiting on the guided Go Offline step, no logon issued`,
      LogPrefix.Steam
    )
    return { status: 'done', deferredToSetup: true }
  }
  logWarning(
    `SteamGame: appId ${steamGame.appId} install refused, no authenticated Steam session (${reason})`,
    LogPrefix.Steam
  )
  return {
    status: 'error',
    error: classifyDepotError(
      new Error(
        `downloadSteamDepots: no authenticated Steam CM connection available for appId ${steamGame.appId}`
      )
    ).message
  }
}

/**
 * The body of runNativeDepotDownload that needs the authenticated lease:
 * target resolution, crash breadcrumb, depot download, polling. The caller
 * owns the lease and the in-flight registry cleanup.
 */
export async function runNativeDepotDownloadLeased(
  steamGame: SteamGame,
  args: InstallArgs,
  opts: {
    targetSteamappsDirOverride?: string
    os: string
    pollerSource?: 'bottle' | 'bridge'
  },
  controller: AbortController,
  runStart: number,
  deferredPoll: {
    handoff?: { manifestPath: string; skippedDepots: string[] }
  }
): Promise<InstallResult> {
  const resolveTargetStart = Date.now()
  let resolved: Awaited<ReturnType<typeof resolveSteamInstallTarget>>
  try {
    // G-30-02 (30-07): belt-and-suspenders bound around the pre-download
    // resolution PHASE itself — guards against a future un-timed
    // pre-download await that is NOT a CM primitive (those are already
    // bounded individually inside resolveSteamInstallTarget/depot.ts),
    // and guarantees the badge can never hang from this phase. Converted
    // to the returned-error contract 30-05's finally/catch already
    // clears — never let this propagate as an unhandled throw.
    //
    // WR-01: this outer bound is STRICTLY LARGER than any bound inside
    // resolveSteamInstallTarget (fetchInstalldir's per-call
    // STEAM_PICS_TIMEOUT_MS). If it shared the same bound, this outer
    // timer — armed first — would always elapse before fetchInstalldir's
    // inner timer, pre-empting fetchInstalldir's DELIBERATE no-hard-fail
    // fallback (installLocation.ts:130-188: a hung installdir lookup must
    // degrade to a safe fallback dir name, NOT fail the whole install)
    // and converting a recoverable transient CM hang into a fatal
    // "Steam pre-download timed out". A larger outer bound lets the inner
    // graceful fallback always win its own race; the outer only trips on a
    // non-CM await (the belt-and-suspenders case it exists for).
    resolved = await withTimeout(
      resolveSteamInstallTarget(steamGame.deps, steamGame.appId, args), // Plan 09
      STEAM_PICS_TIMEOUT_MS * 2,
      'resolveSteamInstallTarget'
    )
  } catch (err) {
    // T-37-01/T-37-03: an UnsafeInstalldirError is a security abort, not
    // a timeout/CM failure — checked FIRST so it never gets mislabeled
    // "timed out".
    //
    // 37-REVIEW C-01: this path must call `classifyDepotError` ITSELF.
    // The abort is raised by `resolveSteamInstallTarget`, i.e. BEFORE the
    // depot download starts, so it never reaches depot.ts's classifier
    // call sites. Returning `err.message` directly leaked the raw,
    // untrusted PICS-sourced installdir candidate into the install-failure
    // dialog. The raw candidate must surface ONLY in the log line below.
    if (err instanceof UnsafeInstalldirError) {
      logWarning(
        `SteamGame: rejected unsafe PICS installdir for appId ${steamGame.appId}: ${err.message}`,
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: classifyDepotError(err).message
      }
    }
    logWarning(
      `SteamGame: resolveSteamInstallTarget timed out/failed for appId ${steamGame.appId}: ${String(err)}`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `Steam pre-download timed out: ${String(err)}`
    }
  }
  logInfo(
    `[Timing] runNativeDepotDownload: resolveSteamInstallTarget took ${Date.now() - resolveTargetStart}ms for appId ${steamGame.appId}`,
    LogPrefix.Steam
  )
  // D-04 (second half): not an error — PICS returned no usable
  // installdir, so resolveSteamInstallTarget already fell back to
  // `app_<id>`. Logged once here (rather than left to silently
  // disappear after this seam) and propagated onto the { status: 'done' }
  // result below so a caller/UI can surface the non-portable layout.
  if (resolved.installdirFallbackUsed) {
    logWarning(
      `SteamGame: appId ${steamGame.appId} installed to fallback directory "${resolved.installdir}" (PICS installdir was absent/unresolved)`,
      LogPrefix.Steam
    )
  }
  if (controller.signal.aborted) {
    return { status: 'abort' }
  }
  const targetSteamappsDir =
    opts.targetSteamappsDirOverride ?? resolved.targetSteamappsDir

  // 260821-rb5: persist a crash-surviving breadcrumb BEFORE the
  // downloadSteamDepots await below — this ordering IS the fix. A hard
  // kill (kill -9, crash, power loss) from this point on runs no JS at
  // all, so no appmanifest_*.acf is ever written (case C of
  // .planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md);
  // this breadcrumb is the ONLY record of the residue that survives.
  // Must stay synchronous and above the await.
  //
  // Todo 2026-11-09: also capture whether the title was ALREADY installed
  // (StateFlags & 4, any installed state) so cancel-delete can refuse after a
  // cancelled finalize has downgraded the manifest to 1026.
  // WR-07 (75 review): an unparseable or unreadable manifest counts as
  // installed here, so a damaged complete install is never cancel-deleted.
  const installedAtStart = await readInstalledAtStart(
    steamGame.deps,
    targetSteamappsDir,
    steamGame.appId
  )
  if (installedAtStart) {
    logInfo(
      `SteamGame: appId ${steamGame.appId} was already installed when the job started; cancel-delete will refuse`,
      LogPrefix.Steam
    )
  }
  resumeBreadcrumbs.markSteamNativeInstallStarted(
    steamGame.deps,
    steamGame.appId,
    {
      targetSteamappsDir,
      installdir: resolved.installdir,
      installedAtStart
    }
  )

  const downloadStart = Date.now()
  const outcome = await downloadSteamDepots(steamGame.appId, {
    installRuntime: steamGame.deps.steamInstallRuntime,
    steamUser: steamGame.deps.steamUser,
    config: steamGame.deps.config,
    targetSteamappsDir,
    installdir: resolved.installdir,
    os: opts.os,
    signal: controller.signal
  })
  logInfo(
    `[Timing] runNativeDepotDownload: downloadSteamDepots (buildDepotPlan + stream) took ${Date.now() - downloadStart}ms so far for appId ${steamGame.appId} (status=${outcome.status}); total since click ${Date.now() - runStart}ms`,
    LogPrefix.Steam
  )

  if (outcome.status === 'cancelled') {
    // D-UAT-09 (21-17): init()'s startup-surface scan only catches an
    // interrupted install on the NEXT process restart — a same-session
    // cancel (this branch) is never surfaced any other way. Mark the
    // library entry incomplete/resumable now so the frontend never
    // renders a stale is_installed:true/Play for the rest of THIS
    // session (Task 2 reads is_installed + steamResumePending).
    resumeBreadcrumbs.markSteamInstallIncomplete(
      steamGame.deps,
      steamGame.appId
    )
    return { status: 'abort' }
  }

  if (outcome.status === 'error') {
    logWarning(
      `SteamGame: depot install failed for appId ${steamGame.appId}: ${outcome.error}`,
      LogPrefix.Steam
    )
    // 37-02 (D-06/D-07): forward the classifier's structured affordance
    // untouched — never re-classify here. The pre-download error returns
    // above (clientReady.error, the resolve-target catch) deliberately
    // carry no errorAction: undefined means "no specific affordance".
    return {
      status: 'error',
      error: outcome.error,
      errorAction: outcome.errorAction
    }
  }

  // 260821-rb5: downloadSteamDepots has finished and written its own
  // manifest at this point, so the ACF-derived path
  // (scanDownloadingAppIds) now covers this appId — the breadcrumb has
  // served its purpose, and keeping it would double-surface. Clear it
  // BEFORE polling starts. The 'cancelled' and 'error' branches above
  // deliberately do NOT clear it — a cancelled or errored run leaves
  // residue too (markSteamInstallIncomplete's 'cancelled' spread
  // already preserves the breadcrumb fields).
  resumeBreadcrumbs.clearSteamResumeBreadcrumb(steamGame.deps, steamGame.appId)

  // Start ACF polling so Steam's own verify/repair pass (which flips
  // StateFlags 1026 -> 4) is reflected in the UI, same as the legacy
  // steam://install path (D-07) — bottle-scoped when pollerSource is set
  // (Plan 08's distinct bottle steamapps root, D-15).
  //
  // debug/steam-1026-download-restart: isNativeHandoff:true is CORRECT
  // (and ONLY correct) here — this line only runs after downloadSteamDepots
  // has ALREADY finished downloading every depot itself (outcome.status
  // ran past the 'error'/'cancelled' checks above). The 1026 manifest this
  // poll will observe is GameLib's OWN finished-handoff write, genuinely
  // waiting for a Steam restart — never a Steam-driven active download.
  // Do NOT copy this flag to the OFF-path startInstallPolling calls above
  // in install() (the steam://install handoff) —
  // that hands the ENTIRE download off to Steam, so a 1026 seen there is
  // Steam's own ordinary active-download state, not a handoff.
  //
  // 23.2-04 (D-06/D-07): thread outcome.skippedDepots through the same
  // way, and for the same reason — meaningful only on the native path,
  // because it comes from GameLib's own downloadSteamDepots run above.
  // The OFF-path calls in install() have no skipped-depot knowledge
  // (Steam owns those downloads) and must NOT receive it.
  if (opts.pollerSource) {
    startInstallPolling(steamGame.deps, steamGame.appId, {
      source: opts.pollerSource,
      isNativeHandoff: true,
      skippedDepots: outcome.skippedDepots ?? []
    })
  } else if (isMac) {
    // Quick 261029-ji2: native Mac route. The poll starts in the caller
    // after the Steam PID is recorded (runNativeDepotDownload).
    deferredPoll.handoff = {
      manifestPath: join(
        targetSteamappsDir,
        `appmanifest_${steamGame.appId}.acf`
      ),
      skippedDepots: outcome.skippedDepots ?? []
    }
  } else {
    startInstallPolling(steamGame.deps, steamGame.appId, {
      isNativeHandoff: true,
      skippedDepots: outcome.skippedDepots ?? []
    })
  }

  return {
    status: 'done',
    ...(resolved.installdirFallbackUsed
      ? { installdirFallbackUsed: true as const }
      : {})
  }
}
