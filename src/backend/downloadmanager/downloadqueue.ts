import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { getFileSize, removeFolder, sendGameStatusUpdate } from '../utils'
import { DMQueueElement, DMStatus, DownloadManagerState } from 'common/types'
import { installQueueElement, updateQueueElement } from './utils'
import { sendFrontendMessage } from '../ipc'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { notify } from '../dialog/dialog'
import i18next from 'i18next'
import { createRedistDMQueueElement } from 'backend/storeManagers/gog/redist'
import { getSteamInstallSize } from 'backend/storeManagers/steam/games'
import { existsSync } from 'fs'
import { gogRedistPath } from 'backend/storeManagers/gog/constants'
import { onConnectivityChange } from 'backend/online_monitor'
// Static top-level import (not a lazy `require()`/`await import()`) of the
// alias 'backend/storeManagers'. `libraryManagerMap` is only ever
// dereferenced INSIDE function bodies below (cancelCurrentDownload/
// stopCurrentDownload/processNotification/addToQueue), never at this
// module's top level, so Rollup's live-binding handling of the
// downloadqueue.ts <-> storeManagers/index.ts cycle is safe: by the time any
// of these functions actually runs, both modules have finished evaluating.
// This also fixes debug/download-queue-require-crash — electron-vite's
// production build resolves the alias for static `import`/`import()` but
// leaves a literal, unresolvable `require("backend/storeManagers")` in the
// emitted chunk, which crashed every sync call (cancel/stop/completion).
// Other call sites already prove this pattern is safe for synchronous access
// (e.g. utils/uninstaller.ts's `libraryManagerMap[runner].getGame(appName)`).
import { libraryManagerMap } from 'backend/storeManagers'
import { downloadManager } from './electronStores'

/*
#### Private ####
*/

let queueState: DownloadManagerState = 'idle'
// D-UAT-05: seeded from the persisted queue head at module load (instead of
// staying null until initQueue()'s while loop first assigns it) so
// pause/stop/cancel are never no-ops for a queue head that survived an app
// restart — main.ts only calls initQueue() 5s after startup, and until this
// var was populated, cancelCurrentDownload/pauseCurrentDownload/
// stopCurrentDownload's `if (currentElement)` guards silently did nothing
// (not even removing the item from the persisted queue) for that whole
// window, so a fast click during it appeared completely non-functional and
// the item stayed queued to auto-resume+re-wedge on the very next restart.
let currentElement: DMQueueElement | null = getFirstQueueElement()
let autoPaused = false

onConnectivityChange((status) => {
  if (status === 'offline' && isRunning()) {
    logInfo('System offline, auto-pausing downloads', LogPrefix.DownloadManager)
    pauseCurrentDownload()
    autoPaused = true
  } else if (status === 'online' && autoPaused) {
    logInfo('System online, auto-resuming downloads', LogPrefix.DownloadManager)
    autoPaused = false
    void resumeCurrentDownload()
  }
})

function getFirstQueueElement() {
  const elements = downloadManager.get('queue', [])
  return elements.at(0) ?? null
}

function isPaused(): boolean {
  return queueState === 'paused'
}

function isIdle(): boolean {
  return queueState === 'idle' || !currentElement
}

function isRunning(): boolean {
  return queueState === 'running'
}

function addToFinished(element: DMQueueElement, status: DMStatus) {
  const elements = downloadManager.get('finished', [])

  const elementIndex = elements.findIndex(
    (el) => el.params.appName === element.params.appName
  )

  if (elementIndex >= 0) {
    elements[elementIndex] = { ...element, status: status ?? 'abort' }
  } else {
    elements.push({ ...element, status })
  }

  downloadManager.set('finished', elements)
  logInfo(
    [element.params.appName, 'added to download manager finished.'],
    LogPrefix.DownloadManager
  )
}

/*
#### Public ####
*/

/**
 * @param isStartup debug/steam-install-slow-start (Thread B): true ONLY for
 *   the single call main.ts makes 5s after app launch. A persisted Steam
 *   queue head must never be auto-started by that unattended call — Steam
 *   native (and off-path) installs are surfaced as resumable instead,
 *   mirroring the Steam startup gate's own "surfacing as resumable, NOT
 *   auto-resuming" contract (library.ts's scanDownloadingAppIds loop), which
 *   covers installs Steam itself drives but has no effect on GameLib's own
 *   DownloadManager queue restart-auto-start. GOG/Epic/Amazon keep their
 *   existing, intended auto-resume-on-launch behavior — this flag only ever
 *   changes behavior for `runner === 'steam'`. Every OTHER caller (the
 *   Resume button's resumeCurrentDownload, a fresh addToQueue while idle,
 *   the online-reconnect auto-resume) leaves this at its default `false`,
 *   so an explicit user/app action always processes a deferred Steam item
 *   normally.
 */
