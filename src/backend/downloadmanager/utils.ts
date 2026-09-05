import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import {
  downloadFile,
  isEpicServiceOffline,
  sendGameStatusUpdate
} from '../utils'
import {
  callAbortController,
  hasAbortController
} from 'backend/utils/aborthandler/aborthandler'
import { ButtonOptions, DMStatus, InstallParams, Runner } from 'common/types'
import { InstallResult, InstallErrorAction } from 'common/types/game_manager'
import i18next from 'i18next'
import { notify, showDialogBoxModalAuto } from '../dialog/dialog'
import { isOnline } from '../online_monitor'
import pathModule from 'path'
import { existsSync, mkdirSync, rmSync } from 'graceful-fs'
import { storeMap } from 'common/utils'
import { gogdlConfigPath } from 'backend/storeManagers/gog/constants'
import { fixesPath } from 'backend/constants/paths'
import { isTimeoutError } from 'backend/storeManagers/steam/withTimeout'
import {
  withStallTimeout,
  isStallError,
  INSTALL_NO_PROGRESS_TIMEOUT_MS
} from 'backend/downloadmanager/installStallWatchdog'
import { resolveGameTitle } from 'backend/utils/gameTitle'

// Quick task 260905-mv5 (D-02): re-exported, unchanged name and signature,
// so this module's 3 existing jest.mock() callers (downloadqueue.test.ts,
// downloadQueueFlows.test.ts, utils.test.ts) keep working without
// modification. The implementation itself now lives in
// backend/utils/gameTitle.ts (a zero-runtime-import module) alongside its
// new Game-instance counterpart, resolveTitleForGame -- see that file's
// docstring for why the relocation was necessary (HAZARD B: this module
// imports FROM backend/utils.ts, so backend/utils.ts could not import
// resolveGameTitle back from here without closing a cycle).
export { resolveGameTitle }

// Type-only reference to the lazily-imported module below -- erased at
// compile time, so it does NOT reintroduce the downloadmanager/utils.ts <->
// storeManagers/index.ts circular dependency the runtime `await import(...)`
// calls in installQueueElement/updateQueueElement exist to break.
type LibraryManagerMap =
  typeof import('backend/storeManagers').libraryManagerMap

/**
 * 2026-08-22 (D-09, REQ-37-03): `SteamGame`'s game-info getter
 * (`storeManagers/steam/games.ts`) can return `{} as GameInfo` -- so
 * `title` is `undefined` -- when BOTH the in-memory `library` Map and the
 * persisted `steamLibraryStore` cache miss (an async-population race,
 * unique to Steam: Legendary's equivalent getter loads its manifest
 * SYNCHRONOUSLY when the library entry is missing, and both GOG's and
 * Legendary's getters additionally carry an explicit `title: ''`
 * fallback of their own; Steam has neither). Root cause tracked, not fixed,
 * by
 * `.planning/todos/pending/2026-08-22-steam-getgameinfo-returns-empty-on-async-cache-miss.md`.
 *
 * Falling back to `appName` (the raw Steam appid) is deliberately WORSE
 * copy than a real title, but strictly more useful than the empty string
 * this used to render as on the install-failure dialog -- "The
 * installation of  failed" with a gap where the name belonged. Both
 * `installQueueElement` and `updateQueueElement` funnel through this one
 * resolver so it is impossible to fix the fallback on one queue element and
 * leave the other with the raw, unguarded destructure.
 *
 * Quick task 260905-luf: this is now a thin wrapper around `resolveGameTitle`
 * (260905-mv5: re-exported above from `backend/utils/gameTitle.ts`, its new
 * home), so there is exactly ONE fallback chain for every DownloadManager
 * title consumer, not two independently-maintained ones. Behaviour here is
 * byte-identical to before (no `fallback` argument is passed) -- the
 * install-failure dialog this function feeds still resolves
 * `live.title || appName`, nothing more.
 */
function resolveQueueElementTitle(
  libraryManagerMap: LibraryManagerMap,
  runner: Runner,
  appName: string
): string {
  return resolveGameTitle(libraryManagerMap, runner, appName)
}

