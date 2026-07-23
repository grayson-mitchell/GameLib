import { logError, LogPrefix, logWarning } from 'backend/logger'
import {
  downloadFile,
  isEpicServiceOffline,
  sendGameStatusUpdate
} from '../utils'
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
    branch
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

    const installResult: InstallResult = await libraryManagerMap[runner]
      .getGame(appName)
      .install({
        path: path.replaceAll("'", ''),
        installDlcs,
        sdlList: sdlList.filter((el) => el !== ''),
        platformToInstall,
        installLanguage,
        build,
        branch
      })
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
    installErrorReason = `${error}`
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