async function initQueue(isStartup = false) {
  let element = getFirstQueueElement()

  while (element) {
    if (isStartup && element.params.runner === 'steam') {
      // Defer without mutating the persisted queue entry. Re-point
      // currentElement at it (it may currently reference an earlier,
      // already-completed item processed by THIS same startup call) so
      // pause/cancel/resume controls target the right element; queueState
      // is normalized to 'idle' below, which the frontend already renders
      // identically to 'paused' (isPaused = ['idle','paused'].includes) —
      // i.e. a "Resume download" affordance, not an active download.
      currentElement = element
      logInfo(
        [
          element.params.appName,
          'is a persisted Steam queue head — surfacing as resumable, NOT auto-resuming on launch (debug/steam-install-slow-start Thread B)'
        ],
        LogPrefix.DownloadManager
      )
      sendFrontendMessage(
        'changedDMQueueInformation',
        downloadManager.get('queue', []),
        queueState
      )
      break
    }

    const queuedElements = downloadManager.get('queue', [])
    element.startTime = Date.now()
    queuedElements[0] = element
    downloadManager.set('queue', queuedElements)

    currentElement = element

    queueState = 'running'
    sendFrontendMessage('changedDMQueueInformation', queuedElements, queueState)

    const { status } =
      element.type === 'install'
        ? await installQueueElement(element.params)
        : await updateQueueElement(element.params)
    element.endTime = Date.now()

    processNotification(element, status)

    if (!isPaused()) {
      addToFinished(element, status)
      removeFromQueue(element.params.appName)
      element = getFirstQueueElement()
    } else {
      element = null
    }
  }

  if (queueState !== 'paused') {
    queueState = 'idle'
  }
}

async function addToQueue(element: DMQueueElement) {
  if (!element) {
    logError(
      'Can not add undefined element to queue!',
      LogPrefix.DownloadManager
    )
    return
  }

  sendGameStatusUpdate({
    appName: element.params.appName,
    runner: element.params.runner,
    folder: element.params.path,
    status: 'queued'
  })

  const elements = downloadManager.get('queue', [])

  const elementIndex = elements.findIndex(
    (el) =>
      el.params.appName === element.params.appName &&
      el.params.runner === element.params.runner
  )

  if (elementIndex >= 0) {
    elements[elementIndex] = element
  } else {
    const gameInfo = libraryManagerMap[element.params.runner].getGameInfo(
      element.params.appName
    )
    if (!gameInfo?.isEAManaged && !gameInfo?.isUbisoftManaged) {
      // Steam-specific size path (D-04): fetch via store appdetails API at enqueue
      // time so the DM queue shows a real GB/MB figure instead of '?? MB'.
      // GOG/Epic/Amazon continue to use getInstallInfo unchanged.
      if (element.params.runner === 'steam') {
        element.params.size = await getSteamInstallSize(
          element.params.appName,
          element.params.gameInfo
        )
      } else {
        const installInfo = await libraryManagerMap[
          element.params.runner
        ].getInstallInfo(
          element.params.appName,
          element.params.platformToInstall,
          {
            branch: element.params.branch,
            build: element.params.build
          }
        )

        element.params.size = installInfo?.manifest?.download_size
          ? getFileSize(installInfo?.manifest?.download_size)
          : '?? MB'

        if (
          element.params.runner === 'gog' &&
          element.params.platformToInstall.toLowerCase() === 'windows' &&
          installInfo &&
          installInfo.manifest &&
          'dependencies' in installInfo.manifest
        ) {
          const newDependencies = installInfo.manifest.dependencies || []
          if (newDependencies?.length || !existsSync(gogRedistPath)) {
            // create redist element
            const redistElement = createRedistDMQueueElement()
            redistElement.params.dependencies = newDependencies
            elements.push(redistElement)
          }
        }
      }
    } else {
      element.params.size = '?? MB'
    }
    elements.push(element)
  }

  downloadManager.set('queue', elements)
  logInfo(
    [element.params.gameInfo.title, ' was added to the download queue.'],
    LogPrefix.DownloadManager
  )

  sendFrontendMessage('changedDMQueueInformation', elements, queueState)

  if (isIdle()) {
    void initQueue()
  }
}

/**
 * @param forceStatusUpdate debug/steam-cancel-abort-thread-a: when true,
 *   sends the 'done' status update UNCONDITIONALLY, even for a Steam
 *   `runner` — bypassing the "ACF poller emits the real done" suppression
 *   below. Only ever passed `true` by cancelCurrentDownload (below), which
 *   is BY DEFINITION always a deliberate user cancel: a native Steam install
 *   that gets cancelled never starts an ACF poller at all (games.ts's
 *   runNativeDepotDownload returns `{status: 'abort'}` before reaching its
 *   startInstallPolling call), so nothing else would ever clear this game's
 *   "installing"/"downloading" badge — the user-reported Thread A symptom.
 *   This clears it IMMEDIATELY, synchronously with the cancel click, instead
 *   of waiting for the in-flight install() promise to actually unwind
 *   (bounded now by the fetchChunk signal-threading fix, but still not
 *   instant). Defaults to false, preserving the exact previous behavior for
 *   every other call site (natural completion via initQueue, where the
 *   poller genuinely will fire for a successful Steam install).
 */