/**
 * 260817-dib: D-01b (33-01) was originally a belt-and-suspenders bound
 * around the WHOLE `.install()` await in `installQueueElement` -- a TOTAL
 * DURATION ceiling. For Steam that await includes the entire depot download,
 * so it was never a stall detector: it was a hard ceiling on total install
 * duration, killing any native Steam install slower than 8 minutes end to
 * end regardless of whether it was still making progress.
 *
 * `INSTALL_NO_PROGRESS_TIMEOUT_MS` (re-exported from
 * `installStallWatchdog.ts`, imported here for the doc comment's sake) is
 * the SAME 480_000ms value, re-semantified as a NO-PROGRESS window,
 * re-armed by `backendEvents`' `progressUpdate-${appName}` payloads. Only
 * the clock's MEANING changed:
 *
 *  - The window must still clear the summed pre-download bound -- 50s
 *    `resolveSteamInstallTarget` (STEAM_PICS_TIMEOUT_MS*2) + up to 90s×3
 *    `buildDepotPlan` retries (STEAM_PICS_BULK_TIMEOUT_MS *
 *    PLAN_BUILD_MAX_ATTEMPTS) = ~320s worst case, because the pre-download
 *    phase emits NO progress at all -- the initial (call-time) arming of
 *    the window still bounds it exactly as D-01b originally intended.
 *  - The value is deliberately UNCHANGED from D-01b's original 8 minutes,
 *    so no runner gains any new false-trip risk -- only runs that were
 *    previously killed purely for taking too long (while still healthy) are
 *    now spared.
 *  - It sits comfortably above `steam/depot/stallTracker.ts`'s own 180s
 *    inner stall bound, so the depot layer's own honest give-up always gets
 *    to fire first rather than being pre-empted by this outer watchdog.
 *
 * Kept runner-agnostic (`installStallWatchdog.ts` imports nothing from
 * `storeManagers/steam`) per 33-RESEARCH -- a never-settling downstream
 * await for ANY runner (not just Steam) is still bounded, and a runner that
 * never reports progress (sideload today) degrades exactly to the OLD fixed
 * ceiling.
 */

