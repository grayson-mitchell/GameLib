import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import {
  downloadFile,
  isEpicServiceOffline,
  sendGameStatusUpdate
} from '../utils'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { DMStatus, InstallParams, Runner } from 'common/types'
import { InstallResult } from 'common/types/game_manager'
import i18next from 'i18next'
import { notify, showDialogBoxModalAuto } from '../dialog/dialog'
import { isOnline } from '../online_monitor'
import pathModule from 'path'
import { existsSync, mkdirSync, rmSync } from 'graceful-fs'
import { storeMap } from 'common/utils'
import { gogdlConfigPath } from 'backend/storeManagers/gog/constants'
import { fixesPath } from 'backend/constants/paths'
import {
  withTimeout,
  isTimeoutError
} from 'backend/storeManagers/steam/withTimeout'

/**
 * D-01b (33-01): belt-and-suspenders bound around the WHOLE `.install()`
 * await in `installQueueElement`, defense-in-depth for any never-settling
 * downstream await that the pre-download PICS bounds (Phase 30 30-07) don't
 * reach. Must sit comfortably ABOVE the summed pre-download bounds — 50s
 * `resolveSteamInstallTarget` (STEAM_PICS_TIMEOUT_MS*2) + up to 90s×3
 * `buildDepotPlan` retries (STEAM_PICS_BULK_TIMEOUT_MS *
 * PLAN_BUILD_MAX_ATTEMPTS) = ~320s worst case — and must NEVER fire during
 * the real (unbounded-by-design) depot download phase. Kept runner-agnostic
 * per 33-RESEARCH (lower-risk: Electron's fresh CM connection has never
 * hung this way), at 8 minutes — comfortably above the ~5.3min worst-case
 * pre-download sum while still bounding a genuinely stuck install.
 */
const INSTALL_WATCHDOG_MS = 8 * 60 * 1000

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
  const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()

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
  try {
    downloadFixesFor(appName, runner)

    const installResult: InstallResult = await withTimeout(
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
      INSTALL_WATCHDOG_MS,
      'installQueueElement install watchdog'
    )
    const { status: resultStatus, error } = installResult

    deferredToSetup = installResult.deferredToSetup ?? false
    wasAborted = resultStatus === 'abort'
    status = resultStatus
    installErrorReason = error

    if (resultStatus === 'error') {
      errorMessage(error ?? '')
    }

    return { status: resultStatus }
  } catch (error) {
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
      logInfo(
        `Aborting in-flight download for ${appName} after terminal install failure`,
        LogPrefix.DownloadManager
      )
      callAbortController(appName)
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
      showDialogBoxModalAuto({
        title: i18next.t('box.error.title', 'Error'),
        message: i18next.t(
          'box.error.install.failed',
          'The installation of {{title}} failed: {{error}}',
          { title, error: installErrorReason || 'Unknown error' }
        ),
        type: 'ERROR'
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
  const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()

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