function removeFromQueue(appName: string, forceStatusUpdate = false) {
  if (appName && downloadManager.has('queue')) {
    const elements = downloadManager.get('queue', [])
    const index = elements.findIndex(
      (queueElement) => queueElement?.params.appName === appName
    )
    // Capture runner BEFORE splice so the steam guard below can reference it.
    // splice/delete/set and changedDMQueueInformation MUST remain unconditional
    // so the queue always clears (cancel path included) — GAME-02.
    const removedRunner =
      index !== -1 ? elements[index]?.params.runner : undefined
    if (index !== -1) {
      elements.splice(index, 1)
      downloadManager.delete('queue')
      downloadManager.set('queue', elements)
    }

    // Steam: ACF poller emits the real done — suppress it here to prevent badge flash.
    if (removedRunner !== 'steam' || forceStatusUpdate) {
      sendGameStatusUpdate({
        appName,
        status: 'done'
      })
    }

    logInfo(
      [appName, 'removed from download manager.'],
      LogPrefix.DownloadManager
    )

    sendFrontendMessage('changedDMQueueInformation', elements, queueState)
  }
}

function getQueueInformation() {
  const elements = downloadManager.get('queue', [])
  const finished = downloadManager.get('finished', [])

  return { elements, finished, state: queueState }
}

function cancelCurrentDownload({ removeDownloaded = false }) {
  if (currentElement) {
    if (Array.isArray(currentElement.params.installDlcs)) {
      const dlcsToRemove = currentElement.params.installDlcs
      for (const dlc of dlcsToRemove) {
        removeFromQueue(dlc, true)
      }
    }
    if (isRunning()) {
      stopCurrentDownload()
    }
    // debug/steam-cancel-abort-thread-a: forceStatusUpdate=true — this call
    // is BY DEFINITION a deliberate user cancel (see removeFromQueue's doc
    // comment), so the "installing"/"downloading" badge must clear now,
    // not depend on an ACF poller that a cancelled native install never
    // starts.
    removeFromQueue(currentElement.params.appName, true)

    if (removeDownloaded) {
      const { appName, runner } = currentElement.params
      const { folder_name } = libraryManagerMap[runner]
        .getGame(appName)
        .getGameInfo()
      if (folder_name) {
        removeFolder(currentElement.params.path, folder_name)
      }
    }
    currentElement = null
  }
}

function pauseCurrentDownload() {
  if (currentElement) {
    stopCurrentDownload()
  }
  queueState = 'paused'
  autoPaused = false
  sendFrontendMessage(
    'changedDMQueueInformation',
    downloadManager.get('queue', []),
    queueState
  )
}

function resumeCurrentDownload() {
  autoPaused = false
  void initQueue()
}

function stopCurrentDownload() {
  const { appName, runner } = currentElement!.params
  callAbortController(appName)
  libraryManagerMap[runner].getGame(appName).stop(false)
}

// notify the user based on the status of the element and the status of the queue
function processNotification(element: DMQueueElement, status: DMStatus) {
  const action = element.type === 'install' ? 'Installation' : 'Update'
  if (
    element.params.runner === 'gog' &&
    element.params.appName === 'gog-redist'
  ) {
    return
  }
  const { title } = libraryManagerMap[element.params.runner]
    .getGame(element.params.appName)
    .getGameInfo()

  if (status === 'abort') {
    if (isPaused()) {
      logWarning(
        [action, 'of', element.params.appName, 'paused!'],
        LogPrefix.DownloadManager
      )
      // i18next.t('notify.update.paused', 'Update Paused')
      // i18next.t('notify.install.paused', 'Installation Paused')
      notify({ title, body: i18next.t(`notify.${element.type}.paused`) })
    } else {
      logWarning(
        [action, 'of', element.params.appName, 'aborted!'],
        LogPrefix.DownloadManager
      )
      // i18next.t('notify.update.canceled', 'Update Canceled')
      // i18next.t('notify.install.canceled', 'Installation Canceled')
      notify({ title, body: i18next.t(`notify.${element.type}.canceled`) })
    }
  } else if (status === 'error') {
    logWarning(
      [action, 'of', element.params.appName, 'failed!'],
      LogPrefix.DownloadManager
    )
    // i18next.t('notify.update.failed', 'Update Failed')
    // i18next.t('notify.install.failed', 'Installation Failed')
    notify({ title, body: i18next.t(`notify.${element.type}.failed`) })
  } else if (status === 'done') {
    // Steam: ACF poller owns the confirmed-completion toast — suppress the DM one
    // (mirrors the gog-redist early-return guard above). Epic/GOG/Amazon unchanged.
    if (element.params.runner !== 'steam') {
      // i18next.t('notify.update.finished', 'Update Finished')
      // i18next.t('notify.install.finished', 'Installation Finished')
      notify({
        title,
        body: i18next.t(`notify.${element.type}.finished`)
      })
    }

    logInfo(
      ['Finished', action, 'of', element.params.appName],
      LogPrefix.DownloadManager
    )
  }
}

export {
  initQueue,
  addToQueue,
  removeFromQueue,
  getQueueInformation,
  cancelCurrentDownload,
  pauseCurrentDownload,
  resumeCurrentDownload,
  isRunning
}