async function installQueueElement(params: InstallParams): Promise<{
  status: DMStatus
  error?: string | undefined
}> {
  const {
    appName,
    path,
    installDlcs,
    sdlList = [],
    runner,
    installLanguage,
    platformToInstall,
    build,
    branch,
    // 34.13 review A-01 (D-17): the Steam "force Windows via bottle"
    // override. This destructure and the `.install()` literal below are a
    // FIXED field list — the object built at the call site is the ONLY thing
    // any runner's `install()` ever sees, so a field omitted here is silently
    // dropped between the renderer's `window.api.install(...)` and
    // `SteamGame.install(args)`. `tsc` cannot see the drop because the field
    // is optional on `InstallArgs`. Kept runner-agnostic (forwarded for every
    // runner, exactly like `build`/`branch`) — non-Steam managers ignore it.
    steamForceWindowsViaBottle
  } = params
  // Imported lazily to break a circular dependency (downloadmanager/utils.ts
  // <-> storeManagers/index.ts) — see the load-bearing comment in
  // storeManagers/gog/user.ts.
  const { libraryManagerMap } = await import('backend/storeManagers')
  const title = resolveQueueElementTitle(libraryManagerMap, runner, appName)

  if (!isOnline()) {
    logWarning(
      `App offline, skipping install for game '${title}'.`,
      LogPrefix.Backend
    )
    return { status: 'error' }
  }

  if (runner === 'legendary') {
    const epicOffline = await isEpicServiceOffline()
    if (epicOffline) {
      showDialogBoxModalAuto({
        title: i18next.t('box.warning.title', 'Warning'),
        message: i18next.t(
          'box.warning.epic.install',
          'Epic Servers are having major outage right now, the game cannot be installed!'
        ),
        type: 'ERROR'
      })
      return { status: 'error' }
    }
  }

  if (runner === 'gog') {
    // Sometimes, a game manifest file already exists and that makes the installation
    // end as soon as it's started. We have to delete the file to prevent that issue.
    const manifestPath = pathModule.join(gogdlConfigPath, 'manifests', appName)
    if (existsSync(manifestPath)) rmSync(manifestPath)
  }

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'installing',
    folder: path
  })

  // Steam install is fire-and-forget via steam:// — the ACF poller owns all status
  // transitions. Suppress premature "Installation Started" toast for steam runners.
  if (runner !== 'steam') {
    notify({
      title,
      body: i18next.t('notify.install.startInstall', 'Installation Started')
    })
  }

  const errorMessage = (error: string) => {
    logError(
      ['Installation of', params.appName, 'failed with:', error],
      LogPrefix.DownloadManager
    )
  }

  // WR-02/D-11 (33-01): the sidecar/native install path is Steam-focused —
  // the Epic/GOG DLC fan-out that a non-Steam install() call previously
  // silently dropped is an intentionally re-scoped boundary, not a bug. Log
  // it as a guarded/declared case rather than letting it vanish silently.
  if (runner !== 'steam' && installDlcs && installDlcs.length > 0) {
    logWarning(
      `installDlcs (${installDlcs.length} DLC(s)) present for non-Steam runner '${runner}' — the Steam-focused install path does not fan these out; Epic/GOG DLC install is intentionally out of scope (WR-02/D-11).`,
      LogPrefix.DownloadManager
    )
  }

  let deferredToSetup = false
  // debug/steam-cancel-abort-thread-a: a cancelled native Steam install ALSO
  // never starts an ACF poller — runNativeDepotDownload (games.ts) returns
  // `{status: 'abort'}` on a cancelled outcome BEFORE reaching its
  // startInstallPolling call, which only runs on a successful outcome. If
  // nothing else clears the transient 'installing' badge for this case (the
  // same class of gap Phase 17's deferredToSetup exception below already
  // fixed for bottle guided-setup deferrals), the game is stuck showing
  // "downloading"/"installing" forever — the user-reported Thread A symptom.
  let wasAborted = false
  // 33-01/D-10: the settled terminal status, visible to the finally block
  // below (a plain `const { status }` destructure inside the try block would
  // be block-scoped and invisible down here). Also set from the catch block
  // and from a watchdog trip (Task 2) so all three failure modes
  // (never-settles / resolves error / throws) converge on the same
  // terminal-error surface.
  let status: DMStatus | undefined
  let installErrorReason: string | undefined
  // 37-02 (D-06/D-07): the classified affordance carried by the install
  // result actually returned — never re-classified here. Stays undefined
  // for the stall/watchdog/thrown-rejection catch-block paths below (none
  // of those go through classifyDepotError), which is correct: "no specific
  // affordance" for those cases, exactly as before this plan.
  let installErrorAction: InstallErrorAction | undefined
  try {
    downloadFixesFor(appName, runner)

    const installResult: InstallResult = await withStallTimeout(
      libraryManagerMap[runner].getGame(appName).install({
        path: path.replaceAll("'", ''),
        installDlcs,
        sdlList: sdlList.filter((el) => el !== ''),
        platformToInstall,
        installLanguage,
        build,
        branch,
        // 34.13 review A-01: see the destructure above. Omitting this line
        // makes `SteamGame.install()`'s `overrideRequested` permanently
        // false and the whole D-17 contract inert, with a green suite and a
        // clean `tsc`.
        steamForceWindowsViaBottle
      }),
      appName,
      INSTALL_NO_PROGRESS_TIMEOUT_MS,
      'installQueueElement install stall watchdog'
    )
    const { status: resultStatus, error } = installResult

    deferredToSetup = installResult.deferredToSetup ?? false
    wasAborted = resultStatus === 'abort'
    status = resultStatus
    installErrorReason = error
    installErrorAction = installResult.errorAction

    if (resultStatus === 'error') {
      errorMessage(error ?? '')
    }

    return { status: resultStatus }
  } catch (error) {
    // 260817-dib: distinguish a genuine STALL trip (no observed progress
    // for the whole window) from an inner CM timeout (a stale-but-present
    // socket) from an ordinary install rejection, so the log/dialog gives a
    // more actionable reason -- but all three converge on the exact same
    // terminal-error path below.
    if (isStallError(error)) {
      // The log line (errorMessage below) is a STABLE English diagnostic
      // naming the observed no-progress window -- the live gate greps this
      // exact text, so it is deliberately NOT i18n'd.
      const observedSeconds = Math.round(error.msSinceProgress / 1000)
      const windowMinutes = Math.round(INSTALL_NO_PROGRESS_TIMEOUT_MS / 60000)
      status = 'error'
      installErrorReason = i18next.t(
        'gamelib:box.error.install.stalled',
        'No download progress for {{minutes}} minutes — the install was stopped',
        { minutes: windowMinutes }
      )
      errorMessage(
        `install stalled — no progress observed for ${observedSeconds}s (no-progress bound ${windowMinutes}m)`
      )
      return { status: 'error' }
    }
    // D-01b: distinguish a genuine watchdog trip from an ordinary install
    // rejection so the log/dialog gives a more actionable reason, but both
    // converge on the exact same terminal-error path below.
    installErrorReason = isTimeoutError(error)
      ? 'install did not settle — connection may be stale'
      : `${error}`
    status = 'error'
    errorMessage(installErrorReason)
    return { status: 'error' }
  } finally {
    // Steam: ACF poller emits the real done — suppress it here to prevent
    // the installing→done→installing badge flash (GAME-02).
    //
    // EXCEPTION (Phase 17): a bottle guided-setup deferral installed nothing and
    // started no poller, so nothing else will clear the transient 'installing'
    // badge — clear it here so the game doesn't appear stuck "installing".
    //
    // EXCEPTION (debug/steam-cancel-abort-thread-a): a cancelled native
    // install also started no poller — see wasAborted's doc comment above.
    //
    // EXCEPTION (WR-01/D-10, 33-01): a Steam install that settles (or
    // throws) as `status === 'error'` ALSO never starts an ACF poller —
    // nothing else would ever clear the badge, which is the visible half of
    // the G-30-02 live install-hang. Per D-03, this is paired with a
    // failure dialog below so the badge-clear and the user-facing failure
    // story land together as one coherent surface.
    // quick task 260816-vgc: a terminal install failure (watchdog trip,
    // resolved {status:'error'}, or a thrown/rejected install()) must abort
    // its OWN in-flight depot download, the same way a user Cancel already
    // does via downloadqueue.ts's stopCurrentDownload(). Without this, the
    // 8-minute watchdog above rejects only the OUTER await — the inner
    // install() run (and, for Steam, its chunk-stream loop) keeps running
    // and writing to disk unbounded. Observed live 2026-08-16: a HUMANKIND
    // install declared failed at 21:36:40 kept downloading for ~5 more
    // minutes, writing 4,486 orphaned files with no appmanifest_*.acf ever
    // written — see .planning/todos/pending/2026-08-16-orphaned-depot-
    // download-outlives-failure.md.
    //
    // `.stop(false)` is required IN ADDITION to `callAbortController` for
    // Steam: only SteamGame.stop() flips the in-flight entry's `aborted`
    // flag on `nativeInstallsInFlight` (games.ts). Without that flag, an
    // immediate retry would JOIN the still-tearing-down run instead of
    // starting a fresh one (games.ts installDepotDownload, ~L1388-1400).
    //
    // `.stop()` is gated to `runner === 'steam'` only — legendary's stop()
    // calls killPattern('legendary'), which kills EVERY legendary process on
    // Windows, not just this install's. That blast radius is acceptable for
    // a deliberate user Cancel but not as an automatic reaction to any
    // install error. `callAbortController` alone is the correct, targeted
    // kill for non-steam (gogdl/legendary) child processes and stays
    // runner-agnostic.
    if (status === 'error') {
      // 37-05 (REQ-37-04): MEASURED mechanism (37-05-SUMMARY.md) — for a
      // native Steam depot install, games.ts's runNativeDepotDownload
      // registers this appId's controller as its own first statement and
      // deletes it in its OWN `finally`, which always finishes before the
      // InstallResult reaches this function's `finally` below. By the time
      // this branch runs on that path, there is nothing left to abort by
      // construction — not a teardown race. hasAbortController asks before
      // telling, so only a GENUINE miss anywhere else still reaches
      // callAbortController's own ERROR log (see aborthandler.ts's doc
      // comment on hasAbortController for the other-callers rationale).
      if (hasAbortController(appName)) {
        logInfo(
          `Aborting in-flight download for ${appName} after terminal install failure`,
          LogPrefix.DownloadManager
        )
        callAbortController(appName)
      } else {
        logWarning(
          `No in-flight download to abort for ${appName} — the install failed outside its abort controller's lifetime`,
          LogPrefix.DownloadManager
        )
      }
      if (runner === 'steam') {
        libraryManagerMap[runner]
          .getGame(appName)
          .stop(false)
          .catch((error: unknown) => {
            logWarning(
              `SteamGame.stop() failed while aborting in-flight download for ${appName}: ${error}`,
              LogPrefix.DownloadManager
            )
          })
      }
    }

    if (
      runner !== 'steam' ||
      deferredToSetup ||
      wasAborted ||
      status === 'error'
    ) {
      sendGameStatusUpdate({
        appName,
        runner,
        status: 'done'
      })
    }
    if (runner === 'steam' && status === 'error') {
      // 37-02 (D-06/D-07): a 'signIn' affordance gets a single "Sign in to
      // Steam" button; every other value (including undefined) passes no
      // `buttons` at all — byte-identical to the dialog before this plan.
      // The renderer (DialogHandler) maps `action: 'steamSignIn'` to an
      // actual navigate('/login') call; onClick does not survive the
      // structured-clone IPC hop this dialog crosses, so it is never relied
      // on here.
      const buttons: ButtonOptions[] | undefined =
        installErrorAction === 'signIn'
          ? [
              {
                text: i18next.t(
                  'gamelib:box.error.install.signInToSteam',
                  'Sign in to Steam'
                ),
                action: 'steamSignIn'
              }
            ]
          : undefined
      showDialogBoxModalAuto({
        title: i18next.t('box.error.title', 'Error'),
        message: i18next.t(
          'gamelib:box.error.install.failed',
          'The installation of {{title}} failed: {{error}}',
          { title, error: installErrorReason || 'Unknown error' }
        ),
        type: 'ERROR',
        ...(buttons ? { buttons } : {})
      })
    }
  }
}

async function updateQueueElement(params: InstallParams): Promise<{
  status: DMStatus
  error?: string | undefined
}> {
  const { appName, runner } = params
  // Lazy import — see the load-bearing comment in installQueueElement above.
  const { libraryManagerMap } = await import('backend/storeManagers')
  const title = resolveQueueElementTitle(libraryManagerMap, runner, appName)

  if (!isOnline()) {
    logWarning(
      `App offline, skipping update for game '${title}'.`,
      LogPrefix.Backend
    )
    return { status: 'error' }
  }

  if (runner === 'legendary') {
    const epicOffline = await isEpicServiceOffline()
    if (epicOffline) {
      showDialogBoxModalAuto({
        title: i18next.t('box.warning.title', 'Warning'),
        message: i18next.t(
          'box.warning.epic.update',
          'Epic Servers are having major outage right now, the game cannot be updated!'
        ),
        type: 'ERROR'
      })
      return { status: 'error' }
    }
  }

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'updating'
  })

  notify({
    title,
    body: i18next.t('notify.update.started', 'Update Started')
  })

  const errorMessage = (error: string) => {
    logError(
      ['Update of', params.appName, 'failed with:', error],
      LogPrefix.DownloadManager
    )
  }

  try {
    const { status } = await libraryManagerMap[runner].getGame(appName).update({
      build: params.build,
      branch: params.branch,
      language: params.installLanguage,
      dlcs: params.installDlcs,
      dependencies: params.dependencies
    })

    if (status === 'error') {
      errorMessage('')
    }

    return { status }
  } catch (error) {
    errorMessage(`${error}`)
    return { status: 'error' }
  } finally {
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'done'
    })
  }
}

async function downloadFixesFor(appName: string, runner: Runner) {
  const url = `https://raw.githubusercontent.com/Heroic-Games-Launcher/known-fixes/main/${storeMap[runner]}/${appName}-${storeMap[runner]}.json`
  const dest = pathModule.join(fixesPath, `${appName}-${storeMap[runner]}.json`)
  if (!existsSync(fixesPath)) {
    mkdirSync(fixesPath, { recursive: true })
  }
  downloadFile({ url, dest, ignoreFailure: true })
}

export { installQueueElement, updateQueueElement }
